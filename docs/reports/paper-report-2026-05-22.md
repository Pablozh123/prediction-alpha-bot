# Paper Run Report - 2026-05-22

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## Summary

- Scan cycles total: 3153
- Successful scan cycles: 3153
- Failed scan cycles: 0
- Dedupe skips: 0
- Legacy duplicate rejected rows: 19
- Average raw_edge: 0.004668
- Average executable_edge: -0.023062
- Average fillable_usd: 665.340000
- Average min_leg_depth_usd: 110.890000
- Average fee_adjusted_edge: 0.008000
- Average edge_bps: 80.000000
- Average roi_bps: 16.030000
- Average max_positive_basket_cost_usd: 345.545112
- Paper trades without validation link: 147

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 20 |
| within_market_yes_no_arb | 0 |

## Validated Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 1 |

## Rejected Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 305 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 305 |

## Paper Trades By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 153 |

## Scanner Runs By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 3151 |
| within_market_yes_no_arb | 3151 |

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Basket Shares | Basket Cost | Basket Profit | Max Positive Shares | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.002000 | 0.008000 | 80.000000 | 16.030000 | 1.000000 | 4.992000 | 0.008000 | 69.109022 | 345.545112 | paper_fired | paper_trade_recorded | 1779295628775 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.007500 | -0.005000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779256527488 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.007500 | -0.005000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779256519486 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004000 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779259107520 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004000 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779259098877 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779258117530 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779258108881 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779258087498 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779258078897 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257937489 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257928878 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257907495 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257898861 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257877513 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257868890 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257847518 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257838872 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257817520 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257808863 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779257787512 |

## Validation Warning

WARNING: 147 paper trade(s) do not have a recorded opportunity validation link. Treat them as legacy or non-graduation data.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
