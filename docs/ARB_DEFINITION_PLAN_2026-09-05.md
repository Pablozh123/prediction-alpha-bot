# Arb-Strategien: Definition, Untersuchung, Darstellung

Plan vom 2026-09-05. Gilt fuer beide Repos: `prediction-alpha-bot` (Scanner,
Feed `arb_scan.json`) und `prediction-market-terminal` (Website
marketintel.dev, Seite Cross-venue). Der Scanner ist die Quelle der
Definitionen, die Website zeigt sie. Paper-only bleibt unveraendert; nichts in
diesem Plan beruehrt `executeOrPaper`, Schluessel oder einen Order-Pfad.

## Umsetzungsstand 2026-09-05, 17:30 UTC

Alles aus Abschnitt 6 ist gebaut, gemergt und in Betrieb; von Abschnitt 7
bleibt allein E5 offen.

- Scanner (`Pablozh123/prediction-alpha-bot`, alles auf `main`): PR #2
  (WP0 bis WP6, Feed `arb_scan/2`), PR #3 (E1: Hurdle von 10 auf 5 Prozent),
  PR #4 (Paper-Aufloesung: Gamma mit `closed=true`, Rotation der
  Warteschlange, Zeilen ohne Zahl mit Grund, Gate 2 gegen Maerkte nach dem
  Termin). Die Windows-Aufgabe `PredictionAlphaBotScanner` laeuft seit
  17:02 UTC auf `main` (72ac255); die erste Aufloesungs-Batch schloss 22
  Trades mit Zahl und 26 ohne Zahl (`filled_after_close`).
- Website (`Pablozh123/prediction-market-terminal`): PR #186 (Abschnitt
  nach 5.2 und 5.3, geteilter Auto-Screen, Paritaetstests, Spec), PR #187
  (Hurdle 5), PR #189 (Grund je Paper-Zeile). Der Feed geht ueber den
  taeglichen Daten-Commit live.
- Paar-Protokoll (WP4): `config/crossVenuePairs.json` ist lokal und nicht
  versioniert; die Fassung mit sechs Paaren, Regeltexten und Review-Objekten
  liegt im laufenden Checkout (Somaliland, Le Pen, Pritzker als
  `pending`-Entwuerfe, Trump und Rubio 2028 `not_equivalent`, Eurovision
  deaktiviert). Die Form des Review-Objekts steht in
  `config/crossVenuePairs.example.json`.
- Entscheidungen: E1 5 Prozent, E2 nein im Messfenster, E3 nur Taxonomie,
  E4 Spezifikation im Scanner-Repo, E6 sieben Tage. E5 offen: ohne
  Kalshi-Zugang bleibt Cross-Venue Forschung.
- Messung nach Abschnitt 8 laeuft ab 2026-09-05 mit Hurdle 5; Auswertung
  nach dem Fenster.

## 0. Kurzfassung

Frage: Sind die Arb-Strategien renditeorientiert und logisch sauber definiert?

Antwort: Das Fundament stimmt. Bewertung gegen Buchtiefe statt Quote,
Gebuehrenkurven je Venue und Kategorie, annualisierte Rendite als Pflichtfeld,
geschlossene Ablehnungsliste, Regelvergleich bleibt Menschensache. Vier Dinge
sind nicht sauber definiert, und jedes davon steht heute sichtbar auf der
Website:

1. **Laufzeit ist eine Ablehnung statt eine Klasse.** Ein strukturell
   sauberer NEG_RISK-Korb mit 28 Tagen wird verworfen, ein Cross-Venue-Paar
   mit 830 Tagen auch. Das ist kein Nein zur Rendite, sondern ein Nein zur
   Kapitalbindung. Das gehoert als Carry-Klasse mit Hurdle-Rate definiert,
   nicht als Fehler gefuehrt.
2. **Die Pruefreihenfolge macht Ablehnungsgruende falsch.** Wirtschaftlichkeit
   und Laufzeit werden vor der Strukturpruefung geprueft. Beleg im Feed von
   heute 13:36Z, Zeile 1: `which-candidates-will-advance-to-brazils-
   presidential-runoff`, neun Beine NO, "1445 bps netto, 185 Prozent p.a.".
   Zwei der neun Beine stehen bei 2.4 und 3.7 Cent NO, also sind zwei
   Kandidaten so gut wie sicher: eine Stichwahl hat zwei Teilnehmer. Der Korb
   zahlt 7 statt der angenommenen 8 je Anteil, die echte Kante liegt nahe
   null. `classifyNegRiskPayoffStructure` wuerde das ueber das Wort "advance"
   als `multi_winner_or_qualifier_basket` erkennen, kommt aber nie dran, weil
   das Laufzeit-Gate vorher greift. Die erfundene Zahl steht auf Platz 1 und
   traegt auf der Website das Label "rejected: duration_too_long".
3. **Regelgleichheit hat kein sauberes Vokabular.** `rule_match: reviewed`
   wird fuer Within-Market und NEG_RISK automatisch gesetzt, obwohl
   `docs/CROSS_VENUE_ARB.md` sagt: reviewed heisst, ein Mensch hat beide
   Regelwerke gelesen. Und fuer ein Paar, das ein Mensch als NICHT gleich
   befunden hat (Trump 2028: Kalshi zahlt auf "inauguriert", Polymarket auf
   "gewinnt die Wahl laut AP, Fox, NBC"), gibt es keinen Status. Der Befund
   vom 31.07. existiert im Datenmodell nicht.
4. **Zwei Matcher, zwei Vokabulare, eine Website.** Scanner (TypeScript) und
   Website (Python) entscheiden mit verschiedenen Regeln, ob zwei Titel
   dieselbe Frage sind: 14 gegen 7 Tage Termin-Toleranz, "Wahl gegen
   Nominierung" nur in Python, Compound-Kalshi nur in TypeScript. Die
   Fixture, die die Website als Vertrag prueft, verwendet Strategienamen, die
   der Scanner nie schreibt.

Dazu drei Darstellungsfehler: 1.3 Millionen "raw candidates" pro Tag, weil das
Watch-Band bis 1.01 mitgezaehlt wird; im publizierten Feed stehen 50
abgelehnte Zeilen mit negativer Kante und keine einzige Cross-Venue-Zeile; die
Cross-Venue-Spur im Scanner scannt genau ein Paar.

Der Plan: eine Taxonomie mit vier Achsen (Klasse, Horizont, Regelstatus,
Ausfuehrbarkeit), eine kanonische Pruefreihenfolge, ein Paar-Protokoll fuer
Cross-Venue, ein Feed-Schema v2 und eine Darstellung, die dieselben Woerter
benutzt. Sieben Arbeitspakete, sechs Entscheidungen von dir (Abschnitt 7).

## 1. Befund

### 1.1 Was der Scanner heute definiert

| Strategie-ID | Was gesucht wird | Struktur | Paper-Feuer | Regelstatus heute |
|---|---|---|---|---|
| `within_market_fast_arb` | YES-Ask plus NO-Ask unter 1 im selben Markt | strukturell, ein Kontrakt | ja, bis 72 h | `reviewed`, automatisch |
| `neg_risk_bracket_arb` | Summe YES ueber 1.03 in einem NEG_RISK-Event, Kauf aller NO | strukturell, wenn exklusiv und erschoepfend | ja, bis 72 h | `reviewed`, automatisch |
| `cross_venue_yes_no_arb` | YES auf Venue A plus NO auf Venue B unter 1 | strukturell nur bei Regelgleichheit | nie | `unverified`, `reviewed` (Mensch via `verified: true`), `mismatch` (Automatik) |
| `cross_venue_price_spread` | gleiche Seite, zwei Preise | kein Korb | nie | keiner |
| `clear_win_watch` | Markt kurz vor Aufloesung, Preis 0.85 bis 0.995 | probabilistisch | nie | keiner |

Gate-Reihenfolge heute in `src/scanner/runScanCycle.ts`: Buch fuellbar,
Bruttokante, Fuellpreis, Nettokante nach Gebuehren, Tiefe, **Laufzeit
(72 h)**, dann erst `evaluateCleanNegRiskBasket` mit Korbstruktur, Edge-,
ROI-, Kapazitaets- und Spread-Floors. Die Struktur kommt zuletzt.

Kapitalbindung in `src/utils/marketTime.ts`: `short` bis 72 h, `medium` bis
14 Tage, `long` darueber, `unknown` ohne Termin. Die Klasse wird journaliert,
aber alles ausser `short` ist eine Ablehnung.

### 1.2 Was die Website heute definiert

- Eigener Matcher `app/cross_pairs.py`: Urteil `unverified`, `opposed`,
  `different_question` aus Titeln; 7 Tage Termin-Toleranz; Scope-Gruppen
  (Wahl gegen Nominierung); benannte Wettbewerbe; Schwellen. Nur
  `unverified` kommt in die Tabelle.
- Gebuehren `app/venue_fees.py`: dieselben Kurven wie im Scanner, in Python
  dupliziert, mit Hinweis auf den strittigen Polymarket-Satz (5 gegen 3
  Prozent).
- Regeltexte nebeneinander `src/resolution_rules.py`: Lesehinweise
  `ambiguity`, `source`, `deadline`, `partial`, bewusst kein Urteil. Ergebnis
  vom 2026-07-31: das Trump-2028-Paar ist nicht dieselbe Frage.
- Studien: Cross-Venue-Luecken sind Carry (0.5 bis 1.8 Prozent p.a. bei 273
  bis 830 Tagen), Fenster stehen Stunden offen. Steht seit PR #166 direkt
  auf der Seite, seit PR #183 mit dem strittigen Gebuehrensatz.
- Abschnitt "Paper scanner: executable edge" (`web/js/pages/arb_scan_page.js`)
  rendert `arb_scan.json` defensiv. Die Fixture
  `tests/fixtures/arb_scan_example.json` gilt laut Test als Vertrag, nennt
  aber `cross_venue_parity`, `intra_market_complement`,
  `multi_outcome_sum`, `net_edge_below_fees`, `rule_mismatch_suspected`.
  Der Scanner schreibt `cross_venue_yes_no_arb`, `within_market_fast_arb`,
  `neg_risk_bracket_arb`, `non_positive_net_edge_after_fees`.

### 1.3 Wo es auseinanderlaeuft, mit Beleg

| Nr | Befund | Beleg | Folge |
|---|---|---|---|
| B1 | Laufzeit ist Ablehnung statt Klasse | `duration_too_long_for_short_arb` 3969 mal in 24 h; `capital_lock_class` im Journal, nicht im Feed | Carry-Kandidaten sind unsichtbar oder als Fehler markiert |
| B2 | Struktur wird nach Laufzeit geprueft | Feed 2026-09-05 13:36Z, Zeile 1 (Brasilien-Stichwahl), `rejection_reason: duration_too_long_for_short_arb`, `annualized_pct: 185.51` | Erfundene Rendite auf Platz 1 |
| B3 | `reviewed` automatisch | `runScanCycle.ts`, beide `updateOpportunityStatus(... ruleMatch: "reviewed")` | Gruenes REVIEWED-Badge auf der Website fuer etwas, das nie ein Mensch gelesen hat |
| B4 | Menschliches "nicht gleich" nicht abbildbar | `RuleMatchStatus = unverified, reviewed, mismatch`; `mismatch` nur aus der Automatik | Trump-2028-Befund steht nirgends im Datenmodell |
| B5 | Zwei Matcher, zwei Regeln | TS `MAX_RESOLUTION_TIME_DIFF_MS` 14 Tage, Python `MAX_RESOLUTION_GAP_DAYS` 7; Python `SCOPE_GROUPS`, `COMPETITION_PHRASES` fehlen in TS; TS `compound_kalshi_market` fehlt in Python | Dieselben zwei Titel koennen im Scanner passieren und auf der Website fallen, oder umgekehrt |
| B6 | Fixture-Vokabular falsch | `arb_scan_example.json` gegen `STRATEGY_LABELS` und `REJECTION_REASONS` | Der "Vertrag" prueft die falschen Namen; rohe Enum-Schluessel erscheinen auf der Seite |
| B7 | Raw-Zaehlung zaehlt das Watch-Band | Within-Market laeuft im Zyklus mit `DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD = 1.01`; 1,336,223 raw in 24 h | Trichter auf der Website unlesbar (0.0 Prozent validiert) |
| B8 | Feed-Ranking blendet Cross-Venue aus | 50 Zeilen: 47 Within-Market, 3 NEG_RISK, 0 Cross-Venue; Sortierung `annualized_pct` absteigend, null zuletzt; alle 50 `rejected` | Abschnitt "executable edge" zeigt nur negative Kanten |
| B9 | Cross-Venue-Spur scannt ein Paar | Log jeder Zyklus: "1 pair(s) scanned, 0 validated, 1 without edge, 10 mismatch candidate(s)"; Discovery-Universum 200 gegen 200 Maerkte, eine Seite | Die Website zeigt 6 bis 9 Paare aus dem eigenen Matcher, der Scanner-Abschnitt daneben keines |
| B10 | Zyklus laenger als Intervall | 2978 mal `scan_cycle_skipped: previous_scan_still_running`; `scan_interval_ms` 10000 | Health-Regel "3 Intervalle" ist an der falschen Groesse geeicht |
| B11 | Zwei Gebuehrentabellen | `src/core/venueFees.ts` und `app/venue_fees.py` | Kein Test prueft beide gegeneinander |
| B12 | NEG_RISK-Struktur nur per Regex | `classifyNegRiskPayoffStructure` liest Slug und Fragen; Gamma-Felder `negRisk`, `negRiskAugmented`, Marktanzahl gegen Outcome-Anzahl bleiben ungenutzt | Ein Korb ohne "Other"-Bein oder mit zwei Gewinnern kann als clean durchgehen |

## 2. Zieldefinition: die Taxonomie

Jede Chance bekommt vier Achsen. Alle vier stehen im Feed und auf der Seite,
mit denselben Woertern.

### 2.1 Achse 1: Klasse (Auszahlungsstruktur)

| Klasse (ID) | Korb | Auszahlung je Korbanteil | Strukturell, wenn | Hauptrisiko | Heutige Strategie-ID |
|---|---|---|---|---|---|
| `same_market_complement` | YES plus NO, ein Markt, eine Venue | genau 1.00 | immer, ein Kontrakt | Buch verschwindet in Sekunden; Gebuehr | `within_market_fast_arb`, `within_market_yes_no_arb` |
| `neg_risk_no_basket` | NO auf alle N Beine eines NEG_RISK-Events | N minus Anzahl Gewinner | Venue-Flag `negRisk`; genau ein Gewinner; Beine erschoepfend oder "Other"-Bein vorhanden | Multi-Winner, verschachtelte Termine, nicht erschoepfend; UMA-Dispute | `neg_risk_bracket_arb` |
| `cross_venue_complement` | YES auf A plus NO auf B | 1.00 nur bei Regelgleichheit, sonst 0 oder 2 | Auto-Screen bestanden UND Mensch hat beide Regelwerke als gleich befunden | Regelwerk; zwei Aufloesungstermine; zwei Kapitalpools; Legging | `cross_venue_yes_no_arb` |
| `cross_venue_price_spread` | keiner; gleiche Seite, zwei Preise | keine | nie | ist keine Chance, ist Information | `cross_venue_price_spread` |
| `neg_risk_long_tail_no_carry` | NO auf Long-Tail-Beine (NO ab 0.97) | 1.00 je Bein, ausser das Bein gewinnt | nie, probabilistisch | ein Long-Tail gewinnt | nicht implementiert; Playbook `NEG_RISK_NO_CARRY.md` |
| `clear_win_convergence` | YES oder NO auf entschiedenen Markt | 1.00, wenn Referenzfakt gleich Aufloesung | nie, Oracle-Risiko | Oracle weicht von Referenz ab | `clear_win_watch` |

Reserve, definiert aber nicht gescannt: Kalshi-Leiter-Monotonie (EDGES 4) und
Schwelle gegen Bracket (EDGES 14). Beide strukturell, beide nicht Teil dieses
Plans.

Regel: nur Klassen mit einer Bedingung in "strukturell, wenn" duerfen das Wort
Arbitrage tragen, und nur, wenn die Bedingung erfuellt ist. Alles andere
heisst Carry, Watch oder Information.

### 2.2 Achse 2: Horizont (Kapitalbindung)

Existiert schon als `capital_lock_class`. Was sich aendert: der Horizont wird
Klasse statt Ablehnung.

| Horizont | Dauer bis Aufloesung | Name auf der Seite | Paper-Feuer | Rendite-Mass |
|---|---|---|---|---|
| `short` | bis 72 h | ARB | ja | Netto-bps am ausfuehrbaren Volumen; annualisiert nur zur Vergleichbarkeit, Klemme 1 Tag |
| `medium` | 72 h bis 14 Tage | CARRY, kurz | nein, Entscheidung E2 | annualisierte Netto-Rendite gegen Hurdle |
| `long` | ueber 14 Tage | CARRY, lang | nein | annualisierte Netto-Rendite gegen Hurdle; beide Termine sichtbar |
| `unknown` | kein Termin bekannt | UNDATED | nein | keine Annualisierung; nie eine Chance |

Bei Cross-Venue ist die Dauer das Maximum beider Venues (heute schon so ueber
`latestKnownResolutionAt`), aber beide Termine muessen einzeln im Feed stehen:
Kalshi `expiration_time` und Polymarket `endDate` liegen beim Trump-2028-Paar
ein Jahr auseinander (2029-11-07 gegen 2028-11-07).

### 2.3 Achse 3: Regelstatus (Gleichheit der Aufloesung)

Zwei Felder statt einem.

`rule_screen`, Automatik aus Titeln und Regeltext:

- `structural`: ein Kontrakt, Gleichheit per Konstruktion. Nur
  `same_market_complement`.
- `passed`: nichts aufgefallen. Heisst nicht geprueft.
- `inverted`, `different_question`, `compound_market`,
  `resolution_time_mismatch`, `resolution_terms_mismatch`: verworfen, mit
  Detailtext.

`rule_review`, Mensch, aus der Paar-Konfiguration:

- `none`
- `equivalent` mit Datum, Kuerzel, Notiz, Checkliste (Abschnitt 4, Stufe 3)
- `not_equivalent` mit Datum, Kuerzel, Grund (Trump 2028: inauguriert gegen
  gewinnt)

Fuer NEG_RISK-Koerbe heisst `rule_screen` `passed`, wenn Venue-Flag und
Textpruefung stimmen; `structural` bekommt nur der Ein-Kontrakt-Fall.
Automatisches `reviewed` gibt es nicht mehr. Nur `structural` oder
`equivalent` erlaubt das Wort "gehedgt". Alles andere heisst auf der Seite
"zwei offene Wetten, bis geprueft".

### 2.4 Achse 4: Ausfuehrbarkeit

| Feld | Definition | Quelle |
|---|---|---|
| `executable_size_shares` | min ueber alle Beine der Tiefe bis zum Ziel (`PAPER_TARGET_SIZE_USD`), gedeckelt durch positive Nettokante je Level | Leiterlauf, existiert |
| `depth_limited` | das Buch, nicht das Ziel, hat die Groesse bestimmt | existiert |
| `role` je Bein | taker oder maker, Default taker | existiert |
| `book_age_ms` je Bein | Alter des Buchs beim Rechnen | Cache liefert es, wird nicht publiziert |
| `window_open_seconds` | wie lange die Nettokante ueber null stand | `open_seconds` je Chance existiert; fuer Cross-Venue zusaetzlich aus den Stream-Recordern der Website (`src/gap_lifetime.py`) |
| `venues_funded_separately` | Kapital liegt auf zwei Venues, kein Netting | Cross-Venue immer true |

Cross-Venue-Legging: eine Kante, die kuerzer offen steht als der REST-Roundtrip
beider Venues, ist fuer einen Taker nicht erreichbar. Fuer Carry-Paare
(Stunden) irrelevant, fuer echte Short-Cross-Venue-Arbs die Hauptfrage.

## 3. Wann etwas eine Chance ist

### 3.1 Kanonische Pruefreihenfolge

Der Ablehnungsgrund muss der fundamentalste sein, nicht der erste. Struktur
vor Ausfuehrbarkeit vor Wirtschaftlichkeit vor Horizont vor Flusskontrolle.

1. **Identitaet und Struktur.** Klasse bestimmen. Auszahlungsstruktur:
   NEG_RISK ueber Venue-Flag, Gewinnerzahl, Erschoepfung, Text-Screen.
   Regelscreen fuer Cross-Venue. Faellt hier etwas, sind alle Zahlen danach
   ungueltig: `gross`, `net`, `annualized` bleiben null.
2. **Ausfuehrbarkeit.** Jedes Bein fuellbar, Groesse gegen Tiefe,
   Spread-Deckel, Buchalter.
3. **Wirtschaftlichkeit.** Bruttokante am ausfuehrbaren Volumen, Gebuehren je
   Bein und Rolle, Nettokante, Netto-Gewinn in Dollar am ausfuehrbaren
   Volumen.
4. **Horizont.** `capital_lock_class` setzen, annualisieren, Hurdle pruefen.
   Kein Reject, sondern Klasse.
5. **Flusskontrolle.** Dedupe, Cooldown, Paper-Feuer nur fuer `short`.

Die Rejection-Enum bleibt, bekommt aber eine feste Rangordnung nach diesen
fuenf Gates, und jede Zeile traegt zusaetzlich `gate_failed` (1 bis 5, oder
null).

### 3.2 Entscheidungsregel, renditeorientiert

Eine Zeile ist eine Chance, wenn alle vier gelten:

- **Struktur:** `rule_screen` in (`structural`, `passed`) und `rule_review`
  nicht `not_equivalent`. Fuer Cross-Venue zusaetzlich
  `rule_review = equivalent`, sonst ist es ein Kandidat.
- **Ausfuehrbar:** `executable_size_shares > 0` und Kapital am ausfuehrbaren
  Volumen mindestens `MIN_EXECUTABLE_DEPTH_USD`.
- **Netto positiv:** `executable_net_edge_bps` mindestens `MIN_NET_EDGE_BPS`
  der Klasse (heute 100 bps fuer NEG_RISK, 0.5 Cent fuer Cross-Venue).
- **Hurdle:** `annualized_net_pct` mindestens `MIN_ANNUALIZED_NET_PCT`. Fuer
  `short` praktisch immer erfuellt; fuer `medium` und `long` ist das die
  eigentliche Pruefung.

Hurdle-Rate: eine Konfiguration `MIN_ANNUALIZED_NET_PCT`, im Feed publiziert,
auf der Seite genannt. Begruendung des Startwerts: der Markt selbst preist
gebundenes Kapital in Near-Certain-Kontrakten mit 3.06 bis 6.89 Prozent p.a.
(Gebele und Matthes, zitiert in `docs/research/ertragsquellen_2026-07-31.md`
des Terminal-Repos). Was darunter liegt, ist Funding-Praemie, keine Kante.
Vorschlag fuer den Startwert in Abschnitt 7.

Ranking innerhalb einer Klasse: nicht nach `annualized_pct`, sondern nach
erwartetem Netto-Gewinn in Dollar am ausfuehrbaren Volumen
(`net_profit_usd`), gefiltert durch die Hurdle. 185 Prozent p.a. auf 17 Dollar
sind 34 Dollar im Jahr. Beide Zahlen stehen in der Zeile, die Prozentzahl
entscheidet nie allein.

### 3.3 Definition von "raw candidate"

`raw` heisst: Bruttokante am Quote ueber null (Summe der Asks unter 1,
beziehungsweise Summe YES ueber 1). Das Watch-Band (Summe bis 1.01) wird ein
eigener Zaehler `near_miss_24h` und erscheint nicht im Trichter.

## 4. Cross-Venue im Besonderen: das Paar-Protokoll

Vier Stufen, jede mit eigenem Feld, keine ueberspringbar.

### Stufe 1: Auto-Screen, beide Repos, eine Spezifikation

Eine Entscheidungstabelle als Datei `config/pair_screen_cases.json` mit
Titelpaaren und erwartetem Urteil, gepflegt im Scanner-Repo, in die Website
kopiert. Beide Implementierungen muessen alle Faelle bestehen. Inhalt aus den
belegten Fehlpaarungen:

- Ergebnis gegen Marge (El-Sayed, Michigan)
- Sieg gegen Teilnahme (Mark Kelly, "who will run")
- Wahl gegen Nominierung (drei Paare vom 2026-08-31)
- Champions League gegen FA Cup
- above gegen below auf derselben Schwelle
- Fed September gegen Fed Dezember
- Compound-Kalshi (MULTIGAME, Komma-Klauseln mit Yes/No)
- Somaliland (soll passieren)

Abzugleichen: Termin-Toleranz (E6), Scope-Gruppen und Wettbewerbe nach
TypeScript portieren, Compound-Kalshi nach Python portieren oder belegen, dass
`md.cross_venue_candidates` es anders faengt.

### Stufe 2: Regeltexte holen und nebeneinanderstellen

Existiert als `src/resolution_rules.py` mit den Flags `ambiguity`, `source`,
`deadline`, `partial`. Ergaenzen:

- `early_resolution`: resolves immediately upon announcement
- `other_outcome`: resolves to Other
- `replacement`: replacement of nominee, Ersatzkandidat
- `expiration_gap`: beide Termine und Differenz in Tagen

Die Ausgabe wird Teil des Feeds je Paar, als Textausschnitte, keine Volltexte.

### Stufe 3: Menschliche Pruefung mit Checkliste

Die Checkliste begruendet das Urteil, Ja oder Nein je Punkt, Notiz bei Nein:

1. Gleicher Sachverhalt, nicht nur gleiche Namen?
2. Gleiche Bedingung (gewinnt gegen inauguriert; hostet gegen angekuendigt)?
3. Gleiche oder kompatible Aufloesungsquelle (AP, Fox, NBC gegen Behoerde)?
4. Gleiche Frist; was passiert bei Verschiebung, Abbruch, Ersatzkandidat?
5. Gleiche Behandlung von Mehrdeutigkeit (Kalshi "last traded price" gegen
   UMA)?
6. Gleiche Handhabung von "Other" und von Teilaufloesung?
7. Termine: Differenz in Tagen, wer settelt spaeter, Kapital bis dahin
   gebunden?

Ergebnis in `config/crossVenuePairs.json` je Paar:

```json
"review": {
  "verdict": "equivalent | not_equivalent",
  "date": "2026-09-08",
  "reviewer": "cc",
  "checklist": { "1": true, "2": false, "3": true, "4": true, "5": false, "6": true, "7": "365 days, kalshi later" },
  "note": "Kalshi: inaugurated; Polymarket: wins election per AP/Fox/NBC"
}
```

`verified: true` wird durch `review.verdict` ersetzt. Die fuenf
Watchlist-Paare (`data/cross_venue_watchlist.json` im Terminal-Repo) und
Somaliland werden als erste durch das Protokoll gefuehrt; Trump und Rubio 2028
sind nach dem Befund vom 31.07. `not_equivalent`.

### Stufe 4: Wirtschaftlichkeit nur mit Status

Netto und annualisiert werden fuer jedes gescreente Paar gerechnet, das ist
Information. "Gehedgt" und "Chance" gibt es nur bei `equivalent`. Kapital
sind beide Beine voll, kein Netting; Laufzeit ist der spaetere Termin;
Fenster kommt aus den Recordern.

Offen (E5): ob Kalshi fuer den Betreiber ueberhaupt handelbar ist (Zugang,
KYC, Land). Solange das nicht geklaert ist, bleibt Cross-Venue auf der Seite
Forschung und im Scanner ohne Paper-Feuer.

## 5. Darstellung

### 5.1 Feed `arb_scan/2`

Zusaetzlich zu v1; v1 bleibt eine Uebergangszeit parallel, die Website liest
beides.

- `vocabulary`: Klassen, Horizonte, Regelstatus, Ablehnungsgruende mit
  Klartext-Label. Die Website tippt kein Label mehr ab.
- `config`: `hurdle_pct`, `target_size_usd`, `min_net_edge_bps` je Klasse,
  `fee_model_version`, `short_max_hours`, `medium_max_days`.
- `chances`: nur Zeilen, die die Regel in 3.2 erfuellen, je Klasse gedeckelt
  (Vorschlag 20).
- `carry_candidates`: strukturell sauber, netto positiv, ueber Hurdle, aber
  `medium` oder `long`, oder Cross-Venue ohne `equivalent`. Je Klasse
  gedeckelt.
- `rejected_examples`: hoechstens 5 je Ablehnungsgrund, ohne Rendite-Felder,
  wenn Gate 1 gefallen ist.
- `pairs`: Cross-Venue-Paartafel: beide Titel, beide Termine, `rule_screen`
  mit Detail, `rule_review`, Flags aus Stufe 2, netto, annualisiert, Fenster.
- Je Zeile neu: `class`, `capital_lock_class`, `rule_screen`, `rule_review`,
  `gate_failed`, `net_profit_usd`, `resolution_at_by_venue`, `book_age_ms`.
- Im Summary neu: `near_miss_24h`, `hurdle_pct`.

Die Fixture der Website wird aus einem echten v2-Feed erzeugt, nicht von Hand
geschrieben.

### 5.2 Seite Cross-venue, Lesereihenfolge

1. Kopfzeile mit Verdikt aus den Daten: "n Arb-Chancen (short), m
   Carry-Kandidaten ueber Hurdle (k davon ungeprueft), p Paare gescreent, q
   verworfen." Kein Satz ohne Zahl aus der Datei.
2. Der Kasten "WHAT WE MEASURED ON PAIRS LIKE THESE" bleibt.
3. Paartafel, Stufen 1 bis 3 sichtbar: je Paar Badge `SCREEN: PASSED,
   INVERTED, ...`, Badge `REVIEW: NONE, EQUIVALENT, NOT EQUIVALENT` mit
   Datum, beide Termine, Flags, netto, annualisiert, Fenster. Aufklappbar:
   Regeltexte nebeneinander mit Checkliste.
4. Chancen-Tafel des Scanners: Spalten Klasse, Horizont, Regel, Netto bps,
   Netto USD am Volumen, Tage, p.a. gegen Hurdle, Fenster, Rolle. Nur
   `chances`.
5. Carry-Tafel: dieselben Spalten, Ueberschrift "CARRY, NOT ARBITRAGE", mit
   Hurdle-Zeile.
6. Trichter je Klasse mit Klartext-Labels, `near_miss` getrennt.
7. Ablehnungen als Balken, Beispiele aufklappbar.
8. Der Absatz, was die Zahlen nicht sagen, bleibt.

Was nie erscheint: eine Zeile mit negativer Nettokante unter einer
Ueberschrift mit dem Wort "edge"; ein REVIEWED-Badge ohne Datum und Kuerzel;
eine annualisierte Zahl an einer Zeile, die Gate 1 nicht bestanden hat.

### 5.3 Methodik-Seite

Ein Abschnitt "Was wir Arbitrage nennen und was nicht" mit der Tabelle aus
2.1, den Horizonten aus 2.2 und der Hurdle. Gleiche Woerter wie im Feed.

## 6. Arbeitspakete

| WP | Inhalt | Repo, Dateien | Abnahme | Aufwand |
|---|---|---|---|---|
| 0 | Definitionen festschreiben: Abschnitte 2 bis 4 werden `docs/ARB_TAXONOMY.md` im Scanner, ein Absatz in `docs/specs/` der Website; Entscheidungen aus 7 eingetragen | Scanner `docs/`, Website `docs/specs/`, beide `AGENTS.md` bzw. `CLAUDE.md` | Beide Repos verweisen auf dieselbe Taxonomie | 0.5 Tage |
| 1 | Scanner-Gates: Reihenfolge nach 3.1; `gate_failed`; Rendite-Felder null bei Gate-1-Fall; NEG_RISK ueber Gamma-Flags `negRisk`, Marktanzahl, "Other"-Bein; `rule_screen` und `rule_review` statt `ruleMatch`; `capital_lock_class` als Klasse; `MIN_ANNUALIZED_NET_PCT`; `raw` gegen `near_miss` | `runScanCycle.ts`, `cleanBasketFilter.ts`, `negRiskBasketClassifier.ts`, `negRiskBracketScanner.ts`, `crossVenueCycle.ts`, `opportunityJournal.ts` (Migration), `rejectionReasons.ts`, `utils/gamma.ts`, `.env.example` | Brasilien-Korb wird `multi_winner_or_qualifier_basket` mit `annualized: null`; Tests fuer die Gate-Ordnung; `npm run typecheck && npm test && npm run lint` | 3 bis 4 Tage |
| 2 | Feed v2 nach 5.1: Deckel je Klasse, Vokabular, Config-Block, Paartafel; Fixture der Website aus echtem Feed | Scanner `arbScanPublisher.ts`, `tests/arbScanPublisher.test.ts`; Website `tests/fixtures/arb_scan_example.json`, `tests/test_web_arb_scan.py` | Feed enthaelt Cross-Venue-Zeilen; keine negative Nettokante in `chances`; Schema-Test in beiden Repos | 2 Tage |
| 3 | Ein Auto-Screen: `config/pair_screen_cases.json`; Termin-Toleranz angleichen; Scope und Wettbewerbe nach TS; Compound nach Python; Test in beiden Repos | Scanner `crossVenueQuestionMatch.ts`, `crossVenueMatcher.ts`; Website `app/cross_pairs.py`, `tests/test_cross_pairs.py` | Beide bestehen dieselben Faelle; Somaliland passiert, Trump gegen Nominee faellt | 2 Tage |
| 4 | Paar-Protokoll: Flags erweitern; `review`-Objekt in der Paar-Config; sechs Paare durch die Checkliste; Regelausschnitte in den Feed | Website `src/resolution_rules.py`; Scanner `config/crossVenuePairs.json`, `crossVenueArbScanner.ts`, `scripts/crossVenueArbScan.ts` (Config-Loader) | Trump und Rubio 2028 `not_equivalent` mit Grund; Somaliland mit vollstaendiger Checkliste | 1.5 Tage plus Lesezeit je Paar |
| 5 | Website nach 5.2 und 5.3: Labels aus `vocabulary`; Carry-Tafel; Paartafel mit Badges; Methodik-Abschnitt; Claims-Lint | `web/js/pages/arb_scan_page.js`, `core_pages.js`, `system_pages.js`, `tests/test_web_arb_scan.py`, `tests/test_web_leerzustand.py` | Render-Harness in allen Zustaenden gruen; kein rohes Enum sichtbar; Verdiktsatz aus Daten | 3 Tage |
| 6 | Messung und Betrieb: Erfolgskriterien aus 8 ins Messfenster; Telegram-Report und Feed auf dieselben Zaehler; Cross-Venue-Universum erweitern oder Watchlist der Website als Paar-Config einlesen; Scan-Intervall an Zykluslaenge; Gebuehren-Paritaetstest TS gegen Python | `dailyTelegramReport.ts`, `crossVenueCycle.ts`, `.env`, `venueFees.ts` gegen `venue_fees.py` (ein JSON-Export, ein Test je Repo) | Kein `scan_cycle_skipped` im Normalbetrieb; Feed und Report nennen dieselben 24h-Zahlen; mehr als ein Paar gescannt | 1.5 Tage |

Reihenfolge: 0, 1, 2, 3, dann 4 und 5 parallel, 6 zuletzt. WP1 und WP2 sind
ein Branch im Scanner (`feat/rescan-2026-09` weiterfuehren oder
`feat/taxonomy`), WP3 bis WP5 je ein PR pro Repo. Nichts davon aendert den
Paper-only-Status.

Was nicht Teil des Plans ist: Live-Handel, neue Klassen ausserhalb der
Tabelle 2.1, die Netto-Luecke je Ordergroesse auf der Website (Backlog-Punkt
4 des Autoloops, braucht den Depth-Sidecar), Kelly-Sizing.

## 7. Entscheidungen, die du treffen musst

| Nr | Frage | Vorschlag | Warum |
|---|---|---|---|
| E1 | Hurdle-Rate `MIN_ANNUALIZED_NET_PCT` | 10 Prozent als Startwert, am 2026-09-05 auf 5 Prozent gesenkt, im Feed sichtbar | Ueber der gemessenen Funding-Praemie von 3 bis 7 Prozent; darunter ist Carry nur Geldmarkt mit Resolution-Risiko. Die Zahl ist Konfiguration, nicht Wahrheit |
| E2 | Paper-Feuer fuer `medium` (72 h bis 14 Tage)? | Nein im laufenden Messfenster; nach dem 14-Tage-Fenster neu entscheiden | Das Fenster ist auf `short` vorregistriert; eine Aenderung mittendrin macht die Stichprobe unlesbar |
| E3 | `neg_risk_long_tail_no_carry` in den Scanner? | In die Taxonomie ja, in den Scanner erst nach WP1 bis 5 | Einzige Klasse mit dokumentiert hoher Trefferquote, aber probabilistisch; braucht eigene Vorregistrierung |
| E4 | Wer besitzt den Auto-Screen? | Spezifikation im Scanner-Repo, beide Implementierungen bestehen sie; keine Laufzeitabhaengigkeit zwischen den Repos | Beide Prozesse laufen getrennt und muessen allein starten koennen |
| E5 | Kalshi-Zugang fuer den Betreiber | Vor WP4 klaeren | Ohne Zugang bleibt Cross-Venue Forschung; das aendert die Darstellung ("was ein US-Trader haette") |
| E6 | Termin-Toleranz im Screen | 7 Tage | Der Fed-Fall (September gegen Dezember) faellt bei 14 Tagen nicht sicher |

## 8. Messung: was den Plan bestaetigt oder widerlegt

Je Klasse, vorregistriert vor WP1, ausgewertet 14 Tage nach Inbetriebnahme
von WP2:

| Klasse | Primaerkennzahl | Erfolg | Misserfolg |
|---|---|---|---|
| `same_market_complement`, short | aufgeloeste, verknuepfte Paper-Trades; Netto-PnL; Wilson-Untergrenze der Trefferquote | wie vorregistriert 2026-09-04 | wie vorregistriert |
| `neg_risk_no_basket`, short | dito, plus Anteil Gate-1-Ablehnungen (Struktur) an allen Ablehnungen | Struktur-Ablehnungen sind die Mehrheit der frueheren Laufzeit-Ablehnungen bei Multi-Winner-Slugs | Laufzeit bleibt Hauptgrund, Struktur faengt nichts |
| Carry, medium und long, alle Klassen | annualisierte Nettokante bei Erstsichtung gegen Nettokante bei Aufloesung (Forward-Replay); Anteil ueber Hurdle | mindestens ein Kandidat ueber Hurdle, dessen Kante bis zur Aufloesung Bestand hat | kein Kandidat ueber Hurdle, oder die Kanten verschwinden vor der Aufloesung |
| Cross-Venue-Paare | Anzahl `equivalent` nach Pruefung; Anzahl `not_equivalent` mit Grund | mindestens ein `equivalent` Paar mit dokumentierter Checkliste | alle geprueften Paare `not_equivalent`: dann ist das der Befund und steht so auf der Seite |
| Screen-Konsistenz | Faelle in `pair_screen_cases.json`, bestanden in beiden Repos | 100 Prozent | jede Abweichung ist ein Fehler |

Alles bleibt paper-only. Kein Order-Pfad, keine Schluessel, kein Live-Handel.
