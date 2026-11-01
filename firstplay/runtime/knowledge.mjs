import { randomUUID } from 'node:crypto';

export class KnowledgeLedger {
  constructor({ catalog, store, clock = Date.now }) {
    Object.assign(this, { catalog, store, clock });
    this.state = store?.get('state', 'knowledge', clock()) || { revision: 0, factIds: [], relationIds: [] };
    this.operations = store?.list('knowledge-operations', clock()) || [];
    if ([...this.state.factIds, ...this.state.relationIds].some(id => !catalog.has(id))) throw new Error('Saved discoveries do not belong to this game pack.');
  }
  snapshot() { return structuredClone(this.state); }
  assertOperator(actor) {
    if (!actor?.id || !['owner', 'moderator'].includes(actor.role)) throw new Error('Only an authorized operator can confirm discoveries.');
  }
  update({ id, known, actor, evidence = 'Operator confirmation' }) {
    if (typeof known !== 'boolean') throw new Error('Invalid discovery update.');
    return this.updateMany({ ids: [id], known, actor, evidence });
  }
  updateMany({ ids, known, actor, evidence = 'Operator confirmation', eventId, automatic = false }) {
    this.assertOperator(actor);
    if (!Array.isArray(ids) || typeof known !== 'boolean') throw new Error('Invalid discovery update.');
    for (const id of ids) {
      if (!this.catalog.has(id)) throw new Error('Invalid discovery update.');
      if (known && !this.catalog.canConfirm(id)) throw new Error('This reference is outside the supported discovery scope.');
    }
    const changed = [...new Set(ids)].filter(id => this.state[this.catalog.get(id).type === 'relation' ? 'relationIds' : 'factIds'].includes(id) !== known);
    if (!changed.length) return this.snapshot();
    return this.commit(changed.map(id => ({ id, before: !known, after: known })), actor, evidence, { kind: automatic ? 'automatic' : eventId ? 'event' : known ? 'confirm' : 'revoke', eventId });
  }
  commit(changes, actor, evidence, details) {
    const next = structuredClone(this.state); next.revision++;
    for (const change of changes) { const key = this.catalog.get(change.id).type === 'relation' ? 'relationIds' : 'factIds'; next[key] = change.after ? [...new Set([...next[key], change.id])].sort() : next[key].filter(value => value !== change.id); }
    const operation = { id: randomUUID(), ...details, changes, fromRevision: this.state.revision, toRevision: next.revision, actorId: actor.id, authority: actor.role, evidence: String(evidence || 'Operator confirmation').slice(0, 400), at: this.clock() };
    this.store?.transaction(() => {
      this.store.set('state', 'knowledge', next); this.store.set('knowledge-operations', operation.id, operation);
      for (const change of changes) { const id = randomUUID(); this.store.set('knowledge-events', id, { id, factId: change.id, known: change.after, actorId: actor.id, authority: actor.role, evidence: operation.evidence, at: operation.at, revision: next.revision, operationId: operation.id }); }
    });
    this.state = next; this.operations.push(operation); return this.snapshot();
  }
  confirmEvent({ eventId, actor, evidence }) {
    this.assertOperator(actor);
    const event = this.catalog.events.get(eventId);
    if (!event) throw new Error('Unknown discovery event.');
    return this.updateMany({ ids: [...event.confirms_fact_ids, ...event.confirms_relation_ids], known: true, actor, evidence, eventId });
  }
  reset(actor) {
    this.assertOperator(actor);
    return this.commit([...this.state.factIds, ...this.state.relationIds].map(id => ({ id, before: true, after: false })), actor, 'Operator reset the discovery record.', { kind: 'reset' });
  }
  history(limit = 8) {
    const known = new Set([...this.state.factIds, ...this.state.relationIds]), operations = [...this.operations], covered = new Set(operations.map(operation => operation.toRevision)), legacy = new Map();
    for (const event of this.store?.list('knowledge-events') || []) {
      if (event.operationId || !Number.isInteger(event.revision) || covered.has(event.revision) || !this.catalog.has(event.factId)) continue;
      const key = event.revision, group = legacy.get(key) || { id: `earlier-${key}`, kind: 'earlier', legacy: true, changes: [], at: event.at, evidence: event.evidence, toRevision: key };
      group.changes.push({ id: event.factId, after: event.known }); legacy.set(key, group);
    }
    operations.push(...legacy.values());
    return operations.sort((a, b) => b.toRevision - a.toRevision).slice(0, limit).map(operation => ({ ...operation,
      label: operation.kind === 'automatic' ? 'Recognized automatically' : operation.kind === 'undo' ? 'Discovery change undone' : operation.kind === 'reset' ? 'Discovery record reset' : operation.kind === 'earlier' ? 'Earlier discovery confirmation' : operation.eventId ? this.catalog.events.get(operation.eventId)?.label || 'Observed discovery confirmed' : operation.kind === 'revoke' ? 'Discovery revoked' : 'Discovery confirmed',
      changes: operation.changes.map(change => ({ ...change, label: this.catalog.get(change.id)?.label || this.catalog.get(change.id)?.name || this.catalog.get(change.id)?.statement || change.id })),
      canUndo: !operation.legacy && operation.kind !== 'undo' && operation.toRevision === this.state.revision && operation.changes.length > 0 && operation.changes.every(change => known.has(change.id) === change.after),
    }));
  }
  undo({ operationId, expectedRevision, actor }) {
    this.assertOperator(actor);
    const operation = this.history(1)[0];
    if (expectedRevision !== this.state.revision || operation?.id !== operationId || !operation.canUndo) { const error = new Error('Only the latest unchanged discovery update can be undone. Refresh this view.'); error.status = 409; throw error; }
    return this.commit(operation.changes.map(change => ({ id: change.id, before: change.after, after: change.before })), actor, `Operator undid discovery update ${operation.id}.`, { kind: 'undo', undoOf: operation.id });
  }
}
