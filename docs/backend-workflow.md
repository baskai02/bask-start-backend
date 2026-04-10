# Backend Workflow

This file is the shortest useful workflow guide for editing the Bask backend safely.

Use it when making changes to:

- weekly planning
- daily readiness
- Kai memory
- onboarding/profile inputs
- frontend contract shapes

## Editing Rule

Prefer small, testable slices.

For this backend, the safest pattern is:

1. identify the owning layer
2. make the smallest coherent change there
3. update contract tests if behavior changed
4. run the test suite
5. only then widen the change

## Layer Ownership

Use these boundaries when deciding where code should go.

### Profile / onboarding

Edit:

- `src/kai/types.ts`
- `src/kai/profile-adapter.ts`
- `src/api/validation.ts`
- `src/store/profile-store.ts`

Use for:

- new profile fields
- app input normalization
- profile-driven planning/recommendation logic

### Weekly planning

Edit:

- `src/kai/planner.ts`
- `src/kai/service.ts`
- `src/store/planned-workout-store.ts`

Use for:

- split selection
- target sessions
- progression intent
- day exercise intent
- session templates
- comparable-session feedback

### Daily readiness

Edit:

- `src/exercises/readiness.ts`
- `src/exercises/frontend-response.ts`

Use for:

- fatigue logic
- exercise ranking
- session decisions
- session plan construction
- template editing for today

### Memory / learning

Edit:

- `src/kai/memory.ts`
- `src/store/memory-store.ts`

Use for:

- recommendation memory
- recovery status framing
- lightweight learning from completed sessions

### API / contract

Edit:

- `src/server.ts`
- `docs/lovable-api-contract.md`
- `src/__tests__/frontend-readiness-contract.test.ts`

Use for:

- endpoint shape changes
- request/response contract changes
- frontend-facing payload changes

## Safe Change Patterns

### When changing weekly planning

Typical checklist:

1. update `src/kai/planner.ts`
2. update tests in `src/__tests__/frontend-readiness-contract.test.ts`
3. run:

```bash
npm test
```

If the change affects longer-term behavior, also run:

```bash
npm run simulate:cohorts
```

### When changing daily readiness

Typical checklist:

1. update `src/exercises/readiness.ts`
2. keep session identity preservation intact
3. verify planned template continuity still works
4. update contract tests
5. run:

```bash
npm test
```

### When changing recommendation memory

Typical checklist:

1. update `src/kai/memory.ts`
2. update any type changes in:
   - `src/kai/types.ts`
   - `src/exercises/types.ts`
3. confirm readiness still consumes the memory safely
4. add a focused regression test
5. run:

```bash
npm test
```

### When changing frontend payloads

Typical checklist:

1. update `src/server.ts` or response builders
2. update `docs/lovable-api-contract.md`
3. update contract tests
4. run:

```bash
npm test
```

## What To Protect

These are easy to accidentally damage.

### 1. Session identity preservation

Do not make the system jump off-plan too early.

### 2. Planner/readiness continuity

Do not let weekly planning and daily readiness drift into separate systems.

### 3. Memory as a nudge only

Recommendation memory should bias ranking, not overpower recovery/safety.

### 4. Frontend contract stability

If the payload changes, treat it like a real interface change.

## Test Strategy

### Fast default

Run:

```bash
npm test
```

This is the default verification step.

### Deeper planning/regression confidence

Run:

```bash
npm run simulate:cohorts
```

Use this after meaningful changes to:

- weekly planner
- progression logic
- adherence adaptation
- full-body / PPL behavior

### Local month pressure test

Run:

```bash
npm run simulate:month
```

### Persistence snapshot / restore

Use this when you want a clean backup, migration fixture, or comparison artifact for the current JSON-backed backend state.

Examples:

```bash
npm run state:snapshot -- export reports/backend-state-snapshot.json
npm run state:snapshot -- export-flat reports/backend-migration-bundle.json
npm run state:snapshot -- export-user user_1 reports/user_1-state.json
npm run state:snapshot -- export-user-flat user_1 reports/user_1-migration-bundle.json
npm run state:snapshot -- import reports/backend-state-snapshot.json
npm run state:snapshot -- import-flat reports/backend-migration-bundle.json
```

Use this when tuning repeated training behavior for a specific persona.

### Repository backend mode (JSON vs adapter state file)

By default, the server and snapshot CLI use the existing JSON file stores (`data/workouts.json`, `data/profiles.json`, `data/kai-memory.json`, `data/planned-workouts.json`).

You can switch to the adapter-backed single state file mode by setting:

```bash
BASK_REPOSITORY_BACKEND=database_adapter
```

Optional override for the adapter state file path:

```bash
BASK_DATABASE_STATE_FILE=/absolute/path/backend-state.json
```

This lets us exercise the database-style repository boundary now, while still keeping the coaching logic unchanged.

## Heuristics For Good Changes

Good changes usually:

- improve continuity
- improve specificity without adding chaos
- keep recovery logic clear
- make the week feel more believable
- make the recommendation easier to explain

Suspicious changes usually:

- add lots of new branches without tests
- duplicate logic between planner and readiness
- move business logic into server glue or frontend contract shaping
- let preference or memory override fatigue

## Current Best Next-Step Categories

When looking for the next useful backend improvement, prefer:

1. better comparable-session learning
2. better session outcome representation
3. better persistence and storage boundaries
4. stronger planning continuity

Avoid spending too long on:

- frontend polish
- overcomplicated abstractions
- massive refactors without test pressure

## How To Use These Docs

Before a significant backend change:

1. read `docs/backend-architecture.md`
2. identify the layer you are changing
3. follow the workflow here
4. keep the change narrow
5. validate with `npm test`

These docs are meant to make future coding sessions faster and more consistent.
They are intentionally short and operational, not exhaustive.
