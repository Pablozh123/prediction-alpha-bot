# NEG_RISK Basket Classification - 2026-05-24

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-24.db`

## Summary

- NEG_RISK opportunities: 805
- NEG_RISK paper-fired baskets: 22
- Risky legacy paper-fired baskets: 22
- Linked NEG_RISK paper trades: 96
- Live trading used: no

## Classes

| Class | Count |
| --- | ---: |
| clean_arb | 0 |
| duration_risk | 513 |
| directional_bucket | 292 |
| invalid_or_ambiguous | 0 |

## Paper-Fired Classes

| Class | Count |
| --- | ---: |
| clean_arb | 0 |
| duration_risk | 4 |
| directional_bucket | 18 |
| invalid_or_ambiguous | 0 |

## Risky Legacy Paper Fires

| Class | Status | Slug | Reason | Why | Edge bps | ROI bps | Max Cost | Paper Legs | Timestamp |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| directional_bucket | paper_fired | what-will-happen-before-gta-vi | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 30720.00 | 7820.77 | 385827.99 | 8 | 1779650105925 |
| directional_bucket | paper_fired | will-russia-capture-kostyantynivka-by | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 4230.00 | 1641.44 | 19293.93 | 4 | 1779650106342 |
| directional_bucket | paper_fired | microstrategy-sell-any-bitcoin-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 2870.00 | 1675.42 | 120237.96 | 3 | 1779650106619 |
| directional_bucket | paper_fired | starmer-out-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 10.00 | 5.00 | 214.24 | 3 | 1779650405983 |
| directional_bucket | paper_fired | which-candidates-will-advance-to-brazils-presidential-runoff | multi_winner_or_qualifier_basket | Qualifier or multi-winner wording means more than one leg can be true. | 5810.00 | 1314.78 | 39781.70 | 6 | 1779653946408 |
| directional_bucket | paper_fired | which-candidates-will-advance-to-brazils-presidential-runoff | multi_winner_or_qualifier_basket | Qualifier or multi-winner wording means more than one leg can be true. | 5810.00 | 1314.78 | 39781.70 | 6 | 1779653976230 |
| duration_risk | paper_fired | 2026-nhl-stanley-cup-champion | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | 40.00 | 13.35 | 75.13 | 4 | 1779665706790 |
| duration_risk | paper_fired | 2026-nba-champion | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | 30.00 | 10.01 | 600.00 | 4 | 1779668106922 |
| directional_bucket | paper_fired | will-russia-capture-kostyantynivka-by | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 4340.00 | 1691.35 | 18395.04 | 4 | 1779671707113 |
| directional_bucket | paper_fired | microstrategy-sell-any-bitcoin-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 2970.00 | 1743.98 | 111690.21 | 3 | 1779671707441 |
| directional_bucket | paper_fired | starmer-out-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 120.00 | 60.36 | 5477.29 | 3 | 1779672007179 |
| directional_bucket | paper_fired | which-candidates-will-advance-to-brazils-presidential-runoff | multi_winner_or_qualifier_basket | Qualifier or multi-winner wording means more than one leg can be true. | 5970.00 | 1355.89 | 28269.00 | 6 | 1779675577269 |
| duration_risk | paper_fired | 2026-nba-champion | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | 50.00 | 16.69 | 61211.07 | 4 | 1779692108592 |
| directional_bucket | paper_fired | microstrategy-sell-any-bitcoin-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 2580.00 | 1481.06 | 119975.13 | 3 | 1779693308797 |
| directional_bucket | paper_fired | starmer-out-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 120.00 | 60.36 | 21680.70 | 3 | 1779693608628 |
| directional_bucket | paper_fired | which-candidates-will-advance-to-brazils-presidential-runoff | multi_winner_or_qualifier_basket | Qualifier or multi-winner wording means more than one leg can be true. | 5970.00 | 1355.89 | 35278.78 | 6 | 1779697178848 |
| duration_risk | paper_fired | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | 3.00 | 0.60 | 5.17 | 6 | 1779703419343 |
| directional_bucket | paper_fired | will-russia-capture-kostyantynivka-by | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 4020.00 | 1547.34 | 17067.05 | 4 | 1779711909862 |
| directional_bucket | paper_fired | microstrategy-sell-any-bitcoin-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 1930.00 | 1068.07 | 55060.08 | 3 | 1779714909783 |
| directional_bucket | paper_fired | starmer-out-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 120.00 | 60.36 | 22075.39 | 3 | 1779715210345 |
| directional_bucket | paper_fired | which-candidates-will-advance-to-brazils-presidential-runoff | multi_winner_or_qualifier_basket | Qualifier or multi-winner wording means more than one leg can be true. | 5270.00 | 1178.18 | 44057.68 | 6 | 1779718782011 |
| directional_bucket | paper_fired | will-russia-capture-kostyantynivka-by | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 5250.00 | 2121.21 | 43409.92 | 4 | 1779733511106 |

## All NEG_RISK Baskets

| Class | Status | Slug | Reason | Why | Edge bps | ROI bps | Max Cost | Paper Legs | Timestamp |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| directional_bucket | paper_fired | will-russia-capture-kostyantynivka-by | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 5250.00 | 2121.21 | 43409.92 | 4 | 1779733511106 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779730091089 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779730090853 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779730061253 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779730061046 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779730031174 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779730030950 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779730001199 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779730000984 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729971130 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729970899 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729941105 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729940886 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729911095 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729910879 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729881043 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729880819 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729851132 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729850912 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729821209 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729821003 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729791150 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729790918 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729761255 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729761042 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729738732 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729738472 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729701158 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729700940 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729670932 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729670718 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729640983 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729640755 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729611089 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729610855 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729581115 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729580874 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729556164 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729555934 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779729530056 |
| duration_risk | rejected | harvey-weinstein-prison-time | unknown_duration_for_short_arb | The basket payoff looks clean, but expected resolution time is missing. | n/a | n/a | n/a | 0 | 1779729529845 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726460921 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726430802 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726400791 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726370810 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726340764 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726310652 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726280696 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726250693 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726220759 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726190930 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726160797 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726131020 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726100800 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726070702 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726040754 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779726010738 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779725980788 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779725950762 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779725920863 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779725890721 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779725861436 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723400535 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723370458 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723340571 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723310749 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723280618 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723250403 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723220698 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723190584 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723160652 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779723130733 |
| directional_bucket | paper_fired | which-candidates-will-advance-to-brazils-presidential-runoff | multi_winner_or_qualifier_basket | Qualifier or multi-winner wording means more than one leg can be true. | 5270.00 | 1178.18 | 44057.68 | 6 | 1779718782011 |
| directional_bucket | paper_fired | starmer-out-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 120.00 | 60.36 | 22075.39 | 3 | 1779715210345 |
| directional_bucket | paper_fired | microstrategy-sell-any-bitcoin-in-2025 | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | 1930.00 | 1068.07 | 55060.08 | 3 | 1779714909783 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779714249854 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779714219754 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779714189850 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779714159896 |
| directional_bucket | rejected | databricks-ipo-closing-market-cap | nested_temporal_basket | Nested date/window wording means the legs are not mutually exclusive clean outcomes. | n/a | n/a | n/a | 0 | 1779714129962 |

## Interpretation

- `clean_arb`: one-winner or clear bucket structure with short-duration timing.
- `duration_risk`: payoff can look clean, but capital lock is unknown or too long.
- `directional_bucket`: nested dates, qualifiers, or multi-winner wording create residual directional risk.
- `invalid_or_ambiguous`: structure, edge, capacity, spread, or metadata is not strong enough.
- This report does not infer PnL, win rate, or resolution truth.

## Safety

- Read-only SQLite analysis.
- No orders, no CLOB client, no wallet, no private keys.
