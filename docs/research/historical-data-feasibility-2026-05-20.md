# Historical Data Feasibility - 2026-05-20

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`
Network checks: online

## Verdict

- True historical orderbook backtest: not_ready
- Historical trade-print proxy backtest: not_ready
- Forward orderbook replay from local snapshots: ready_to_collect

## Local Data State

- DB exists: true
- Opportunities: 305
- Paper trades: 147
- Paper trades without opportunity link: 147
- Opportunity leg rows: 0
- Orderbook snapshot table: true
- Orderbook snapshots: 12
- Sample token available for current-book smoke test: true

## Source Matrix

| Source | Status | Backtest Use | Evidence | Limitation |
| --- | --- | --- | --- | --- |
| Polygon blockchain / settlement data | partial | Resolution and executed-trade verification. | On-chain data can show fills, transfers, balances, and resolution/settlement. | Resting CLOB bids/asks that never filled are off-chain and cannot be reconstructed from chain state alone. |
| Local orderbook_snapshots | available | Forward replay after snapshot collection starts. | 12 snapshot row(s) found. | Snapshots only cover time after the collector is enabled; they do not backfill old books. |
| Local paper journal | partial | Local scanner behavior and legacy diagnostics. | 147 paper trade(s), 147 without opportunity link. | Unlinked paper trades cannot prove a validated executable opportunity. |
| Gamma metadata API | available | Market discovery and token metadata. | 1 active event(s) returned in smoke test. | Useful for market metadata; not a historical orderbook archive. |
| Polymarket Data API activity | skipped | Historical trade-print proxy research. | No public proxy address supplied via --address or POLYMARKET_RESEARCH_ADDRESS. | Activity is wallet-scoped; it does not expose full historical orderbook depth. |
| Current CLOB orderbook endpoint | available | Current and forward paper validation. | 38 bid level(s), 50 ask level(s), bestBid=0.22, bestAsk=0.221. | The endpoint returns current depth, not historical snapshots. |

## Interpretation

- Blockchain and trade activity can support historical trade-print research, but they do not reconstruct resting orderbook depth.
- A true replay requires timestamped bid/ask snapshots captured at decision time or a trusted historical orderbook archive.
- Current CLOB orderbook reads are useful for forward paper validation, not for old timestamps.
- Existing legacy paper rows without `opportunity_id` remain diagnostic only.

## Recommended Next Step

Build and run a forward snapshot collector that records current orderbooks for scanner candidate tokens into `orderbook_snapshots`, then evaluate only data collected after that collector starts.

## Safety Notes

- This report is read-only against Polymarket APIs.
- No orders are placed or simulated as fills without stored depth.
- No private keys, seed phrases, API secrets, or environment values are printed.
