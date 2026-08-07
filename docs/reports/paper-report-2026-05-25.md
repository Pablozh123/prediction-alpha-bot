# Paper Run Report - 2026-05-25

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-24.db`

## Summary

- Scan cycles total: 2880
- Successful scan cycles: 2880
- Failed scan cycles: 0
- Dedupe skips: 10375
- Legacy duplicate rejected rows: 0
- Average raw_edge: -0.001418
- Average executable_edge: -0.015790
- Average fillable_usd: 424208.166350
- Average min_leg_depth_usd: 211848.887449
- Average fee_adjusted_edge: -0.015790
- Average edge_bps: 4010.590909
- Average roi_bps: 1251.676818
- Average max_positive_basket_cost_usd: 54066.598136
- Paper trades without validation link: 0

## Raw Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_yes_no_arb | 1325250 |
| neg_risk_bracket_arb | 11180 |

## Validated Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 22 |

## Rejected Opportunities By Strategy

| Strategy | Count |
| --- | ---: |
| within_market_yes_no_arb | 144000 |
| neg_risk_bracket_arb | 783 |

## Rejection Reasons

| Reason | Count |
| --- | ---: |
| non_positive_executable_edge | 144783 |

## Paper Trades By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 96 |

## Scanner Runs By Strategy

| Strategy | Count |
| --- | ---: |
| neg_risk_bracket_arb | 2880 |
| within_market_yes_no_arb | 2880 |

## Top 20 Opportunities By Executable Edge

| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Basket Shares | Basket Cost | Basket Profit | Max Positive Shares | Max Positive Cost | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 3.072000 | 3.072000 | 30720.000000 | 7820.770000 | 1.000000 | 3.928000 | 3.072000 | 72095.880000 | 385827.987440 | paper_fired | paper_trade_recorded | 1779650105925 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.597000 | 0.597000 | 5970.000000 | 1355.890000 | 1.000000 | 4.403000 | 0.597000 | 7055.755042 | 35278.775208 | paper_fired | paper_trade_recorded | 1779697178848 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.581000 | 0.597000 | 5970.000000 | 1355.890000 | 1.000000 | 4.403000 | 0.597000 | 5653.799547 | 28268.997737 | paper_fired | paper_trade_recorded | 1779675577269 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.581000 | 0.581000 | 5810.000000 | 1314.780000 | 1.000000 | 4.419000 | 0.581000 | 7956.340718 | 39781.703591 | paper_fired | paper_trade_recorded | 1779653976230 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.581000 | 0.581000 | 5810.000000 | 1314.780000 | 1.000000 | 4.419000 | 0.581000 | 7956.340718 | 39781.703591 | paper_fired | paper_trade_recorded | 1779653946408 |
| neg_risk_bracket_arb | which-candidates-will-advance-to-brazils-presidential-runoff | 0.597000 | 0.527000 | 5270.000000 | 1178.180000 | 1.000000 | 4.473000 | 0.527000 | 8811.535929 | 44057.679644 | paper_fired | paper_trade_recorded | 1779718782011 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.525000 | 0.525000 | 5250.000000 | 2121.210000 | 1.000000 | 2.475000 | 0.525000 | 14469.973034 | 43409.919101 | paper_fired | paper_trade_recorded | 1779733511106 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.434000 | 0.434000 | 4340.000000 | 1691.350000 | 1.000000 | 2.566000 | 0.434000 | 6319.110000 | 18395.040900 | paper_fired | paper_trade_recorded | 1779671707113 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.423000 | 0.423000 | 4230.000000 | 1641.440000 | 1.000000 | 2.577000 | 0.423000 | 6613.910000 | 19293.928280 | paper_fired | paper_trade_recorded | 1779650106342 |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 0.402000 | 0.402000 | 4020.000000 | 1547.340000 | 1.000000 | 2.598000 | 0.402000 | 5904.100000 | 17067.054160 | paper_fired | paper_trade_recorded | 1779711909862 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.297000 | 0.297000 | 2970.000000 | 1743.980000 | 1.000000 | 1.703000 | 0.297000 | 55845.107499 | 111690.214999 | paper_fired | paper_trade_recorded | 1779671707441 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.291000 | 0.287000 | 2870.000000 | 1675.420000 | 1.000000 | 1.713000 | 0.287000 | 60118.978056 | 120237.956112 | paper_fired | paper_trade_recorded | 1779650106619 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.258000 | 0.258000 | 2580.000000 | 1481.060000 | 1.000000 | 1.742000 | 0.258000 | 59987.563358 | 119975.126716 | paper_fired | paper_trade_recorded | 1779693308797 |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 0.193000 | 0.193000 | 1930.000000 | 1068.070000 | 1.000000 | 1.807000 | 0.193000 | 27530.042264 | 55060.084528 | paper_fired | paper_trade_recorded | 1779714909783 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.012000 | 0.012000 | 120.000000 | 60.360000 | 1.000000 | 1.988000 | 0.012000 | 11037.694386 | 22075.388772 | paper_fired | paper_trade_recorded | 1779715210345 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.012000 | 0.012000 | 120.000000 | 60.360000 | 1.000000 | 1.988000 | 0.012000 | 10840.348262 | 21680.696524 | paper_fired | paper_trade_recorded | 1779693608628 |
| neg_risk_bracket_arb | starmer-out-in-2025 | 0.012000 | 0.012000 | 120.000000 | 60.360000 | 1.000000 | 1.988000 | 0.012000 | 2738.646981 | 5477.293962 | paper_fired | paper_trade_recorded | 1779672007179 |
| neg_risk_bracket_arb | 2026-nba-champion | 0.005000 | 0.005000 | 50.000000 | 16.690000 | 1.000000 | 2.995000 | 0.005000 | 20403.688928 | 61211.066785 | paper_fired | paper_trade_recorded | 1779692108592 |
| neg_risk_bracket_arb | 2026-nhl-stanley-cup-champion | 0.004000 | 0.004000 | 40.000000 | 13.350000 | 1.000000 | 2.996000 | 0.004000 | 25.044067 | 75.132200 | paper_fired | paper_trade_recorded | 1779665706790 |
| neg_risk_bracket_arb | 2026-nba-champion | 0.003000 | 0.003000 | 30.000000 | 10.010000 | 1.000000 | 2.997000 | 0.003000 | 200.000092 | 600.000275 | paper_fired | paper_trade_recorded | 1779668106922 |

## Validation Warning

OK: every paper trade has a recorded opportunity validation link.

## Notes

- PnL is not calculated or inferred in this report.
- Live trading data is not used.
- Secrets and environment variables are not printed.
