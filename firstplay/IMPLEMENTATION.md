# FirstPlay — current implementation checkpoint

Updated **November 1, 2026**. This file supersedes [archived development notes](../docs/firstplay-development-history.md). The [source repository](https://github.com/DrPickles12321/firstplay) is public with owner approval. The video and Devpost entry remain unpublished.

## Release behavior

- Real Twitch OAuth/EventSub chat ingestion and removal events; encrypted token persistence and reconnect handling.
- Structured text interpretation through a signed-in Codex CLI, with ephemeral/read-only/tool-disabled subprocesses, bounded deadlines and anonymous message IDs. The optional API adapter is implemented but not verified with a real API account.
- Independent schema/reference validation and policy enforcement. Discovery and Strict social rules, optional gentle hints and a scoped one-hint request. Failures, overload, expired review and stale work keep raw text hidden.
- Bounded batching, exact-repeat reuse under identical context, reply dependencies, deletion tombstones and per-message receipts. No model training/fine-tuning.
- Twitch-style standalone reader, private OBS dock and separate transparent overlay; approved-only payloads. A receipt indicates rendered, not human attention. Overlay rendering cannot create private-reader receipts.
- Paired Manifest V3 Chrome reader with FirstPlay/Session tabs, native-chat coverage, channel-bound revocable capabilities and no moderation authority. Local unpacked desktop pilot, not a Web Store release.
- Own-message viewer sign-in/status. The separate HTTPS viewer-only gateway is implemented but undeployed; operator loopback service stays private.
- Encrypted saved game runs and isolated progress/rules. Switching clears previous reader approvals and discards stale workers. Existing Mario, Subnautica and rehearsal judgments are preserved.
- Stream readiness summary, actual model check without a chat post, one top-bar entry per tool and stable moderation actions between polls.

## Authored support and recognition

| Segment | Included | Limits |
|---|---|---|
| Subnautica opening | 40 facts, nine relationships, 14 manual events, eight automatic text facts | English/macOS; exact UI contexts, not whole-game recognition |
| Mario Cap → Cascade | 47 facts, nine relationships, 21 curated events, 836-objective Moon index representing 880 Moons, Cascade coin references | Full-game index is retrieval context, not a full reveal graph; image candidates require manual confirmation |

Subnautica uses a native Objective-C Apple Vision helper. Four matching frames across two consecutive source-consistent checks are required before automatically adding an allowlisted single fact. No possession, recipe relationship or completed action is inferred. Synthetic browser feeds stay review-only. Weak evidence, missing context, replayed pairs, errors, stale generations or long gaps reset automatic proof.

Evidence and exact before/after knowledge changes are private and auditable. Undo uses revision guards and persists a correction block against immediate relearning. Source metadata has a short activity lease; a backend restart can retain an active browser capture, but never unconfirmed evidence counters. Closing/reloading the capture page still needs a new browser selection.

## Verified checks

| Check | Actual result |
|---|---|
| Controlled tests / JavaScript syntax | 131 tests and 61 files passed in the release preflight |
| Native OCR / HTTP | Nine pairs of original fixtures exercised all eight mappings plus negative contexts; no external image model |
| Real text-model before/after/undo | Eight synthetic messages passed the expected containment/delivery and state/authority checks |
| Native + real text model | Named reaction hidden before a single-fact grant and allowed after; water-making instruction rejected in both phases |
| Automatic browser workflow | A disposable original local recording granted facts without Check/Confirm clicks; Undo removed them and stopped relearning |
| Actual recording | The user-selected Part 1 source automatically established the PDA inventory screen with four-frame evidence. An earlier narrow build also read a Boomerang tooltip after enlarging the player |
| Source restart recovery | Active source identity survived; checks resumed; saved knowledge preserved |
| Fresh Twitch / installed reader | Both fixed posts appeared in ordinary Twitch chat. Greeting allowed, rendered and acknowledged; Bladderfish/water instruction rejected and absent |
| Private model health | Real Codex request succeeded without creating chat, receipts or knowledge |

The Twitch check used one offline desktop channel. These checks are implementation evidence, not representative classification accuracy, gameplay precision/recall, multilingual validation or high-volume load certification. The automatic recording examples do not establish broad visual accuracy. Mario positive gameplay recognition remains unvalidated.

The first remote macOS 26 run exposed a water-marker OCR difference: Vision returned a Cyrillic H in the original positive fixture. The detector now handles the observed H/O lookalikes only within that numeric context, with a regression preserving exact item names and confidence thresholds.

Machine-readable local evidence is ignored under `artifacts/`: `firstplay-release-check.json`, `firstplay-check-latest.json`, `firstplay-recognition-check.json`, `firstplay-source-restart-check.json` and the final source-verification report. Live-check output is retained locally without credentials. Genuine UI images used in the demo are actual captures, not generated UI.

## Human review and diagnostics

Four genuine assisted scene judgments remain saved; all match the recorded model outcomes. The earlier ephemeral workflow did not retain every scene, and missing judgments were not reconstructed. These reviews do not populate the 79-case Subnautica benchmark or establish held-out accuracy.

Synthetic draft evaluations remain development diagnostics. Earlier reports using semantic case IDs were superseded; current adapters anonymize IDs and mix families. Do not use draft-label agreement percentages as measured production accuracy. Independent held-out labeling, representative chat/load tests and latency improvement remain future work.

## Release scope

Supported verification environment: macOS, Chrome, Node 22.22.3, Codex CLI 0.164.0-alpha.11.1. There are no project npm dependencies. The CLI release is publicly available. A read-only CI workflow for Linux controlled tests and macOS native fixtures is prepared; the first remote CI run is being checked after publication.

The source ZIP uses an explicit allowlist and checks against configured local secrets and private capability links. It excludes `.env`, `.data`, artifacts, gameplay media and the unrelated legacy prototype. An extracted source check is part of final delivery. Original OCR fixtures are generated from bundled native source.

The prepared demo is a captioned walkthrough using genuine UI captures, original test imagery and an offline Twitch integration check. It does not present synthetic labels as gameplay or claim a blind live stream. The clean source repository is published. Public video upload and binding Devpost submission remain owner actions after reviewing the concrete materials.
