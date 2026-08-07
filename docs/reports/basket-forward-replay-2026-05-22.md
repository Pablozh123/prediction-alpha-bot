# Basket Forward Replay - 2026-05-22

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`
Mode: linked
Max snapshot staleness: 600000 ms

## Summary

- Rows: 1
- Replayed: 1
- Skipped: 0
- Linked rows: 1
- Unlinked experimental rows: 0

## Basket Replay Rows

| Mode | Status | Event/Slug | Legs | Entry | Edge bps | ROI bps | Cost | Profit | Max Positive Shares | Max Positive Cost | Latest Bid Exit | Latest Bid PnL | Reason |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| linked | replayed | harvey-weinstein-prison-time | 6 | 2026-05-20T16:47:08.775Z | 80.000000 | 16.030000 | 4.992000 | 0.008000 | 69.109022 | 345.545112 | 4.964000 | -0.028000 | linked_replay |

## Interpretation

- Formation metrics are calculated from ask-side basket construction.
- Liquidation metrics are calculated from later bid-side exits.
- Unlinked rows are experimental and may have incomplete basket coverage.
- This report does not infer market resolution, win rate, or final PnL.

## Safety Notes

- Read-only local SQLite replay.
- No live trading, no orders, no private keys, no secrets.
