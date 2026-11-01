import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBoomerangName, subnauticaLabelDetector, NativeTextRecognizer } from '../ml/local-text.mjs';
import { ProgressObserver } from '../ml/observer.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { ScreeningEngine } from '../runtime/engine.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { createApplication } from '../server.mjs';

const catalog = await GameCatalog.load('subnautica'), owner = { role: 'owner', id: 'synthetic-test-operator' };
const line = (text, y, confidence = 1, x = .18) => ({ text, confidence, bounds: [x, y, .12, .03] });
const frame = () => ({ width: 1280, height: 720, lines: [line('INVENTORY', .15), line('Boomerang', .34), line('FOOD: +8', .39), line('H20: -3', .44, .5)] });
const fakeFrame = suffix => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(suffix)]).toString('base64')}`;
const recognizer = frames => ({ name: 'controlled-ocr', async recognize() { return { frames, metrics: { provider: 'controlled-ocr', local: true, latencyMs: 1 } }; } });

test('consistent inventory name plus tooltip context recognizes only the Boomerang name', async () => {
  const result = detectBoomerangName([frame(), frame()]); assert.equal(result.found, true); assert.equal(result.evidence.length, 2);
  const numericContext = frame(); numericContext.lines[2].confidence = .3; numericContext.lines[3].confidence = .3; assert.equal(detectBoomerangName([numericContext, numericContext]).found, true, 'Ambiguous numeric tooltip context must not weaken the separate item-name confidence requirement.');
  const detector = subnauticaLabelDetector({ recognizer: recognizer([frame(), frame()]) }); const response = await detector.run({ imagePaths: [], signal: undefined });
  assert.equal(response.value.events.length, 1); assert.equal(detector.factId, 'sn1.boomerang.named'); assert.deepEqual(response.value.events[0].positive_frame_indices, [0, 1]);
});

test('chat text, missing context, low-confidence names, changed items and moving labels stay unconfirmed', () => {
  const missingHeader = frame(); missingHeader.lines[0].text = 'viewer: INVENTORY';
  const chat = frame(); chat.lines[1].text = 'viewer: Boomerang';
  const wrong = frame(); wrong.lines[1].text = 'Peeper';
  const weak = frame(); weak.lines[1].confidence = .5;
  const missingProperties = frame(); missingProperties.lines = missingProperties.lines.slice(0, 2);
  const distantProperties = frame(); distantProperties.lines[2].bounds[0] = .8;
  const moved = frame(); moved.lines.forEach(row => { row.bounds[0] += .18; });
  for (const other of [missingHeader, chat, wrong, weak, missingProperties, distantProperties, moved]) assert.equal(detectBoomerangName([frame(), other]).found, false);
});

test('the local observer never invokes external image inference and confirms a single allowlisted fact', async t => {
  const store = new EncryptedStore(); t.after(() => store.close()); let remoteCalls = 0;
  const engine = new ScreeningEngine({ catalog, store }); t.after(() => engine.close());
  const localDetector = subnauticaLabelDetector({ recognizer: recognizer([frame(), frame()]), isKnown: id => engine.ledger.state.factIds.includes(id) });
  const observer = new ProgressObserver({ catalog, store, localDetector, provider: { run() { remoteCalls++; throw new Error('External images forbidden.'); } } }); t.after(() => observer.close());
  const source = observer.beginSource('recording', owner), evidence = { ...source, mediaTimes: [1, 2] };
  const [candidate] = await observer.observe([fakeFrame('a'), fakeFrame('b')], engine.epoch, undefined, evidence);
  assert.equal(candidate.automatic, false); assert.equal(candidate.mode, 'local-labels'); assert.equal(engine.ledger.state.factIds.length, 0);
  assert.deepEqual(await observer.observe([fakeFrame('c'), fakeFrame('d')], engine.epoch, undefined, evidence), [], 'Repeated evidence must not create another pending suggestion.');
  assert.throws(() => observer.confirm(candidate.id, engine, { id: 'viewer', role: 'viewer' }), /authorized/);
  observer.confirm(candidate.id, engine, owner); assert.deepEqual(engine.ledger.state.factIds, ['sn1.boomerang.named']); assert.deepEqual(engine.ledger.state.relationIds, []);
  assert.deepEqual(await observer.observe([fakeFrame('e'), fakeFrame('f')], engine.epoch, undefined, evidence), []); assert.equal(remoteCalls, 0);
});

test('local OCR cancellation discards a late result after the source changes', async t => {
  let finish, aborted = false;
  const localDetector = subnauticaLabelDetector({ recognizer: { recognize: async (_, { signal }) => new Promise(resolve => { signal.addEventListener('abort', () => { aborted = true; }); finish = () => resolve({ frames: [frame(), frame()], metrics: { provider: 'controlled-ocr' } }); }) } });
  const observer = new ProgressObserver({ catalog, localDetector }); t.after(() => observer.close()); const source = observer.beginSource('window', owner);
  const pending = observer.observe([fakeFrame('a'), fakeFrame('b')], 'epoch', undefined, { ...source, mediaTimes: [1, 2] });
  while (!finish) await new Promise(resolve => setImmediate(resolve)); observer.invalidateSource(source.id, source.generation, owner); finish();
  await assert.rejects(pending, /ended|changed/); assert.equal(aborted, true); assert.equal(observer.list().length, 0);
});

test('a static local tooltip can be read twice when the source clock advances', async t => {
  const observer = new ProgressObserver({ catalog, localDetector: subnauticaLabelDetector({ recognizer: recognizer([frame(), frame()]) }) }); t.after(() => observer.close());
  const source = observer.beginSource('window', owner), image = fakeFrame('stationary-tooltip');
  const candidates = await observer.observe([image, image], 'epoch', undefined, { ...source, mediaTimes: [10, 11] }); assert.equal(candidates.length, 1);
  await assert.rejects(observer.observe([image, image], 'epoch', undefined, { ...source, mediaTimes: [11, 11] }), /changed|seek/);
});

test('dismissed local suggestions cool down instead of immediately returning every check', async t => {
  let now = 1000; const store = new EncryptedStore(); t.after(() => store.close()); const engine = new ScreeningEngine({ catalog, store, clock: () => now }); t.after(() => engine.close());
  const observer = new ProgressObserver({ catalog, clock: () => now, localDetector: subnauticaLabelDetector({ recognizer: recognizer([frame(), frame()]) }) }); t.after(() => observer.close());
  const source = observer.beginSource('window', owner), images = [fakeFrame('a'), fakeFrame('b')], evidence = { ...source, mediaTimes: [1, 2] };
  const [candidate] = await observer.observe(images, engine.epoch, undefined, evidence); observer.dismiss(candidate.id, engine, owner);
  assert.deepEqual(await observer.observe(images, engine.epoch, undefined, evidence), []); now += 30_001; assert.equal((await observer.observe(images, engine.epoch, undefined, evidence)).length, 1); assert.equal(engine.ledger.state.factIds.length, 0);
});

test('unsupported native platforms report the limitation without attempting compilation', async () => {
  await assert.rejects(new NativeTextRecognizer({ platform: 'linux' }).prepare(), /requires macOS/);
});

test('HTTP local recognition is operator/run/source guarded and keeps image evidence out of the reader', async t => {
  const enabledCatalog = new GameCatalog(structuredClone(catalog.pack), undefined, undefined, { ...catalog.definition, localObservationEnabled: true });
  const app = await createApplication({ catalog: enabledCatalog, provider: { name: 'text-test-only', run() { throw new Error('No external image inference.'); } }, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: true } });
  const base = await app.start(); t.after(() => app.close());
  const original = subnauticaLabelDetector({ recognizer: recognizer([frame(), frame()]) }); t.mock.method(app.observer.localDetector, 'run', original.run.bind(original));
  const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' }, post = (path, body, extra = {}) => fetch(base + path, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  const login = await post('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0]; const control = await (await fetch(base + '/api/control', { headers })).json(), expectedRunId = control.session.runId;
  assert.equal((await post('/api/observations/source', { kind: 'window', expectedRunId }, { Authorization: `Bearer ${control.links.reader}` })).status, 403);
  const { source } = await (await post('/api/observations/source', { kind: 'window', expectedRunId })).json(), data = { expectedRunId, source: { ...source, mediaTimes: [1, 2] }, frames: [fakeFrame('a'), fakeFrame('b')] };
  assert.equal((await post('/api/observe', { ...data, expectedRunId: 'stale' })).status, 409);
  const observed = await post('/api/observe', data); assert.equal(observed.status, 200); const [candidate] = (await observed.json()).candidates;
  assert.equal(app.engine.ledger.state.factIds.length, 0); assert.equal((await post('/api/observations/confirm', { expectedRunId, id: candidate.id })).status, 200);
  assert.deepEqual(app.engine.ledger.state.factIds, ['sn1.boomerang.named']); assert.deepEqual(app.engine.ledger.state.relationIds, []);
  const reader = await (await fetch(base + '/api/reader', { headers: { Authorization: `Bearer ${control.links.reader}` } })).json(); assert(!JSON.stringify(reader).includes('data:image')); assert(!JSON.stringify(reader).includes('evidenceLabels'));
});
