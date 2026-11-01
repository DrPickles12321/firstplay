import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCatalog } from '../ml/catalog.mjs';
import { ProgressObserver } from '../ml/observer.mjs';
import { GameSessions } from '../runtime/sessions.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { CapabilityAuth } from '../runtime/auth.mjs';
import { ExtensionAccess } from '../runtime/extension-access.mjs';
import { createApplication } from '../server.mjs';

const owner = { id: 'owner', role: 'owner' };
const interpretation = item => ({ message_id: item.id, relevance: 'none', intents: ['social'], references: [], unknown_information: false, unresolved_reference: false, uncertain: false, recommended_disposition: 'allow', reason: 'Synthetic transport check.' });
const provider = { name: 'test-only', classify: async (_catalog, items) => ({ results: new Map(items.map(item => [item.id, interpretation(item)])) }) };

async function setup(t, overrides = {}) {
  const store = overrides.store || new EncryptedStore();
  const sessions = await GameSessions.create({ store, provider, ...overrides });
  t.after(() => { sessions.close(); store.close(); }); return { store, sessions };
}

test('the second catalog is isolated, exposes only supported confirmations and keeps visual inference disabled', async () => {
  const [mario, subnautica] = await Promise.all([GameCatalog.load(), GameCatalog.load('subnautica')]);
  assert.equal([...mario.references.values()].filter(ref => ref.type === 'moon').length, 836);
  assert.equal(subnautica.references.size, 49); assert.ok([...subnautica.references.keys()].every(id => id.startsWith('sn1.')));
  assert.equal(subnautica.summary().visionEnabled, false); assert.equal(mario.summary().visionEnabled, true);
  assert.equal(subnautica.canConfirm('sn1.boomerang.named'), true); assert.equal(subnautica.canConfirm('sn1.radio.repaired'), false);
  await assert.rejects(GameCatalog.load('../../.env'), /Unsupported game/);
});

test('legacy Mario knowledge migrates once while credentials remain global; switching and restoring never merge games', async t => {
  const store = new EncryptedStore();
  store.set('state', 'knowledge', { revision: 3, factIds: ['frog.capture'], relationIds: [] });
  store.set('state', 'policy', { policy: { mode: 'strict_social' }, revision: 2, objective: 'Mario objective' });
  store.set('auth', 'marker', { value: 'preserve' });
  const { sessions } = await setup(t, { store }); const marioRun = sessions.run.id;
  assert.deepEqual(sessions.engine.ledger.state.factIds, ['frog.capture']); assert.equal(sessions.engine.policy.mode, 'strict_social');
  sessions.start('subnautica', owner, marioRun);
  assert.deepEqual(sessions.engine.ledger.state.factIds, []); assert.equal(sessions.engine.policy.mode, 'discovery');
  sessions.engine.confirmDiscovery({ eventId: 'sn1.event.boomerang_inventory', actor: owner }); const subnauticaRun = sessions.run.id;
  assert(sessions.engine.ledger.state.factIds.includes('sn1.boomerang.named'));
  sessions.restore(marioRun, owner, subnauticaRun);
  assert.deepEqual(sessions.engine.ledger.state.factIds, ['frog.capture']); assert.equal(sessions.engine.objective, 'Mario objective');
  assert.equal(store.get('auth', 'marker').value, 'preserve'); assert.equal(sessions.savedRuns().length, 2);
  assert.deepEqual(store.get('state', 'knowledge').factIds, ['frog.capture'], 'Original encrypted legacy state remains available.');
});

test('active game and discoveries survive restart without replaying approved chat or stale reviews', async t => {
  const { store, sessions } = await setup(t);
  sessions.start('subnautica', owner, sessions.run.id); const runId = sessions.run.id;
  sessions.engine.confirmDiscovery({ id: 'sn1.creepvine.named', actor: owner });
  sessions.engine.ingest({ id: 'old', text: 'Old approved message' }); await sessions.engine.flush();
  sessions.close(); const restarted = await GameSessions.create({ store, provider }); t.after(() => restarted.close());
  assert.equal(restarted.run.id, runId); assert.equal(restarted.catalog.gameId, 'subnautica');
  assert.deepEqual(restarted.engine.ledger.state.factIds, ['sn1.creepvine.named']); assert.equal(restarted.engine.safeFeed().messages.length, 0);
});

test('paused delivery belongs to its saved game run and survives restoring that run', async t => {
  const { sessions } = await setup(t); const mario = sessions.run.id;
  sessions.start('subnautica', owner, mario); const subnautica = sessions.run.id;
  sessions.engine.setPaused(true, owner); sessions.restore(mario, owner, subnautica);
  assert.equal(sessions.engine.paused, false); sessions.restore(subnautica, owner, mario); assert.equal(sessions.engine.paused, true);
});

test('retrying a completed discovery event does not duplicate audit events or advance knowledge', async t => {
  const { sessions } = await setup(t); sessions.start('subnautica', owner, sessions.run.id);
  sessions.engine.confirmDiscovery({ eventId: 'sn1.event.boomerang_inventory', actor: owner });
  const snapshot = sessions.engine.ledger.snapshot(), events = sessions.engine.store.list('knowledge-events').length;
  sessions.engine.confirmDiscovery({ eventId: 'sn1.event.boomerang_inventory', actor: owner });
  assert.deepEqual(sessions.engine.ledger.snapshot(), snapshot); assert.equal(sessions.engine.store.list('knowledge-events').length, events);
});

test('switching aborts a pending Mario worker and a late result cannot publish into the new game', async t => {
  let release, wasAborted = false;
  const delayed = { name: 'test-only', classify: async (_catalog, items, { signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => { wasAborted = true; }); release = () => resolve({ results: new Map(items.map(item => [item.id, interpretation(item)])) });
  }) };
  const { sessions } = await setup(t, { provider: delayed }); const old = sessions.engine;
  old.ingest({ id: 'late', text: 'MARIO PRIVATE SENTINEL' }); const pending = old.flush();
  sessions.start('subnautica', owner, sessions.run.id); release(); await pending;
  assert.equal(wasAborted, true); assert.equal(sessions.engine.safeFeed().messages.length, 0); assert.equal(sessions.engine.messages.has('late'), false);
  assert.equal(old.messages.get('late').disposition, 'pending', 'Closed worker never converts its old message into an approval.');
});

test('stale requests, unsupported references and non-owner switching leave the current game untouched', async t => {
  const { sessions } = await setup(t); const oldRun = sessions.run.id;
  assert.throws(() => sessions.start('subnautica', { role: 'moderator', id: 'mod' }, oldRun), /Only the owner/);
  sessions.start('subnautica', owner, oldRun); const run = sessions.run.id;
  assert.throws(() => sessions.start('mario', owner, oldRun), /session changed/);
  assert.throws(() => sessions.engine.confirmDiscovery({ id: 'frog.capture', actor: owner }), /Invalid discovery/);
  assert.throws(() => sessions.engine.confirmDiscovery({ id: 'sn1.radio.repaired', actor: owner }), /outside/);
  assert.equal(sessions.run.id, run); assert.equal(sessions.engine.ledger.state.factIds.length, 0);
});

test('a multi-fact discovery rolls back the entire event on storage failure', async t => {
  const { sessions, store } = await setup(t); sessions.start('subnautica', owner, sessions.run.id);
  const original = store.set; let events = 0;
  t.mock.method(store, 'set', function(namespace, id, value, expiresAt) {
    if (namespace.endsWith(':knowledge-events') && ++events === 2) throw new Error('Injected storage failure');
    return original.call(this, namespace, id, value, expiresAt);
  });
  assert.throws(() => sessions.engine.confirmDiscovery({ eventId: 'sn1.event.boomerang_inventory', actor: owner }), /storage failure/);
  assert.deepEqual(sessions.engine.ledger.state, { revision: 0, factIds: [], relationIds: [] });
  assert.equal(sessions.engine.store.get('state', 'knowledge'), null); assert.equal(sessions.engine.store.list('knowledge-events').length, 0);
});

test('Subnautica image checks are rejected before invoking the provider', async () => {
  let calls = 0; const catalog = await GameCatalog.load('subnautica');
  const observer = new ProgressObserver({ catalog, provider: { run: () => { calls++; } } });
  await assert.rejects(observer.observe([], 'current'), /disabled/); assert.equal(calls, 0);
});

test('a failed legacy migration preserves the original Mario save and creates no partial session', async t => {
  const store = new EncryptedStore(); t.after(() => store.close());
  store.set('state', 'knowledge', { revision: 1, factIds: ['frog.capture'], relationIds: [] });
  const original = store.set;
  t.mock.method(store, 'set', function(namespace, id, ...rest) { if (namespace === 'state' && id === 'active-game-run') throw new Error('Injected migration failure'); return original.call(this, namespace, id, ...rest); });
  await assert.rejects(GameSessions.create({ store, provider }), /migration failure/);
  assert.equal(store.get('state', 'active-game-run'), null); assert.equal(store.list('game-runs').length, 0);
  assert.deepEqual(store.get('state', 'knowledge').factIds, ['frog.capture']);
});

test('an existing channel-bound extension follows the selected game and refuses old render acknowledgements', async t => {
  const { sessions, store } = await setup(t); const auth = new CapabilityAuth(store), id = 'a'.repeat(32);
  const access = new ExtensionAccess({ auth, store, engine: () => sessions.engine, channel: () => ({ id: 'channel', login: 'channel' }), connection: () => ({ source: 'live' }) });
  const headers = { 'x-firstplay-client': '1', 'x-firstplay-extension': id, origin: `chrome-extension://${id}` };
  const grant = access.redeem({ headers }, { code: access.start(owner).code }); headers.authorization = `Bearer ${grant.token}`;
  const oldEpoch = sessions.engine.epoch; sessions.start('subnautica', owner, sessions.run.id);
  sessions.engine.ingest({ id: 'safe', text: 'Hello', source: 'live', channelId: 'channel' }); await sessions.engine.flush();
  const feed = access.feed({ headers }); assert.equal(feed.session.id, 'subnautica'); assert.deepEqual(feed.messages.map(message => message.id), ['safe']);
  assert(!JSON.stringify(feed).includes('sn1.rel.')); assert.throws(() => access.acknowledge({ headers }, { epoch: oldEpoch, ids: ['safe'] }));
});

test('HTTP game switching is owner-only, session-bound and selects the corresponding evaluation data', async t => {
  const app = await createApplication({ provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '' } });
  const base = (await app.start()).replace('localhost', '127.0.0.1'); t.after(() => app.close());
  const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' };
  const post = (path, data, extra = {}) => fetch(base + path, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(data) });
  const login = await post('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const initial = await (await fetch(base + '/api/control', { headers })).json();
  assert.equal((await post('/api/observations/source', { kind: 'recording', expectedRunId: initial.session.runId }, { Authorization: `Bearer ${initial.links.reader}` })).status, 403);
  assert.equal((await post('/api/observations/source', { kind: 'synthetic', expectedRunId: initial.session.runId })).status, 400);
  const videoSource = await (await post('/api/observations/source', { kind: 'recording', expectedRunId: initial.session.runId })).json(); assert.equal(videoSource.source.generation, 0);
  const denied = await post('/api/session/start', { gameId: 'subnautica', expectedRunId: initial.session.runId }, { Authorization: `Bearer ${initial.links.reader}` }); assert.equal(denied.status, 403);
  const changed = await (await post('/api/session/start', { gameId: 'subnautica', expectedRunId: initial.session.runId })).json(); assert.equal(changed.session.id, 'subnautica');
  assert.equal((await post('/api/observations/source/invalidate', { id: videoSource.source.id, generation: 0, expectedRunId: initial.session.runId })).status, 409);
  assert.equal((await post('/api/observations/source', { kind: 'recording', expectedRunId: changed.session.runId })).status, process.platform === 'darwin' ? 200 : 400);
  assert.equal((await post('/api/discovery', { id: 'sn1.boomerang.named', expectedRunId: initial.session.runId })).status, 409);
  assert.equal((await post('/api/observe', { frames: [], expectedRunId: changed.session.runId })).status, 400);
  const cases = await (await fetch(base + '/api/cases', { headers })).json(); assert.equal(cases.cases.length, 79); assert(cases.cases.every(row => row.game_id === 'sn1.opening-part1'));
  const result = await post('/api/discovery', { eventId: 'sn1.event.boomerang_inventory', expectedRunId: changed.session.runId }); assert.equal(result.status, 200);
  const moderator = await (await fetch(base + '/api/moderator', { headers })).json(), operation = moderator.discoveryActivity[0];
  assert.equal((await post('/api/discovery/undo', { operationId: operation.id, knowledgeRevision: 0, expectedRunId: changed.session.runId })).status, 409);
  assert.equal((await post('/api/discovery/undo', { operationId: operation.id, knowledgeRevision: moderator.knowledge.revision, expectedRunId: changed.session.runId }, { Authorization: `Bearer ${initial.links.reader}` })).status, 403);
  assert.equal((await post('/api/discovery/undo', { operationId: operation.id, knowledgeRevision: moderator.knowledge.revision, expectedRunId: changed.session.runId })).status, 200); assert.equal(app.engine.ledger.state.factIds.length, 0);
  const reader = await (await fetch(base + '/api/reader', { headers: { Authorization: `Bearer ${initial.links.reader}` } })).json();
  assert.equal(reader.session.id, 'subnautica'); assert(!JSON.stringify(reader).includes('sn1.boomerang')); assert(!JSON.stringify(reader).includes('evidence_required'));
});
