# Strategy Evaluation - 2026-06-02

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-27.db`

## A. Run Summary

- Start time: 2026-05-27T19:42:54.514Z
- End time: 2026-05-27T22:48:13.525Z
- Duration hours: 3.0886
- Strategies found: clear_win_watch, neg_risk_bracket_arb, within_market_fast_arb
- Scan cycles: 944

## B. Opportunity Funnel pro Strategie

| Strategy | raw_found | validated | rejected | paper_fired | dedupe_skipped | validated_rate | rejected_rate | paper_fired_rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| within_market_fast_arb | 436176 | 0 | 46914 | 0 | 0 | 0% | 10.76% | 0% |
| neg_risk_bracket_arb | 6097 | 0 | 6093 | 0 | 0 | 0% | 99.93% | 0% |
| clear_win_watch | 0 | 0 | 0 | 0 | 0 | unavailable | unavailable | unavailable |

## C. Rejection Reasons

| Strategy | Reason | Count |
| --- | --- | ---: |
| within_market_fast_arb | non_positive_executable_edge | 45978 |
| neg_risk_bracket_arb | unknown_duration_for_short_arb | 4485 |
| neg_risk_bracket_arb | duration_too_long_for_short_arb | 943 |
| within_market_fast_arb | partial_basket_invalid | 936 |
| neg_risk_bracket_arb | non_positive_executable_edge | 427 |
| neg_risk_bracket_arb | insufficient_clean_edge | 238 |

## D. Edge Quality

| Strategy | avg raw_edge_bps | median raw_edge_bps | avg executable_edge_bps | median executable_edge_bps | min executable_edge_bps | max executable_edge_bps | fee_adjusted_edge_bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| clear_win_watch | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| neg_risk_bracket_arb | 7452.84 | 4760 | 7435.72 | 4760 | -300 | 30520 | 7435.72 |
| within_market_fast_arb | -27.06 | -10 | -108.33 | -70 | -1900 | -10 | -108.33 |

## E. Capacity / Depth

| Strategy | avg fillable_usd | median fillable_usd | min_leg_depth_usd |
| --- | ---: | ---: | --- |
| clear_win_watch | n/a | n/a | n/a |
| neg_risk_bracket_arb | 419359.08 | 210572.172 | 1309.9813 |
| within_market_fast_arb | 408572.15 | 67438.21168 | 0 |

### Top 20 by executable_edge_bps

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:03:28.351Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:03:08.204Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:02:58.161Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:02:48.219Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:02:38.136Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:02:28.143Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 598179.5832 | 74772.4479 | 8 | 3.948 | 18256440879.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:02:18.360Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:02:08.192Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:01:50.616Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:01:38.032Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:01:28.033Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:01:18.078Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:01:08.098Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:00:58.090Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:00:48.011Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:00:38.169Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:00:28.600Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:00:18.111Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T21:00:08.121Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30520 | 601459.5832 | 75182.4479 | 8 | 3.948 | 18356546479.26 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:59:57.966Z |

### Top 20 by executable_edge_bps * fillable_usd

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:40:05.610Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:40:24.572Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:40:35.335Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:40:44.537Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:40:54.595Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:41:05.428Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:41:14.644Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:41:24.520Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:41:44.550Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:41:54.608Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:42:15.715Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:42:25.728Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 610355.7432 | 76294.4679 | 8 | 3.958 | 18567021708.14 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:42:36.013Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 610355.7432 | 76294.4679 | 8 | 3.968 | 18505986133.82 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:15:32.861Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 610355.7432 | 76294.4679 | 8 | 3.968 | 18505986133.82 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:15:41.456Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 610355.7432 | 76294.4679 | 8 | 3.968 | 18505986133.82 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:15:51.767Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 610355.7432 | 76294.4679 | 8 | 3.968 | 18505986133.82 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:16:03.212Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 610355.7432 | 76294.4679 | 8 | 3.968 | 18505986133.82 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:16:11.502Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 610355.7432 | 76294.4679 | 8 | 3.968 | 18505986133.82 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:16:32.919Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 610355.7432 | 76294.4679 | 8 | 3.968 | 18505986133.82 | rejected | unknown_duration_for_short_arb | 2026-05-27T20:16:41.454Z |

## F. Time Analysis

- Opportunities per hour: 17165.06
- Validated per hour: 0
- Rejected per hour: 17162.14

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
| clear_win_watch | PAUSE | No usable opportunities were found. |

## Data Quality Warnings

_None_

## Safety Notes

- No live trading data is modified.
- No external APIs are called.
- PnL and win-rate are not inferred from unresolved paper trades.
- Secrets and environment variables are not printed.
