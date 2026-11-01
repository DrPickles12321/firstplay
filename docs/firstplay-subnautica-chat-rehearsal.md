# Subnautica: video and example chat

Open **http://localhost:3213/rehearsal**, or **Lab → Video rehearsal** from the connected app. The latter opens the isolated rehearsal. Run `npm run demo` if port 3213 is not already serving.

This operator page combines a public source recording, fictional community chat, the streamer's approved-message preview and the actual model's filtering decisions. It contains raw spoilers and is intended for testing, not as the streamer's regular reading surface. No messages are posted to Twitch, and neither saved Mario nor saved Subnautica progress is changed.

1. Choose a scene and click **Start scene**. If an earlier trial is displayed, **Restart scene** creates a new empty trial and starts playback. The first four messages are sent through the real configured classifier.
2. Playback pauses near a discovery checkpoint. Inspect the recording and **Evidence and exact discovery grants**. Choose **I saw this — confirm discovery**, or **Continue without confirming**. Pending message checks must finish before confirmation.
3. Playback resumes and generates four more messages. The next batch uses the resulting discovery state. Earlier hidden messages are not released.
4. Compare **Community chat** with **Streamer preview**. Select a message under **Filtering decisions** to read the reason and the exact discoveries known when it arrived.
5. Choose your expected outcome, optionally add a note, and **Save judgment**. Judgments are saved immediately in the local encrypted rehearsal store, independent of the Test cases benchmark and live filtering rules. Changing scenes or restarting does not discard saved judgments. The Saved reviews section lists all retained scene reviews; Export saved reviews downloads them together.

Four scenes contain **32 authored fictional messages**:

| Scene | Recording interval | What it tests |
|---|---|---|
| A new fish name | 4:10–4:54; checkpoint near 4:30 | The same Boomerang reaction before/after confirmation; cooking and water hints stay hidden |
| Fire in the lifepod | 0:40–1:19; checkpoint near 0:55 | Confirmed tool-use reactions versus instructions about what to do |
| The first surface view | 1:50–2:24; checkpoint near 2:00 | Seeing a ship does not reveal its name, future events or nearby hazards |
| Names in the PDA | 4:52–5:24; checkpoint near 5:00 | An inspected recipe or list entry does not imply ownership, completed scans or crafting |

The source is [Royalty Free Game Clips' Subnautica Part 1](https://www.youtube.com/watch?v=hh5dckAV5Pg). The original game is by Unknown Worlds. The embedded recording is not downloaded or rebroadcast by FirstPlay. Times are illustrative chat cues near previously inspected point samples, not validated first-reveal times. Always inspect the evidence before confirming; unsampled intervals may contain earlier discoveries.

The player uses the [official YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference) for playback and time. The player controls can mute or unmute the recording. If embedding is unavailable, use **Open source recording**, then **Use manual timing** and **Send next chat batch**. Manual timing does not inspect the video. Moving the playback cursor pauses automatic chat scheduling and asks for a scene restart; seeking never grants knowledge.

Refreshing preserves the current in-memory trial and opens it with manual timing. Server restarts clear playback state, while Saved reviews remains available. **Restart scene** replays video and chat together. An additional window can inspect the same trial; replacing it makes older windows stop their playback automation. Expired review messages retain their original hold decision in this testing view, so it can still be inspected. After the one-hour chat retention window, fictional messages, original knowledge snapshots and judgments remain available as History in the current trial; explicitly saved judgments also remain in the durable Saved reviews export; expired messages disappear from the streamer preview. They are never restored to the reader automatically.

## What is and is not being measured

The messages use the normal model interpreter and deterministic policy gate. Expected draft labels are never sent to the model. The 32-case real-model development check completed with eight successful model batches: 31 outcomes matched the unreviewed draft labels; the other was blocked instead of held. This is a synthetic development diagnostic, not production or held-out accuracy.

Discovery confirmation is **manual**. The Subnautica image-to-model endpoint remains disabled, and this replay does not automatically recognize objects or actions. Its video clock schedules chat only. This lets filtering be tested against visible evidence without claiming a working automatic Subnautica detector.

Reproduce the text/HTTP check with `npm run rehearsal:check`. It uses an ephemeral, Twitch-disabled server and synthetic confirmation fixtures, calls the real model, checks safe-reader projection and saved-run isolation, and writes `artifacts/firstplay-video-rehearsal-check.json`. It does not inspect video, establish gameplay recognition or issue renderer receipts. Deterministic regression tests run with `npm run check` and use controlled model outputs.

Browser verification: the in-app browser played the recording and paused at the checkpoint. A separate automated Chrome test showed a blank embedded frame, so universal embed availability is not claimed; a ready timeout and manual-timing/source-link fallback are included. The side-by-side chat and review controls were verified at desktop and narrow in-app widths.

Save reliability is covered by regression tests that reopen the encrypted store, switch scenes and inject a failed write. A failed save does not overwrite the previous judgment. Saved review records carry the scenario source hash, pack version, original knowledge snapshots and a revision. They record assisted human review because model answers were visible, and are not automatically copied into the separate 79-case benchmark.
