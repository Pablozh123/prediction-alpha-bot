# Strategy Evaluation - 2026-05-20

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## A. Run Summary

- Start time: 2026-05-19T21:12:18.312Z
- End time: 2026-05-20T14:45:02.256Z
- Duration hours: 17.5455
- Strategies found: neg_risk_bracket_arb
- Scan cycles: 114

## B. Opportunity Funnel pro Strategie

| Strategy | raw_found | validated | rejected | paper_fired | dedupe_skipped | validated_rate | rejected_rate | paper_fired_rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| neg_risk_bracket_arb | 305 | 0 | 305 | 0 | 0 | 0% | 100% | 0% |

## C. Rejection Reasons

| Strategy | Reason | Count |
| --- | --- | ---: |
| neg_risk_bracket_arb | non_positive_executable_edge | 305 |

## D. Edge Quality

| Strategy | avg raw_edge_bps | median raw_edge_bps | avg executable_edge_bps | median executable_edge_bps | min executable_edge_bps | max executable_edge_bps | fee_adjusted_edge_bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| neg_risk_bracket_arb | 48.26 | 45 | -231.64 | -160 | -1230 | -50 | n/a |

## E. Capacity / Depth

| Strategy | avg fillable_usd | median fillable_usd | min_leg_depth_usd |
| --- | ---: | ---: | --- |
| neg_risk_bracket_arb | n/a | n/a | n/a |

### Top 20 by executable_edge_bps

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -50 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T05:55:27.488Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -50 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T05:55:19.486Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:38:27.520Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:38:18.877Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:21:57.530Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:21:48.881Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:21:27.498Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:21:18.897Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:18:57.489Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:18:48.878Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:18:27.495Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:18:18.861Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:17:57.513Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:17:48.890Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:17:27.518Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:17:18.872Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:16:57.520Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:16:48.863Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -140 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:16:27.512Z |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | -150 | n/a | n/a | n/a | n/a | n/a | rejected | non_positive_executable_edge | 2026-05-20T06:42:27.525Z |

### Top 20 by executable_edge_bps * fillable_usd

_None_

## F. Time Analysis

- Opportunities per hour: 17.38
- Validated per hour: 0
- Rejected per hour: 17.38

## G. Paper Trades

| Strategy | Count | Unresolved | Resolved | Note |
| --- | ---: | ---: | ---: | --- |
| neg_risk_bracket_arb | 147 | 147 | 0 | insufficient resolved sample |

## H. Verdict

| Strategy | Verdict | Reason |
| --- | --- | --- |
| neg_risk_bracket_arb | PAUSE | No validated opportunities and dominant hard rejection "non_positive_executable_edge". |

## Data Quality Warnings

- 147 paper trade(s) have no opportunity_id link

## Safety Notes

- No live trading data is modified.
- No external APIs are called.
- PnL and win-rate are not inferred from unresolved paper trades.
- Secrets and environment variables are not printed.
