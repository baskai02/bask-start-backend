# Module Map

## Source Tree

### API / server

- `src/server.ts`
- `src/api/validation.ts`
- `src/ui/home-page.ts`

### Exercises / readiness

- `src/exercises/library.ts`
- `src/exercises/types.ts`
- `src/exercises/readiness.ts`
- `src/exercises/frontend-response.ts`

### Kai / coaching / planning

- `src/kai/service.ts`
- `src/kai/planner.ts`
- `src/kai/weekly.ts`
- `src/kai/memory.ts`
- `src/kai/behavior.ts`
- `src/kai/coach.ts`
- `src/kai/coaching-copy.ts`
- `src/kai/profile-adapter.ts`
- `src/kai/types.ts`

### Storage / persistence

- `src/store/repositories.ts`
- `src/store/database-repositories.ts`
- `src/store/migration.ts`
- `src/store/app-store.ts`
- `src/store/profile-store.ts`
- `src/store/memory-store.ts`
- `src/store/planned-workout-store.ts`
- `src/store/readiness-history-store.ts`
- `src/store/weekly-chapter-history-store.ts`
- `src/store/storage.ts`

### Development tooling

- `src/dev/scenarios.ts`
- `src/dev/monthly-simulation.ts`
- `src/dev/two-month-simulation.ts`
- `src/dev/state-snapshot.ts`

### Contract tests

- `src/__tests__/frontend-readiness-contract.test.ts`

## Ownership Guide

### Edit `src/kai/planner.ts` when changing

- split style
- progression intent
- weekly template shape
- no-plan suggested-day shape
- target effects and candidate exercise IDs

### Edit `src/exercises/readiness.ts` when changing

- load and recovery logic
- recommendation ranking
- session decisions
- merge behavior between templates and generic recommendations
- final session plan shape

### Edit `src/exercises/frontend-response.ts` when changing

- UI-facing response wording
- frontend explanation shape
- safer alternative ordering in the final frontend payload

### Edit `src/kai/service.ts` when changing

- how planner, readiness, and memory are wired together
- what goes into daily/weekly payloads
- suggested-day context passed into readiness

### Edit `src/store/*` when changing

- persisted state shape
- repository behavior
- snapshot import/export
- database-adapter parity

## Contract-Test Philosophy

The contract test file is intentionally broad.

It is not just unit testing helpers. It is protecting:

- frontend-facing payload shapes
- planner/readiness continuity
- regression-prone ranking behavior
- persistence parity between json and database adapter scaffolds

