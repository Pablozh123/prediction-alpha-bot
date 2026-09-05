# AGENTS.md

## Project Rules

- Always start in paper-only mode.
- Never place real orders.
- Never add private keys, API secrets, wallet credentials, or seed phrases.
- Never commit `.env`; only `.env.example` with placeholders is allowed.
- After changes, run `npm run typecheck` and `npm test`.
- Before writing strategy code, read `docs/playbook/SUMMARY.md` first and follow its paper-only constraints.
- Before touching a scanner, a rejection reason or the feed, read `docs/ARB_TAXONOMY.md`: the classes, the gate order (structure before executability before economics before horizon), the hurdle, and the cross-venue pair protocol. Nothing is called arbitrage unless its payout is fixed by contract; nothing is `reviewed` unless a person read both rulebooks.
- Scanners may report opportunities, but execution must flow centrally through `executeOrPaper`.
- Do not implement live trading unless the user explicitly requests it later.
