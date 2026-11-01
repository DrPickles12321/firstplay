# FirstPlay for Chrome

This Manifest V3 extension adds **FirstPlay** and **Session** tabs beside the video on `www.twitch.tv/<channel>`. It reads the existing local FirstPlay service; it does not scrape native messages for classification or change what viewers see.

## Why this is the preferred streamer interface

The streamer can stay on Twitch, keep Twitch's player and channel navigation, and read the same screened feed previously shown in a separate page. Viewers install nothing. The local FirstPlay app remains the place for pairing, policy settings, moderator review, evaluation, and OBS links. The existing OBS dock remains useful for creators who work primarily in OBS.

The cost is installing an extension, keeping the local service running, and maintaining compatibility when Twitch changes its DOM. This interface does not improve model latency or establish better detection accuracy. This version replaces the native chat column with a protected **reader**; it does not reproduce Twitch's message composer or platform moderation controls.

## Install locally

1. Start the local service with `npm start` from the repository root.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select this folder, `firstplay/extension`, which contains `manifest.json`.
4. Review Chrome's access request for **www.twitch.tv** and **localhost**, and allow the extension if you accept that access. Pin FirstPlay from Chrome's Extensions menu if desired.
5. In `http://localhost:3211`, open **Settings → Chrome extension → Create pairing code**.
6. Open the FirstPlay extension popup, paste the code, and click **Pair extension**. Allow localhost access if Chrome prompts. The user-initiated popup first checks the local service, then redeems the code. The code expires after five minutes and can be redeemed once.
7. Reload your paired Twitch channel page. The extension needs site access enabled so its guard can load before Twitch renders chat.

No Twitch password, Twitch OAuth token, model key, or private operator URL is pasted into the extension. Pairing grants a channel-bound reader capability. It cannot read the raw moderation queue, change discovery state, or use owner APIs. Credentials remain in extension-only storage; the Twitch content script receives approved messages and safe session metadata only.

## Protection behavior

- Static CSS hides native Twitch chat before the content script starts. The page remains covered until the expected native layout is recognized. Unknown layouts show a protected waiting screen instead of raw chat.
- While enabled, native chat is covered on **other Twitch channels too**. Only the paired channel receives a FirstPlay feed. To read other channels normally, use the popup's explicitly labeled **Show unfiltered Twitch chat** action.
- A service failure, missing pairing, revoked grant, or unsupported channel does not reveal native chat.
- The FirstPlay tab shows approved original messages. The Session tab shows the selected game/segment, policy, connection and confirmed-discovery count; it contains no future fact pack or raw moderation queue. Game switches use the same pairing and clear the previous run's feed.
- Turning protection off is explicit. Disabling/removing the extension or withholding its site access restores ordinary Twitch behavior. Messages seen before enabling/reloading cannot be undone.
- Display names remain unfiltered, matching the selected v1 policy. Model mistakes and other exposure paths such as TTS or alerts remain limitations.

FirstPlay reserves the right-hand 340-pixel column and keeps the Twitch page visible beside it. The first version targets desktop channel pages in windows at least 800 pixels wide. Twitch Creator Dashboard, native popout chat, VOD chat, mobile pages, third-party chat extensions and unusual layouts are not verified integrations. Narrow windows are covered and direct the user back to FirstPlay.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save pairing and the explicit protection preference; access restricted to trusted extension contexts |
| `https://www.twitch.tv/*` | Apply the native-chat guard and display the approved reader; notify open Twitch tabs when protection changes |
| `http://localhost/*` | Chrome host permissions cannot limit ports; code contacts only `http://localhost:3211/api/extension/…` |

The service worker accepts a fixed set of operations, not arbitrary URLs. The popup's connection check reads only the fixed local `/api/health` endpoint. There is no remote code, third-party analytics, cookie access, native messaging, broad browsing-history permission, or externally connectable webpage API. The local app records pairing and last reader/render acknowledgement times for connection verification. **Disconnect paired extensions** in FirstPlay Settings revokes the reader capabilities. Disconnecting pairing in the popup forgets that browser's local token and keeps protection on.

## Verification status

Automated tests cover pairing authority/expiry/single use, extension identity, channel binding, revocation, reader/API isolation, replay exclusion, background-message boundaries and monotonic protection revisions. The browser fixture uses this extension's actual CSS/content script with simulated Twitch DOM/transport and genuine configured-model classification. It is not a screenshot of an installed extension on Twitch.

Run `npm run preview:extension` for that explicit local fixture. The fixture never publishes to Twitch.

The user-installed extension passed a separate real Chrome/Twitch check on October 30, 2026. Two fixed messages traveled through Twitch EventSub and the configured Codex model: the greeting appeared in the injected FirstPlay tab and received an extension render acknowledgement; the frog-capture instruction was rejected and absent. Native chat had `display: none` and no visible rectangles. The Session tab and keyboard return to FirstPlay also worked. Evidence is in `artifacts/firstplay-extension-verification.json` and `artifacts/firstplay-extension-live-reader.png`.

This check covered one desktop channel page while the channel was offline. It does not establish classification accuracy, live-video behavior, other Twitch layouts or compatibility with third-party extensions. This remains a local prototype, not a Chrome Web Store release or a guarantee of zero spoiler exposure.

Subnautica was separately checked with real Twitch/Codex delivery: a greeting rendered, a Bladderfish/water instruction stayed absent, native chat stayed covered and render telemetry advanced. After updating this source, reload the existing FirstPlay extension in `chrome://extensions`, then reload Twitch to see the new Game/Segment rows. No re-pairing or added permissions are needed. The running service can already supply either game's approved feed to the previously installed version.
