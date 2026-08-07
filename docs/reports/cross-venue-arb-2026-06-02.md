# Cross-Venue Arb Report - 2026-06-02

Config: `C:\Users\chole\AppData\Local\Temp\crossvenue-runner-live-feed-id-6KZgBq\crossVenuePairs.json`
Auto-discover: no
Pairs scanned: 1
Minimum net edge: 0.50 cents
Fees: Kalshi 0.00c / Polymarket 0.00c
Dry run: yes
Dashboard: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-dashboard-2026-06-02.html`
JSON: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-arb-2026-06-02.json`

## Summary

- Cross-venue arbs: 1
- Price spreads: 0
- Rejected pairs: 0
- Orderbook reads: 0
- Cache hits: 0 (0 websocket, 0 live-watched, 0 rest-cache)
- REST fetches: 0
- Execution: paper-only diagnostics; no orders.

## Discovery Diagnostics

_Not used._

## Matched Pairs

| Pair | Kalshi | Polymarket | Match | Reason |
| --- | --- | --- | ---: | --- |
| Manual same market | KXCONFIG | poly-config | manual | config |

## Arbitrage Opportunities

| Pair | Outcome | Buy YES | Buy NO | Net cents | ROI bps | Size | Max profit |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Manual same market | YES | kalshi @ 0.4700 | polymarket @ 0.5000 | 3.10 | 319.59 | 10.00 | $0.31 |

## Price Differences

_None_

## Rejected Pairs

_None_

## How This Works

- Same outcome must be explicitly paired between Kalshi and Polymarket.
- Auto-discovered pairs are conservative candidates and should still be reviewed before trusting the economics.
- True arb check: buy YES on one venue and buy NO on the other.
- Gross edge: `1 - YES_ask - NO_ask`.
- Net edge subtracts configured per-contract fee estimates.
- Depth walks both ask ladders together and stops when the next level is no longer positive after fees.
- Price differences are directional signals only; they are not risk-free arbs.

## Safety

- Read-only public market data.
- No live trading.
- No order placement.
- No private keys, wallets, signers, or secrets.
