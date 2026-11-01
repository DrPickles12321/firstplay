# Privacy, deployment and supported scope

## What goes where

Twitch chat reaches the local operator service through EventSub. Text and authored game context are sent to the configured text-inference service. The default adapter invokes the signed-in Codex CLI in an ephemeral, tool-disabled, read-only subprocess, without extracting its authentication. It uses anonymous per-request message IDs and validates complete structured output before policy evaluation.

Subnautica's native Apple Vision helper processes sampled frames on this Mac. Those frames are not sent to Codex or another image service. Mario's optional image observer does send sampled images to the configured provider, requires manual confirmation, and has no verified positive gameplay accuracy. Only select a game/video source that excludes unfiltered chat and private windows.

Encrypted local state holds Twitch tokens, game runs, temporary chat and private observation evidence. Default chat retention is one hour; observation evidence normally expires after five minutes. Confirmed knowledge, corrections and saved reviews persist. Runtime data is excluded from the source archive. The UI provides discovery corrections/Undo and extension revocation.

Private reader, broadcast overlay, moderator and viewer permissions are separate. Reader payloads contain approved text and safe current-session metadata only. Capability links are credentials: keep them private. The Chrome extension stores a revocable channel-bound reader capability in trusted extension storage; it cannot moderate or change discoveries.

## Protection limits

FirstPlay screens the chosen reader. It does not delete original Twitch messages or protect other chat clients, alerts, TTS, video captions, audio, display names or text visible before protection starts. The current version intentionally leaves display names unchanged. A model may still misinterpret subtle language or unknown references. There is no zero-spoiler guarantee.

The automatic Subnautica pilot recognizes eight English names/UI facts, not every discovery. It requires repeated exact labels and expected UI context. Names do not grant ownership, recipe relationships or completed actions. Other progress remains manually confirmable. Original fixture tests and isolated recording examples do not establish representative gameplay precision/recall.

Model screening takes several seconds on the tested Codex route. Batches, exact-repeat reuse and bounded review reduce repeated work but do not solve first-message latency or validate large-channel throughput. On error, expiry, overload or malformed output, raw text stays hidden. Moderation is a private raw-text surface and may contain spoilers.

## Remote viewer status

The operator server binds to loopback and is not a public hosting target. A localhost link works only on the same computer.

The optional viewer-only gateway has no operator, model, moderator, discovery or private-reader routes. To deploy it:

1. Provide a trusted HTTPS reverse proxy forwarding **only port 3212**, preserving the public Host header. Keep operator port 3211 private.
2. Set `FIRSTPLAY_VIEWER_ORIGIN=https://your-viewer-host.example` and register `https://your-viewer-host.example/auth/callback` as an additional Twitch redirect URI.
3. Restart FirstPlay and share the public `/status` URL. Viewers sign in to see only their own records; no chat-reading scope is requested from them.

The local viewer OAuth/status flow is verified. No gateway domain, tunnel or hosting is deployed, so the external HTTPS flow is unverified. This optional feature is not required for the streamer reader or local judge demonstration.

## Media and provenance

The source includes authored game facts with research/source registers, original generated OCR fixtures, application source and one tightly cropped screenshot of FirstPlay's own reader. It includes no third-party gameplay recording, music or guide screenshots. Research links are not redistribution permission. Any external video in the optional rehearsal remains an external embed, not an included asset or a media-rights grant.

The prepared demo uses genuine UI captures and original fixture imagery, labels its offline Twitch test channel and synthetic recognition example, and has original narration without music. Review the final public materials and applicable rights before publication. Archived development notes are provenance, superseded by the current implementation checkpoint.
