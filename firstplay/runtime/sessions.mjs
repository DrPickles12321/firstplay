import { randomUUID } from 'node:crypto';
import { GAME_DEFINITIONS, GameCatalog } from '../ml/catalog.mjs';
import { normalizePolicy } from '../ml/policy.mjs';
import { ProgressObserver } from '../ml/observer.mjs';
import { NativeTextRecognizer, subnauticaLabelDetector } from '../ml/local-text.mjs';
import { ScreeningEngine } from './engine.mjs';
import { ScopedStore } from './store.mjs';

const conflict = message => { const error = new Error(message); error.status = 409; throw error; };

export class GameSessions {
  static async create({ store, provider, catalog, clock = Date.now }) {
    const catalogs = new Map(await Promise.all(GAME_DEFINITIONS.map(async definition => [definition.id, catalog?.gameId === definition.id ? catalog : await GameCatalog.load(definition.id)])));
    if (catalog && !catalogs.has(catalog.gameId)) catalogs.set(catalog.gameId, catalog);
    return new GameSessions({ store, provider, catalogs, defaultGame: catalog?.gameId || 'mario', clock });
  }
  constructor({ store, provider, catalogs, defaultGame, clock }) {
    Object.assign(this, { store, provider, catalogs, clock });
    let active = store.get('state', 'active-game-run');
    if (!active) {
      const catalog = catalogs.get(defaultGame), run = this.newRun(catalog);
      const legacyKnowledge = defaultGame === 'mario' ? store.get('state', 'knowledge') : null;
      const legacyPolicy = defaultGame === 'mario' ? store.get('state', 'policy') : null;
      if (legacyKnowledge && [...legacyKnowledge.factIds, ...legacyKnowledge.relationIds].some(id => !catalog.has(id))) throw new Error('Legacy Mario discoveries need review before migration.');
      if (legacyPolicy) normalizePolicy(legacyPolicy.policy);
      const scoped = this.runStore(run);
      active = { runId: run.id, selectionRevision: 1 };
      store.transaction(() => {
        store.set('game-runs', run.id, run); store.set('state', 'active-game-run', active);
        if (legacyKnowledge) scoped.set('state', 'knowledge', legacyKnowledge);
        if (legacyPolicy) scoped.set('state', 'policy', legacyPolicy);
        if (defaultGame === 'mario') for (const event of store.list('knowledge-events')) scoped.set('knowledge-events', event.id || randomUUID(), event);
      });
    }
    const run = store.get('game-runs', active.runId);
    if (!run) throw new Error('Saved active session is missing.');
    this.active = active; this.install(this.prepare(run));
  }
  owner(actor) { if (!actor?.id || actor.role !== 'owner') { const error = new Error('Only the owner can change game sessions.'); error.status = 403; throw error; } }
  assertCurrent(expectedRunId) { if (expectedRunId !== this.run.id) conflict('The game session changed. Refresh this view and try again.'); }
  runStore(run) { return new ScopedStore(this.store, `game:${run.gameId}:run:${run.id}`); }
  newRun(catalog) { return { id: randomUUID(), gameId: catalog.gameId, packId: catalog.pack.id, packVersion: catalog.pack.version, createdAt: this.clock() }; }
  prepare(run) {
    const catalog = this.catalogs.get(run.gameId);
    if (!catalog || run.packId !== catalog.pack.id || run.packVersion !== catalog.pack.version) throw new Error('This saved run uses an unavailable pack revision.');
    const engine = new ScreeningEngine({ catalog, provider: this.provider, store: this.runStore(run), clock: this.clock });
    engine.runId = run.id;
    const localDetector = catalog.summary().localObservationEnabled ? subnauticaLabelDetector({ recognizer: new NativeTextRecognizer(), isKnown: id => engine.ledger.state.factIds.includes(id) }) : undefined;
    const observer = new ProgressObserver({ catalog, provider: this.provider, store: this.runStore(run), clock: this.clock, localDetector });
    return { run, catalog, engine, observer };
  }
  install(prepared) { this.engine?.close(); this.observer?.close(); Object.assign(this, prepared); this.engine.session = this.summary(); }
  start(gameId, actor, expectedRunId) {
    this.owner(actor); this.assertCurrent(expectedRunId);
    const catalog = this.catalogs.get(gameId);
    if (!catalog) throw new Error('Unsupported game.');
    const run = this.newRun(catalog), prepared = this.prepare(run), active = { runId: run.id, selectionRevision: this.active.selectionRevision + 1 };
    try { this.store.transaction(() => { this.store.set('game-runs', run.id, run); this.store.set('state', 'active-game-run', active); this.runStore(this.run).delete('observation-source', 'active'); }); }
    catch (error) { prepared.engine.close(); prepared.observer.close(); throw error; }
    this.active = active; this.install(prepared); return this.summary();
  }
  restore(runId, actor, expectedRunId) {
    this.owner(actor); this.assertCurrent(expectedRunId);
    const run = this.store.get('game-runs', runId);
    if (!run) throw new Error('Saved session not found.');
    const prepared = this.prepare(run), active = { runId: run.id, selectionRevision: this.active.selectionRevision + 1 };
    try { this.store.transaction(() => { this.store.set('state', 'active-game-run', active); this.runStore(this.run).delete('observation-source', 'active'); }); }
    catch (error) { prepared.engine.close(); prepared.observer.close(); throw error; }
    this.active = active; this.install(prepared); return this.summary();
  }
  summary() { return { runId: this.run.id, selectionRevision: this.active.selectionRevision, startedAt: this.run.createdAt, ...this.catalog.summary() }; }
  games() { return [...this.catalogs.values()].map(catalog => ({ ...catalog.summary(), recordingUrl: catalog.definition.recordingUrl || null })); }
  savedRuns() {
    return this.store.list('game-runs').filter(run => this.catalogs.has(run.gameId)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(run => {
      const knowledge = this.runStore(run).get('state', 'knowledge');
      return { ...run, name: this.catalogs.get(run.gameId).pack.game, knownCount: (knowledge?.factIds.length || 0), active: run.id === this.run.id };
    });
  }
  close() { this.engine.close(); this.observer.close(); }
}
