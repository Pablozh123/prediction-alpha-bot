# Coverage Report - 2026-05-23

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-22.db`

## Summary

- Scan cycles: 2757 (2757 successful, 0 failed)
- Snapshots: 42953
- Unique tokens: 181
- Unique markets: 128
- Unique events: 11
- Latest snapshot: 2026-05-23T14:42:45.188Z
- Latest snapshot staleness ms: 17406
- Paper trades: 0
- Live trades rows: 0
- Dedupe skips: 0

## Warnings

- NO_RAW_OPPORTUNITIES_AFTER_60_CYCLES: scanner coverage may be too narrow.

## Scanner Runs

| Strategy | Runs | Raw | Validated | Rejected | Dedupe | Paper | Avg duration ms | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| neg_risk_bracket_arb | 2757 | 0 | 0 | 0 | 0 | 0 | 216.14 | 0 |
| within_market_yes_no_arb | 2757 | 0 | 0 | 0 | 0 | 0 | 208.19 | 0 |

## Snapshot Sides

| Side | Count |
| --- | ---: |
| NO | 29744 |
| YES | 13209 |

## Snapshot Sources

| Source | Count |
| --- | ---: |
| neg_risk_watch | 21478 |
| within_market_watch | 21223 |
| gamma_active_market | 252 |

## Opportunity Status

_None_

## Rejection Reasons

_None_

## Token Blocks

| Reason | Count |
| --- | ---: |
| orderbook_not_found | 79 |

## Within-Market Near Misses

| Market | YES Ask | NO Ask | Total Cost | Expected Edge | Distance to 0.98 | Status | Snapshot Delta ms |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| microstrategy-sells-any-bitcoin-by-june-30-2026 | 0.463 | 0.538 | 1.001 | -0.001 | 0.021 | near_miss | 45 |
| will-harvey-weinstein-be-sentenced-to-between-10-and-20-years-in-prison | 0.05 | 0.951 | 1.001 | -0.001 | 0.021 | near_miss | 86 |
| will-harvey-weinstein-be-sentenced-to-less-than-5-years-in-prison | 0.03 | 0.971 | 1.001 | -0.001 | 0.021 | near_miss | 89 |
| gta-vi-released-before-june-2026 | 0.002 | 0.999 | 1.001 | -0.001 | 0.021 | near_miss | 100 |
| natoeu-troops-fighting-in-ukraine-in-june-30-2026 | 0.021 | 0.98 | 1.001 | -0.001 | 0.021 | near_miss | 102 |
| macron-out-by-june-30-2026-273 | 0.005 | 0.996 | 1.001 | -0.001 | 0.021 | near_miss | 111 |
| starmer-out-by-may-31-2026 | 0.041 | 0.96 | 1.001 | -0.001 | 0.021 | near_miss | 1058 |
| will-bitcoin-hit-1m-before-gta-vi-872-424 | 0.492 | 0.509 | 1.001 | -0.001 | 0.021 | near_miss | 3288 |
| will-harvey-weinstein-be-sentenced-to-between-20-and-30-years-in-prison | 0.1 | 0.903 | 1.003 | -0.003 | 0.023 | near_miss | 88 |
| us-x-russia-military-clash-by-june-30-2026-249 | 0.015 | 0.988 | 1.003 | -0.003 | 0.023 | near_miss | 115 |
| mike-johnson-out-as-speaker-by-june-30 | 0.03 | 0.973 | 1.003 | -0.003 | 0.023 | near_miss | 115 |
| will-harvey-weinstein-be-sentenced-to-more-than-30-years-in-prison | 0.01 | 0.994 | 1.004 | -0.004 | 0.024 | near_miss | 47 |
| will-russia-invade-a-nato-country-by-june-30-2026 | 0.022 | 0.982 | 1.004 | -0.004 | 0.024 | near_miss | 78 |
| ukraine-recognizes-russian-sovereignty-over-its-territory-by-june-30-2026 | 0.014 | 0.99 | 1.004 | -0.004 | 0.024 | near_miss | 93 |
| will-any-country-leave-nato-by-june-30-2026 | 0.014 | 0.99 | 1.004 | -0.004 | 0.024 | near_miss | 96 |
| ukraine-election-held-by-june-30-2026-465-757 | 0.016 | 0.99 | 1.006 | -0.006 | 0.026 | near_miss | 100 |
| will-the-next-uk-election-is-called-by-june-30-2026 | 0.048 | 0.958 | 1.006 | -0.006 | 0.026 | near_miss | 106 |
| will-russia-capture-kostyantynivka-by-june-30-382-954-769 | 0.241 | 0.765 | 1.006 | -0.006 | 0.026 | near_miss | 4640 |
| will-any-country-leave-nato-by-december-31-2026 | 0.075 | 0.932 | 1.007 | -0.007 | 0.027 | near_miss | 97 |
| trump-eliminates-capital-gains-tax-on-crypto-before-2027 | 0.067 | 0.941 | 1.008 | -0.008 | 0.028 | near_miss | 83 |

## NEG_RISK Basket Near Misses

| Event | Legs | Ask Sum | Payout | Gross Edge | Edge bps | Worst Leg Ask | Snapshot Delta ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| what-will-happen-before-gta-vi | 8 | 3.899 | 7 | 3.101 | 31010 | 0.52 | 714 |
| will-russia-capture-kostyantynivka-by | 4 | 2.503 | 3 | 0.497 | 4970 | 0.988 | 301 |
| microstrategy-sell-any-bitcoin-in-2025 | 3 | 1.618 | 2 | 0.382 | 3820 | 0.87 | 185 |
| starmer-out-in-2025 | 3 | 1.96 | 2 | 0.04 | 400 | 0.96 | 197 |
| 2026-nhl-stanley-cup-champion | 4 | 2.997 | 3 | 0.003 | 30 | 0.819 | 287 |
| 2026-nba-champion | 4 | 3.007 | 3 | -0.007 | -70 | 0.979 | 251 |
| harvey-weinstein-prison-time | 6 | 5.065 | 5 | -0.065 | -650 | 0.986 | 417 |
| hyperliquid-airdop-by | 3 | 2.13 | 2 | -0.13 | -1300 | 0.82 | 185 |
| republican-presidential-nominee-2028 | 7 | 6.363 | 6 | -0.363 | -3630 | 0.992 | 1745 |

## Notes

- This report reads local snapshots only.
- Near misses are diagnostics, not execution instructions.
- Unresolved paper trades are not converted into PnL or win-rate claims.
- No secrets or environment values are printed.
