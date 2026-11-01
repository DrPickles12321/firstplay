# Mario collectible catalog research

Source-checked October 30, 2026. **Contains full-game spoilers.**

## Deliverables

- [Complete readable Moon checklist](moon-checklist.md): 836 numbered objectives across 17 kingdoms.
- [Full Moon catalog JSON](smo-moons-all.json): IDs, English names, local numbers, reward values and source URLs.
- [Cascade reference](cascade-reference.md): all 40 Moon entries, coarse progression phases and location groups covering all 50 purple coins.
- [Cascade Moons JSON](cascade-moons.json): 40 entries worth 42 Moon units.
- [Cascade purple-coin groups JSON](cascade-purple-coins.json): 15 reference-guide groups whose quantities sum to 50.
- [Regional-coin index JSON](regional-coins-index.json): counts totaling 1,000 across 13 kingdoms, with map links. Detailed local group data is included for Cascade only.

## Counting and coverage

The complete indexed Moon list has 836 objectives, including 22 Multi Moons worth three units each: `836 + 22 × 2 = 880`. Repeatable extra shop purchases can raise the counter further and are not distinct numbered objectives. Cascade has 40 objectives, including one Multi Moon, so it awards 42 units. [Count explanation](https://smo.wiki/Power_Moon), [all-kingdom index](https://www.mariowiki.com/Lists_of_Power_Moons).

Purple coins are a separate collectible system, with kingdom-local totals and shops. The [regional-coin reference](https://smo.wiki/Regional_coin) supplies counts; the [Nintendo guide](https://www.guiasnintendo.com/2c-switch/super-mario-odyssey/guia-super-mario-odyssey/preguntas.html) links individual kingdom maps. The linked [interactive map](https://supermarioguides.com/guides/super-mario-odyssey/interactive-map/) also advertises full Moon and regional-coin coverage; its individual markers were not exhaustively checked here.

Moon metadata was extracted as factual names, numbers and values from the linked kingdom tables, with Darker Side's single entry added explicitly from its [mission reference](https://www.mariowiki.com/Long_Journey%27s_End). Walkthrough descriptions, screenshots and videos were not copied into the catalog. Preserve source attribution and check applicable terms before importing further text or media.

## Cascade details and important limits

The local Cascade coin index uses the ordering in [Vandal's location guide](https://vandal.elespanol.com/guias/guia-super-mario-odyssey-trucos-y-consejos/monedas-moradas-reino-de-las-cataratas). Its ranges are guide labels, not official in-game coin numbers. That guide combines six coins into one range; other guides split them into smaller groups and order some early groups differently. Do not equate numeric ranges from different guides without matching their locations.

Use the [Nintendo Cascade map](https://www.guiasnintendo.com/2c-switch/super-mario-odyssey/guia-super-mario-odyssey/monedas-02-reino-cataratas.html) and [independent illustrated coin list](https://supermarioguides.com/guides/super-mario-odyssey/cascade-kingdom-purple-coins/) for visual verification. Exact coordinates, internal game object IDs, per-coin visual identity and first-visit access have not been established by this dataset.

Cascade Moon numbers 1–25 are the original catalog section; that does **not** mean all 25 are available on the first visit. Numbers 26–40 require the Moon Rock progression. Several earlier entries also have story, return-trip or external-route conditions. Phase tags in the JSON summarize a source condition; they are not complete prerequisite rules. Moon 19 remains explicitly unresolved for manual availability review, and dependencies such as another completed race can coexist with a phase requirement.

Data-quality example: the Nintendo FAQ's Snow/Seaside objective counts appear interchanged. This dataset uses the numbered kingdom lists, whose consecutive entries give Snow 55 and Seaside 71. The aggregate total and Multi Moon arithmetic agree. Sources can contain mistakes; a catalog still needs gameplay review before becoming authoritative runtime context.

## Validation performed

- All 17 kingdom objective counts match consecutive local numbers.
- All 836 Moon IDs are unique; 22 entries have value three, producing 880 units.
- Cascade contains exactly numbers 1–40 and totals 42 units.
- Purple-coin totals sum to 1,000 across 13 nonzero kingdoms.
- Cascade reference ranges cover 1–50 exactly once and group quantities sum to 50.
- Source-linked catalog entries remain marked `gameplay_verified: false` and `player_knows: false`.

These are catalog integrity checks, not gameplay recognition or classifier accuracy results. No model was trained. `build_catalog.py` reconstructs the Moon indexes from current source tables and fails if expected counts change; review schema/source changes rather than silently removing checks.

## How FirstPlay should use this

Keep the full catalog server-side for reference retrieval and recognizing potential future content. Do not send it to the creator-facing reader or mark all entries known. The [initial runtime-pack draft](../packs/smo-cap-cascade.v0.2.json) remains a separate, narrower authoring artifact. Connecting this catalog to reviewed reveal conditions, solution relationships, aliases and verified player progress is additional work; merely possessing all Moon names does not establish spoiler-filter reliability.
