# Subnautica opening pilot: use and demo

Start FirstPlay with `npm start` and open http://localhost:3211. Twitch authentication and the paired extension are already configured on the development machine. Do not copy `.env`, `.data`, pairing codes or private reader URLs into the submission.

For practice without posting to Twitch, run `npm run demo` and open http://localhost:3213. This explicitly labeled rehearsal uses separate data and browser sessions, keeps Twitch disabled, and still calls the real text model. Use Settings → Local message test there. The connected app on port 3211 remains independent. `npm run demo:check` runs eight synthetic HTTP/model checks across unknown, confirmed and undone discovery states without changing either saved app's progress or manufacturing renderer receipts.

For a ready-made video/chat experiment, open **http://localhost:3213/rehearsal** and click **Start scene** (or **Restart scene**). It generates fictional chats, pauses the source recording at a manual checkpoint and shows the real model decisions beside community/streamer previews. See the [32-message rehearsal guide](firstplay-subnautica-chat-rehearsal.md). This uses a temporary trial and does not change the saved sessions described below.

## Start or resume

1. In **Settings → Game session**, choose **Subnautica** and **Start new session** for an empty discovery record. This saves the previous run. To continue an existing run, choose it under **Saved sessions** and **Resume saved session** instead.
2. Open **Gameplay → Open Part 1 recording**. The public source is [Royalty Free Game Clips' Subnautica Part 1](https://www.youtube.com/watch?v=hh5dckAV5Pg). It is recorded gameplay. No Switch is needed. This app does not rebroadcast that video. Share its playback tab through Gameplay to supply actual frames.
3. Click **Share game window** and select the video tab in Chrome. Recognition starts automatically. Clear supported labels update progress after two checks; manual moderator tools are under Advanced controls.
4. Read protected chat on the paired Twitch channel, the FirstPlay Stream page or a private OBS dock. Chatters keep ordinary Twitch chat. Moderators can inspect private rejection reasons/review items in **Moderation**.

The current development Subnautica session contains the Boomerang inventory confirmation used for verification. Start a fresh session when demonstrating the before/after behavior. Mario's previous saved discovery is preserved separately.

## A short demonstration

Use the same account/channel and identical wording in real Twitch chat; these are expected behaviors, not a promise of perfect model classification.

1. Before confirming a named fish, send **“That Boomerang looks funny.”** Its undiscovered identity should keep it out of the protected reader, normally pending review. Do not approve it yet.
2. Around **04:25–04:30**, share a large view of the Boomerang inventory tooltip and hold it long enough for repeated checks. The automatic path adds the name only (and the PDA screen if clearly visible); no possession, food property or recipe is inferred. The timestamp is a research sample, not an earliest-reveal schedule.
3. Send a **new** copy of **“That Boomerang looks funny.”** A harmless reaction to a now-confirmed identity can pass. Hidden old messages are not replayed automatically.
4. Send **“Catch a bladderfish and make water.”** It stays hidden: an unsolicited instruction/unknown use does not become permitted because another fish was observed.
5. Briefly show **Settings → Saved sessions** to restore Mario, then resume Subnautica. Each run retains its own discoveries and clears the displayed chat on switching.

`npm run live-check` posts only the two fixed greeting/instruction fixtures in the connected owner's channel, with a cooldown. It checks real EventSub → model → reader delivery; it does not exercise the whole named-item demonstration. Repeated demo messages can still be moderated as spam by Twitch, so avoid repeatedly posting them.

## Text-only development checks

These commands call the real configured text model without posting to Twitch or changing live progress:

```sh
npm run classify -- --game subnautica --text "That Boomerang looks funny."
npm run classify -- --game subnautica --text "That Boomerang looks funny." --known sn1.boomerang.named
npm run classify -- --game subnautica --text "Catch a bladderfish and make water."
npm run evaluate -- --game subnautica --include-drafts
npm test
```

Use **Test cases** to review the 79 opening synthetic draft labels or choose the separate 24-case adversarial set. The polished review desk offers shortcuts, notes, separate exports and source/revision guards; see the [review guide](firstplay-validation-and-video.md). Reviewed Subnautica labels export to `.data/firstplay/reviewed-cases.subnautica.jsonl`; evaluate that file explicitly with `--game subnautica --dataset ...`. Keep separate unseen examples for a later accuracy evaluation. Do not call the draft run validated accuracy.

For the new name detector, see the [on-device recognition guide](firstplay-subnautica-recognition.md). Four-frame automatic single-fact updates are independent of replay timestamps. Authored multi-fact events remain manual.

## Current limits

- Eight supported single text discoveries can be added automatically by local macOS OCR after repeated checks. Other events remain manual and the external image-model path stays disabled. Native fixtures and isolated real recording examples work; general gameplay accuracy is unmeasured. Publisher/media permission questions remain relevant. Uploader reuse permission for the recording does not settle all underlying rights or submission promotional rights.
- The scope is the original game's English PC opening. Reference-only future facts help recognize spoilers but are ineligible for progress confirmation. No automatic timeline, seek detection, whole-game guarantee or training/fine-tuning exists.
- The real integration check took about six seconds of model time. Batch diagnostics took about 7–14 seconds. Chat volume, ambiguous language and moderator workload need representative testing.
- Remote viewer status is not deployed. Display names remain unscreened, and TTS/alerts/other windows can still expose spoilers.
- The installed extension has been reloaded and its Game/Segment rows verified on Twitch. Future extension-source updates require **Reload** in `chrome://extensions`, followed by a Twitch reload; no re-pairing is normally needed.

For submission, record a concise demonstration of real chat plus clearly labeled recorded gameplay, show Codex's role, provide source/setup/session identification, and recheck the [official hackathon rules](https://twitchcon-codex.devpost.com/rules). This implementation does not publish a submission, repository or video.
