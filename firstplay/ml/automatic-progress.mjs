import { LOCAL_DISCOVERIES } from './local-text.mjs';

// These UI labels establish exactly one allowlisted fact each. No relationships.
const allowed = new Set(LOCAL_DISCOVERIES.map(item => item.factId));
export class AutomaticProgress {
  constructor({ store, clock = Date.now } = {}) {
    this.store = store; this.clock = clock; this.streaks = new Map(); this.context = '';
    const preferences = store?.get('observation-preferences', 'automatic') || {};
    this.enabled = preferences.enabled !== false;
    this.blocked = new Set((preferences.blocked || []).filter(id => allowed.has(id)));
  }
  status() { return { enabled: this.enabled, blockedFactIds: [...this.blocked], checksRequired: 2, supportedFactIds: [...allowed] }; }
  save() { this.store?.set('observation-preferences', 'automatic', { enabled: this.enabled, blocked: [...this.blocked] }); }
  configure(enabled, actor, engine) {
    engine.ledger.assertOperator(actor);
    if (typeof enabled !== 'boolean') throw new Error('Automatic recognition must be on or off.');
    const previous = this.enabled; this.enabled = enabled;
    try { this.save(); } catch (error) { this.enabled = previous; throw error; }
    this.reset();
  }
  block(ids) {
    for (const id of ids) if (allowed.has(id)) this.blocked.add(id);
    this.reset();
    try { this.save(); } catch (error) { this.enabled = false; throw error; }
  }
  reset() { this.streaks.clear(); this.context = ''; }
  process({ observer, engine, actor }) {
    engine.ledger.assertOperator(actor);
    const checked = observer.checkedEvidence;
    if (!this.enabled || !checked || !checked.source || checked.source.kind === 'synthetic') return [];
    if (checked.epoch !== engine.epoch || checked.source.id !== observer.source?.id || checked.source.generation !== observer.source?.generation) return [];
    const context = [engine.epoch, checked.source.id, checked.source.generation].join(':');
    if (context !== this.context) { this.reset(); this.context = context; }
    const current = new Set(); const ready = [];
    for (const detection of checked.detections) {
      const id = detection.factId;
      if (!allowed.has(id) || this.blocked.has(id) || engine.ledger.state.factIds.includes(id) || !detection.strict) continue;
      current.add(id);
      const previous = this.streaks.get(id), times = checked.source.mediaTimes;
      // Replayed/overlapping pairs, long gaps and weak/missing checks cannot accumulate proof.
      const continues = previous && checked.at - previous.at <= 12_000 && times[0] >= previous.mediaEnd + .1 && checked.at > previous.at;
      const next = { count: continues ? previous.count + 1 : 1, at: checked.at, mediaEnd: times[1], firstMediaTimes: continues ? previous.firstMediaTimes : times, firstFrames: continues ? previous.firstFrames : checked.frames, firstHashes: continues ? previous.firstHashes : checked.frameHashes };
      if (previous && times[0] <= previous.mediaEnd) continue;
      this.streaks.set(id, next);
      if (next.count >= 2) ready.push(id);
    }
    for (const id of this.streaks.keys()) if (!current.has(id)) this.streaks.delete(id);
    if (!ready.length) return [];
    const source = checked.source;
    engine.confirmAutomaticDiscoveries({ ids: ready, actor, evidence: 'Automatic local OCR: exact supported UI labels in 4 frames across 2 consecutive checks. Source ' + source.kind + ' ' + source.id + ', generation ' + source.generation + '. Names/UI facts only; no action or recipe relationship inferred.' });
    for (const candidate of observer.candidates.values()) if (ready.includes(candidate.factId) && candidate.sessionId === engine.epoch) {
      const proof = this.streaks.get(candidate.factId);
      candidate.status = 'confirmed'; candidate.automatic = true;
      candidate.frames = [...(proof?.firstFrames || candidate.frames), ...checked.frames];
      candidate.frameHashes = [...(proof?.firstHashes || candidate.frameHashes), ...checked.frameHashes];
      candidate.verification = { checks: 2, firstMediaTimes: proof?.firstMediaTimes, lastMediaTimes: source.mediaTimes }; 
      observer.store?.set('observations', candidate.id, candidate, candidate.expiresAt);
    }
    for (const id of ready) this.streaks.delete(id);
    return ready.map(id => ({ id, label: LOCAL_DISCOVERIES.find(item => item.factId === id).label }));
  }
}
