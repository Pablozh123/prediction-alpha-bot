# Paper Run Report - 2026-05-20

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## Summary

- Scan cycles total: 2
- Successful scan cycles: 2
- Failed scan cycles: 0
- Dedupe skips: 0
- Average raw_edge: 0.004826
- Average executable_edge: -0.023164
- Paper trades without validation link: 147

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 305 |

## Validated Opportunities By Strategy

_None_

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
| neg_risk_bracket_arb | 147 |

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.007500 | -0.005000 | rejected | non_positive_executable_edge | 1779256527488 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.007500 | -0.005000 | rejected | non_positive_executable_edge | 1779256519486 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004000 | -0.014000 | rejected | non_positive_executable_edge | 1779259107520 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004000 | -0.014000 | rejected | non_positive_executable_edge | 1779259098877 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | rejected | non_positive_executable_edge | 1779258117530 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | rejected | non_positive_executable_edge | 1779258108881 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | rejected | non_positive_executable_edge | 1779258087498 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.014000 | rejected | non_positive_executable_edge | 1779258078897 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257937489 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257928878 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257907495 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257898861 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257877513 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257868890 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257847518 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257838872 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257817520 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257808863 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.004500 | -0.014000 | rejected | non_positive_executable_edge | 1779257787512 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.005000 | -0.015000 | rejected | non_positive_executable_edge | 1779259347525 |

## Validation Warning

WARNING: 147 paper trade(s) do not have a recorded opportunity validation link. Treat them as legacy or non-graduation data.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
