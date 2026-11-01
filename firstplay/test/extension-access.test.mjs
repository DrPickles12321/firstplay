import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../server.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { ExtensionAccess } from '../runtime/extension-access.mjs';
import { CapabilityAuth } from '../runtime/auth.mjs';
import { ScreeningEngine } from '../runtime/engine.mjs';
import { GameCatalog } from '../ml/catalog.mjs';

const ID = 'a'.repeat(32), OTHER = 'b'.repeat(32), owner = { role: 'owner', id: 'test-owner' };
const interpretation = item => ({ message_id: item.id, relevance: 'none', intents: ['social'], references: [], unknown_information: false, unresolved_reference: false, uncertain: item.text.includes('SECRET'), recommended_disposition: 'allow', reason: 'Test interpretation.' });
const provider = { name: 'test-only', classify: async (_catalog, items) => ({ results: new Map(items.map(item => [item.id, interpretation(item)])) }) };
const catalog = await GameCatalog.load();
const headers = token => ({ 'x-firstplay-client': '1', 'x-firstplay-extension': ID, origin: `chrome-extension://${ID}`, ...(token ? { authorization: `Bearer ${token}` } : {}) });

function setup(t) {
  let now = Date.now(), channel = { id: 'owner-id', login: 'paired_channel' };
  const store = new EncryptedStore(), auth = new CapabilityAuth(store, () => now), engine = new ScreeningEngine({ catalog, store, provider, clock: () => now, batchWaitMs: 1_000_000 });
  const access = new ExtensionAccess({ auth, store, engine, clock: () => now, channel: () => channel, connection: () => ({ source: 'live', twitch: { state: 'connected' } }) });
  t.after(() => { engine.close(); store.close(); });
  return { access, auth, engine, advance: value => { now += value; }, switchChannel: () => { channel = { id: 'different-owner', login: 'other_channel' }; } };
}

test('pairing requires owner approval, expires, is single use and never grants operator access', t => {
  const { access, auth, advance } = setup(t);
  assert.throws(() => access.start({ role: 'reader' }));
  let code = access.start(owner).code; advance(300_001);
  assert.throws(() => access.redeem({ headers: headers() }, { code }));
  code = access.start(owner).code; const result = access.redeem({ headers: headers() }, { code });
  const actor = auth.resolve(result.token); assert.equal(actor.role, 'reader'); assert.equal(actor.kind, 'chrome-extension'); assert.equal(actor.channelId, 'owner-id');
  assert.throws(() => auth.actor({ headers: headers(result.token) }, ['owner']));
  assert.throws(() => access.redeem({ headers: headers() }, { code }));
});
test('extension feed contains approved live messages for its paired channel, never held or replay text', async t => {
  const { access, engine } = setup(t), code = access.start(owner).code, token = access.redeem({ headers: headers() }, { code }).token;
  engine.ingest({ id: 'safe', text: 'Hello', source: 'live', channelId: 'owner-id' });
  engine.ingest({ id: 'hidden', text: 'RAW SECRET SENTINEL', source: 'live', channelId: 'owner-id' });
  engine.ingest({ id: 'replay', text: 'REPLAY SENTINEL', source: 'replay', channelId: 'owner-id' });
  engine.ingest({ id: 'other', text: 'OTHER CHANNEL SENTINEL', source: 'live', channelId: 'other-owner' }); await engine.flush();
  const feed = access.feed({ headers: headers(token) });
  assert.ok(access.status().lastSeenAt); assert.equal(access.status().lastRenderedAt, null);
  assert.deepEqual(feed.messages.map(message => message.id), ['safe']);
  assert.ok(!JSON.stringify(feed).includes('SENTINEL')); assert.ok(!JSON.stringify(feed).includes('frog.capture'));
  access.acknowledge({ headers: headers(token) }, { epoch: engine.epoch, ids: ['safe', 'other'] });
  assert.ok(engine.messages.get('safe').deliveredAt); assert.equal(engine.messages.get('other').deliveredAt, null);
  assert.ok(access.status().lastRenderedAt);
  assert.throws(() => access.acknowledge({ headers: headers(token) }, { epoch: 'old-epoch', ids: ['safe'] }));
});
test('origin, extension identity, channel changes and revocation cannot widen reader access', t => {
  const { access, switchChannel } = setup(t), code = access.start(owner).code, token = access.redeem({ headers: headers() }, { code }).token;
  assert.throws(() => access.feed({ headers: { ...headers(token), origin: 'https://www.twitch.tv' } }));
  assert.throws(() => access.feed({ headers: { ...headers(token), 'x-firstplay-extension': OTHER, origin: `chrome-extension://${OTHER}` } }));
  assert.equal(access.status().paired, 1); access.revoke(owner); assert.equal(access.status().paired, 0); assert.throws(() => access.feed({ headers: headers(token) }));
  const second = access.redeem({ headers: headers() }, { code: access.start(owner).code }).token;
  switchChannel(); assert.throws(() => access.feed({ headers: headers(second) }));
});
test('HTTP extension capabilities cannot bypass channel binding through ordinary reader or operator routes', async t => {
  const app = await createApplication({ provider, store: new EncryptedStore(), config: { port: 0, clientId: 'test-id', clientSecret: 'test-secret' },
    twitchFactory: options => ({ ...options, tokens: { userId: 'owner-id', login: 'paired_channel' }, status: { state: 'connected', channel: 'paired_channel' }, restore: async () => true, stop() {} }) });
  const base = (await app.start()).replace('localhost', '127.0.0.1'); t.after(() => app.close());
  const post = (path, body, extra) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
  assert.equal((await post('/api/extension/pair', {}, { Origin: base, 'X-FirstPlay-Client': '1' })).status, 403);
  const session = await post('/api/local-session', {}, { Origin: base, 'X-FirstPlay-Client': '1' }); const cookie = session.headers.get('set-cookie').split(';')[0];
  const pairing = await (await post('/api/extension/pair', {}, { Origin: base, 'X-FirstPlay-Client': '1', Cookie: cookie })).json();
  assert.equal((await post('/api/extension/redeem', { code: pairing.code }, { ...headers(), origin: 'https://hostile.example' })).status, 403);
  const granted = await (await post('/api/extension/redeem', { code: pairing.code }, headers())).json();
  for (const path of ['/api/control', '/api/moderator', '/api/catalog', '/api/reader']) assert.equal((await fetch(base + path, { headers: { ...headers(granted.token), Cookie: cookie } })).status, 403);
  assert.equal((await post('/api/reader/ack', { ids: [] }, { ...headers(granted.token), origin: base })).status, 403);
  assert.equal((await fetch(base + '/api/extension/feed', { headers: headers(granted.token) })).status, 200);
});
