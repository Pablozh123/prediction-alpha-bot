# Paper Run Report - 2026-05-30

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-30.db`

## Summary

- Scan cycles total: 4919
- Successful scan cycles: 4915
- Failed scan cycles: 4
- Dedupe skips: 0
- Legacy duplicate rejected rows: 0
- Average raw_edge: 0.093028
- Average executable_edge: 0.087250
- Average fillable_usd: 390218.419879
- Average min_leg_depth_usd: 187500.200808
- Average fee_adjusted_edge: 0.087250
- Average edge_bps: 10257.727793
- Average roi_bps: 3607.308848
- Average max_positive_basket_cost_usd: 132817.843286
- Paper trades without validation link: 0

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_fast_arb | 2305183 |
| neg_risk_bracket_arb | 25398 |
| clear_win_watch | 3413 |

## Validated Opportunities By Strategy

_None_

## Rejected Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_fast_arb | 245827 |
| neg_risk_bracket_arb | 25427 |
| clear_win_watch | 3413 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 241733 |
| duration_too_long_for_short_arb | 24835 |
| partial_basket_invalid | 4356 |
| near_resolution_watch | 3413 |
| unknown_duration_for_short_arb | 330 |

## Paper Trades By Strategy

_None_

## Scanner Runs By Strategy

| Strategy | Count |
| --- | ---: |
| clear_win_watch | 4915 |
| neg_risk_bracket_arb | 4915 |
| within_market_fast_arb | 4915 |

## Duration Breakdown

| Capital Lock | Status | Count |
| --- | --- | ---: |
| long | raw_found | 4 |
| long | rejected | 153280 |
| short | raw_found | 1 |
| short | rejected | 52388 |
| unknown | raw_found | 1 |
| unknown | rejected | 68999 |

## Clean Short Arbs

_None_

## Long-Duration Watch

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | 2026-nba-champion | 0.002000 | 0.003000 | 30.000000 | 15.020000 | 744.014881 | long | 1.997000 | 0.003000 | 590.181988 | rejected | duration_too_long_for_short_arb | 1780185546430 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.200000 | 0.200000 | 2000.000000 | 526.320000 | 5148.014922 | long | 3.800000 | 0.200000 | 89203.728389 | rejected | duration_too_long_for_short_arb | 1780185546281 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.627000 | 0.626000 | 6260.000000 | 2636.900000 | 5148.014952 | long | 2.374000 | 0.626000 | 10490.816800 | rejected | duration_too_long_for_short_arb | 1780185546174 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.767000 | 0.767000 | 7670.000000 | 6220.600000 | 5165.014983 | long | 1.233000 | 0.767000 | 187476.127290 | rejected | duration_too_long_for_short_arb | 1780185546062 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.002000 | 3.002000 | 30020.000000 | 7508.750000 | 1476.015042 | long | 3.998000 | 3.002000 | 391940.886840 | rejected | duration_too_long_for_short_arb | 1780185545850 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.599500 | 0.610000 | 6100.000000 | 1389.520000 | 3024.015154 | long | 4.390000 | 0.610000 | 30382.742513 | rejected | duration_too_long_for_short_arb | 1780185545446 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.200000 | 0.200000 | 2000.000000 | 526.320000 | 5148.027447 | long | 3.800000 | 0.200000 | 87724.575389 | rejected | duration_too_long_for_short_arb | 1780185501190 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.633000 | 0.626000 | 6260.000000 | 2636.900000 | 5148.027476 | long | 2.374000 | 0.626000 | 16130.093890 | rejected | duration_too_long_for_short_arb | 1780185501085 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.767000 | 0.767000 | 7670.000000 | 6220.600000 | 5165.027498 | long | 1.233000 | 0.767000 | 187678.938730 | rejected | duration_too_long_for_short_arb | 1780185501007 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.002000 | 3.002000 | 30020.000000 | 7508.750000 | 1476.027998 | long | 3.998000 | 3.002000 | 391503.812440 | rejected | duration_too_long_for_short_arb | 1780185499208 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.599500 | 0.610000 | 6100.000000 | 1389.520000 | 3024.028047 | long | 4.390000 | 0.610000 | 30519.120853 | rejected | duration_too_long_for_short_arb | 1780185499032 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.200000 | 0.200000 | 2000.000000 | 526.320000 | 5148.038677 | long | 3.800000 | 0.200000 | 88446.314502 | rejected | duration_too_long_for_short_arb | 1780185460761 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.633000 | 0.633000 | 6330.000000 | 2674.270000 | 5148.038705 | long | 2.367000 | 0.633000 | 16185.533890 | rejected | duration_too_long_for_short_arb | 1780185460661 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.767000 | 0.767000 | 7670.000000 | 6220.600000 | 5165.038729 | long | 1.233000 | 0.767000 | 186645.429350 | rejected | duration_too_long_for_short_arb | 1780185460576 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.002000 | 3.002000 | 30020.000000 | 7508.750000 | 1476.038788 | long | 3.998000 | 3.002000 | 391946.754200 | rejected | duration_too_long_for_short_arb | 1780185460362 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.599500 | 0.610000 | 6100.000000 | 1389.520000 | 3024.038834 | long | 4.390000 | 0.610000 | 30510.713379 | rejected | duration_too_long_for_short_arb | 1780185460199 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.200000 | 0.200000 | 2000.000000 | 526.320000 | 5148.049104 | long | 3.800000 | 0.200000 | 87767.006761 | rejected | duration_too_long_for_short_arb | 1780185423227 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.632000 | 0.633000 | 6330.000000 | 2674.270000 | 5148.049130 | long | 2.367000 | 0.633000 | 16184.333890 | rejected | duration_too_long_for_short_arb | 1780185423132 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.767000 | 0.767000 | 7670.000000 | 6220.600000 | 5165.049492 | long | 1.233000 | 0.767000 | 187267.500470 | rejected | duration_too_long_for_short_arb | 1780185421830 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.002000 | 3.002000 | 30020.000000 | 7508.750000 | 1476.049547 | long | 3.998000 | 3.002000 | 392805.668620 | rejected | duration_too_long_for_short_arb | 1780185421630 |

## Near-Resolution Watch

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| clear_win_watch | will-any-presidential-candidate-win-outright-in-the-first-round-of-the-colombias-election | n/a | n/a | n/a | n/a | 14.015431 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185545437 |
| clear_win_watch | will-russia-capture-kostyantynivka-by-may-31 | n/a | n/a | n/a | n/a | 12.015431 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185545432 |
| clear_win_watch | will-russia-capture-lyman-by-may-31-2026 | n/a | n/a | n/a | n/a | 23.932098 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185545112 |
| clear_win_watch | will-any-presidential-candidate-win-outright-in-the-first-round-of-the-colombias-election | n/a | n/a | n/a | n/a | 14.028119 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185499026 |
| clear_win_watch | will-russia-capture-kostyantynivka-by-may-31 | n/a | n/a | n/a | n/a | 12.028119 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185499020 |
| clear_win_watch | will-russia-capture-lyman-by-may-31-2026 | n/a | n/a | n/a | n/a | 23.944786 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185499013 |
| clear_win_watch | will-any-presidential-candidate-win-outright-in-the-first-round-of-the-colombias-election | n/a | n/a | n/a | n/a | 14.038915 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185460194 |
| clear_win_watch | will-russia-capture-kostyantynivka-by-may-31 | n/a | n/a | n/a | n/a | 12.038915 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185460187 |
| clear_win_watch | will-russia-capture-lyman-by-may-31-2026 | n/a | n/a | n/a | n/a | 23.955582 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185460180 |
| clear_win_watch | will-any-presidential-candidate-win-outright-in-the-first-round-of-the-colombias-election | n/a | n/a | n/a | n/a | 14.049671 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185421469 |
| clear_win_watch | will-russia-capture-kostyantynivka-by-may-31 | n/a | n/a | n/a | n/a | 12.049671 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185421464 |
| clear_win_watch | will-russia-capture-lyman-by-may-31-2026 | n/a | n/a | n/a | n/a | 23.966338 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185421458 |
| clear_win_watch | will-any-presidential-candidate-win-outright-in-the-first-round-of-the-colombias-election | n/a | n/a | n/a | n/a | 14.060381 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185382892 |
| clear_win_watch | will-russia-capture-kostyantynivka-by-may-31 | n/a | n/a | n/a | n/a | 12.060381 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185382887 |
| clear_win_watch | will-russia-capture-lyman-by-may-31-2026 | n/a | n/a | n/a | n/a | 23.977047 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185382880 |
| clear_win_watch | will-any-presidential-candidate-win-outright-in-the-first-round-of-the-colombias-election | n/a | n/a | n/a | n/a | 14.071085 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185344331 |
| clear_win_watch | will-russia-capture-kostyantynivka-by-may-31 | n/a | n/a | n/a | n/a | 12.071085 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185344325 |
| clear_win_watch | will-russia-capture-lyman-by-may-31-2026 | n/a | n/a | n/a | n/a | 23.987751 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185344319 |
| clear_win_watch | will-any-presidential-candidate-win-outright-in-the-first-round-of-the-colombias-election | n/a | n/a | n/a | n/a | 14.081998 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185305546 |
| clear_win_watch | will-russia-capture-kostyantynivka-by-may-31 | n/a | n/a | n/a | n/a | 12.081998 | short | n/a | n/a | n/a | rejected | near_resolution_watch | 1780185305540 |

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1490.976937 | long | 3.978000 | 3.022000 | 338554.518420 | rejected | duration_too_long_for_short_arb | 1780131683027 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1490.982916 | long | 3.978000 | 3.022000 | 338429.394820 | rejected | duration_too_long_for_short_arb | 1780131661502 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.012000 | 3.022000 | 30220.000000 | 7596.780000 | 1490.985271 | long | 3.978000 | 3.022000 | 338345.394820 | rejected | duration_too_long_for_short_arb | 1780131653025 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.399834 | long | 3.978000 | 3.022000 | 349062.621560 | rejected | duration_too_long_for_short_arb | 1780112160596 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.402630 | long | 3.978000 | 3.022000 | 349248.710060 | rejected | duration_too_long_for_short_arb | 1780112150531 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.405372 | long | 3.978000 | 3.022000 | 349387.258260 | rejected | duration_too_long_for_short_arb | 1780112140662 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.408153 | long | 3.978000 | 3.022000 | 349388.348260 | rejected | duration_too_long_for_short_arb | 1780112130648 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.410997 | long | 3.978000 | 3.022000 | 349642.662660 | rejected | duration_too_long_for_short_arb | 1780112120410 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.413712 | long | 3.978000 | 3.022000 | 349539.532660 | rejected | duration_too_long_for_short_arb | 1780112110636 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.416526 | long | 3.978000 | 3.022000 | 349616.032660 | rejected | duration_too_long_for_short_arb | 1780112100505 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.419318 | long | 3.978000 | 3.022000 | 349760.012960 | rejected | duration_too_long_for_short_arb | 1780112090457 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.422063 | long | 3.978000 | 3.022000 | 349629.410960 | rejected | duration_too_long_for_short_arb | 1780112080573 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.424862 | long | 3.978000 | 3.022000 | 349551.129460 | rejected | duration_too_long_for_short_arb | 1780112070498 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.427577 | long | 3.978000 | 3.022000 | 349559.659660 | rejected | duration_too_long_for_short_arb | 1780112060722 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.430393 | long | 3.978000 | 3.022000 | 349596.700960 | rejected | duration_too_long_for_short_arb | 1780112050585 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.433199 | long | 3.978000 | 3.022000 | 349747.563860 | rejected | duration_too_long_for_short_arb | 1780112040484 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.436006 | long | 3.978000 | 3.022000 | 349630.224160 | rejected | duration_too_long_for_short_arb | 1780112030377 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.438731 | long | 3.978000 | 3.022000 | 349563.284160 | rejected | duration_too_long_for_short_arb | 1780112020568 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.441565 | long | 3.978000 | 3.022000 | 349689.878560 | rejected | duration_too_long_for_short_arb | 1780112010367 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.022000 | 3.022000 | 30220.000000 | 7596.780000 | 1496.444330 | long | 3.978000 | 3.022000 | 348004.318060 | rejected | duration_too_long_for_short_arb | 1780112000413 |

## Validation Warning

OK: every paper trade has a recorded opportunity validation link.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
