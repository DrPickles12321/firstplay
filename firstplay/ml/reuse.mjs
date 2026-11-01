import { createHash } from 'node:crypto';
import { buildClassificationInput, CLASSIFIER_INSTRUCTIONS } from './prompt.mjs';
import { CLASSIFICATION_SCHEMA, validateClassifications, INFERENCE_PROTOCOL } from './contracts.mjs';
import { enforcePolicy } from './policy.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const FORMAT = hash(INFERENCE_PROTOCOL + CLASSIFIER_INSTRUCTIONS + JSON.stringify(CLASSIFICATION_SCHEMA));

// Reuse interpretations, never delivery decisions. Every message still passes the policy gate.
// Keys include the entire supplied reference context and receive-time state; text is exact.
export class InterpretationReuse {
  constructor({ clock = Date.now, ttlMs = 30_000, maxEntries = 256 } = {}) {
    Object.assign(this, { clock, ttlMs, maxEntries }); this.entries = new Map();
  }
  clear() { this.entries.clear(); }
  prune() { for (const [key, entry] of this.entries) if (entry.expiresAt <= this.clock()) this.entries.delete(key); }
  plan(catalog, items, provider) {
    this.prune();
    const input = buildClassificationInput(catalog, items), gameContext = input.game_context;
    const contextKey = hash(JSON.stringify({ format: FORMAT, catalog: catalog.version, provider: provider.name, model: provider.model, binary: provider.binary, gameContext }));
    const restored = new Map(), groups = new Map();
    for (const [index, item] of items.entries()) {
      const { message_id, ...message } = input.messages[index];
      const key = hash(contextKey + JSON.stringify({ message, runId: item.runId, epoch: item.epoch, policyRevision: item.policyRevision, knowledgeRevision: item.knowledge.revision }));
      const entry = this.entries.get(key);
      if (entry) restored.set(item.id, { ...structuredClone(entry.result), message_id: item.id });
      else {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
    }
    const requests = [...groups.values()].map(group => group[0]);
    return { requests, gameContext,
      complete: response => {
        const results = new Map(restored);
        const validated = requests.length ? validateClassifications({ results: [...response.results.values()] }, requests.map(item => item.id), new Set(gameContext.references.map(reference => reference.id))) : new Map();
        for (const [key, group] of groups) {
          const result = validated.get(group[0].id);
          for (const item of group) results.set(item.id, { ...structuredClone(result), message_id: item.id });
          // Uncertainty, unresolved claims and failures always get a fresh interpretation.
          if (!result.uncertain && !result.unresolved_reference && ['allow', 'reject'].includes(enforcePolicy(result, group[0], catalog).disposition)) {
            this.entries.set(key, { result: structuredClone(result), expiresAt: this.clock() + this.ttlMs });
          }
        }
        while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
        return { results, metrics: { ...response?.metrics, cacheHits: restored.size, repeatedInBatch: items.length - restored.size - requests.length, modelMessages: requests.length, modelRequests: requests.length ? 1 : 0 } };
      },
    };
  }
}
