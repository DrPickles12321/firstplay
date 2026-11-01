import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { KnowledgeLedger } from './knowledge.mjs';
import { enforcePolicy, normalizePolicy } from '../ml/policy.mjs';
import { validateClassifications } from '../ml/contracts.mjs';
import { InterpretationReuse } from '../ml/reuse.mjs';

const FINAL_HIDDEN = new Set(['reject', 'expired', 'removed']);
export class ScreeningEngine extends EventEmitter {
  constructor({ catalog, provider, store, clock = Date.now, batchWaitMs = 200, maxBatch = 8, maxPending = 100, maxReview = 100, reviewTtlMs = 30_000, pendingTtlMs = 60_000, retentionMs = 3_600_000, maxWorkers = 1, maxBatchesPerMinute = 12 } = {}) {
    super(); Object.assign(this, { catalog, provider, store, clock, batchWaitMs, maxBatch, maxPending, maxReview, reviewTtlMs, pendingTtlMs, retentionMs, maxWorkers, maxBatchesPerMinute });
    this.ledger = new KnowledgeLedger({ catalog, store, clock });
    this.reuse = new InterpretationReuse({ clock });
    const saved = store?.get('state', 'policy', clock());
    this.policy = normalizePolicy(saved?.policy); this.policyRevision = saved?.revision || 0;
    this.objective = saved?.objective || '';
    this.messages = new Map(); this.queue = []; this.workers = 0; this.controllers = new Set(); this.batchStarts = [];
    this.epoch = randomUUID(); this.paused = store?.get('state', 'reader-preferences', clock())?.paused === true; this.closed = false; this.helpRequest = null;
    this.metrics = { received: 0, allowed: 0, rejected: 0, reviewed: 0, expired: 0, failures: 0, batches: 0, cacheHits: 0, repeatedInBatch: 0, screeningMs: [], latencyMs: [], usage: [], lastError: null, lastSuccessAt: null };
    for (const record of store?.list('messages', clock()) || []) {
      if (['pending', 'review'].includes(record.disposition)) { record.disposition = 'expired'; record.reasonCode = 'service_restarted'; }
      this.messages.set(record.id, record);
    }
  }
  snapshot() {
    const helpRequest = this.helpRequest?.remaining && this.helpRequest.expiresAt > this.clock() ? structuredClone(this.helpRequest) : null;
    return { runId: this.runId || null, gameId: this.catalog.gameId, knowledge: this.ledger.snapshot(), policy: { ...this.policy, allowGentleHints: this.policy.allowGentleHints || Boolean(helpRequest) }, policyRevision: this.policyRevision, objective: this.objective, epoch: this.epoch, helpRequest };
  }
  persist(record) { this.store?.set('messages', record.id, record, record.receivedAt + this.retentionMs); }
  changed() { this.emit('change'); }

  ingest({ id = randomUUID(), text, senderId = 'demo-viewer', displayName = 'viewer', replyTo = null, source = 'replay', channelId = 'demo' }) {
    if (this.closed) throw new Error('Screening service is closed.');
    if (this.messages.has(id)) return this.messages.get(id);
    if (typeof id !== 'string' || !id || id.length > 160 || typeof senderId !== 'string' || !senderId || senderId.length > 160 || typeof text !== 'string' || !text.trim() || text.length > 2000 || (replyTo !== null && (typeof replyTo !== 'string' || replyTo.length > 160))) throw new Error('Invalid message.');
    const record = { id, text, senderId, displayName: String(displayName).slice(0, 100), replyTo, source, channelId, receivedAt: this.clock(), snapshot: this.snapshot(), disposition: 'pending', reasonCode: 'checking', reason: 'Checking message.', deliveredAt: null, epoch: this.epoch, interpretation: null };
    this.messages.set(id, record); this.metrics.received++;
    const parent = replyTo && this.messages.get(replyTo);
    if (parent && (FINAL_HIDDEN.has(parent.disposition) || parent.epoch !== this.epoch)) this.decide(record, { disposition: 'reject', code: 'parent_hidden', reason: 'The replied-to message is unavailable in the protected reader.' });
    else if (replyTo && !parent) this.decide(record, { disposition: 'review', code: 'missing_parent', reason: 'Reply context is unavailable.' });
    else if (this.pendingCount() > this.maxPending) this.decide(record, { disposition: 'expired', code: 'queue_capacity', reason: 'The screening queue is at capacity.' });
    else this.queue.push(id);
    this.persist(record); this.schedule(); this.changed();
    return record;
  }
  pendingCount() { return [...this.messages.values()].filter(record => record.disposition === 'pending').length; }
  schedule() {
    if (this.closed || this.timer || !this.queue.length) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.batchWaitMs);
  }
  async flush() {
    if (this.closed || this.workers >= this.maxWorkers) return;
    clearTimeout(this.timer); this.timer = null; this.prune();
    const selected = [];
    this.queue = this.queue.filter(id => this.messages.get(id)?.disposition === 'pending');
    for (const id of this.queue) {
      const record = this.messages.get(id);
      const parent = record.replyTo && this.messages.get(record.replyTo);
      if (parent && (FINAL_HIDDEN.has(parent.disposition) || parent.epoch !== this.epoch)) { this.decide(record, { disposition: 'reject', code: 'parent_hidden', reason: 'The replied-to message is hidden.' }); continue; }
      if (parent && parent.disposition !== 'allow') continue;
      selected.push(record);
      if (selected.length >= this.maxBatch) break;
    }
    const chosen = new Set(selected.map(record => record.id));
    this.queue = this.queue.filter(id => !chosen.has(id) && this.messages.get(id)?.disposition === 'pending');
    if (!selected.length) return;
    this.workers++;
    const controller = new AbortController(); this.controllers.add(controller);
    try {
      const items = selected.map(record => ({ id: record.id, text: record.text, ...record.snapshot,
        reply: record.replyTo ? { id: record.replyTo, disposition: this.messages.get(record.replyTo)?.disposition, text: this.messages.get(record.replyTo)?.text || '' } : null }));
      for (const record of selected) record.screeningStartedAt = this.clock();
      const plan = this.reuse.plan(this.catalog, items, this.provider);
      let fresh;
      if (plan.requests.length) {
        this.batchStarts = this.batchStarts.filter(at => at > this.clock() - 60_000);
        if (this.batchStarts.length >= this.maxBatchesPerMinute) {
          this.metrics.lastError = 'model_budget_reached';
          for (const record of selected) this.decide(record, { disposition: 'expired', code: 'model_budget_reached', reason: 'The model request budget was reached; this message stayed hidden.' });
          return;
        }
        this.batchStarts.push(this.clock()); this.metrics.batches++;
        fresh = await this.provider.classify(this.catalog, plan.requests, { signal: controller.signal, gameContext: plan.gameContext });
      }
      if (this.closed) return;
      const response = plan.complete(fresh);
      validateClassifications({ results: [...response.results.values()] }, selected.map(record => record.id), new Set(this.catalog.contextFor(items).references.map(reference => reference.id)));
      this.metrics.cacheHits += response.metrics.cacheHits; this.metrics.repeatedInBatch += response.metrics.repeatedInBatch;
      if (response.metrics.modelRequests) { this.metrics.lastError = null; this.metrics.lastSuccessAt = this.clock(); }
      if (response.metrics.modelRequests && Number.isFinite(response.metrics.latencyMs)) {
        this.metrics.latencyMs.push(response.metrics.latencyMs);
        this.metrics.latencyMs = this.metrics.latencyMs.slice(-100);
        this.metrics.usage.push(response.metrics.usage); this.metrics.usage = this.metrics.usage.slice(-100);
      }
      for (const record of selected) {
        if (record.disposition !== 'pending') continue;
        if (record.snapshot.knowledge.revision !== this.ledger.state.revision || record.snapshot.policyRevision !== this.policyRevision || record.epoch !== this.epoch) {
          this.decide(record, { disposition: 'review', code: 'state_changed', reason: 'Discovery state or permissions changed while checking.' }); continue;
        }
        const interpretation = response.results.get(record.id);
        if (!interpretation) throw new Error('Missing classification.');
        record.interpretation = interpretation;
        let decision = enforcePolicy(interpretation, record.snapshot, this.catalog);
        if (decision.disposition === 'allow' && record.snapshot.helpRequest && interpretation.intents.some(intent => ['search_hint', 'strategic_reminder'].includes(intent))) {
          record.hintRequestId = record.snapshot.helpRequest.id;
          decision = { disposition: 'review', code: 'requested_hint_candidate', reason: 'One hint requested. A moderator must verify its topic and release it.' };
        }
        this.decide(record, decision);
      }
    } catch (error) {
      if (this.closed) return;
      this.metrics.failures++; this.metrics.lastError = error.code || 'classifier_error';
      for (const record of selected) if (record.disposition === 'pending') this.decide(record, { disposition: 'review', code: error.code || 'classifier_error', reason: 'Classification did not complete. Message remains hidden.' });
    } finally {
      this.controllers.delete(controller); this.workers--; this.changed();
      if (this.queue.length) this.schedule();
    }
  }
  decide(record, decision) {
    if (FINAL_HIDDEN.has(record.disposition)) return;
    if (record.disposition === 'pending') {
      record.screeningFinishedAt = this.clock();
      this.metrics.screeningMs.push(Math.max(0, record.screeningFinishedAt - record.receivedAt));
      this.metrics.screeningMs = this.metrics.screeningMs.slice(-100);
    }
    const parent = record.replyTo && this.messages.get(record.replyTo);
    if (decision.disposition === 'allow' && record.replyTo && (parent?.disposition !== 'allow' || parent.epoch !== this.epoch)) decision = { disposition: 'reject', code: 'parent_hidden', reason: 'Reply parent is not available in this reader session.' };
    if (decision.disposition === 'review') {
      const count = [...this.messages.values()].filter(item => item.id !== record.id && item.disposition === 'review').length;
      if (count >= this.maxReview) decision = { disposition: 'expired', code: 'review_capacity', reason: 'Review queue capacity was reached.' };
      else record.reviewExpiresAt = this.clock() + this.reviewTtlMs;
    }
    record.disposition = decision.disposition; record.reasonCode = decision.code; record.reason = decision.reason;
    record.decidedAt = this.clock();
    const metric = { allow: 'allowed', reject: 'rejected', review: 'reviewed', expired: 'expired' }[decision.disposition];
    if (metric) this.metrics[metric]++;
    this.persist(record);
    if (FINAL_HIDDEN.has(record.disposition)) {
      for (const child of this.messages.values()) if (child.replyTo === record.id && ['pending', 'review'].includes(child.disposition)) this.decide(child, { disposition: 'reject', code: 'parent_hidden', reason: 'Reply parent was rejected or expired.' });
    }
  }
  setPolicy(value, actor, objective = this.objective) {
    this.ledger.assertOperator(actor);
    const policy = normalizePolicy(value), nextObjective = String(objective).slice(0, 500), revision = this.policyRevision + 1;
    this.store?.set('state', 'policy', { policy, revision, objective: nextObjective });
    this.policy = policy; this.objective = nextObjective; this.helpRequest = null; this.policyRevision = revision; this.epoch = randomUUID();
    this.reuse.clear();
    this.changed(); return this.snapshot();
  }
  setPaused(paused, actor) {
    this.ledger.assertOperator(actor);
    if (typeof paused !== 'boolean') throw new Error('Pause state must be a boolean.');
    this.store?.set('state', 'reader-preferences', { paused });
    this.paused = paused; this.changed();
  }
  requestHint(topic, actor) {
    this.ledger.assertOperator(actor);
    if (this.policy.mode !== 'discovery' || this.policy.allowGentleHints) throw new Error('Use Discovery with ongoing hints off to request one hint.');
    if (typeof topic !== 'string' || !topic.trim() || topic.length > 500) throw new Error('Enter the current obstacle to scope the hint.');
    this.helpRequest = { id: randomUUID(), topic: topic.trim(), remaining: 1, expiresAt: this.clock() + 60_000 }; this.policyRevision++; this.changed();
    return this.helpRequest;
  }
  confirmDiscovery({ id, known = true, eventId, actor, evidence }) {
    const value = eventId ? this.ledger.confirmEvent({ eventId, actor, evidence }) : this.ledger.update({ id, known, actor, evidence });
    this.reuse.clear();
    if (!known) this.epoch = randomUUID();
    this.changed(); return value;
  }
  confirmAutomaticDiscoveries({ ids, actor, evidence }) {
    const value = this.ledger.updateMany({ ids, known: true, actor, evidence, automatic: true });
    this.reuse.clear(); this.changed(); return value;
  }
  undoDiscovery({ operationId, expectedRevision, actor }) {
    const value = this.ledger.undo({ operationId, expectedRevision, actor });
    this.epoch = randomUUID(); this.reuse.clear(); this.changed(); return value;
  }
  review(id, action, actor) {
    this.ledger.assertOperator(actor); this.prune();
    const record = this.messages.get(id);
    if (!record || record.disposition !== 'review') throw new Error('This message is no longer awaiting review.');
    if (!['allow', 'reject'].includes(action)) throw new Error('Invalid review action.');
    if (action === 'allow' && record.hintRequestId) {
      if (this.helpRequest?.id !== record.hintRequestId || !this.helpRequest.remaining || this.helpRequest.expiresAt <= this.clock()) throw new Error('This one-hint permission has expired or been used.');
      this.helpRequest.remaining = 0; this.policyRevision++;
    }
    record.reviewedBy = actor.id;
    // Manual release is an explicit, audited exception, never a discovery confirmation.
    if (action === 'allow') { record.epoch = this.epoch; record.snapshot = this.snapshot(); }
    this.decide(record, { disposition: action, code: 'moderator_decision', reason: action === 'allow' ? 'Released by a moderator.' : 'Rejected by a moderator.' });
    this.store?.set('review-events', randomUUID(), { messageId: id, action, actorId: actor.id, at: this.clock() }, this.clock() + this.retentionMs);
    this.changed(); this.schedule();
  }
  remove(id) {
    const record = this.messages.get(id);
    if (!record) { const tombstone = { id, senderId: '', text: '', disposition: 'removed', receivedAt: this.clock(), epoch: this.epoch }; this.messages.set(id, tombstone); this.persist(tombstone); this.changed(); return; }
    const pending = [record], removed = new Set();
    while (pending.length) {
      const current = pending.shift(); if (removed.has(current.id)) continue; removed.add(current.id);
      current.disposition = 'removed'; current.reasonCode = current.id === id ? 'removed' : 'parent_removed'; this.persist(current);
      for (const child of this.messages.values()) if (child.replyTo === current.id && !removed.has(child.id)) pending.push(child);
    }
    this.changed();
  }
  removeUser(id) { for (const record of this.messages.values()) if (record.senderId === id) this.remove(record.id); }
  clear() { for (const id of this.messages.keys()) this.remove(id); this.epoch = randomUUID(); this.reuse.clear(); this.changed(); }
  prune() {
    const now = this.clock();
    this.reuse.prune();
    if (this.helpRequest && this.helpRequest.expiresAt <= now) { this.helpRequest = null; this.policyRevision++; }
    for (const [id, record] of this.messages) {
      if (record.receivedAt + this.retentionMs <= now) { this.messages.delete(id); this.store?.delete('messages', id); continue; }
      if (record.disposition === 'review' && record.hintRequestId && (this.helpRequest?.id !== record.hintRequestId || !this.helpRequest.remaining)) this.decide(record, { disposition: 'expired', code: 'hint_permission_closed', reason: 'One-hint permission has closed.' });
      else if (record.disposition === 'review' && record.reviewExpiresAt <= now) this.decide(record, { disposition: 'expired', code: 'review_expired', reason: 'Moderator review expired.' });
      else if (record.disposition === 'pending' && record.receivedAt + this.pendingTtlMs <= now) this.decide(record, { disposition: 'expired', code: 'classification_expired', reason: 'Classification expired.' });
    }
    this.store?.prune(now);
  }
  safeFeed() {
    this.prune();
    return { epoch: this.epoch, session: this.session || { ...this.catalog.summary(), runId: this.runId || null }, paused: this.paused, screening: this.screeningStatus(), messages: this.paused ? [] : [...this.messages.values()].filter(record => record.disposition === 'allow' && record.epoch === this.epoch).slice(-250).map(record => ({ id: record.id, text: record.text, displayName: record.displayName, senderId: record.senderId, receivedAt: record.receivedAt, source: record.source })) };
  }
  screeningStatus() {
    const pending = [...this.messages.values()].filter(record => record.disposition === 'pending');
    const oldestPendingAgeMs = pending.length ? Math.max(0, this.clock() - Math.min(...pending.map(record => record.receivedAt))) : 0;
    const sorted = [...this.metrics.screeningMs].sort((a, b) => a - b);
    const percentile = value => sorted.length ? sorted[Math.ceil(value * sorted.length) - 1] : null;
    return { state: this.paused ? 'paused' : this.metrics.lastError ? 'unavailable' : oldestPendingAgeMs >= 5000 ? 'delayed' : pending.length ? 'checking' : 'ready', pending: pending.length, oldestPendingAgeMs, errorCode: this.metrics.lastError,
      decisionLatency: { samples: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95) }, modelRequests: this.metrics.batches, cacheHits: this.metrics.cacheHits, repeatedInBatch: this.metrics.repeatedInBatch };
  }
  acknowledge(ids, actor) {
    if (actor?.role !== 'reader' || !actor.id) throw new Error('Only the primary reader can acknowledge delivery.');
    for (const id of ids.slice(0, 250)) {
      const record = this.messages.get(id);
      if (record?.disposition === 'allow' && record.epoch === this.epoch && !this.paused && !record.deliveredAt) { record.deliveredAt = this.clock(); record.deliveredTo = actor.id; this.persist(record); }
    }
    this.changed();
  }
  viewerState(actor) {
    if (actor?.role !== 'viewer' || !actor.senderId) throw new Error('Viewer identity is required.');
    this.prune();
    return { messages: [...this.messages.values()].filter(record => record.senderId === actor.senderId).slice(-100).map(record => ({ id: record.id, text: record.text, receivedAt: record.receivedAt,
      status: record.disposition === 'allow' ? record.deliveredAt ? 'delivered' : 'approved' : record.disposition === 'reject' ? 'not_delivered' : record.disposition,
      deliveredAt: record.deliveredAt || null })) };
  }
  moderatorState() {
    this.prune();
    return { policy: this.policy, objective: this.objective, helpRequest: this.helpRequest, knowledge: this.ledger.snapshot(), discoveryActivity: this.ledger.history(), metrics: this.metrics, paused: this.paused,
      review: [...this.messages.values()].filter(record => record.disposition === 'review'), recent: [...this.messages.values()].slice(-100),
      facts: [...this.catalog.references.values()].filter(reference => reference.type === 'fact' || reference.type === 'relation'), events: [...this.catalog.events.values()] };
  }
  close() { this.closed = true; clearTimeout(this.timer); this.reuse.clear(); for (const controller of this.controllers) controller.abort(); }
}
