# Arb taxonomy

Dated 2026-09-05. This is the definition every scanner strategy, the published
feed (`arb_scan/2`) and the website's Cross-venue page follow. The plan it
comes from, with the findings that motivated it, is
[ARB_DEFINITION_PLAN_2026-09-05.md](ARB_DEFINITION_PLAN_2026-09-05.md) (German).
The code that implements it: `src/core/taxonomy.ts`,
`src/core/rejectionReasons.ts`, `src/scanner/runScanCycle.ts`,
`src/scanner/crossVenueCycle.ts`, `src/publisher/arbScanPublisher.ts`.

Everything here is paper-only. No path in this repository can place an order.

## 1. The four axes

Every candidate is described on four axes. All four are journaled, published in
the feed and shown on the website with the same words; the feed's `vocabulary`
block carries every label, so the website types none of its own.

### 1.1 Class (payout structure)

| Class | Basket | Payout per basket share | Fixed by contract when | Main risk | Strategy id |
| --- | --- | --- | --- | --- | --- |
| `same_market_complement` | YES and NO of one contract on one venue | exactly 1.00 | always: one contract, one rulebook | the book is gone within seconds; the fee curve | `within_market_fast_arb`, `within_market_yes_no_arb` |
| `neg_risk_no_basket` | NO on all N legs of one mutually exclusive event | N minus the number of winners | the venue flags the event NEG_RISK, exactly one leg can win, the legs are exhaustive or carry an Other leg | multi-winner or nested-date legs, a missing Other leg, a UMA dispute | `neg_risk_bracket_arb` |
| `cross_venue_complement` | YES on venue A, NO on venue B, same question | 1.00 only when both rulebooks resolve identically, else 0 or 2 | the automated screen passed and a person found both rulebooks equivalent | rulebooks, two settlement dates, two collateral pools without netting, legging | `cross_venue_yes_no_arb` |
| `cross_venue_price_spread` | none: the same outcome quoted on two venues | none | never | not a chance; information about where the outcome is cheaper | `cross_venue_price_spread` |
| `neg_risk_long_tail_no_carry` | NO on legs priced at NO 0.97 or better | 1.00 per leg unless that leg wins | never (probabilistic) | a long-tail leg wins | not scanned (decision E3) |
| `clear_win_convergence` | YES or NO on a market whose outcome is known | 1.00 when reference fact and oracle agree | never (oracle risk) | the oracle resolves against the reference | `clear_win_watch` |

Rule: only a class with a "fixed by contract when" condition may be called
arbitrage, and only while the condition holds. Everything else is carry, watch
or information. Reserve classes, defined but not scanned: Kalshi ladder
monotonicity (playbook EDGES 4) and threshold against bracket (EDGES 14).

### 1.2 Capital lock (horizon)

`capital_lock_class` existed before; what changed is that it is a class, not a
rejection.

| Horizon | Time to resolution | Word on the website | Paper-fires | Return measure |
| --- | --- | --- | --- | --- |
| `short` | up to 72 h (`MAX_SHORT_ARB_DURATION_HOURS`) | ARB | yes | net bps at the executable size; annualised only for comparability, clamped at one day |
| `medium` | 72 h to 14 days | CARRY, short | no (decision E2) | annualised net return against the hurdle |
| `long` | over 14 days | CARRY, long | no | annualised net return against the hurdle; both settlement dates shown |
| `unknown` | no resolution time known | UNDATED | no | never a chance |

For a cross-venue pair the lock is the later of the two settlement dates, and
both dates are published (`resolution_at_by_venue`). Kalshi's date is its
`expected_expiration_time`, the settlement, not its `close_time`: the 2028
presidential markets stay open until November 2029 and settle at the
inauguration in January.

### 1.3 Rule status (equivalence of resolution)

Two fields instead of the single `rule_match` of the first schema.

`rule_screen`, automated, from titles, tickers and dates:

- `structural`: one contract, equivalence by construction (`same_market_complement` only)
- `passed`: nothing noticed; this is not verification
- `inverted`, `different_question`, `compound_market`, `resolution_time_mismatch`, `resolution_terms_mismatch`: rejected at gate 1, with a detail text

`rule_review`, a person, from the pair configuration (`config/crossVenuePairs.json`):

- `none`
- `pending`: a draft exists and no person has confirmed it; counts as none
- `equivalent`, with date, reviewer, note and the seven-point checklist
- `not_equivalent`, with date, reviewer and the reason

A NEG_RISK basket gets `passed` when the venue flag and the text screen agree;
`structural` is reserved for the one-contract case. Nothing is `reviewed`
automatically. The word "hedged" is allowed for `structural` and for
`equivalent`; the person's verdict outranks the screen in both directions,
because the screen reads titles and dates and the review read the rulebooks.
The first schema's `rule_match` is derived: `structural` or `equivalent` give
`reviewed`, `not_equivalent` or a failed screen give `mismatch`, everything
else `unverified`.

### 1.4 Executability

| Field | Definition |
| --- | --- |
| `executable_size_shares` | the thinner book decides: the size the target capital (`PAPER_TARGET_SIZE_USD`) buys, capped where the walked net edge turns negative |
| `depth_limited` | the book, not the target, set the size |
| `role` per leg | taker or maker; default taker (`EXECUTION_ROLE_MODE`) |
| `open_seconds` | how long the net edge has stood open across cycles |
| two collateral pools | a cross-venue basket funds both legs in full; there is no netting between venues |

A cross-venue gap that closes faster than the REST round trip of both venues
is not reachable for a taker. For carry pairs (hours) this is irrelevant, for
a genuine short cross-venue arb it is the main question.

## 2. Gates, in the order that decides the reason

A rejection names the most fundamental gate it fails, never the first one an
arbitrary code order hits. Every rejected row carries `gate_failed`; every
reason in `src/core/rejectionReasons.ts` belongs to exactly one gate.

1. **Identity and structure.** Class; payoff structure (NEG_RISK: venue flag,
   winner count, exhaustiveness, text screen); rule screen (cross-venue);
   a person's `not_equivalent` review. A row that fails here carries no
   gross, net or annualised figure: the payout those figures assume does
   not exist. No book is fetched for it.
2. **Executability.** Every leg fillable, size against depth, spread cap,
   fill price present.
3. **Economics.** Gross edge at the executable size, fees per leg and role,
   net edge, net profit in dollars at that size, the clean-basket floors.
4. **Horizon.** `capital_lock_class`; unknown rejects; annualised net return
   below `MIN_ANNUALIZED_NET_PCT` rejects (`below_annualized_hurdle`);
   otherwise `short` fires and `medium`/`long` become `candidate`.
5. **Flow control.** Dedupe and cooldown; paper-fire only for `short`.

The 2026-09-05 feed had a nine-leg "advance to the runoff" basket ranked first
with a net edge of 1,445 bps and 185 percent a year: two legs were near-certain
winners, the runoff has two participants, the basket pays 7 instead of the
assumed 8, and the real edge is near zero. The classifier would have caught the
word "advance"; the horizon gate ran first and labelled it "too long". This
order exists so that cannot happen again.

## 3. When a row is a chance

All four must hold:

- **Structure:** `rule_screen` in (`structural`, `passed`) and `rule_review`
  not `not_equivalent`; for cross-venue additionally `rule_review = equivalent`,
  otherwise it is a candidate.
- **Executable:** `executable_size_shares > 0` and capital at that size at
  least `MIN_EXECUTABLE_DEPTH_USD`.
- **Net positive:** `executable_net_edge_bps` at least the class floor
  (`CLEAN_BASKET_MIN_EDGE_BPS` for NEG_RISK, `CROSS_VENUE_MIN_NET_CENTS`
  for cross-venue, above zero for one contract).
- **Hurdle:** `annualized_net_pct` at least `MIN_ANNUALIZED_NET_PCT`.

The hurdle is configuration, published in the feed's `config` block. Its
starting value was ten percent a year (decision E1): the market itself prices
locked collateral in near-certain contracts at roughly three to seven percent a
year, and below that a gap is a funding premium, not an edge. Since 2026-09-05
the default is five percent, so the carry band between the funding premium and
ten percent stays visible during the measurement window; a candidate between
five and ten percent a year sits inside that premium and is shown as carry
with resolution risk, never as arbitrage.

Ranking inside a class is by net profit in dollars at the executable size
(`net_profit_usd`), filtered by the hurdle, never by the percentage alone:
185 percent a year on 17 dollars is 34 dollars a year.

`raw` means a gross edge at the quote or, for the watch band above one dollar,
at the book. The watch band itself is counted as `near_miss` and is not
journaled.

Statuses in the journal and the feed: `validated` (a chance; `paper_fired`
once the paper trade is written), `candidate` (carry, or cross-venue without
an equivalent review), `rejected`.

## 4. The cross-venue pair protocol

Four stages, each with its own field, none skippable.

1. **Automated screen.** `config/pair_screen_cases.json` is the shared
   specification; `src/scanner/crossVenueQuestionMatch.ts` here and
   `app/cross_pairs.py` in the website repo both pass every case in their test
   suites. Verdicts: `passed`, `inverted`, `different_question`,
   `compound_market`, `resolution_time_mismatch`. Resolution dates more than
   seven days apart fail (decision E6): the September and the December Fed
   meeting share every word but the month.
2. **Rulebooks side by side.** The website's `src/resolution_rules.py`
   fetches both texts and marks what to read first: `ambiguity`, `source`,
   `deadline`, `partial`, `early_resolution`, `other_outcome`, `replacement`,
   and the gap between the two settlement dates. The scanner carries
   excerpts of both texts per pair into the feed's `pairs` block.
3. **A person's review.** Seven questions, yes or no each, a note on every
   no: same fact; same condition (wins against inaugurated); compatible
   source; same deadline and what happens on delay; same handling of
   ambiguity; same handling of Other and partial payout; both dates and who
   settles later. The verdict, date, reviewer, checklist and note live in
   `config/crossVenuePairs.json` under `review`. A `pending` draft counts as
   no review. The legacy `verified: true` flag came from the discovery review,
   which reads titles, and is loaded as `pending`.
4. **Economics with status.** Net and annualised are computed for every pair
   that reached the books, as information. "Hedged" and "chance" exist only
   with `equivalent`. Capital is both legs in full; the lock is the later
   settlement; the lane never paper-fires.

State on 2026-09-05: Trump 2028 and Rubio 2028 are `not_equivalent` (Kalshi
pays on the inauguration, Polymarket on the election call by AP, Fox and NBC;
study of 2026-07-31). Somaliland, Le Pen 2027 and Pritzker 2028 carry drafted
checklists as `pending`. The Eurovision Sofia pair is retired.

Decision E5, 2026-09-05: the operator can trade on Kalshi. A pair a person
found equivalent is therefore a chance like any other basket: inside the
short window it paper-fires both legs, the Kalshi leg journaled under the
slug `kalshi:<ticker>` and settled against Kalshi's market result, the
Polymarket leg under its slug and CLOB token; beyond the short window it is a
carry candidate. Without an equivalent review nothing fires, whatever the
numbers say.

## 5. What the feed publishes

Schema `arb_scan/2` is a superset of `arb_scan/1`. New blocks: `vocabulary`,
`config` (hurdle, target size, floors, short window, fee schedule),
`chances`, `carry_candidates`, `rejected_examples` (up to five rows per
reason, with the gate), `pairs` (the pair board with both rule excerpts and
the review). New per-row fields: `class`, `capital_lock_class`,
`rule_screen`, `rule_review`, `gate_failed`, `net_profit_usd`,
`resolution_at_by_venue`, `hurdle_met`. The summary adds `near_miss_24h` and
`candidates_24h`; `health.scan_interval_ms` is the cadence the scanner keeps
(the median gap between cycle starts), with the configured value next to it.

Never in the feed as a chance: a row with a negative net edge; a row that
failed gate 1 with any return figure; a REVIEWED word without a person.

`npm run feed:fixture -- --out <path>` writes the website's test fixture from
a seeded journal through the real publisher, so the fixture's vocabulary is the
scanner's.

## 6. Decisions recorded

| Id | Decision | Value |
| --- | --- | --- |
| E1 | hurdle rate | `MIN_ANNUALIZED_NET_PCT=5` since 2026-09-05 (started at 10), published in the feed |
| E2 | paper-fire for `medium` | no during the 14-day measurement window; revisit after |
| E3 | `neg_risk_long_tail_no_carry` | in the taxonomy, not in the scanner |
| E4 | owner of the automated screen | specification in this repo, both implementations pass it, no runtime dependency between repos |
| E5 | Kalshi access for the operator | yes (2026-09-05); an equivalent pair paper-fires inside the short window and is carry beyond it |
| E6 | resolution date tolerance | 7 days |

## 7. Measurement

Pre-registered before the gate order went live, evaluated 14 days after the
`arb_scan/2` feed went live:

| Class | Primary metric | Success | Failure |
| --- | --- | --- | --- |
| `same_market_complement`, short | resolved, candidate-linked paper trades; net PnL; Wilson lower bound of the hit rate | as pre-registered 2026-09-04 | as pre-registered |
| `neg_risk_no_basket`, short | the same, plus the share of gate-1 rejections among all rejections | the multi-winner slugs that used to fail on horizon now fail on structure | horizon stays the top reason and structure catches nothing |
| carry, medium and long | annualised net edge at first sight against the edge at resolution (forward replay); share above the hurdle | at least one candidate above the hurdle whose edge holds to resolution | none above the hurdle, or the edges vanish before resolution |
| cross-venue pairs | count of `equivalent` after review; count of `not_equivalent` with reason | at least one `equivalent` pair with a documented checklist | every reviewed pair `not_equivalent`; then that is the finding and the website says so |
| screen consistency | cases in `pair_screen_cases.json` passing in both repos | all | any deviation is a bug |
