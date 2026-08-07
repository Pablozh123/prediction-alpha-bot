# Detailed Paper Run Report - 2026-05-21

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

Report basis:
- `npm run db:inspect`
- `npm run paper:report`
- `npm run forward:replay`
- `npm run strategy:evaluate`
- Direct read-only SQLite aggregation

## Executive Summary

The 24h paper-only run completed cleanly. The bot stopped by design after
`MAX_SCAN_CYCLES=2880`; the last log line is `shutdown complete`.

No live trading occurred.

Key results:
- Scan cycles since restart: `2880`
- Failed scan cycles: `0`
- Live trades since restart: `0`
- Raw opportunities since restart: `20`
- Validated/paper-fired opportunities since restart: `1`
- Rejected opportunities since restart: `19`
- New linked paper trades since restart: `6`
- Orderbook snapshots since restart: `13,828`
- Snapshot coverage since restart: `56` tokens across `44` markets

The system is now useful as a data collector and paper-validation harness. It is
not yet ready for stronger strategy conclusions, because only one validated
basket fired and the broader edge quality is still weak.

## Run Status

The run started at `2026-05-20T16:02:37.741Z`.

Last recorded scan cycle:
- Timestamp: `2026-05-21T16:02:10.579Z`
- Success: `true`
- Opportunities: `0`
- Paper trades: `0`
- Rejected opportunities: `0`

The health endpoint is currently unavailable because the run completed and the
bot process exited cleanly. This is expected for this controlled 24h run.

## Safety Status

Safety result:
- Live trades: `0`
- Live trading imports: not used in run path
- Private keys: not used
- Real orders: not possible from current execution path
- Paper execution boundary: `executeOrPaper`

The database still contains a `live_trades` table for future reconciliation
schema shape, but no live execution code wrote to it.

## Database Snapshot

Current database totals:

| Metric | Count |
| --- | ---: |
| paper_trades | 153 |
| live_trades | 0 |
| opportunities | 325 |
| opportunity_legs | 6 |
| orderbook_snapshots | 14,116 |
| scanner_runs | 6,300 |
| orderbook_token_blocks | 20 |
| active_orderbook_token_blocks | 0 |

Opportunity statuses:

| Status | Count |
| --- | ---: |
| paper_fired | 1 |
| rejected | 324 |

Important caveat:
- `147` paper trades are legacy/unlinked and must not be used for strategy
  graduation, win rate, or PnL claims.
- Only `6` paper trades are linked to a validated opportunity.

## Scanner Funnel Since Restart

| Strategy | Runs | Raw | Validated | Rejected | Paper Trades | Avg Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| neg_risk_bracket_arb | 2880 | 20 | 1 | 19 | 6 | 97 ms |
| within_market_yes_no_arb | 2880 | 0 | 0 | 0 | 0 | 87 ms |

Interpretation:
- `neg_risk_bracket_arb` found one executable basket and correctly deduped the
  repeated detections.
- `within_market_yes_no_arb` produced zero raw candidates. That scanner is not
  yet producing useful measurements.

## Validated Paper Fire

One validated NEG_RISK basket fired:

| Field | Value |
| --- | --- |
| Strategy | `neg_risk_bracket_arb` |
| Event | `harvey-weinstein-prison-time` |
| Raw edge | `0.002` |
| Executable edge | `0.008` |
| Fee-adjusted edge | `0.008` |
| Executable sum | `4.992` |
| Leg count | `6` |
| Fillable USD | `665.34` |
| Min leg depth USD | `110.89` |
| Paper trades | `6` |

Leg details:

| Leg | Side | Avg Fill | Best Bid | Best Ask | Max Fillable USD | Spread |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| no-prison-time | NO | 0.218 | 0.210 | 0.218 | 22,351.97 | 0.008 |
| less-than-5-years | NO | 0.958 | 0.955 | 0.958 | 10,168.15 | 0.003 |
| 5-to-10-years | NO | 0.955 | 0.941 | 0.955 | 14,094.87 | 0.014 |
| 10-to-20-years | NO | 0.951 | 0.946 | 0.951 | 16,123.53 | 0.005 |
| 20-to-30-years | NO | 0.911 | 0.909 | 0.911 | 13,825.98 | 0.002 |
| more-than-30-years | NO | 0.999 | 0.990 | 0.999 | 110.89 | 0.009 |

The bottleneck leg was `more-than-30-years`, with only `$110.89` available at
the target walk depth.

## Rejections

Rejections since restart:

| Reason | Count |
| --- | ---: |
| duplicate_within_cooldown | 19 |

Total historical rejections:

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 305 |
| duplicate_within_cooldown | 19 |

Interpretation:
- The new pipeline did not spam repeated paper trades.
- The dedupe logic worked: after the first Harvey Weinstein paper-fire, repeated
  detections were rejected as cooldown duplicates.
- Most historical rejected opportunities were rejected because executable edge
  was negative after orderbook validation.

## Forward Replay

Forward replay totals:

| Metric | Value |
| --- | ---: |
| Snapshots | 14,116 |
| Unique tokens | 56 |
| Unique markets | 44 |
| Collection window | 1,516.75 minutes |
| Tokens fillable at target size | 56 |
| Positive latest mark-to-bid tokens | 12 |
| Negative latest mark-to-bid tokens | 40 |
| Positive best mark-to-bid tokens | 20 |
| Average latest mark-to-bid move | -170.67 bps |
| Average best mark-to-bid move | -15.49 bps |

Top single-token forward replay windows:

| Market | Latest Move | Best Move | Notes |
| --- | ---: | ---: | --- |
| microstrategy-sells-any-bitcoin-by-june-30-2026 | +1290 bps | +2030 bps | Large directional quote movement |
| colorado-avalanche-2026-stanley-cup | +910 bps | +1020 bps | Directional sports market move |
| okc-thunder-2026-nba-finals | -100 bps | +500 bps | Positive window, negative latest |
| harvey-weinstein 5-to-10-years NO leg | +300 bps | +470 bps | Part of fired basket |
| microstrategy-sells-any-bitcoin-by-may-31-2026 | +300 bps | +400 bps | Directional movement |

Important interpretation:
- This is not realized PnL.
- This is quote replay from stored orderbook snapshots.
- Single-token movement is useful for discovery, but arbitrage evaluation needs
  basket-level replay, not just per-token movement.

## Strategy Verdict

`npm run strategy:evaluate` produced:

| Strategy | Verdict |
| --- | --- |
| neg_risk_bracket_arb | NEEDS_FIX |

Reasonable reading:
- The infrastructure is working.
- The strategy is not yet proven.
- The current metrics are dominated by historical negative executable-edge
  rejections and one successful paper basket.
- `NEEDS_FIX` should be interpreted as "improve measurement and scanner logic",
  not "delete the strategy".

## Main Problems Found

1. Within-market scanner is not producing candidates

The scanner ran 2880 times and produced zero raw opportunities. That can mean:
- true market conditions were never present, or
- Gamma parsing/discovery is too narrow, or
- using Gamma outcome prices is the wrong source for this scanner and it should
  discover binary markets first, then validate using orderbook asks directly.

2. Dedupe rejections distort strategy quality

`duplicate_within_cooldown` is operationally correct, but it should not count as
a bad strategy signal. It should be split into a separate status or report
bucket.

3. Single-token forward replay is not enough

The forward replay identifies market movement, but arbitrage needs basket-level
math:
- entry basket cost
- later bid-side basket mark
- worst leg depth
- whether all legs remain fillable

4. Legacy paper trades still pollute totals

`147` legacy paper trades remain useful as history, but should be excluded by
default in serious strategy evaluation.

5. Resolution/PnL remains intentionally absent

No PnL should be inferred until market resolution is read from reliable ground
truth.

## Recommended Next Steps

### 1. Build basket-level forward replay

Priority: high.

Add a report that groups snapshots by opportunity/event and replays the whole
basket:
- for NEG_RISK: all NO legs together
- compute basket entry cost
- compute latest bid-side basket mark
- compute best observed bid-side basket mark
- compute min leg depth over time
- report whether the whole basket stayed fillable

This is the report that will tell us whether the Harvey Weinstein paper basket
was structurally interesting or just one momentary quote artifact.

### 2. Separate dedupe from rejection quality

Priority: high.

Current:
- duplicate detections are stored as `status='rejected'`

Better:
- keep strategy rejections for real validation failures
- report duplicates as `dedupe_skipped`

This will make strategy evaluation less misleading.

### 3. Fix within-market scanner discovery

Priority: medium-high.

Change the scanner flow:
1. discover active binary markets from Gamma
2. get YES and NO token IDs
3. fetch both orderbooks
4. compute `askYes + askNo`
5. only then create a validated opportunity

Do not rely on Gamma `outcomePrices` for executable within-market arb.

### 4. Add Telegram threshold alerts

Priority: medium.

Send Telegram only when:
- basket executable edge > configured threshold
- basket forward replay best move > threshold
- scanner fails repeatedly
- snapshot count drops below expectation

This avoids noisy messages and focuses on actionable events.

### 5. Keep NEG_RISK in paper-only observation

Priority: medium.

Do not scale position sizes or add live trading. Continue collecting:
- executable edge
- basket depth
- basket replay movement
- resolution outcomes later

The one fired basket is useful, but not enough for a strategy verdict.

### 6. Implement read-only resolution tracking

Priority: medium.

When markets resolve:
- update `resolved`
- record resolution source
- compute paper PnL only from ground truth
- keep unresolved trades out of win-rate metrics

### 7. Run the next controlled data collection

Recommended command pattern:

```bash
set PAPER_ONLY=true
set RUN_ONCE=false
set MAX_SCAN_CYCLES=2880
set SCAN_INTERVAL_MS=30000
set ORDERBOOK_SNAPSHOT_ENABLED=true
set ORDERBOOK_SNAPSHOT_INTERVAL_MS=300000
set ORDERBOOK_SNAPSHOT_TOKEN_LIMIT=48
set ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT=100
set ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET=8
set TELEGRAM_DAILY_REPORT_ENABLED=true
npm run dev
```

For a longer background run, use the existing hidden-process launcher pattern
instead of keeping a terminal open.

## Bottom Line

The project is now past "skeleton" and has a working paper-only measurement
loop:
- Scanner runs reliably
- Orderbook snapshots are broad enough to be useful
- Dedupe prevents paper-trade spam
- Telegram reporting works
- No live trading occurred

The next engineering step is not a new strategy. The next step is basket-level
replay and cleaner evaluation semantics. That will turn the collected data from
"interesting telemetry" into a decision-quality strategy report.
