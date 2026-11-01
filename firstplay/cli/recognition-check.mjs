import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { NativeTextRecognizer, runLocalProcess } from '../ml/local-text.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { createApplication } from '../server.mjs';
import { createProvider } from '../ml/providers.mjs';

const { values } = parseArgs({ options: { 'with-text': { type: 'boolean', default: false } } });
let app, lastFixture;
try {
  const recognizer = new NativeTextRecognizer(), binary = await recognizer.prepare(), directory = resolve('artifacts/firstplay-ocr-fixtures');
  await runLocalProcess(binary, ['--fixtures', directory]);
  const provider = values['with-text'] ? createProvider() : { name: 'not-used', run() { throw new Error('External image inference is forbidden in this check.'); }, classify() { throw new Error('Text inference is not enabled.'); } };
  app = await createApplication({ catalog: await GameCatalog.load('subnautica'), provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: true } });
  const base = await app.start(), headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' };
  const request = async (path, data) => { const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data) }); const value = await response.json(); if (!response.ok) throw new Error(value.error); return value; };
  const login = await fetch(base + '/api/local-session', { method: 'POST', headers, body: '{}' }); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const control = await request('/api/control'), expectedRunId = control.session.runId, cases = [], text = [];
  const messagePhase = async phase => {
    const inputs = ['That Boomerang looks funny.', 'Catch a bladderfish and make water.']; const ids = [];
    for (const body of inputs) ids.push((await request('/api/message', { text: body, expectedRunId })).id);
    await app.engine.flush(); const state = await request('/api/moderator'); const rows = ids.map(id => { const row = state.recent.find(row => row.id === id); return { text: row.text, disposition: row.disposition }; }); text.push({ phase, rows }); return rows;
  };
  if (values['with-text']) assert.notEqual((await messagePhase('before_name_confirmation'))[0].disposition, 'allow');
  let positive;
  for (const name of ['chat-only', 'wrong-item', 'no-properties', 'blueprints', 'world', 'creepvine', 'world-no-hud', 'ingredient', 'positive']) {
    const paths = ['a', 'b'].map(suffix => resolve(directory, `${name}-${suffix}.png`));
    lastFixture = { name, paths, recognizer };
    const frames = await Promise.all(paths.map(async path => `data:image/png;base64,${(await readFile(path)).toString('base64')}`));
    const { source } = await request('/api/observations/source', { kind: 'synthetic', expectedRunId });
    const result = await request('/api/observe', { frames, source: { ...source, mediaTimes: [1, 2] }, expectedRunId });
    const expected = { 'chat-only': [], 'wrong-item': ['sn1.pda.visible'], 'no-properties': ['sn1.pda.visible'], blueprints: ['sn1.scanner.named', 'sn1.repair_tool.named', 'sn1.seaglide.name_visible'], world: ['sn1.writhing_weed.named'], creepvine: ['sn1.creepvine.named'], 'world-no-hud': [], ingredient: ['sn1.cave_sulfur.named'], positive: ['sn1.boomerang.named', 'sn1.pda.visible'] };
    assert.deepEqual(result.candidates.map(row => row.factId).sort(), expected[name].sort()); assert.equal(app.engine.ledger.state.factIds.length, 0);
    cases.push({ fixture: name, candidates: result.candidates.length, ...app.observer.status().lastCheck });
    if (name === 'positive') positive = result.candidates.find(row => row.factId === 'sn1.boomerang.named');
  }
  assert.equal(positive.factId, 'sn1.boomerang.named'); assert.equal(positive.automatic, false);
  const { source: automaticSource } = await request('/api/observations/source', { kind: 'recording', expectedRunId });
  const frames = await Promise.all(['a', 'b'].map(async suffix => 'data:image/png;base64,' + (await readFile(resolve(directory, 'positive-' + suffix + '.png'))).toString('base64')));
  const first = await request('/api/observe', { frames, source: { ...automaticSource, mediaTimes: [1, 2] }, expectedRunId }); assert.equal(first.autoConfirmed.length, 0);
  const second = await request('/api/observe', { frames, source: { ...automaticSource, mediaTimes: [4, 5] }, expectedRunId }); assert.equal(second.autoConfirmed.length, 2);
  assert.deepEqual(app.engine.ledger.state.factIds, ['sn1.boomerang.named', 'sn1.pda.visible']); assert.deepEqual(app.engine.ledger.state.relationIds, []);
  if (values['with-text']) { const after = await messagePhase('after_name_confirmation'); assert.equal(after[0].disposition, 'allow'); assert.equal(after[1].disposition, 'reject'); }
  const report = { kind: 'real_on_device_ocr_fixture_check', timestamp: new Date().toISOString(), passed: true, warning: 'Original text/UI fixtures, not gameplay. Verifies real Apple Vision OCR, HTTP boundaries and automatic name/UI confirmation from four fixture frames; does not establish gameplay precision/recall.', engine: recognizer.name, screenshotsSentToExternalModel: false, automaticKnowledgeUpdates: true, cases, automaticFacts: second.autoConfirmed, confirmedFacts: app.engine.ledger.state.factIds, confirmedRelations: app.engine.ledger.state.relationIds, realTextModelChecks: text };
  await mkdir('artifacts', { recursive: true }); await writeFile(values['with-text'] ? 'artifacts/firstplay-recognition-text-check.json' : 'artifacts/firstplay-recognition-check.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  // Only this command's original generated fixtures are diagnosed, never captured gameplay.
  // Vision results can differ across macOS releases; retain the real text/score evidence.
  const originalFixtureOcr = lastFixture ? await lastFixture.recognizer.recognize(lastFixture.paths).then(result => result.frames).catch(() => null) : null;
  console.error(JSON.stringify({ passed: false, error: error.message, fixture: lastFixture?.name, originalFixtureOcr })); process.exitCode = 1;
}
finally { await app?.close(); }
