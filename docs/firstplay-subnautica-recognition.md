# Subnautica: automatic text discoveries

FirstPlay's macOS opening pilot now watches a user-selected video source and adds **eight supported text discoveries** after repeated clear observations. It reads game UI with Apple Vision on this Mac. Screenshots are not sent to Codex or an external image service; chat text still uses the configured text model. No model training was performed.

## Use it

1. Open **Gameplay** in Chrome: http://localhost:3213/capture for isolated rehearsal, or http://localhost:3211/capture for the connected channel.
2. Click **Share game window** and choose only the game/video tab, excluding raw chat. Alternatively, open a suitable local recording. Chrome requires the capture page to be active when choosing the source. Closing/reloading that sharing page requires a new browser source selection.
3. Recognition starts automatically. Keep the sharing page open and use a large, readable game view. A YouTube embed or replay clock alone cannot provide image evidence.
4. Clear supported labels update **What chat can now reference** and **Discovery history** automatically. New chat messages use the updated knowledge; previously hidden messages are not replayed.
5. **Pause recognition** cancels an in-flight check while retaining the video connection. **Stop sharing** ends the source. A finished local recording can be replayed.

A separate FirstPlay controls page reports when another tab is doing the capture. It displays discoveries and history without asking for a second source. Manual tools, individual checks and original label tests are under **Advanced controls and moderator tools**.

## What is recognized

| Visible evidence | Single fact added | What it does not establish |
|---|---|---|
| Boomerang tooltip, inventory heading and nearby food/water UI | Boomerang name | Possession, edibility, cooking or water uses |
| Aligned Inventory/Storage headings | PDA inventory screen seen | Contents of unseen screens |
| Scanner, Repair Tool or Seaglide under Blueprints | Each visible name separately | Crafting, ownership, ingredients or blueprint completion |
| Cave Sulfur beneath a Flare title in Blueprints | Cave Sulfur name | The Flare recipe relationship |
| Central Writhing Weed or Creepvine target label, nearby interaction prompt and oxygen HUD | Each target name separately | Harvesting, required tools or resource uses |

Names must match exactly after Unicode/whitespace normalization and appear in consistent positions in both frames. Strong name/header checks use heuristic OCR score thresholds; they are not calibrated probabilities. Mixed number/glyph context such as H₂O or O₂ has a lower threshold and never grants numerical/property knowledge.

The automatic gate requires **two consecutive non-overlapping frame pairs**, four frames total, from the same source, generation and policy epoch. A missing/weak check, source change, failed check or gap over 12 seconds resets accumulated evidence. Replaying a pair cannot advance it. Normal sampling is about every three seconds with a one-second gap within a pair; this is scheduling, not a latency guarantee.

Authored multi-fact events and recipe/action relationships remain manual. The eight automatic single-fact mappings are separate from those events. Future reference-only facts stay ineligible. This is not general scene recognition, whole-game coverage or a validated production accuracy claim.

## Corrections and optional review

A weaker supported label can remain an optional review card. Strict evidence is checked again without a confirmation click. **Add clear discoveries automatically** can be disabled in Advanced controls to use review-only behavior.

Every automatic update is saved with provenance and a revision-guarded **Undo last change** action. Undo restores the previous knowledge, clears the reader and persists a block against immediately relearning those corrected facts in that run. Later manual confirmation remains possible. A new run has separate preferences. Automatic updates do not unlock related recipes/actions implicitly.

Four evidence frames can be enlarged while the private evidence card is retained, normally five minutes. Discovery knowledge and audit history outlive that card. Images stay in the private encrypted observation store and are excluded from readers, exports and source packages. Original synthetic feeds remain review-only and never automatically change saved progress.

## Verification and honest limits

- `npm run check`: controlled regression and syntax checks; no external model/Twitch calls.
- `npm run recognition:check`: compiles the native helper, generates nine pairs of original UI fixtures, exercises every supported fact plus negative contexts through real OCR/HTTP, and verifies automatic name/UI grants without relationships. It changes only an in-memory test run.
- `npm run recognition:check -- --with-text`: additionally checks real text-model behavior before/after the automatic update. A named reaction was held before and allowed after; a water-making instruction stayed rejected.
- Browser QA with an original 18-second local test recording verified that selecting a file starts checking and grants discoveries without Check/Confirm clicks. Undo removed those facts and persisted the correction. That test used a disposable app/run, not the user's saved progress.
- A user-selected real Part 1 recording automatically established the PDA inventory screen with four-frame evidence. An earlier narrower build also read the Boomerang tooltip. The initial small-player Boomerang attempt was withheld; enlarging the player helped. These isolated examples do not establish precision/recall across gameplay, resolutions, languages or overlays.

Native OCR in the observed fixture/recording checks took roughly 0.4 seconds per pair, separate from capture spacing, repeat checks and chat-model time. Unsupported visual events—fire, ocean/ship identity, tool use and crafting—do not become known from these detectors.

This is English/macOS-only and requires Apple Command Line Tools/clang for the first native build. Its source-hashed executable is cached under ignored `.data/firstplay-ocr/`. The included Objective-C source avoids the installed Swift/SDK mismatch. The helper uses Apple's [Vision text-recognition API](https://developer.apple.com/documentation/vision/recognizing-text-in-images).

The public recording remains an external source, not a bundled asset. Local processing does not itself establish publisher/media permissions. Existing source-policy research remains relevant before publishing or redistributing material. Mario retains its separate image-model observer and confirmation flow.
