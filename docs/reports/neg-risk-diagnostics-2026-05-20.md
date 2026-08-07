# NEG_RISK Diagnostics - 2026-05-20

Database: `C:\Users\chole\Projects\prediction-alpha-bot\logs\trades.db`

## Top Rejected Events

| Event | Rejections | Avg Raw Edge | Avg Executable Edge | Avg NO Ask Sum | Avg Fillable USD | Min Leg Depth USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| harvey-weinstein-prison-time | 305 | 0.004826 | -0.023164 | n/a | n/a | n/a |

## Event Details

### harvey-weinstein-prison-time

- Rejection reason: non_positive_executable_edge
- Raw YES sum: n/a
- Executable NO ask sum: n/a
- Raw edge: 0.003000
- Executable edge: -0.035000
- Fillable USD: n/a
- Min leg depth USD: n/a

_No leg telemetry recorded for this event yet. Run a clean forward scan after M15 to populate leg-level diagnostics._

## Notes

- This report is read-only and does not place orders.
- No PnL, win rate, or graduation decision is inferred.
- Missing leg telemetry means the row was collected before the M15 schema upgrade.
