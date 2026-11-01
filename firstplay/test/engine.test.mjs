import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { GameCatalog } from '../ml/catalog.mjs';
import { ScreeningEngine } from '../runtime/engine.mjs';
import { EncryptedStore } from '../runtime/store.mjs';

const catalog = await GameCatalog.load();
const actor = { id: 'owner', role: 'owner' };
const result = (id, overrides = {}) => ({ message_id: id, relevance: 'none', intents: ['social'], references: [], unknown_information: false, unresolved_reference: false, uncertain: false, recommended_disposition: 'allow', reason: 'Ordinary conversation.', ...overrides });
const provider = (fn = item => result(item.id)) => ({ classify: async (_catalog, items) => ({ results: new Map(items.map(item => [item.id, fn(item)])), metrics: { latencyMs: 1, usage: null } }) });
function setup(options = {}) { const engine = new ScreeningEngine({ catalog, provider: provider(), batchWaitMs: 1_000_000, ...options }); return engine; }

test('reader projection never contains held text, reasons, references or future fact pack', async t => {
  const engine = setup({ provider: provider(item => result(item.id, { uncertain: true })) }); t.after(() => engine.close());
  engine.ingest({ id: 'held', text: 'SECRET SENTINEL' }); await engine.flush();
  const feed = JSON.stringify(engine.safeFeed());
  assert.ok(!feed.includes('SECRET SENTINEL')); assert.ok(!feed.includes('reason')); assert.ok(!feed.includes('frog.capture'));
  assert.equal(engine.moderatorState().review[0].text, 'SECRET SENTINEL');
});
test('Twitch deletions beat late model approvals', async t => {
  let release;
  const engine = setup({ provider: { classify: async (_catalog, items) => new Promise(resolve => { release = () => resolve({ results: new Map(items.map(item => [item.id, result(item.id)])) }); }) } });
  t.after(() => engine.close()); engine.ingest({ id: 'a', text: 'Hello' });
  const pending = engine.flush(); await sleep(0); engine.remove('a'); release(); await pending;
  assert.equal(engine.messages.get('a').disposition, 'removed'); assert.equal(engine.safeFeed().messages.length, 0);
});
test('a policy change in flight forces review rather than publishing stale approval', async t => {
  let release;
  const engine = setup({ provider: { classify: async (_catalog, items) => new Promise(resolve => { release = () => resolve({ results: new Map(items.map(item => [item.id, result(item.id)])) }); }) } });
  t.after(() => engine.close()); engine.ingest({ id: 'a', text: 'Hello' });
  const pending = engine.flush(); await sleep(0); engine.setPolicy({ mode: 'strict_social' }, actor); release(); await pending;
  assert.equal(engine.messages.get('a').disposition, 'review'); assert.equal(engine.safeFeed().messages.length, 0);
});
test('expired reviews remain hidden and cannot be manually released', async t => {
  let now = 1000;
  const engine = setup({ clock: () => now, reviewTtlMs: 100, provider: provider(item => result(item.id, { uncertain: true })) }); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'Uncertain' }); await engine.flush(); now += 101; engine.prune();
  assert.equal(engine.messages.get('a').disposition, 'expired'); assert.throws(() => engine.review('a', 'allow', actor));
});
test('rejected-parent replies never reach the reader', async t => {
  const engine = setup({ provider: provider(item => result(item.id, { relevance: 'current_game', intents: ['exact_solution'] })) }); t.after(() => engine.close());
  engine.ingest({ id: 'parent', text: 'A spoiler' }); await engine.flush();
  engine.ingest({ id: 'reply', text: 'Exactly', replyTo: 'parent' });
  assert.equal(engine.messages.get('reply').disposition, 'reject'); assert.equal(engine.safeFeed().messages.length, 0);
});
test('one unknown or duplicate model ID discards the entire batch', async t => {
  const engine = setup({ provider: { classify: async () => ({ results: new Map([['a', result('a')], ['b', result('wrong-id')]]) }) } }); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'Hello' }); engine.ingest({ id: 'b', text: 'Hi' }); await engine.flush();
  assert.equal(engine.safeFeed().messages.length, 0); assert.equal(engine.messages.get('a').disposition, 'review');
});
test('queue capacity and model failure cannot cause fail-open behavior', async t => {
  const engine = setup({ maxPending: 1, maxReview: 1, provider: { classify: async () => { throw new Error('offline'); } } }); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'Hello' }); engine.ingest({ id: 'b', text: 'Hi' }); await engine.flush();
  assert.equal(engine.messages.get('b').disposition, 'expired'); assert.equal(engine.safeFeed().messages.length, 0);
});
test('viewer receipts require a private-reader acknowledgement and are isolated by sender identity', async t => {
  const engine = setup(); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'Alice', senderId: 'alice' }); engine.ingest({ id: 'b', text: 'Bob', senderId: 'bob' }); await engine.flush();
  assert.equal(engine.viewerState({ role: 'viewer', senderId: 'alice' }).messages.length, 1);
  assert.equal(engine.viewerState({ role: 'viewer', senderId: 'alice' }).messages[0].status, 'approved');
  assert.throws(() => engine.acknowledge(['a'], { role: 'overlay', id: 'overlay' }));
  engine.acknowledge(['a'], { role: 'reader', id: 'primary' });
  assert.equal(engine.viewerState({ role: 'viewer', senderId: 'alice' }).messages[0].status, 'delivered');
  assert.equal(engine.viewerState({ role: 'viewer', senderId: 'bob' }).messages[0].status, 'approved');
});
test('viewer claims cannot update knowledge; seen does not confirm capture; moderator release does not learn', async t => {
  const engine = setup({ provider: provider(item => result(item.id, { uncertain: true })) }); t.after(() => engine.close());
  assert.throws(() => engine.confirmDiscovery({ id: 'frog.capture', actor: { role: 'viewer', id: 'chatter' } }));
  engine.confirmDiscovery({ id: 'frog.seen', actor });
  assert.deepEqual(engine.ledger.snapshot().factIds, ['frog.seen']);
  engine.ingest({ id: 'a', text: 'They already captured a frog' }); await engine.flush(); engine.review('a', 'allow', actor);
  assert.deepEqual(engine.ledger.snapshot().factIds, ['frog.seen']);
});
test('raw stored messages are encrypted and restarts do not automatically publish approved history', async t => {
  const store = new EncryptedStore(); const engine = setup({ store }); t.after(() => { engine.close(); store.close(); });
  engine.ingest({ id: 'a', text: 'RAW MESSAGE SENTINEL' }); await engine.flush();
  const raw = store.db.prepare('SELECT value FROM records WHERE namespace=?').get('messages');
  assert.ok(!raw.value.includes('RAW MESSAGE SENTINEL'));
  assert.equal(store.get('messages', 'a').text, 'RAW MESSAGE SENTINEL');
  const restarted = setup({ store }); t.after(() => restarted.close()); assert.equal(restarted.safeFeed().messages.length, 0);
});
test('model budget exhaustion holds messages without another inference request', async t => {
  let calls = 0;
  const engine = setup({ maxBatchesPerMinute: 1, provider: { classify: async (_catalog, items) => { calls++; return { results: new Map(items.map(item => [item.id, result(item.id)])) }; } } }); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'One' }); await engine.flush(); engine.ingest({ id: 'b', text: 'Two' }); await engine.flush();
  assert.equal(calls, 1); assert.equal(engine.messages.get('b').disposition, 'expired');
});
test('removals propagate through nested reply chains', async t => {
  const engine = setup(); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'One' }); await engine.flush(); engine.ingest({ id: 'b', text: 'Two', replyTo: 'a' }); await engine.flush(); engine.ingest({ id: 'c', text: 'Three', replyTo: 'b' }); await engine.flush();
  engine.remove('a'); assert.equal(engine.safeFeed().messages.length, 0); assert.equal(engine.messages.get('c').disposition, 'removed');
});
test('one-hint permission queues candidates, permits one reviewed release and then closes', async t => {
  const engine = setup({ provider: provider(item => result(item.id, { relevance: 'current_game', intents: ['search_hint'] })) }); t.after(() => engine.close());
  engine.requestHint('Current visible obstacle', actor);
  engine.ingest({ id: 'hint-a', text: 'Look around the current area.' }); engine.ingest({ id: 'hint-b', text: 'Look at that side.' }); await engine.flush();
  assert.equal(engine.safeFeed().messages.length, 0); assert.equal(engine.messages.get('hint-a').disposition, 'review');
  engine.review('hint-a', 'allow', actor); engine.prune();
  assert.equal(engine.safeFeed().messages.length, 1); assert.throws(() => engine.review('hint-b', 'allow', actor));
});
test('reused interpretations preserve receipts and do not spend another model request', async t => {
  let calls = 0;
  const engine = setup({ maxBatchesPerMinute: 1, provider: { classify: async (_catalog, items, options) => {
    calls++; assert.ok(options.gameContext.references.length);
    return { results: new Map(items.map(item => [item.id, result(item.id)])) };
  } } }); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'Hello everyone!' }); await engine.flush();
  engine.acknowledge(['a'], { role: 'reader', id: 'reader' });
  engine.ingest({ id: 'b', text: 'Hello everyone!' }); await engine.flush();
  assert.equal(calls, 1); assert.equal(engine.metrics.cacheHits, 1);
  assert.equal(engine.messages.get('b').disposition, 'allow'); assert.equal(engine.messages.get('b').deliveredAt, null);
  engine.ingest({ id: 'c', text: 'Something different' }); await engine.flush();
  assert.equal(engine.messages.get('c').disposition, 'expired'); assert.equal(calls, 1);
});
test('revoking a discovery forces new inference and applies the current knowledge gate', async t => {
  let calls = 0;
  const engine = setup({ provider: { classify: async (_catalog, items) => { calls++; return { results: new Map(items.map(item => [item.id, result(item.id, { relevance: 'current_game', intents: ['recall'], references: [{ id: 'frog.capture', usage: 'disclosure' }] })])) }; } } }); t.after(() => engine.close());
  engine.confirmDiscovery({ id: 'frog.capture', known: true, actor });
  engine.ingest({ id: 'a', text: 'Remember that frog capture?' }); await engine.flush(); assert.equal(engine.messages.get('a').disposition, 'allow');
  engine.confirmDiscovery({ id: 'frog.capture', known: false, actor });
  engine.ingest({ id: 'b', text: 'Remember that frog capture?' }); await engine.flush();
  assert.equal(calls, 2); assert.equal(engine.messages.get('b').disposition, 'reject');
});
test('screening health measures queue-inclusive decision time without exposing held content', async t => {
  let now = 1000;
  const engine = setup({ clock: () => now }); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'HELD CONTENT SENTINEL' }); now += 6000;
  assert.equal(engine.screeningStatus().state, 'delayed');
  assert.ok(!JSON.stringify(engine.screeningStatus()).includes('HELD CONTENT SENTINEL'));
  await engine.flush();
  assert.equal(engine.screeningStatus().state, 'ready'); assert.equal(engine.screeningStatus().decisionLatency.p95Ms, 6000);
});
test('a successful new inference clears an earlier provider error', async t => {
  let fail = true;
  const engine = setup({ provider: { classify: async (_catalog, items) => { if (fail) throw new Error('offline'); return { results: new Map(items.map(item => [item.id, result(item.id)])) }; } } }); t.after(() => engine.close());
  engine.ingest({ id: 'a', text: 'Hello' }); await engine.flush(); assert.equal(engine.screeningStatus().state, 'unavailable');
  fail = false; engine.ingest({ id: 'b', text: 'Hello again' }); await engine.flush();
  assert.equal(engine.screeningStatus().state, 'ready'); assert.equal(engine.metrics.lastError, null);
});

test('a reply to an approval hidden by a policy change or restart remains hidden', async t => {
  const store = new EncryptedStore(), engine = setup({ store }); t.after(() => { engine.close(); store.close(); });
  engine.ingest({ id: 'parent', text: 'Old conversation' }); await engine.flush();
  engine.setPolicy({ mode: 'discovery' }, actor);
  engine.ingest({ id: 'reply', text: 'Exactly', replyTo: 'parent' });
  assert.equal(engine.messages.get('reply').disposition, 'reject'); assert.equal(engine.safeFeed().messages.length, 0);
  const restarted = setup({ store }); t.after(() => restarted.close());
  restarted.ingest({ id: 'after-restart', text: 'I agree', replyTo: 'parent' });
  assert.equal(restarted.messages.get('after-restart').disposition, 'reject');
});

test('pause survives restart and only a validated operator change can resume delivery', async t => {
  const store = new EncryptedStore(), engine = setup({ store }); t.after(() => { engine.close(); store.close(); });
  engine.setPaused(true, actor); assert.equal(engine.paused, true);
  const restarted = setup({ store }); t.after(() => restarted.close());
  assert.equal(restarted.paused, true); assert.throws(() => restarted.setPaused('false', actor));
  assert.throws(() => restarted.setPaused(false, { id: 'viewer', role: 'viewer' }));
  restarted.ingest({ id: 'safe', text: 'Hello' }); await restarted.flush(); assert.equal(restarted.safeFeed().messages.length, 0);
  restarted.setPaused(false, actor); assert.equal(restarted.safeFeed().messages.length, 1);
});

test('failed policy and pause writes leave live permissions and reader state unchanged', async t => {
  const store = new EncryptedStore(), engine = setup({ store }); t.after(() => { engine.close(); store.close(); });
  engine.setPolicy({ mode: 'strict_social' }, actor); const old = engine.snapshot();
  t.mock.method(store, 'set', () => { throw new Error('Injected write failure'); });
  assert.throws(() => engine.setPolicy({ mode: 'discovery', allowGentleHints: true }, actor), /write failure/);
  assert.deepEqual(engine.snapshot(), old); assert.throws(() => engine.setPaused(true, actor), /write failure/); assert.equal(engine.paused, false);
});
