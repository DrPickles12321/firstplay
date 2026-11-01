# Streamer interface decision: Chrome extension

The extension is a better primary interface **for a streamer who wants to stay on Twitch**. It moves FirstPlay's existing approved feed into the familiar channel page and requires no viewer installation. The separate app remains valuable for moderation, evidence, configuration and OBS integration.

This is a Chrome browser extension, separate from Twitch's platform Extension product. It does not alter anyone else's chat, delete messages, or copy privileged operator access into Twitch. Twitch EventSub remains the ingestion path. Model interpretation, knowledge enforcement and uncertainty handling remain in the existing local service.

Two design choices are essential to this recommendation:

1. Native messages must be hidden **before rendering**, rather than shown and removed after asynchronous classification. Chrome supports [static content-script CSS before DOM construction and rendering](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts). A startup page guard, native-chat guard and layout checks keep the interface covered when integration is unavailable.
2. The extension must be a restricted renderer. Pairing creates a short-lived single-use code, then a channel-bound reader grant. The extension's [background service worker makes cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) only to fixed local reader endpoints. It never hands a credential to the Twitch content script. Existing owner/moderator endpoints remain inaccessible.

The new tabs are FirstPlay and Session. Neither offers raw chat as a casual tab switch. Returning to unfiltered Twitch chat is an explicit popup action. That follows the user's conservative preference about unwanted disclosures.

Tradeoffs: installing and pairing the extension adds setup; the local service must run; Twitch UI changes require maintenance; other channels are covered while protection is enabled; the protected column is a reader rather than a complete replacement for Twitch's composer and moderator controls. The initial scope is desktop `www.twitch.tv/<channel>` pages. Creator Dashboard, native popouts and third-party chat extensions need separate work.

The user explicitly requested this conditional change after previously choosing a separate reader, then installed and paired the extension in Chrome. No Web Store publication or broader host access is part of this change.

The local fixture and automated tests establish properties of the implementation. A separate installed-Chrome check on October 30, 2026 confirmed the real Twitch feed, approved-message rendering and acknowledgement, rejected-instruction exclusion, native-chat hiding, and safe Session/keyboard tabs. The channel was offline. Two fixed messages on one channel do not establish spoiler-classification accuracy, live-video behavior, compatibility with every Twitch update or an absolute guarantee about injection timing.
