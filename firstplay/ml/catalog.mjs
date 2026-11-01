import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RESEARCH = new URL('../../research/firstplay/', import.meta.url);
export const GAME_DEFINITIONS = Object.freeze([
  { id: 'mario', name: 'Super Mario Odyssey', segment: 'Cap → Cascade', support: 'Opening pack · moderator-confirmed progress', visionEnabled: true, pack: 'packs/smo-cap-cascade.v0.2.json', dataset: 'evaluation/draft-cases.jsonl' },
  { id: 'subnautica', name: 'Subnautica', segment: 'Opening · Part 1', support: 'Opening pilot · automatic text discoveries', visionEnabled: false, localObservationEnabled: process.platform === 'darwin', pack: 'subnautica/part1-pack.draft.json', dataset: 'subnautica/draft-cases.jsonl', recordingUrl: 'https://www.youtube.com/watch?v=hh5dckAV5Pg' },
]);
export function gameDefinition(id = 'mario') {
  const definition = GAME_DEFINITIONS.find(game => game.id === id);
  if (!definition) throw new Error('Unsupported game. Choose mario or subnautica.');
  return definition;
}
const STOP = new Set('a an the of in on at to by for with and or is it this that my your our from through kingdom moon power moons'.split(' '));
export const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const words = text => [...new Set(normalize(text).split(' ').filter(word => word.length > 2 && !STOP.has(word)))];

export class GameCatalog {
  constructor(pack, moonCatalog = { moons: [], researched_at: 'none' }, coinCatalog = { groups: [] }, definition) {
    this.pack = pack; this.definition = definition || GAME_DEFINITIONS.find(game => game.name === pack.game) || { id: pack.id, name: pack.game, segment: 'Research pack', support: 'Manual progress', visionEnabled: pack.vision_execution_allowed !== false };
    this.gameId = this.definition.id;
    this.references = new Map();
    for (const fact of pack.facts) this.references.set(fact.id, { id: fact.id, type: 'fact', kind: fact.kind, label: fact.label, statement: fact.statement, aliases: fact.aliases, confirmationEligible: fact.confirmation_eligible_in_part1 !== false, supportTier: fact.support_tier });
    for (const relation of pack.relations) this.references.set(relation.id, { id: relation.id, type: 'relation', kind: 'solution_relationship', label: relation.label, statement: relation.meaning, components: relation.fact_ids, confirmationEligible: relation.confirmation_eligible_in_part1 !== false, supportTier: relation.support_tier });
    for (const moon of moonCatalog.moons) this.references.set(moon.id, { id: moon.id, type: 'moon', kind: 'moon_objective', name: moon.name, kingdom: moon.kingdom, number: moon.number, value: moon.moon_value, availability: moon.availability_phase || 'not_fully_modeled' });
    for (const group of coinCatalog.groups) this.references.set(group.id, { id: group.id, type: 'regional_coins', kind: 'secret_location', statement: group.location_summary, kingdom: 'Cascade', quantity: group.quantity });
    this.events = new Map(pack.events.map(event => [event.id, event]));
    this.identityAliases = new Map();
    for (const pair of pack.reference_identity_aliases || []) {
      if (!this.references.has(pair.left) || !this.references.has(pair.right)) throw new Error('An identity alias references an absent fact.');
      this.identityAliases.set(pair.left, pair.right); this.identityAliases.set(pair.right, pair.left);
    }
    this.documents = [...this.references.values()].map(reference => ({ reference, tokens: words([reference.name, reference.statement, ...(reference.aliases || [])].filter(Boolean).join(' ')), phrase: normalize(reference.name || '') }));
    this.frequency = new Map();
    for (const doc of this.documents) for (const word of doc.tokens) this.frequency.set(word, (this.frequency.get(word) || 0) + 1);
    this.version = `${pack.id}@${pack.version}:references-${moonCatalog.researched_at}:v2`;
    for (const event of this.events.values()) for (const id of [...event.confirms_fact_ids, ...event.confirms_relation_ids]) if (!this.has(id)) throw new Error('An event references an absent fact.');
  }

  static async load(gameId = 'mario') {
    const definition = gameDefinition(gameId);
    if (gameId !== 'mario') return new GameCatalog(JSON.parse(await readFile(new URL(definition.pack, RESEARCH), 'utf8')), undefined, undefined, definition);
    const paths = [definition.pack, 'collectibles/smo-moons-all.json', 'collectibles/cascade-purple-coins.json'];
    const [pack, moons, coins] = await Promise.all(paths.map(async path => JSON.parse(await readFile(new URL(path, RESEARCH), 'utf8'))));
    return new GameCatalog(pack, moons, coins, definition);
  }

  summary() { const { id, name, segment, support, visionEnabled, localObservationEnabled } = this.definition; const remote = visionEnabled && this.pack.vision_execution_allowed !== false; return { id, name, segment, support, visionEnabled: remote, localObservationEnabled: Boolean(localObservationEnabled), observationEnabled: Boolean(remote || localObservationEnabled), observationMode: localObservationEnabled ? 'local-labels' : remote ? 'image-model' : 'manual', packId: this.pack.id, packVersion: this.pack.version }; }
  canConfirm(id) { return this.has(id) && this.get(id).confirmationEligible !== false; }
  get(id) { return this.references.get(id); }
  has(id) { return this.references.has(id); }
  knownIds(knowledge) {
    const ids = new Set([...knowledge.factIds, ...knowledge.relationIds]);
    // These aliases identify the same Moon, not its location, route or solution relationships.
    for (const id of [...ids]) if (this.identityAliases.has(id)) ids.add(this.identityAliases.get(id));
    return ids;
  }

  retrieve(text, limit = 12) {
    const query = new Set(words(text));
    const normalized = ` ${normalize(text)} `;
    return this.documents.map(doc => {
      let score = 0;
      for (const token of doc.tokens) if (query.has(token)) score += Math.log(1 + this.documents.length / (this.frequency.get(token) || 1));
      if (doc.phrase && normalized.includes(` ${doc.phrase} `)) score += 30;
      return { reference: doc.reference, score };
    }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.reference.id.localeCompare(b.reference.id)).slice(0, limit);
  }

  contextFor(items) {
    // The compact reviewed-route draft is included in full; the all-game name index is retrieved.
    const references = new Map([...this.references].filter(([, value]) => value.type === 'fact' || value.type === 'relation'));
    for (const item of items) {
      for (const hit of this.retrieve(item.text, 10)) references.set(hit.reference.id, hit.reference);
      for (const id of this.knownIds(item.knowledge)) if (this.has(id)) references.set(id, this.get(id));
    }
    return {
      game: this.pack.game, game_id: this.gameId, pack_version: this.version, supported_segment: this.pack.scope,
      coverage_warning: 'References define possible game knowledge, not current player progress. Only confirmed IDs establish knowledge. Missing retrieval proves neither safety nor knowledge. Reference-only material is outside positive progress support.',
      references: [...references.values()],
    };
  }

  spoilerSafeDiscoveries(ids) { return ids.filter(id => this.has(id)).map(id => this.get(id)); }
}

export const researchDirectory = fileURLToPath(RESEARCH);
