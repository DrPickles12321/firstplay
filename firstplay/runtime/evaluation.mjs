import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { researchDirectory } from '../ml/catalog.mjs';
import { INFERENCE_PROTOCOL } from '../ml/contracts.mjs';
import { CLASSIFIER_INSTRUCTIONS } from '../ml/prompt.mjs';

const conflict = message => { const error = new Error(message); error.status = 409; throw error; };
export const caseFingerprint = row => createHash('sha256').update(JSON.stringify({ id: row.id, game: row.game_id, pack: row.pack_version, policy: row.policy, facts: row.known_fact_ids, relations: row.known_relation_ids || [], context: row.context, message: row.message })).digest('hex');
export async function evaluationVersion() {
  return { promptHash: createHash('sha256').update(CLASSIFIER_INSTRUCTIONS).digest('hex'), policyHash: createHash('sha256').update(await readFile(new URL('../ml/policy.mjs', import.meta.url))).digest('hex') };
}

export class EvaluationDesk {
  constructor({ store, directory, clock = Date.now }) { Object.assign(this, { store, directory, clock }); this.exports = new Map(); }
  sets(catalog) { return [{ id: 'main', label: 'Opening cases', path: catalog.definition.dataset, report: `evaluation-${catalog.gameId}-latest.json` }, ...(catalog.gameId === 'subnautica' ? [{ id: 'adversarial', label: 'Adversarial cases', path: 'subnautica/adversarial-cases.jsonl', report: 'evaluation-subnautica-adversarial.json' }] : [])]; }
  definition(catalog, setId = 'main') { const set = this.sets(catalog).find(set => set.id === setId); if (!set) throw new Error('Unknown case set.'); return set; }
  namespace(catalog, setId) { return `case-labels:${catalog.gameId}:${catalog.pack.version}${setId === 'main' ? '' : `:${setId}`}`; }
  filename(catalog, setId = 'main') { this.definition(catalog, setId); return `reviewed-cases${catalog.gameId === 'mario' ? '' : `.${catalog.gameId}`}${setId === 'main' ? '' : `.${setId}`}.jsonl`; }
  async cases(catalog, setId = 'main') {
    const definition = this.definition(catalog, setId), rows = (await readFile(resolve(researchDirectory, definition.path), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
    const seen = new Set();
    return rows.map(row => {
      if (seen.has(row.id) || row.game_id && ![catalog.gameId, catalog.pack.id].includes(row.game_id) || row.pack_version && row.pack_version !== catalog.pack.version || [...row.known_fact_ids, ...(row.known_relation_ids || [])].some(id => !catalog.has(id))) throw new Error('Case data does not match the current pack.');
      seen.add(row.id); const sourceHash = caseFingerprint(row), saved = this.store.get(this.namespace(catalog, setId), row.id) || (catalog.gameId === 'mario' && setId === 'main' && this.store.get('case-labels', row.id));
      const current = saved && (saved.source_hash || caseFingerprint(saved)) === sourceHash;
      return { ...(current ? saved : row), source_hash: sourceHash, review_revision: current ? saved.review_revision || 1 : 0, draft_disposition: row.expected_disposition, draft_reason: row.expected_reason, stale_review: Boolean(saved && !current) };
    });
  }
  async save({ catalog, setId = 'main', id, expected, note, sourceHash, expectedRevision, actor, assertCurrent }) {
    if (actor?.role !== 'owner') { const error = new Error('Only the owner can review evaluation labels.'); error.status = 403; throw error; }
    if (!['allow', 'reject', 'review'].includes(expected) || typeof note !== 'string' || note.length > 1000) throw new Error('Choose an outcome and keep the note under 1,000 characters.');
    const rows = await this.cases(catalog, setId); assertCurrent(); const row = rows.find(row => row.id === id);
    if (!row) throw new Error('Unknown test case.');
    if (sourceHash !== row.source_hash || expectedRevision !== row.review_revision) conflict('This case or its review changed. Refresh before saving your judgment.');
    const reviewed = { ...row, status: 'human_reviewed', reviewed_by: actor.id, reviewed_at: new Date(this.clock()).toISOString(), expected_disposition: expected, review_note: note.trim(), review_revision: row.review_revision + 1 };
    this.store.transaction(() => {
      this.store.set(this.namespace(catalog, setId), row.id, reviewed);
      this.store.set('case-review-events', randomUUID(), { kind: 'saved', caseId: id, gameId: catalog.gameId, packVersion: catalog.pack.version, setId, sourceHash, revision: reviewed.review_revision, expected, note: reviewed.review_note, actorId: actor.id, at: this.clock() });
    });
    let exportWarning = null;
    try { await this.persistExport(catalog, setId); } catch { exportWarning = 'Your review is saved. The local export file could not be updated; Download reviewed cases still uses the saved records.'; }
    return { reviewed, exportWarning };
  }
  async reopen({ catalog, setId = 'main', id, sourceHash, expectedRevision, actor, assertCurrent }) {
    if (actor?.role !== 'owner') { const error = new Error('Only the owner can reopen evaluation labels.'); error.status = 403; throw error; }
    const rows = await this.cases(catalog, setId); assertCurrent(); const row = rows.find(row => row.id === id);
    if (!row || row.status !== 'human_reviewed' || row.source_hash !== sourceHash || row.review_revision !== expectedRevision) conflict('This case or its review changed. Refresh before reopening it.');
    const reopened = { ...row, status: 'draft_requires_user_review', expected_disposition: row.draft_disposition, reviewed_by: null, reviewed_at: null, review_note: '', review_revision: row.review_revision + 1 };
    this.store.transaction(() => {
      this.store.set(this.namespace(catalog, setId), row.id, reopened);
      this.store.set('case-review-events', randomUUID(), { kind: 'reopened', caseId: id, gameId: catalog.gameId, packVersion: catalog.pack.version, setId, sourceHash, revision: reopened.review_revision, previousExpected: row.expected_disposition, previousNote: row.review_note, actorId: actor.id, at: this.clock() });
    });
    let exportWarning = null; try { await this.persistExport(catalog, setId); } catch { exportWarning = 'Case reopened. The local export could not be updated; Download reviewed cases uses the current saved records.'; }
    return { reopened, exportWarning };
  }
  async export(catalog, setId = 'main') {
    const rows = (await this.cases(catalog, setId)).filter(row => row.status === 'human_reviewed');
    return { filename: this.filename(catalog, setId), count: rows.length, text: rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '') };
  }
  persistExport(catalog, setId) {
    const path = resolve(this.directory, this.filename(catalog, setId));
    const previous = this.exports.get(path) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const output = await this.export(catalog, setId), temporary = `${path}.${randomUUID()}.tmp`;
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      try { await writeFile(temporary, output.text, { mode: 0o600 }); await rename(temporary, path); }
      finally { await rm(temporary, { force: true }); }
    });
    this.exports.set(path, next); next.finally(() => { if (this.exports.get(path) === next) this.exports.delete(path); }).catch(() => {}); return next;
  }
  async report(catalog, setId = 'main') {
    const definition = this.definition(catalog, setId); let report = null;
    try { report = JSON.parse(await readFile(resolve(this.directory, definition.report), 'utf8')); } catch { /* no run */ }
    if (!report && catalog.gameId === 'mario' && setId === 'main') try { report = JSON.parse(await readFile(resolve(this.directory, 'evaluation-latest.json'), 'utf8')); } catch { /* no historical run */ }
    if (report && (report.gameId && report.gameId !== catalog.gameId || report.packId && report.packId !== catalog.pack.id || report.packVersion && report.packVersion !== catalog.pack.version)) return { report: null, outdated: true };
    if (report && report.inferenceProtocol !== INFERENCE_PROTOCOL) return { report: null, outdated: true, outdatedReason: 'This saved run predates anonymous model IDs. Run evaluation again before comparing decisions.' };
    if (report) {
      const version = await evaluationVersion();
      if (report.promptHash !== version.promptHash || report.policyHash !== version.policyHash) return { report: null, outdated: true, outdatedReason: 'The classifier instructions or policy changed since this run. Run evaluation again before comparing decisions.' };
    }
    if (report?.kind === 'reviewed_label_evaluation' && report.results?.every(row => row.caseSourceHash)) {
      const current = new Map((await this.cases(catalog, setId)).map(row => [row.id, row]));
      if (report.results.some(row => { const now = current.get(row.id); return !now || now.status !== 'human_reviewed' || now.source_hash !== row.caseSourceHash || now.review_revision !== row.sourceReviewRevision || now.expected_disposition !== row.expected; })) return { report: null, outdated: true };
    } else if (report?.datasetHash) {
      const current = createHash('sha256').update(await readFile(resolve(researchDirectory, definition.path))).digest('hex');
      if (report.datasetHash !== current) return { report: null, outdated: true };
    }
    return { report, outdated: false, unbound: Boolean(report && !report.results?.every(row => row.caseSourceHash)) };
  }
}
