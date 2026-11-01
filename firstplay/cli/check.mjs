import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GameCatalog } from '../ml/catalog.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), files = [];
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name); if (item.isDirectory()) await walk(path); else if (item.isFile() && /\.(mjs|js)$/.test(path)) files.push(path);
  }
}
await walk(resolve(root, 'firstplay')); files.push(resolve(root, 'lib/twitch.mjs'));
const failures = [];
for (const file of files) { const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (result.status !== 0) failures.push({ file: file.slice(root.length), error: result.stderr || result.error?.message }); }
const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files.filter(file => file.endsWith('.test.mjs'))], { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 });
const summary = key => Number(tests.stdout?.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] || 0);
const catalogs = [];
for (const game of ['mario', 'subnautica']) {
  const catalog = await GameCatalog.load(game); const definition = catalog.definition;
  const rows = (await readFile(resolve(root, 'research/firstplay', definition.dataset), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id) || [...row.known_fact_ids, ...(row.known_relation_ids || [])].some(id => !catalog.has(id)) || row.pack_version && row.pack_version !== catalog.pack.version) throw new Error(`Invalid case/catalog binding: ${game}`);
    ids.add(row.id);
  }
  catalogs.push({ game, packVersion: catalog.pack.version, references: catalog.references.size, events: catalog.events.size, draftCases: rows.length, visionEnabled: catalog.summary().visionEnabled, localObservationEnabled: catalog.summary().localObservationEnabled, observationMode: catalog.summary().observationMode });
}
const report = { kind: 'deterministic_project_check', timestamp: new Date().toISOString(), passed: !failures.length && tests.status === 0 && summary('tests') > 0, syntaxFiles: files.length, syntaxFailures: failures, tests: { total: summary('tests'), passed: summary('pass'), failed: summary('fail'), skipped: summary('skipped') }, catalogs, externalCalls: 'None; model/provider and Twitch operations are controlled test doubles.' };
await mkdir(resolve(root, 'artifacts'), { recursive: true }); await writeFile(resolve(root, 'artifacts/firstplay-check-latest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) { if (tests.status !== 0) console.error(tests.stdout, tests.stderr); process.exitCode = 1; }
