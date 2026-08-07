# Cross-Venue Arb Report - 2026-06-05

Config: `config/crossVenuePairs.json`
Auto-discover: yes
Pairs scanned: 1
Minimum net edge: 0.50 cents
Fees: Kalshi 0.00c / Polymarket 0.00c
Dry run: yes
Dashboard: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-dashboard-2026-06-05.html`
JSON: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-arb-2026-06-05.json`

## Summary

- Cross-venue arbs: 1
- Price spreads: 2
- Rejected pairs: 0
- Execution: paper-only diagnostics; no orders.

## Discovery Diagnostics

- Kalshi markets read: 1000
- Polymarket binary markets read: 2688
- Matched pairs above threshold: 0

| Kalshi | Polymarket | Score | Status | Shared Tokens |
| --- | --- | ---: | --- | --- |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026078E87A6FCA-227CBC2DD37 | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.340 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026078E87A6FCA-227CBC2DD37 | will-candidate-i-win-the-2026-los-angeles-mayoral-election | 0.340 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026078E87A6FCA-227CBC2DD37 | will-candidate-j-win-the-2026-los-angeles-mayoral-election | 0.340 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S20267CE007F5628-647EFBA6EF7 | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.340 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S20267CE007F5628-647EFBA6EF7 | will-candidate-i-win-the-2026-los-angeles-mayoral-election | 0.340 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S20267CE007F5628-647EFBA6EF7 | will-candidate-j-win-the-2026-los-angeles-mayoral-election | 0.340 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026A65E8DF318B-35C114AE635 | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.334 | compound_kalshi_market | shared=win,los,angeles;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026A65E8DF318B-35C114AE635 | will-candidate-i-win-the-2026-los-angeles-mayoral-election | 0.334 | compound_kalshi_market | shared=win,los,angeles;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026A65E8DF318B-35C114AE635 | will-candidate-j-win-the-2026-los-angeles-mayoral-election | 0.334 | compound_kalshi_market | shared=win,los,angeles;anchors=los,angeles |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026BBB298DBD77-1CAAA32BC8D | will-candidate-h-win-the-2026-los-angeles-mayoral-election | 0.334 | compound_kalshi_market | shared=los,angeles,win;anchors=los,angeles |

## Matched Pairs

| Pair | Kalshi | Polymarket | Match | Reason |
| --- | --- | --- | ---: | --- |
| Trump recognizes Somaliland before 2027 | KXRECOGSOMALI-29-27 | will-trump-recognize-somaliland-before-2027 | manual | config |

## Arbitrage Opportunities

| Pair | Outcome | Buy YES | Buy NO | Net cents | ROI bps | Size | Max profit |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Trump recognizes Somaliland before 2027 | Before 2027 | polymarket @ 0.1050 | kalshi @ 0.8300 | 6.50 | 695.19 | 100.00 | $2.90 |

## Price Differences

| Pair | Outcome | Side | Cheap | Rich | Diff cents |
| --- | --- | --- | --- | --- | ---: |
| Trump recognizes Somaliland before 2027 | Before 2027 | YES | polymarket 0.1050 | kalshi 0.2300 | 12.50 |
| Trump recognizes Somaliland before 2027 | Before 2027 | NO | kalshi 0.8300 | polymarket 0.9050 | 7.50 |

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
