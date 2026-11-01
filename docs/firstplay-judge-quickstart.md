# Judge quickstart

FirstPlay is a local macOS/Chrome pilot. The app is free to run; real text inference uses the judge's own Codex login and normal usage. No API key or Twitch account is needed for the isolated demo. Twitch integration needs the judge's own developer application and channel authorization. No entrant credentials are included.

## 1. Install and check

Use Node **22.22.3** (minimum 22.13), Chrome and the tested public Codex CLI release:

```sh
nvm use
npm install -g @openai/codex@0.164.0-alpha.11.1
codex login
npm run doctor
npm run check
npm run demo
```

There are no project npm dependencies. If nvm is unavailable, install a compatible Node release by your usual method. `doctor` checks CLI availability, isolation flags and saved login without printing credentials. It makes no inference request.

Open **http://localhost:3213**. Settings → **Check model connection** makes one bounded real model request; it does not publish chat or change progress. The isolated app forces Twitch/public hosting off and uses separate `.data/firstplay-demo` storage and cookies.

## 2. See the discovery boundary

1. Under **Settings → Game session**, select Subnautica and start a new run if progress already exists. Saved runs are retained.
2. In **Local message test**, send **That Boomerang looks funny.** It should stay out of the protected reader because its name is not yet known. Inspect its private reason in Moderation.
3. In **Gameplay → Advanced controls and moderator tools**, choose the original **Boomerang** label test and use **Use original label test**. This is original synthetic UI imagery, explicitly labeled, not gameplay.
4. On macOS with Apple Command Line Tools, the real native OCR produces a name-only review candidate. Synthetic browser feeds deliberately stay review-only. Inspect the evidence and confirm **this discovery**. Do not use the multi-fact manual inventory event for this narrow example.
5. Send a fresh **That Boomerang looks funny.** It can now pass. Send **Cook the Boomerang.** The instruction stays hidden even though the name is known.
6. Use **Undo last change**, then send the reaction again. It stays hidden; earlier approvals are cleared. Undo prevents automatic relearning in that run.

Automatic progress from a real game/video source starts with **Share game window** or **Open local recording**, without Check/Confirm clicks for strict supported evidence. Browser source selection cannot be automated by the website. Keep that capture page open. The [recognition guide](firstplay-subnautica-recognition.md) explains the eight mappings and four-frame requirement. The source archive includes no gameplay recording.

Prefer a repeatable command? `npm run demo:check` exercises eight synthetic messages through real inference/HTTP, before/after a manual event and after Undo, entirely in memory. `npm run recognition:check -- --with-text` uses original native fixtures to test automatic single-fact grants and real text behavior. Neither changes saved runs or posts to Twitch.

## 3. See real Twitch integration

1. Copy `.env.example` to `.env` and enter your Twitch developer application's client ID/secret. Set its redirect URI to **http://localhost:3211/auth/callback**.
2. Run `npm start`; open **http://localhost:3211 → Settings → Connect Twitch** and authorize your channel. Read-chat permission is sufficient for operation.
3. Follow the [extension instructions](../firstplay/extension/README.md) to load `firstplay/extension` in Chrome and pair it. Alternatively, read the protected chat in FirstPlay or its private OBS dock.
4. Post ordinary chat using Twitch. Approved messages reach the protected reader; instructions and unknown spoilers stay absent. Community Twitch chat remains unchanged.
5. Optional **Enable test messages** grants chat-send permission. `npm run live-check` then posts two fixed tests to the connected owner's channel. It checks actual EventSub/model delivery and never invents render receipts. The test refuses Shared Chat and enforces a cooldown.

The latest check ran on an offline desktop channel: both posts were visible in ordinary Twitch chat; only the greeting rendered in the installed extension. This verifies those two examples and transport, not all Twitch layouts or classification accuracy.

Viewers open `/status` and sign in with Twitch to see only their own message statuses. The local sign-in flow is implemented and verified. Remote viewers need the separate HTTPS gateway, which is not deployed in this release. They do not need the extension. A receipt means rendered, not read by the human streamer.

## Verification commands

| Command | Effect |
|---|---|
| `npm run check` | Controlled tests, JS syntax and catalog bindings; no external service |
| `npm run recognition:check` | Native Mac OCR + HTTP checks on original fixtures; no external model |
| `npm run demo:check` | Real text model, ephemeral synthetic before/after/undo |
| `npm run release:check -- --with-model` | Full local preflight plus source ZIP; real model usage, no Twitch posts |
| `npm run live-check` | Two authorized fixed posts to the connected Twitch channel |
| `npm run package:source` | Credential-filtered source ZIP and SHA-256 manifest |

The latest release checkpoint passed 131 controlled tests and 61 JS syntax checks. Tests verify state, boundaries and failure behavior; they do not establish model accuracy. The four-scene video rehearsal and 79-case review desk under **Lab** are optional development tools, not mandatory streaming setup.

## Troubleshooting

- **Missing Codex / required flags:** use the tested public version above, or set `CODEX_BIN` in `.env`. Keep all subprocess isolation flags.
- **Login or usage failure:** use the normal `codex login` flow, check account availability, then retry Settings → Check model connection. Unchecked messages remain hidden.
- **Native compiler unavailable:** install Apple's Command Line Tools through the normal macOS installer. Text screening and manual progress still work. OCR has only been verified on macOS.
- **No text recognition:** enlarge the game view, use English supported labels, keep the sharing page open and check Gameplay's status. A replay timestamp is not evidence.
- **Source lost after closing/reloading capture:** click Share game window again. A backend restart alone can reuse a still-active browser source within its lease.
- **Twitch offline:** chat still works. The official video player correctly displays an offline screen.
- **Port in use:** main is 3211, isolated demo is 3213. Stop the previous process or set `PORT` / `FIRSTPLAY_DEMO_PORT`. The unpacked extension expects main port 3211.
- **Extension waiting:** verify the local service, pairing, site access, paired channel and a desktop window at least 800px wide. Native chat stays covered while enabled.

Start with the [README](../README.md) for architecture, supported games, privacy and limits. The [implementation checkpoint](../firstplay/IMPLEMENTATION.md) distinguishes actual verification from planned work.
