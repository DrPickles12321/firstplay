import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCatalog } from '../ml/catalog.mjs';
import { ProgressObserver } from '../ml/observer.mjs';
import { EncryptedStore } from '../runtime/store.mjs';

const catalog = await GameCatalog.load();
const fakeFrame = suffix => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(suffix)]).toString('base64')}`;

test('invalid and duplicate evidence never invokes inference', async () => {
  let calls = 0;
  const observer = new ProgressObserver({ catalog, provider: { run: async () => { calls++; return { value: { events: [] } }; } } });
  await assert.rejects(observer.observe(['not-an-image', 'not-an-image'], 'session'));
  await assert.rejects(observer.observe([fakeFrame('a'), fakeFrame('a')], 'session'));
  assert.equal(calls, 0);
});
test('structured positive detections stay candidates; only authorized confirmation can update a current session', async () => {
  const observer = new ProgressObserver({ catalog, provider: { run: async () => ({ value: { events: [{ event_id: 'confirm_frog_capture', positive_frame_indices: [0, 1], uncertain: false, explanation: 'Controlled captured form.' }] }, metrics: { provider: 'test-only' } }) } });
  const candidates = await observer.observe([fakeFrame('a'), fakeFrame('b')], 'session');
  assert.equal(candidates[0].automatic, false); assert.equal(candidates[0].status, 'awaiting_confirmation');
  let confirmations = 0;
  const engine = { epoch: 'different-session', confirmDiscovery: () => { confirmations++; } };
  assert.throws(() => observer.confirm(candidates[0].id, engine, { role: 'owner', id: 'owner' }));
  assert.equal(confirmations, 0);
  // This verifies state plumbing with synthetic bytes, not actual image recognition.
});

test('closing an observer discards a late model response', async () => {
  let finish;
  const observer = new ProgressObserver({ catalog, provider: { run: async () => new Promise(resolve => { finish = () => resolve({ value: { events: [{ event_id: 'confirm_frog_capture', positive_frame_indices: [0, 1], uncertain: false, explanation: 'Late response.' }] } }); }) } });
  const pending = observer.observe([fakeFrame('a'), fakeFrame('b')], 'old-session');
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  observer.close(); finish(); await assert.rejects(pending, /session has ended/); assert.deepEqual(observer.list(), []);
});

const owner = { id: 'owner', role: 'owner' };
test('concurrent checks cannot race through temporary-directory creation', async () => {
  let finish, calls = 0;
  const observer = new ProgressObserver({ catalog, provider: { run: async () => { calls++; return new Promise(resolve => { finish = () => resolve({ value: { events: [] } }); }); } } });
  const pending = observer.observe([fakeFrame('a'), fakeFrame('b')], 'session');
  await assert.rejects(observer.observe([fakeFrame('c'), fakeFrame('d')], 'session'), /already running/);
  while (!finish) await new Promise(resolve => setImmediate(resolve)); finish(); await pending; assert.equal(calls, 1);
});

test('seeking aborts a pending source check and discards a late positive result', async () => {
  let finish, aborted = false;
  const observer = new ProgressObserver({ catalog, provider: { run: async ({ signal }) => new Promise(resolve => { signal.addEventListener('abort', () => { aborted = true; }); finish = () => resolve({ value: { events: [{ event_id: 'confirm_frog_capture', positive_frame_indices: [0, 1], uncertain: false, explanation: 'Synthetic late positive.' }] } }); }) } });
  const source = observer.beginSource('recording', owner), pending = observer.observe([fakeFrame('a'), fakeFrame('b')], 'session', undefined, { ...source, mediaTimes: [10, 11] });
  while (!finish) await new Promise(resolve => setImmediate(resolve)); const current = observer.invalidateSource(source.id, source.generation, owner); finish();
  await assert.rejects(pending, /ended|changed/); assert.equal(aborted, true); assert.equal(current.generation, 1); assert.deepEqual(observer.list(), []);
});

test('backward, widely separated and stale-source frames cannot reach inference', async () => {
  let calls = 0; const observer = new ProgressObserver({ catalog, provider: { run: async () => { calls++; return { value: { events: [] } }; } } });
  const source = observer.beginSource('recording', owner);
  for (const input of [{ ...source, mediaTimes: [11, 10] }, { ...source, mediaTimes: [0, 30] }, { ...source, generation: 9, mediaTimes: [0, 1] }]) await assert.rejects(observer.observe([fakeFrame('a'), fakeFrame('b')], 's', undefined, input), /changed|seek/);
  assert.equal(calls, 0); assert.throws(() => observer.beginSource('window', { id: 'viewer', role: 'viewer' }));
});

test('dismissing a suggestion is operator-only and never confirms a discovery', async () => {
  const observer = new ProgressObserver({ catalog, provider: { run: async () => ({ value: { events: [{ event_id: 'confirm_frog_capture', positive_frame_indices: [0, 1], uncertain: false, explanation: 'Synthetic fixture.' }] } }) } });
  const [candidate] = await observer.observe([fakeFrame('a'), fakeFrame('b')], 's'); let grants = 0;
  const engine = { epoch: 's', ledger: { assertOperator: actor => { if (actor.role !== 'owner') throw new Error('Not an operator'); } }, confirmDiscovery: () => { grants++; } };
  assert.throws(() => observer.dismiss(candidate.id, engine, { id: 'viewer', role: 'viewer' })); observer.dismiss(candidate.id, engine, owner); assert.equal(grants, 0); assert.deepEqual(observer.list(), []);
});

test('video model checks have a bounded request rate and recover after the window expires', async () => {
  let now = 1000, calls = 0; const observer = new ProgressObserver({ catalog, clock: () => now, provider: { run: async () => { calls++; return { value: { events: [] } }; } } });
  for (let i = 0; i < 4; i++) await observer.observe([fakeFrame('a'), fakeFrame('b')], 's');
  await assert.rejects(observer.observe([fakeFrame('a'), fakeFrame('b')], 's'), /limit/); assert.equal(calls, 4);
  now += 60_001; await observer.observe([fakeFrame('a'), fakeFrame('b')], 's'); assert.equal(calls, 5);
});

test('ending a source clears its suggestions; old-policy suggestions are removed on refresh', async () => {
  const provider = { run: async () => ({ value: { events: [{ event_id: 'confirm_frog_capture', positive_frame_indices: [0, 1], uncertain: false, explanation: 'Synthetic fixture.' }] } }) };
  const observer = new ProgressObserver({ catalog, provider }), source = observer.beginSource('window', owner);
  await observer.observe([fakeFrame('a'), fakeFrame('b')], 's', undefined, { ...source, mediaTimes: [1, 2] }); assert.equal(observer.list().length, 1);
  observer.invalidateSource(source.id, source.generation, owner, true); assert.equal(observer.source, null); assert.equal(observer.list().length, 0);
  await observer.observe([fakeFrame('a'), fakeFrame('b')], 'old'); assert.equal(observer.list('new').length, 0);
});

test('a malformed later event invalidates the entire observation batch and creates no partial suggestions', async () => {
  const observer = new ProgressObserver({ catalog, provider: { run: async () => ({ value: { events: [{ event_id: 'confirm_frog_capture', positive_frame_indices: [0, 1], uncertain: false, explanation: 'Synthetic positive.' }, { event_id: 'not-a-supported-event', positive_frame_indices: [0, 1], uncertain: false, explanation: 'Invalid later event.' }] } }) } });
  await assert.rejects(observer.observe([fakeFrame('a'), fakeFrame('b')], 's'), /Invalid observation/); assert.deepEqual(observer.list(), []);
});

test('uncertain results without any cited frame do not create review noise', async () => {
  const observer = new ProgressObserver({ catalog, provider: { run: async () => ({ value: { events: [{ event_id: 'confirm_frog_capture', positive_frame_indices: [], uncertain: true, explanation: 'No positive evidence.' }] } }) } });
  assert.deepEqual(await observer.observe([fakeFrame('a'), fakeFrame('b')], 's'), []); assert.equal(observer.status().lastCheck.candidates, 0);
});

test('candidate persistence failure rolls back the whole batch and publishes no partial suggestions', async t => {
  const store = new EncryptedStore(); t.after(() => store.close()); let writes = 0;
  const observer = new ProgressObserver({ catalog, store, provider: { run: async () => ({ value: { events: observer.allowedEvents.slice(0, 2).map(event => ({ event_id: event.id, positive_frame_indices: [0, 1], uncertain: false, explanation: 'Synthetic persistence fixture.' })) } }) } });
  const original = store.set; t.mock.method(store, 'set', function(namespace, ...args) { if (namespace === 'observations' && ++writes === 2) throw new Error('Injected observation storage failure'); return original.call(this, namespace, ...args); });
  await assert.rejects(observer.observe([fakeFrame('a'), fakeFrame('b')], 's'), /storage failure/); assert.deepEqual(observer.list(), []); assert.equal(store.list('observations').length, 0);
});
