# Paper Run Report - 2026-05-24

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-23.db`

## Summary

- Scan cycles total: 6
- Successful scan cycles: 6
- Failed scan cycles: 0
- Dedupe skips: 16
- Legacy duplicate rejected rows: 0
- Average raw_edge: 0.012211
- Average executable_edge: 0.001007
- Average fillable_usd: 431404.400059
- Average min_leg_depth_usd: 214028.056949
- Average fee_adjusted_edge: 0.001007
- Average edge_bps: 9992.500000
- Average roi_bps: 3091.355000
- Average max_positive_basket_cost_usd: 146899.186853
- Paper trades without validation link: 0

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_yes_no_arb | 3108 |
| neg_risk_bracket_arb | 20 |

## Validated Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 4 |

## Rejected Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_yes_no_arb | 300 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 300 |

## Paper Trades By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 18 |

## Scanner Runs By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 6 |
| within_market_yes_no_arb | 6 |

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Basket Shares | Basket Cost | Basket Profit | Max Positive Shares | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.091000 | 3.091000 | 30910.000000 | 7907.390000 | 1.000000 | 3.909000 | 3.091000 | 67049.840000 | 354225.598570 | paper_fired | paper_trade_recorded | 1779551193123 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.494000 | 0.494000 | 4940.000000 | 1971.270000 | 1.000000 | 2.506000 | 0.494000 | 10670.342588 | 32011.027763 | paper_fired | paper_trade_recorded | 1779551193639 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.371000 | 0.371000 | 3710.000000 | 2277.470000 | 1.000000 | 1.629000 | 0.371000 | 64273.471246 | 128546.942492 | paper_fired | paper_trade_recorded | 1779551193833 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.041000 | 0.041000 | 410.000000 | 209.290000 | 1.000000 | 1.959000 | 0.041000 | 36406.589293 | 72813.178587 | paper_fired | paper_trade_recorded | 1779551194051 |
| within_market_yes_no_arb | will-bitcoin-hit-1m-before-gta-vi-872-424 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551314062 |
| within_market_yes_no_arb | starmer-out-by-may-31-2026 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313988 |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313900 |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313823 |
| within_market_yes_no_arb | netanyahu-out-by-may-31 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313750 |
| within_market_yes_no_arb | netanyahu-out-by-june-30-383-244-575 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313669 |
| within_market_yes_no_arb | natoeu-troops-fighting-in-ukraine-in-june-30-2026 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313590 |
| within_market_yes_no_arb | microstrategy-sells-any-bitcoin-by-june-30-2026 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313469 |
| within_market_yes_no_arb | macron-out-by-june-30-2026-273 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313394 |
| within_market_yes_no_arb | jeffrey-epstein-foul-play-confirmed-by-december-31-2026 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313324 |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313249 |
| within_market_yes_no_arb | gta-vi-released-before-june-2026 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551313159 |
| within_market_yes_no_arb | will-bitcoin-hit-1m-before-gta-vi-872-424 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551284066 |
| within_market_yes_no_arb | starmer-out-by-may-31-2026 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551283984 |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551283885 |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -0.001000 | -0.001000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779551283792 |

## Validation Warning

OK: every paper trade has a recorded opportunity validation link.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
