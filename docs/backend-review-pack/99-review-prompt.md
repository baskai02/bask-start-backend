# Review Prompt

Use this repo plus the docs in `docs/backend-review-pack/`.

Review the Bask backend as a coaching engine. Focus on architecture, invariants, data flow, planner/readiness continuity, contract stability, and persistence seams.

Please do all of the following:

1. Read the review-pack docs first.
2. Inspect the main backend files:
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
3. Give feedback on:
   - the strongest architectural decisions
   - the clearest design tensions
   - likely hidden regressions
   - what is stable enough to stop tuning
   - what the next backend change should be

If you notice a bug pattern, explain:

- the local symptom
- the deeper architectural cause
- the smallest clean fix

Do not treat this as a generic code review. Treat it as a review of a layered backend coaching system.
