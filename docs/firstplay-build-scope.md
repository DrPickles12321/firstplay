# FirstPlay: complete build scope and game-generalization plan

**Updated:** October 30, 2026, America/New_York. **Status:** implementation proposal plus draft research data; no FirstPlay application, trained model, measured classifier results or validated video detector yet. This is the current plan and supersedes conflicting choices in the October 27 scope documents. The existing Between Rounds files are an unfinished different prototype.

## 1. Product and exact promise

FirstPlay lets a creator read a screened version of Twitch chat while the community keeps its ordinary chat. It supports discovery playthroughs and creator-selected challenge restrictions. It does not remove viewers' messages from native Twitch chat or require viewers to install anything to participate.

The initial product consists of:

1. A private creator chat reader usable as an OBS custom browser dock or standalone window.
2. An optional transparent Browser Source showing the same approved chat on the broadcast.
3. An authorized moderator console for uncertain messages and discovery verification.
4. A game-independent policy/classification/delivery service, with the first reviewed pack covering Super Mario Odyssey's Cap → initial Cascade segment.
5. An optional viewer page showing delivery status for that viewer's own messages.
6. Progress observation from explicit game-window/video capture, initially narrow and supplemented by moderator confirmation.

**An overlay and a private dock are different:** adding a Browser Source to an output scene puts it into the broadcast; a dock is a creator-side interface. An OBS source does not by itself create a private floating layer over the actual console/game display. A native always-on-top desktop overlay is excluded from the first build. See [OBS Browser Source](https://obsproject.com/kb/browser-source) and the official [obs-browser project](https://github.com/obsproject/obs-browser/blob/master/README.md).

Viewers retain native chat. The creator must use FirstPlay instead of an unfiltered chat surface. Standard incoming chat events do not provide a universal custom pre-publication veto. Existing TTS, donation messages, notifications and other chat clients are outside this filter. [Twitch chat](https://dev.twitch.tv/docs/chat/send-receive-messages/).

## 2. Decisions established with the user

| Decision | Required behavior |
|---|---|
| Clear spoilers or prohibited hints | Reject automatically, without filling the review queue |
| Uncertain cases | Hide while queued; expire without delivery if unresolved |
| Mixed safe/unsafe message | Reject the entire original message; no rewriting or partial redaction |
| Replies to rejected parents | Reject; pending parents hold dependent replies until resolved |
| Keyword role | Find possible references; never determine meaning alone |
| Model role | Interpret meaning and produce structured labels plus a short diagnostic reason |
| Knowledge authority | Verified gameplay evidence or authorized moderator; chat can only suggest verification |
| Automatic tracking | Clear, validated positive evidence may update state; uncertain evidence requires confirmation |
| Error preference | Favor containing unwanted information over preserving every harmless message; still measure both |
| Delay | Approximately two seconds as an initial ordinary-message target, not an achieved guarantee |
| Processing | Small bounded batches, each message with its own decision |
| Hint accumulation | No cumulative hint allowance or cross-message solution tracking in v1 |
| Tests | Model drafts messages/labels; user reviews expected answers; held-out examples and recording replays |
| Display names | Unfiltered in v1, as explicitly chosen; this leaves a documented spoiler path |

Proposed UI: `Strict social` rejects game-related discussion, including harmless game reactions. `Discovery` permits benign confirmed-event conversation and rejects new disclosures; its `Allow gentle exploration hints` toggle permits search guidance without an exact reward/solution reveal. This preserves the user's strict option without forcing everyone to abandon game conversation. Rules for challenges apply independently of prior knowledge. Mark these preset names/UI organization as implementation choices, not additional user commitments.

The gentle-hints examples approved during discussion permit broad exploration guidance and possibly a suggested search area; an exact hidden-Moon disclosure is prohibited. This is intentionally more permissive than discovery-only mode. It is not a promise that multiple permitted hints cannot collectively solve a puzzle.

## 3. How this generalizes to other games

Build one engine and versioned data/adapters, rather than hard-coding Mario into the application.

| Layer | Reused across games | Game-specific work |
|---|---|---|
| Twitch transport | OAuth, EventSub lifecycle, deletion handling | None normally |
| User experience | Reader, moderator queue, settings, viewer delivery page | Pack labels and discovery controls |
| Classification | Intent categories, uncertainty, protected delivery rules | Facts, aliases, solution relationships and examples |
| Knowledge ledger | Confirm/revoke events, evidence, revisions, separate run state | Which event establishes which fact |
| Observation pipeline | Capture permission, sampling, candidate queue, timestamps | Capture forms, title banners, quest markers, HUD cues |
| Evaluation | Replay runner, reports, held-out process | Correct labels, representative footage, domain reviewers |

Offer three honestly different support levels:

- **General strict mode:** reject game-related discussion without requiring a complete discovery graph. Game/genre identifiers and aliases help topic recognition, but ambiguity, multilingual chat and disguised references still require evaluation.
- **General challenge rules:** interpret instructions, hints and creator-written restrictions. This can operate without a full story map, but subtle game-specific advice may be missed. No claim of universal reliability.
- **Verified discovery pack:** reviewed facts, relationships, reveal conditions, progress events and per-game evaluation. This is where familiar discussion can safely become eligible after a confirmed discovery.

Changing the Twitch category is not equivalent to supporting a new game. An unverified game must display its support level. Do not silently offer full progress-aware protection from a model's memory.

To add a game: choose a bounded segment/version → research sources → author stable fact/relation IDs and aliases → specify confirmation evidence → map controls/detectors → draft and review examples → run independent replay evaluation → publish a versioned coverage statement. A moderator-only adapter is sufficient initially; automatic scene understanding is not a prerequisite for a new pack.

For larger games, retrieve relevant facts from a larger library using entities/current area plus semantic search if measured need justifies it. Include known-fact references and solution relationships, not merely the most similar prose. Missing retrieval is unresolved information, not evidence of safety. Do not give a runtime classifier arbitrary web browsing tools. A small second-game fixture can test that the engine has no Mario-specific branches; it does not establish production support for that second game.

## 4. Context versus training versus keywords

**Recommended first build: no fine-tuning job.** Supply reviewed facts, current confirmed state, policy and a few labeled examples in the request. Store facts outside the model so they can be corrected and versioned without retraining.

| Material | Purpose |
|---|---|
| Game fact pack | Explicit contextual knowledge, sourced and reviewable |
| Player knowledge ledger | Changing per-player facts established by evidence |
| Aliases/keywords | Retrieve potential references; `moon`, `hat` and `doggo` can be harmless in other contexts |
| Few-shot examples | Demonstrate how wording changes intent or outcome under a policy/state |
| Reviewed evaluation cases | Measure results on examples not used for tuning |
| Later fine-tuning examples | Potentially improve stable classification behavior after demonstrated baseline failures |

Training on a list of Moon words will not teach whether a message is a reaction, sarcasm, an undiscovered solution or permitted guidance. Fine-tuning also does not hold a particular streamer's live discovery state. If later justified, train behavior on reviewed examples with supplied context across multiple games; retain external facts/state and separate evaluation. No fine-tuning, upload, API inference or model training was performed for this scope.

This follows the distinction between context and behavior optimization in the [official OpenAI accuracy guide](https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy) and [few-shot prompting documentation](https://developers.openai.com/api/docs/guides/prompt-engineering). Do not select a model on assumed speed: benchmark a suitable text model and separate vision capability using actual account access, current supported schemas, latency and token use at implementation time.

## 5. Mario research deliverable and remaining context work

The draft [Mario fact pack](../research/firstplay/packs/smo-cap-cascade.v0.2.json) contains **47 facts, nine relationships, six selected Moon entries, 21 confirmation events and ten linked sources**. Initial known facts/relations are empty. Automatic events are disabled until validated. The [research notes](../research/firstplay/packs/README.md) explain coverage and verification.

An additional October 30 research pass compiled the [complete 836-objective Moon checklist](../research/firstplay/collectibles/moon-checklist.md), worth 880 Moon units, plus a [full Cascade reference](../research/firstplay/collectibles/cascade-reference.md) with all 40 Moon entries and location groups covering its 50 purple coins. The [collectible research notes](../research/firstplay/collectibles/README.md) link structured JSON and all-game regional-coin maps. This reference catalog does not automatically expand validated runtime support or confirm any player discoveries.

It separates seeing an entity, discovering its capture mechanic, demonstrating an ability, learning a particular solution and collecting a reward. The route includes the Cap introduction, frog tutorial, Topper, onward travel, Cascade captures/traversal, the falls encounter and departure preparation. It also models selected optional Moon discoveries. This is a researched starting pack, not all Mario context, every secret in these areas, or a reviewed runtime asset.

Key factual sources: [Cap mission](https://www.mariowiki.com/Cappy_of_the_Cap_Kingdom), [first Moon](https://www.mariowiki.com/Our_First_Power_Moon), [falls mission](https://www.mariowiki.com/Multi_Moon_Atop_the_Falls), [capture reference](https://smo.wiki/Capture), [selected Moon availability](https://www.mariowiki.com/List_of_Power_Moons_in_the_Cascade_Kingdom). Store source URLs with every fact. Check English names/availability against owned or appropriately permissioned footage and a knowledgeable review before claiming coverage. Do not ingest entire walkthrough prose or redistribute guide images.

Remaining context tasks: verify the 47 facts; test aliases and indirect wording; label what is learned at each recorded timestamp; capture positive/negative detector frames; review sample labels; measure unresolved content frequency; expand only where evaluation shows a meaningful gap. Unknown game-related claims are held when unresolved; explicit future disclosures can be rejected semantically even without a complete encyclopedia. Ordinary unrelated conversation remains eligible.

## 6. Progress recognition without constant creator input

Keep two independent loops:

`gameplay → observation → supported event candidate → evidence check → knowledge ledger`

`chat → bounded batch → interpretation with knowledge snapshot → policy gate → approved reader`

Do not send a screenshot with every chat message. The observer updates a compact ledger; many classifications reuse it.

### Capture and observation

1. Build recording replay first: local/permissioned video plus an authoritative playback clock and timestamped events. Never expose future frames or later discovery annotations to an earlier test.
2. For live input, a normal browser capture page requires explicit selection of the game-only window. The protected dock does not automatically acquire the console feed. An alternative is OBS Virtual Camera configured to output the game source rather than the full stream scene; OBS documents source-specific output in its [Virtual Camera guide](https://obsproject.com/kb/virtual-camera-guide). Validate the chosen method on the actual device/OBS/browser combination.
3. Crop locally to gameplay, excluding raw chat and notifications. Sample and deduplicate frames. Do inexpensive local OCR/image-change detection first when useful; budget separate vision requests only for candidate events. Sampling rates are experiment parameters, not reliability claims.
4. Initial detector candidates: a persistent captured-frog appearance and the exact English collection banner for one selected Moon. A scene with a frog proves neither capture nor every frog move. A Moon title in a menu is not a collection event.
5. Candidate records include event ID, capture/session ID, observed timestamp, evidence reference and detector version. The observer may propose only existing authored events; it cannot execute arbitrary model-produced state mutations.
6. Uncertain evidence goes to the moderator. Automatic confirmation is enabled per event only after reviewed positive and hard-negative replay tests. Model confidence alone is insufficient. Confirming a capture/collection never grants all associated solutions or tactics.

The in-game capture list can suggest historical capture types if it is naturally shown, but this research establishes no external API for reading it. Do not require the creator to open it repeatedly. A prior-save capture also does not prove it occurred during the current challenge. [Capture-list reference](https://smo.wiki/Capture).

Precision of discovery updates matters more than completeness: a missed event can keep harmless discussion hidden; a false event can authorize unknown information. Maintain manual confirm/revoke as a reliable path. Generic vision can misdescribe images and struggle with small text; validate narrow cues rather than claiming to understand the full playthrough. [Official vision limitations](https://developers.openai.com/api/docs/guides/images-vision).

## 7. Classification and queue specification

Start with a maximum batch wait of **200 ms**, up to **eight messages**, and bounded worker concurrency. These are proposed settings to tune. Flush on time or size; never wait for quiet chat to fill a batch. Measure low-volume and burst cases separately. Use ordinary synchronous inference for these short batches, not a deferred offline batch-processing job.

Inputs: original message ID/text, exact reply relationship, game-pack version, confirmed fact/relation IDs, applicable knowledge snapshot, run objective/constraints and policy version. Supply a short approved conversation context only as needed. Treat all viewer content and claims as untrusted data. Include the compact full pack initially if the benchmark permits it; do not add a vector database as a prerequisite.

Proposed structured output per ID:

```json
{
  "message_id": "example-id",
  "game_relevance": "current_game",
  "intents": ["exact_solution"],
  "fact_ids": ["cascade.moon_04.location"],
  "relation_ids": [],
  "has_unresolved_reference": false,
  "recommended_disposition": "reject",
  "short_reason": "Reveals an unconfirmed secret location."
}
```

Use schema-constrained output, validate IDs/enums/counts and require exactly one result per submitted message. Unknown, duplicate or missing IDs cannot become approvals. Structured output constrains format, not truth; refusals, invalid responses and semantic errors still need handling. [Official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

The server applies policy independently of the explanation. Unknown references are never silently mapped to confirmed facts. A quote or negation can still reveal information. Releasing one message does not confirm its referenced discoveries. Never rewrite a message to invent a safe version.

Proposed classification deadline: **three seconds**; normal delivered-message target: **p95 around two seconds at a declared test rate**. Timeout/failure stays hidden and is counted. Do not claim latency by ignoring rejected, expired or failed messages; report those populations separately.

Proposed review TTL: **30 seconds**, with **100-item** channel capacity. Expire old items, bound per-user submissions and show overload without copying raw text into the reader. These numbers are defaults to validate, not user-selected requirements. No automatic release on expiry. A moderator release checks TTL, authorization, current policy, reply dependencies and removal state.

No strict global head-of-line blocking: use a small ordering window, then let resolved independent messages proceed. Pending replies wait for their parent; rejected parents reject dependents. Missing parent context is reviewed or withheld. A problematic message does not block the whole channel indefinitely.

## 8. Twitch, reader and moderator work

Use a persistent Node/TypeScript service, React interfaces, SQLite for the initial single-instance deployment, SSE for outgoing app feeds and authenticated HTTP actions/receipts. Twitch EventSub uses its own WebSocket connection. Defer Redis, multiple services, native apps and multi-region deployment until measured demand.

Broadcaster OAuth uses server-side tokens and the minimum chat-reading permission for the selected User Access Token flow. Subscribe to `channel.chat.message`, `channel.chat.message_delete`, `channel.chat.clear_user_messages` and `channel.chat.clear`. Implement authorization state checks, refresh/validation, keepalive, deduplication, subscription revocation and reconnect. A lost-connection interval has no event replay; show degraded state. [EventSub authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage), [WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).

Moderator access uses broadcaster-approved exact Twitch IDs. Reader, capture, viewer and moderator permissions are distinct. A read-only OBS URL cannot approve messages, fetch the fact pack or call moderator endpoints. Viewer login does not require chat-sending or ban permissions. No public auto-deletion, messages from a bot, whispers or punitive moderation are required for v1.

The reader receives only approved original text, escaped display names and minimal styling/status. Per the user's choice, names are not spoiler-screened. Omit avatars, external embeds, active link previews, raw quoted parents and custom-emote images initially. Text in an emote name still enters text classification. Keep pending/held content out of reader network responses, DOM, accessibility labels and debugging data—not merely hidden with CSS.

The moderator console provides raw-message inspection, reasons, one-message release/reject, candidate discoveries/evidence, confirmation/revocation, queue age and pause controls. Future discoveries and sensitive explanations do not appear in creator-facing controls. Filter messages from moderators too; authorization to operate the console is not a content bypass.

Core records: channel/session, role grants, packs/facts/relations, knowledge events, run state, policy versions, messages, dispositions, review actions, observation candidates and reader receipts. Encrypt stored tokens and temporary raw content with appropriate separate secrets; exclude them from operational logs. Default raw message/status retention: one hour. Retain knowledge only as explicitly saved profile state; allow reset/delete. Capture crops should be short-lived and moderator-only. Disclose model-provider processing; do not claim local-only inference.

## 9. Viewer feedback: feasible first version and limits

**Define status as delivery to FirstPlay, not human attention.** The app can verify that an authenticated primary reader acknowledged rendering a message. It cannot establish that the creator looked at it. Use `Delivered to FirstPlay reader`, never `Read by streamer`.

Proposed states: `Checking`, `Awaiting review`, `Approved; reader offline`, `Delivered to FirstPlay reader`, `Not delivered`, `Expired`, and `Removed`. An approval alone is not a delivery receipt. A public stream overlay must not acknowledge delivery on behalf of the private primary reader. No ingested record means `No FirstPlay record`, not proof that the filter rejected it; native AutoMod or a disconnected interval may prevent receipt.

| Option | Viewer effort | Constraint | Scope |
|---|---|---|---|
| Separate viewer page | Optional link and Twitch login | Outside native chat | First optional feature after core protection |
| Twitch Panel/Component Extension | Open panel; identity permission for personalized state | Extension development/review/hosting and identity integration | Later; local/hosted test can be demonstrated honestly |
| Browser extension adding local chat markers | Viewer install/permissions | DOM maintenance and platform coverage | Defer |
| Public bot receipt after every message | No extra page | Creates chat noise and adds sending/rate-limit work | Exclude |
| Approved-chat overlay on stream | None | Shows approved feed, not a private per-user receipt | Optional alongside private reader |

I found no documented standard API to add arbitrary delivery ticks beside existing native chat messages. Twitch Extensions run in their own sandboxed views; Extension chat APIs post new messages. An Extension can supply its own status UI, not silently rewrite Twitch's chat rendering. [Extension architecture](https://dev.twitch.tv/docs/extensions/), [chat API behavior](https://dev.twitch.tv/docs/chat/send-receive-messages/).

For the viewer page, derive the sender ID from authenticated Twitch identity, not a submitted username or guessed message ID. Return only that person's recent records in the channel. Show neutral reasons, not the hidden knowledge graph or raw moderator diagnostics. Add cache isolation, rate limits and cross-user access tests. A viewer does not need to visit this page for filtering to work.

A later Extension needs identity linking to associate a viewer with their chat author ID, authenticated backend state and public-release review. Do not schedule external approval as a dependency of the hackathon. [Identity helper](https://dev.twitch.tv/docs/extensions/reference/#requestidshare), [Extension lifecycle](https://dev.twitch.tv/docs/extensions/life-cycle).

## 10. State and failure invariants

- Snapshot knowledge/policy at message receipt. A later discovery must not automatically dump old held messages into the reader. Recheck current restrictions and revocations immediately before delivery; stale asynchronous decisions are not approvals.
- Deletion, user clear or chat clear records a tombstone and cancels pending delivery. A late model result or moderator action cannot resurrect removed text. Remove already-delivered messages when appropriate.
- A policy/pack/session switch invalidates in-flight context. On game change, suspend discovery-aware delivery until a supported profile is selected.
- A queue overflow, provider budget limit, malformed result, timeout or disconnected input never falls back to raw chat. Show safe connection/service status and count the lost/delayed work.
- Broad discovery state is never inferred from a visited location. Two known facts do not establish a solution relationship. Chat cannot edit state or instructions.
- A reader acknowledgement is bound to the current authorized primary reader/session and message ID. Repeated events/acks are idempotent. A disconnected reader is not reported as having received a message.
- Pack files, raw queues, evidence and moderator reasons must not be publicly served as static assets. Reader tokens and viewer sessions cannot access them.

## 11. Work packages and completion checks

| Order | Deliverable | Done when |
|---|---|---|
| 1 | Versioned policies, pack schema and reviewed Mario context | IDs/relations resolve; coverage and exclusions explicit; baseline profile starts unknown |
| 2 | Recording/chat replay harness | Timestamped inputs replay deterministically; expected decisions and future-state leakage checks work |
| 3 | Classifier adapter and policy gate | Reviewed cases run; schema failures hold; reasons recorded privately; small batches measured |
| 4 | Knowledge store and moderator controls | Confirm/revoke actions are authorized, auditable and affect new decisions correctly |
| 5 | Real Twitch integration | Authentication, incoming events, lifecycle and removals work in an actual channel |
| 6 | Private reader and optional stream overlay | Approved-only network/DOM verified; clear connection state; primary-reader receipt isolated |
| 7 | Review workflow and bounded queues | Auto-rejections stay out of queue; TTL/capacity enforced; safe one-message approval works |
| 8 | Narrow observation detector | One capture/title event evaluated on footage; uncertainty requests confirmation; manual fallback stays usable |
| 9 | Optional viewer status page | Two accounts see only their own records; delivery requires genuine reader acknowledgement |
| 10 | Reliability, evaluation and setup | Failure/race/access cases pass; declared-rate report and clean setup instructions available |
| 11 | Submission and credits | Real-Twitch demo, Codex evidence, repository access, rights/attribution and limitations documented |

Implement as a FirstPlay project, preserving the unrelated unfinished prototype until intentionally replacing it. Candidate modules: Twitch adapter, pack loader, knowledge store, policy gate, classifier/batcher, delivery service, observer, reader, moderator UI, optional viewer status and replay runner. Separate interfaces matter more than separate deployments.

Critical path: reviewed facts/rules → replay + classifier + ledger → protected reader + live Twitch → failure checks + evaluation → submission. Build observation in parallel only as available time permits; do not let an ambitious observer hide a broken classifier. Since one automatic discovery is part of the intended demo, keep it to one validated event rather than promising universal tracking.

## 12. Evaluation plan

The adjacent [draft cases](../research/firstplay/evaluation/draft-cases.jsonl) are unreviewed examples, not achieved results. Expand to roughly 200–300 reviewed English cases with at least 40 paired state/policy changes. Preserve paraphrase families in the same split. Review labels yourself as requested; use a second game-knowledgeable reviewer on difficult cases if available. Keep a held-out set untouched until the prompt/policy is frozen.

Cover ordinary conversation, known reactions, exact spoilers, gentle/prohibited hints, strategic reminders, new relationships, quoted/negated disclosures, mixed text, replies, unknown nicknames, later-game references, obfuscation, injection, wrong evidence and provider errors. Test game-related and unrelated uses of broad aliases. Recording tests must pair video timestamps with chat/state, not simply judge a video without expected message decisions.

Compare keyword-only, generic spoiler prompt and context/ledger-aware classification. Report containment of prohibited messages, harmless-message delivery, known-reference delivery, review fraction, expiry fraction, severe errors, latency distribution, token cost and moderator action time separately. Optimize for containment as the user prefers; hiding all chat still fails the usefulness test.

For observations, separately report confirmed-event precision, missed events, false discovery updates and detection delay. Inspect individual high-impact errors; no self-reported model confidence or tiny sample establishes a reliable probability. Automatic updates stay off for detector types that have not met reviewed evidence criteria.

Load-test a declared low/moderate rate such as five incoming messages/second plus a short burst; report actual results, not an assumed large-channel capacity. Essential integration cases: no held text in reader responses; revoked/guessed tokens; cross-viewer receipt access; rejected-parent replies; deleted message before late classification; policy revocation in flight; queue overflow; model refusal/timeout; disconnect/reconnect; duplicate events; capture input stops; reader offline; stale evidence from a different session. Do not use deliberately harmful test messages on an uninformed creator.

For generalization, run the same engine against a minimal independently reviewed second-game fixture without Mario-specific application changes. Report it as an architecture experiment until enough domain testing supports stronger claims. Generalization of interfaces is not generalization of measured accuracy.

## 13. Deadline plan, cuts and rough effort

These are engineering estimates, not promises: pack/labels 3–5 hours; replay/classifier 6–9; Twitch/reader 5–8; ledger/review 6–10; reliability/evaluation 5–8; submission/setup 3–5. That is roughly **28–45 focused hours** before narrow vision work or personalized viewer feedback. Allow another 5–12 hours for detector experimentation and 3–5 for the viewer page; existing integration trouble can increase these numbers.

With the current date October 30 and submission deadline November 2, the whole polished vision is aggressive for one builder. Scope cuts must be explicit:

- **Oct 30:** review the draft pack/policy, create replay/labels and prove a classifier-to-protected-reader slice.
- **Oct 31:** connect real Twitch, add ledger/review and essential deletion/error handling; test one narrow observer candidate.
- **Nov 1:** evaluate, fix severe failures, polish setup and record submission. Add viewer receipts only after the core passes; otherwise keep them as a designed next step.
- **Nov 2:** submit early before **2 p.m. Pacific / 5 p.m. Eastern**. Do not depend on Extension approval, whole-game research or fine-tuning to finish.

Minimum credible demo: actual Twitch chat, untouched community chat, private screened reader, two knowledge states, a known-but-prohibited hint, a working review/expiry path and one honestly demonstrated discovery update. A recorded input can exercise recognition if labeled; a simulated detector is not a real detection result. If automatic tracking cannot be validated, show moderator-confirmed progress and explicitly identify automatic tracking as unfinished.

The [hackathon rules](https://twitchcon-codex.devpost.com/rules) require a functioning Twitch-connected project built with Codex during the build period, a repository with runnable materials, a description/session ID and a short video showing Twitch functionality and Codex work. Keep judging access available through the judging period. Use owned/permissioned footage for testing and submission, with appropriate game/creator rights; Nintendo's [video-sharing guidelines](https://www.nintendo.co.jp/networkservice_guideline/en/index.html) are not blanket permission to redistribute someone else's VOD or a training corpus.

## 14. What remains uncertain

Measured classifier quality, latency/cost, detector precision, actual moderator burden, recording/capture availability, reviewed fact accuracy, cross-game results and viewer adoption are all unestablished. This scope provides a concrete way to answer them. It does not claim a trained model, completed overlay, complete Mario knowledge, universal game support or guaranteed spoiler prevention.
