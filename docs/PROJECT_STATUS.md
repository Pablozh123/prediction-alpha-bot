# Project Status

Date: 2026-05-19

## Current State

The project is a paper-only TypeScript/Node.js prediction-market scanner skeleton. It has a local SQLite journal, a central `executeOrPaper` execution boundary, a one-shot and interval main loop, read-only Polymarket data clients, reconciliation scaffolding, health/metrics endpoints, tests, linting, and GitHub Actions CI.

Live trading is currently impossible. There are no order clients, no CLOB SDK imports, no wallet/signing code, and no private-key handling in executable code.

## Implemented Scanners

- `NEG_RISK Bracket Sum-Arb`
  - Reads NEG_RISK Gamma event data through a read-only client.
  - Produces opportunities when summed YES prices exceed the configured threshold.
  - Skips malformed events and exact 0/1 prices.
  - Main loop currently runs this scanner.
  - Paper fires flow through `executeOrPaper` and are deduped by opportunity key.

- `Within-Market YES+NO<1`
  - Pure scanner over provided market data.
  - Uses default threshold `0.98` for conservative fee/slippage margin.
  - Produces paper opportunities only.
  - Provides a helper to paper both YES and NO legs through `executeOrPaper`.
  - Not yet wired to a real data source or the main loop.

## Current npm Scripts

- `npm run dev`: start the interval bot loop.
- `npm run dev:once`: run one scan cycle and exit.
- `npm run metrics:dev`: start the bot with local `/health` and `/metrics`.
- `npm run db:inspect`: inspect local SQLite paper/live journal status.
- `npm run reconcile:once`: run reconciliation skeleton once; skips without address.
- `npm run build`: compile TypeScript.
- `npm run typecheck`: run `tsc --noEmit`.
- `npm test`: run Vitest.
- `npm run lint`: run ESLint.

## Safety Status

- `.env` is ignored and not committed.
- `logs/trades.db` is ignored and not committed.
- `node_modules/`, `dist/`, logs, DB journals, `.npmrc`, and key files are ignored.
- `executeOrPaper` always writes paper trades and returns `live=false`.
- Live requests are rejected with `live_not_implemented`.
- Paper dedupe is implemented with `paper_fire_dedup`.
- Paper PnL is not invented; paper rows stay unresolved with `pnl=null`.
- Reconciliation only reads Data API and marks suspect live rows missing `actual_fill_price`.
- CI runs only install, typecheck, tests, and lint. It does not run live scans or external API calls.

## Known Risks

- The NEG_RISK scanner still uses Gamma metadata, not executable orderbook depth. Its opportunities must remain `needs_orderbook_depth_check`.
- The Within-Market scanner currently accepts mock/provided data only. A real data adapter must be added carefully later.
- The local ignored DB contains old dry-run paper rows from earlier scanner behavior; it is disposable local data and not committed.
- No resolved-market or PnL ground-truth reconciliation exists yet.
- Imported playbook docs contain future live-trading examples. Project rules forbid copying those examples into executable code without an explicit later request.
- Health/metrics bind to `127.0.0.1:9090`; a local port conflict would need operator action.

## Next Recommended Steps

- Add a real read-only market-data adapter for within-market YES/NO asks.
- Add orderbook-depth checks before any scanner candidate is treated as actionable paper fire.
- Add a reset/maintenance script for ignored local paper DB data.
- Add reconciliation reports that still avoid invented PnL.
- Consider wiring the within-market scanner into `runScanCycle` after it has a safe read-only data source and dedupe key.

## Final Statement

Live trading is currently impossible.
