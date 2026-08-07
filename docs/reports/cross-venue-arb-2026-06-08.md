# Cross-Venue Arb Report - 2026-06-08

Config: `C:\Users\chole\Projects\prediction-alpha-bot\config\crossVenuePairs.json`
Auto-discover: no
Pairs scanned: 2
Minimum net edge: 0.50 cents
Fees: Kalshi 0.00c / Polymarket 0.00c
Dry run: yes
Dashboard: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-dashboard-2026-06-08.html`
JSON: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-arb-2026-06-08.json`

## Summary

- Cross-venue arbs: 2
- Price spreads: 4
- Rejected pairs: 0
- Orderbook reads: 3
- Cache hits: 2 (2 websocket, 2 live-watched, 0 rest-cache)
- REST fetches: 1
- Execution: paper-only diagnostics; no orders.

## Discovery Diagnostics

_Not used._

## Matched Pairs

| Pair | Kalshi | Polymarket | Match | Reason |
| --- | --- | --- | ---: | --- |
| Will Trump recognize Somaliland? | KXRECOGSOMALI-29-27 | will-trump-recognize-somaliland-before-2027 | manual | config |
| Trump recognizes Somaliland before 2027 | KXRECOGSOMALI-29-27 | will-trump-recognize-somaliland-before-2027 | manual | config |

## Arbitrage Opportunities

| Pair | Outcome | Buy YES | Buy NO | Net cents | ROI bps | Size | Max profit |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Will Trump recognize Somaliland? | Before 2027 | polymarket @ 0.1430 | kalshi @ 0.8400 | 1.70 | 172.94 | 106.00 | $0.71 |
| Trump recognizes Somaliland before 2027 | Before 2027 | polymarket @ 0.1430 | kalshi @ 0.8400 | 1.70 | 172.94 | 106.00 | $0.71 |

## Price Differences

| Pair | Outcome | Side | Cheap | Rich | Diff cents |
| --- | --- | --- | --- | --- | ---: |
| Will Trump recognize Somaliland? | Before 2027 | YES | polymarket 0.1430 | kalshi 0.2200 | 7.70 |
| Trump recognizes Somaliland before 2027 | Before 2027 | YES | polymarket 0.1430 | kalshi 0.2200 | 7.70 |
| Will Trump recognize Somaliland? | Before 2027 | NO | kalshi 0.8400 | polymarket 0.9000 | 6.00 |
| Trump recognizes Somaliland before 2027 | Before 2027 | NO | kalshi 0.8400 | polymarket 0.9000 | 6.00 |

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
