---
name: readiness-logic
description: Use when changing Bask readiness and recovery behavior. Covers muscle load calculation, recovery and overwork logic, readiness classification, session decisions, frontend-ready readiness outputs, and improving realism while keeping the logic simple and inspectable.
---

# Readiness Logic

Use this skill for decision logic in:

- `src/exercises/readiness.ts`
- `src/exercises/frontend-response.ts`
- `src/exercises/types.ts`
- `src/kai/service.ts`
- `src/__tests__/frontend-readiness-contract.test.ts`

Do not use it for:

- exercise metadata cleanup
- repo-level reporting format
- general persistence work unless directly required by readiness behavior

## Priorities

Prefer this order:

1. recovery safety
2. session identity preservation
3. template continuity
4. recommendation ranking
5. frontend explanation clarity

## Rules

- Avoid large rewrites of `buildTrainingReadinessReport`.
- Prefer small changes at the narrowest seam.
- If planner intent and generic ranking disagree, protect higher-level intent first.
- Keep suggested-day logic explicit rather than hiding it in broad booleans.
- Keep the response shape stable unless the contract truly changed.

## Checks

When changing readiness:

- inspect `sessionDecision`
- inspect `sessionPlan.blocks`
- inspect `saferAlternatives`
- inspect `frontendExplanation`
- confirm the response still makes sense in `/today-readiness`

## Validation

- add or update a focused readiness regression
- run `npm test`
- if live behavior changed, rebuild before checking `/today-readiness`
