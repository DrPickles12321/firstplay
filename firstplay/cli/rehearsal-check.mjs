import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApplication } from '../server.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { EncryptedStore } from '../runtime/store.mjs';

let app;
try {
  app = await createApplication({ catalog: await GameCatalog.load('subnautica'), store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: true } });
  const base = await app.start(), headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' };
  const login = await fetch(base + '/api/local-session', { method: 'POST', headers, body: '{}' }); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const request = async (path, data) => { const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data) }); const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Rehearsal request failed.'); return value; };
  const metadata = await request('/api/rehearsal'), scenes = [], originalRun = app.sessions.run.id;
  for (const chapter of metadata.chapters) {
    process.stderr.write(`Checking ${chapter.title} with real text inference and synthetic manual evidence…\n`);
    const trialId = (await request('/api/rehearsal/start', { chapterId: chapter.id })).trial.id;
    await request('/api/rehearsal/cue', { trialId, cueId: 'before', mediaTime: chapter.start + 1 }); await app.rehearsal.trial.engine.flush();
    assert.equal((await request('/api/rehearsal/state')).trial.knownCount, 0);
    await request('/api/rehearsal/confirm', { trialId, mediaTime: chapter.checkpoint.at });
    await request('/api/rehearsal/cue', { trialId, cueId: 'after', mediaTime: chapter.checkpoint.at + 4 }); await app.rehearsal.trial.engine.flush();
    const { trial } = await request('/api/rehearsal/state');
    assert.equal(trial.messages.length, 8); assert(trial.messages.every(row => row.decision)); assert.equal(trial.providerFailures, 0); assert.equal(app.engine.ledger.state.factIds.length, 0); assert.equal(app.sessions.run.id, originalRun);
    const visible = new Set(trial.streamer.map(row => row.id)); assert(trial.messages.filter(row => row.decision.disposition !== 'allow').every(row => !visible.has(row.messageId)));
    scenes.push({ chapter: chapter.id, actualRecognition: false, knownCount: trial.knownCount, providerFailures: trial.providerFailures, modelLatenciesMs: trial.modelLatenciesMs, results: trial.messages.map(row => ({ cue: row.cueId, text: row.text, expectedDraft: row.draftExpected, actual: row.decision.disposition, matchesDraft: row.draftExpected === row.decision.disposition, inStreamerPreview: visible.has(row.messageId), knowledgeRevision: row.knowledgeRevision, reason: row.decision.reason })) });
  }
  const report = { kind: 'real_model_synthetic_video_chat_rehearsal_check', timestamp: new Date().toISOString(), passed: true, warning: 'No gameplay images or video recognition tested. Chat and confirmation evidence are synthetic; expected labels are unreviewed drafts. No Twitch posts, saved progress changes or renderer receipts.', total: scenes.reduce((sum, scene) => sum + scene.results.length, 0), scenes, savedRunUnchanged: true };
  await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/firstplay-video-rehearsal-check.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, scenes: scenes.map(scene => ({ ...scene, results: scene.results.filter(row => !row.matchesDraft) })) }, null, 2));
} catch (error) { console.error(JSON.stringify({ passed: false, error: error.message })); process.exitCode = 1; }
finally { await app?.close(); }
