# FirstPlay release handoff

The local desktop pilot is implemented and verified. The [source repository](https://github.com/DrPickles12321/firstplay) is public with owner approval. The video and Devpost entry remain unpublished. This handoff separates the working software from the final publication actions.

## Ready locally

- Main app: **http://localhost:3211** — Twitch connected, installed Chrome reader paired, real model check passed.
- Isolated app: **http://localhost:3213** — separate runs/reviews, no Twitch connection. Existing browser sharing can keep recognition running while the page stays open.
- Source archive: `artifacts/firstplay-source.zip`, with a separate SHA-256 file manifest. It excludes credentials, capabilities, saved chat/state, artifacts, third-party gameplay and the legacy prototype.
- Captioned silent demo draft: `artifacts/firstplay-demo-draft.mp4` — **2 minutes 10 seconds**, 1920×1080, genuine UI captures and original test imagery. It is a walkthrough assembled from actual stills, not a live screencast.
- [Submission description](firstplay-submission-draft.md), [judge setup](firstplay-judge-quickstart.md), [optional narration script](firstplay-demo-script.md), [current evidence](../firstplay/IMPLEMENTATION.md) and [scope/privacy](firstplay-privacy-and-scope.md).
- [Read-only GitHub Actions checks](https://github.com/DrPickles12321/firstplay/actions/workflows/check.yml) run on repository pushes; the initial remote result is being verified.

The release checks passed 131 controlled tests, 61 JS syntax checks, nine original native OCR pairs, real-model before/after/undo and a fresh two-message Twitch integration check. Saved Mario/Subnautica progress and four genuine assisted review judgments were preserved. These are bounded implementation checks, not representative model-accuracy measurements.

## Final publication actions

1. **Review the demo's build section.** It shows actual source/test artifacts from this Codex session. The available automation cannot capture the Codex app window. Before submission, replace or supplement that 18-second section with a short recording showing this build thread/source view. Keep the final video under three minutes. The optional script supplies exact narration; no music or third-party gameplay is needed.
2. **Source publication completed:** [https://github.com/DrPickles12321/firstplay](https://github.com/DrPickles12321/firstplay). The owner approved the public repository. Only the clean allowlisted source export was pushed; the workspace root, `.env`, `.data` and private artifacts were excluded.
3. **Upload the reviewed video publicly to YouTube** and put that URL plus the repository URL into the submission draft. No YouTube account credentials or upload permission were assumed.
4. **Submit on Devpost after owner review** of eligibility, material rights and final representations. Submission accepts binding rules. The deadline is **November 2, 2026, 2 p.m. Pacific / 5 p.m. Eastern**; keep judge access available through November 15. See the [official rules](https://twitchcon-codex.devpost.com/rules).

Build session ID: `01a17bc0-c457-74e0-9b1b-6d53a03c8e8f`.

## During the demonstration

Use the protected reader, not raw Twitch chat. Keep a separate Gameplay sharing page open. Browser source selection is the one unavoidable user gesture; the app cannot silently select a game window. The actual recording capture on the isolated app does not change the connected app's separate run. Start capture on port 3211 when using automatic recognition for live Twitch screening.

Explain that the Twitch test channel is offline; chat transport still works. Label the original recognition fixture as a test, not footage of Subnautica. A delivery receipt means rendering in FirstPlay, not human attention. Do not show capability links or credentials on screen.

Public hosting is optional for this local reader demo. A remote audience status link needs the separate HTTPS viewer gateway; that deployment is unverified and is not included in the submitted platform claim. Representative evaluation, broader recognition and lower latency remain future work, not features asserted by this pilot.
