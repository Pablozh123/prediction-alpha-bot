# AGENTS.md

## Project Rules

- Always start in paper-only mode.
- Never place real orders.
- Never add private keys, API secrets, wallet credentials, or seed phrases.
- Never commit `.env`; only `.env.example` with placeholders is allowed.
- After changes, run `npm run typecheck` and `npm test`.
- Before writing strategy code, read `docs/playbook/SUMMARY.md` first and follow its paper-only constraints.
- Scanners may report opportunities, but execution must flow centrally through `executeOrPaper`.
- Do not implement live trading unless the user explicitly requests it later.
