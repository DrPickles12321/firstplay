import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelHealth } from '../runtime/model-health.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { ScreeningEngine } from '../runtime/engine.mjs';
import { createApplication } from '../server.mjs';
const catalog = await GameCatalog.load('subnautica'), owner = { id: 'model-check-owner', role: 'owner' };
const result = id => ({ message_id: id, relevance: 'none', intents: ['social'], references: [], unknown_information: false, unresolved_reference: false, uncertain: false, recommended_disposition: 'allow', reason: 'Ordinary greeting.' });
function fixture(t, classify) { const store = new EncryptedStore(); t.after(() => store.close()); const engine = new ScreeningEngine({ catalog, store, provider: { name: 'controlled-model', classify } }); t.after(() => engine.close()); return engine; }

test('model checks validate a real provider response without adding chat, knowledge or delivery receipts', async t => {
 let now = 1000, calls = 0; const ids = [];
 const engine = fixture(t, async (_, items) => { calls++; ids.push(items[0].id); return { results: new Map([[items[0].id, result(items[0].id)]]), metrics: { latencyMs: 25 } }; });
 engine.metrics.lastError = 'usage_limit'; const health = new ModelHealth({ clock: () => now }); t.after(() => health.close());
 assert.equal((await health.check({ engine, actor: owner, assertCurrent() {} })).state, 'ready'); assert.equal(engine.metrics.lastError, null); assert.equal(engine.messages.size, 0); assert.equal(engine.ledger.state.factIds.length, 0); assert.equal(engine.metrics.received, 0);
 await health.check({ engine, actor: owner, assertCurrent() {} }); assert.equal(calls, 1);
 now += 10_001; await health.check({ engine, actor: owner, assertCurrent() {} }); assert.equal(calls, 2); assert.notEqual(ids[0], ids[1]);
 assert.throws(() => health.check({ engine, actor: { role: 'viewer' }, assertCurrent() {} }), /owner/);
});
test('concurrent model checks share one operation and shutdown cancels it', async t => {
 let calls = 0; const engine = fixture(t, async (_, items, { signal }) => new Promise((resolve, reject) => { calls++; signal.addEventListener('abort', () => reject(Object.assign(new Error('Canceled'), { code: 'aborted' })), { once: true }); }));
 const health = new ModelHealth(); const first = health.check({ engine, actor: owner, assertCurrent() {} }), second = health.check({ engine, actor: owner, assertCurrent() {} }); assert.equal(first, second); assert.equal(calls, 1); assert.equal(health.status().state, 'checking'); health.close(); assert.equal((await first).errorCode, 'aborted');
});
test('failed/malformed checks reveal only bounded error codes and cannot clear an existing failure', async t => {
 let now = 1000; const engine = fixture(t, async () => { throw Object.assign(new Error('SECRET_SENTINEL'), { code: 'usage_limit' }); }); engine.metrics.lastError = 'provider_failed';
 const health = new ModelHealth({ clock: () => now }); t.after(() => health.close()); const failure = await health.check({ engine, actor: owner, assertCurrent() {} }); assert.equal(failure.errorCode, 'usage_limit'); assert(!JSON.stringify(failure).includes('SECRET_SENTINEL')); assert.equal(engine.metrics.lastError, 'provider_failed');
 now += 10_001; engine.provider.classify = async (_, items) => ({ results: new Map([[items[0].id, { message_id: items[0].id, recommended_disposition: 'allow' }]]) });
 assert.equal((await health.check({ engine, actor: owner, assertCurrent() {} })).errorCode, 'invalid_probe_response');
 now += 10_001; engine.provider.classify = async (_, items) => ({ results: new Map([[items[0].id, result(items[0].id)]]) });
 await assert.rejects(health.check({ engine, actor: owner, assertCurrent() { throw Object.assign(new Error('Run changed'), { status: 409 }); } }), /Run changed/); assert.equal(health.status().state, 'unchecked');
});
test('HTTP model checks are owner/run guarded, and stream status excludes raw recognition evidence', async t => {
 let calls = 0; const provider = { name: 'controlled-model', async classify(_, items) { calls++; return { results: new Map(items.map(item => [item.id, result(item.id)])) }; } };
 const app = await createApplication({ catalog, provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '' } }); const base = await app.start(); t.after(() => app.close());
 const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' }, post = (path, body, extra = {}) => fetch(base + path, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
 const login = await post('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0]; const control = await (await fetch(base + '/api/control', { headers })).json(), expectedRunId = control.session.runId;
 for (const token of [control.links.reader, app.auth.issue('moderator')]) assert.equal((await post('/api/model/check', { expectedRunId }, { Authorization: 'Bearer ' + token })).status, 403);
 assert.equal((await post('/api/model/check', { expectedRunId: 'stale' })).status, 409); assert.equal(calls, 0);
 assert.equal((await (await post('/api/model/check', { expectedRunId })).json()).check.state, 'ready'); assert.equal(calls, 1); assert.equal(app.engine.messages.size, 0);
 app.observer.lastCheck = { state: 'complete', finishedAt: Date.now(), diagnostic: 'RAW PRIVATE LABEL SENTINEL' };
 const updated = await (await fetch(base + '/api/control', { headers })).json(); assert(updated.progress); assert(!JSON.stringify(updated.progress).includes('RAW PRIVATE')); assert(!('source' in updated.progress));
});
