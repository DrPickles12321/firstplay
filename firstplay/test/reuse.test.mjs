import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCatalog } from '../ml/catalog.mjs';
import { InterpretationReuse } from '../ml/reuse.mjs';

const catalog = await GameCatalog.load();
const provider = { name: 'test-provider', model: 'test-model' };
const item = (id, changes = {}) => ({ id, text: 'Hello everyone!', knowledge: { factIds: [], relationIds: [], revision: 0 }, policy: { mode: 'discovery', allowGentleHints: false }, policyRevision: 0, epoch: 'session-1', objective: '', reply: null, ...changes });
const result = (id, changes = {}) => ({ message_id: id, relevance: 'none', intents: ['social'], references: [], unknown_information: false, unresolved_reference: false, uncertain: false, recommended_disposition: 'allow', reason: 'Ordinary conversation.', ...changes });
const response = plan => ({ results: new Map(plan.requests.map(request => [request.id, result(request.id)])), metrics: { latencyMs: 10 } });

test('identical bodies in the same context share inference but retain separate message identities', () => {
  const reuse = new InterpretationReuse();
  const plan = reuse.plan(catalog, [item('a'), item('b')], provider);
  assert.equal(plan.requests.length, 1);
  const completed = plan.complete(response(plan));
  assert.equal(completed.results.get('a').message_id, 'a'); assert.equal(completed.results.get('b').message_id, 'b');
  assert.equal(completed.metrics.repeatedInBatch, 1);
  const warm = reuse.plan(catalog, [item('c'), item('d')], provider);
  assert.equal(warm.requests.length, 0); assert.equal(warm.complete().metrics.cacheHits, 2);
});
test('reuse requires exact text, current state, objective, reply, model and full supplied references', () => {
  const reuse = new InterpretationReuse();
  const plan = reuse.plan(catalog, [item('a')], provider); plan.complete(response(plan));
  for (const changes of [
    { text: 'hello everyone!' }, { epoch: 'session-2' }, { policyRevision: 1 },
    { knowledge: { factIds: [], relationIds: [], revision: 1 } },
    { policy: { mode: 'strict_social', allowGentleHints: false } }, { objective: 'A different obstacle' },
    { reply: { id: 'parent', text: 'Parent context', disposition: 'allow' } },
    { helpRequest: { id: 'one-hint', remaining: 1, expiresAt: 12345 } },
  ]) assert.equal(reuse.plan(catalog, [item('b', changes)], provider).requests.length, 1);
  assert.equal(reuse.plan(catalog, [item('b')], { ...provider, model: 'other-model' }).requests.length, 1);
  assert.equal(reuse.plan(catalog, [item('b'), item('c', { text: 'Behind the Waterfall' })], provider).requests.length, 2);
});
test('entries expire without renewing on hits and remain bounded', () => {
  let now = 1000; const reuse = new InterpretationReuse({ clock: () => now, ttlMs: 100, maxEntries: 1 });
  let plan = reuse.plan(catalog, [item('a')], provider); plan.complete(response(plan));
  now += 99; assert.equal(reuse.plan(catalog, [item('b')], provider).requests.length, 0);
  now++; reuse.prune(); assert.equal(reuse.entries.size, 0); assert.equal(reuse.plan(catalog, [item('c')], provider).requests.length, 1);
  plan = reuse.plan(catalog, [item('d'), item('e', { text: 'Hi there!' })], provider); plan.complete(response(plan));
  assert.equal(reuse.entries.size, 1); reuse.clear(); assert.equal(reuse.entries.size, 0);
});
test('uncertainty, review-only claims and malformed batches are never retained', () => {
  for (const changes of [{ uncertain: true }, { relevance: 'current_game', intents: ['knowledge_claim'] }]) {
    const reuse = new InterpretationReuse(); const plan = reuse.plan(catalog, [item('a')], provider);
    plan.complete({ results: new Map([['a', result('a', changes)]]) });
    assert.equal(reuse.plan(catalog, [item('b')], provider).requests.length, 1);
  }
  const reuse = new InterpretationReuse(); const plan = reuse.plan(catalog, [item('a'), item('b', { text: 'A different message' })], provider);
  assert.throws(() => plan.complete({ results: new Map([['a', result('a')], ['b', result('wrong-id')]]) }));
  assert.equal(reuse.entries.size, 0);
});
