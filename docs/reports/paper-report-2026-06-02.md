# Paper Run Report - 2026-06-02

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## Summary

- Scan cycles total: 3163
- Successful scan cycles: 3163
- Failed scan cycles: 0
- Dedupe skips: 3
- Legacy duplicate rejected rows: 19
- Average raw_edge: 0.021619
- Average executable_edge: 0.012203
- Average fillable_usd: 5046549.063125
- Average min_leg_depth_usd: 2519970.604971
- Average fee_adjusted_edge: 0.026529
- Average edge_bps: 9256.428571
- Average roi_bps: 2786.397500
- Average max_positive_basket_cost_usd: 128992.362243
- Paper trades without validation link: 147

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_fast_arb | 2354 |
| within_market_yes_no_arb | 1554 |
| neg_risk_bracket_arb | 53 |
| clear_win_watch | 6 |

## Validated Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 4 |

## Rejected Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_yes_no_arb | 618 |
| neg_risk_bracket_arb | 332 |
| within_market_fast_arb | 250 |
| clear_win_watch | 6 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 1030 |
| partial_basket_invalid | 146 |
| unknown_duration_for_short_arb | 15 |
| near_resolution_watch | 6 |
| duration_too_long_for_short_arb | 4 |
| nested_temporal_basket | 3 |
| insufficient_clean_edge | 1 |
| multi_winner_or_qualifier_basket | 1 |

## Paper Trades By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 167 |

## Scanner Runs By Strategy

| Strategy | Count |
| --- | ---: |
| clear_win_watch | 5 |
| neg_risk_bracket_arb | 3161 |
| within_market_fast_arb | 5 |
| within_market_yes_no_arb | 3156 |

## Duration Breakdown

| Capital Lock | Status | Count |
| --- | --- | ---: |
| long | rejected | 5 |
| short | rejected | 7 |
| unknown | paper_fired | 4 |
| unknown | rejected | 1213 |

## Clean Short Arbs

_None_

## Long-Duration Watch

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.221000 | 0.178000 | 1780.000000 | 465.720000 | n/a | unknown | 3.822000 | 0.178000 | 43844.541450 | rejected | unknown_duration_for_short_arb | 1780091966027 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.352000 | 0.849000 | 8490.000000 | 7376.190000 | n/a | unknown | 1.151000 | 0.849000 | 139897.774950 | rejected | unknown_duration_for_short_arb | 1780091965944 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.544000 | 0.746000 | 7460.000000 | 3309.670000 | n/a | unknown | 2.254000 | 0.746000 | 7415.239620 | rejected | unknown_duration_for_short_arb | 1780091965838 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.042000 | 3.032000 | 30320.000000 | 7641.130000 | n/a | unknown | 3.968000 | 3.032000 | 360775.603340 | rejected | unknown_duration_for_short_arb | 1780091965649 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.605500 | 0.617000 | 6170.000000 | 1407.710000 | 3050.009595 | long | 4.383000 | 0.617000 | 19126.379251 | rejected | duration_too_long_for_short_arb | 1780091965458 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.072000 | 0.352000 | 3520.000000 | 2135.920000 | n/a | unknown | 1.648000 | 0.352000 | 114447.698041 | rejected | unknown_duration_for_short_arb | 1779910193074 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.490000 | 0.544000 | 5440.000000 | 2214.980000 | n/a | unknown | 2.456000 | 0.544000 | 24282.204450 | rejected | unknown_duration_for_short_arb | 1779910192966 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.102000 | 3.042000 | 30420.000000 | 7685.700000 | n/a | unknown | 3.958000 | 3.042000 | 464350.334780 | rejected | unknown_duration_for_short_arb | 1779910192728 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.587000 | 0.591000 | 5910.000000 | 1340.440000 | 3100.502067 | long | 4.409000 | 0.591000 | 30726.910770 | rejected | duration_too_long_for_short_arb | 1779910192559 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.062000 | 0.072000 | 720.000000 | 373.440000 | n/a | unknown | 1.928000 | 0.072000 | 45620.480402 | rejected | unknown_duration_for_short_arb | 1779804396258 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.491000 | 0.490000 | 4900.000000 | 1952.190000 | n/a | unknown | 2.510000 | 0.490000 | 50210.505328 | rejected | unknown_duration_for_short_arb | 1779804396138 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.121000 | 3.102000 | 31020.000000 | 7957.930000 | n/a | unknown | 3.898000 | 3.102000 | 469650.355500 | rejected | unknown_duration_for_short_arb | 1779804395939 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.548500 | 0.549000 | 5490.000000 | 1233.430000 | 3129.890067 | long | 4.451000 | 0.549000 | 31914.417377 | rejected | duration_too_long_for_short_arb | 1779804395757 |
| neg_risk_bracket_arb | 2026-nhl-stanley-cup-champion | 0.001000 | 0.001000 | 10.000000 | 3.330000 | n/a | unknown | 2.999000 | 0.001000 | 89.971511 | rejected | unknown_duration_for_short_arb | 1779800780611 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.062000 | 0.062000 | 620.000000 | 319.920000 | n/a | unknown | 1.938000 | 0.062000 | 36611.058050 | rejected | unknown_duration_for_short_arb | 1779800780512 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.491000 | 0.491000 | 4910.000000 | 1956.950000 | n/a | unknown | 2.509000 | 0.491000 | 48625.966734 | rejected | unknown_duration_for_short_arb | 1779800780402 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.121000 | 3.121000 | 31210.000000 | 8045.890000 | n/a | unknown | 3.879000 | 3.121000 | 464430.067950 | rejected | unknown_duration_for_short_arb | 1779800780165 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.448000 | 0.459000 | 4590.000000 | 1010.790000 | 3130.894456 | long | 4.541000 | 0.459000 | 24691.481623 | rejected | duration_too_long_for_short_arb | 1779800779959 |
| neg_risk_bracket_arb | 2026-nhl-stanley-cup-champion | 0.002000 | 0.001000 | 10.000000 | 3.330000 | n/a | unknown | 2.999000 | 0.001000 | 89.971511 | rejected | unknown_duration_for_short_arb | 1779800711499 |

## Near-Resolution Watch

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| clear_win_watch | will-john-cornyn-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779804395752 |
| clear_win_watch | will-ken-paxton-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779804395744 |
| clear_win_watch | will-ken-paxton-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800779952 |
| clear_win_watch | will-john-cornyn-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800779945 |
| clear_win_watch | will-ken-paxton-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800710718 |
| clear_win_watch | will-john-cornyn-win-the-2026-republican-primary | n/a | n/a | n/a | n/a | 0.000000 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1779800710710 |

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.121000 | 3.121000 | 31210.000000 | 8045.890000 | n/a | unknown | 3.879000 | 3.121000 | 464430.067950 | rejected | unknown_duration_for_short_arb | 1779800780165 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.071000 | 3.121000 | 31210.000000 | 8045.890000 | n/a | unknown | 3.879000 | 3.121000 | 464585.458550 | rejected | nested_temporal_basket | 1779800710936 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.121000 | 3.102000 | 31020.000000 | 7957.930000 | n/a | unknown | 3.898000 | 3.102000 | 469650.355500 | rejected | unknown_duration_for_short_arb | 1779804395939 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.071000 | 3.071000 | 30710.000000 | 7816.240000 | n/a |  | 3.929000 | 3.071000 | 467159.668410 | paper_fired | paper_trade_recorded | 1779548898897 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.102000 | 3.042000 | 30420.000000 | 7685.700000 | n/a | unknown | 3.958000 | 3.042000 | 464350.334780 | rejected | unknown_duration_for_short_arb | 1779910192728 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.042000 | 3.032000 | 30320.000000 | 7641.130000 | n/a | unknown | 3.968000 | 3.032000 | 360775.603340 | rejected | unknown_duration_for_short_arb | 1780091965649 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.352000 | 0.849000 | 8490.000000 | 7376.190000 | n/a | unknown | 1.151000 | 0.849000 | 139897.774950 | rejected | unknown_duration_for_short_arb | 1780091965944 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.544000 | 0.746000 | 7460.000000 | 3309.670000 | n/a | unknown | 2.254000 | 0.746000 | 7415.239620 | rejected | unknown_duration_for_short_arb | 1780091965838 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.605500 | 0.617000 | 6170.000000 | 1407.710000 | 3050.009595 | long | 4.383000 | 0.617000 | 19126.379251 | rejected | duration_too_long_for_short_arb | 1780091965458 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.587000 | 0.591000 | 5910.000000 | 1340.440000 | 3100.502067 | long | 4.409000 | 0.591000 | 30726.910770 | rejected | duration_too_long_for_short_arb | 1779910192559 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.548500 | 0.549000 | 5490.000000 | 1233.430000 | 3129.890067 | long | 4.451000 | 0.549000 | 31914.417377 | rejected | duration_too_long_for_short_arb | 1779804395757 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.490000 | 0.544000 | 5440.000000 | 2214.980000 | n/a | unknown | 2.456000 | 0.544000 | 24282.204450 | rejected | unknown_duration_for_short_arb | 1779910192966 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.491000 | 0.491000 | 4910.000000 | 1956.950000 | n/a | unknown | 2.509000 | 0.491000 | 48625.966734 | rejected | unknown_duration_for_short_arb | 1779800780402 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.497000 | 0.491000 | 4910.000000 | 1956.950000 | n/a | unknown | 2.509000 | 0.491000 | 48625.966734 | rejected | nested_temporal_basket | 1779800711142 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.491000 | 0.490000 | 4900.000000 | 1952.190000 | n/a | unknown | 2.510000 | 0.490000 | 50210.505328 | rejected | unknown_duration_for_short_arb | 1779804396138 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.448000 | 0.459000 | 4590.000000 | 1010.790000 | 3130.894456 | long | 4.541000 | 0.459000 | 24691.481623 | rejected | duration_too_long_for_short_arb | 1779800779959 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.448000 | 0.459000 | 4590.000000 | 1010.790000 | 3130.913687 | long | 4.541000 | 0.459000 | 24695.998763 | rejected | multi_winner_or_qualifier_basket | 1779800710726 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.361000 | 0.361000 | 3610.000000 | 2202.560000 | n/a |  | 1.639000 | 0.361000 | 130123.272774 | paper_fired | paper_trade_recorded | 1779548899250 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.072000 | 0.352000 | 3520.000000 | 2135.920000 | n/a | unknown | 1.648000 | 0.352000 | 114447.698041 | rejected | unknown_duration_for_short_arb | 1779910193074 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.221000 | 0.178000 | 1780.000000 | 465.720000 | n/a | unknown | 3.822000 | 0.178000 | 43844.541450 | rejected | unknown_duration_for_short_arb | 1780091966027 |

## Validation Warning

WARNING: 147 paper trade(s) do not have a recorded opportunity validation link. Treat them as legacy or non-graduation data.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
