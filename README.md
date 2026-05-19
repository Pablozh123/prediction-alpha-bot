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
