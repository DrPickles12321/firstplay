import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { values } = parseArgs({ options: { 'with-model': { type: 'boolean', default: false }, 'with-twitch': { type: 'boolean', default: false } } });
const stages = [];
async function run(name, file, args = [], env = false) {
  process.stderr.write(name + '…\n');
  const result = await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [...(env ? ['--env-file-if-exists=.env'] : []), file, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: false }); let output = '', errors = '';
    child.stdout.on('data', data => { output = (output + data).slice(-100_000); }); child.stderr.on('data', data => { errors = (errors + data).slice(-4000); }); child.on('error', reject); child.on('close', code => accept({ code, output, errors }));
  });
  stages.push({ name, passed: result.code === 0 });
  if (result.code !== 0) throw new Error(name + ' failed. Run ' + file + ' directly for its diagnostics.');
}
let failure;
try {
  await run('Deterministic checks', 'firstplay/cli/check.mjs');
  if (process.platform === 'darwin') await run('Native recognition and HTTP', 'firstplay/cli/recognition-check.mjs', values['with-model'] ? ['--with-text'] : [], true);
  else stages.push({ name: 'Native recognition', skipped: true, reason: 'macOS-only detector; run this stage on the declared macOS target.' });
  if (values['with-model']) await run('Real text-model before/after/undo', 'firstplay/cli/demo-check.mjs', [], true);
  if (values['with-twitch']) { process.stderr.write('Posting the two authorized fixed test messages to the connected Twitch channel.\n'); await run('Real Twitch/model/reader transit', 'firstplay/cli/live-check.mjs', [], true); }
  await run('Credential-filtered source package', 'firstplay/cli/package.mjs');
} catch (error) { failure = error.message; process.exitCode = 1; }
const check = await readFile(resolve(root, 'artifacts/firstplay-check-latest.json'), 'utf8').then(JSON.parse).catch(() => null);
const report = { kind: 'release_preflight', timestamp: new Date().toISOString(), passed: !failure, platform: process.platform, node: process.versions.node, stages, ...(failure ? { error: failure } : {}), deterministicTests: check?.tests || null,
  scope: 'Tests and original fixtures verify implementation, not production language/gameplay accuracy. Real-model checks use the configured account. Twitch posts require --with-twitch. No publication or submission performed.' };
await mkdir(resolve(root, 'artifacts'), { recursive: true }); await writeFile(resolve(root, 'artifacts/firstplay-release-check.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
