# Basket Forward Replay - 2026-06-02

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`
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
| linked | replayed | harvey-weinstein-prison-time | 6 | 2026-05-20T16:47:08.775Z | 80.000000 | 16.030000 | 4.992000 | 0.008000 | 69.109022 | 345.545112 | 4.936000 | -0.056000 | linked_replay |
| linked | replayed | what-will-happen-before-gta-vi | 8 | 2026-05-23T15:08:18.897Z | 30710.000000 | 7816.240000 | 3.929000 | 3.071000 | 84788.950000 | 467159.668410 | 3.897000 | -0.032000 | linked_replay |
| linked | replayed | microstrategy-sell-any-bitcoin-in-2025 | 3 | 2026-05-23T15:08:19.250Z | 3610.000000 | 2202.560000 | 1.639000 | 0.361000 | 65061.636387 | 130123.272774 | 1.103000 | -0.536000 | linked_replay |
| linked | replayed | starmer-out-in-2025 | 3 | 2026-05-23T15:08:19.439Z | 400.000000 | 204.080000 | 1.960000 | 0.040000 | 41258.445803 | 82516.891605 | 2.160000 | 0.200000 | linked_replay |

## Interpretation

- Formation metrics are calculated from ask-side basket construction.
- Liquidation metrics are calculated from later bid-side exits.
- Unlinked rows are experimental and may have incomplete basket coverage.
- This report does not infer market resolution, win rate, or final PnL.

## Safety Notes

- Read-only local SQLite replay.
- No live trading, no orders, no private keys, no secrets.
