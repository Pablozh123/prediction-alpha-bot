# Playbook Summary

Diese Zusammenfassung ist der verpflichtende Einstieg fuer Strategie-Arbeit in diesem Projekt. Das lokale Projekt bleibt paper-only, auch wenn einzelne Playbook-Dateien spaetere Live-, CLOB- oder Canary-Schritte beschreiben.

## Dateien und Zweck

- `README.md`: Orientierung fuer das externe Playbook, empfohlene Lesereihenfolge und zentrale Betriebsprinzipien.
- `PLAYBOOK.md`: Schrittfolge von Projekt-Skeleton bis erstem Paper-Fire; fuer uns nur die Paper-Only-Abschnitte bis zur stabilen Papierausfuehrung verwenden.
- `EDGES.md`: Katalog moeglicher Alpha-Quellen mit Evidenzstufen; strukturelle Arbs haben Vorrang vor direktionalen Strategien.
- `APIS.md`: Uebersicht ueber Datenquellen, Auth-Anforderungen, Rate Limits und bekannte API-Gotchas.
- `ARCHITECTURE.md`: Zielarchitektur mit Scanner-Tiers, zentralem `executeOrPaper`, Safety Guards, Observability und spaeterer Graduation-Logik.
- `ANTIPATTERNS.md`: Bekannte stille Fehlerquellen, die Signale, Paper-PnL oder spaetere Ausfuehrung verfaelschen koennen.
- `METHODOLOGY.md`: Validierungsprozess fuer Strategien: Hypothese, Paper-Daten, Wilson Lower Bound, Cohort Search und formale Bewertung.
- `NEG_RISK_NO_CARRY.md`: Deep Dive zu NEG_RISK Long-Tail NO Carry; verwandt, aber nicht die erste zu implementierende Strategie.

## Erste Strategie

Zuerst wird `NEG_RISK Bracket Sum-Arb` aus `EDGES.md` und `PLAYBOOK.md` implementiert, aber ausschliesslich paper-only.

Mindestumfang fuer die erste Strategie:
- NEG_RISK-Events/Markets als Datenquelle erfassen.
- Bracket-Kandidaten erkennen, bei denen YES-Preise ueber dem konservativen Schwellenwert summieren.
- Jede Leg-Fillbarkeit pruefen; kein Signal bei unvollstaendiger Basket-Liquiditaet.
- Opportunities nur als Datenobjekte melden.
- Jede Ausfuehrung zentral ueber `executeOrPaper` fuehren.
- Keine CLOB-Orders, keine Wallets, keine Signer, keine Private Keys, keine Live-Fire-Flags.

## Sicherheits- und Anti-Pattern-Regeln

- Paper-only ist der Default und bleibt verpflichtend, bis der Nutzer Live-Trading spaeter explizit anfordert.
- Externe Playbook-Beispiele fuer Live-Trading, CLOB, Wallets, Private Keys oder Deployment-Secrets duerfen nicht in Projektcode uebernommen werden.
- `.env` wird nie committed; `.env.example` enthaelt nur Platzhalter ohne echte Credentials.
- Scanner duerfen Opportunities erzeugen, aber niemals selbst handeln.
- `executeOrPaper` ist die einzige Ausfuehrungsgrenze und muss in dieser Version immer Paper-Ergebnisse liefern.
- Side/Token-Alignment darf nicht ueber freie Strings geraten werden; bei spaeterer Marktdatenintegration muessen Outcome-Indizes explizit abgebildet werden.
- NO-Ask darf nicht als `1 - yes_ask` berechnet werden; echte Bid/Ask-Daten und Spread-Logik sind erforderlich.
- Journal- oder Paper-PnL darf nicht als Wahrheit fuer Graduation gelten; spaetere Entscheidungen brauchen verifizierte Datenquellen und Inflationspruefungen.
- Keine Strategie auf Aggregate-Winrate toeten; vorher Cohort Search und Wilson Lower Bound auswerten.
- API-Fehler, 429s und Fallbacks muessen explizit sichtbar werden; stille Null-Opportunity-Laeufe gelten als verdachtig.
