# Safety Audit

Date: 2026-05-19

## Checked Risks

- Live-trading paths: searched executable code and tests for CLOB imports, order helpers, wallet/signer use, private-key env names, and real order endpoints.
- Secret exposure: checked committed file list, `.env` ignore behavior, `.env.example`, docs, code, and logs-related paths.
- Data quality: checked paper fire dedupe, cooldown behavior, PnL/resolution writes, and schema guard fields.
- Git hygiene: checked ignore rules for `.env`, logs, database files, `node_modules`, and `dist`.
- Verification: ran typecheck, test suite, one dry-run scan, and DB inspection.

## Result

- Live trading currently impossible.
- No executable code imports `@polymarket/clob-client`.
- No executable code calls `placeOrder`, `postOrder`, `createAndPostOrder`, `buyLimit`, or `sellPosition`.
- No executable code reads `POLYMARKET_PRIVATE_KEY`, wallet keys, seed phrases, signers, or authenticated trading APIs.
- `executeOrPaper` always records paper trades and rejects live requests with `live_not_implemented`.
- The only `live_trades` behavior is table creation and inspection. No code writes live trades or sends orders.
- `.env` is not present and is ignored by `.gitignore`.
- `.env.example` contains defaults/placeholders only and now points at `./logs/trades.db`.
- `logs/trades.db` is ignored and must not be committed.
- Paper dedupe is implemented in `paper_fire_dedup` with `dedupe_key`, cooldown checks, and duplicate logging.
- Paper PnL is not invented. New paper trades are inserted with `resolved=false`, `pnl=null`, and `inflation_flagged=false`.
- Live PnL is not computed. `exit_stamping_suspect` exists in schema for future audit safety.

## Fixes Applied During Audit

- Aligned `.env.example` `DATABASE_PATH` with the actual default DB path: `./logs/trades.db`.
- Tightened NEG_RISK scanner price validation to skip exact `0` and `1` prices, because those are not safe executable prices without orderbook-depth validation.
- Added a unit test for exact edge prices being skipped.

## Remaining Risks

- `docs/playbook` is an imported reference playbook and contains examples for future live trading, private-key env names, and CLOB execution. Project rules in `AGENTS.md` and `docs/playbook/SUMMARY.md` explicitly forbid copying those examples into code unless the user later requests live trading.
- The current scanner uses Gamma market metadata, not executable orderbook depth. Opportunities are marked `needs_orderbook_depth_check`; they should not be treated as executable trades.
- Existing local ignored DB rows may include earlier dry-run paper records created before the stricter 0/1 price filter. The DB is not committed and should be treated as disposable local paper data.
- No resolution or ground-truth PnL reconciliation exists yet. This is intentional; resolved state and PnL must remain unset until a real ground-truth resolver is implemented.

## Final Statement

live trading currently impossible
