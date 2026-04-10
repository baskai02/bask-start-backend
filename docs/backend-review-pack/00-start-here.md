# Start Here

This folder is the fastest way for another model to review the Bask backend as a whole and come back with useful feedback.

## Review Goal

Review the backend as an adaptive coaching system, not as a generic CRUD app.

Good feedback for this repo usually focuses on:

- architectural seams
- planner/readiness continuity
- frontend contract stability
- persistence boundaries
- hidden mode switches
- ranking or merge logic that can override higher-level intent

## What To Read First

1. `00-start-here.md`
2. `01-system-overview.md`
3. `02-runtime-routes-and-flows.md`
4. `03-module-map.md`
5. `05-readiness-contract-and-risks.md`

Then inspect code in:

- `src/server.ts`
- `src/kai/service.ts`
- `src/kai/planner.ts`
- `src/kai/weekly.ts`
- `src/kai/memory.ts`
- `src/exercises/readiness.ts`
- `src/exercises/frontend-response.ts`
- `src/store/repositories.ts`
- `src/store/database-repositories.ts`
- `src/__tests__/frontend-readiness-contract.test.ts`

## Important Runtime Truth

The server runs compiled output from `dist`.

That means:

- `npm start` runs `node dist/server.js`
- source changes in `src` do not matter until `npm run build` is run

Current build metadata is exposed on:

- `GET /health`

Use that endpoint first if anything looks stale.

## Review Commands

```bash
cd /Users/olivergilder/Documents/Bask_start
npm run build
npm test
```

For live server checks:

```bash
pkill -f "node dist/server.js"
npm start
```

Then in another terminal:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/users/user_1/today-readiness?asOf=2026-04-01"
```

## Load-Bearing Test File

Treat this file as a real frontend/backend contract surface:

- `src/__tests__/frontend-readiness-contract.test.ts`

Why that matters:

- these tests define payload shapes and behavioral expectations the frontend depends on
- if a change requires altering these assertions, that is probably a real product contract change, not just a refactor

## Current Review Hotspot

Recent work tightened no-plan suggested-day behavior for pull-biased `upper_body` days.

The important risk there is:

- planner template intent can be silently overridden by generic readiness ranking if merge priority is wrong

That specific bug was fixed, but it is the right kind of area to review for broader architectural feedback.

## Good Review Questions

- Are planner intent and readiness ranking cleanly layered, or are they fighting each other?
- Are there booleans that are becoming hidden mode switches?
- Is the frontend response shape too coupled to internal backend decisions?
- Are repository seams strong enough for a real database migration?
- Are there contract tests missing for important live-server behaviors?

