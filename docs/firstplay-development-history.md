# Archived development notes

Historical checkpoints, superseded by [the current implementation checkpoint](../firstplay/IMPLEMENTATION.md). Counts, manual-only descriptions and unfinished items below describe earlier builds, not the current release.

# FirstPlay implementation checkpoint

Updated October 31, 2026, America/New_York. This records implemented behavior and observed checks, separate from the earlier proposal documents.

**Latest verification: 123 deterministic tests and 56 JavaScript syntax checks pass.** Main app: http://localhost:3211. Isolated rehearsal: http://localhost:3213. The real Twitch connection and paired Chrome reader restored after restarting the final server build. No repository, video or hackathon entry has been published.

## Implemented application

- Node 22 ESM service with no npm dependencies. Real structured model interpretation uses the locally authenticated Codex CLI without extracting authentication tokens. An optional Responses API adapter is implemented but has not been exercised with a real API account.
- Tool-disabled ephemeral classifier subprocesses with private temporary files, deadlines, whole-batch schema/reference validation and a separate deterministic policy gate. No training or fine-tuning has occurred.
- Discovery, strict-social and optional gentle-hint policies; scoped, expiring one-hint requests require moderator selection. Display names remain unscreened per the selected scope.
- Small chat batches; exact interpretation reuse for thirty seconds under identical context; per-message policy enforcement, review capacity/TTL, worker budget, deletion tombstones and reply dependencies. Failure, expiry and malformed output never release raw text.
- Real Twitch OAuth/EventSub ingestion with encrypted token persistence. Normal operation requests read-chat access; the optional writer posts only two fixed integration fixtures to the connected owner's channel, with cooldown and Shared Chat guards.
- Approved-text-only private reader, transparent broadcast overlay and per-viewer status projection. Reader acknowledgements indicate rendering, not human attention. The overlay cannot create private-reader receipts.
- Twitch-style channel page with the connected channel's video-only player on the left and protected chat on the right. One top-bar entry per tool; settings in a drawer. OBS dock and broadcast overlay links have distinct scopes.
- Paired Manifest V3 Chrome prototype adds FirstPlay/Session tabs on Twitch and masks native chat locally. It uses fixed read-only reader operations and channel-bound, revocable pairing. Installed on this machine; no Web Store release or all-layout compatibility claim.
- Separate viewer-only gateway implementation. Local viewer OAuth/status has been verified; the HTTPS gateway remains undeployed. The loopback operator service is not a public deployment target.
- Encrypted SQLite, separate operator/moderator/reader/viewer authority and saved game/run lifecycle. Switching restores each run's progress/rules, clears displayed chat and discards late workers. Twitch credentials and pairing remain shared.

## Authored support

| Game segment | Context and controls | Limits |
|---|---|---|
| Mario Cap → Cascade | 47 opening facts, nine relationships, 21 curated events, 836 Moon objectives worth 880 Moons, Cascade purple-coin retrieval | Full-game names are a reference index, not whole-game spoiler protection |
| Original Subnautica opening | 40 facts, nine relationships, 14 manual events; item identity, possession, recipe and crafting remain separate | Reference-only future material cannot be confirmed as opening progress; image-to-model execution is disabled |

No third-party gameplay media or guide screenshots are bundled. The public Subnautica source was sampled for research in an earlier checkpoint; those point samples are not an exhaustive annotation or earliest-discovery schedule. Publisher permission for original-game AI image inputs remains unclear. The external image-model path stays off; a separate local OCR pilot now adds supported single facts automatically under an explicit bounded policy. Local processing does not establish media rights.

## Review desk and reliable corrections

**Test cases** now offers a two-column queue and case-specific judgment card, search/filter, neutral case numbers, mixed ordering, keyboard shortcuts, optional notes and a collapsed draft/model comparison. Labels start unselected. Main and adversarial sets have separate reviewed JSONL exports. An owner can reopen a judgment; its earlier value remains in the audit history.

Saved labels bind to the case input fingerprint and review revision. Concurrent/stale writes are rejected. Export writes are serialized and atomic; a disk export failure does not lose the stored judgment, and a direct download reconstructs saved records. Reports are hidden when their protocol, prompt, policy, pack, source cases or reviewed labels no longer match. QA labels were created only in rehearsal and reopened afterward. No genuine human-approved benchmark labels have been supplied.

Discovery confirmations, individual corrections and resets record exact before/after changes transactionally. Gameplay and Moderation show recent activity, evidence/grants and **Undo last change**. Undo requires the latest unchanged operation and current knowledge revision; it restores only that operation's changes, preserves prior knowledge, clears old reader approvals and invalidates reuse. Legacy entries without before/after snapshots remain read-only history and can be corrected individually.

Chrome verified a synthetic rehearsal Boomerang confirmation (four facts and one relationship), visible audit history, and undo back to zero known facts. Main progress was unaffected. It also verified saving/exporting/reopening labels, separate adversarial cases, note input versus number shortcuts and Ctrl+Enter saving. At 1512×736 the final review desk has no horizontal overflow and its Save control fits in the viewport. Other viewport sizes have CSS rules but have not had browser verification.

Workflow: [review, corrections and video guide](../docs/firstplay-validation-and-video.md). Screenshots: ignored `artifacts/firstplay-review-desk.png` and `artifacts/firstplay-discovery-history.png`.

## Guarded Mario visual suggestions

Mario's Gameplay view can sample a selected game window or local video. Checks send two frames one second apart. Optional periodic suggestions run about every twenty seconds while the page remains open; concurrency and a four-check-per-minute budget apply. Seeking, replacing, stopping or leaving invalidates pending evidence. A malformed batch persists no partial candidates. Suggestions require operator confirmation; they never grant knowledge automatically.

The narrow detector covers frog capture and six authored opening Moon-banner events. Positive gameplay recognition and native file/window selection remain unvalidated. Chrome's automation bridge lacked local-file access; no permission was changed to bypass it. Instead, rehearsal provides an original synthetic moving-pattern source. A genuine Codex two-frame check returned zero suggestions in 3.419 seconds and granted no knowledge. This verifies image transport and a negative response, not gameplay accuracy. The loop started another check before Stop canceled it. No Subnautica frames were sent to a model.

Proof: `artifacts/firstplay-synthetic-vision-check.json` and `artifacts/firstplay-visual-assist-synthetic.png`. Deterministic observer tests cover busy races, source/generation/timing guards, aborts, budgets, dismissal, whole-batch validation and atomic persistence.

## Evaluation correction and fresh development results

**Earlier score reports are superseded:** semantic test IDs such as `hint` and `directive` were visible to the model. Those percentages are debugging history and should not be cited as current evidence. Both provider adapters now replace message IDs with anonymous UUIDs, omit reply IDs, validate all returned IDs and restore source IDs afterward. Interpretation reuse includes this protocol revision. Evaluation mixes case families by input fingerprint before batching.

Fresh real Codex runs with `anonymous-message-ids-v1`:

| Unreviewed synthetic set | Cases | Exact draft-label agreement | Draft-prohibited containment | Draft-harmless delivery | Review | Provider failures |
|---|---:|---:|---:|---:|---:|---:|
| Subnautica opening | 79 | 96.2% | 100% | 100% | 6.3% | 0 |
| Subnautica adversarial | 24 | 100% | 100% | 100% | 12.5% | 0 |
| Mario opening | 33 | 97% | 100% | 100% | 6.1% | 0 |

Three Subnautica expected-review cases were blocked. The Mario made-up-name message “Zorple was my favorite.” was allowed as unrelated conversation instead of reviewed; it remains a policy ambiguity for human review. These are small, unreviewed synthetic development sets, not held-out or production accuracy. All results remain tied to their dataset, prompt and policy hashes. Reports are ignored under `.data/firstplay/evaluation-*.json`.

## Integration verification

The final real Twitch → EventSub → Codex → installed-reader check passed. The greeting rendered and received a real acknowledgement; the Bladderfish/water instruction was rejected and absent. The model call took **6.233 seconds**. Chrome showed the FirstPlay tab on the offline desktop channel, with native chat absent from its visible layout. This tests two fixed examples on one layout, not representative chat or live video.

Proof: `artifacts/firstplay-live-after-polish.json` and `artifacts/firstplay-twitch-after-polish.png`. Existing local viewer OAuth/status was verified in the previous checkpoint without additional viewer scopes. Main saved progress remains Subnautica four facts plus one relationship, and Mario one discovery; both case sets have zero human-reviewed labels.

The fresh `npm run demo:check` passed **eight messages in three phases**: before a synthetic manual event, after confirmation, and after undo. It checked approved versus hidden messages, cleared approvals, invalidated reuse and viewer isolation without Twitch posting or manufactured rendering receipts. Model times were 6.401, 6.329 and 3.957 seconds. Report: `.data/firstplay-demo/check-latest.json`.

`npm run check` passed all 114 controlled deterministic tests and 54 syntax checks without model or Twitch calls. Prior regression coverage includes WebSocket reconnect reentrancy, pause recovery, invisible reply parents, storage failure, atomic migration, source authority, extension bridging and mixed-cookie isolation. The supported development environment is macOS, Node 22.22.3 and Codex CLI 0.164.0-alpha.11.1; other versions/platforms remain unverified.

## Delivery and remaining work

`npm run package:source` creates an allowlisted source-only ZIP and SHA-256 manifest. It excludes credentials, capabilities, runtime chat/state, artifacts, media and the unrelated legacy prototype, and checks against locally configured secrets. The archive is verified again from a clean extraction; see ignored `artifacts/firstplay-source-verification.json`.

Human label review, representative chat/load tests, lower latency and positive permissioned Mario footage validation remain. Subnautica visual automation stays disabled. Public viewer hosting, an accessible source repository, a recorded public demo and the final hackathon entry remain unfinished; the [judge quickstart](../docs/firstplay-judge-quickstart.md) and [submission storyboard](../docs/firstplay-submission-draft.md) are prepared locally. No zero-spoiler, whole-game or automatic Subnautica tracking claim is made.

## Subnautica video/chat rehearsal checkpoint

The new Test cases → Video rehearsal surface on port 3213 embeds the public Part 1 recording with the official playback API. Four scenes contain 32 authored fictional messages. The first batch uses empty knowledge; playback pauses near a manual checkpoint and the next batch uses the confirmed or skipped state. Community chat, approved streamer preview, private model reasons, per-message knowledge snapshots, optional review judgments and an export are visible together. No video clock updates knowledge. Image-to-model execution stays disabled for Subnautica. The service uses an ephemeral engine/store independent of all saved runs and cannot run on the connected operator server or under reader/moderator authority.

Six regression tests cover fixture bindings, idempotent batches, owner/rehearsal isolation, ordering, late workers, pending confirmation, knowledge snapshots and retained hold decisions after expiry. The complete suite now has 114 tests and 54 syntax checks. A real-model 32-message HTTP check completed in eight successful batches (6.1–8.4 seconds each); 31 outcomes matched the unreviewed draft expectations and one extinguisher reaction was blocked instead of held. Browser playback and the Boomerang before/after flow were separately verified with real inference. These tests do not validate automatic recognition. The source recording is embedded, not bundled. See `artifacts/firstplay-video-rehearsal-check.json` and the [rehearsal guide](../docs/firstplay-subnautica-chat-rehearsal.md).

The in-app browser played the embedded recording and paused near the 4:30 checkpoint. The automated Chrome frame remained blank; its chat workflow worked, and the app now provides a player-readiness timeout with manual timing and a source link. This is an explicit browser-playback limit, not a successful Chrome video check.

## Rehearsal retention crash fix

An aged rehearsal previously failed to reopen after the engine removed its one-hour chat records: the review view dereferenced a missing message. Rehearsal rows now capture their own bounded fictional-message text, author and original knowledge snapshot on ingestion. Original decisions and judgments remain inspectable/exportable after expiry; expired messages stay absent from the streamer preview and are marked as history. An unchecked expired message never gains a fabricated decision. Initial restore failures also leave Start scene accessible instead of replacing the page with a generic controls error. Two new clock-driven regressions reproduce the prior crash and verify state/export HTTP responses after expiry; all 104 tests and 54 syntax checks pass. The live Twitch engine retains its existing expiry behavior.

## Durable scene-review judgments

Rehearsal Save judgment now writes the complete judged scene record to encrypted local rehearsal storage immediately. Switching scenes and restarting the server preserve saved judgments. Saved reviews shows per-scene human/model outcomes and Export saved reviews includes every retained scene. Source hashes, original message knowledge and review revisions are recorded; these assisted judgments do not populate the 79-case benchmark or constitute held-out accuracy. Two additional regressions cover reopening the disk store and rollback on a failed write; the suite now passes 106 tests and 54 syntax checks.

Before deploying the persistence change, four available user judgments from the lifepod opening scene were backed up and retained in encrypted storage. All four match the recorded model outcome. Earlier scenes were not retained by the original ephemeral workflow and have not been reconstructed or counted as reviewed; the user reported no disagreement that stood out. The filtering policy was left unchanged.

## Subnautica on-device name recognition

The macOS prototype now uses a native Objective-C helper with Apple Vision to recognize a clear Boomerang inventory tooltip across two captured frames. It proposes only `sn1.boomerang.named`; operator confirmation is required. No possession, food property or recipe relationship is granted. The Subnautica external image-model path remains disabled. The existing installed Swift toolchain had an SDK/module mismatch, so the helper uses clang and Objective-C without modifying developer tools. Source-hashed executables are cached in ignored `.data/firstplay-ocr/`.

The real native OCR/HTTP check passed one original positive and three negative fixture pairs, with approximately 0.36–0.39 seconds of OCR per pair in the initial run. A separate real text-model check held the named reaction before confirmation, allowed it after confirming the single name fact, and rejected the water-making instruction in both states. These are synthetic original fixtures, not gameplay accuracy results. Browser-generated original label imagery also produced the automatic name candidate; the two frames can be enlarged and confirmed inline in Gameplay.

Eight new controlled regressions cover context and name confidence, changed labels, static tooltip frames with advancing clocks, source cancellation, name-only grants, duplicate suppression, known-name suppression, dismissal cooldown and HTTP authority/projection. Current suite: 114 tests, 54 JavaScript syntax checks. Native source is separately compiled and exercised by `npm run recognition:check`. The first browser-approved recording check subsequently produced a Boomerang name candidate near 4:26 after enlarging the player; the small-player attempt was withheld. Periodic checks withheld new suggestions outside inventory near 4:35. No discovery was confirmed; general gameplay accuracy remains unmeasured. Mario remains on the separate image-model observer. See the [recognition guide](../docs/firstplay-subnautica-recognition.md).

## Automatic Subnautica text progress

The user requested automatic operation. Sharing video now starts periodic recognition without a second checkbox, Check button or mandatory confirmation. Eight individual name/UI facts are allowlisted. Automatic grants require strict labels in four frames across two consecutive non-overlapping checks, and never grant relationships, possession or completed actions. Missing/weak evidence, errors, stale source generations and long gaps reset proof accumulation. Synthetic test feeds remain review-only.

Automatic operations retain four private evidence frames, audit history and revision-guarded Undo. Undo/revocation persists a per-run block so the same fact is not immediately re-added. The page shows known discoveries, distinguishes another tab's capture, keeps knowledge visible after evidence expiry, hides manual tools by default and retries temporary OCR errors. Pause invalidates in-flight evidence.

Nine added regressions cover repeated/replayed evidence, source changes, weak/missing context, disabled/synthetic operation, storage failure, persistent corrections, per-fact grants, HTTP authority and long-gap/error resets. Current checks: 123 tests and 56 syntax files. Real native OCR/HTTP fixtures exercised all eight facts plus negative contexts. A real text-model before/after check passed. A disposable original-recording browser flow added progress without Check/Confirm clicks; Undo removed it. The user's real shared recording automatically added the PDA screen, with four-frame evidence. No generic visual accuracy claim follows from those examples.
