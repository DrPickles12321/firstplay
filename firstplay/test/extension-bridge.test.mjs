import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBridge, twitchChannel } from '../extension/background.mjs';

const id = 'a'.repeat(32), popup = { id, url: `chrome-extension://${id}/popup.html` }, content = { id, url: 'https://www.twitch.tv/paired_channel', frameId: 0 };
function setup() {
  let saved;
  const calls = [], notices = [], levels = [];
  const api = { runtime: { id, getURL: path => `chrome-extension://${id}/${path}` }, storage: { local: { setAccessLevel: async value => levels.push(value), get: async () => ({ firstplay: saved }), set: async value => { saved = value.firstplay; } } }, tabs: { query: async () => [{ id: 1 }], sendMessage: async (_id, value) => notices.push(value) } };
  const handle = createBridge(api, async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => url.endsWith('redeem') ? { token: 'private-reader-token', channel: 'paired_channel', expiresAt: Date.now() + 50000 } : { channel: { login: 'paired_channel' }, messages: [] } }; });
  return { handle, calls, notices, levels };
}
test('background keeps credentials in trusted storage and never returns them to Twitch content', async () => {
  const { handle, calls, levels } = setup();
  await assert.rejects(handle({ type: 'pair', code: 'code' }, content));
  const paired = await handle({ type: 'pair', code: 'code' }, popup); assert.equal(paired.paired, true); assert.equal('token' in paired, false);
  const state = await handle({ type: 'status' }, content); assert.equal('token' in state, false); assert.equal(levels[0].accessLevel, 'TRUSTED_CONTEXTS');
  await handle({ type: 'feed', url: 'https://attacker.example' }, content);
  assert.ok(calls.every(call => call.url.startsWith('http://localhost:3211/api/extension/')));
  assert.equal(calls[1].options.credentials, 'omit'); assert.equal(calls[1].options.headers.Authorization, 'Bearer private-reader-token');
});
test('wrong pages, channels, frames and arbitrary operations cannot use the bridge', async () => {
  const { handle } = setup(); await handle({ type: 'pair', code: 'code' }, popup);
  for (const sender of [{ ...content, id: 'b'.repeat(32) }, { ...content, url: 'https://attacker.example' }, { ...content, url: 'https://www.twitch.tv/other_channel' }, { ...content, frameId: 1 }]) await assert.rejects(handle({ type: 'feed' }, sender));
  await assert.rejects(handle({ type: 'fetch', url: '/api/moderator' }, content));
  await assert.rejects(handle({ type: 'set-enabled', enabled: false }, content));
});
test('protection toggles and disconnects produce monotonic revisions for stale-response rejection', async () => {
  const { handle, notices } = setup();
  const paired = await handle({ type: 'pair', code: 'code' }, popup);
  const [off, on] = await Promise.all([handle({ type: 'set-enabled', enabled: false }, popup), handle({ type: 'set-enabled', enabled: true }, popup)]);
  const forgotten = await handle({ type: 'forget' }, popup);
  assert.deepEqual([paired.revision, off.revision, on.revision, forgotten.revision], [1, 2, 3, 4]);
  assert.equal(forgotten.enabled, true); assert.equal(forgotten.paired, false); assert.equal(notices.at(-1).enabled, true);
});
test('manifest limits access and applies the native-chat guard before content JavaScript', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3); assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://www.twitch.tv/*', 'http://localhost/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start'); assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.ok(manifest.content_scripts[0].css.includes('guard.css')); assert.equal(manifest.externally_connectable, undefined);
  assert.equal(twitchChannel('https://www.twitch.tv/paired_channel'), 'paired_channel');
  assert.equal(twitchChannel('https://www.twitch.tv/directory'), null); assert.equal(twitchChannel('https://www.twitch.tv/videos/123'), null);
});
