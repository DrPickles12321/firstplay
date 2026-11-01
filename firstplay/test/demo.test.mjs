import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { INFERENCE_PROTOCOL } from '../ml/contracts.mjs';
import { evaluationVersion } from '../runtime/evaluation.mjs';

const provider = { name: 'test-only' };
test('rehearsal configuration has no Twitch restore or public gateway and isolates report/label exports', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'firstplay-demo-test-')); let restores = 0;
  const app = await createApplication({ catalog: await GameCatalog.load('subnautica'), provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: true, dataDirectory: directory }, twitchFactory: options => {
    assert.equal(options.clientId, ''); assert.equal(options.clientSecret, '');
    return { status: { state: 'disconnected' }, stop() {}, async restore() { restores++; return true; } };
  } });
  const base = await app.start(); t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' };
  const post = (path, data) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(data) });
  const login = await post('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const get = async path => (await fetch(base + path, { headers })).json();
  const control = await get('/api/control'); assert.equal(restores, 0); assert.equal(control.connection.source, 'replay'); assert.equal(control.connection.rehearsal, true); assert.equal(control.publicViewerOrigin, null); assert.equal(control.session.id, 'subnautica');
  assert.equal((await get('/api/evaluation')).report, null);
  await writeFile(join(directory, 'evaluation-subnautica-latest.json'), JSON.stringify({ ...await evaluationVersion(), gameId: 'subnautica', inferenceProtocol: INFERENCE_PROTOCOL, marker: 'isolated-demo-only' }));
  assert.equal((await get('/api/evaluation')).report.marker, 'isolated-demo-only');
  const sourceCase = (await get('/api/cases')).cases.find(row => row.id === 'sn1-social-001');
  const reviewed = await post('/api/cases/review', { expectedRunId: control.session.runId, id: sourceCase.id, expected: 'allow', sourceHash: sourceCase.source_hash, reviewRevision: sourceCase.review_revision }); assert.equal(reviewed.status, 200);
  const exported = (await readFile(join(directory, 'reviewed-cases.subnautica.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse); assert.equal(exported.length, 1); assert.equal(exported[0].id, 'sn1-social-001');
  assert.equal((await post('/api/pause', { expectedRunId: control.session.runId, paused: true })).status, 200);
  assert.equal((await post('/api/pause', { expectedRunId: control.session.runId, paused: 'false' })).status, 400); assert.equal(app.engine.paused, true);
});

test('live and rehearsal browsers can send both cookies without inheriting another instance authority', async t => {
  const live = await createApplication({ provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '' } });
  const demo = await createApplication({ provider, store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', cookiePrefix: 'fp_demo' } });
  const liveBase = await live.start(), demoBase = await demo.start(); t.after(async () => { await demo.close(); await live.close(); });
  const login = async base => { const r = await fetch(base + '/api/local-session', { method: 'POST', headers: { Origin: base, 'X-FirstPlay-Client': '1' } }); return r.headers.get('set-cookie').split(';')[0]; };
  const liveCookie = await login(liveBase), demoCookie = await login(demoBase);
  assert(liveCookie.startsWith('fp_operator=')); assert(demoCookie.startsWith('fp_demo_operator='));
  const mixed = `${liveCookie}; ${demoCookie}`;
  for (const base of [liveBase, demoBase]) assert.equal((await fetch(base + '/api/control', { headers: { Cookie: mixed } })).status, 200);
  assert.equal((await fetch(liveBase + '/api/control', { headers: { Cookie: demoCookie } })).status, 403);
  assert.equal((await fetch(demoBase + '/api/control', { headers: { Cookie: liveCookie } })).status, 403);
});
