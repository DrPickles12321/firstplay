# FirstPlay — submission draft

Prepared for owner review. The source repository is public; the YouTube field remains pending. The draft does not assert personal eligibility or accept submission terms.

## Project name

FirstPlay

## Tagline

Keep the surprise. Keep the conversation.

## Short pitch

FirstPlay lets a streamer discover a game with chat without reading its spoilers. Viewers keep ordinary Twitch chat; the streamer gets a protected reader inside Twitch. Screening follows the playthrough's discovered knowledge, so a harmless reaction can become safe after a name appears on screen while instructions about what to do with it remain hidden.

## Inspiration

Emote-only chat can protect a first playthrough, but it takes away much of the conversation. Deleting a spoiler after it appears can already be too late. We wanted to preserve the community around a discovery rather than ask the streamer to choose between surprises and chat.

## What it does

FirstPlay reads real Twitch chat through EventSub and screens messages before they enter a private reader. The optional Chrome integration adds FirstPlay and Session tabs on Twitch. Viewers need no extension, keep their ordinary conversation and can check their own message-delivery status separately.

A text model interprets meaning against authored game context and explicit playthrough knowledge. A separate policy gate permits benign known-event discussion, rejects obvious spoilers/instructions and holds uncertain messages briefly for moderator review. Knowing a name is different from knowing a recipe or solution.

The Subnautica opening pilot recognizes eight supported English text facts locally with Apple Vision. Clear labels must repeat across four frames before knowledge changes automatically. Private evidence, history and Undo make each update inspectable. Seeing an item never silently grants ownership, crafting or an associated solution. Mario Cap → Cascade remains a separate saved pilot.

## How we built it with Codex

This Codex thread developed the application from the user's policy decisions through source research, authored game packs, Twitch OAuth/EventSub, model contracts, policy enforcement, protected UI, encrypted run state, extension pairing, recognition, tests and live verification. Codex helped reproduce and fix reconnect reentrancy, stale reply context, expired rehearsal records and source recovery.

Runtime text interpretation also uses a bounded signed-in Codex CLI subprocess. Each call disables tools, uses anonymous IDs and produces validated structured output. The final delivery decision is enforced separately. This is inference with authored context and explicit state; no training or fine-tuning was performed.

**Build session ID:** `01a17bc0-c457-74e0-9b1b-6d53a03c8e8f`

## Challenges

The hardest distinction was between an observed name and inferred future knowledge. We separated facts from relationships, required repeated image evidence, kept uncertain information hidden and made corrections persist. We also kept raw chat out of reader payloads, invalidated late results after run/rule changes, and made delivery receipts mean actual rendering rather than approval alone.

## What works today

- Real Twitch → EventSub → Codex → installed reader verification: a greeting rendered and received a receipt; a gameplay instruction stayed absent. Both original posts remained in ordinary Twitch chat.
- 130 controlled tests, 61 JavaScript syntax checks and nine native OCR fixture pairs passed the release preflight.
- Real-model before/after/undo checks passed. A genuine recording established the PDA screen automatically; original fixtures exercise all eight supported mappings.
- Separate saved game runs, expiring review, private reasons, evidence/history/Undo, one-hint requests, viewer status and isolated rehearsal tools are implemented.

Those examples do not establish general detection accuracy. Four assisted human scene judgments are preserved; the 79-case draft benchmark still needs independent review. Screening takes several seconds on the tested Codex route. Automatic recognition is a narrow English/macOS text pilot, and other exposure paths such as TTS and unscreened display names remain limitations. No zero-spoiler or whole-game guarantee is claimed.

## What's next

Independent held-out chat review, broader permissioned gameplay validation, lower first-message latency and additional authored game packs. The viewer-only gateway is implemented but not deployed. The local unpacked extension needs wider layout testing before a store release.

## Submission fields

- Repository URL: [https://github.com/DrPickles12321/firstplay](https://github.com/DrPickles12321/firstplay)
- Public YouTube demo URL: **PENDING PUBLICATION**
- Platform: **macOS desktop, Chrome, Node 22.13+; tested Node 22.22.3 / Codex CLI 0.164.0-alpha.11.1**
- Setup: [judge quickstart](firstplay-judge-quickstart.md)
- Current implementation: [verified checkpoint](../firstplay/IMPLEMENTATION.md)
- Media/provenance: [privacy and scope](firstplay-privacy-and-scope.md)

## Final owner checklist

The [official rules](https://twitchcon-codex.devpost.com/rules), checked November 1, require an accessible source repository with setup, a public YouTube demonstration under three minutes showing Twitch functionality and Codex development, a description and the build session ID. The deadline is **November 2, 2026, 2 p.m. Pacific / 5 p.m. Eastern**. Keep judge access available through November 15. Review eligibility, rights and final representations before submitting. Hosted deployment is not listed as a submission requirement; the local platform and its prerequisites must be stated clearly.

Use the [release handoff](firstplay-release-handoff.md) for the concrete files and publication steps. The final Devpost submission accepts binding rules and requires the owner's action-time confirmation.
