# FirstPlay: Cap → Cascade implementation scope

> Historical October 27 segment proposal. See the [October 30 complete build scope](firstplay-build-scope.md) and [source-linked draft pack](../research/firstplay/packs/smo-cap-cascade.v0.1.json) for the current design and the user's later classification decisions. Older manual-only tracking and metadata-screening defaults below are superseded where they conflict.

Planning date: October 27, 2026. Proposal only; no FirstPlay implementation or measured accuracy yet.

## Product promise and boundary

**Play Super Mario Odyssey with normal Twitch conversation while FirstPlay screens out undiscovered information and unwanted advice.**

Support begins on a fresh save in Cap Kingdom and ends when the player is ready to leave Cascade for the first time. The first pack covers the main route and six selected Cascade Moon entries, rather than every secret accessible in either kingdom. Sand Kingdom, Cap revisits, completionist routes, glitches and speedrun techniques are outside the supported pack. Relevant unsupported messages go to review; being outside the pack does not make a message safe.

The protected surface is an OBS chat dock supplied by FirstPlay. Viewers type in ordinary Twitch chat. The creator reads the screened dock, with an optional screened stream overlay. Ordinary native Twitch chat remains a separate, potentially spoiler-bearing surface; receiving chat events does not give an external app a universal pre-publication veto. [Twitch moderation documentation](https://dev.twitch.tv/docs/chat/moderation/).

Two independent protections apply: hide undiscovered information; withhold unsolicited solutions even when they use known mechanics. One knowledgeable moderator controls discoveries and reviews uncertain messages. No viewer install, game mod or game-memory reader is needed.

**This planning document contains game spoilers.** The creator-facing interface must not expose its future-discovery list.

## 1. Supported play segment

| Segment | What the pack models | What is confirmed separately |
|---|---|---|
| Cap opening | Cappy and basic hat interactions | Meeting Cappy does not reveal every advanced move |
| Top-Hat Tower | Frog capture and demonstrated jumping | Seeing a frog is different from discovering capture |
| Cap encounter | Topper, the observed fight, onward travel | Encounter identity, learned strategy and victory are separate |
| Cascade arrival | Area arrival and first Moon objective | Entering the kingdom reveals no optional secrets automatically |
| First Moon | Chain Chomp capture and the demonstrated rock interaction | Creature seen, mechanic learned and local solution are separate |
| Cascade exploration | T-Rex, 2D section and selected optional Moon entries | Track whichever the player actually observes; do not assume route order |
| Falls encounter | Madame Broode encounter and Multi Moon reward | Meeting the boss does not authorize chat to explain the fight |
| Departure preparation | Confirmed collected Moons and travel readiness | Stop support before the next kingdom's content |

The Cap route introduces Cappy, frog capture inside the tower, Topper and onward travel. [Cap mission reference](https://www.mariowiki.com/Cappy_of_the_Cap_Kingdom). Cascade introduces the first Power Moon through a Chain Chomp interaction. [First Moon reference](https://www.mariowiki.com/Our_First_Power_Moon).

Initial Moon entries: **#1 Our First Power Moon; #2 Multi Moon Atop the Falls; #3 Chomp Through the Rocks; #4 Behind the Waterfall; #5 On Top of the Rubble; #6 Treasure of the Waterfall Basin.** Store each entry's availability separately from whether the creator knows it. In particular, #5 and #6 are listed as available after the Multi Moon. Do not use an all-Moons checklist as the player's discovery state. [Availability reference](https://www.mariowiki.com/List_of_Power_Moons_in_the_Cascade_Kingdom).

Cascade requires five Moon units for onward travel; the Multi Moon contributes three. The two story rewards alone therefore do not supply the whole departure requirement. The pack needs optional-Moon handling rather than a simple two-boss completion flag. [Cascade progression reference](https://smo.wiki/Cascade_Kingdom), [Multi Moon value and selected routes](https://www.powerpyx.com/super-mario-odyssey-power-moon-locations-cascade-kingdom/).

Before freezing the pack, record an ordinary fresh-save run and check availability, English on-screen names and event order against it. Record the game version and capture settings. Guide descriptions establish candidates, not proof that a particular creator has learned something.

## 2. Method for knowing what the player knows

Use a small authored ledger, not an unrestricted model's guess about progress. Planning budget: roughly 25–35 fact records, 10–15 solution/relationship records and 8–12 convenient discovery controls. These are scope budgets, not coverage claims.

Each fact has an ID, aliases, type, reveal condition and source. Relevant types include `entity_seen`, `mechanic_observed`, `location_seen`, `solution_observed`, `moon_collected`, and `encounter_completed`. Relationships also have IDs: knowing about Chain Chomps and rocks does not establish knowledge of a particular secret behind a particular rock.

Each confirmation records actor, time, evidence, affected IDs and a state revision. Keep accumulated player knowledge distinct from the current run's collected Moons and challenge restrictions. A correction can revoke a mistaken entry and invalidate dependent decisions.

### Required method: one-click moderator confirmation

The moderator watches the gameplay and has a compact, spoiler-informed checklist. A click can confirm an authored bundle of facts genuinely shown by an event, with inspection and undo. Examples: `frog capture demonstrated`, `first Moon collected`, `T-Rex capture demonstrated`, `waterfall secret found`.

Bundles must be conservative. `Entered Cascade` only confirms arrival. `Boss defeated` does not mark every possible boss tactic as known. Collection confirms that Moon and its displayed title; it does not prove which route or technique the player understood. The moderator separately confirms a demonstrated solution when needed.

Target a handful of meaningful updates per area, then measure the actual burden in a play session. More granular corrections are available, but creators should not have to narrate every action or type discovery commands.

### First automation to try: on-screen Moon-title recognition

After the manual path works, test a small optional companion capture page in OBS:

1. Operator explicitly selects the game-capture window once using screen capture; this is an additional setup step, not something a Browser Source automatically receives.
2. Crop the gameplay/title region locally and sample around twice per second initially; avoid capturing the desktop or unfiltered chat.
3. OCR the Moon-collection banner. Match against the six authored English titles, requiring a collection-banner cue and agreement across frames. A map or checklist title alone must not count as collection.
4. Put a timestamped candidate in the moderator console for one-click confirmation. Deduplicate repeated frames; ignore unmatched text.
5. Retain no continuous video by default. A temporary evidence crop is optional and stays in the authorized console.

The sampling rate and OCR thresholds are experimental. Test the real capture resolution, animation, scaling and title visibility before claiming reliability. This detects a narrow event; it does not discover every mechanic, prove understanding, or identify arbitrary unseen secrets. Keep moderator confirmation in the hackathon build.

| Alternative | Useful role | Scope decision |
|---|---|---|
| Vision model on gameplay frames | Suggest visible capture/encounter events | Later experiment; scene recognition is weaker evidence of understanding |
| Speech transcription | Suggest explicit statements about a discovery | Later; questions, jokes and repetition do not prove knowledge |
| Game memory/mod telemetry | Report some exact game-state events | Excluded; adds installation/platform dependencies and still cannot report understanding |
| Chat messages | Input to screening | Never authority for discovery or permission changes |

The shipping baseline is manual confirmation. OCR is the first optional automation, not a prerequisite for a useful prototype.

## 3. Method for judging messages

Use **authored facts + a semantic classifier + server-enforced policy**. Keywords retrieve possible references; they cannot reliably distinguish a reaction, a hint, a denial and a quoted spoiler.

For this small pack, include the entire compact fact/relationship table in model context if it fits the measured latency/cost budget. Avoid a vector database for v1. Supply confirmed knowledge IDs, current objective, policy, explicit help grant, exact reply context when available and a short recent approved conversation window. Raw chat is untrusted content, not instructions or established game state.

Request structured output: referenced fact/relationship IDs, unknown-information flag, advice/strategic-reminder flag, uncertainty and a short moderator-only explanation. Validate it server-side. The server makes the final allow/hold/review decision; a model's self-reported confidence is not a probability.

| Example | Decision and reason |
|---|---|
| `That jump was clean` | Allow ordinary reaction |
| `You can become that frog` before capture discovery | Hold new mechanic |
| `The frog bit earlier was hilarious` after confirmation | Allow past-event conversation |
| `Use the frog to get up there` during no-advice play | Hold actionable help, even after learning capture |
| `That dinosaur is huge` after it is seen | Eligible observation; does not reveal capture |
| `You can control the dinosaur` before that is learned | Hold new mechanic |
| `Check behind the waterfall` before the secret is found | Hold location/solution hint |
| `How did you find that waterfall Moon?` after collection | Eligible past-event discussion; do not supply an unknown solution automatically |
| `Remember what broke the last rock?` while stuck | Hold a strategically timed reminder under strict rules |
| `You're getting warmer` | Hold unsolicited directional feedback when it guides the current search |

Do not hold every mention of frogs, water or dinosaurs. References must be evaluated against context and intent. Equally, oblique wording such as `totally nothing behind that waterfall 👀` should not evade screening merely by avoiding a Moon name.

Pipeline: receive Twitch event → buffer → normalize and inspect metadata → classify with versioned context → enforce policy → deliver approved original text only. Unknown/malformed/timed-out decisions stay hidden. Screen author labels and reply quotes too. Recheck deletions and state revisions before delivery. Never send held text to the creator's browser, even in hidden HTML or debugging payloads.

Changing discovery state affects new messages. It does not automatically dump the existing held queue into the reader.

## 4. Creator and moderator workflow

Setup: connect Twitch; choose `Odyssey: Cap → Cascade`; select a fresh profile or confirm prior knowledge; choose `Discovery / No unsolicited advice`; authorize one moderator; add the safe dock to OBS. Ensure other creator-facing chat/TTS surfaces do not read the unscreened feed.

During play, viewers chat normally. The creator does not report progress. The moderator confirms relevant events and handles the review queue. Basic reactions are delivered automatically when classified safe; there is no per-message manual approval requirement.

The creator can explicitly request one **gentle hint for the current obstacle**, with an expiry and no exact solution. The moderator releases one suitable screened message; the grant closes after that release or expires. A rhetorical `what do I do?` does not silently disable protection. The moderator must also consider the cumulative information from hints, not only each message in isolation.

The creator's controls show confirmed discoveries and safe status only. The raw queue, full fact pack, future checklist and detailed explanations belong exclusively to the authorized moderator view.

## 5. Build sequence and proof

1. **Author and verify the pack:** fresh-save recording, IDs/aliases, conservative event bundles and concrete policy examples.
2. **Prove the reader boundary:** real Twitch ingestion, buffered messages, separate raw/safe channels and approved-only rendering.
3. **Implement the manual ledger and classifier:** start with representative paired examples, then add replies, obfuscation and indirect hints.
4. **Add moderator review and one-hint controls:** persist explicit events, support undo, enforce permissions and expiry.
5. **Measure:** roughly 300 independently labeled cases, including at least 40 same-text/different-context pairs; retain a held-out split. Compare keyword-only and generic no-spoiler prompts against the ledger-aware approach.
6. **Only then try Moon-title OCR:** retain it if it reduces moderator effort without misleading confirmations. Otherwise ship the manual baseline and report that limitation.

Report harmful-message containment, harmless-message delivery, benign known-reference delivery, end-to-end latency, review volume and moderator action time separately. Include failures and input rate. Do not describe proposed accuracy targets as achieved results.

Demonstrate four state transitions: an unknown capture fact is held; a fresh benign reference passes after confirmation; an instruction using the same known mechanic remains held; one explicit hint permission releases only its authorized hint. Include a real Twitch interaction and model-failure behavior. Use an informed operator for adversarial test messages so the demo does not spoil an unsuspecting player.

## 6. What makes this worth building

The hard part is preserving actual conversation while distinguishing familiarity from permission to help. Cap → Cascade is a controlled place to prove that behavior. It does not establish demand, whole-game support or hackathon victory. Generic progress-aware spoiler filtering already exists; the defensible work is the Twitch integration, explicit discovery/advice controls, dependable protected reader and measured reduction in unwanted guidance. See the [full scope](firstplay-end-to-end-scope.md) for precedent, architecture, authorization, retention and submission requirements.
