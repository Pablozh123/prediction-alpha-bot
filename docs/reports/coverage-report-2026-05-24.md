# Coverage Report - 2026-05-24

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-23.db`

## Summary

- Scan cycles: 6 (6 successful, 0 failed)
- Snapshots: 728
- Unique tokens: 170
- Unique markets: 124
- Unique events: 7
- Latest snapshot: 2026-05-23T15:48:37.447Z
- Latest snapshot staleness ms: 97429816
- Paper trades: 18
- Live trades rows: 0
- Dedupe skips: 16

## Warnings

- None

## Scanner Runs

| Strategy | Runs | Raw | Validated | Rejected | Dedupe | Paper | Avg duration ms | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| neg_risk_bracket_arb | 6 | 20 | 4 | 0 | 16 | 18 | 137.17 | 0 |
| within_market_yes_no_arb | 6 | 3108 | 0 | 300 | 0 | 0 | 113.17 | 0 |

## Snapshot Sides

| Side | Count |
| --- | ---: |
| NO | 386 |
| YES | 332 |
| unknown | 10 |

## Snapshot Sources

| Source | Count |
| --- | ---: |
| within_market_yes_no_arb | 600 |
| neg_risk_watch | 50 |
| within_market_watch | 50 |
| neg_risk_bracket_arb | 18 |
| recent_opportunity | 10 |

## Opportunity Status

| Status | Count |
| --- | ---: |
| rejected | 300 |
| paper_fired | 4 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 300 |

## Token Blocks

| Reason | Count |
| --- | ---: |
| orderbook_not_found | 50 |

## Within-Market Near Misses

| Market | YES Ask | NO Ask | Total Cost | Expected Edge | Distance to 0.98 | Status | Snapshot Delta ms |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| gta-vi-released-before-june-2026 | 0.002 | 0.999 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| james-collier-announced-as-next-james-bond | 0.002 | 0.999 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| jeffrey-epstein-foul-play-confirmed-by-december-31-2026 | 0.072 | 0.929 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| macron-out-by-june-30-2026-273 | 0.005 | 0.996 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| microstrategy-sells-any-bitcoin-by-june-30-2026 | 0.462 | 0.539 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| natoeu-troops-fighting-in-ukraine-in-june-30-2026 | 0.021 | 0.98 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| netanyahu-out-by-june-30-383-244-575 | 0.027 | 0.974 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| netanyahu-out-by-may-31 | 0.005 | 0.996 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| pierce-brosnan-announced-as-next-james-bond-557 | 0.002 | 0.999 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| placeholder-6-announced-as-next-james-bond-114 | 0.002 | 0.999 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| starmer-out-by-may-31-2026 | 0.042 | 0.959 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| will-bitcoin-hit-1m-before-gta-vi-872-424 | 0.492 | 0.509 | 1.001 | -0.001 | 0.021 | near_miss | 0 |
| natoeu-troops-fighting-in-ukraine-in-june-30-2026 | 0.021 | 0.98 | 1.001 | -0.001 | 0.021 | near_miss | 389 |
| gta-vi-released-before-june-2026 | 0.002 | 0.999 | 1.001 | -0.001 | 0.021 | near_miss | 407 |
| macron-out-by-june-30-2026-273 | 0.005 | 0.996 | 1.001 | -0.001 | 0.021 | near_miss | 489 |
| will-bitcoin-hit-1m-before-gta-vi-872-424 | 0.492 | 0.509 | 1.001 | -0.001 | 0.021 | near_miss | 9579 |
| starmer-out-by-may-31-2026 | 0.042 | 0.959 | 1.001 | -0.001 | 0.021 | near_miss | 22557 |
| microstrategy-sells-any-bitcoin-by-june-30-2026 | 0.462 | 0.539 | 1.001 | -0.001 | 0.021 | near_miss | 29305 |
| 2026-balance-of-power-d-senate-r-house-692 | 0.022 | 0.98 | 1.002 | -0.002 | 0.022 | near_miss | 0 |
| 2026-balance-of-power-other-131 | 0.01 | 0.992 | 1.002 | -0.002 | 0.022 | near_miss | 0 |

## NEG_RISK Basket Near Misses

| Event | Legs | Ask Sum | Payout | Gross Edge | Edge bps | Worst Leg Ask | Snapshot Delta ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| what-will-happen-before-gta-vi | 8 | 3.909 | 7 | 3.091 | 30910 | 0.52 | 0 |
| will-russia-capture-kostyantynivka-by | 4 | 2.506 | 3 | 0.494 | 4940 | 0.992 | 0 |
| microstrategy-sell-any-bitcoin-in-2025 | 3 | 1.629 | 2 | 0.371 | 3710 | 0.89 | 0 |
| starmer-out-in-2025 | 3 | 1.959 | 2 | 0.041 | 410 | 0.959 | 0 |
| 2026-nhl-stanley-cup-champion | 4 | 3 | 3 | 0 | 0 | 0.82 | 1159 |
| 2026-fifa-world-cup-winner-595 | 21 | 20.12 | 20 | -0.12 | -1200 | 0.999 | 10074 |
| hyperliquid-airdop-by | 3 | 2.13 | 2 | -0.13 | -1300 | 0.82 | 784 |

## Notes

- This report reads local snapshots only.
- Near misses are diagnostics, not execution instructions.
- Unresolved paper trades are not converted into PnL or win-rate claims.
- No secrets or environment values are printed.
