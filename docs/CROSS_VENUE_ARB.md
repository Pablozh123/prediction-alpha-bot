# Cross-Venue Arbitrage Scanner

This module implements an OddPool-style cross-venue scanner for matched Kalshi and Polymarket outcomes.

## Scope

- Paper-only diagnostics.
- Read-only public market data.
- No order placement.
- No wallets, signers, private keys, or secrets.
- Same-outcome matching can be explicit via a local pair config or discovered automatically as conservative candidates.

## Core Logic

## Canonical Market Model

Auto-discovery now normalizes matched markets into internal `CanonicalEvent` and
`CanonicalOutcome` objects before they enter reports or discovery-review saves.
The canonical layer stores a stable `eventKey`, `outcomeKey`, expected
resolution time, optional rules/source text, and per-venue refs for Kalshi and
Polymarket identifiers.

Manual/local pair configs stay backward-compatible. They may include
`canonicalEvent` and `canonicalOutcome`, but older configs without those fields
remain valid and are still scanned paper-only.

## Live Orderbook Cache

Cross-venue scans now read orderbooks through a cache-first path. Fresh cache
entries are used before REST fetches; REST fallbacks write their snapshots back
to the same cache. This immediately reduces repeated polling for repeated token
or ticker reads.

Polymarket public market WebSocket ingestion is available through the
`LiveOrderBookCache` / `PolymarketMarketWebSocketIngestor` path. The dashboard
server can start it with:

```text
CROSS_VENUE_POLYMARKET_WS=true
```

When enabled, the server subscribes to configured, previewed, and scanned
Polymarket YES/NO token IDs and updates the local cache from `book` and
`price_change` messages. The diagnostic cache endpoint is:

```text
GET /api/orderbook-cache
```

Kalshi orderbook WebSocket ingestion is available as an injectable
`KalshiOrderbookWebSocketIngestor`. It accepts an auth-header provider supplied
by the caller and never stores or generates Kalshi credentials. The local
dashboard subscribes Kalshi tickers to that ingestor when one is passed in, but
there is no `.env` flag that asks this project to manage private keys or signed
headers.

`GET /api/orderbook-cache` reports cache counts plus `polymarketWebSocket` and
`kalshiWebSocket` status when those ingestors are configured. It also includes
`latestScanOrderbookReads` from the newest scan report so you can verify whether
the last scan used fresh cache entries or fell back to REST polling.

Scan reports include `orderbookReads` telemetry:

- `websocketHits`: fresh cache reads sourced from venue WebSocket messages.
- `liveWatchedHits`: cache reads for identifiers currently subscribed through a
  WebSocket ingestor. These can include a REST baseline kept current by a quiet
  live subscription.
- `restHits`: fresh cache reads sourced from earlier REST fallbacks.
- `staleCacheMisses` / `missingCacheMisses`: cache reads that had to fall back.
- `restFetches`: direct venue REST orderbook reads.
- `dedupedReads`: repeated ticker/token reads skipped inside the same scan.

For the intended low-polling path, `websocketHits` and/or `liveWatchedHits`
should rise while `restFetches` stays low after the watchlist has active
subscriptions.

When an identifier is actively subscribed through a WebSocket ingestor, the cache
marks it as `liveWatched`. In that state, a REST baseline snapshot can remain
usable after the normal age TTL because subsequent WebSocket deltas should keep
the local book current. If the WebSocket closes or the identifier is
unsubscribed, the normal stale-by-age REST fallback applies again.

For one matched outcome, the scanner checks both directions:

1. Buy YES on Kalshi and buy NO on Polymarket.
2. Buy YES on Polymarket and buy NO on Kalshi.

The top-of-book edge is:

```text
gross_cents = (1 - yes_ask - no_ask) * 100
net_cents = gross_cents - configured_fee_cents
```

The depth-aware sizing walks both ask ladders together. At each level it fills the smaller visible size, adds that level's net profit, and stops when the next level is no longer positive after fees.

## Kalshi Normalization

Kalshi public orderbooks return bids only. For binary markets:

```text
YES ask = 1 - best NO bid
NO ask = 1 - best YES bid
```

The scanner derives Kalshi ask ladders from this relationship before comparing them to Polymarket token asks.

## Price Spreads

The scanner also reports same-side price differences:

```text
YES ask on venue A vs YES ask on venue B
NO ask on venue A vs NO ask on venue B
```

These are directional disagreement signals only. They are not risk-free arbitrage.

## Local Setup

The scanner can run in auto-discovery mode:

```powershell
npm run crossvenue:scan -- --auto-discover --db=logs/trades.db
```

Auto-discovery reads active Kalshi markets and active Polymarket Gamma events, then scores likely same-market pairs by normalized text overlap and compatible resolution timing. These matches are candidates, not proof. Review the matched-pair table before treating a candidate as economically meaningful.

The matcher filters obvious compound Kalshi markets, including multi-game, cross-category, parlay, combo, and comma-separated YES/NO bundles. These are shown as `compound_kalshi_market` in diagnostics and cannot be added from the dashboard because they are not clean same-outcome pairs.

For a local OddPool-style static dashboard, run:

```powershell
npm run crossvenue:dashboard -- --db=logs/trades.db
```

The dashboard command is dry-run by default. It writes:

```text
docs/reports/cross-venue-arb-YYYY-MM-DD.md
docs/reports/cross-venue-arb-YYYY-MM-DD.json
docs/reports/cross-venue-dashboard-YYYY-MM-DD.html
```

Open the HTML file locally to filter matched pairs, near matches, price spreads, and true YES+NO cross-venue arb candidates.

For an interactive local dashboard with a refresh button:

```powershell
npm run crossvenue:serve
```

Then open:

```text
http://127.0.0.1:8787
```

The server exposes:

```text
GET  /api/latest
GET  /api/search?q=<text>
GET  /api/orderbook-cache
GET  /api/pairs
POST /api/pairs
DELETE /api/pairs?id=<pair-id>
POST /api/preview-pair
POST /api/scan
```

`/api/preview-pair` and `/api/scan` always run dry-run/paper-only. They may read public Kalshi and Polymarket APIs, but they do not journal paper trades and cannot place orders.

The dashboard scan controls pass optional query parameters to `/api/scan`:

```text
minNetCents=<minimum net edge in cents>
kalshiFeeCents=<per-contract Kalshi fee assumption in cents>
polymarketFeeCents=<per-contract Polymarket fee assumption in cents>
gammaSearch=<comma-separated Polymarket public-search queries>
gammaSearchLimit=<public-search events per query>
kalshiSeries=<comma-separated Kalshi series tickers>
kalshiEvents=<comma-separated Kalshi event tickers>
```

These values only affect diagnostics and filtering. They do not enable trading.

Dashboard workflow:

1. Use the top `Arbitrage Opportunities` view first. It is the clean working dashboard: event, outcome, buy-YES venue/price, buy-NO venue/price, net edge, and ROI sorted by ROI.
2. Click `Refresh` for a new paper-only scan, or `Scan configured` to evaluate only saved local mappings.
3. Use `Start 30s watch` to keep the paper scanner running at a simple 30-second cadence.
4. Use the top search box and slider filters to narrow visible opportunities by
   net profit, 24h volume, liquidity, or expected resolution window without
   opening the advanced tool area.
5. Open `Advanced tools` only when you need pair review, discovery, import/export, bulk local watchlist edits, or diagnostics.

Every paper scan updates `docs/reports/cross-venue-live-feed.json`. The top table reads active real Kalshi/Polymarket opportunity rows from this persistent feed first and falls back to the latest report only when the feed has no active opportunity rows yet. The badge reads `Live Feed` for active persisted rows, `Paper Data` for current-report rows, or `No Live Data` when no real active opportunity exists. There are no demo opportunity rows in the working view.

Auto-discovery matching is conservative. It reads multiple Kalshi pages by default, but a Kalshi/Polymarket pair must pass the match-score threshold, share non-generic anchor tokens, avoid resolution-time mismatch, and be the clear best candidate for both sides before it is scanned as an executable pair. Ambiguous duplicate candidates stay in diagnostics instead of becoming live opportunity rows.

The advanced KPI cards include both counts and economics: `Best Arb` shows the highest net cross-venue YES+NO edge from the loaded report, and `Best Spread` shows the largest same-side venue difference.
The advanced `Arbitrage Opportunities` panel has venue-pair filter chips, and `Price Differences` has side filter chips. Visible arb/spread CSV exports respect both the global search box and these panel filters.
Arb and spread result rows include `Preview`, `Add pair`, `Add verified`, `Add priority`, `Add verified priority`, `Copy pair JSON`, and `Copy summary` actions. When the row maps to a configured or loaded scan-report pair, preview reads current orderbooks and shows the latest paper-only economics without placing orders. `Add pair` saves that scan-report mapping into the local ignored watchlist config so it can be monitored with `Scan configured pairs` or watch mode. `Add verified` saves the same local mapping with the manual `Verified` flag already set; use it only after checking the public market links and preview. `Add priority` saves a new row directly into the priority watchlist for later `Scan priority` or priority-watch monitoring. `Add verified priority` saves the row with both local review flags when it is already reviewed and worth frequent monitoring. `Copy pair JSON` copies a single-row `{ pairs: [...] }` payload compatible with `Import pairs JSON`, preferring the saved local mapping when one exists. `Copy summary` copies a plain-text audit summary with pair status, local state, review label, latest scan status, note, public market links, token ids, and expected resolution time. Rows already present in the local watchlist show `Saved`, expose `Scan` for a direct one-pair read-only refresh, and can be edited directly with `Note`/`Clear note`, `Star`/`Unstar`, `Verify`/`Unverify`, and `Pause`/`Resume` without switching to the configured-pairs panel.
Arb and spread tables also show `Pair Status`: `verified` for manually reviewed local mappings, `saved` for local mappings without the verified flag, `new` for scan-report mappings not yet saved locally, and `missing_pair_id` when a row cannot be mapped safely. `Local State` shows whether a saved row is `active` or `paused`, `priority` or `normal`, `verified` or `unverified`, and `noted` when it has a local note; unsaved scan-report rows show `not saved`. Saved result rows also show the local `Review` label and `Note` text inline, using the same local completeness checks as the configured-pairs table. Click the status, local-state, or review-warning chips in either result summary to filter Arb and Spread results before exporting visible rows or using bulk add/star/pause/verify actions. The pair-status, local-state, and result-review filters are stored in browser settings until `Clear result filters` is clicked.
Preview rows include `Remove preview row` for dismissing one local preview row after review. This only changes the browser-side preview working set and does not change configured pairs or scan reports.
Use `Add visible arbs`, `Add verified visible arbs`, `Add verified priority visible arbs`, `Star visible arbs`, `Unstar visible arbs`, `Select visible arbs`, `Preview visible arbs`, `Scan visible arbs`, `Start visible arbs watch`, `Pause visible arbs`, `Resume visible arbs`, `Verify visible arbs`, `Unverify visible arbs`, `Export visible arb pairs JSON`, `Export visible arb review CSV`, `Add visible spreads`, `Add verified visible spreads`, `Add verified priority visible spreads`, `Star visible spreads`, `Unstar visible spreads`, `Select visible spreads`, `Preview visible spreads`, `Scan visible spreads`, `Start visible spreads watch`, `Pause visible spreads`, `Resume visible spreads`, `Verify visible spreads`, `Unverify visible spreads`, `Export visible spread pairs JSON`, or `Export visible spread review CSV` to bulk-save, prioritize, unprioritize, select, preview, rescan, repeatedly monitor, pause, resume, verify, unverify, or export the currently filtered result rows from the loaded scan report. The `Add verified visible` variants mark those mappings with the manual `Verified` flag and should only be used after reviewing the market links and preview economics. The `Add verified priority visible` variants save the visible rows with both the manual `Verified` flag and priority flag for reviewed rows that should be monitored more often. The `Star` variants also mark those saved mappings as priority. The `Select visible` variants add already-saved visible result pairs to the configured-pair selection so you can immediately use `Scan selected`, `Start selected watch`, `Verify selected`, or export selected JSON. The `Preview visible` variants read current orderbooks through the same paper-only `/api/preview-pair` path and render a compact best-edge/best-spread review table for the currently visible result pairs before saving or verifying them; large previews are capped at 25 rows, so use `Top rows` to narrow the list. Preview rows include pair status, local state, review label, notes, market links, and the same row actions as the result tables, so you can add, verify, star, pause, or scan directly from the preview table after inspecting the live read-only economics. Each preview table now includes a summary strip with total preview rows, visible preview rows when filtered, current signal rows, preview timestamp, clickable preview-status counts, pair-status counts, local-state counts, review-label counts, and active Preview sort before the bulk controls; click preview-status, pair-status, local-state, or review counts to focus the table on rows like `arb`, `spread`, `no_signal`, `rejected`, `preview_failed`, `new`, `saved`, `verified`, `priority`, `paused`, `ok`, or `review: ...` without changing the underlying preview working set. Use `Preview sort` to order the visible Preview table by preview order, best edge, best profit, best diff, status, pair status, local state, review, or title; this is stored in browser settings and reapplied after refreshes, retries, and filter changes. Use `Clear preview filters` to remove all active Preview-table filters while keeping the preview rows loaded. The preview table also has bulk controls to add all successfully previewed pairs, add all successfully previewed pairs as verified priority, add only preview pairs whose current preview status is `arb` or `spread`, add those signal-only preview pairs as verified priority, add only successful pairs from the currently filtered preview table, add those filtered successful pairs as verified priority, star, unstar, verify, unverify, pause, or resume already-saved preview pairs, export successful preview pairs or signal-only preview pairs as importable JSON, export only already-saved preview pairs or saved signal-preview pairs as importable JSON without changing the configured-pair selection, export the currently filtered preview table as importable JSON or review CSV, export only already-saved pairs from the currently filtered preview table as importable JSON, export every preview row or only signal preview rows as review CSV, select already-saved preview pairs for selected scans/watch/export, select only already-saved signal preview pairs, star, unstar, verify, unverify, pause, resume, select, scan, or start a watch loop for only already-saved filtered preview pairs after using filtered add controls, scan saved preview pairs or saved signal preview pairs immediately, start a saved-preview, saved-signal-preview, or saved-filtered-preview watch loop through `/api/scan-selected`, refresh the full preview working set or only the currently filtered Preview-table rows through `/api/preview-pair`, retry all failed preview rows or only failed filtered preview rows through the same paper-only preview path, remove only the currently filtered Preview-table rows from the local preview working set, or clear the local preview panel when the read-only economics are stale. The `Scan visible` and `Start visible ... watch` variants use only already-saved visible result pairs through the same read-only `/api/scan-selected` path; use `Add visible` first when a result row is still `new`. The `Pause visible`, `Resume visible`, `Unstar visible`, `Verify visible`, and `Unverify visible` variants update only already-saved visible result pairs in the local ignored watchlist config; they do not delete mappings or affect unsaved `new` rows. The saved-preview star, unstar, verify, unverify, pause, resume, refresh, retry-failed, and saved-preview export controls use the same local ignored watchlist config and paper-only preview path, skip unsaved preview rows where applicable, and do not place orders. The filtered-preview add/export controls use all active preview filters and include the successful or exportable rows currently shown in the preview table; if no preview filter is active, use the regular preview controls. The signal-only preview add/select/scan/watch/export controls skip successful previews with `no_signal` or `rejected` status. The preview clear control only removes the browser-side preview table, filters, and timestamp; it does not change configured pairs or scan reports. The filtered-preview clear control removes only currently filtered browser-side preview rows and leaves configured pairs and scan reports unchanged. The result-pair JSON exports write an importable `{ pairs: [...] }` config for the currently visible result rows, preferring local watchlist metadata for already-saved mappings and falling back to the loaded scan-report pair mapping for new rows. The review CSV exports write one row per visible result with pair status, signal values, local review warnings, notes, market links, token ids, resolution time, and latest scan status. The preview-pair JSON exports write successful live-preview pairs, preferring saved local metadata when present; preview review CSV exports include all preview rows, including preview failures, with current best-edge/best-spread fields and rejection reasons. Signal-preview exports keep the same JSON and CSV schemas but include only current `arb` or `spread` preview rows.

`Preview search` narrows loaded Preview rows by pair text, venue ids, status, local review state, notes, preview errors, or rejection reasons. It is shown in the preview summary when active, combines with the status, pair, local, and review filters, and drives the filtered Preview bulk controls without changing the underlying preview working set. The Preview summary also shows the best visible edge, profit, and spread-difference metrics for the currently visible Preview rows after filters and quick views are applied.

Preview quick views apply common review filters to the loaded Preview rows: `Signal view` focuses current arb or spread signals, `Saved active` focuses active locally saved mappings, `Priority view` focuses starred mappings, `Needs-review view` focuses local mappings with review warnings, and `Problem view` focuses `preview_failed` or `rejected` rows for retry or cleanup. Preview summaries show a `Problem rows` count plus problem-reason chips such as `preview_failed` or rejection reasons; click a reason to isolate that problem class before retrying, clearing, or exporting filtered rows. Preview review CSV exports include a `problemReasons` column so filtered problem classes can be audited outside the dashboard. Each quick-view button shows how many loaded Preview rows match that preset before you click it. The active preset is shown in the Preview summary and highlighted in the controls; `Reset preview view` clears the preset filters and returns the Preview sort to preview order. These are client-side table views only; they do not save pairs, scan markets, or place orders.

`Refresh scan` with auto-discovery enabled now combines saved local pairs with newly discovered candidates, de-duplicated by pair id. `Scan configured pairs` keeps discovery disabled and scans only the local ignored config file.

`Discovery Near Matches` shows status-count chips such as `Addable` and individual matcher statuses; click a chip to filter the table before previewing or exporting. `Export near CSV` writes the currently visible candidate rows and their match score/status. Use `Preview` on a near match to read current orderbooks and inspect the mapped economics before saving it. `Add pair` uses a stable candidate key so active dashboard search filters do not change which candidate is saved. `Add verified` saves the candidate with the manual `Verified` flag already set after you have checked that both markets represent the same outcome.

Watch mode:

- `Start watch` scans configured pairs only.
- `Start ready watch` scans only active locally ready configured pairs.
- `Start selected watch` repeatedly scans the currently checked local mappings. The selected ids are frozen when the watch starts.
- `Start priority watch` repeatedly scans active local mappings marked with `Star`. The priority id list is frozen when the watch starts.
- `Watch s` controls the interval in seconds, with a minimum of 5 seconds in the UI.
- A new scan is skipped if the previous scan is still running.
- The watch status line shows the last watch scan time plus arb, spread, and rejected counts.
- If a watch scan finds arb candidates, the main status keeps the `Arbitrage candidates found` message instead of replacing it with a generic refresh message.
- `Scan History` records the latest scans with time, mode, arb count, spread count, pair count, and rejected count.
- Scan history is stored in browser `localStorage`; use `Clear history` to remove it.
- Dashboard scan settings are also stored in browser `localStorage`: auto-discovery, verified-results-only view filter, result sort choices, result row limit, minimum net edge, fee assumptions, and watch interval.
- Export buttons download the currently loaded scan report, arb rows, local pair config, or pair-review table from the browser. `Import pairs JSON` accepts the exported pair config format and upserts those mappings into the local ignored pair file. These actions do not call order APIs or include secrets.
- Dashboard tables can be sorted locally by clicking a column header. Numeric columns such as edge, ROI, size, profit, and spread sort as numbers.
- Kalshi tickers and Polymarket slugs in matched pairs, configured pairs, near matches, search results, and pair previews are shown as external browser links for manual market verification. These links open public website/search pages only; they do not call order APIs or send credentials.
- `Notify on arbs` can trigger local browser notifications when a watch or manual scan finds arb candidates. Click `Enable notifications` once in the browser to grant permission.
- `Verified alerts only` restricts those local browser notifications to arb rows whose configured pair is marked `Verified`. This is useful when auto-discovery remains noisy but the manually reviewed watchlist should still alert.
- Arb notifications are local browser alerts only. They do not use Telegram, server-side tokens, secrets, wallets, or order APIs.
- `Verified results only` filters the Arb and Spread result tables to rows whose configured pair is marked `Verified`. It also affects visible-row exports such as `Export visible arbs CSV` and `Export visible spreads CSV`; it does not change which read-only scan runs.
- `Min profit $` filters visible arb rows by `maxProfitDollars`, and `Min spread c` filters visible spread rows by `diffCents`. These are client-side view filters only; they affect visible exports, bulk add/star/verify/select, direct visible scans, and visible-result watch modes without changing the read-only scan parameters.
- `Arb sort` and `Spread sort` order the filtered result rows before rendering, visible exports, visible pair JSON exports, visible scans, visible watches, and visible bulk actions. Use report order to keep the scanner's native ordering, or sort arbs by profit, edge, ROI, size, pair status, local state, review, or title and spreads by diff, side, pair status, local state, review, or title.
- `Top rows` limits Arb and Spread result rows after filtering and sorting. Visible CSV/JSON exports, visible review exports, visible scans, visible watches, and visible bulk add/star/verify/pause/select actions use that limited Top-N set.
- `Reviewed view`, `Priority view`, `New candidates`, and `Needs-review view` are result quick views. They reset the current result search/minimum filters, then apply common review workflows: verified clean rows sorted by profit/diff, verified priority rows, unsaved scan-report candidates, or saved rows with local review warnings.
- Arb, spread, rejected, and near-match summaries show both total rows and currently visible rows so active filters are obvious before exporting or bulk-saving. Arb summaries also show the best visible net edge and best visible max-profit diagnostic. Spread summaries show the best visible same-side difference.
- `Clear result filters` resets the text search, arb venue chip, spread side chip, minimum profit/spread inputs, Top rows limit, result sort controls, result pair-status chip, rejected reason chip, near-match status chip, and `Verified results only` view filter. It does not edit pair config or run a scan.
- `Rejected Pairs` summarizes rejection reasons by count; click a reason chip to filter the rejected-pair table to that reason. `Export rejected CSV` downloads the currently visible rejected rows with their plain-language meaning. `Pause visible rejected` pauses active configured pairs that are visible in the rejected table with one local bulk update, so bad mappings stop entering configured-pair watch scans while staying in the local config for later review. The table explains why each scanned pair did not become a usable candidate, for example missing config fields, stale/missing market data, network/API read failures, or a pair that is not a clean cross-venue arb.
- Configured pairs can be paused with `Pause` and later restored with `Resume`. Paused pairs remain in the local config but are skipped by configured-pair scans and same-id auto-discovery matches.
- The configured-pairs panel shows total, priority, verified, ready, active, paused, needs-review, last-arb, last-spread, and last-rejected counts and can be filtered with `All`, `Priority`, `Verified`, `Unverified`, `Ready`, `Active`, `Paused`, `Needs review`, `Last arb`, `Last spread`, or `Last rejected`.
- `Verified` is a manual local review label for mappings that you checked against the public Kalshi/Polymarket pages. It is not a trade signal, does not bypass orderbook validation, and does not enable live trading.
- `Ready` means the pair is active and passes local watchlist completeness checks. It does not mean the pair has a live arb, positive edge, or execution readiness.
- `Needs review` is a local watchlist quality check for incomplete or suspicious mappings, for example missing resolution time, missing token ids, or low text overlap between the saved Kalshi and Polymarket labels.
- The configured-pairs summary also shows review-warning chips such as `missing_resolution_time`, `low_text_overlap`, `duplicate_kalshi_ticker`, `duplicate_polymarket_slug`, or `duplicate_token_pair`. Click a chip to filter only that warning class before pausing, starring, scanning, or exporting the affected rows.
- Use `Note` on a configured pair to store local review context such as why the mapping was added, what to verify next, or why it is priority. Notes are local watchlist metadata only and are included in pair-review CSV exports.
- Duplicate Kalshi tickers, duplicate Polymarket slugs, and duplicate YES/NO token pairs are also marked `Needs review`, because imported watchlists can otherwise scan the same mapping multiple times.
- `Last arb`, `Last spread`, and `Last rejected` use the latest loaded scan report and are useful for separating clean arb candidates, directional price differences, and failed mappings.
- `Export pair review CSV` writes the configured-pair readiness, review warnings, token ids, resolution time, and latest scan status so large watchlists can be audited outside the dashboard.
- Use the row checkboxes plus `Pause selected` or `Resume selected` to bulk-update multiple local pairs. `Select visible` and `Clear selection` apply to the currently filtered watchlist rows.
- Use `Scan visible` to evaluate the current filtered/search-visible configured rows without changing the checkbox selection.
- Use `Start visible watch` to repeatedly monitor the currently filtered/search-visible rows. The visible row ids are fixed when the watch starts.
- Use `Export visible review CSV` or `Copy visible review CSV` to audit the current filtered/search-visible rows with readiness, review warnings, token ids, resolution time, and latest scan status.
- Use `Copy visible summaries` to copy plain-text audit summaries for the current filtered/search-visible configured rows.
- Use `Export visible JSON` or `Copy visible JSON` to save or copy the current filtered/search-visible configured rows as an importable pair config.
- Use `Pause visible` or `Resume visible` to bulk-update the currently filtered/search-visible configured rows without changing the checkbox selection.
- Use `Note selected` or `Clear selected notes` to add or clear the same local review note on checked mappings without opening each row. These write only local watchlist metadata.
- Use `Remove selected` to delete checked local mappings after a browser confirmation. This only edits the ignored local pair config file.
- Use `Scan selected` to evaluate only the checked local mappings. This is useful for testing newly imported or manually edited pairs before adding them to a broader watch flow.
- Use `Star`/`Unstar`, `Star selected`, `Unstar selected`, `Star visible`, or `Unstar visible` to maintain a smaller priority watchlist for mappings worth monitoring more often. `Scan priority` evaluates only active priority pairs.
- Use `Verify`/`Unverify`, `Verify selected`, `Unverify selected`, `Verify visible`, or `Unverify visible` after manually checking that a Kalshi ticker and Polymarket slug represent the same outcome and resolution logic. This writes only local watchlist metadata.
- Use `Scan verified` or `Start verified watch` to run only active manually verified mappings through the same read-only orderbook scan path. This is the safest watch mode for reviewed cross-venue mappings.
- Use `Scan last-rejected` to retest only configured mappings whose latest loaded scan status is rejected, for example after changing fee assumptions, thresholds, or waiting out temporary API/orderbook issues.
- Use `Start last-rejected watch` to repeatedly monitor the configured mappings whose latest loaded scan status is rejected. The id list is fixed when the watch starts.
- Use `Start selected watch` when a small hand-picked set should be monitored repeatedly without scanning the rest of the watchlist.
- Use `Start priority watch` when the same hand-picked priority set should keep running after page filters or row selections change.
- Use `Export selected JSON` or `Copy selected JSON` to save or copy only the checked local mappings as a smaller pair config that can later be re-imported.
- Use `Export selected review CSV` or `Copy selected review CSV` to audit only checked local mappings with readiness, review warnings, token ids, resolution time, latest scan status, and notes.
- Use `Copy selected summaries` to copy plain-text audit summaries for checked local mappings to the clipboard for notes, tickets, or manual review.
- Use `Export ready JSON` to save all active locally ready mappings as a clean pair config after import and review. This is a watchlist-quality export, not proof of arb or execution readiness.
- Use `Export priority JSON` to save the hand-picked priority watchlist as an importable pair config.
- Use `Export verified JSON` to save only manually verified local mappings as an importable pair config.
- Use `Export last-rejected JSON` to save the configured mappings whose latest loaded scan status is rejected, for offline review or cleanup.
- Use `Pause needs-review` after importing or editing a large watchlist to pause active pairs with local review warnings before running configured-pair watch mode.
- Use `Pause last-rejected` after a scan to pause active configured pairs whose latest loaded scan status is rejected, while keeping them in the local ignored config for later review.
- `Scan ready pairs` uses the same read-only scan logic as configured-pair scans, but sends only active locally ready pairs to the scanner. It does not create trades or bypass orderbook validation.
- Each configured pair also shows `Last Scan`, derived from the latest loaded report: arb count and best net edge, spread count and max difference, rejection reason, no signal, or not scanned.
- Use `Preview` on a configured pair to read current orderbooks for that saved mapping without going through the Pair Builder again.
- Use `Scan` on a configured pair row to refresh only that mapping through the same read-only `/api/scan-selected` path.
- `Stop watch` stops the local browser refresh loop.
- Watch mode and ready-watch mode are still read-only and paper-only; they do not place orders or write secrets.

Manual Pair Builder workflow:

1. Enter a market topic in `Pair Builder`, for example a team, candidate, event, or short market phrase.
2. Click `Search markets`; this reads only public Kalshi and Polymarket market metadata.
3. Select one Kalshi row with `Use Kalshi`.
4. Select one Polymarket row with `Use Polymarket`.
5. Review `Pair quality`; warnings such as low text overlap, missing resolution time, or resolution mismatch mean the mapping needs manual review.
6. Click `Preview selected pair` to read both orderbooks once and inspect true arb candidates, price spreads, and rejection reasons without saving the pair.
7. Save the configured pair only if both rows clearly represent the same outcome and the preview is worth monitoring.
8. Use `Save verified pair` only after manually checking the public market links and preview. The verified-save button stays disabled until a preview has been loaded for the exact selected Kalshi/Polymarket pair, then stores the local mapping with `verified: true`.
9. Click `Scan configured pairs` to evaluate all local pairs, or `Scan verified` / `Start verified watch` to monitor only manually verified pairs.

The pair-quality box checks mapping plausibility only. It does not claim edge, fillability, PnL, or execution readiness.
The pair preview reads orderbooks and checks economics, but still does not claim PnL or execution readiness.

Configured pairs are saved locally to:

```text
config/crossVenuePairs.json
```

That file is ignored by git.

Use `Remove` in the configured-pairs table to delete a wrong local mapping. This only edits the local ignored pair config file.

For fully controlled manual matching, copy the example pair file:

```powershell
Copy-Item config\crossVenuePairs.example.json config\crossVenuePairs.json
```

Then replace the example Kalshi ticker and Polymarket token IDs with a verified same-outcome mapping and run:

```powershell
npm run crossvenue:scan -- --no-auto-discover --pairs=config/crossVenuePairs.json --db=logs/trades.db
```

Reports are written to:

```text
docs/reports/cross-venue-arb-YYYY-MM-DD.md
docs/reports/cross-venue-arb-YYYY-MM-DD.json
docs/reports/cross-venue-dashboard-YYYY-MM-DD.html
```

## Optional Config

```text
CROSS_VENUE_AUTO_DISCOVER=true
CROSS_VENUE_GAMMA_LIMIT=200
CROSS_VENUE_KALSHI_LIMIT=200
CROSS_VENUE_KALSHI_MAX_PAGES=1
CROSS_VENUE_MAX_PAIRS=25
CROSS_VENUE_MIN_MATCH_SCORE=0.68
CROSS_VENUE_MIN_NET_CENTS=0.5
CROSS_VENUE_KALSHI_FEE_CENTS=0
CROSS_VENUE_POLYMARKET_FEE_CENTS=0
CROSS_VENUE_DASHBOARD_HOST=127.0.0.1
CROSS_VENUE_DASHBOARD_PORT=8787
```

## Safety Notes

- `config/crossVenuePairs.json` is ignored by git.
- `.env` remains ignored.
- Fees are configurable placeholders; do not treat zero-fee output as execution-ready.
- No paper trade is created by this scanner. Positive candidates are journaled as validated opportunities only.
