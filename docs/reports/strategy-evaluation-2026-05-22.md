# Strategy Evaluation - 2026-05-22

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## A. Run Summary

- Start time: 2026-05-19T21:12:18.312Z
- End time: 2026-05-22T14:57:27.690Z
- Duration hours: 65.7526
- Strategies found: neg_risk_bracket_arb
- Scan cycles: 3154

## B. Opportunity Funnel pro Strategie

| Strategy | raw_found | validated | rejected | paper_fired | dedupe_skipped | validated_rate | rejected_rate | paper_fired_rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| neg_risk_bracket_arb | 325 | 1 | 305 | 1 | 19 | 0.31% | 93.85% | 0.31% |

## C. Rejection Reasons

| Strategy | Reason | Count |
| --- | --- | ---: |
| neg_risk_bracket_arb | non_positive_executable_edge | 305 |

## D. Edge Quality

| Strategy | avg raw_edge_bps | median raw_edge_bps | avg executable_edge_bps | median executable_edge_bps | min executable_edge_bps | max executable_edge_bps | fee_adjusted_edge_bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| neg_risk_bracket_arb | 46.68 | 40 | -230.62 | -160 | -1230 | 80 | 80 |

## E. Capacity / Depth

| Strategy | avg fillable_usd | median fillable_usd | min_leg_depth_usd |
| --- | ---: | ---: | --- |
| neg_risk_bracket_arb | 665.34 | 665.34 | 110.89 |

### Top 20 by executable_edge_bps

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 80 | 665.34 | 110.89 | 6 | 4.992 | 53227.2 | paper_fired | paper_trade_recorded | 2026-05-20T16:47:08.775Z |
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

### Top 20 by executable_edge_bps * fillable_usd

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 80 | 665.34 | 110.89 | 6 | 4.992 | 53227.2 | paper_fired | paper_trade_recorded | 2026-05-20T16:47:08.775Z |

## F. Time Analysis

- Opportunities per hour: 4.94
- Validated per hour: 0.02
- Rejected per hour: 4.64

## G. Paper Trades

| Strategy | Count | Unresolved | Resolved | Note |
| --- | ---: | ---: | ---: | --- |
| neg_risk_bracket_arb | 153 | 153 | 0 | insufficient resolved sample |

## H. Verdict

| Strategy | Verdict | Reason |
| --- | --- | --- |
| neg_risk_bracket_arb | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |

## Data Quality Warnings

- 147 paper trade(s) have no opportunity_id link

## Safety Notes

- No live trading data is modified.
- No external APIs are called.
- PnL and win-rate are not inferred from unresolved paper trades.
- Secrets and environment variables are not printed.
