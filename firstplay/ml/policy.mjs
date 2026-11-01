import { reviewDecision } from './contracts.mjs';

export const DEFAULT_POLICY = Object.freeze({ mode: 'discovery', allowGentleHints: false });
export function normalizePolicy(value = {}) {
  const mode = value.mode ?? 'discovery';
  if (!['discovery', 'strict_social'].includes(mode)) throw new Error('Unsupported filtering mode.');
  const gentle = value.allowGentleHints ?? value.allow_gentle_exploration_hints ?? false;
  if (typeof gentle !== 'boolean') throw new Error('Hint permission must be a boolean.');
  return { mode, allowGentleHints: mode === 'discovery' && gentle };
}

export function enforcePolicy(result, snapshot, catalog) {
  const reject = (code, reason) => ({ disposition: 'reject', code, reason });
  const allow = () => ({ disposition: 'allow', code: 'allowed', reason: result.reason });
  const intents = new Set(result.intents);
  const known = catalog.knownIds(snapshot.knowledge);
  const policy = normalizePolicy(snapshot.policy);
  if (intents.has('instruction_attack')) return reject('instruction_attack', 'Viewer text cannot change the filter or discovery record.');
  if (policy.mode === 'strict_social' && ['current_game', 'other_game'].includes(result.relevance)) return reject('strict_game_discussion', 'Game-related discussion is disabled.');
  if (result.relevance === 'uncertain') return reviewDecision('uncertain_topic', 'Game relevance is unresolved.');
  if (result.relevance === 'none') {
    if (result.unknown_information || result.references.length || result.unresolved_reference || [...intents].some(intent => !['social', 'reaction'].includes(intent))) {
      return reviewDecision('contradictory_result', 'Topic and content labels disagree.');
    }
  }
  if (intents.has('future_information') || intents.has('exact_solution')) {
    // Exact solutions are still prohibited guidance even when their components are known.
    return reject('disclosure_or_solution', 'Future information or exact solutions are not permitted.');
  }
  if (intents.has('directive')) return reject('direct_instruction', 'Instructions about what to do are not permitted.');
  if ((intents.has('search_hint') || intents.has('strategic_reminder')) && !policy.allowGentleHints) return reject('hints_disabled', 'Exploration hints and strategic reminders are disabled.');
  if (result.relevance === 'other_game' && (intents.has('recall') || intents.has('knowledge_claim'))) return reviewDecision('other_game_knowledge', 'Discovery history for the other game is unavailable.');
  if (result.uncertain || result.unresolved_reference || result.recommended_disposition === 'review') return reviewDecision('semantic_uncertainty', result.reason);
  if (result.unknown_information) return reject('unknown_information', 'The message introduces unconfirmed game information.');
  for (const reference of result.references) {
    if (!catalog.has(reference.id)) return reviewDecision('unknown_reference', 'The referenced fact cannot be verified.');
    if (!known.has(reference.id)) {
      if (reference.usage === 'disclosure') return reject('unconfirmed_discovery', 'The referenced discovery has not been confirmed.');
      return reviewDecision('unconfirmed_reference', 'A game reference is absent from the confirmed knowledge record.');
    }
  }
  if (intents.has('knowledge_claim')) return reviewDecision('verify_claim', 'A viewer claim needs independent confirmation.');
  if (result.recommended_disposition === 'reject') return reject('semantic_rejection', result.reason);
  if (policy.mode === 'strict_social' && result.relevance !== 'none') return reviewDecision('strict_uncertainty', 'Strict-mode topic is unresolved.');
  return allow();
}
