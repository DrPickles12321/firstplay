import { mkdir, writeFile } from 'node:fs/promises';
import { GameCatalog } from '../ml/catalog.mjs';
import { createProvider } from '../ml/providers.mjs';
import { enforcePolicy } from '../ml/policy.mjs';
import { ScreeningEngine } from '../runtime/engine.mjs';

// Synthetic local workload only. This never connects or posts to Twitch.
const texts = ['Hello FirstPlay, how is everyone doing?', 'Use Cappy to capture that frog.'];
let engine;
try {
  const catalog = await GameCatalog.load(), provider = createProvider();
  let requestedMessages = 0;
  const measuredProvider = { name: provider.name, model: provider.model, binary: provider.binary,
    classify: async (...args) => { requestedMessages += args[1].length; return provider.classify(...args); } };
  engine = new ScreeningEngine({ catalog, provider: measuredProvider, batchWaitMs: 1_000_000 });
  const raw = Array.from({ length: 8 }, (_, index) => ({ id: `baseline-${index}`, text: texts[index % 2], ...engine.snapshot(), reply: null }));
  process.stderr.write('Measuring one unoptimized eight-message model batch…\n');
  let started = performance.now(); const baseline = await provider.classify(catalog, raw);
  const phases = [{ name: 'baseline_without_reuse', elapsedMs: Math.round(performance.now() - started), modelRequests: 1, modelMessages: raw.length, metrics: baseline.metrics,
    outcomes: raw.map(item => enforcePolicy(baseline.results.get(item.id), item, catalog).disposition) }];
  async function phase(name) {
    const requestsBefore = engine.metrics.batches, messagesBefore = requestedMessages;
    const hitsBefore = engine.metrics.cacheHits, combinedBefore = engine.metrics.repeatedInBatch;
    const records = Array.from({ length: 8 }, (_, index) => engine.ingest({ id: `${name}-${index}`, text: texts[index % 2] }));
    started = performance.now(); await engine.flush();
    phases.push({ name, elapsedMs: Math.round(performance.now() - started), modelRequests: engine.metrics.batches - requestsBefore, modelMessages: requestedMessages - messagesBefore, cacheHits: engine.metrics.cacheHits - hitsBefore, combinedInBatch: engine.metrics.repeatedInBatch - combinedBefore, outcomes: records.map(record => record.disposition) });
  }
  process.stderr.write('Measuring duplicate coalescing and exact-repeat reuse…\n');
  await phase('first_optimized_batch'); await phase('exact_repeat_same_state');
  engine.setPolicy({ mode: 'strict_social', allowGentleHints: false }, { role: 'owner', id: 'local-benchmark' });
  process.stderr.write('Checking that changed rules require fresh inference…\n');
  await phase('after_policy_change');
  const expected = Array.from({ length: 8 }, (_, index) => index % 2 ? 'reject' : 'allow');
  const report = { kind: 'single_run_duplicate_workload_benchmark', timestamp: new Date().toISOString(), warning: 'Eight synthetic messages contain only two distinct bodies. These timings do not measure representative chat traffic, UI/Twitch latency or general classification accuracy. Unseen messages still require inference.',
    passed: phases.every(phase => JSON.stringify(phase.outcomes) === JSON.stringify(expected)) && phases[2].modelRequests === 0 && phases[3].modelRequests === 1,
    phases };
  await mkdir('.data/firstplay', { recursive: true, mode: 0o700 });
  await writeFile('.data/firstplay/performance-check.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
} catch (error) { console.error(JSON.stringify({ error: error.code || error.message })); process.exitCode = 1; }
finally { engine?.close(); }
