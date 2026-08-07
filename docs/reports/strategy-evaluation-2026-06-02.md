# Strategy Evaluation - 2026-06-02

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## A. Run Summary

- Start time: 2026-05-19T21:12:18.312Z
- End time: 2026-05-29T21:59:30.095Z
- Duration hours: 240.7866
- Strategies found: clear_win_watch, neg_risk_bracket_arb, within_market_fast_arb, within_market_yes_no_arb
- Scan cycles: 3163

## B. Opportunity Funnel pro Strategie

| Strategy | raw_found | validated | rejected | paper_fired | dedupe_skipped | validated_rate | rejected_rate | paper_fired_rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| within_market_fast_arb | 2354 | 0 | 250 | 0 | 0 | 0% | 10.62% | 0% |
| within_market_yes_no_arb | 1554 | 0 | 618 | 0 | 0 | 0% | 39.77% | 0% |
| neg_risk_bracket_arb | 355 | 4 | 332 | 4 | 22 | 1.13% | 93.52% | 1.13% |
| clear_win_watch | 6 | 0 | 6 | 0 | 0 | 0% | 100% | 0% |

## C. Rejection Reasons

| Strategy | Reason | Count |
| --- | --- | ---: |
| within_market_yes_no_arb | non_positive_executable_edge | 473 |
| neg_risk_bracket_arb | non_positive_executable_edge | 308 |
| within_market_fast_arb | non_positive_executable_edge | 249 |
| within_market_yes_no_arb | partial_basket_invalid | 145 |
| neg_risk_bracket_arb | unknown_duration_for_short_arb | 15 |
| clear_win_watch | near_resolution_watch | 6 |
| neg_risk_bracket_arb | duration_too_long_for_short_arb | 4 |
| neg_risk_bracket_arb | nested_temporal_basket | 3 |
| neg_risk_bracket_arb | insufficient_clean_edge | 1 |
| neg_risk_bracket_arb | multi_winner_or_qualifier_basket | 1 |
| within_market_fast_arb | partial_basket_invalid | 1 |

## D. Edge Quality

| Strategy | avg raw_edge_bps | median raw_edge_bps | avg executable_edge_bps | median executable_edge_bps | min executable_edge_bps | max executable_edge_bps | fee_adjusted_edge_bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| clear_win_watch | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| neg_risk_bracket_arb | 754.65 | 45 | 558.72 | -150 | -1230 | 31210 | 8334.84 |
| within_market_fast_arb | -10 | -10 | -12.09 | -10 | -90 | -10 | -12.09 |
| within_market_yes_no_arb | -1.62 | 0 | -117.57 | -10 | -4710 | -10 | -117.57 |

## E. Capacity / Depth

| Strategy | avg fillable_usd | median fillable_usd | min_leg_depth_usd |
| --- | ---: | ---: | --- |
| clear_win_watch | n/a | n/a | n/a |
| neg_risk_bracket_arb | 359831.19 | 240950.72976 | 110.89 |
| within_market_fast_arb | 8926818.39 | 6108920.42698 | 0 |
| within_market_yes_no_arb | 3711955.09 | 164721.74466000003 | 0 |

### Top 20 by executable_edge_bps

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 31210 | 551558.1032 | 68944.7629 | 8 | 3.879 | 17214128400.87 | rejected | unknown_duration_for_short_arb | 2026-05-26T13:06:20.165Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 31210 | 552980.1832 | 69122.5229 | 8 | 3.879 | 17258511517.67 | rejected | nested_temporal_basket | 2026-05-26T13:05:10.936Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 31020 | 552290.6816 | 69036.3352 | 8 | 3.898 | 17132056943.23 | rejected | unknown_duration_for_short_arb | 2026-05-26T14:06:35.939Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30710 | 555789.2072 | 69473.6509 | 8 | 3.929 | 17068286553.11 | paper_fired | paper_trade_recorded | 2026-05-23T15:08:18.897Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 523059.5832 | 65382.4479 | 8 | 3.958 | 15911472520.94 | rejected | unknown_duration_for_short_arb | 2026-05-27T19:29:52.728Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 447741.9088 | 55967.7386 | 8 | 3.968 | 13575534674.82 | rejected | unknown_duration_for_short_arb | 2026-05-29T21:59:25.649Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 8490 | 121906.8891 | 40635.6297 | 3 | 1.151 | 1034989488.46 | rejected | unknown_duration_for_short_arb | 2026-05-29T21:59:25.944Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 7460 | 11959.1126 | 2989.77815 | 4 | 2.254 | 89214980 | rejected | unknown_duration_for_short_arb | 2026-05-29T21:59:25.838Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 6170 | 257826.06702 | 42971.01117 | 6 | 4.383 | 1590786833.51 | rejected | duration_too_long_for_short_arb | 2026-05-29T21:59:25.458Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 5910 | 240950.72976 | 40158.45496 | 6 | 4.409 | 1424018812.88 | rejected | duration_too_long_for_short_arb | 2026-05-27T19:29:52.559Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 5490 | 296780.35596 | 49463.39266 | 6 | 4.451 | 1629324154.22 | rejected | duration_too_long_for_short_arb | 2026-05-26T14:06:35.757Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 5440 | 34944.74276 | 8736.18569 | 4 | 2.456 | 190099400.61 | rejected | unknown_duration_for_short_arb | 2026-05-27T19:29:52.966Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4910 | 69930.91616 | 17482.72904 | 4 | 2.509 | 343360798.35 | rejected | unknown_duration_for_short_arb | 2026-05-26T13:06:20.402Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4910 | 69930.91616 | 17482.72904 | 4 | 2.509 | 343360798.35 | rejected | nested_temporal_basket | 2026-05-26T13:05:11.142Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4900 | 69930.91616 | 17482.72904 | 4 | 2.51 | 342661489.18 | rejected | unknown_duration_for_short_arb | 2026-05-26T14:06:36.138Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 4590 | 293916.79596 | 48986.13266 | 6 | 4.541 | 1349078093.46 | rejected | duration_too_long_for_short_arb | 2026-05-26T13:06:19.959Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 4590 | 293916.79596 | 48986.13266 | 6 | 4.541 | 1349078093.46 | rejected | multi_winner_or_qualifier_basket | 2026-05-26T13:05:10.726Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 3610 | 116425.2867 | 38808.4289 | 3 | 1.639 | 420295284.99 | paper_fired | paper_trade_recorded | 2026-05-23T15:08:19.250Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 3520 | 202752.2637 | 67584.0879 | 3 | 1.648 | 713687968.22 | rejected | unknown_duration_for_short_arb | 2026-05-27T19:29:53.074Z |
| neg_risk_bracket_arb | starmer-out-in-2025 | 1780 | 139452.836 | 27890.5672 | 5 | 3.822 | 248226048.08 | rejected | unknown_duration_for_short_arb | 2026-05-29T21:59:26.027Z |

### Top 20 by executable_edge_bps * fillable_usd

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 31210 | 552980.1832 | 69122.5229 | 8 | 3.879 | 17258511517.67 | rejected | nested_temporal_basket | 2026-05-26T13:05:10.936Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 31210 | 551558.1032 | 68944.7629 | 8 | 3.879 | 17214128400.87 | rejected | unknown_duration_for_short_arb | 2026-05-26T13:06:20.165Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 31020 | 552290.6816 | 69036.3352 | 8 | 3.898 | 17132056943.23 | rejected | unknown_duration_for_short_arb | 2026-05-26T14:06:35.939Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30710 | 555789.2072 | 69473.6509 | 8 | 3.929 | 17068286553.11 | paper_fired | paper_trade_recorded | 2026-05-23T15:08:18.897Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30420 | 523059.5832 | 65382.4479 | 8 | 3.958 | 15911472520.94 | rejected | unknown_duration_for_short_arb | 2026-05-27T19:29:52.728Z |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30320 | 447741.9088 | 55967.7386 | 8 | 3.968 | 13575534674.82 | rejected | unknown_duration_for_short_arb | 2026-05-29T21:59:25.649Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 5490 | 296780.35596 | 49463.39266 | 6 | 4.451 | 1629324154.22 | rejected | duration_too_long_for_short_arb | 2026-05-26T14:06:35.757Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 6170 | 257826.06702 | 42971.01117 | 6 | 4.383 | 1590786833.51 | rejected | duration_too_long_for_short_arb | 2026-05-29T21:59:25.458Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 5910 | 240950.72976 | 40158.45496 | 6 | 4.409 | 1424018812.88 | rejected | duration_too_long_for_short_arb | 2026-05-27T19:29:52.559Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 4590 | 293916.79596 | 48986.13266 | 6 | 4.541 | 1349078093.46 | rejected | multi_winner_or_qualifier_basket | 2026-05-26T13:05:10.726Z |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 4590 | 293916.79596 | 48986.13266 | 6 | 4.541 | 1349078093.46 | rejected | duration_too_long_for_short_arb | 2026-05-26T13:06:19.959Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 8490 | 121906.8891 | 40635.6297 | 3 | 1.151 | 1034989488.46 | rejected | unknown_duration_for_short_arb | 2026-05-29T21:59:25.944Z |
| neg_risk_bracket_arb | starmer-out-in-2025 | 400 | 1856326.7532 | 618775.5844 | 3 | 1.96 | 742530701.28 | paper_fired | paper_trade_recorded | 2026-05-23T15:08:19.439Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 3520 | 202752.2637 | 67584.0879 | 3 | 1.648 | 713687968.22 | rejected | unknown_duration_for_short_arb | 2026-05-27T19:29:53.074Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 3610 | 116425.2867 | 38808.4289 | 3 | 1.639 | 420295284.99 | paper_fired | paper_trade_recorded | 2026-05-23T15:08:19.250Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4910 | 69930.91616 | 17482.72904 | 4 | 2.509 | 343360798.35 | rejected | nested_temporal_basket | 2026-05-26T13:05:11.142Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4910 | 69930.91616 | 17482.72904 | 4 | 2.509 | 343360798.35 | rejected | unknown_duration_for_short_arb | 2026-05-26T13:06:20.402Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4900 | 69930.91616 | 17482.72904 | 4 | 2.51 | 342661489.18 | rejected | unknown_duration_for_short_arb | 2026-05-26T14:06:36.138Z |
| neg_risk_bracket_arb | starmer-out-in-2025 | 1780 | 139452.836 | 27890.5672 | 5 | 3.822 | 248226048.08 | rejected | unknown_duration_for_short_arb | 2026-05-29T21:59:26.027Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 5440 | 34944.74276 | 8736.18569 | 4 | 2.456 | 190099400.61 | rejected | unknown_duration_for_short_arb | 2026-05-27T19:29:52.966Z |

## F. Time Analysis

- Opportunities per hour: 5.1
- Validated per hour: 0.02
- Rejected per hour: 5.01

## G. Paper Trades

| Strategy | Count | Unresolved | Resolved | Note |
| --- | ---: | ---: | ---: | --- |
| neg_risk_bracket_arb | 167 | 167 | 0 | insufficient resolved sample |
| clear_win_watch | 0 | 0 | 0 | insufficient resolved sample |
| within_market_fast_arb | 0 | 0 | 0 | insufficient resolved sample |
| within_market_yes_no_arb | 0 | 0 | 0 | insufficient resolved sample |

## H. Verdict

| Strategy | Verdict | Reason |
| --- | --- | --- |
| within_market_fast_arb | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |
| within_market_yes_no_arb | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |
| neg_risk_bracket_arb | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |
| clear_win_watch | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |

## Data Quality Warnings

- 147 paper trade(s) have no opportunity_id link

## Safety Notes

- No live trading data is modified.
- No external APIs are called.
- PnL and win-rate are not inferred from unresolved paper trades.
- Secrets and environment variables are not printed.
