# Project Status

Date: 2026-08-07. Supersedes the 2026-05-19 version, which described a
scanner skeleton and has been wrong about the size and the open questions of
this repository since roughly the end of May.

## What this is

A paper-only TypeScript/Node scanner for prediction-market opportunities on
Polymarket and Kalshi, with the validation, journalling and reporting needed to
find out whether a reported opportunity was ever executable. Read-only market
data throughout.

225 tracked files: 64 source modules, 44 test files carrying 239 tests, and 89
dated report artifacts from live paper runs.

## What runs

The main loop (`npm run dev`) runs one cycle on an interval. Each cycle scans
three strategies in parallel through `runScanCycle`:

- `scanNegRiskCombinedArbs` - NEG_RISK bracket sums,
- `scanWithinMarketCombinedOpportunities` - YES+NO below one inside a market,
- `clearWinWatchScanner` - near-resolution watch candidates.

Alongside it the loop runs the orderbook snapshot cycle and the daily Telegram
digest, both off by default.

Everything else is an explicit CLI: cross-venue scanning and its local
dashboard, sports feed recording and resolution, neg-risk classification and
diagnostics, paper resolution, and the report generators. `npm run` lists all
35 of them; the README gives the ones worth running first.

## What the runs actually showed

From the 2026-06-02 strategy evaluation over a ten-day run - 3,163 scan cycles,
2026-05-19 to 2026-05-29:

| Strategy | raw found | validated | paper fired |
| --- | ---: | ---: | ---: |
| within_market_fast_arb | 2,354 | 0 | 0 |
| within_market_yes_no_arb | 1,554 | 0 | 0 |
| neg_risk_bracket_arb | 355 | 4 | 4 |
| clear_win_watch | 6 | 0 | 0 |

Raw candidates are abundant and executable candidates are not. The single
largest rejection reason across every strategy is `non_positive_executable_edge`
- 1,030 of 1,206 rejections - meaning the edge was present in the quoted prices
and gone once priced against the book that would have filled it. The largest
apparent edge in the whole run, 31,210 bps on an eight-leg basket, was rejected
for an unknown short-arb duration rather than taken.

The evaluator returns `NEEDS_FIX` for all four strategies and reports no PnL:
167 paper trades, 0 resolved, `insufficient resolved sample`. That is the
intended behaviour. A scanner that reports edges and never checks what happened
next is reporting its own inputs back to itself.

Cross-venue is a separate lane and so far a negative result. The 2026-06-10
scan read 1,000 Kalshi and 2,478 Polymarket binary markets and matched zero
pairs above threshold; the near misses are all `compound_kalshi_market`, where
a multi-outcome Kalshi market shares words with a single-outcome Polymarket
one. Those are the mismatches a naive title matcher would have reported as
arbitrage.

## Safety status

- `executeOrPaper` is the only execution path. It always returns `live: false`,
  with reason `paper_only` or `live_not_implemented`. No order client, no CLOB
  SDK import, no signing code, no private-key handling.
- The websocket ingestors take an auth-header provider from the caller. This
  repository never builds, stores or requests a venue credential.
- `.env`, the SQLite journals, `logs/`, `node_modules/`, `.tmp/`, `tmp/`,
  `.npmrc` and any `*.key` / `*.pem` are gitignored. Only `.env.example` with
  placeholders is committed.
- Paper PnL is never invented: `calculatePaperPnlOnlyIfResolutionKnown` returns
  nothing for an unresolved market, and unresolved rows keep `pnl=null`.
- CI installs, typechecks, tests and lints. It makes no external API calls.

## Known gaps

- **147 of 167 paper trades have no `opportunity_id` link.** The evaluator
  reports this itself as a data-quality warning. Until it is fixed, paper fires
  cannot be traced back to the candidate that caused them, which is exactly the
  join a resolved-PnL analysis needs.
- No resolved paper sample yet. `paperResolution` exists and settles markets
  that have resolved; the run above simply had none.
- The NEG_RISK bracket scanner still reads Gamma metadata rather than
  executable depth for its first pass, and marks those candidates
  `needs_orderbook_depth_check`. The depth check happens later in
  `cleanBasketFilter` and `orderbookSnapshotCycle`, so the flag is a stage
  marker, not an unfinished feature - but the two-stage split is worth knowing
  about before reading a raw scanner result.
- Cross-venue fee defaults are 0 cents for both venues in
  `config/crossVenuePairs.example.json`. Real fee curves have to be supplied
  before a cross-venue number means anything.
- Report artifacts embed absolute Windows paths from the machine that generated
  them.

## Final statement

Live trading is not implemented and no path in this repository can place an
order.
