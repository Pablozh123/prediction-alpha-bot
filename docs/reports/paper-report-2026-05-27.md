# Paper Run Report - 2026-05-27

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-27.db`

## Summary

- Scan cycles total: 944
- Successful scan cycles: 936
- Failed scan cycles: 8
- Dedupe skips: 0
- Legacy duplicate rejected rows: 0
- Average raw_edge: 0.083315
- Average executable_edge: 0.077443
- Average fillable_usd: 409812.072883
- Average min_leg_depth_usd: 193493.167557
- Average fee_adjusted_edge: 0.077443
- Average edge_bps: 8009.908260
- Average roi_bps: 2438.882460
- Average max_positive_basket_cost_usd: 127678.195473
- Paper trades without validation link: 0

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_fast_arb | 436176 |
| neg_risk_bracket_arb | 6061 |
| clear_win_watch | 0 |

## Validated Opportunities By Strategy

_None_

## Rejected Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_fast_arb | 46914 |
| neg_risk_bracket_arb | 6093 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 46405 |
| unknown_duration_for_short_arb | 4485 |
| duration_too_long_for_short_arb | 943 |
| partial_basket_invalid | 936 |
| insufficient_clean_edge | 238 |

## Paper Trades By Strategy

_None_

## Scanner Runs By Strategy

| Strategy | Count |
| --- | ---: |
| clear_win_watch | 936 |
| neg_risk_bracket_arb | 936 |
| within_market_fast_arb | 936 |

## Duration Breakdown

| Capital Lock | Status | Count |
| --- | --- | ---: |
| long | rejected | 12982 |
| medium | rejected | 1424 |
| short | raw_found | 2 |
| short | rejected | 2460 |
| unknown | raw_found | 7 |
| unknown | rejected | 36141 |

## Clean Short Arbs

_None_

## Long-Duration Watch

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.201000 | 0.201000 | 2010.000000 | 529.090000 | n/a | unknown | 3.799000 | 0.201000 | 48789.361367 | rejected | unknown_duration_for_short_arb | 1779922091193 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.444000 | 0.444000 | 4440.000000 | 2853.470000 | n/a | unknown | 1.556000 | 0.444000 | 153515.173075 | rejected | unknown_duration_for_short_arb | 1779922091098 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.548000 | 0.548000 | 5480.000000 | 2234.910000 | n/a | unknown | 2.452000 | 0.548000 | 23937.508190 | rejected | unknown_duration_for_short_arb | 1779922090989 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.032000 | 3.032000 | 30320.000000 | 7641.130000 | n/a | unknown | 3.968000 | 3.032000 | 508466.084630 | rejected | unknown_duration_for_short_arb | 1779922090791 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.588000 | 0.593000 | 5930.000000 | 1345.590000 | 3097.197231 | long | 4.407000 | 0.593000 | 30843.433958 | rejected | duration_too_long_for_short_arb | 1779922089967 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.201000 | 0.201000 | 2010.000000 | 529.090000 | n/a | unknown | 3.799000 | 0.201000 | 48789.361367 | rejected | unknown_duration_for_short_arb | 1779922077940 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.444000 | 0.444000 | 4440.000000 | 2853.470000 | n/a | unknown | 1.556000 | 0.444000 | 156086.026949 | rejected | unknown_duration_for_short_arb | 1779922077860 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.548000 | 0.548000 | 5480.000000 | 2234.910000 | n/a | unknown | 2.452000 | 0.548000 | 23937.508190 | rejected | unknown_duration_for_short_arb | 1779922077751 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.032000 | 3.032000 | 30320.000000 | 7641.130000 | n/a | unknown | 3.968000 | 3.032000 | 508610.985930 | rejected | unknown_duration_for_short_arb | 1779922077529 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.588000 | 0.593000 | 5930.000000 | 1345.590000 | 3097.200734 | long | 4.407000 | 0.593000 | 30843.433958 | rejected | duration_too_long_for_short_arb | 1779922077359 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.201000 | 0.201000 | 2010.000000 | 529.090000 | n/a | unknown | 3.799000 | 0.201000 | 50585.338307 | rejected | unknown_duration_for_short_arb | 1779922067947 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.444000 | 0.444000 | 4440.000000 | 2853.470000 | n/a | unknown | 1.556000 | 0.444000 | 156064.118312 | rejected | unknown_duration_for_short_arb | 1779922067864 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.548000 | 0.548000 | 5480.000000 | 2234.910000 | n/a | unknown | 2.452000 | 0.548000 | 23937.508190 | rejected | unknown_duration_for_short_arb | 1779922067768 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.032000 | 3.032000 | 30320.000000 | 7641.130000 | n/a | unknown | 3.968000 | 3.032000 | 508573.698530 | rejected | unknown_duration_for_short_arb | 1779922067568 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.588000 | 0.593000 | 5930.000000 | 1345.590000 | 3097.203499 | long | 4.407000 | 0.593000 | 30843.433958 | rejected | duration_too_long_for_short_arb | 1779922067404 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.201000 | 0.201000 | 2010.000000 | 529.090000 | n/a | unknown | 3.799000 | 0.201000 | 50503.104022 | rejected | unknown_duration_for_short_arb | 1779922058167 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.444000 | 0.444000 | 4440.000000 | 2853.470000 | n/a | unknown | 1.556000 | 0.444000 | 156831.041385 | rejected | unknown_duration_for_short_arb | 1779922058079 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.548000 | 0.548000 | 5480.000000 | 2234.910000 | n/a | unknown | 2.452000 | 0.548000 | 23937.508190 | rejected | unknown_duration_for_short_arb | 1779922057977 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.032000 | 3.032000 | 30320.000000 | 7641.130000 | n/a | unknown | 3.968000 | 3.032000 | 509297.073230 | rejected | unknown_duration_for_short_arb | 1779922057793 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.588000 | 0.593000 | 5930.000000 | 1345.590000 | 3097.206216 | long | 4.407000 | 0.593000 | 30843.433958 | rejected | duration_too_long_for_short_arb | 1779922057624 |

## Near-Resolution Watch

_None_

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510331.498810 | rejected | unknown_duration_for_short_arb | 1779915808351 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 509237.239200 | rejected | unknown_duration_for_short_arb | 1779915788204 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510549.377800 | rejected | unknown_duration_for_short_arb | 1779915778161 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510535.784300 | rejected | unknown_duration_for_short_arb | 1779915768219 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510558.446100 | rejected | unknown_duration_for_short_arb | 1779915758136 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510623.220700 | rejected | unknown_duration_for_short_arb | 1779915748143 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510853.255100 | rejected | unknown_duration_for_short_arb | 1779915738360 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510858.864300 | rejected | unknown_duration_for_short_arb | 1779915728192 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510406.144810 | rejected | unknown_duration_for_short_arb | 1779915710616 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510408.854310 | rejected | unknown_duration_for_short_arb | 1779915698032 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510388.488710 | rejected | unknown_duration_for_short_arb | 1779915688033 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 509313.365600 | rejected | unknown_duration_for_short_arb | 1779915678078 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 507320.218900 | rejected | unknown_duration_for_short_arb | 1779915668098 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 507174.552410 | rejected | unknown_duration_for_short_arb | 1779915658090 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 508333.374410 | rejected | unknown_duration_for_short_arb | 1779915648011 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510519.568420 | rejected | unknown_duration_for_short_arb | 1779915638169 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510340.705880 | rejected | unknown_duration_for_short_arb | 1779915628600 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510556.136920 | rejected | unknown_duration_for_short_arb | 1779915618111 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510096.900110 | rejected | unknown_duration_for_short_arb | 1779915608121 |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.052000 | 3.052000 | 30520.000000 | 7730.500000 | n/a | unknown | 3.948000 | 3.052000 | 510723.477510 | rejected | unknown_duration_for_short_arb | 1779915597966 |

## Validation Warning

OK: every paper trade has a recorded opportunity validation link.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
