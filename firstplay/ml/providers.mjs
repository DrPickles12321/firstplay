import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { CLASSIFICATION_SCHEMA, ClassificationError, validateClassifications, INFERENCE_PROTOCOL } from './contracts.mjs';
import { CLASSIFIER_INSTRUCTIONS, buildClassificationInput } from './prompt.mjs';

export const CODEX_DISABLED_FEATURES = ['shell_tool', 'apps', 'plugins', 'code_mode_host', 'multi_agent', 'view_image', 'browser_use', 'computer_use', 'goals', 'workspace_dependencies', 'tool_suggest'];
const TOOL_ITEMS = new Set(['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call', 'collab_agent_tool_call']);

function anonymousBatch(catalog, items, gameContext) {
  const ids = items.map(() => randomUUID());
  const masked = items.map((item, index) => ({ ...item, id: ids[index], reply: item.reply ? { disposition: item.reply.disposition, text: item.reply.text || '' } : null }));
  const input = buildClassificationInput(catalog, masked, { gameContext });
  return { input, restore(value) {
    const validated = validateClassifications(value, ids, new Set(input.game_context.references.map(reference => reference.id)));
    return new Map(items.map((item, index) => [item.id, { ...validated.get(ids[index]), message_id: item.id }]));
  } };
}

function childEnvironment() {
  // Authentication remains owned by the CLI. Never extract its tokens or inherit app secrets.
  const keys = ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'SHELL', 'LANG', 'LC_ALL', 'CODEX_HOME', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'SYSTEMROOT', 'APPDATA', 'LOCALAPPDATA', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'];
  return Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]]));
}

export function codexArguments({ directory, schemaPath, outputPath, instructionsPath, model }) {
  const args = ['--no-daemon', '-a', 'never', 'exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '--json', '--cd', directory,
    '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0', '-c', 'mcp_servers={}',
    '-c', 'model_reasoning_effort="low"', '-c', `model_instructions_file=${JSON.stringify(instructionsPath)}`, '-c', `log_dir=${JSON.stringify(join(directory, 'logs'))}`];
  for (const feature of CODEX_DISABLED_FEATURES) args.push('--disable', feature);
  if (model) args.push('--model', model);
  args.push('--output-schema', schemaPath, '--output-last-message', outputPath, '-');
  return args;
}

export class CodexProvider {
  constructor({ binary = process.env.CODEX_BIN || 'codex', model = process.env.CODEX_MODEL || '', timeoutMs = 45_000, spawnImpl = spawn } = {}) {
    Object.assign(this, { binary, model, timeoutMs, spawnImpl });
    this.name = 'codex-cli';
  }

  async classify(catalog, items, { signal, gameContext } = {}) {
    const { input, restore } = anonymousBatch(catalog, items, gameContext);
    const result = await this.run({ instructions: CLASSIFIER_INSTRUCTIONS, schema: CLASSIFICATION_SCHEMA, input, signal });
    return { results: restore(result.value), metrics: { ...result.metrics, contextVersion: catalog.version, inputProtocol: INFERENCE_PROTOCOL, promptHash: createHash('sha256').update(CLASSIFIER_INSTRUCTIONS).digest('hex') } };
  }

  async run({ instructions, schema, input, signal, imagePaths = [] }) {
    const directory = await mkdtemp(join(tmpdir(), 'firstplay-model-'));
    const schemaPath = join(directory, 'schema.json');
    const outputPath = join(directory, 'result.json');
    const instructionsPath = join(directory, 'instructions.md');
    const started = performance.now();
    try {
      await Promise.all([
        writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600 }),
        writeFile(instructionsPath, instructions, { mode: 0o600 }),
      ]);
      const args = codexArguments({ directory, schemaPath, outputPath, instructionsPath, model: this.model });
      for (const path of imagePaths) args.splice(args.length - 1, 0, '--image', path);
      const output = await new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new ClassificationError('aborted'));
        const child = this.spawnImpl(this.binary, args, { cwd: directory, env: childEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' });
        let stdout = '', stderr = '', settled = false;
        const stop = () => {
          try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
        };
        const finish = (error, value) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          error ? reject(error) : resolve(value);
        };
        const abort = () => { stop(); finish(new ClassificationError('aborted')); };
        const timer = setTimeout(() => { stop(); finish(new ClassificationError('provider_timeout', 'Codex classification exceeded its deadline.')); }, this.timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        child.on('error', error => finish(new ClassificationError(error.code === 'ENOENT' ? 'codex_not_found' : 'provider_start_failed', 'Codex could not be started.')));
        child.stdin.on('error', () => {});
        child.stdout.on('data', chunk => {
          stdout += chunk;
          if (stdout.length > 2_000_000) { stop(); finish(new ClassificationError('oversized_response')); }
        });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_000); });
        child.on('close', code => {
          if (code !== 0) {
            const errorCode = /rate.limit|usage.limit|quota/i.test(stderr) ? 'usage_limit' : /log.?in|unauthorized|authentication/i.test(stderr) ? 'login_required' : 'provider_failed';
            return finish(new ClassificationError(errorCode, `Codex did not complete classification (exit ${code ?? 'unknown'}).`));
          }
          try {
            const events = stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
            if (events.some(event => TOOL_ITEMS.has(event.item?.type))) return finish(new ClassificationError('unexpected_tool_activity', 'A classifier attempted agent tool activity; its output was discarded.'));
            const completed = events.findLast(event => event.type === 'turn.completed');
            finish(null, { usage: completed?.usage || null });
          } catch { finish(new ClassificationError('invalid_cli_output')); }
        });
        child.stdin.end(JSON.stringify(input));
      });
      let value;
      try { value = JSON.parse(await readFile(outputPath, 'utf8')); }
      catch { throw new ClassificationError('invalid_output', 'Codex did not produce valid structured output.'); }
      return { value, metrics: { provider: this.name, model: this.model || 'cli-default', latencyMs: Math.round(performance.now() - started), usage: output.usage } };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export class OpenAIProvider {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL, timeoutMs = 10_000, fetchImpl = fetch } = {}) {
    Object.assign(this, { apiKey, model, timeoutMs, fetchImpl }); this.name = 'openai-api';
  }

  async classify(catalog, items, { signal, gameContext } = {}) {
    const { input, restore } = anonymousBatch(catalog, items, gameContext);
    const { value, metrics } = await this.run({ instructions: CLASSIFIER_INSTRUCTIONS, schema: CLASSIFICATION_SCHEMA, input, signal });
    return { results: restore(value), metrics: { ...metrics, contextVersion: catalog.version, inputProtocol: INFERENCE_PROTOCOL, promptHash: createHash('sha256').update(CLASSIFIER_INSTRUCTIONS).digest('hex') } };
  }

  async run({ instructions, schema, input, signal, images = [] }) {
    if (!this.apiKey || !this.model) throw new ClassificationError('provider_not_configured', 'An API key and model are required for the API provider.');
    const started = performance.now();
    const signals = [AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])];
    let response;
    try {
      response = await this.fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.any(signals),
        body: JSON.stringify({ model: this.model, store: false, instructions,
          input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(input) }, ...images.map(image => ({ type: 'input_image', image_url: image, detail: 'auto' }))] }],
          text: { format: { type: 'json_schema', name: 'firstplay_result', strict: true, schema } },
        }),
      });
    } catch { throw new ClassificationError(signal?.aborted ? 'aborted' : 'provider_timeout', 'The model request failed or timed out.'); }
    if (!response.ok) throw new ClassificationError(response.status === 429 ? 'usage_limit' : 'provider_failed', `Model request failed (${response.status}).`);
    const body = await response.json();
    if (body.status !== 'completed') throw new ClassificationError('incomplete_response');
    const content = body.output?.flatMap(item => item.type === 'message' ? item.content || [] : []) || [];
    if (content.some(item => item.type === 'refusal')) throw new ClassificationError('model_refusal');
    const text = content.filter(item => item.type === 'output_text').map(item => item.text).join('');
    let value; try { value = JSON.parse(text); } catch { throw new ClassificationError('invalid_output'); }
    return { value, metrics: { provider: this.name, model: this.model, latencyMs: Math.round(performance.now() - started), usage: body.usage || null } };
  }
}

export function createProvider(name = process.env.FIRSTPLAY_PROVIDER || 'codex') {
  if (name === 'codex') return new CodexProvider();
  if (name === 'openai') return new OpenAIProvider();
  throw new Error('FIRSTPLAY_PROVIDER must be codex or openai.');
}
