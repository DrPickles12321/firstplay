import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBridge, twitchChannel } from '../extension/background.mjs';

const id = 'a'.repeat(32), popup = { id, url: `chrome-extension://${id}/popup.html` }, content = { id, url: 'https://www.twitch.tv/paired_channel', frameId: 0 };
function setup() {
  let saved;
  const calls = [], notices = [], levels = [], queries = [];
  const api = { runtime: { id, getURL: path => `chrome-extension://${id}/${path}` }, storage: { local: { setAccessLevel: async value => levels.push(value), get: async () => ({ firstplay: saved }), set: async value => { saved = value.firstplay; } } }, tabs: { query: async value => { queries.push(value); return [{ id: 1 }]; }, sendMessage: async (_id, value) => notices.push(value) } };
  const handle = createBridge(api, async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => url.endsWith('redeem') ? { token: 'private-reader-token', channel: 'paired_channel', expiresAt: Date.now() + 50000 } : { channel: { login: 'paired_channel' }, messages: [] } }; });
  return { handle, calls, notices, levels, queries };
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
  assert.deepEqual(manifest.host_permissions, ['https://www.twitch.tv/*', 'https://dashboard.twitch.tv/*', 'http://localhost/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start'); assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.ok(manifest.content_scripts[0].css.includes('guard.css')); assert.equal(manifest.externally_connectable, undefined);
  assert.equal(twitchChannel('https://www.twitch.tv/paired_channel'), 'paired_channel');
  assert.equal(twitchChannel('https://www.twitch.tv/directory'), null); assert.equal(twitchChannel('https://www.twitch.tv/videos/123'), null);
  const dashboard = manifest.content_scripts.find(script => script.matches.includes('https://dashboard.twitch.tv/u/*/stream-manager*'));
  assert.equal(dashboard.run_at, 'document_start'); assert.equal(dashboard.all_frames, false); assert.ok(dashboard.css.includes('dashboard-guard.css'));
});

test('Stream Manager reads only its paired channel through the same restricted bridge', async () => {
  const { handle, calls } = setup(); await handle({ type: 'pair', code: 'code' }, popup);
  const dashboard = { ...content, url: 'https://dashboard.twitch.tv/u/paired_channel/stream-manager?view=default' };
  assert.equal(twitchChannel(dashboard.url), 'paired_channel');
  assert.equal((await handle({ type: 'status' }, dashboard)).paired, true);
  await handle({ type: 'feed' }, dashboard); await handle({ type: 'ack', ids: ['approved-id'], epoch: 'current' }, dashboard);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/api/extension/redeem', '/api/extension/feed', '/api/extension/ack']);
  assert.ok(calls.every(call => call.options.credentials === 'omit'));
  await assert.rejects(handle({ type: 'set-enabled', enabled: false }, dashboard), /popup/);
});

test('other dashboard pages, channels, hosts and child frames cannot read the protected feed', async () => {
  const { handle, calls } = setup(); await handle({ type: 'pair', code: 'code' }, popup);
  for (const url of ['https://dashboard.twitch.tv/u/other_channel/stream-manager', 'https://dashboard.twitch.tv/u/paired_channel/home', 'https://dashboard.twitch.tv/u/paired_channel/stream-manager-other', 'https://dashboard.twitch.tv/u/paired_channel/stream-manager/extra', 'https://dashboard.twitch.tv/u/paired_channel%2Fother/stream-manager', 'https://dashboard.twitch.tv.attacker.example/u/paired_channel/stream-manager', 'http://dashboard.twitch.tv/u/paired_channel/stream-manager']) await assert.rejects(handle({ type: 'feed' }, { ...content, url }));
  await assert.rejects(handle({ type: 'feed' }, { ...content, url: 'https://dashboard.twitch.tv/u/paired_channel/stream-manager', frameId: 1 }));
  assert.equal(calls.length, 1, 'Rejected pages never contact the local reader.');
});

test('popup toggles notify both dashboard and public channel readers and disable their feed access', async () => {
  const { handle, queries, notices } = setup(); await handle({ type: 'pair', code: 'code' }, popup);
  const off = await handle({ type: 'set-enabled', enabled: false }, popup);
  assert.deepEqual(queries.at(-1).url, ['https://www.twitch.tv/*', 'https://dashboard.twitch.tv/u/*/stream-manager*']);
  assert.equal(notices.at(-1).enabled, false);
  await assert.rejects(handle({ type: 'feed' }, { ...content, url: 'https://dashboard.twitch.tv/u/paired_channel/stream-manager' }));
  const on = await handle({ type: 'set-enabled', enabled: true }, popup); assert.equal(on.revision, off.revision + 1);
  assert.equal((await handle({ type: 'status' }, content)).enabled, true);
});
