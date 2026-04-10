# System Overview

## What This Backend Does

This backend is an adaptive training and coaching engine.

It is responsible for:

- storing workouts, profiles, planned workouts, memory, readiness history, and weekly chapter history
- building weekly plans
- building suggested no-plan workout days
- computing training readiness from recent load and overlap
- preserving session identity where possible
- generating frontend-ready readiness payloads
- generating Kai daily and weekly coaching payloads

The frontend should mostly render backend truth, not re-derive it.

## Main Product Loop

The core loop is:

1. profile and behavior shape planning
2. weekly planning creates day identity and template intent
3. daily readiness edits that day for current fatigue/recovery
4. frontend renders the response
5. completed workouts feed memory, weekly review, and future planning

## Main Layers

### Profile layer

Owns:

- normalized user inputs
- preferences
- constraints
- equipment access
- pain flags

Primary files:

- `src/kai/profile-adapter.ts`
- `src/kai/types.ts`
- `src/api/validation.ts`

### Weekly planning layer

Owns:

- split style
- target sessions
- workout sequencing
- progression intent
- day exercise intent
- session templates
- no-plan suggested-day inference

Primary files:

- `src/kai/planner.ts`
- `src/kai/weekly.ts`
- `src/kai/service.ts`

### Daily readiness layer

Owns:

- muscle and movement-pattern load summaries
- overlap classification
- exercise ranking
- session decision
- final session plan
- safer alternatives / deprioritized exercises
- frontend explanation shaping

Primary files:

- `src/exercises/readiness.ts`
- `src/exercises/frontend-response.ts`
- `src/exercises/library.ts`
- `src/exercises/types.ts`

### Memory / learning layer

Owns:

- recommendation memory
- recovery framing
- suggested-day drift memory
- session pattern memory

Primary files:

- `src/kai/memory.ts`
- `src/kai/behavior.ts`
- `src/store/memory-store.ts`

### Persistence boundary

Owns:

- json-backed repositories
- database-adapter scaffold
- snapshots and migration bundles

Primary files:

- `src/store/repositories.ts`
- `src/store/database-repositories.ts`
- `src/store/migration.ts`

## Current Architectural Strengths

- planner and readiness are connected enough to preserve day identity
- readiness has richer reasoning than simple muscle buckets
- frontend response builders keep UI-facing copy centralized
- repository seam exists before a real database migration
- contract tests cover a large amount of real product behavior

## Current Architectural Pressure Points

- suggested-day behavior uses `isSuggestedDay` as a growing mode switch
- merge/ranking logic can override higher-level template intent if not carefully protected
- some frontend payloads are detailed enough that contract drift is expensive
- live debugging is easy to get wrong if the running server is stale relative to `src`

