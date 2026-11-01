import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CLASSIFIER_INSTRUCTIONS } from '../ml/prompt.mjs';
import { GameCatalog, gameDefinition, researchDirectory } from '../ml/catalog.mjs';
import { createProvider } from '../ml/providers.mjs';
import { enforcePolicy, normalizePolicy } from '../ml/policy.mjs';
import { caseFingerprint } from '../runtime/evaluation.mjs';
import { INFERENCE_PROTOCOL } from '../ml/contracts.mjs';

const { values } = parseArgs({ options: {
  game: { type: 'string', default: 'mario' }, dataset: { type: 'string' },
  provider: { type: 'string', default: process.env.FIRSTPLAY_PROVIDER || 'codex' },
  'include-drafts': { type: 'boolean', default: false }, limit: { type: 'string', default: '300' },
  output: { type: 'string' },
} });

try {
  const policyHash = createHash('sha256').update(await readFile(new URL('../ml/policy.mjs', import.meta.url))).digest('hex');
  const catalog = await GameCatalog.load(values.game);
  const dataset = values.dataset || resolve(researchDirectory, gameDefinition(values.game).dataset);
  const output = values.output || `.data/firstplay/evaluation-${catalog.gameId}-latest.json`;
  const datasetText = await readFile(dataset, 'utf8'), datasetHash = createHash('sha256').update(datasetText).digest('hex');
  const rows = datasetText.split('\n').filter(Boolean).map(line => JSON.parse(line));
  for (const row of rows) {
    if ((row.game_id && row.game_id !== catalog.pack.id && row.game_id !== catalog.gameId) || (row.pack_version && row.pack_version !== catalog.pack.version) || [...(row.known_fact_ids || []), ...(row.known_relation_ids || [])].some(id => !catalog.has(id))) throw new Error('Dataset and selected game pack do not match.');
  }
  if (!Number.isInteger(Number(values.limit)) || Number(values.limit) < 1) throw new Error('The case limit must be a positive integer.');
  const cases = rows.filter(row => values['include-drafts'] || row.status === 'human_reviewed').sort((a, b) => caseFingerprint(a).localeCompare(caseFingerprint(b))).slice(0, Math.min(300, Number(values.limit)));
  if (!cases.length) throw new Error('No human-reviewed cases. Review labels first, or explicitly use --include-drafts for a provisional development run.');
  const provider = createProvider(values.provider);
  const results = [], batches = [];
  for (let offset = 0; offset < cases.length; offset += 8) {
    const batch = cases.slice(offset, offset + 8);
    const items = batch.map(row => ({ id: row.id, text: row.message.text, knowledge: { factIds: row.known_fact_ids, relationIds: row.known_relation_ids || [] }, policy: normalizePolicy(row.policy), objective: row.context, reply: row.message.reply_parent }));
    process.stderr.write(`Classifying development cases ${offset + 1}–${offset + batch.length} of ${cases.length}…\n`);
    try {
      const response = await provider.classify(catalog, items); batches.push(response.metrics);
      for (const [index, item] of items.entries()) {
        const parent = batch[index].message.reply_parent;
        const decision = parent?.disposition === 'reject' ? { disposition: 'reject', code: 'parent_hidden', reason: 'Reply parent was rejected.' } : enforcePolicy(response.results.get(item.id), item, catalog);
        results.push({ id: item.id, caseSourceHash: caseFingerprint(batch[index]), sourceReviewRevision: batch[index].review_revision || null, expected: batch[index].expected_disposition, actual: decision.disposition, matches: decision.disposition === batch[index].expected_disposition, reason: decision.reason, interpretation: response.results.get(item.id), labelStatus: batch[index].status });
      }
    } catch (error) {
      for (const row of batch) results.push({ id: row.id, caseSourceHash: caseFingerprint(row), sourceReviewRevision: row.review_revision || null, expected: row.expected_disposition, actual: 'review', matches: false, providerFailure: error.code || 'provider_error', labelStatus: row.status });
    }
  }
  const harmful = results.filter(row => row.expected === 'reject');
  const harmless = results.filter(row => row.expected === 'allow');
  const rate = (top, bottom) => bottom ? Math.round(1000 * top / bottom) / 10 : null;
  const report = {
    kind: values['include-drafts'] ? 'provisional_draft_label_evaluation' : 'reviewed_label_evaluation',
    warning: values['include-drafts'] ? 'Expected labels have not been human-approved. These are development diagnostics, not validated accuracy claims.' : 'Review split provenance before claiming held-out accuracy.',
    gameId: catalog.gameId, packId: catalog.pack.id, packVersion: catalog.pack.version, inferenceProtocol: INFERENCE_PROTOCOL, caseOrder: 'deterministic-input-fingerprint', dataset, datasetHash, timestamp: new Date().toISOString(), total: results.length,
    promptHash: createHash('sha256').update(CLASSIFIER_INSTRUCTIONS).digest('hex'),
    policyHash,
    exactLabelMatchPercent: rate(results.filter(row => row.matches).length, results.length),
    prohibitedContainmentPercent: rate(harmful.filter(row => row.actual !== 'allow').length, harmful.length),
    harmlessDeliveryPercent: rate(harmless.filter(row => row.actual === 'allow').length, harmless.length),
    reviewPercent: rate(results.filter(row => row.actual === 'review').length, results.length),
    providerFailures: results.filter(row => row.providerFailure).length,
    batches, results,
  };
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...report, batches: batches.map(batch => ({ provider: batch.provider, latencyMs: batch.latencyMs, usage: batch.usage })), results: report.results.filter(row => !row.matches) }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
