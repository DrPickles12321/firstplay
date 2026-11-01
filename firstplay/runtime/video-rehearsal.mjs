import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { ScreeningEngine } from './engine.mjs';
import { EncryptedStore } from './store.mjs';

const fail = (message, status = 409) => { const error = new Error(message); error.status = status; throw error; };
export const SUBNAUTICA_REHEARSAL = JSON.parse(await readFile(new URL('../../research/firstplay/subnautica/rehearsal-scenarios.json', import.meta.url), 'utf8'));
function reviewSnapshot(record, catalog) {
  return { text: record.text, name: record.displayName, knowledgeAtMessage: [...record.snapshot.knowledge.factIds, ...record.snapshot.knowledge.relationIds].map(id => ({ id, label: catalog.get(id)?.label || catalog.get(id)?.statement || id })), knowledgeRevision: record.snapshot.knowledge.revision };
}

// Playback is ephemeral; saved review judgments have separate durable local storage.
// Playback time schedules fictional chat only. It can never establish a discovery.
export class VideoRehearsal {
  constructor({ catalog, provider, clock = Date.now, reviewStore }) {
    if (catalog.gameId !== 'subnautica') throw new Error('The video rehearsal requires Subnautica.');
    Object.assign(this, { catalog, provider, clock }); this.trial = null;
    this.reviewStore = reviewStore || new EncryptedStore(); this.ownsReviewStore = !reviewStore;
    for (const chapter of SUBNAUTICA_REHEARSAL.chapters) for (const id of chapter.checkpoint.eventIds) if (!catalog.events.has(id)) throw new Error('The rehearsal does not match the game pack.');
  }
  owner(actor) { if (actor?.role !== 'owner' || !actor.id) fail('Only the owner can run or review a rehearsal.', 403); }
  current(id, actor) { this.owner(actor); if (!this.trial || this.trial.id !== id) fail('This rehearsal was replaced. Start or reload the current scene.'); return this.trial; }
  start(chapterId, actor) {
    this.owner(actor); const chapter = SUBNAUTICA_REHEARSAL.chapters.find(row => row.id === chapterId);
    if (!chapter) fail('Choose a supported Subnautica scene.', 400);
    const store = new EncryptedStore(), engine = new ScreeningEngine({ catalog: this.catalog, provider: this.provider, store, clock: this.clock });
    const trial = { id: randomUUID(), chapter, engine, store, startedAt: this.clock(), sent: new Map(), judgments: new Map(), decisions: new Map(), lastPlaybackTime: chapter.start, confirmed: false, rows: [] };
    engine.runId = trial.id;
    engine.objective = 'Subnautica opening playthrough. Only the separately supplied confirmed IDs are known. No unsolicited hints.';
    engine.on('change', () => { for (const record of engine.messages.values()) if (record.disposition !== 'pending' && !trial.decisions.has(record.id)) trial.decisions.set(record.id, { disposition: record.disposition, reason: record.reason, reasonCode: record.reasonCode, decidedAt: this.clock() }); });
    try { if (this.trial?.judgments.size) this.retainReview(this.export(actor), actor); }
    catch (error) { engine.close(); store.close(); throw error; }
    this.closeTrial(); this.trial = trial; return this.state(actor);
  }
  send({ trialId, cueId, mediaTime }, actor) {
    const trial = this.current(trialId, actor), cue = trial.chapter.cues.find(row => row.id === cueId);
    if (!cue) fail('Unknown chat batch.', 400);
    if (trial.sent.has(cueId)) return this.state(actor);
    if (!Number.isFinite(mediaTime) || mediaTime < trial.chapter.start || mediaTime > trial.chapter.end + 1) fail('Playback time is outside this scene.', 400);
    const index = trial.chapter.cues.indexOf(cue);
    if (index && !trial.sent.has(trial.chapter.cues[index - 1].id)) fail('Send the earlier chat batch first.');
    trial.lastPlaybackTime = mediaTime; trial.sent.set(cueId, []);
    for (const item of cue.messages) {
      const id = randomUUID();
      const record = trial.engine.ingest({ id, text: item.text, senderId: `fictional-${item.name}`, displayName: item.name, source: 'replay', channelId: 'subnautica-rehearsal' });
      // Keep this bounded fictional review history independent of the reader's chat TTL.
      // Capture the original knowledge, never reconstruct it from later discoveries.
      trial.rows.push({ messageId: id, cueId, cueMessageId: item.id, at: mediaTime, draftExpected: item.draftExpected, ...reviewSnapshot(record, this.catalog) });
      trial.sent.get(cueId).push(record.id);
    }
    return this.state(actor);
  }
  confirm({ trialId, mediaTime }, actor) {
    const trial = this.current(trialId, actor);
    if (trial.confirmed) return this.state(actor);
    if (!trial.sent.has('before') || trial.sent.has('after')) fail('Confirm between the before and after chat batches, or restart the scene.');
    if (!Number.isFinite(mediaTime) || mediaTime < trial.chapter.checkpoint.at || mediaTime > trial.chapter.end + 1) fail('Watch the checkpoint before confirming.', 400);
    if (trial.engine.pendingCount() || trial.engine.workers) fail('Wait for the current message checks before confirming the discovery.');
    const ids = trial.chapter.checkpoint.eventIds.flatMap(id => { const event = this.catalog.events.get(id); return [...event.confirms_fact_ids, ...event.confirms_relation_ids]; });
    trial.engine.ledger.updateMany({ ids, known: true, actor, evidence: `MANUAL rehearsal confirmation near ${mediaTime.toFixed(1)}s. Operator must inspect the evidence; playback time is not recognition.` });
    trial.engine.reuse.clear(); trial.confirmed = true; trial.lastPlaybackTime = mediaTime;
    return this.state(actor);
  }
  judge({ trialId, messageId, disposition, note = '' }, actor) {
    const trial = this.current(trialId, actor);
    if (!trial.rows.some(row => row.messageId === messageId) || !['allow', 'reject', 'review'].includes(disposition) || typeof note !== 'string' || note.length > 1000) fail('Choose an outcome for an existing message and a note under 1,000 characters.', 400);
    const previous = trial.judgments.get(messageId);
    trial.judgments.set(messageId, { disposition, note: note.trim(), at: this.clock(), actorId: actor.id });
    try { this.retainReview(this.export(actor), actor); }
    catch (error) { if (previous) trial.judgments.set(messageId, previous); else trial.judgments.delete(messageId); throw error; }
    return this.state(actor);
  }
  state(actor) {
    this.owner(actor); const trial = this.trial; if (!trial) return { trial: null };
    const { engine } = trial; engine.prune();
    const messages = trial.rows.map(row => {
      const record = engine.messages.get(row.messageId);
      return { ...row, currentDisposition: record?.disposition || 'expired', archived: !record, decision: trial.decisions.get(row.messageId) || null, judgment: trial.judgments.get(row.messageId) || null };
    });
    const grants = [...new Set(trial.chapter.checkpoint.eventIds.flatMap(id => { const event = this.catalog.events.get(id); return [...event.confirms_fact_ids, ...event.confirms_relation_ids]; }))].map(id => ({ id, label: this.catalog.get(id).label || this.catalog.get(id).statement }));
    return { trial: { id: trial.id, chapterId: trial.chapter.id, startedAt: trial.startedAt, sentCues: [...trial.sent.keys()], confirmed: trial.confirmed, messages, archivedMessageCount: messages.filter(row => row.archived).length, grants, events: trial.chapter.checkpoint.eventIds.map(id => this.catalog.events.get(id)), knownCount: engine.ledger.state.factIds.length, screening: engine.screeningStatus(), provider: this.provider.name, providerFailures: engine.metrics.failures, streamer: engine.safeFeed().messages, modelLatenciesMs: engine.metrics.latencyMs, lastPlaybackTime: trial.lastPlaybackTime, automaticRecognition: false } };
  }
  export(actor) { const value = this.state(actor); return { kind: 'synthetic_video_chat_rehearsal', warning: SUBNAUTICA_REHEARSAL.provenance, scenarioVersion: SUBNAUTICA_REHEARSAL.version, game: 'subnautica', packVersion: this.catalog.pack.version, timestamp: new Date(this.clock()).toISOString(), ...value }; }
  retainReview(report, actor) {
    this.owner(actor);
    const chapter = SUBNAUTICA_REHEARSAL.chapters.find(row => row.id === report.trial?.chapterId);
    if (report.kind !== 'synthetic_video_chat_rehearsal' || report.game !== 'subnautica' || report.packVersion !== this.catalog.pack.version || !chapter || !Array.isArray(report.trial.messages)) fail('This saved review does not match the rehearsal.', 400);
    const reviewed = report.trial.messages.filter(row => row.judgment);
    if (!reviewed.length) return;
    if (reviewed.some(row => !['allow', 'reject', 'review'].includes(row.judgment.disposition) || typeof row.judgment.note !== 'string' || row.judgment.note.length > 1000)) fail('Invalid saved review judgment.', 400);
    const previous = this.reviewStore.get('rehearsal-reviews', report.trial.id);
    const saved = { ...report, kind: 'saved_assisted_rehearsal_review', reviewRevision: (previous?.reviewRevision || 0) + 1, savedAt: this.clock(), chapterTitle: chapter.title,
      sourceHash: createHash('sha256').update(JSON.stringify({ chapter, packVersion: this.catalog.pack.version })).digest('hex'),
      reviewProvenance: 'Owner judgments on synthetic examples with model decisions visible; not independent or held-out accuracy.',
      reviewedCount: reviewed.length, modelAgreements: reviewed.filter(row => row.decision?.disposition === row.judgment.disposition).length,
      modelDisagreements: reviewed.filter(row => row.decision && row.decision.disposition !== row.judgment.disposition).length };
    this.reviewStore.transaction(() => this.reviewStore.set('rehearsal-reviews', report.trial.id, saved));
    return saved;
  }
  savedReviews(actor) { this.owner(actor); return this.reviewStore.list('rehearsal-reviews').sort((a, b) => b.savedAt - a.savedAt); }
  exportReviews(actor) { return { kind: 'saved_assisted_rehearsal_reviews', warning: 'Saved judgments on synthetic scenes with model answers visible; not a held-out accuracy benchmark.', timestamp: new Date(this.clock()).toISOString(), reviews: this.savedReviews(actor) }; }
  closeTrial() { this.trial?.engine.close(); this.trial?.store.close(); this.trial = null; }
  close() { this.closeTrial(); if (this.ownsReviewStore) this.reviewStore.close(); }
}
