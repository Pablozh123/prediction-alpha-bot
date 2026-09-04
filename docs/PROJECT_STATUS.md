# Project Status

Date: 2026-08-07, with a dated addendum of 2026-09-04 at the end. Supersedes the 2026-05-19 version, which described a
scanner skeleton and has been wrong about the size and the open questions of
this repository since roughly the end of May.

## What this is

A paper-only TypeScript/Node scanner for prediction-market opportunities on
Polymarket and Kalshi, with the validation, journalling and reporting needed to
find out whether a reported opportunity was ever executable. Read-only market
data throughout.

225 tracked files (2026-08-07): 64 source modules, 44 test files carrying 239 tests, and 89
dated report artifacts from live paper runs.

## What runs

The main loop (`npm run dev`) runs one cycle on an interval. Each cycle scans
three strategies in parallel through `runScanCycle`:

- `scanNegRiskCombinedArbs` - NEG_RISK bracket sums,
- `scanWithinMarketCombinedOpportunities` - YES+NO below one inside a market,
- `clearWinWatchScanner` - near-resolution watch candidates.

Alongside it the loop runs the orderbook snapshot cycle and the daily Telegram
digest, both off by default.

Everything else is an explicit CLI: cross-venue scanning and its local
dashboard, sports feed recording and resolution, neg-risk classification and
diagnostics, paper resolution, and the report generators. `npm run` lists all
35 of them; the README gives the ones worth running first.

## What the runs actually showed

From the 2026-06-02 strategy evaluation over a ten-day run - 3,163 scan cycles,
2026-05-19 to 2026-05-29:

| Strategy | raw found | validated | paper fired |
| --- | ---: | ---: | ---: |
| within_market_fast_arb | 2,354 | 0 | 0 |
| within_market_yes_no_arb | 1,554 | 0 | 0 |
| neg_risk_bracket_arb | 355 | 4 | 4 |
| clear_win_watch | 6 | 0 | 0 |

Raw candidates are abundant and executable candidates are not. The single
largest rejection reason across every strategy is `non_positive_executable_edge`
- 1,030 of 1,206 rejections - meaning the edge was present in the quoted prices
and gone once priced against the book that would have filled it. The largest
apparent edge in the whole run, 31,210 bps on an eight-leg basket, was rejected
for an unknown short-arb duration rather than taken.

The evaluator returns `NEEDS_FIX` for all four strategies and reports no PnL:
167 paper trades, 0 resolved, `insufficient resolved sample`. That is the
intended behaviour. A scanner that reports edges and never checks what happened
next is reporting its own inputs back to itself.

Cross-venue is a separate lane and so far a negative result. The 2026-06-10
scan read 1,000 Kalshi and 2,478 Polymarket binary markets and matched zero
pairs above threshold; the near misses are all `compound_kalshi_market`, where
a multi-outcome Kalshi market shares words with a single-outcome Polymarket
one. Those are the mismatches a naive title matcher would have reported as
arbitrage.

## Safety status

- `executeOrPaper` is the only execution path. It always returns `live: false`,
  with reason `paper_only` or `live_not_implemented`. No order client, no CLOB
  SDK import, no signing code, no private-key handling.
- The websocket ingestors take an auth-header provider from the caller. This
  repository never builds, stores or requests a venue credential.
- `.env`, the SQLite journals, `logs/`, `node_modules/`, `.tmp/`, `tmp/`,
  `.npmrc` and any `*.key` / `*.pem` are gitignored. Only `.env.example` with
  placeholders is committed.
- Paper PnL is never invented: `calculatePaperPnlOnlyIfResolutionKnown` returns
  nothing for an unresolved market, and unresolved rows keep `pnl=null`.
- CI installs, typechecks, tests and lints. It makes no external API calls.

## Known gaps

- **147 of 167 paper trades have no `opportunity_id` link.** The evaluator
  reports this itself as a data-quality warning. Until it is fixed, paper fires
  cannot be traced back to the candidate that caused them, which is exactly the
  join a resolved-PnL analysis needs.
- No resolved paper sample yet. `paperResolution` exists and settles markets
  that have resolved; the run above simply had none.
- The NEG_RISK bracket scanner still reads Gamma metadata rather than
  executable depth for its first pass, and marks those candidates
  `needs_orderbook_depth_check`. The depth check happens later in
  `cleanBasketFilter` and `orderbookSnapshotCycle`, so the flag is a stage
  marker, not an unfinished feature - but the two-stage split is worth knowing
  about before reading a raw scanner result.
- Cross-venue fee defaults are 0 cents for both venues in
  `config/crossVenuePairs.example.json`. Real fee curves have to be supplied
  before a cross-venue number means anything.
- Report artifacts embed absolute Windows paths from the machine that generated
  them.

## Neuaufsetzung 2026-09-04

Datierter Nachtrag. Der Scanner wurde mit den Befunden seit Mai neu aufgesetzt,
damit er laufend echte, ausfuehrbare Chancen (paper) scannt und seinen Stand
fortlaufend als JSON fuer die Website publiziert. Alles bleibt paper-only;
jede Ausfuehrung laeuft weiter durch `executeOrPaper`, das `live: false`
zurueckgibt.

### Was geaendert wurde und warum

| Befund | Aenderung |
| --- | --- |
| 1.030 von 1.206 Ablehnungen waren `non_positive_executable_edge`: die Kante stand im Quote und war gegen das Buch weg. | Kandidaten werden von Anfang an gegen die ausfuehrbare Buchtiefe bewertet. `validateWithinMarketOpportunity` rechnet die Zielgroesse (`PAPER_TARGET_SIZE_USD`, Default 20) in Anteile um und laeuft beide Ask-Leitern ueber genau diese Anzahl; ist ein Buch flacher, setzt es die Groesse und der Kandidat wird `depthLimited`. Der Quoted-Edge ist nur noch Vorfilter. Nur eine Kante, die bei ausfuehrbarer Groesse nach Gebuehren positiv bleibt, ist eine Chance. |
| Polymarket erhebt seit etwa Maerz 2026 Taker-Gebuehren; Kalshi hat eigene Kurven; die Konfiguration stand auf 0 Cent. | `src/core/venueFees.ts` traegt die Kurven `fee = shares * rate * p * (1 - p)` mit den Saetzen des Schwesterprojekts, Stand 2026-07-30 (Polymarket je Kategorie 0.04 bis 0.07, Geopolitik 0; Kalshi Taker 0.07, Maker 0.0175, Aufrundung auf den Cent je Order). Maker- und Taker-Leg werden unterschieden; `EXECUTION_ROLE_MODE=maker_first` ist Konfiguration, Default ist `taker` (konservativ). Flache Null-Cent-Gebuehren werden nicht mehr honoriert. |
| Cross-Venue-Gaps standen stundenlang offen: kein Arbitrage, sondern Kapitalbindung bis zur Aufloesung, annualisiert rund ein Prozent. | `days_to_resolution` und `annualized_pct` (linear, Untergrenze ein Tag) sind Pflichtfelder jeder Chance; die Publikation rangiert danach. Mismatch-Klassen (`compound_kalshi_market`, Ergebnis gegen Marge, Teilnahme gegen Sieg, Frage gegen Umkehrung) werden vor dem ersten Buchabruf hart ausgeschlossen und als abgelehnt mit Grund gefuehrt. Der Regelvergleich bleibt `unverified`; `reviewed` setzt nur ein Mensch ueber `verified: true` in der lokalen Paar-Konfiguration, einen Status `verifiziert` gibt es nicht. Die Cross-Venue-Spur laeuft jetzt als eigener Takt im Hauptloop (Default alle 5 Minuten) und feuert nie paper. |
| 147 von 167 Paper-Trades ohne `opportunity_id`. | `executeOrPaper` verlangt die `opportunity_id` jetzt am Schema; ohne sie wird kein Paper-Trade geschrieben. `npm run paper:backfill-links` versucht den Join nachtraeglich (gleiche Strategie, Token in der Kandidaten-Zeile, plus/minus zehn Minuten) und markiert den Rest `legacy_unlinked`. Fuer die 147 Altfaelle gibt es nichts zu joinen: sie liegen vier Stunden vor der ersten Kandidaten-Zeile. Sie sind damit ehrlich aus jeder Stichprobe ausgeschlossen. `paper:resolve` laeuft im Loop (Default alle 30 Minuten), damit eine aufgeloeste Stichprobe entsteht. |
| Antipatterns: `1 - YES-Ask` ist nicht der NO-Ask; Thin-Book; JS-Float an Schwellen; Schweigen als gefaehrlichster Ausfall. | NO-Legs lesen weiterhin das NO-Buch (Polymarket) bzw. `1 - YES-Bid` (Kalshi). Schwellen laufen ueber `bpsAtLeast`/`isPositiveBps` mit Rundung. Jeder Zyklus loggt einen `heartbeat` mit Zyklus-Zaehler, und die publizierte Datei traegt `health.last_cycle_at`, `cycles_24h`, `errors_24h` und `alive` (falsch, sobald der letzte Zyklus aelter als drei Intervalle ist, Untergrenze zehn Minuten). |
| Ablehnungsgruende waren freie Strings. | `src/core/rejectionReasons.ts` ist eine geschlossene Liste mit Zaehler; jede Ablehnung laeuft hindurch, Unbekanntes wird `other`. |

### Publisher

`src/publisher/arbScanPublisher.ts` schreibt nach jedem Zyklus und mindestens
alle fuenf Minuten atomar (Temp-Datei im Zielordner, dann rename) die Datei
`arb_scan.json` in den Ordner aus `ARB_PUBLISH_DIR`. Ohne gesetzte Variable
wird nichts publiziert und das einmal geloggt. Schema `arb_scan/1`, vor dem
Schreiben mit zod validiert; Inhalte mit Dateisystempfaden oder Benutzernamen
werden verweigert. Alle Zahlen kommen aus den SQLite-Journalen, nie aus
Prozess-Zaehlern. Maximal 50 Chancen (validierte zuerst, dann `annualized_pct`
absteigend) und 50 Paper-Positionen.

### Dauerbetrieb

`scripts/run_scanner.cmd` startet `npm run dev` in einer Neustart-Schleife und
schreibt nach `logs\scanner.log` (Rotation ab 10 MB).
`scripts/install_scanner_task.ps1` registriert die Windows-Aufgabe
`PredictionAlphaBotScanner` (Trigger bei Anmeldung, Neustart bei Absturz,
keine Adminrechte). Beides ist vorbereitet; registriert wurde nichts.

### Vorregistrierung des Messfensters

- Fenster: 14 Tage ab Inbetriebnahme des Dauerbetriebs.
- Erfolgskriterium: aufgeloeste Paper-Trades mit verknuepfter Chance
  (`link_status` `linked` oder `backfilled`), deren Nettokante nach Gebuehren
  positiv war und deren aufgeloester PnL das bestaetigt.
- Vorab wird nichts behauptet. Der Mai-Befund gilt bis zum Gegenbeweis: rohe
  Kandidaten sind haeufig, ausfuehrbare selten, und die groesste Ablehnung ist
  die Kante, die gegen das Buch verschwindet.

### Was sich nicht geaendert hat

Live-Handel ist nicht implementiert. Es gibt keinen Order-Client, keine
Schluessel, keine Signatur. Die Stichprobe aufgeloester Paper-Trades ist bis
zum Ende des Messfensters leer oder klein, und die Datei sagt das in
`summary.sample_note`.

## Final statement

Live trading is not implemented and no path in this repository can place an
order.
