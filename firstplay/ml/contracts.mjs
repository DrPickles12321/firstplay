export const RELEVANCE = ['current_game', 'other_game', 'none', 'uncertain'];
export const INFERENCE_PROTOCOL = 'anonymous-message-ids-v1';
export const INTENTS = ['social', 'reaction', 'recall', 'search_hint', 'strategic_reminder', 'directive', 'exact_solution', 'future_information', 'knowledge_claim', 'instruction_attack'];
export const DISPOSITIONS = ['allow', 'reject', 'review'];
export const REFERENCE_USES = ['mention', 'disclosure', 'search_target'];

export const CLASSIFICATION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    results: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        message_id: { type: 'string' },
        relevance: { type: 'string', enum: RELEVANCE },
        intents: { type: 'array', items: { type: 'string', enum: INTENTS } },
        references: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: { id: { type: 'string' }, usage: { type: 'string', enum: REFERENCE_USES } },
          required: ['id', 'usage'],
        } },
        unknown_information: { type: 'boolean' },
        unresolved_reference: { type: 'boolean' },
        uncertain: { type: 'boolean' },
        recommended_disposition: { type: 'string', enum: DISPOSITIONS },
        reason: { type: 'string' },
      },
      required: ['message_id', 'relevance', 'intents', 'references', 'unknown_information', 'unresolved_reference', 'uncertain', 'recommended_disposition', 'reason'],
    } },
  },
  required: ['results'],
};

export class ClassificationError extends Error {
  constructor(code, message = code) { super(message); this.name = 'ClassificationError'; this.code = code; }
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function validateClassifications(value, expectedIds, validReferenceIds) {
  if (!exactKeys(value, ['results']) || !Array.isArray(value.results) || value.results.length !== expectedIds.length) {
    throw new ClassificationError('invalid_batch', 'The classifier did not return one result for every message.');
  }
  const expected = new Set(expectedIds);
  const seen = new Set();
  for (const result of value.results) {
    if (!exactKeys(result, CLASSIFICATION_SCHEMA.properties.results.items.required)
      || !expected.has(result.message_id) || seen.has(result.message_id)
      || !RELEVANCE.includes(result.relevance)
      || !Array.isArray(result.intents) || result.intents.length > INTENTS.length
      || new Set(result.intents).size !== result.intents.length
      || !result.intents.every(intent => INTENTS.includes(intent))
      || !Array.isArray(result.references) || result.references.length > 30
      || !['unknown_information', 'unresolved_reference', 'uncertain'].every(key => typeof result[key] === 'boolean')
      || !DISPOSITIONS.includes(result.recommended_disposition)
      || typeof result.reason !== 'string' || !result.reason.trim() || result.reason.length > 600) {
      throw new ClassificationError('invalid_result', 'A classifier result is invalid or mismatched.');
    }
    seen.add(result.message_id);
    const refs = new Set();
    for (const reference of result.references) {
      if (!exactKeys(reference, ['id', 'usage']) || !validReferenceIds.has(reference.id)
        || !REFERENCE_USES.includes(reference.usage) || refs.has(reference.id)) {
        throw new ClassificationError('invalid_reference', 'The classifier cited an unknown or duplicate reference.');
      }
      refs.add(reference.id);
    }
  }
  return new Map(value.results.map(result => [result.message_id, result]));
}

export function reviewDecision(code, reason) { return { disposition: 'review', code, reason }; }
