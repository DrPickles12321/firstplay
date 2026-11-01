import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const provider = process.env.FIRSTPLAY_PROVIDER || 'codex', [major, minor] = process.versions.node.split('.').map(Number);
const nodeSupported = major > 22 || major === 22 && minor >= 13;
const checks = [{ name: 'Node 22.13+', passed: nodeSupported, version: process.versions.node }];
if (provider === 'codex') {
  const environment = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'SHELL', 'LANG', 'CODEX_HOME', 'SYSTEMROOT', 'APPDATA', 'LOCALAPPDATA'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const run = args => spawnSync(process.env.CODEX_BIN || 'codex', args, { encoding: 'utf8', timeout: 10_000, cwd: tmpdir(), env: environment });
  const version = run(['--version']);
  checks.push({ name: 'Codex CLI available', passed: version.status === 0, version: version.status === 0 ? version.stdout.trim() : null });
  if (version.status === 0) {
    const rootHelp = run(['--help']), execHelp = run(['exec', '--help']), help = `${rootHelp.stdout || ''}\n${execHelp.stdout || ''}`;
    const required = ['--no-daemon', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--output-schema', '--output-last-message', '--sandbox', '--json', '--cd', '--disable'];
    const missing = required.filter(flag => !help.includes(flag));
    checks.push({ name: 'Required automation flags', passed: !missing.length && rootHelp.status === 0 && execHelp.status === 0, missing });
    checks.push({ name: 'Saved Codex authentication', passed: run(['login', 'status']).status === 0 });
  }
} else if (provider === 'openai') checks.push({ name: 'Optional API configuration present', passed: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), note: 'Presence only; no API request or model compatibility check performed.' });
else checks.push({ name: 'Recognized provider', passed: false });
const passed = checks.every(check => check.passed);
console.log(JSON.stringify({ kind: 'local_setup_diagnostic', passed, provider, checks, twitchConfigured: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET), note: 'No inference or Twitch posts. Twitch credentials are optional for the isolated local demo. An unsupported CLI stays blocked; do not remove isolation flags to make it run.' }, null, 2));
if (!passed) process.exitCode = 1;
