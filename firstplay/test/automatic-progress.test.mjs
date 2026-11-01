import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticProgress } from '../ml/automatic-progress.mjs';
import { detectSubnauticaLabels, subnauticaLabelDetector } from '../ml/local-text.mjs';
import { ProgressObserver } from '../ml/observer.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { ScreeningEngine } from '../runtime/engine.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { createApplication } from '../server.mjs';
const catalog = await GameCatalog.load('subnautica'), actor = { id: 'auto-test-owner', role: 'owner' };
const line = (text, x, y, confidence = 1) => ({ text, confidence, bounds: [x, y, .12, .03] });
const inventory = () => ({ width: 1280, height: 720, lines: [line('INVENTORY', .18, .15), line('STORAGE', .65, .15), line('Boomerang', .2, .34), line('FOOD: +8', .2, .39, .5), line('H₂O: -3', .2, .44, .5)] });
const image = 'data:image/png;base64,iVBOR0Zha2U=';
const fixture = t => {
 let now = 1000;
 const store = new EncryptedStore(); t.after(() => store.close()); const engine = new ScreeningEngine({ catalog, store, clock: () => now }); t.after(() => engine.close());
 let frames = [inventory(), inventory()];
 const detector = subnauticaLabelDetector({ recognizer: { async recognize() { return { frames, metrics: { provider: 'controlled-ocr' } }; } }, isKnown: id => engine.ledger.state.factIds.includes(id) });
 const observer = new ProgressObserver({ catalog, store, localDetector: detector, clock: () => now }); t.after(() => observer.close());
 let source = observer.beginSource('window', actor);
 return { store, engine, observer, setFrames(value) { frames = value; }, advance(ms = 3000) { now += ms; }, source(kind = 'window') { source = observer.beginSource(kind, actor); }, async check(times = [1, 2]) { await observer.observe([image, image], engine.epoch, undefined, { ...source, mediaTimes: times }); return observer.automaticProgress.process({ observer, engine, actor }); } };
};
test('four strong frames automatically establish only the item name and visible PDA screen, once', async t => {
 const f = fixture(t); assert.deepEqual(await f.check(), []); assert.equal(f.engine.ledger.state.factIds.length, 0);
 f.advance(); const result = await f.check([4, 5]); assert.equal(result.length, 2);
 assert.deepEqual(f.engine.ledger.state.factIds, ['sn1.boomerang.named', 'sn1.pda.visible']); assert.deepEqual(f.engine.ledger.state.relationIds, []);
 assert.equal(f.engine.ledger.history(1)[0].kind, 'automatic'); assert(f.engine.ledger.history(1)[0].canUndo);
 assert(f.observer.list().every(row => row.status === 'confirmed' && row.automatic && row.frames.length === 4 && row.frameHashes.length === 4 && row.verification.checks === 2));
 f.advance(); assert.deepEqual(await f.check([7, 8]), []); assert.equal(f.engine.ledger.state.revision, 1);
});
test('replayed pairs, weak intervening text and a replaced source cannot accumulate automatic permission', async t => {
 const f = fixture(t); await f.check(); f.advance(); assert.deepEqual(await f.check(), []);
 const weak = inventory(); weak.lines.forEach(row => { row.confidence = .85; }); f.setFrames([weak, weak]); f.advance(); assert.deepEqual(await f.check([4, 5]), []);
 f.setFrames([inventory(), inventory()]); f.advance(); assert.deepEqual(await f.check([7, 8]), []);
 f.source(); f.advance(); assert.deepEqual(await f.check([10, 11]), []); assert.equal(f.engine.ledger.state.factIds.length, 0);
});
test('synthetic sources and disabled automation remain review-only', async t => {
 const f = fixture(t); f.source('synthetic'); await f.check(); f.advance(); assert.deepEqual(await f.check([4, 5]), []);
 f.source(); f.observer.automaticProgress.configure(false, actor, f.engine); f.advance(); await f.check([7, 8]); f.advance(); assert.deepEqual(await f.check([10, 11]), []); assert.equal(f.engine.ledger.state.factIds.length, 0);
 assert.throws(() => f.observer.automaticProgress.configure(true, { id: 'viewer', role: 'viewer' }, f.engine), /authorized/);
});
test('undo corrections persist and cannot be immediately re-learned', async t => {
 const f = fixture(t); await f.check(); f.advance(); await f.check([4, 5]); const operation = f.engine.ledger.history(1)[0];
 f.engine.undoDiscovery({ operationId: operation.id, expectedRevision: f.engine.ledger.state.revision, actor }); f.observer.automaticProgress.block(operation.changes.map(row => row.id));
 f.observer.automaticProgress = new AutomaticProgress({ store: f.store }); f.advance(); await f.check([7, 8]); f.advance(); assert.deepEqual(await f.check([10, 11]), []); assert.equal(f.engine.ledger.state.factIds.length, 0);
});
test('a failed durable knowledge write cannot produce an automatic grant or receipt', async t => {
 const f = fixture(t); await f.check(); f.advance(); const original = f.store.set.bind(f.store);
 f.store.set = (namespace, ...args) => { if (namespace === 'knowledge-operations') throw new Error('disk write failed'); return original(namespace, ...args); };
 await assert.rejects(f.check([4, 5]), /disk write/); assert.equal(f.engine.ledger.state.factIds.length, 0); assert.equal(f.store.get('state', 'knowledge'), null); assert(f.observer.list().every(row => row.automatic === false));
});
test('blueprint names establish names without unlocking recipes, possession or fragment completion', () => {
 const frame = { lines: [line('BLUEPRINTS', .18, .12), line('Scanner', .3, .3), line('Repair Tool', .3, .4), line('Seaglide', .3, .5)] };
 const ids = detectSubnauticaLabels([frame, frame]).map(row => row.definition.factId);
 assert.deepEqual(ids, ['sn1.scanner.named', 'sn1.repair_tool.named', 'sn1.seaglide.name_visible']);
 const chat = { lines: frame.lines.map(row => ({ ...row, text: 'viewer: ' + row.text })) }; assert.deepEqual(detectSubnauticaLabels([chat, chat]), []);
 const bare = { lines: frame.lines.slice(1) }; assert.deepEqual(detectSubnauticaLabels([bare, bare]), []);
});
test('world target labels require a central target, nearby interaction prompt and oxygen HUD', () => {
 const frame = { lines: [line('Writhing Weed', .45, .45), line('Pick up', .45, .5), line('O₂ 45', .1, .8)] };
 assert.equal(detectSubnauticaLabels([frame, frame])[0].definition.factId, 'sn1.writhing_weed.named');
 assert.deepEqual(detectSubnauticaLabels([{ lines: frame.lines.slice(0, 2) }, frame]), []);
 const offCenter = structuredClone(frame); offCenter.lines[0].bounds[0] = .1; assert.deepEqual(detectSubnauticaLabels([offCenter, offCenter]), []);
 const ingredient = { lines: [line('BLUEPRINTS', .18, .12), line('Flare', .45, .3), line('Cave Sulfur', .45, .4)] };
 assert.deepEqual(detectSubnauticaLabels([ingredient, ingredient]).map(row => row.definition.factId), ['sn1.cave_sulfur.named']);
});
test('HTTP auto confirmation ignores client-supplied proof, preserves corrections, and guards preferences by run/role', async t => {
 const enabled = new GameCatalog(structuredClone(catalog.pack), undefined, undefined, { ...catalog.definition, localObservationEnabled: true });
 const app = await createApplication({ catalog: enabled, provider: { name: 'unused', run() { throw new Error('No external inference'); } }, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: true } }); const base = await app.start(); t.after(() => app.close());
 const detector = subnauticaLabelDetector({ recognizer: { async recognize() { return { frames: [inventory(), inventory()], metrics: { provider: 'controlled-ocr' } }; } } }); t.mock.method(app.observer.localDetector, 'run', detector.run.bind(detector));
 const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' };
 const request = async (path, value, extra = {}) => fetch(base + path, { method: value ? 'POST' : 'GET', headers: { ...headers, ...extra }, body: value ? JSON.stringify(value) : undefined });
 const login = await request('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
 const control = await (await request('/api/control')).json(), expectedRunId = control.session.runId;
 assert.equal((await request('/api/observations/preferences', { automatic: true, expectedRunId: 'old-run' })).status, 409);
 assert.equal((await request('/api/observations/preferences', { automatic: true, expectedRunId }, { Authorization: 'Bearer ' + control.links.reader })).status, 403);
 const { source } = await (await request('/api/observations/source', { kind: 'recording', expectedRunId })).json();
 const data = { frames: [image, image], expectedRunId, automatic: true, strict: true, source: { ...source, mediaTimes: [1, 2] } };
 assert.deepEqual((await (await request('/api/observe', data)).json()).autoConfirmed, []);
 const next = await (await request('/api/observe', { ...data, source: { ...source, mediaTimes: [4, 5] } })).json(); assert.equal(next.autoConfirmed.length, 2);
 const operation = app.engine.ledger.history(1)[0]; assert.equal((await request('/api/discovery/undo', { operationId: operation.id, knowledgeRevision: app.engine.ledger.state.revision, expectedRunId })).status, 200);
 for (const times of [[7, 8], [10, 11]]) assert.deepEqual((await (await request('/api/observe', { ...data, source: { ...source, mediaTimes: times } })).json()).autoConfirmed, []);
 assert.equal(app.engine.ledger.state.factIds.length, 0);
});

test('long observation gaps and failed checks reset consecutive automatic evidence', async t => {
 const f = fixture(t); await f.check(); f.advance(13_000); assert.deepEqual(await f.check([14, 15]), []);
 f.advance(); const run = f.observer.localDetector.run; f.observer.localDetector.run = async () => { throw new Error('OCR interrupted'); };
 await assert.rejects(f.check([17, 18]), /interrupted/); f.observer.localDetector.run = run;
 f.advance(); assert.deepEqual(await f.check([20, 21]), []); assert.equal(f.engine.ledger.state.factIds.length, 0);
});
