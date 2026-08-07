# Strategy Evaluation - 2026-06-02

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-30.db`

## A. Run Summary

- Start time: 2026-05-29T23:17:43.935Z
- End time: 2026-05-30T23:59:10.535Z
- Duration hours: 24.6907
- Strategies found: clear_win_watch, neg_risk_bracket_arb, within_market_fast_arb
- Scan cycles: 4919

## B. Opportunity Funnel pro Strategie

| Strategy | raw_found | validated | rejected | paper_fired | dedupe_skipped | validated_rate | rejected_rate | paper_fired_rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| within_market_fast_arb | 2305183 | 0 | 245827 | 0 | 0 | 0% | 10.66% | 0% |
| neg_risk_bracket_arb | 25428 | 0 | 25427 | 0 | 0 | 0% | 100% | 0% |
| clear_win_watch | 3413 | 0 | 3413 | 0 | 0 | 0% | 100% | 0% |

## C. Rejection Reasons

| Strategy | Reason | Count |
| --- | --- | ---: |
| within_market_fast_arb | non_positive_executable_edge | 241597 |
| neg_risk_bracket_arb | duration_too_long_for_short_arb | 24835 |
| within_market_fast_arb | partial_basket_invalid | 4230 |
| clear_win_watch | near_resolution_watch | 3413 |
| neg_risk_bracket_arb | unknown_duration_for_short_arb | 330 |
| neg_risk_bracket_arb | non_positive_executable_edge | 136 |
| neg_risk_bracket_arb | partial_basket_invalid | 126 |

## D. Edge Quality

| Strategy | avg raw_edge_bps | median raw_edge_bps | avg executable_edge_bps | median executable_edge_bps | min executable_edge_bps | max executable_edge_bps | fee_adjusted_edge_bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| clear_win_watch | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| neg_risk_bracket_arb | 10130.46 | 6780 | 10201.7 | 6780 | -230 | 30220 | 10201.7 |
| within_market_fast_arb | -21.35 | -10 | -104.49 | -50 | -4000 | -10 | -104.49 |

## E. Capacity / Depth

| Strategy | avg fillable_usd | median fillable_usd | min_leg_depth_usd |
| --- | ---: | ---: | --- |
| clear_win_watch | n/a | n/a | n/a |
| neg_risk_bracket_arb | 287295.15 | 155513.235 | 0 |
| within_market_fast_arb | 400864.24 | 89181.7416 | 0 |

### Top 20 by executable_edge_bps

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 437520.4216 | 54690.0527 | 8 | 3.978 | 13221867140.75 | rejected | duration_too_long_for_short_arb | 2026-05-30T09:01:23.027Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 437520.4216 | 54690.0527 | 8 | 3.978 | 13221867140.75 | rejected | duration_too_long_for_short_arb | 2026-05-30T09:01:01.502Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 437520.4216 | 54690.0527 | 8 | 3.978 | 13221867140.75 | rejected | duration_too_long_for_short_arb | 2026-05-30T09:00:53.025Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:36:00.596Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:35:50.531Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:35:40.662Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:35:30.648Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:35:20.410Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:35:10.636Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:35:00.505Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:34:50.457Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:34:40.573Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:34:30.498Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:34:20.722Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:34:10.585Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:34:00.484Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:33:50.377Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:33:40.568Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 448369.592 | 56046.199 | 8 | 3.978 | 13549729070.24 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:33:30.367Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30220 | 446952.872 | 55869.109 | 8 | 3.978 | 13506915791.84 | rejected | duration_too_long_for_short_arb | 2026-05-30T03:33:20.413Z |

### Top 20 by executable_edge_bps * fillable_usd

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30020 | 601427.9064 | 75178.4883 | 8 | 3.998 | 18054865750.13 | rejected | duration_too_long_for_short_arb | 2026-05-30T11:00:52.565Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 595880.4728 | 74485.0591 | 8 | 3.988 | 17947919840.74 | rejected | duration_too_long_for_short_arb | 2026-05-30T15:05:16.364Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 592957.296 | 74119.662 | 8 | 3.988 | 17859873755.52 | rejected | duration_too_long_for_short_arb | 2026-05-30T08:36:36.661Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30020 | 592771.0152 | 74096.3769 | 8 | 3.998 | 17794985876.3 | rejected | duration_too_long_for_short_arb | 2026-05-30T10:27:37.417Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 569091.9096 | 71136.4887 | 8 | 3.988 | 17141048317.15 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:11:12.057Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:12:42.217Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:12:52.198Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:13:02.290Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:13:12.478Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:13:22.259Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:14:42.829Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:14:52.371Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:15:02.243Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568780.4696 | 71097.5587 | 8 | 3.988 | 17131667744.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:15:12.279Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568698.8696 | 71087.3587 | 8 | 3.988 | 17129209952.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:13:32.152Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568698.8696 | 71087.3587 | 8 | 3.988 | 17129209952.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:13:42.145Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568698.8696 | 71087.3587 | 8 | 3.988 | 17129209952.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:13:52.189Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568698.8696 | 71087.3587 | 8 | 3.988 | 17129209952.35 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:14:12.290Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568482.7976 | 71060.3497 | 8 | 3.988 | 17122701863.71 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:06:51.196Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30120 | 568482.7976 | 71060.3497 | 8 | 3.988 | 17122701863.71 | rejected | duration_too_long_for_short_arb | 2026-05-30T07:07:01.166Z |

## F. Time Analysis

- Opportunities per hour: 11124.55
- Validated per hour: 0
- Rejected per hour: 11124.31

## G. Paper Trades

| Strategy | Count | Unresolved | Resolved | Note |
| --- | ---: | ---: | ---: | --- |
| clear_win_watch | 0 | 0 | 0 | insufficient resolved sample |
| neg_risk_bracket_arb | 0 | 0 | 0 | insufficient resolved sample |
| within_market_fast_arb | 0 | 0 | 0 | insufficient resolved sample |

## H. Verdict

| Strategy | Verdict | Reason |
| --- | --- | --- |
| within_market_fast_arb | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |
| neg_risk_bracket_arb | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |
| clear_win_watch | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |

## Data Quality Warnings

_None_

## Safety Notes

- No live trading data is modified.
- No external APIs are called.
- PnL and win-rate are not inferred from unresolved paper trades.
- Secrets and environment variables are not printed.
