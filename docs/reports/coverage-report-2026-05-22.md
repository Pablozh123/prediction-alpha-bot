# Coverage Report - 2026-05-22

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-22.db`

## Summary

- Scan cycles: 137 (137 successful, 0 failed)
- Snapshots: 1036
- Unique tokens: 153
- Unique markets: 103
- Unique events: 9
- Latest snapshot: 2026-05-22T16:52:44.335Z
- Latest snapshot staleness ms: 2608
- Paper trades: 0
- Live trades rows: 0
- Dedupe skips: 0

## Warnings

- NO_RAW_OPPORTUNITIES_AFTER_60_CYCLES: scanner coverage may be too narrow.

## Scanner Runs

| Strategy | Runs | Raw | Validated | Rejected | Dedupe | Paper | Avg duration ms | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| neg_risk_bracket_arb | 137 | 0 | 0 | 0 | 0 | 0 | 109.2 | 0 |
| within_market_yes_no_arb | 137 | 0 | 0 | 0 | 0 | 0 | 99.12 | 0 |

## Snapshot Sides

| Side | Count |
| --- | ---: |
| NO | 703 |
| YES | 333 |

## Snapshot Sources

| Source | Count |
| --- | ---: |
| neg_risk_watch | 519 |
| within_market_watch | 517 |

## Opportunity Status

_None_

## Rejection Reasons

_None_

## Token Blocks

| Reason | Count |
| --- | ---: |
| orderbook_not_found | 76 |

## Within-Market Near Misses

| Market | YES Ask | NO Ask | Total Cost | Expected Edge | Distance to 0.98 | Status | Snapshot Delta ms |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| will-any-country-leave-nato-by-june-30-2026 | 0.01 | 0.991 | 1.001 | -0.001 | 0.021 | near_miss | 80 |
| will-the-next-uk-election-is-called-by-june-30-2026 | 0.043 | 0.958 | 1.001 | -0.001 | 0.021 | near_miss | 81 |
| gta-vi-released-before-june-2026 | 0.002 | 0.999 | 1.001 | -0.001 | 0.021 | near_miss | 82 |
| macron-out-by-june-30-2026-273 | 0.005 | 0.996 | 1.001 | -0.001 | 0.021 | near_miss | 82 |
| natoeu-troops-fighting-in-ukraine-in-june-30-2026 | 0.022 | 0.979 | 1.001 | -0.001 | 0.021 | near_miss | 83 |
| ukraine-recognizes-russian-sovereignty-over-its-territory-by-june-30-2026 | 0.014 | 0.987 | 1.001 | -0.001 | 0.021 | near_miss | 89 |
| microstrategy-sells-any-bitcoin-by-june-30-2026 | 0.46 | 0.541 | 1.001 | -0.001 | 0.021 | near_miss | 129 |
| starmer-out-by-may-31-2026 | 0.047 | 0.954 | 1.001 | -0.001 | 0.021 | near_miss | 857 |
| will-bitcoin-hit-1m-before-gta-vi-872-424 | 0.492 | 0.509 | 1.001 | -0.001 | 0.021 | near_miss | 2623 |
| will-harvey-weinstein-be-sentenced-to-less-than-5-years-in-prison | 0.046 | 0.955 | 1.001 | -0.001 | 0.021 | near_miss | 2809 |
| will-russia-invade-a-nato-country-by-june-30-2026 | 0.019 | 0.983 | 1.002 | -0.002 | 0.022 | near_miss | 77 |
| us-x-russia-military-clash-by-june-30-2026-249 | 0.015 | 0.988 | 1.003 | -0.003 | 0.023 | near_miss | 84 |
| will-harvey-weinstein-be-sentenced-to-more-than-30-years-in-prison | 0.044 | 0.959 | 1.003 | -0.003 | 0.023 | near_miss | 2811 |
| ukraine-election-held-by-june-30-2026-465-757 | 0.015 | 0.99 | 1.005 | -0.005 | 0.025 | near_miss | 81 |
| mike-johnson-out-as-speaker-by-june-30 | 0.03 | 0.975 | 1.005 | -0.005 | 0.025 | near_miss | 81 |
| will-russia-capture-kostyantynivka-by-may-31 | 0.02 | 0.986 | 1.006 | -0.006 | 0.026 | near_miss | 3000 |
| will-any-country-leave-nato-by-december-31-2026 | 0.075 | 0.932 | 1.007 | -0.007 | 0.027 | near_miss | 74 |
| trump-eliminates-capital-gains-tax-on-crypto-before-2027 | 0.066 | 0.941 | 1.007 | -0.007 | 0.027 | near_miss | 80 |
| microstrategy-sells-any-bitcoin-by-may-31-2026 | 0.1 | 0.91 | 1.01 | -0.01 | 0.03 | near_miss | 41 |
| microstrategy-sells-any-bitcoin-by-december-31-2026 | 0.8 | 0.21 | 1.01 | -0.01 | 0.03 | near_miss | 41 |

## NEG_RISK Basket Near Misses

| Event | Legs | Ask Sum | Payout | Gross Edge | Edge bps | Worst Leg Ask | Snapshot Delta ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| what-will-happen-before-gta-vi | 8 | 3.989 | 7 | 3.011 | 30110 | 0.52 | 592 |
| will-russia-capture-kostyantynivka-by | 4 | 2.536 | 3 | 0.464 | 4640 | 0.986 | 249 |
| microstrategy-sell-any-bitcoin-in-2025 | 3 | 1.661 | 2 | 0.339 | 3390 | 0.91 | 253 |
| starmer-out-in-2025 | 3 | 1.944 | 2 | 0.056 | 560 | 0.954 | 164 |
| 2026-nba-champion | 4 | 2.988 | 3 | 0.012 | 120 | 0.981 | 234 |
| 2026-nhl-stanley-cup-champion | 4 | 2.995 | 3 | 0.005 | 50 | 0.815 | 240 |
| 2026-fifa-world-cup-winner-595 | 39 | 38.01 | 38 | -0.01 | -100 | 0.999 | 5831 |
| harvey-weinstein-prison-time | 6 | 5.042 | 5 | -0.042 | -420 | 0.986 | 401 |
| hyperliquid-airdop-by | 3 | 2.14 | 2 | -0.14 | -1400 | 0.82 | 157 |

## Notes

- This report reads local snapshots only.
- Near misses are diagnostics, not execution instructions.
- Unresolved paper trades are not converted into PnL or win-rate claims.
- No secrets or environment values are printed.
