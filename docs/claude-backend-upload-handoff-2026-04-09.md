# Bask Backend Upload Handoff for Claude

Use this file as the single upload-ready backend handoff for Claude.

It describes the current backend shape, the most important files, the latest readiness/planner work, and the exact operational gotcha that matters right now.

## Repo

- Project root: `/Users/olivergilder/Documents/Bask_start`
- Stack: TypeScript + Node HTTP server
- Runtime entrypoint: `dist/server.js`
- Build command: `npm run build`
- Test command: `npm test`
- Start command: `npm start`

Important: `npm start` serves compiled code from `dist`, not `src`. If source files changed, Claude must run `npm run build` before restarting the server or it will keep serving stale behavior.

## What This Backend Is

This is not just a workout tracker. It is an adaptive coaching backend that:

- stores profiles, workouts, planned workouts, and Kai memory
- builds weekly plans
- computes daily readiness from recent training overlap
- preserves planned session identity when possible
- ranks exercises into `recommended`, `deprioritize`, and `avoid`
- generates frontend-ready readiness copy and explanations
- generates Kai coaching payloads from the same underlying backend truth
- supports both structured weekly users and looser no-plan users

The frontend should mostly render backend decisions, not recreate business logic.

## Primary Files

### Planning and coaching

- `src/kai/service.ts`
- `src/kai/planner.ts`
- `src/kai/weekly.ts`
- `src/kai/memory.ts`
- `src/kai/coach.ts`

### Readiness and exercise reasoning

- `src/exercises/readiness.ts`
- `src/exercises/frontend-response.ts`
- `src/exercises/library.ts`
- `src/exercises/types.ts`

### Persistence and scenarios

- `src/store/repositories.ts`
- `src/store/database-repositories.ts`
- `src/dev/scenarios.ts`
- `src/server.ts`

### Contract coverage

- `src/__tests__/frontend-readiness-contract.test.ts`

## Stable Backend Behavior Already In Place

- Exercise library uses movement patterns, muscles, training effects, fatigue, and recovery time.
- Readiness is set-aware and can use `performedSets`.
- Planned days are edited rather than rebuilt from scratch when possible.
- Frontend responses include explanation fields like `planWhy`, `weekContext`, and `startingExercises`.
- Kai weekly output includes weekly review, weekly chapter, weekly arc, progression highlights, and exercise insights.
- The backend supports inferred no-plan workout suggestions based on recent pattern memory.
- Readiness history and weekly chapter history are persisted.
- There are JSON-backed repositories plus a migration/snapshot seam for future database work.

## Latest Change Set: Suggested No-Plan Pull Bias

This was the latest active backend change area.

### Goal

When a user has no planned workout today, but recent behavior strongly suggests an `upper_body` day that has actually been pull-heavy, the backend should:

- suggest `Upper body`
- explain that the suggestion leans into recent pull work
- make the main block genuinely pull-first
- keep presses as support instead of co-equal main examples

### New scenario for server testing

File:

- `src/dev/scenarios.ts`

New scenario:

- `suggested_upper_pull_bias`

It seeds:

- two pull-heavy `upper_body` sessions
- two `lower_body` sessions
- no planned workout for `2026-04-01`
- an intermediate profile with a likely upper/lower pattern

The server route already exposes this scenario through the existing test-scenario endpoint in `src/server.ts`.

### Planner change

File:

- `src/kai/planner.ts`

For inferred `upper_body` suggested days:

- `pull_bias` main slot now emphasizes:
  - `vertical_pull`
  - `horizontal_row`
  - `rear_delt_isolation`
- presses moved to the support slot
- `push_bias` was also made symmetric so pulls do not sit as co-equal main anchors on push-biased suggested days

Relevant area:

- `buildDaySessionTemplate(...)`

### Real bug that was fixed

File:

- `src/exercises/readiness.ts`

The planner template became correct, but the merge step still let generic recommendation ordering leak press movements back into the main pull-biased slot.

The important fix was in:

- `mergeTemplateExerciseIds(...)`

New behavior:

- when `plannedDayContext.isSuggestedDay` is true, template exercise IDs keep priority
- template-ranked IDs stay first
- generic block-only fallbacks are appended afterward

This prevents the corrected pull-biased template from being silently overridden by generic sorting.

## Architecture Notes To Keep In Mind

Two design tensions are worth naming explicitly.

### 1. Template intent vs generic recommendation order

The `mergeTemplateExerciseIds(...)` bug was not just a sorting bug. It exposed a priority inversion:

- the planner builds a template with intent
- the readiness layer also has a generic recommendation order
- if both are treated as peers, generic sorting can silently override a correctly-built template

The current invariant should stay true:

- template intent comes first
- generic fallbacks fill gaps afterward

### 2. `isSuggestedDay` is currently a mode flag

Right now `plannedDayContext.isSuggestedDay` is doing useful work, including protecting suggested-day template ordering.

That is fine for now, but it may eventually want to become a richer context shape instead of a single mode switch. For example, future work may want something like:

- `isSuggestedDay`
- `suggestedDayBias`
- `suggestedDayReason`

So merge and scoring logic can reason about which suggested-day shape is being protected, not just whether the day is suggested at all.

## Current Test Coverage For This Feature

File:

- `src/__tests__/frontend-readiness-contract.test.ts`

Important tests:

- `suggested upper-body day leans into the mix the user actually performs lately`
- `dev scenario seeds a pull-biased suggested upper-body day you can inspect through the server`

These tests assert things like:

- suggested workout label is `Upper body`
- explanation mentions leaning into pull work
- main template label is `Primary pull-biased movement`
- main slot should not include `barbell_bench_press` in the pull-biased template
- top safer alternatives should be pull-first

Latest source-level status at handoff time:

- `npm test` passed

## Important Operational Gotcha

Manual server checks can look wrong even when source is correct if the server was restarted without rebuilding.

Because:

- `npm start` runs `node dist/server.js`

So after any `src` changes, Claude should do:

```bash
cd /Users/olivergilder/Documents/Bask_start
npm run build
pkill -f "node dist/server.js"
npm start
```

Then test in another terminal:

```bash
curl -s -X POST http://localhost:3000/users/user_1/test-scenarios/suggested_upper_pull_bias >/dev/null
curl "http://localhost:3000/users/user_1/today-readiness?asOf=2026-04-01"
```

The key field to inspect is:

- `sessionPlan.blocks[0].exampleExerciseIds`

Expected result after rebuild + restart:

- the main block should stay pull-first
- `barbell_bench_press` should not leak back into the main pull-biased block

One good follow-up improvement would be exposing build metadata on `/health`, so manual curl checks can confirm the running server actually matches the latest build. Even a simple generated `builtAt` timestamp or build hash would reduce stale-`dist` debugging.

## If Claude Needs A Good First Task

1. Rebuild and restart the backend from fresh `dist`.
2. Re-run the `suggested_upper_pull_bias` scenario through the real server.
3. Confirm the live `today-readiness` payload now matches the source-level tests.
4. If it still does not, inspect the path from:
   - `buildSuggestedPlanDay(...)`
   - `buildTrainingReadinessReport(...)`
   - `buildSessionPlan(...)`
   - `mergeTemplateExerciseIds(...)`
   - `buildFrontendTrainingReadinessResponse(...)`

## Suggested Prompt To Claude

Use the uploaded repo plus this handoff file. Focus on the Bask backend only.

First, verify the current suggested no-plan pull-biased `upper_body` behavior by rebuilding, restarting the server, seeding the `suggested_upper_pull_bias` scenario, and checking `GET /users/user_1/today-readiness?asOf=2026-04-01`.

Then confirm that the live server output matches the source-level contract tests:

- the suggestion is `Upper body`
- the explanation mentions leaning into pull work
- the main block stays pull-first
- `barbell_bench_press` does not appear as a co-equal main example in the pull-biased main block

If the live payload still disagrees with the tests, debug the merge path in `src/exercises/readiness.ts` and fix the server-facing behavior without regressing the rest of the readiness contract tests.
