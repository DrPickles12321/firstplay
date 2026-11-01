import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VideoRehearsal, SUBNAUTICA_REHEARSAL } from '../runtime/video-rehearsal.mjs';
import { GameCatalog } from '../ml/catalog.mjs';
import { EncryptedStore } from '../runtime/store.mjs';
import { createApplication } from '../server.mjs';

const catalog = await GameCatalog.load('subnautica'), owner = { role: 'owner', id: 'synthetic-test-operator' };
function provider() { return { name: 'test-only', async classify(_, items) {
  assert(!JSON.stringify(items).includes('draftExpected'));
  return { results: new Map(items.map(item => [item.id, { message_id: item.id, relevance: /Boomerang/.test(item.text) ? 'current_game' : 'none', intents: /Cook|Catch/.test(item.text) ? ['directive'] : ['reaction'], references: /Boomerang/.test(item.text) ? [{ id: 'sn1.boomerang.named', usage: 'mention' }] : [], unknown_information: false, unresolved_reference: false, uncertain: false, recommended_disposition: 'allow', reason: 'Controlled test interpretation.' }])), metrics: { provider: 'test-only', latencyMs: 1 } };
} }; }
function setup(t, source = provider()) { const replay = new VideoRehearsal({ catalog, provider: source }); t.after(() => replay.close()); return replay; }

test('four synthetic scenes bind 32 messages to supported manual events and valid recording ranges', () => {
  assert.equal(SUBNAUTICA_REHEARSAL.automaticRecognition, false); assert.equal(SUBNAUTICA_REHEARSAL.chapters.length, 4);
  assert.equal(SUBNAUTICA_REHEARSAL.chapters.flatMap(chapter => chapter.cues.flatMap(cue => cue.messages)).length, 32);
  for (const chapter of SUBNAUTICA_REHEARSAL.chapters) { assert(chapter.start < chapter.checkpoint.at && chapter.checkpoint.at < chapter.end && chapter.end < SUBNAUTICA_REHEARSAL.video.duration); assert(chapter.checkpoint.eventIds.every(id => catalog.events.has(id))); assert(chapter.cues.every(cue => cue.at >= chapter.start && cue.at <= chapter.end)); }
});

test('real engine gating, idempotent cues and manual discovery confirmation preserve per-message knowledge', async t => {
  const replay = setup(t), initial = replay.start('fish', owner), trialId = initial.trial.id;
  assert.equal(initial.trial.knownCount, 0);
  replay.send({ trialId, cueId: 'before', mediaTime: 251 }, owner); await replay.trial.engine.flush();
  const before = replay.state(owner); assert.equal(before.trial.messages.length, 4); assert.equal(before.trial.messages[1].decision.disposition, 'review'); assert.equal(before.trial.knownCount, 0);
  assert.equal(replay.send({ trialId, cueId: 'before', mediaTime: 260 }, owner).trial.messages.length, 4);
  assert.throws(() => replay.confirm({ trialId, mediaTime: 269 }, owner), /checkpoint/);
  replay.confirm({ trialId, mediaTime: 270 }, owner); replay.send({ trialId, cueId: 'after', mediaTime: 274 }, owner); await replay.trial.engine.flush();
  const after = replay.state(owner); assert.equal(after.trial.knownCount, 4); assert.equal(after.trial.messages[4].decision.disposition, 'allow'); assert.equal(after.trial.messages[5].decision.disposition, 'reject');
  assert.equal(after.trial.messages[1].knowledgeAtMessage.length, 0); assert.equal(after.trial.messages[4].knowledgeAtMessage.length, 5);
  assert(!after.trial.streamer.some(row => row.id === after.trial.messages[1].messageId || row.id === after.trial.messages[5].messageId)); assert(after.trial.streamer.every(row => !('reason' in row)));
});

test('playback time and later chat cannot grant knowledge; wrong order and replaced trials are rejected', async t => {
  const replay = setup(t), trialId = replay.start('fish', owner).trial.id;
  assert.throws(() => replay.send({ trialId, cueId: 'after', mediaTime: 290 }, owner), /earlier/);
  replay.send({ trialId, cueId: 'before', mediaTime: 290 }, owner); await replay.trial.engine.flush();
  replay.send({ trialId, cueId: 'after', mediaTime: 290 }, owner); await replay.trial.engine.flush();
  assert.equal(replay.state(owner).trial.knownCount, 0); assert.throws(() => replay.confirm({ trialId, mediaTime: 290 }, owner), /between/);
  replay.start('surface', owner); assert.throws(() => replay.send({ trialId, cueId: 'before', mediaTime: 251 }, owner), /replaced/); assert.equal(replay.state(owner).trial.messages.length, 0);
});

test('in-flight checks prevent confirmation and late responses cannot publish into a replacement trial', async t => {
  let release; const source = provider(), run = source.classify.bind(source); source.classify = async (...args) => { await new Promise(resolve => { release = resolve; }); return run(...args); };
  const replay = setup(t, source), trialId = replay.start('fish', owner).trial.id; replay.send({ trialId, cueId: 'before', mediaTime: 251 }, owner); const running = replay.trial.engine.flush();
  assert.throws(() => replay.confirm({ trialId, mediaTime: 270 }, owner), /Wait/); const earlier = replay.trial.engine;
  replay.start('opening', owner); release(); await running; assert.equal(earlier.closed, true); assert.equal(replay.state(owner).trial.messages.length, 0); assert.equal(replay.state(owner).trial.knownCount, 0);
});

test('review expiration retains the original decision; judgments stay separate from draft labels and saved sessions', async t => {
  let now = 1_000; const replay = new VideoRehearsal({ catalog, provider: provider(), clock: () => now }); t.after(() => replay.close());
  const trialId = replay.start('fish', owner).trial.id; replay.send({ trialId, cueId: 'before', mediaTime: 251 }, owner); await replay.trial.engine.flush();
  const messageId = replay.state(owner).trial.messages[1].messageId; now += 31_000;
  const expired = replay.state(owner).trial.messages[1]; assert.equal(expired.currentDisposition, 'expired'); assert.equal(expired.decision.disposition, 'review'); assert.equal(expired.judgment, null);
  replay.judge({ trialId, messageId, disposition: 'reject', note: 'Synthetic test judgment.' }, owner); const report = replay.export(owner); assert.equal(report.trial.messages[1].judgment.disposition, 'reject'); assert.equal(report.trial.messages[1].draftExpected, 'review'); assert(!report.trial.messages.some(row => 'deliveredAt' in row));
  assert.throws(() => replay.judge({ trialId, messageId, disposition: 'allow' }, { role: 'moderator', id: 'mod' }), /owner/);
});

test('rehearsal review history and export survive chat retention without restoring expired reader messages', async t => {
  let now = 1_000; const replay = new VideoRehearsal({ catalog, provider: provider(), clock: () => now }); t.after(() => replay.close());
  const trialId = replay.start('fish', owner).trial.id;
  replay.send({ trialId, cueId: 'before', mediaTime: 251 }, owner); await replay.trial.engine.flush();
  replay.confirm({ trialId, mediaTime: 270 }, owner);
  replay.send({ trialId, cueId: 'after', mediaTime: 274 }, owner); await replay.trial.engine.flush();
  const before = replay.state(owner), messageId = before.trial.messages[1].messageId;
  replay.judge({ trialId, messageId, disposition: 'review', note: 'Synthetic regression judgment.' }, owner);
  now += replay.trial.engine.retentionMs + 1;
  const after = replay.state(owner); assert.equal(replay.trial.engine.messages.size, 0); assert.equal(after.trial.streamer.length, 0);
  assert.equal(after.trial.messages.length, 8); assert.equal(after.trial.archivedMessageCount, 8);
  assert(after.trial.messages.every(row => row.archived && row.currentDisposition === 'expired'));
  assert.deepEqual(after.trial.messages.map(row => ({ text: row.text, name: row.name, decision: row.decision, knowledge: row.knowledgeAtMessage, revision: row.knowledgeRevision })), before.trial.messages.map(row => ({ text: row.text, name: row.name, decision: row.decision, knowledge: row.knowledgeAtMessage, revision: row.knowledgeRevision })));
  assert.equal(after.trial.messages[1].knowledgeAtMessage.length, 0); assert.equal(after.trial.messages[4].knowledgeAtMessage.length, 5);
  const exported = replay.export(owner); assert.equal(exported.trial.messages.length, 8); assert.equal(exported.trial.messages[1].judgment.note, 'Synthetic regression judgment.');
  const restarted = replay.start('surface', owner); assert.equal(restarted.trial.messages.length, 0); assert.equal(restarted.trial.knownCount, 0);
  replay.send({ trialId: restarted.trial.id, cueId: 'before', mediaTime: 111 }, owner); now += replay.trial.engine.retentionMs + 1;
  const unchecked = replay.state(owner); assert.equal(unchecked.trial.archivedMessageCount, 4); assert(unchecked.trial.messages.every(row => row.decision === null && row.currentDisposition === 'expired')); assert.equal(unchecked.trial.streamer.length, 0);
});

test('reopening and exporting an aged rehearsal return successful HTTP responses', async t => {
  const app = await createApplication({ catalog, provider: provider(), store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: true } });
  const base = await app.start(); t.after(() => app.close()); let now = Date.now(); app.rehearsal.clock = () => now;
  const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' }, post = (path, data) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(data) });
  const login = await post('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
  const trialId = (await (await post('/api/rehearsal/start', { chapterId: 'fish' })).json()).trial.id;
  await post('/api/rehearsal/cue', { trialId, cueId: 'before', mediaTime: 251 }); await app.rehearsal.trial.engine.flush(); now += 3_600_001;
  for (const path of ['/api/rehearsal/state', '/api/rehearsal/export']) { const response = await fetch(base + path, { headers }); assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.trial.messages.length, 4); assert.equal(data.trial.archivedMessageCount, 4); assert.equal(data.trial.streamer.length, 0); }
});

test('saved judgments survive scene changes and reopening the encrypted review store', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'firstplay-saved-scene-reviews-')); let store = await EncryptedStore.open(directory);
  let replay = new VideoRehearsal({ catalog, provider: provider(), reviewStore: store });
  t.after(async () => { replay.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  for (const [chapterId, mediaTime] of [['fish', 251], ['surface', 111]]) {
    const trialId = replay.start(chapterId, owner).trial.id; replay.send({ trialId, cueId: 'before', mediaTime }, owner); await replay.trial.engine.flush();
    const row = replay.state(owner).trial.messages[0]; replay.judge({ trialId, messageId: row.messageId, disposition: 'allow', note: `Synthetic ${chapterId} persistence test.` }, owner);
  }
  const before = replay.exportReviews(owner); assert.equal(before.reviews.length, 2); assert(before.reviews.every(row => row.reviewedCount === 1 && row.sourceHash.length === 64));
  replay.close(); store.close(); store = await EncryptedStore.open(directory); replay = new VideoRehearsal({ catalog, provider: provider(), reviewStore: store });
  assert.equal(replay.state(owner).trial, null); assert.deepEqual(replay.exportReviews(owner).reviews, before.reviews);
  assert.throws(() => replay.savedReviews({ id: 'reader', role: 'reader' }), /owner/);
});

test('review write failure rolls back the judgment and prevents replacing the current scene', async t => {
  const replay = setup(t), trialId = replay.start('fish', owner).trial.id; replay.send({ trialId, cueId: 'before', mediaTime: 251 }, owner); await replay.trial.engine.flush();
  const messageId = replay.state(owner).trial.messages[0].messageId; replay.judge({ trialId, messageId, disposition: 'allow', note: 'Original synthetic judgment.' }, owner);
  const saved = replay.savedReviews(owner); t.mock.method(replay.reviewStore, 'set', () => { throw new Error('Injected review write failure'); });
  assert.throws(() => replay.judge({ trialId, messageId, disposition: 'reject', note: 'Must not overwrite.' }, owner), /write failure/);
  assert.equal(replay.state(owner).trial.messages[0].judgment.disposition, 'allow'); assert.deepEqual(replay.savedReviews(owner), saved);
  assert.throws(() => replay.start('surface', owner), /write failure/); assert.equal(replay.state(owner).trial.id, trialId);
});

test('HTTP replay operations require isolated rehearsal and owner authority; existing runs remain untouched', async t => {
  for (const isolated of [false, true]) {
    const app = await createApplication({ catalog, provider: provider(), store: new EncryptedStore(), config: { port: 0, clientId: '', clientSecret: '', viewerOrigin: '', rehearsal: isolated } }); const base = await app.start(); t.after(() => app.close());
    const headers = { Origin: base, 'X-FirstPlay-Client': '1', 'Content-Type': 'application/json' }, post = (path, data) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(data) });
    const login = await post('/api/local-session', {}); headers.Cookie = login.headers.get('set-cookie').split(';')[0];
    const initial = app.sessions.summary(), response = await post('/api/rehearsal/start', { chapterId: 'fish' }); assert.equal(response.status, isolated ? 200 : 403);
    if (isolated) { const trialId = (await response.json()).trial.id; assert.equal((await post('/api/rehearsal/cue', { trialId, cueId: 'before', mediaTime: 251 })).status, 200); await app.rehearsal.trial.engine.flush(); assert.equal((await post('/api/rehearsal/confirm', { trialId, mediaTime: 270 })).status, 200); assert.equal(app.engine.ledger.state.factIds.length, 0); assert.equal(app.sessions.summary().runId, initial.runId);
      const messageId = app.rehearsal.state(owner).trial.messages[0].messageId; const judged = await post('/api/rehearsal/judge', { trialId, messageId, disposition: 'allow' }); assert.equal(judged.status, 200); assert.equal((await judged.json()).savedReviews.length, 1);
      const exported = await fetch(base + '/api/rehearsal/reviews/export', { headers }); assert.equal(exported.status, 200); assert(exported.headers.get('content-disposition').includes('saved-scene-reviews')); assert.equal((await exported.json()).reviews[0].reviewedCount, 1);
      assert.equal((await fetch(base + '/api/rehearsal/reviews', { headers: { Authorization: `Bearer ${app.auth.links().reader}` } })).status, 403);
      assert.equal((await (await fetch(base + '/api/cases', { headers })).json()).cases.filter(row => row.status === 'human_reviewed').length, 0);
      assert.equal((await fetch(base + '/api/rehearsal/state', { headers: { Authorization: `Bearer ${app.auth.links().reader}` } })).status, 403); const page = await fetch(base + '/rehearsal'); assert(page.headers.get('content-security-policy').includes('https://www.youtube.com')); assert(!(await fetch(base + '/moderator')).headers.get('content-security-policy').includes('https://www.youtube.com'));
    } else assert.equal((await fetch(base + '/api/rehearsal/reviews', { headers })).status, 403);
  }
});
