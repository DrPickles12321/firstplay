import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCatalog } from '../ml/catalog.mjs';
import { validateClassifications } from '../ml/contracts.mjs';
import { enforcePolicy } from '../ml/policy.mjs';
import { CodexProvider, OpenAIProvider, codexArguments } from '../ml/providers.mjs';
import { buildClassificationInput } from '../ml/prompt.mjs';

const catalog = await GameCatalog.load();
export const interpretation = (id, overrides = {}) => ({ message_id: id, relevance: 'none', intents: ['social'], references: [], unknown_information: false, unresolved_reference: false, uncertain: false, recommended_disposition: 'allow', reason: 'Ordinary conversation.', ...overrides });
export const snapshot = (factIds = [], relationIds = [], policy = { mode: 'discovery', allowGentleHints: false }) => ({ knowledge: { factIds, relationIds, revision: 0 }, policy, objective: '' });

test('all 836 Moon objectives and all Cascade coin groups participate in retrieval, without marking them known', () => {
  assert.equal([...catalog.references.values()].filter(reference => reference.type === 'moon').length, 836);
  assert.equal([...catalog.references.values()].filter(reference => reference.type === 'regional_coins').reduce((sum, reference) => sum + reference.quantity, 0), 50);
  assert.equal(catalog.retrieve('Behind the Waterfall')[0].reference.name, 'Behind the Waterfall');
});
test('a body with a generic alias is never automatically approved or rejected by retrieval', () => {
  const context = buildClassificationInput(catalog, [{ id: 'a', text: 'Taking my dog for a walk.', ...snapshot() }]);
  assert.equal(context.messages[0].text, 'Taking my dog for a walk.');
  assert.equal(context.messages[0].confirmed_knowledge.fact_ids.length, 0);
  assert.ok(context.game_context.references.some(ref => ref.id === 'frog.capture'));
  assert.equal('display_name' in context.messages[0], false);
});
test('unknown IDs, duplicate IDs, invalid enums and omitted results cannot be approvals', () => {
  const known = new Set(catalog.references.keys());
  assert.throws(() => validateClassifications({ results: [] }, ['a'], known));
  assert.throws(() => validateClassifications({ results: [interpretation('b')] }, ['a'], known));
  assert.throws(() => validateClassifications({ results: [interpretation('a'), interpretation('a')] }, ['a', 'b'], known));
  assert.throws(() => validateClassifications({ results: [interpretation('a', { references: [{ id: 'invented', usage: 'mention' }] })] }, ['a'], known));
  assert.throws(() => validateClassifications({ results: [interpretation('a', { uncertain: 'false' })] }, ['a'], known));
});
test('the same disclosure is blocked when unknown and eligible when confirmed', () => {
  const result = interpretation('a', { relevance: 'current_game', intents: ['recall'], references: [{ id: 'frog.capture', usage: 'disclosure' }] });
  assert.equal(enforcePolicy(result, snapshot(), catalog).disposition, 'reject');
  assert.equal(enforcePolicy(result, snapshot(['frog.capture']), catalog).disposition, 'allow');
});
test('seeing an entity, knowing components and visiting a kingdom do not imply mechanics or solutions', () => {
  const capture = interpretation('a', { relevance: 'current_game', intents: ['recall'], references: [{ id: 'rex.capture', usage: 'disclosure' }] });
  assert.equal(enforcePolicy(capture, snapshot(['rex.seen']), catalog).disposition, 'reject');
  const connection = interpretation('a', { relevance: 'current_game', intents: ['recall'], references: [{ id: 'solution.optional_chomp_moon', usage: 'disclosure' }] });
  assert.equal(enforcePolicy(connection, snapshot(['chomp.break_rocks', 'cascade.moon_03.location']), catalog).disposition, 'reject');
});
test('known instructions remain prohibited; strict mode rejects harmless game discussion', () => {
  const result = interpretation('a', { relevance: 'current_game', intents: ['directive'], references: [{ id: 'frog.capture', usage: 'mention' }] });
  assert.equal(enforcePolicy(result, snapshot(['frog.capture']), catalog).disposition, 'reject');
  assert.equal(enforcePolicy(interpretation('a', { relevance: 'current_game', intents: ['reaction'] }), snapshot([], [], { mode: 'strict_social', allowGentleHints: false }), catalog).disposition, 'reject');
});
test('gentle guidance permission does not authorize exact discoveries', () => {
  const hint = interpretation('a', { relevance: 'current_game', intents: ['search_hint'] });
  assert.equal(enforcePolicy(hint, snapshot(), catalog).disposition, 'reject');
  const gentle = snapshot([], [], { mode: 'discovery', allowGentleHints: true });
  assert.equal(enforcePolicy(hint, gentle, catalog).disposition, 'allow');
  assert.equal(enforcePolicy({ ...hint, intents: ['exact_solution'] }, gentle, catalog).disposition, 'reject');
});
test('claims, contradictions and semantic uncertainty remain hidden', () => {
  assert.equal(enforcePolicy(interpretation('a', { relevance: 'current_game', intents: ['knowledge_claim'] }), snapshot(), catalog).disposition, 'review');
  assert.equal(enforcePolicy(interpretation('a', { unknown_information: true }), snapshot(), catalog).disposition, 'review');
  assert.equal(enforcePolicy(interpretation('a', { uncertain: true }), snapshot(), catalog).disposition, 'review');
});

test('recognized prohibited hints do not fill review merely because their target is unresolved', () => {
  const hint = interpretation('a', { relevance: 'current_game', intents: ['search_hint'], unresolved_reference: true, uncertain: true, recommended_disposition: 'reject' });
  assert.equal(enforcePolicy(hint, snapshot(), catalog).disposition, 'reject');
  assert.equal(enforcePolicy(hint, snapshot([], [], { mode: 'discovery', allowGentleHints: true }), catalog).disposition, 'review');
});
test('another game has no implied discovery ledger, while general preferences remain eligible', () => {
  assert.equal(enforcePolicy(interpretation('a', { relevance: 'other_game', intents: ['recall', 'reaction'] }), snapshot(), catalog).disposition, 'review');
  assert.equal(enforcePolicy(interpretation('a', { relevance: 'other_game', intents: ['social'] }), snapshot(), catalog).disposition, 'allow');
});
test('Codex runs through argument arrays, isolated config, read-only sandbox and disabled tools', () => {
  const args = codexArguments({ directory: '/tmp/isolated', schemaPath: '/tmp/schema', outputPath: '/tmp/output', instructionsPath: '/tmp/instructions' });
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('read-only'));
  assert.ok(args.includes('shell_tool'));
  assert.ok(args.includes('apps'));
  assert.equal(args.at(-1), '-');
  assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
});
test('API transport failures, refusals and partial responses are not interpreted as safe', async () => {
  const items = [{ id: 'a', text: 'Hello', ...snapshot() }];
  for (const body of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }]) {
    const provider = new OpenAIProvider({ apiKey: 'test-only', model: 'test-only', fetchImpl: async () => ({ ok: true, json: async () => body }) });
    await assert.rejects(provider.classify(catalog, items));
  }
  await assert.rejects(new OpenAIProvider({ apiKey: '', model: '' }).classify(catalog, items), { code: 'provider_not_configured' });
});

test('both providers hide semantic source IDs and restore reversed results to the correct messages', async t => {
  for (const Provider of [CodexProvider, OpenAIProvider]) {
    const provider = new Provider(), items = [{ id: 'expected-allow-label-leak', text: 'Hello everyone', ...snapshot(), reply: { id: 'spoiler-parent-label-leak', disposition: 'allow', text: 'Earlier greeting' } }, { id: 'expected-reject-label-leak', text: 'Another message', ...snapshot() }];
    t.mock.method(provider, 'run', async ({ input }) => {
      assert(!JSON.stringify(input).includes('label-leak')); assert.equal(input.messages.length, 2); assert.notEqual(input.messages[0].message_id, input.messages[1].message_id);
      return { value: { results: [...input.messages].reverse().map(message => interpretation(message.message_id, { reason: message.text })) }, metrics: {} };
    });
    const result = await provider.classify(catalog, items);
    assert.equal(result.results.get(items[0].id).message_id, items[0].id); assert.equal(result.results.get(items[0].id).reason, 'Hello everyone'); assert.equal(result.results.get(items[1].id).reason, 'Another message'); assert.equal(result.metrics.inputProtocol, 'anonymous-message-ids-v1');
  }
});

test('a provider cannot accept results that quote original IDs instead of its anonymous batch IDs', async t => {
  const provider = new CodexProvider(); t.mock.method(provider, 'run', async () => ({ value: { results: [interpretation('source-expected-allow')] }, metrics: {} }));
  await assert.rejects(provider.classify(catalog, [{ id: 'source-expected-allow', text: 'Hello', ...snapshot() }]), /invalid|mismatched/);
});
test('Moon identity aliases connect catalog and opening-pack entries without revealing their solutions', () => {
  const known = catalog.knownIds({ factIds: ['smo.moon.cascade.004'], relationIds: [] });
  assert.ok(known.has('cascade.moon_04.collected'));
  assert.ok(!known.has('cascade.moon_04.location'));
  assert.ok(!known.has('solution.waterfall_secret'));
});
test('the policy and reference engine can run an unrelated pack without Mario-specific branches', () => {
  const other = new GameCatalog({ id: 'fixture.puzzle', version: '1', game: 'Independent test fixture', scope: {}, facts: [{ id: 'key.seen', kind: 'entity', statement: 'A key is visible.', aliases: ['key'] }], relations: [{ id: 'door.solution', meaning: 'The key opens the door.', fact_ids: ['key.seen'] }], events: [] });
  assert.ok(other.retrieve('key').some(hit => hit.reference.id === 'key.seen'));
  const disclosure = interpretation('a', { relevance: 'current_game', intents: ['recall'], references: [{ id: 'door.solution', usage: 'disclosure' }] });
  assert.equal(enforcePolicy(disclosure, snapshot(['key.seen']), other).disposition, 'reject');
});
