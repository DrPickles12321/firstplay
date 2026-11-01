# FirstPlay game-pack research

Research date: October 30, 2026. These are **draft research artifacts**, not a trained model, implemented detector or tested game integration. They contain spoilers and belong on the server/moderator side.

`smo-cap-cascade.v0.2.json` contains concise, independently worded facts with source references, authored English search aliases, explicit confirmation requirements and candidate detection events. Source-backed game facts are distinct from proposed detection rules, which have not been validated on gameplay. Initial player knowledge is empty; authoring a fact never marks it known.

Coverage: Cap's opening route; early capture types relevant to Cascade; its story encounters and traversal; selected Moon entries #1–#6. This is not every optional secret, movement technique, collectible or route in either kingdom. Other Cascade Moons, Cap revisits, later kingdoms, speedrun routes and unsupported language/version details are unresolved content. A statement about those areas is not automatically harmless or proven false.

Each fact has a stable ID and a separate `confirm_when` condition. Aliases such as `doggo`, `dino` and `moon` are broad retrieval candidates, not safe/unsafe decisions. They are proposed English chat variants, not established usage statistics. Canonical names are distinguished from these authored variants.

The fact pack documents what can be true in the game. The knowledge ledger records what a particular person is confirmed to know. The run state records what has happened in this save/challenge. Collection of a Moon does not automatically confirm every solution association, and knowing both entities does not confirm the relationship between them.

## Sources and reliability

- [Nintendo's tips](https://play.nintendo.com/news-tips/tips-tricks/super-mario-odyssey-secrets-tips-tricks/) provide official examples of mechanics and implicit clues. They are not a complete opening walkthrough; later-game tips must not become initial player knowledge.
- [Cap opening mission](https://www.mariowiki.com/Cappy_of_the_Cap_Kingdom), [first Moon mission](https://www.mariowiki.com/Our_First_Power_Moon) and [second Cascade mission](https://www.mariowiki.com/Multi_Moon_Atop_the_Falls) describe the selected story route.
- [Capture behavior](https://www.mariowiki.com/Capture) and [capture-list reference](https://smo.wiki/Capture) describe abilities and the in-game history list. A capture list exists in the game's UI; this research establishes no external API to read it. A reference table saying a capture is first encountered in Cap does not prove availability on Cap's initial visit. Paragoomba is deliberately outside this pack's supported route.
- [Topper](https://www.mariowiki.com/Topper) and [Madame Broode](https://www.mariowiki.com/Madame_Broode) provide encounter detail.
- [Cascade Moon list](https://www.mariowiki.com/List_of_Power_Moons_in_the_Cascade_Kingdom) supplies selected names/availability; [PowerPyx](https://www.powerpyx.com/super-mario-odyssey-power-moon-locations-cascade-kingdom/) cross-checks selected routes and the Multi Moon's value; [Cascade progression](https://smo.wiki/Cascade_Kingdom) supplies the departure requirement.

These wikis/guides are secondary sources. Preserve attribution and inspect applicable licenses before importing any source text or media; no source screenshots, game assets or full guide passages are included here. Links and concise fact statements are not permission to redistribute someone else's footage.

## Remaining verification before implementation claims

1. Check the draft against an owned or appropriately permissioned ordinary fresh-save recording. Note game version, language, video resolution and timestamps; no such recording has been validated here.
2. Have a knowledgeable reviewer confirm each fact, availability condition and scope exclusion. Fill `reviewed_by`, `recording_check` and `verified_at` rather than silently treating a draft as production-ready.
3. Collect real positive and hard-negative frames for each proposed detector. Example negatives: an uncaptured frog, capture in progress, a menu image, a missed banner and overlapping text. Review the evidence rather than promoting model confidence directly to truth.
4. Confirm exactly which facts each event may establish. A successful capture establishes the capture mechanic, not every move or future secret involving that creature.
5. Measure alias false positives, indirect-reference misses and pack size/latency. Add factual coverage from observed failures, not indiscriminate whole-wiki ingestion.
6. Keep model-drafted examples in `../evaluation/` labeled as unreviewed until the user checks them. They are not benchmark results or a fine-tuning dataset approved for upload.
