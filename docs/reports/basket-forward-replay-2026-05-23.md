# Basket Forward Replay - 2026-05-29

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-23.db`
Mode: linked
Max snapshot staleness: 600000 ms

## Summary

- Rows: 4
- Replayed: 4
- Skipped: 0
- Linked rows: 4
- Unlinked experimental rows: 0

## Basket Replay Rows

| Mode | Status | Event/Slug | Legs | Entry | Edge bps | ROI bps | Cost | Profit | Max Positive Shares | Max Positive Cost | Latest Bid Exit | Latest Bid PnL | Reason |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| linked | replayed | what-will-happen-before-gta-vi | 8 | 2026-05-23T15:46:33.123Z | 30910.000000 | 7907.390000 | 3.909000 | 3.091000 | 67049.840000 | 354225.598570 | n/a | n/a | linked_replay |
| linked | replayed | will-russia-capture-kostyantynivka-by | 4 | 2026-05-23T15:46:33.639Z | 4940.000000 | 1971.270000 | 2.506000 | 0.494000 | 10670.342588 | 32011.027763 | n/a | n/a | linked_replay |
| linked | replayed | microstrategy-sell-any-bitcoin-in-2025 | 3 | 2026-05-23T15:46:33.833Z | 3710.000000 | 2277.470000 | 1.629000 | 0.371000 | 64273.471246 | 128546.942492 | 1.608000 | -0.021000 | linked_replay |
| linked | replayed | starmer-out-in-2025 | 3 | 2026-05-23T15:46:34.051Z | 410.000000 | 209.290000 | 1.959000 | 0.041000 | 36406.589293 | 72813.178587 | n/a | n/a | linked_replay |

## Interpretation

- Formation metrics are calculated from ask-side basket construction.
- Liquidation metrics are calculated from later bid-side exits.
- Unlinked rows are experimental and may have incomplete basket coverage.
- This report does not infer market resolution, win rate, or final PnL.

## Safety Notes

- Read-only local SQLite replay.
- No live trading, no orders, no private keys, no secrets.
