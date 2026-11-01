import { readdir, readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// An explicit allowlist excludes live credentials, capabilities, recordings and saved chat.
const root = fileURLToPath(new URL('../../', import.meta.url)), paths = ['README.md', 'package.json', '.env.example', '.gitignore', '.nvmrc', '.github/workflows/check.yml', 'docs/images/firstplay-reader.png', 'lib/twitch.mjs'];
async function walk(directory) {
  for (const item of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await walk(path);
    else if (item.isFile() && !item.name.startsWith('.') && /\.(?:mjs|js|json|jsonl|md|py|m|css|html)$/.test(item.name)) paths.push(path);
  }
}
await walk('firstplay'); await walk('research/firstplay');
for (const item of await readdir(resolve(root, 'docs'))) if (/^firstplay.*\.md$/.test(item)) paths.push(join('docs', item));
let localConfiguration = {};
try { localConfiguration = parseEnv(await readFile(resolve(root, '.env'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const secrets = Object.entries(localConfiguration).filter(([key, value]) => /SECRET|TOKEN|KEY|PASSWORD|TWITCH_CLIENT_ID/i.test(key) && value.length >= 16).map(([, value]) => value);
const directory = await mkdtemp(join(tmpdir(), 'firstplay-package-')), manifest = [];
const output = resolve(root, 'artifacts/firstplay-source.zip');
try {
  for (const path of [...new Set(paths)].sort()) {
    let bytes = await readFile(resolve(root, path));
    if (secrets.some(secret => bytes.includes(Buffer.from(secret))) || /\/(reader|overlay|status)#[a-f0-9]{64}/.test(bytes.toString('utf8'))) throw new Error(`Private configuration detected in source file: ${path}`);
    if (path === 'package.json') { const value = JSON.parse(bytes); delete value.scripts['start:legacy']; bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); }
    if (path === 'README.md') bytes = Buffer.from(bytes.toString('utf8').replace(/The unrelated unfinished Between Rounds prototype[^\n]*\n?/, '') + '\nThis source archive excludes the unrelated legacy prototype, runtime data and third-party gameplay media.\n');
    const destination = resolve(directory, path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes);
    manifest.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await mkdir(dirname(output), { recursive: true });
  // zip updates existing archives in place; remove only our generated output first.
  await rm(output, { force: true });
  const result = spawnSync('zip', ['-q', '-r', output, '.'], { cwd: directory, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.code === 'ENOENT' ? 'Install the standard zip command to create the source archive.' : 'Source archive creation failed.');
  await writeFile(resolve(root, 'artifacts/firstplay-source-manifest.json'), JSON.stringify({ kind: 'source_allowlist_manifest', timestamp: new Date().toISOString(), files: manifest, excluded: ['.env', '.data/', 'artifacts/', 'gameplay/media', 'legacy prototype'], knownLocalSecretsChecked: secrets.length }, null, 2) + '\n');
  console.log(JSON.stringify({ output: relative(root, output), sourceFiles: manifest.length, includesCredentials: false, includesRuntimeData: false, includesGameplayMedia: false }));
} finally { await rm(directory, { recursive: true, force: true }); }
