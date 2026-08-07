# Daily Telegram Report - 2026-05-30

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-30.db`
Window: 24h

## Telegram Message

```text
Paper bot daily report
window: 24h
scanCycles: 74/74 ok, 0 failed
snapshots: 10195, tokens: 217, markets: 140
blocked orderbook tokens: 60
paperTrades: 0, liveTrades: 0
short candidates: 191, short paper fires: 0
long-duration watch: 437, near-resolution watch: 0
neg-risk classes: clean 0, duration 72, directional 365, ambiguous 0
sports watch: ticks mapped 0, candidates 0, rows 0
forward latest avg: -181.00 bps
forward best avg: -176.43 bps
positive latest tokens: 0
positive best tokens: 1

Scanner funnel:
- clear_win_watch: raw 0, validated 0, rejected 0, paper 0
- neg_risk_bracket_arb: raw 431, validated 0, rejected 431, paper 0
- within_market_fast_arb: raw 34237, validated 0, rejected 3650, paper 0

Top rejections:
- within_market_fast_arb/non_positive_executable_edge: 3668
- neg_risk_bracket_arb/unknown_duration_for_short_arb: 330
- neg_risk_bracket_arb/duration_too_long_for_short_arb: 107
- within_market_fast_arb/partial_basket_invalid: 1

Top replay tokens:
- microstrategy-sells-any-bitcoin-by-may-31-2026 319268...0574 best 10.00 bps, latest 0.00 bps
- will-luiz-incio-lula-da-silva-qualify-for-brazils-presidential-runoff 111699...7392 best 0.00 bps, latest 0.00 bps
- starmer-out-by-may-31-2026 971661...2978 best -10.00 bps, latest -10.00 bps

Safety: paper-only, no orders, no PnL claims from unresolved trades.
```

## Safety Notes

- Report is read-only against local SQLite data.
- No live trading, no orders, no private keys, no secrets.
- Forward replay uses orderbook quote movement only, not realized PnL.
