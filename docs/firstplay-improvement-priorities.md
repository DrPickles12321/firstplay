# FirstPlay improvement review

October 30, 2026. Priorities below are engineering judgments based on the implemented application and its measured checks.

## Improvements implemented in this pass

| Problem | Change | Limit |
|---|---|---|
| Repeated reactions or spam consume the same model work repeatedly | Identical messages in a batch share an interpretation; exact repeats can reuse successful interpretations for thirty seconds | Full supplied reference context, state, model, rules, objective and replies must match. No fuzzy matching. Every original message still passes policy and gets its own receipt |
| A connected Twitch badge can conceal a slow or failed classifier | Reader notices distinguish checking, delayed screening and failed checks | Notices reveal no held text. They describe service state, not guaranteed spoiler protection |
| Rejected messages disappear from the moderator interface, making errors hard to inspect | Moderator-only recent-decision history shows original text, status and short reasons | It is a spoiler-bearing interface and must stay off the creator's reading screen |
| Model-only latency hides time spent waiting in the queue | Recent decisions include receipt-to-first-decision p95 and sample count | This excludes Twitch transit and browser rendering. Only the last one hundred decisions are measured |

These changes follow the broad principle of reducing unnecessary model requests in the [official OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization). Reuse here is application-level interpretation reuse, separate from provider-side prompt caching. The subprocess still uses the documented [non-interactive Codex interface](https://learn.chatgpt.com/docs/non-interactive-mode).

The implementation retains no reusable uncertain results or provider failures. The memory-only cache is bounded to 256 entries. Discovery/rule/session changes invalidate reuse; exact state and prompt/schema versions are also part of the key. An old approval never copies its original renderer acknowledgement onto another message.

## Measured result

Run `npm run benchmark` to repeat the local synthetic check. It does not connect or post to Twitch.

| Phase | Model messages | Model requests | Processing time |
|---|---:|---:|---:|
| Eight messages without reuse | 8 | 1 | 9.227 s |
| Eight messages, two unique bodies, duplicates combined | 2 | 1 | 6.230 s |
| Exact repeat under unchanged state | 0 | 0 | 4 ms |
| Same bodies after a rule change | 2 | 1 | 5.796 s |

This single deliberately repetitive workload retained the same four allows/four rejections in every phase. It is not a representative-traffic benchmark or independent accuracy test. New wording, changed context, expired entries and uncertain messages still require fresh inference. Live buffering and browser polling add delay. There is no basis for claiming that all Twitch messages now arrive in milliseconds.

## Highest-value next work

1. **Validate the discovery ledger against actual gameplay.** An incorrect “already discovered” fact can authorize later spoilers, even when message interpretation is correct. Gather owned/permissioned recordings and mark event timestamps. Include uncaptured frogs, capture transitions, menus, replayed footage, obstructed banners and actual captures. Measure false confirmations and missed discoveries by event on separate recordings. Keep automatic confirmation off until that evidence supports it. No such recording has been supplied.
2. **Establish human-reviewed language evaluation.** Current draft labels are synthetic and unapproved. Review a representative mixture of reactions, known-event recaps, subtle hints, leading questions, sarcasm, multilingual messages and instruction attacks. Keep paraphrases of the same example together when splitting development and held-out cases. Report spoiler leakage, harmless-message loss, review messages/minute and decision latency separately. This aligns with [official evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices), which recommends representative cases, adversarial cases and human calibration.
3. **Measure unseen-message speed and real load.** Compare the existing Codex route with another supported inference route on the same reviewed cases, including bursts and usage-limit failures. The optional API adapter is already implemented, but no API key is configured. Choose on measured latency and harmful-message misses; a faster model alone is not evidence of equivalent protection. Repeated-message reuse cannot solve a high volume of distinct messages.
4. **Verify the remote viewer experience.** Exercise a real viewer's Twitch identity, own-message isolation and reader acknowledgement through the separate HTTPS viewer gateway. The gateway implementation is tested locally but has no public endpoint. Native Twitch badges still require an extension or platform integration; the current separate status panel is the user's chosen scope.

The next substantial product milestone should be a recording-backed Cap → Cascade session with representative chat and measured moderator workload. That would test whether FirstPlay preserves interaction while reducing spoilers in use. More Moon names alone would not establish that outcome.
