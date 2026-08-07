# Daily Telegram Report - 2026-05-20

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`
Window: 24h

## Telegram Message

```text
Paper bot daily report
window: 24h
scanCycles: 273/273 ok, 0 failed
snapshots: 334, tokens: 46, markets: 28
blocked orderbook tokens: 20
paperTrades: 147, liveTrades: 0
forward latest avg: -86.47 bps
forward best avg: -80.16 bps
positive latest tokens: 0
positive best tokens: 0

Scanner funnel:
- neg_risk_bracket_arb: raw 0, validated 0, rejected 0, paper 0
- within_market_yes_no_arb: raw 0, validated 0, rejected 0, paper 0

Top rejections:
- neg_risk_bracket_arb/non_positive_executable_edge: 305

Top replay tokens:
- microstrategy-sells-any-bitcoin-by-december-31-2026 998075...8808 best 0.00 bps, latest 0.00 bps
- harvey-weinstein-prison-time 864884...8486 best -10.00 bps, latest -150.00 bps
- harvey-weinstein-prison-time 470553...5230 best -10.00 bps, latest -20.00 bps

Safety: paper-only, no orders, no PnL claims from unresolved trades.
```

## Safety Notes

- Report is read-only against local SQLite data.
- No live trading, no orders, no private keys, no secrets.
- Forward replay uses orderbook quote movement only, not realized PnL.
