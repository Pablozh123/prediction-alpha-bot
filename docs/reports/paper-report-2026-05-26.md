# Paper Run Report - 2026-05-26

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## Summary

- Scan cycles total: 3160
- Successful scan cycles: 3160
- Failed scan cycles: 0
- Dedupe skips: 3
- Legacy duplicate rejected rows: 19
- Average raw_edge: 0.012612
- Average executable_edge: -0.001179
- Average fillable_usd: 4151688.706894
- Average min_leg_depth_usd: 2073382.209484
- Average fee_adjusted_edge: 0.010224
- Average edge_bps: 8391.428571
- Average roi_bps: 2350.905000
- Average max_positive_basket_cost_usd: 129246.881725
- Paper trades without validation link: 147

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_yes_no_arb | 1554 |
| within_market_fast_arb | 938 |
| neg_risk_bracket_arb | 37 |
| clear_win_watch | 4 |

## Validated Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 4 |

## Rejected Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_yes_no_arb | 618 |
| neg_risk_bracket_arb | 316 |
| within_market_fast_arb | 100 |
| clear_win_watch | 4 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 879 |
| partial_basket_invalid | 145 |
| unknown_duration_for_short_arb | 5 |
| near_resolution_watch | 4 |
| nested_temporal_basket | 3 |
| duration_too_long_for_short_arb | 1 |
| multi_winner_or_qualifier_basket | 1 |

## Paper Trades By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 167 |

## Scanner Runs By Strategy

| Strategy | Count |
| --- | ---: |
| clear_win_watch | 2 |
| neg_risk_bracket_arb | 3158 |
| within_market_fast_arb | 2 |
| within_market_yes_no_arb | 3156 |

## Duration Breakdown

| Capital Lock | Status | Count |
| --- | --- | ---: |
| long | rejected | 2 |
| short | rejected | 4 |
| unknown | paper_fired | 4 |
| unknown | rejected | 1051 |

## Clean Short Arbs

_None_

## Long-Duration Watch

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | 2026-nhl-stanley-cup-champion | 0.001000 | 0.001000 | 10.000000 | 3.330000 | n/a | unknown | 2.999000 | 0.001000 | 89.971511 | rejected | unknown_duration_for_short_arb | 1779800780611 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.062000 | 0.062000 | 620.000000 | 319.920000 | n/a | unknown | 1.938000 | 0.062000 | 36611.058050 | rejected | unknown_duration_for_short_arb | 1779800780512 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.491000 | 0.491000 | 4910.000000 | 1956.950000 | n/a | unknown | 2.509000 | 0.491000 | 48625.966734 | rejected | unknown_duration_for_short_arb | 1779800780402 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.121000 | 3.121000 | 31210.000000 | 8045.890000 | n/a | unknown | 3.879000 | 3.121000 | 464430.067950 | rejected | unknown_duration_for_short_arb | 1779800780165 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.448000 | 0.459000 | 4590.000000 | 1010.790000 | 3130.894456 | long | 4.541000 | 0.459000 | 24691.481623 | rejected | duration_too_long_for_short_arb | 1779800779959 |
| neg_risk_bracket_arb | 2026-nhl-stanley-cup-champion | 0.002000 | 0.001000 | 10.000000 | 3.330000 | n/a | unknown | 2.999000 | 0.001000 | 89.971511 | rejected | unknown_duration_for_short_arb | 1779800711499 |

## Near-Resolution Watch

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| clear_win_watch | will-ken-paxton-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800779952 |
| clear_win_watch | will-john-cornyn-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800779945 |
| clear_win_watch | will-ken-paxton-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800710718 |
| clear_win_watch | will-john-cornyn-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800710710 |

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.121000 | 3.121000 | 31210.000000 | 8045.890000 | n/a | unknown | 3.879000 | 3.121000 | 464430.067950 | rejected | unknown_duration_for_short_arb | 1779800780165 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.071000 | 3.121000 | 31210.000000 | 8045.890000 | n/a | unknown | 3.879000 | 3.121000 | 464585.458550 | rejected | nested_temporal_basket | 1779800710936 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.071000 | 3.071000 | 30710.000000 | 7816.240000 | n/a |  | 3.929000 | 3.071000 | 467159.668410 | paper_fired | paper_trade_recorded | 1779548898897 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.491000 | 0.491000 | 4910.000000 | 1956.950000 | n/a | unknown | 2.509000 | 0.491000 | 48625.966734 | rejected | unknown_duration_for_short_arb | 1779800780402 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.497000 | 0.491000 | 4910.000000 | 1956.950000 | n/a | unknown | 2.509000 | 0.491000 | 48625.966734 | rejected | nested_temporal_basket | 1779800711142 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.448000 | 0.459000 | 4590.000000 | 1010.790000 | 3130.894456 | long | 4.541000 | 0.459000 | 24691.481623 | rejected | duration_too_long_for_short_arb | 1779800779959 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.448000 | 0.459000 | 4590.000000 | 1010.790000 | 3130.913687 | long | 4.541000 | 0.459000 | 24695.998763 | rejected | multi_winner_or_qualifier_basket | 1779800710726 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.361000 | 0.361000 | 3610.000000 | 2202.560000 | n/a |  | 1.639000 | 0.361000 | 130123.272774 | paper_fired | paper_trade_recorded | 1779548899250 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.062000 | 0.062000 | 620.000000 | 319.920000 | n/a | unknown | 1.938000 | 0.062000 | 36611.058050 | rejected | unknown_duration_for_short_arb | 1779800780512 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.361000 | 0.062000 | 620.000000 | 319.920000 | n/a | unknown | 1.938000 | 0.062000 | 16865.024823 | rejected | nested_temporal_basket | 1779800711259 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.040000 | 0.040000 | 400.000000 | 204.080000 | n/a |  | 1.960000 | 0.040000 | 82516.891605 | paper_fired | paper_trade_recorded | 1779548899439 |
| neg_risk_bracket_arb | harvey-weinstein-prison-time | 0.002000 | 0.008000 | 80.000000 | 16.030000 | n/a |  | 4.992000 | 0.008000 | 345.545112 | paper_fired | paper_trade_recorded | 1779295628775 |
| neg_risk_bracket_arb | 2026-nhl-stanley-cup-champion | 0.001000 | 0.001000 | 10.000000 | 3.330000 | n/a | unknown | 2.999000 | 0.001000 | 89.971511 | rejected | unknown_duration_for_short_arb | 1779800780611 |
| neg_risk_bracket_arb | 2026-nhl-stanley-cup-champion | 0.002000 | 0.001000 | 10.000000 | 3.330000 | n/a | unknown | 2.999000 | 0.001000 | 89.971511 | rejected | unknown_duration_for_short_arb | 1779800711499 |
| within_market_fast_arb | will-elon-musk-win-the-2028-us-presidential-election | -0.001000 | -0.001000 | n/a | n/a | n/a | unknown | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779800784580 |
| within_market_fast_arb | will-elon-musk-win-the-2028-republican-presidential-nomination | -0.001000 | -0.001000 | n/a | n/a | n/a | unknown | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779800784508 |
| within_market_fast_arb | will-elise-stefanik-win-the-2028-republican-presidential-nomination | -0.001000 | -0.001000 | n/a | n/a | n/a | unknown | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779800784432 |
| within_market_fast_arb | will-egypt-win-the-2026-fifa-world-cup | -0.001000 | -0.001000 | n/a | n/a | n/a | unknown | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779800784124 |
| within_market_fast_arb | will-eduardo-leite-win-the-2026-brazilian-presidential-election | -0.001000 | -0.001000 | n/a | n/a | n/a | unknown | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779800784050 |
| within_market_fast_arb | will-eduardo-bolsonaro-win-the-2026-brazilian-presidential-election | -0.001000 | -0.001000 | n/a | n/a | n/a | unknown | n/a | n/a | n/a | rejected | non_positive_executable_edge | 1779800783977 |

## Validation Warning

WARNING: 147 paper trade(s) do not have a recorded opportunity validation link. Treat them as legacy or non-graduation data.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
