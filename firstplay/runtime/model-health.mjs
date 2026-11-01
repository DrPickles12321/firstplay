import { randomUUID } from 'node:crypto';

// An explicit owner-requested round trip; it never enters chat or creates a receipt.
export class ModelHealth {
  constructor({ clock = Date.now } = {}) { this.clock = clock; this.state = { state: 'unchecked', checkedAt: null }; this.pending = null; this.closed = false; }
  status() { return { ...this.state }; }
  check({ engine, actor, assertCurrent }) {
    if (actor?.role !== 'owner') { const error = new Error('Only the owner can test the model connection.'); error.status = 403; throw error; }
    if (this.closed) throw new Error('The model check is closed.');
    if (this.pending) return this.pending;
    if (this.state.checkedAt != null && this.clock() - this.state.checkedAt < 10_000) return Promise.resolve(this.status());
    this.state = { state: 'checking', checkedAt: this.state.checkedAt };
    const controller = new AbortController(); this.controller = controller;
    const work = this.run({ engine, assertCurrent, signal: controller.signal }); this.pending = work;
    void work.finally(() => { if (this.pending === work) this.pending = null; if (this.controller === controller) this.controller = null; }).catch(() => {});
    return work;
  }
  async run({ engine, assertCurrent, signal }) {
    const started = this.clock(), id = randomUUID();
    try {
      const result = await engine.provider.classify(engine.catalog, [{ id, text: 'Hello everyone, this is a connection check.', ...engine.snapshot() }], { signal });
      assertCurrent();
      if (signal.aborted || this.closed) throw Object.assign(new Error('Check canceled.'), { code: 'aborted' });
      const row = result?.results?.get(id);
      if (!row || row.message_id !== id || row.relevance !== 'none' || !Array.isArray(row.intents) || !row.intents.includes('social') || row.recommended_disposition !== 'allow' || row.uncertain !== false || row.unknown_information !== false || row.unresolved_reference !== false || !Array.isArray(row.references) || row.references.length) throw Object.assign(new Error('The model did not return the expected safe structured response.'), { code: 'invalid_probe_response' });
      this.state = { state: 'ready', checkedAt: this.clock(), latencyMs: result.metrics?.latencyMs || this.clock() - started };
      engine.metrics.lastError = null;
      return this.status();
    } catch (error) {
      if (error.status === 409) { this.state = { state: 'unchecked', checkedAt: null }; throw error; }
      const allowed = new Set(['usage_limit', 'login_required', 'codex_not_found', 'provider_not_configured', 'provider_timeout', 'invalid_probe_response', 'aborted']);
      this.state = { state: 'failed', checkedAt: this.clock(), errorCode: allowed.has(error.code) ? error.code : 'provider_failed' };
      return this.status();
    }
  }
  close() { this.closed = true; this.controller?.abort(); }
}
