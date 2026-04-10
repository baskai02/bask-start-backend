# AGENTS.md

## Project Rules

- This repo is an adaptive coaching backend.
- The backend is the source of truth.
- The frontend renders backend decisions. It does not recreate Kai, readiness, or planning logic.
- Keep product behavior and explanations beginner-friendly.
- Avoid overengineering.
- Prefer small, reviewable changes.
- Preserve continuity between planner, readiness, and frontend response layers.
- Treat `src/__tests__/frontend-readiness-contract.test.ts` as a product contract.

## Working Style

- Change the smallest owning layer first.
- Keep logic inspectable.
- Add or update focused tests when behavior changes.
- Explain file changes.
- Give exact manual test steps after meaningful changes.
- State assumptions briefly.

## Ownership Guide

- `src/exercises`
  Exercise library, readiness logic, frontend-ready readiness responses
- `src/kai`
  Planning, coaching, memory, weekly logic, orchestration
- `src/store`
  Persistence, repositories, snapshot/migration seams
- `src/__tests__`
  Contract and behavior protection

## Product Guardrails

- Keep session identity preservation intact when possible.
- Keep suggested-day behavior grounded in real recent training.
- Keep recommendation memory as a nudge, not an override.
- Keep frontend payloads stable unless the contract truly changed.

## Verification Rule

- files changed
- what each file change does
- the behavior change
- exact manual test steps
- assumptions
- the next best step

Default verification:

```bash
cd /Users/olivergilder/Documents/Bask_start
npm run build
npm test
```

If live server behavior changed, also include:

```bash
pkill -f "node dist/server.js"
npm start
```
