# FirstPlay: review, discovery corrections and video assistance

Updated October 31, 2026. The connected app is at http://localhost:3211; the isolated rehearsal is at http://localhost:3213 after `npm run demo`. Both use the real configured text model. Rehearsal has separate storage and cookies, with Twitch posting and the public gateway disabled.

## Review the classifier's examples

Open **Lab** in the top bar. Mario has 33 opening cases. Subnautica has 79 opening cases and a separate 24-case adversarial set. These are authored synthetic examples; their initial labels have not been human-approved.

1. Read the message, its rules, confirmed discoveries and any reply parent. The case's knowledge is independent of live progress.
2. Choose **Allow**, **Block**, or **Hold for review**. Allow exposes the original message to the streamer; the other choices keep it hidden. Hold means a moderator must decide before its review timer expires.
3. Add a short optional note for an ambiguity, then **Save & next**. Keys **1 / 2 / 3** choose an outcome; **Ctrl/⌘ + Enter** saves. Typing into a note or search box does not choose an outcome.
4. Use **Compare with draft and model** after making an independent judgment. Neither the draft nor the model's answer is preselected. The queue uses neutral case numbers and mixed ordering.
5. Use **Reviewed** to revisit saved judgments. **Mark needs review** removes a judgment from the current reviewed export and retains its previous value in the audit history.

Download exports with **Download reviewed cases**. Saving also updates a private local JSONL file. Main and adversarial sets have separate files. A failed file write does not discard the saved judgment; the download is reconstructed from saved records. Source fingerprints and optimistic revisions reject stale writes, and changed case inputs require review again.

For the connected app's Subnautica opening labels:

```sh
npm run evaluate -- --game subnautica --dataset .data/firstplay/reviewed-cases.subnautica.jsonl --output .data/firstplay/evaluation-subnautica-latest.json
```

For its adversarial labels:

```sh
npm run evaluate -- --game subnautica --dataset .data/firstplay/reviewed-cases.subnautica.adversarial.jsonl --output .data/firstplay/evaluation-subnautica-adversarial.json
```

Mario uses `--game mario`, `.data/firstplay/reviewed-cases.jsonl` and `.data/firstplay/evaluation-mario-latest.json`. Rehearsal uses `.data/firstplay-demo/` instead. The review desk displays the matching command after saving a judgment. These commands call the model and consume normal account usage. They refuse drafts unless `--include-drafts` is explicitly supplied.

**Evaluation correction:** earlier runs exposed semantic case IDs such as `hint` and `directive` to the model. Their percentages are superseded debugging history. The current adapters replace message/reply identifiers with neutral IDs, validate every returned ID and restore the source IDs only afterward. Evaluation also mixes case families before batching. Reports bind the inference protocol, prompt, policy, pack and source cases; edited labels invalidate their reviewed report. Independently collected, held-out examples are still needed before making accuracy claims. Reviewing a tuning set does not make it held out.

The latest neutral-ID development runs matched 96.2% of 79 Subnautica draft labels, 100% of 24 adversarial draft labels and 97% of 33 Mario draft labels, with no provider failures. All draft-prohibited examples stayed hidden and all draft-harmless examples passed in those runs. Three Subnautica expected-review cases were blocked. One Mario expected-review case, the made-up name “Zorple,” was allowed as unrelated conversation; this ambiguity needs a human policy judgment. These tiny synthetic sets do not estimate production accuracy or moderator workload.

## Confirm and correct discoveries

In **Gameplay**, choose an observed event and inspect its evidence requirements and exact fact/relationship grants. Confirm only what the player has actually discovered. Chat claims, a model suggestion and the presence of an item name in a menu do not independently establish progress.

**Recent discovery changes** shows the event, evidence note, grants and revision. **Undo last change** reverses only that operation's changes, preserving discoveries that were already known. It also clears previous reader approvals and invalidates pending interpretation reuse. It does not replay old hidden chat. Undo is available only for the latest unchanged operation; a stale second operator must refresh. The undo remains in the audit trail.

Older saved confirmations that predate the operation snapshots are visible as history but cannot be safely undone automatically. Correct those facts individually in Moderation. Each game/run retains its own knowledge and history.

`npm run demo:check` exercises eight synthetic messages across three phases: unknown name, confirmed name, and after undo. It uses real model inference and HTTP roles, verifies viewer isolation and does not fabricate renderer receipts, post to Twitch or change the saved live/rehearsal sessions.

## Mario video suggestions

Mario's **Gameplay → Visual suggestions** can inspect a selected game-window preview or local recording. A preview alone does not send images. **Check current gameplay** sends two frames, one second apart, to the configured image model. The optional **Suggest discoveries while playing** repeats checks about every 20 seconds while this page remains open. Browser scheduling can add delay; background-tab cadence is not guaranteed.

Only frog-capture evidence and six authored opening Moon-banner events are supported. Suggestions display their frame evidence for an operator to inspect. **No suggestion grants knowledge automatically.** Dismiss a wrong suggestion; confirm only sufficient evidence. Seeing a location does not confirm its secrets or rewards.

Only one check can run at a time, with a four-check-per-minute budget. Seeking, replacing or stopping a source invalidates its pending evidence. Old run/source/policy results are discarded. Closing the page stops its capture loop. Turning off repeated suggestions lets an active check finish; **Stop video input** cancels it. No continuous recording is uploaded.

The rehearsal also has **Use synthetic test feed**: an original moving pattern generated in the page, with no game assets or file access. A genuine two-frame Codex check returned no discovery candidates in 3.419 seconds and granted no knowledge. That verifies the transport/negative-result path, not real gameplay recognition. Positive detection, real footage accuracy and native capture selection still require permissioned gameplay and manual testing.

## Subnautica boundary and other remaining work

Subnautica now supports eight automatic single text discoveries through local macOS OCR and repeated evidence. Authored multi-fact events remain manual; its external image-model path remains disabled. See the [recognition guide](firstplay-subnautica-recognition.md). The publisher's [Subnautica 2 guidelines](https://subnautica.com/en/policy/content-guidelines) restrict sequel assets as AI reference inputs, while broader franchise wording leaves original-game applicability unclear. The recording uploader's reuse statement does not resolve that question. No Subnautica gameplay frames were sent to a model in these checks.

The next substantive validation work is independent human label review, representative chat/load testing, and positive Mario discovery tests using suitable footage. Text inference still takes several seconds. Remote viewer hosting, source/video publication and the hackathon submission remain separate unfinished deliverables; no public operator endpoint has been exposed.
