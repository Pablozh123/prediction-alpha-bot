# Strategy Evaluation - 2026-05-24

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-23.db`

## A. Run Summary

- Start time: 2026-05-23T15:46:02.977Z
- End time: 2026-05-23T15:48:37.532Z
- Duration hours: 0.0429
- Strategies found: neg_risk_bracket_arb, within_market_yes_no_arb
- Scan cycles: 6

## B. Opportunity Funnel pro Strategie

| Strategy | raw_found | validated | rejected | paper_fired | dedupe_skipped | validated_rate | rejected_rate | paper_fired_rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| within_market_yes_no_arb | 3108 | 0 | 300 | 0 | 0 | 0% | 9.65% | 0% |
| neg_risk_bracket_arb | 20 | 4 | 0 | 4 | 16 | 20% | 0% | 20% |

## C. Rejection Reasons

| Strategy | Reason | Count |
| --- | --- | ---: |
| within_market_yes_no_arb | non_positive_executable_edge | 300 |

## D. Edge Quality

| Strategy | avg raw_edge_bps | median raw_edge_bps | avg executable_edge_bps | median executable_edge_bps | min executable_edge_bps | max executable_edge_bps | fee_adjusted_edge_bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| neg_risk_bracket_arb | 9992.5 | 4325 | 9992.5 | 4325 | 410 | 30910 | 9992.5 |
| within_market_yes_no_arb | -9.5 | 0 | -123.03 | -100 | -700 | -10 | -123.03 |

## E. Capacity / Depth

| Strategy | avg fillable_usd | median fillable_usd | min_leg_depth_usd |
| --- | ---: | ---: | --- |
| neg_risk_bracket_arb | 613730.99 | 283205.39755 | 18845.7396 |
| within_market_yes_no_arb | 428973.38 | 92567.33679999999 | 1445.3878 |

### Top 20 by executable_edge_bps

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30910 | 448817.2208 | 56102.1526 | 8 | 3.909 | 13872940294.93 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:33.123Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4940 | 75382.9584 | 18845.7396 | 4 | 2.506 | 372391814.5 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:33.639Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 3710 | 117593.5743 | 39197.8581 | 3 | 1.629 | 436272160.65 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:33.833Z |
| neg_risk_bracket_arb | starmer-out-in-2025 | 410 | 1813130.2197 | 604376.7399 | 3 | 1.959 | 743383390.08 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:34.051Z |
| within_market_yes_no_arb | will-bitcoin-hit-1m-before-gta-vi-872-424 | -10 | 300946.01524 | 150473.00762 | 2 | 1.001 | -3009460.15 | rejected | non_positive_executable_edge | 2026-05-23T15:48:34.062Z |
| within_market_yes_no_arb | starmer-out-by-may-31-2026 | -10 | 647056.11514 | 323528.05757 | 2 | 1.001 | -6470561.15 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.988Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.900Z |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -10 | 16164.7191 | 8082.35955 | 2 | 1.001 | -161647.19 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.823Z |
| within_market_yes_no_arb | netanyahu-out-by-may-31 | -10 | 725831.062 | 362915.531 | 2 | 1.001 | -7258310.62 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.750Z |
| within_market_yes_no_arb | netanyahu-out-by-june-30-383-244-575 | -10 | 572618.51806 | 286309.25903 | 2 | 1.001 | -5726185.18 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.669Z |
| within_market_yes_no_arb | natoeu-troops-fighting-in-ukraine-in-june-30-2026 | -10 | 220564.52692 | 110282.26346 | 2 | 1.001 | -2205645.27 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.590Z |
| within_market_yes_no_arb | microstrategy-sells-any-bitcoin-by-june-30-2026 | -10 | 192283.032 | 96141.516 | 2 | 1.001 | -1922830.32 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.469Z |
| within_market_yes_no_arb | macron-out-by-june-30-2026-273 | -10 | 228379.91918 | 114189.95959 | 2 | 1.001 | -2283799.19 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.394Z |
| within_market_yes_no_arb | jeffrey-epstein-foul-play-confirmed-by-december-31-2026 | -10 | 174911.36064 | 87455.68032 | 2 | 1.001 | -1749113.61 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.324Z |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -10 | 5248.92582 | 2624.46291 | 2 | 1.001 | -52489.26 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.249Z |
| within_market_yes_no_arb | gta-vi-released-before-june-2026 | -10 | 189446.7636 | 94723.3818 | 2 | 1.001 | -1894467.64 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.159Z |
| within_market_yes_no_arb | will-bitcoin-hit-1m-before-gta-vi-872-424 | -10 | 386678.45776 | 193339.22888 | 2 | 1.001 | -3866784.58 | rejected | non_positive_executable_edge | 2026-05-23T15:48:04.066Z |
| within_market_yes_no_arb | starmer-out-by-may-31-2026 | -10 | 647056.11514 | 323528.05757 | 2 | 1.001 | -6470561.15 | rejected | non_positive_executable_edge | 2026-05-23T15:48:03.984Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:48:03.885Z |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -10 | 16164.7191 | 8082.35955 | 2 | 1.001 | -161647.19 | rejected | non_positive_executable_edge | 2026-05-23T15:48:03.792Z |

### Top 20 by executable_edge_bps * fillable_usd

| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| neg_risk_bracket_arb | what-will-happen-before-gta-vi | 30910 | 448817.2208 | 56102.1526 | 8 | 3.909 | 13872940294.93 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:33.123Z |
| neg_risk_bracket_arb | starmer-out-in-2025 | 410 | 1813130.2197 | 604376.7399 | 3 | 1.959 | 743383390.08 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:34.051Z |
| neg_risk_bracket_arb | microstrategy-sell-any-bitcoin-in-2025 | 3710 | 117593.5743 | 39197.8581 | 3 | 1.629 | 436272160.65 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:33.833Z |
| neg_risk_bracket_arb | will-russia-capture-kostyantynivka-by | 4940 | 75382.9584 | 18845.7396 | 4 | 2.506 | 372391814.5 | paper_fired | paper_trade_recorded | 2026-05-23T15:46:33.639Z |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -10 | 5248.92582 | 2624.46291 | 2 | 1.001 | -52489.26 | rejected | non_positive_executable_edge | 2026-05-23T15:46:05.040Z |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -10 | 5248.92582 | 2624.46291 | 2 | 1.001 | -52489.26 | rejected | non_positive_executable_edge | 2026-05-23T15:46:34.331Z |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -10 | 5248.92582 | 2624.46291 | 2 | 1.001 | -52489.26 | rejected | non_positive_executable_edge | 2026-05-23T15:47:03.220Z |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -10 | 5248.92582 | 2624.46291 | 2 | 1.001 | -52489.26 | rejected | non_positive_executable_edge | 2026-05-23T15:47:33.219Z |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -10 | 5248.92582 | 2624.46291 | 2 | 1.001 | -52489.26 | rejected | non_positive_executable_edge | 2026-05-23T15:48:03.228Z |
| within_market_yes_no_arb | james-collier-announced-as-next-james-bond | -10 | 5248.92582 | 2624.46291 | 2 | 1.001 | -52489.26 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.249Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:46:07.068Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:46:34.932Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:47:03.827Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:47:33.801Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:48:03.885Z |
| within_market_yes_no_arb | placeholder-6-announced-as-next-james-bond-114 | -10 | 15759.20502 | 7879.60251 | 2 | 1.001 | -157592.05 | rejected | non_positive_executable_edge | 2026-05-23T15:48:33.900Z |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -10 | 16164.7191 | 8082.35955 | 2 | 1.001 | -161647.19 | rejected | non_positive_executable_edge | 2026-05-23T15:46:06.751Z |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -10 | 16164.7191 | 8082.35955 | 2 | 1.001 | -161647.19 | rejected | non_positive_executable_edge | 2026-05-23T15:46:34.844Z |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -10 | 16164.7191 | 8082.35955 | 2 | 1.001 | -161647.19 | rejected | non_positive_executable_edge | 2026-05-23T15:47:03.749Z |
| within_market_yes_no_arb | pierce-brosnan-announced-as-next-james-bond-557 | -10 | 16164.7191 | 8082.35955 | 2 | 1.001 | -161647.19 | rejected | non_positive_executable_edge | 2026-05-23T15:47:33.733Z |

## F. Time Analysis

- Opportunities per hour: 7086.25
- Validated per hour: 93.24
- Rejected per hour: 6993.01

## G. Paper Trades

| Strategy | Count | Unresolved | Resolved | Note |
| --- | ---: | ---: | ---: | --- |
| neg_risk_bracket_arb | 18 | 18 | 0 | insufficient resolved sample |
| within_market_yes_no_arb | 0 | 0 | 0 | insufficient resolved sample |

## H. Verdict

| Strategy | Verdict | Reason |
| --- | --- | --- |
| within_market_yes_no_arb | NEEDS_FIX | Raw opportunities exist, but validation, edge, or data quality is not strong enough. |
| neg_risk_bracket_arb | CONTINUE_TESTING | Validated sample has positive executable edge; keep collecting paper data. |

## Data Quality Warnings

_None_

## Safety Notes

- No live trading data is modified.
- No external APIs are called.
- PnL and win-rate are not inferred from unresolved paper trades.
- Secrets and environment variables are not printed.
