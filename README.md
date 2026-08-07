# Prediction Alpha Bot

Paper-only TypeScript/Node.js skeleton for scanning prediction-market opportunities.

## Project Goal

This repository is the first version of a robust scanner and paper-trading foundation. Scanners can identify and report possible opportunities, while all execution behavior is routed through a central paper-only boundary.

## Paper-Only Status

The project does not support live trading. It contains no real order placement, private-key handling, seed phrases, wallet signing, or exchange execution path.

## Local Start

```bash
npm install
npm run dev
```

Optional Telegram alerts are disabled by default. To enable monitoring alerts
locally, create a bot with Telegram BotFather, send `/start` to the bot, then
run:

```bash
npm run telegram:setup
```

After setup, send a test alert:

```bash
npm run telegram:test
```

Send the current 24h Telegram digest manually:

```bash
npm run telegram:daily
```

Record the public Polymarket sports websocket locally:

```bash
npm run sports:feed
```

Run the sports resolution sniping scanner once over stored sports ticks:

```bash
npm run sports:resolution:once
```

Run sports tick collection plus repeated watch-only candidate scans:

```bash
npm run sports:watch
```

Generate a simple sports sniping report:

```bash
npm run sports:report
```

Run one expanded orderbook snapshot collection:

```bash
npm run snapshots:once -- --limit=160 --gamma-limit=400 --max-per-market=16
```

The default scanner loop includes a short-duration paper layer:

- `FAST_SCAN_ENABLED=true` uses `FAST_SCAN_INTERVAL_MS=10000`.
- `MAX_SHORT_ARB_DURATION_HOURS=72` blocks unknown, medium, or long-duration opportunities from paper-firing.
- Long-duration clean baskets remain visible in reports as watch/diagnostic rows.

Start a clean isolated 24h forward run in paper-only mode:

```bash
npm run forward:clean:start
```

Preview the exact DB/log/PID paths without starting a process:

```bash
npm run forward:clean:start -- --dry-run
```

Inspect or report a clean run:

```bash
npm run forward:clean:status
npm run forward:clean:report
```

Check whether the current dataset has enough snapshot coverage and useful
near misses:

```bash
npm run coverage:report -- --db=logs/forward-clean-YYYY-MM-DD.db
```

Run checks before changing behavior:

```bash
npm run typecheck
npm test
```

## Safety Rules

- Keep `.env` local and uncommitted.
- Use `.env.example` only for placeholders.
- Do not add private keys, API secrets, wallet credentials, or seed phrases.
- Do not add real order placement code.
- Route future scanner opportunities through `executeOrPaper`.
- Require separate explicit approval before any live-trading implementation.
