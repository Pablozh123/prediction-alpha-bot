# Cross-Venue Arb Report - 2026-06-04

Config: `C:\Users\chole\Projects\prediction-alpha-bot\config\crossVenuePairs.json`
Auto-discover: yes
Pairs scanned: 0
Minimum net edge: 0.50 cents
Fees: Kalshi 0.00c / Polymarket 0.00c
Dry run: yes
Dashboard: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-dashboard-2026-06-04.html`
JSON: `C:\Users\chole\Projects\prediction-alpha-bot\docs\reports\cross-venue-arb-2026-06-04.json`

## Summary

- Cross-venue arbs: 0
- Price spreads: 0
- Rejected pairs: 0
- Execution: paper-only diagnostics; no orders.

## Discovery Diagnostics

- Kalshi markets read: 200
- Polymarket binary markets read: 1149
- Matched pairs above threshold: 0

| Kalshi | Polymarket | Score | Status | Shared Tokens |
| --- | --- | ---: | --- | --- |
| KXMVECROSSCATEGORY-S2026A49CE64607B-9546DB221B8 | will-the-new-york-knicks-win-the-2026-nba-finals | 0.272 | compound_kalshi_market | shared=new,york,win |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026619EC2A0206-9546DB221B8 | will-the-new-york-knicks-win-the-2026-nba-finals | 0.272 | compound_kalshi_market | shared=new,york,win |
| KXMVESPORTSMULTIGAMEEXTENDED-S202669A1E64F661-DA7843A8EB7 | will-the-new-york-knicks-win-the-2026-nba-finals | 0.272 | compound_kalshi_market | shared=new,york,win |
| KXMVESPORTSMULTIGAMEEXTENDED-S20262792937A69E-336AC46705A | will-the-new-york-knicks-win-the-2026-nba-finals | 0.265 | compound_kalshi_market | shared=win,new,york |
| KXMVESPORTSMULTIGAMEEXTENDED-S202692764951949-798EA8F3C10 | will-the-los-angeles-clippers-win-the-2026-nba-finals | 0.265 | compound_kalshi_market | shared=los,angeles,win |
| KXMVESPORTSMULTIGAMEEXTENDED-S202692764951949-798EA8F3C10 | will-the-los-angeles-lakers-win-the-2026-nba-finals | 0.265 | compound_kalshi_market | shared=los,angeles,win |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026D82E0658CD6-AC1957B479E | will-the-los-angeles-clippers-win-the-2026-nba-finals | 0.265 | compound_kalshi_market | shared=los,angeles,win |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026D82E0658CD6-AC1957B479E | will-the-los-angeles-lakers-win-the-2026-nba-finals | 0.265 | compound_kalshi_market | shared=los,angeles,win |
| KXMVESPORTSMULTIGAMEEXTENDED-S20264955A6479D2-975C45A78BB | will-the-new-york-knicks-win-the-2026-nba-finals | 0.258 | compound_kalshi_market | shared=win,new,york |
| KXMVESPORTSMULTIGAMEEXTENDED-S2026AD849F142E8-DA70063F6BB | will-the-new-york-knicks-win-the-2026-nba-finals | 0.258 | compound_kalshi_market | shared=win,new,york |

## Matched Pairs

_None_

## Arbitrage Opportunities

_None_

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
