# FirstPlay for Chrome

This Manifest V3 extension replaces **My Chat** in `dashboard.twitch.tv/u/<channel>/stream-manager` with a protected reader. It also adds **FirstPlay** and **Session** tabs on `www.twitch.tv/<channel>`. It reads the existing local FirstPlay service; it does not scrape native messages for classification or change what viewers see.

## Why this is the preferred streamer interface

The streamer can stay in Stream Manager, keep Stream Preview and the other dashboard widgets, and read screened messages in the existing My Chat widget. The reader follows the widget when it moves or resizes. The public channel page is an additional supported view. Viewers install nothing. The local FirstPlay app remains the place for pairing, policy settings, moderator review, evaluation, and OBS links. The existing OBS dock remains useful for creators who work primarily in OBS.

The cost is installing an extension, keeping the local service running, and maintaining compatibility when Twitch changes its DOM. This interface does not improve model latency or establish better detection accuracy. Protected mode is a **reader**. It hides the original message list and composer; turning protection off restores the original chat interface. The Stream Manager widget toolbar remains available.

## Install locally

1. Start the local service with `npm start` from the repository root.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select this folder, `firstplay/extension`, which contains `manifest.json`.
4. Review Chrome's access request for **www.twitch.tv**, **dashboard.twitch.tv** and **localhost**, and allow the extension if you accept that access. Pin FirstPlay from Chrome's Extensions menu if desired.
5. In `http://localhost:3211`, open **Settings → Chrome extension → Create pairing code**.
6. Open the FirstPlay extension popup, paste the code, and click **Pair extension**. Allow localhost access if Chrome prompts. The user-initiated popup first checks the local service, then redeems the code. The code expires after five minutes and can be redeemed once.
7. Open your paired channel’s **Creator Dashboard → Stream Manager** and reload it. My Chat shows the FirstPlay reader. The public channel page also works. Site access must be enabled so the guard can load before native chat renders.
8. Open the FirstPlay extension popup and use its **Protect Twitch chat** switch to turn protection on or off. The same switch controls both supported views.

**Updating from 0.1.0:** reload the existing extension in `chrome://extensions`, approve the added `dashboard.twitch.tv` site access if Chrome requests it, then reload Stream Manager. Keep the same extension folder so existing pairing is retained; no additional Twitch OAuth scopes are requested.

No Twitch password, Twitch OAuth token, model key, or private operator URL is pasted into the extension. Pairing grants a channel-bound reader capability. It cannot read the raw moderation queue, change discovery state, or use owner APIs. Credentials remain in extension-only storage; the Twitch content script receives approved messages and safe session metadata only.

## Protection behavior

- Static CSS hides native Twitch chat before the content script starts. On Stream Manager, only chat is covered; Stream Preview, activity and other widgets remain usable when the service is unavailable. The English My Chat widget title and its body identify the replacement boundary. Changes to the native chat subtree remain covered. Channel pages retain their separate full-page startup guard.
- While enabled, native chat is covered on **other Twitch channels too**. Only the paired channel receives a FirstPlay feed. To read other channels normally, turn off **Protect Twitch chat** in the popup.
- A service failure, missing pairing, revoked grant, or unsupported channel does not reveal native chat.
- The FirstPlay tab shows approved original messages. A collapsed, hidden or offscreen chat reader cannot generate new rendering receipts. The Session tab shows the selected game/segment, policy, connection and confirmed-discovery count; it contains no future fact pack or raw moderation queue. Game switches use the same pairing and clear the previous run's feed.
- Turning protection off is explicit. Disabling/removing the extension or withholding its site access restores ordinary Twitch behavior. Messages seen before enabling/reloading cannot be undone.
- Display names remain unfiltered, matching the selected v1 policy. Model mistakes and other exposure paths such as TTS or alerts remain limitations.

In Stream Manager, FirstPlay fills the existing My Chat widget body without changing its size or the dashboard layout. The widget header and resizing/docking controls remain native. The supported dashboard route is `/u/<channel>/stream-manager`, with the English **My Chat** widget. Other dashboard pages are not modified.

On public channel pages, FirstPlay reserves the right-hand 340-pixel column and requires a desktop window at least 800 pixels wide. Native popout chat, VOD chat, mobile pages, third-party chat widgets and other layouts remain unsupported. Dashboard messages are still channel-bound; another channel’s widget stays covered while protection is enabled.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save pairing and the explicit protection preference; access restricted to trusted extension contexts |
| `https://www.twitch.tv/*` | Apply the native-chat guard and display the approved reader; notify open Twitch tabs when protection changes |
| `https://dashboard.twitch.tv/*` | Chrome grants access by site; the content script is declared only for Stream Manager and the bridge independently checks the exact route/channel |
| `http://localhost/*` | Chrome host permissions cannot limit ports; code contacts only `http://localhost:3211/api/extension/…` |

The service worker accepts a fixed set of operations, not arbitrary URLs. The popup's connection check reads only the fixed local `/api/health` endpoint. There is no remote code, third-party analytics, cookie access, native messaging, broad browsing-history permission, or externally connectable webpage API. The local app records pairing and last reader/render acknowledgement times for connection verification. **Disconnect paired extensions** in FirstPlay Settings revokes the reader capabilities. Disconnecting pairing in the popup forgets that browser's local token and keeps protection on.

## Verification status

Automated tests cover pairing authority/expiry/single use, extension identity, channel binding, revocation, reader/API isolation, replay exclusion, background-message boundaries and monotonic protection revisions. The browser fixture uses this extension's actual CSS/content script with simulated Twitch DOM/transport and genuine configured-model classification. It is not a screenshot of an installed extension on Twitch.

Run `npm run preview:extension` for the channel fixture, or `npm run preview:extension -- --surface dashboard` for the Stream Manager fixture, on port 3214 by default. The fixture never publishes to Twitch.

The user-installed extension passed a separate real Chrome/Twitch check on October 30, 2026. Two fixed messages traveled through Twitch EventSub and the configured Codex model: the greeting appeared in the injected FirstPlay tab and received an extension render acknowledgement; the frog-capture instruction was rejected and absent. Native chat had `display: none` and no visible rectangles. The Session tab and keyboard return to FirstPlay also worked. Evidence is in `artifacts/firstplay-extension-verification.json` and `artifacts/firstplay-extension-live-reader.png`.

This check covered one desktop channel page while the channel was offline. It does not establish classification accuracy, live-video behavior, other Twitch layouts or compatibility with third-party extensions. This remains a local prototype, not a Chrome Web Store release or a guarantee of zero spoiler exposure.

Subnautica was separately checked with real Twitch/Codex delivery: a greeting rendered, a Bladderfish/water instruction stayed absent, native chat stayed covered and render telemetry advanced. The same channel-bound pairing supplies either game's approved feed. Version 0.2.0 adds the dashboard permission described above; existing pairing is retained.

## Stream Manager verification

The local dashboard fixture runs the same content script and CSS against original markup matching the observed My Chat widget. Eleven checks passed, covering first-paint hiding, on/off restoration, resizing, remounting, changed native classes, service failure, hidden-reader receipts and a stale disabled response. This fixture is explicitly simulated.

On November 1, 2026, the user reloaded the installed extension and granted dashboard access. A separate real Chrome Stream Manager check confirmed that FirstPlay filled the existing My Chat body, native chat had no visible rectangles, and Stream Preview and the other widgets remained available. The Subnautica greeting reached the reader with a render receipt; the water-making instruction was rejected and absent. Session showed the current game, segment and four confirmed discoveries, and keyboard navigation between tabs worked. The screenshot in the root README is cropped from this actual dashboard check.

The installed check covered one English desktop Stream Manager while the channel was offline. Popup on/off behavior, resizing and failure cases were exercised in the local fixture and background regressions; they are not claimed as separate installed-browser interactions. Evidence is retained locally in `artifacts/firstplay-dashboard-live-check.json` and `artifacts/firstplay-dashboard-fixture-check.json`. This does not establish live-video behavior or representative model accuracy.
