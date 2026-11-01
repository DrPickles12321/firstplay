# Subnautica Part 1 research

This pack is loaded by FirstPlay as a **Subnautica opening pilot with automatic text discoveries**, alongside the preserved Mario pack. Select or resume it in Settings → Game session, then share video in Gameplay to start recognition. See the [demo instructions](../../../docs/firstplay-subnautica-demo.md).

- [Full implementation scope](../../../docs/firstplay-subnautica-part1-scope.md): support boundary, current-code audit, architecture, detectors, policies, evaluation, UI, implementation order and demo.
- [Source register](sources.json): primary documentation, community references and verification limits.
- [Recording observations](part1-recording.json): 16 decoded point samples of the 10:32 video; not exhaustive annotations or an event schedule.
- [Draft game pack](part1-pack.draft.json): 40 facts, nine relationships and 14 possible confirmation events. Everything starts unknown. These 14 authored multi-fact events remain manual; eight separate runtime single-fact OCR mappings can update automatically.
- [Draft classification cases](draft-cases.jsonl): 79 synthetic examples requiring label review. Real development inference has run; labels remain unreviewed and no validated accuracy is claimed.
- [Additional adversarial cases](adversarial-cases.jsonl): 24 unreviewed synthetic cases covering disguised hints, multilingual instructions, fake authority and harmless word collisions. They are a separate development set, not human-approved held-out ground truth.
- [Mario preservation record](mario-preservation.json): historical hashes before the scoping work. Runtime files were subsequently changed to support isolated game sessions; Mario catalog and saved progress remain supported.

The recording is [Subnautica Free To Use Gameplay Footage, Part 1](https://www.youtube.com/watch?v=hh5dckAV5Pg), by Royalty Free Game Clips. The uploader publishes reuse permission for their recording. That statement is not blanket clearance of underlying game rights, model use, redistribution or hackathon promotional rights; the scope records the publisher-policy limitations. No gameplay file, soundtrack, screenshots or guide images are bundled here.

External gameplay-image model execution remains off. The application has a separate macOS on-device OCR pilot that adds eight supported single text facts after repeated checks; see the [recognition guide](../../../docs/firstplay-subnautica-recognition.md). Local processing does not itself establish media permissions; see the scope's rights section.

The CLI supports explicit pack selection: `npm run evaluate -- --game subnautica --include-drafts`. Its default remains Mario. The [review desk guide](../../../docs/firstplay-validation-and-video.md) covers main/adversarial label exports and evaluation commands. The latest neutral-ID 79-case development run had 96.2% draft-label agreement, 100% containment of its 43 draft-prohibited cases, 100% delivery of its 28 draft-harmless cases, 6.3% review and no provider failures. Three expected-review messages were blocked. The separate neutral-ID 24-case adversarial run matched all expected draft outcomes. Earlier scores are superseded because semantic source IDs exposed label clues to the model; current adapters use anonymous message IDs and mix case families before batching. These are unreviewed synthetic diagnostics, not validated accuracy. Gold annotations and future sample times never advance live knowledge.

To rerun the extra cases without replacing the main report: `npm run evaluate -- --game subnautica --dataset research/firstplay/subnautica/adversarial-cases.jsonl --include-drafts --output .data/firstplay/evaluation-subnautica-adversarial.json`.
