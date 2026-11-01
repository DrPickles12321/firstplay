import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { GameCatalog } from '../ml/catalog.mjs';
import { createProvider } from '../ml/providers.mjs';
import { normalizePolicy, enforcePolicy } from '../ml/policy.mjs';

const { values } = parseArgs({ options: {
  game: { type: 'string', default: 'mario' },
  text: { type: 'string' }, input: { type: 'string' }, known: { type: 'string', multiple: true },
  mode: { type: 'string', default: 'discovery' }, gentle: { type: 'boolean', default: false },
  provider: { type: 'string', default: process.env.FIRSTPLAY_PROVIDER || 'codex' },
  objective: { type: 'string', default: '' }, output: { type: 'string' },
} });

try {
  const catalog = await GameCatalog.load(values.game);
  let items;
  if (values.input) {
    const file = await readFile(values.input, 'utf8');
    if (file.length > 100_000) throw new Error('Input file is too large.');
    const raw = JSON.parse(file); items = Array.isArray(raw) ? raw : raw.messages;
  } else {
    if (!values.text?.trim()) throw new Error('Use --text "message" or --input path/to/messages.json.');
    items = [{ id: 'message-1', text: values.text, knowledge: { factIds: (values.known || []).flatMap(value => value.split(',')).filter(Boolean), relationIds: [] }, policy: { mode: values.mode, allowGentleHints: values.gentle }, objective: values.objective }];
  }
  if (!Array.isArray(items) || !items.length || items.length > 8) throw new Error('Classify between one and eight messages per command.');
  for (const item of items) {
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 2000) throw new Error('Invalid message.');
    item.policy = normalizePolicy(item.policy);
    item.knowledge ||= { factIds: [], relationIds: [] };
    item.knowledge.factIds ||= []; item.knowledge.relationIds ||= [];
    for (const id of [...item.knowledge.factIds, ...item.knowledge.relationIds]) if (!catalog.has(id)) throw new Error(`Unknown knowledge ID: ${id}`);
  }
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Message IDs must be unique.');
  const result = await createProvider(values.provider).classify(catalog, items);
  const report = { kind: 'real_model_classification', gameId: catalog.gameId, packVersion: catalog.pack.version, metrics: result.metrics,
    results: items.map(item => ({ id: item.id, ...enforcePolicy(result.results.get(item.id), item, catalog), interpretation: result.results.get(item.id) })) };
  if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code || 'invalid_request', message: error.message, safety: 'No message was delivered.' }));
  process.exitCode = 1;
}
