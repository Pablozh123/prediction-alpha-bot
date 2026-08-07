# Sports Resolution Sniping Report - 2026-05-30

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\forward-clean-2026-05-30.db`

## Kurz erklaert

Sports Resolution Sniping sucht sehr kurze Situationen nach Spielende: Der Score ist final, aber der Polymarket-Preis des Gewinner-Tokens ist noch nicht bei fast 1.00 angekommen.

In dieser Version ist das konservativ umgesetzt: Ein Paper-Fire ist nur erlaubt, wenn Sports-Feed, Gamma-Mapping, zweite Referenz und Orderbook alle zusammenpassen. Ohne diese Bestaetigung wird nur eine Diagnosezeile gespeichert.

## Zahlen

- Sports ticks gespeichert: 358
- Sports watch rows: 0
- Sports paper trades: 0

## Mapping Status

| Status | Count |
| --- | ---: |
| no_matching_gamma_market | 2160 |

## Watch / Rejection Reasons

_None_

## Letzte Watch-Kandidaten

_None_

## Wo Chancen entstehen koennten

- Finales Spiel erkannt, aber Gewinner-Token handelt noch unter ca. 0.98.
- Slug und Team-Outcomes sind eindeutig gemappt, besonders Away/Home korrekt.
- Zweite Referenz bestaetigt denselben Endstand.
- Orderbook hat echte Ask-Tiefe; der erwartete Edge bleibt nach Ask-Walk positiv.

## Safety

- Kein Live-Trading.
- Keine echten Orders.
- Keine Private Keys oder Secrets.
- PnL wird nicht aus unresolvded Trades erfunden.
