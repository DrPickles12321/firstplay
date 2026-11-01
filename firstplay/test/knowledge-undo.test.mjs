import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCatalog } from '../ml/catalog.mjs';
import { ScreeningEngine } from '../runtime/engine.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
const catalog = await GameCatalog.load('subnautica'), actor = { id: 'test-owner', role: 'owner' };
function setup(t) { const store = new EncryptedStore(), engine = new ScreeningEngine({ catalog, store, provider: { name: 'test-only' } }); t.after(() => { engine.close(); store.close(); }); return { engine, store }; }

test('undoing an event removes only its new grants, preserves prior knowledge and clears reader approvals', t => {
  const { engine } = setup(t); engine.confirmDiscovery({ id: 'sn1.fish.visible', actor }); engine.confirmDiscovery({ eventId: 'sn1.event.boomerang_inventory', actor, evidence: 'Synthetic evidence fixture.' });
  const operation = engine.ledger.history()[0], epoch = engine.epoch; assert.equal(operation.changes.length, 4); assert.equal(operation.canUndo, true);
  engine.undoDiscovery({ operationId: operation.id, expectedRevision: engine.ledger.state.revision, actor });
  assert.deepEqual(engine.ledger.state.factIds, ['sn1.fish.visible']); assert.deepEqual(engine.ledger.state.relationIds, []); assert.notEqual(engine.epoch, epoch); assert.equal(engine.ledger.history()[0].kind, 'undo'); assert.equal(engine.ledger.history()[0].canUndo, false);
});

test('later knowledge changes and duplicate undo requests refuse stale inversions', t => {
  const { engine } = setup(t); engine.confirmDiscovery({ id: 'sn1.fish.visible', actor }); const first = engine.ledger.history()[0]; engine.confirmDiscovery({ id: 'sn1.ocean.visible', actor });
  assert.throws(() => engine.undoDiscovery({ operationId: first.id, expectedRevision: first.toRevision, actor }), /latest unchanged/);
  const current = engine.ledger.history()[0]; engine.undoDiscovery({ operationId: current.id, expectedRevision: current.toRevision, actor });
  assert.throws(() => engine.undoDiscovery({ operationId: current.id, expectedRevision: current.toRevision, actor }), /latest unchanged/);
  assert.throws(() => engine.undoDiscovery({ operationId: first.id, expectedRevision: engine.ledger.state.revision, actor: { id: 'viewer', role: 'viewer' } }));
});

test('failed undo storage rolls back both knowledge and history; history never reaches the protected reader', t => {
  const { engine, store } = setup(t); engine.confirmDiscovery({ id: 'sn1.fish.visible', actor, evidence: 'PRIVATE EVIDENCE SENTINEL' }); const before = engine.ledger.snapshot(), history = engine.ledger.history();
  const original = store.set; t.mock.method(store, 'set', function(namespace, ...args) { if (namespace === 'knowledge-operations') throw new Error('Injected write failure'); return original.call(this, namespace, ...args); });
  assert.throws(() => engine.undoDiscovery({ operationId: history[0].id, expectedRevision: before.revision, actor }), /write failure/); assert.deepEqual(engine.ledger.snapshot(), before); assert.deepEqual(engine.ledger.history(), history);
  assert(!JSON.stringify(engine.safeFeed()).includes('PRIVATE EVIDENCE SENTINEL'));
});

test('new operation history survives restart; legacy audit entries remain read-only', t => {
  const { engine, store } = setup(t); engine.confirmDiscovery({ id: 'sn1.fish.visible', actor });
  const restarted = new ScreeningEngine({ catalog, store, provider: {} }); t.after(() => restarted.close()); assert.equal(restarted.ledger.history()[0].canUndo, true);
  const legacy = new EncryptedStore(); t.after(() => legacy.close()); legacy.set('state', 'knowledge', { revision: 1, factIds: ['sn1.fish.visible'], relationIds: [] }); legacy.set('knowledge-events', 'older', { id: 'older', factId: 'sn1.fish.visible', known: true, revision: 1, at: 1000 });
  const older = new ScreeningEngine({ catalog, store: legacy, provider: {} }); t.after(() => older.close()); assert.equal(older.ledger.history()[0].legacy, true); assert.equal(older.ledger.history()[0].canUndo, false);
});
