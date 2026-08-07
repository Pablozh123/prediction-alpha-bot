# Cross-Venue Arb Report - 2026-06-10

Config: `C:\Users\chole\Projects\prediction-alpha-bot\config\crossVenuePairs.json`
Auto-discover: yes
Pairs scanned: 2
Minimum net edge: 0.50 cents
Fees: Kalshi 0.00c / Polymarket 0.00c
Dry run: yes
Dashboard: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-dashboard-2026-06-10.html`
JSON: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-arb-2026-06-10.json`

## Summary

- Cross-venue arbs: 0
- Price spreads: 4
- Rejected pairs: 0
- Orderbook reads: 3
- Cache hits: 0 (0 websocket, 0 live-watched, 0 rest-cache)
- REST fetches: 3
- Execution: paper-only diagnostics; no orders.

## Discovery Diagnostics

- Kalshi markets read: 1000
- Polymarket binary markets read: 2478
- Matched pairs above threshold: 0

| Kalshi | Polymarket | Score | Status | Shared Tokens |
| --- | --- | ---: | --- | --- |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026733F81CC0DB-E4C42B51F1B | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.334 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026733F81CC0DB-E4C42B51F1B | will-candidate-i-win-the-2026-los-angeles-mayoral-election | 0.334 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026733F81CC0DB-E4C42B51F1B | will-candidate-j-win-the-2026-los-angeles-mayoral-election | 0.334 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVECROSSCATEGORY-S202668888621A78-D6E05A3D4D5 | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.329 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVECROSSCATEGORY-S202668888621A78-D6E05A3D4D5 | will-candidate-i-win-the-2026-los-angeles-mayoral-election | 0.329 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVECROSSCATEGORY-S202668888621A78-D6E05A3D4D5 | will-candidate-j-win-the-2026-los-angeles-mayoral-election | 0.329 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVECROSSCATEGORY-S20267F0D982283B-10ABC385903 | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.325 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVECROSSCATEGORY-S20267F0D982283B-10ABC385903 | will-candidate-i-win-the-2026-los-angeles-mayoral-election | 0.325 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVECROSSCATEGORY-S20267F0D982283B-10ABC385903 | will-candidate-j-win-the-2026-los-angeles-mayoral-election | 0.325 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026277CB30DD8F-92695BFEFD0 | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.325 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |

## Matched Pairs

| Pair | Kalshi | Polymarket | Match | Reason |
| --- | --- | --- | ---: | --- |
| Will Trump recognize Somaliland? | KXRECOGSOMALI-29-27 | will-trump-recognize-somaliland-before-2027 | manual | config |
| Trump recognizes Somaliland before 2027 | KXRECOGSOMALI-29-27 | will-trump-recognize-somaliland-before-2027 | manual | config |

## Arbitrage Opportunities

_None_

## Price Differences

| Pair | Outcome | Side | Cheap | Rich | Diff cents |
| --- | --- | --- | --- | --- | ---: |
| Will Trump recognize Somaliland? | Before 2027 | NO | kalshi 0.8500 | polymarket 0.9220 | 7.20 |
| Trump recognizes Somaliland before 2027 | Before 2027 | NO | kalshi 0.8500 | polymarket 0.9220 | 7.20 |
| Will Trump recognize Somaliland? | Before 2027 | YES | polymarket 0.1590 | kalshi 0.2300 | 7.10 |
| Trump recognizes Somaliland before 2027 | Before 2027 | YES | polymarket 0.1590 | kalshi 0.2300 | 7.10 |

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
