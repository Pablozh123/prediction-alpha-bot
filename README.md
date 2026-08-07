# Prediction Alpha Bot

Cross-venue and neg-risk opportunity scanner for Polymarket and Kalshi.
TypeScript/Node, paper-only, read-only market data. 64 source modules, 239
tests, and 89 dated report artifacts from live paper runs.

## What it found

Over a ten-day run of 3,163 scan cycles, four strategies produced 4,269 raw
candidates and 4 validated ones. The single largest rejection reason is
`non_positive_executable_edge`: the edge was present in the quoted prices and
gone once priced against the order book that would actually have filled it.
The cross-venue lane read 1,000 Kalshi and 2,478 Polymarket binary markets and
matched zero pairs above threshold - every near miss was a compound-market
mismatch that a naive title matcher would have reported as arbitrage.

Details, including the gaps this project knows about itself, are in
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). The dated evidence lives in
[docs/reports](docs/reports).

## What it is

Scanners for within-market YES+NO sums, NEG_RISK bracket structures,
near-resolution watches, sports resolutions, and cross-venue pairs matched
through a canonical event model. Order books are served cache-first from
public websocket ingestors with per-scan telemetry on how many reads were
live, cached or REST. Separate journals record opportunity legs, orderbook
snapshots, scanner runs and sports ticks; a paper-resolution module settles
recorded positions only when the market outcome is known.

## Paper-Only Status

The project does not support live trading. Every execution path routes
through a single boundary that always returns `live: false`. It contains no
real order placement, private-key handling, seed phrases, wallet signing, or
exchange execution path.

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
