import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { GameCatalog } from '../ml/catalog.mjs';
import { createApplication } from '../server.mjs';
import { EncryptedStore } from '../runtime/store.mjs';

// Synthetic operator evidence and chat, real model, real HTTP boundaries.
// No Twitch connection, gameplay image, external post or fabricated render receipt.
let app;
try {
  app = await createApplication({ catalog: await GameCatalog.load('subnautica'), store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '' } });
  const base = await app.start(), headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' };
  const login = await fetch(`${base}/api/local-session`, { method: 'POST', headers, body: '{}' });
  headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const request = async (path, data, token) => {
    const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Demo request failed.'); return value;
  };
  const control = await request('/api/control'), expectedRunId = control.session.runId, phases = [];
  const phase = async (name, texts) => {
    const messages = [];
    for (const text of texts) messages.push(await request('/api/message', { text, expectedRunId }));
    await app.engine.flush();
    const state = await request('/api/moderator'), reader = await request('/api/reader', undefined, control.links.reader), visible = new Set(reader.messages.map(message => message.id));
    const rows = messages.map(({ id }) => { const record = state.recent.find(record => record.id === id); return { text: record.text, disposition: record.disposition, reasonCode: record.reasonCode, inReader: visible.has(id), renderedReceipt: Boolean(record.deliveredAt) }; });
    phases.push({ name, rows }); return rows;
  };
  process.stderr.write('Checking unknown-name containment and ordinary conversation…\n');
  const before = await phase('before_manual_fixture', ['Hello everyone!', 'That Boomerang looks funny.', 'Catch a bladderfish and make water.']);
  assert.equal(before[0].inReader, true); assert.equal(before[1].inReader, false); assert.equal(before[2].inReader, false);
  await request('/api/discovery', { expectedRunId, eventId: 'sn1.event.boomerang_inventory', evidence: 'SYNTHETIC demo fixture; not footage or a visual-recognition result.' });
  process.stderr.write('Checking confirmed-name reaction, prohibited guidance and viewer isolation…\n');
  const after = await phase('after_manual_fixture', ['That Boomerang looks funny.', 'Cook the Boomerang.', 'Repair the radio now.', 'GG that was funny!']);
  assert.equal(after[0].inReader, true); assert.equal(after[1].inReader, false); assert.equal(after[2].inReader, false); assert.equal(after[3].inReader, true);
  const progress = await request('/api/moderator'), operation = progress.discoveryActivity[0];
  await request('/api/discovery/undo', { expectedRunId, operationId: operation.id, knowledgeRevision: progress.knowledge.revision });
  assert.equal((await request('/api/reader', undefined, control.links.reader)).messages.length, 0, 'Undo must clear earlier approvals.');
  process.stderr.write('Checking that undo removes knowledge and cannot reuse the earlier approval…\n');
  const undone = await phase('after_undo', ['That Boomerang looks funny.']); assert.equal(undone[0].inReader, false);
  const viewer = await request('/api/viewer', undefined, control.links.demoViewer);
  const other = await request('/api/viewer', undefined, app.auth.issue('viewer', { senderId: 'different-synthetic-viewer' }));
  assert.equal(viewer.messages.length, 8); assert.equal(other.messages.length, 0);
  assert(phases.every(phase => phase.rows.every(row => !row.renderedReceipt)), 'No renderer was involved, so no delivered receipt may be claimed.');
  const report = { kind: 'real_model_synthetic_http_rehearsal', timestamp: new Date().toISOString(), passed: true, gameId: control.session.id, packVersion: control.session.packVersion, warning: 'Synthetic chat and operator-confirmation fixture; no gameplay recognition, Twitch transit, renderer delivery or validated accuracy measured.', phases, providerLatenciesMs: app.engine.metrics.latencyMs, viewerIsolationPassed: true, undoClearedReader: true, fabricatedRenderReceipts: false };
  await mkdir('.data/firstplay-demo', { recursive: true, mode: 0o700 }); await writeFile('.data/firstplay-demo/check-latest.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(JSON.stringify({ passed: false, error: error.message })); process.exitCode = 1; }
finally { await app?.close(); }
