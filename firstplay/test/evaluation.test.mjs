import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvaluationDesk, caseFingerprint, evaluationVersion } from '../runtime/evaluation.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { createApplication } from '../server.mjs';
import { INFERENCE_PROTOCOL } from '../ml/contracts.mjs';
const owner = { id: 'synthetic-test-operator', role: 'owner' }, catalog = await GameCatalog.load('subnautica');
async function setup(t) { const directory = await mkdtemp(join(tmpdir(), 'firstplay-review-')), store = new EncryptedStore(), desk = new EvaluationDesk({ store, directory }); t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); }); return { desk, store, directory }; }
const save = (desk, row, extra = {}) => desk.save({ catalog, id: row.id, expected: 'allow', note: 'Synthetic test judgment, not a real human-reviewed benchmark.', sourceHash: row.source_hash, expectedRevision: row.review_revision, actor: owner, assertCurrent() {}, ...extra });

test('reviewed labels carry input fingerprints and optimistic revisions; stale writes cannot overwrite them', async t => {
  const { desk } = await setup(t), row = (await desk.cases(catalog))[0];
  assert.equal(row.review_revision, 0); const result = await save(desk, row); assert.equal(result.reviewed.review_revision, 1);
  await assert.rejects(save(desk, row), /changed/); const current = (await desk.cases(catalog))[0];
  assert.equal(current.status, 'human_reviewed'); assert.equal(caseFingerprint({ ...current, expected_disposition: 'reject', review_note: 'different' }), row.source_hash);
  await assert.rejects(save(desk, current, { sourceHash: 'different-source' }), /changed/);
  await assert.rejects(save(desk, current, { actor: { id: 'viewer', role: 'viewer' } }), /Only the owner/);
});

test('changed case inputs invalidate earlier labels and exclude them from reviewed exports', async t => {
  const { desk, store } = await setup(t), row = (await desk.cases(catalog))[0];
  store.set(desk.namespace(catalog, 'main'), row.id, { ...row, status: 'human_reviewed', source_hash: 'old-source', review_revision: 1 });
  const fresh = (await desk.cases(catalog))[0]; assert.equal(fresh.stale_review, true); assert.equal(fresh.review_revision, 0); assert.notEqual(fresh.status, 'human_reviewed'); assert.equal((await desk.export(catalog)).count, 0);
});

test('main and adversarial sets stay separate and export the latest saved revisions atomically', async t => {
  const { desk, directory } = await setup(t), main = await desk.cases(catalog), adversarial = await desk.cases(catalog, 'adversarial');
  assert.equal(main.length, 79); assert.equal(adversarial.length, 24); await assert.rejects(desk.cases(catalog, '../../.env'), /Unknown case set/);
  await Promise.all([save(desk, main[0]), save(desk, main[1]), save(desk, adversarial[0], { setId: 'adversarial' })]);
  assert.equal((await desk.export(catalog)).count, 2); assert.equal((await desk.export(catalog, 'adversarial')).count, 1);
  const rows = (await readFile(join(directory, desk.filename(catalog)), 'utf8')).trim().split('\n').map(JSON.parse); assert.equal(rows.length, 2); assert(rows.every(row => row.source_hash && row.review_revision === 1));
});

test('export failure does not lose a judgment and a live export still returns saved labels', async t => {
  const { desk } = await setup(t), row = (await desk.cases(catalog))[0]; t.mock.method(desk, 'persistExport', async () => { throw new Error('Injected disk error'); });
  const result = await save(desk, row); assert(result.exportWarning); assert.equal((await desk.export(catalog)).count, 1);
});

test('reports from another pack revision cannot be presented as current results', async t => {
  const { desk, directory } = await setup(t); await writeFile(join(directory, 'evaluation-subnautica-latest.json'), JSON.stringify({ gameId: 'subnautica', packVersion: 'older' }));
  assert.deepEqual(await desk.report(catalog), { report: null, outdated: true });
});

test('reviewed reports become outdated when their human label revision changes', async t => {
  const { desk, directory } = await setup(t), row = (await desk.cases(catalog))[0]; await save(desk, row);
  const current = (await desk.cases(catalog))[0];
  await writeFile(join(directory, 'evaluation-subnautica-latest.json'), JSON.stringify({ ...await evaluationVersion(), kind: 'reviewed_label_evaluation', inferenceProtocol: INFERENCE_PROTOCOL, gameId: 'subnautica', packVersion: catalog.pack.version, results: [{ id: current.id, caseSourceHash: current.source_hash, sourceReviewRevision: current.review_revision, expected: current.expected_disposition }] }));
  assert.equal((await desk.report(catalog)).outdated, false); await save(desk, current, { expected: 'review' }); assert.equal((await desk.report(catalog)).outdated, true);
});

test('reports bind the anonymous inference protocol, prompt and policy before exposing metrics', async t => {
  const { desk, directory } = await setup(t), path = join(directory, 'evaluation-subnautica-latest.json');
  const current = { ...await evaluationVersion(), inferenceProtocol: INFERENCE_PROTOCOL, gameId: 'subnautica', packVersion: catalog.pack.version, results: [] };
  for (const stale of [{ inferenceProtocol: 'semantic-case-ids' }, { promptHash: 'old-prompt' }, { policyHash: 'old-policy' }]) {
    await writeFile(path, JSON.stringify({ ...current, ...stale })); const result = await desk.report(catalog); assert.equal(result.outdated, true); assert.equal(result.report, null); assert(result.outdatedReason);
  }
  await writeFile(path, JSON.stringify(current)); assert.equal((await desk.report(catalog)).outdated, false);
});

test('reopening a review excludes it from exports and retains its old judgment in the audit', async t => {
  const { desk, store } = await setup(t), row = (await desk.cases(catalog))[0]; await save(desk, row);
  const current = (await desk.cases(catalog))[0];
  await desk.reopen({ catalog, id: current.id, sourceHash: current.source_hash, expectedRevision: current.review_revision, actor: owner, assertCurrent() {} });
  const fresh = (await desk.cases(catalog))[0]; assert.equal(fresh.status, 'draft_requires_user_review'); assert.equal(fresh.review_revision, 2); assert.equal((await desk.export(catalog)).count, 0);
  const audit = store.list('case-review-events').find(event => event.kind === 'reopened'); assert.equal(audit.previousExpected, 'allow'); assert(audit.previousNote.includes('Synthetic'));
  await assert.rejects(desk.reopen({ catalog, id: current.id, sourceHash: current.source_hash, expectedRevision: 1, actor: owner, assertCurrent() {} }), /changed/);
});

test('case exports and reviews enforce owner, run, source and revision boundaries over HTTP', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'firstplay-review-http-'));
  const app = await createApplication({ catalog, provider: { name: 'test-only' }, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', dataDirectory: directory } });
  const base = await app.start(); t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' }, post = (path, data) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(data) });
  const login = await post('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const state = await (await fetch(base + '/api/cases', { headers })).json(), row = state.cases[0];
  const data = { expectedRunId: state.session.runId, id: row.id, sourceHash: row.source_hash, reviewRevision: row.review_revision, expected: 'allow' };
  assert.equal((await post('/api/cases/review', { ...data, sourceHash: 'stale' })).status, 409); assert.equal((await post('/api/cases/review', data)).status, 200); assert.equal((await post('/api/cases/review', data)).status, 409);
  const url = `${base}/api/cases/export?run=${state.session.runId}`; const exported = await fetch(url, { headers }); assert.equal(exported.status, 200); assert(exported.headers.get('content-disposition').includes('reviewed-cases.subnautica.jsonl')); assert.equal((await exported.text()).trim().split('\n').length, 1);
  assert.equal((await fetch(url, { headers: { ...headers, Authorization: `Bearer ${app.auth.links().reader}` } })).status, 403);
  assert.equal((await fetch(base + '/api/cases/export?run=old', { headers })).status, 409);
});
