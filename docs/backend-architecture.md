# Backend Architecture

This file is the shortest useful map of the Bask backend.

Use it as the source of truth for:

- what the backend is responsible for
- which modules own which decisions
- what must stay true when editing the system
- how weekly planning, daily readiness, memory, and Kai fit together

## Product Shape

This backend is an adaptive coaching engine, not just a workout tracker.

It is responsible for:

- understanding the user
- understanding recovery and overlap
- generating a weekly plan
- generating a daily recommendation
- preserving session identity when modifying a day
- explaining the recommendation in frontend-ready language
- learning lightly from recent behavior

The frontend should render the backend's decisions, not recreate them.

## Main Layers

### 1. Profile Layer

Primary files:

- `src/kai/types.ts`
- `src/kai/profile-adapter.ts`
- `src/api/validation.ts`
- `src/store/profile-store.ts`

Purpose:

- normalize onboarding/app inputs into one coaching profile
- hold preferences and constraints
- make planning and recommendation logic more personalized

Important current fields:

- `goal`
- `experienceLevel`
- `targetSessionsPerWeek`
- `preferredWorkoutDays`
- `preferredSessionLength`
- `trainingStylePreference`
- `confidenceLevel`
- `focusMuscles`
- `favoriteExerciseIds`
- `dislikedExerciseIds`
- `painFlags`

## 2. Exercise Library Layer

Primary files:

- `src/exercises/library.ts`
- `src/exercises/types.ts`

Purpose:

- define the canonical exercise catalog
- define movement patterns, muscle involvement, fatigue cost, and training effects

Important concept:

The system reasons in both muscles and training effects.

Examples of training effects:

- `horizontal_press`
- `vertical_pull`
- `quad_bias`
- `hamstring_isolation`
- `rear_delt_isolation`
- `neutral_grip_curl`

This makes substitutions and fallbacks more precise than broad muscle buckets alone.

## 3. Memory Layer

Primary files:

- `src/kai/memory.ts`
- `src/store/memory-store.ts`
- `src/kai/behavior.ts`

Purpose:

- track lightweight coaching memory over time
- hold recovery-state framing around the user
- hold recommendation memory

Important current memory concepts:

- `recoveryStatus`
- `recommendationTrustScore`
- `nextRecoveryAction`
- recommendation memory by:
  - `byExerciseId`
  - `byExerciseSlotKey`
  - `byReasonTag`

Important design choice:

Memory is a ranking nudge, not an override.
Recovery and safety still win.

## 4. Weekly Planning Layer

Primary files:

- `src/kai/planner.ts`
- `src/kai/weekly.ts`
- `src/store/planned-workout-store.ts`

Purpose:

- generate a 7-day plan
- choose split style
- choose planned days
- adapt the week from adherence and recovery state
- assign progression intent per day
- assign exercise intent per day
- assign session templates per day

Current weekly plan day shape includes:

- `workoutType`
- `plannedDuration`
- `progressionIntent`
- `exerciseIntent`
- `sessionTemplate`
- `rationale`

Current progression intents:

- `build`
- `repeat`
- `conservative`

Current session template shape:

- slots:
  - `main`
  - `secondary`
  - `accessory`
- each slot carries:
  - label
  - target effects
  - candidate exercise IDs
  - prescription intent

## 5. Daily Readiness Layer

Primary files:

- `src/exercises/readiness.ts`
- `src/exercises/frontend-response.ts`

Purpose:

- summarize recent fatigue by muscle and movement pattern
- classify overlap as recovered / recovering / overworked
- score exercises for today
- generate the session decision
- generate the session plan

Current session decision statuses:

- `train_as_planned`
- `train_modified`
- `train_light`
- effective `accessory_only` plans via session plan finalization

Important current behavior:

- daily readiness consumes the weekly planned day context
- daily readiness edits the planned template instead of rebuilding from scratch
- slot-level planned prescription intent is adjusted through today’s readiness
- recommendation memory and profile preferences influence exercise scoring

## 6. Kai Communication Layer

Primary files:

- `src/kai/service.ts`
- `src/kai/coach.ts`
- `src/kai/weekly.ts`

Purpose:

- expose the product-facing coaching payload
- keep Kai messaging aligned with real readiness and weekly context

Important design choice:

Kai should explain the same backend truth the readiness engine is using.
Kai is not a separate decision-maker.

## 7. Persistence Boundary

Primary files:

- `src/store/repositories.ts`
- `src/store/app-store.ts`
- `src/store/profile-store.ts`
- `src/store/memory-store.ts`
- `src/store/planned-workout-store.ts`
- `src/dev/state-snapshot.ts`

Purpose:

- keep the coaching engine separate from storage mechanics
- expose one coherent backend state shape across workouts, profiles, memory, and planned workouts
- provide a safe migration seam for future database-backed persistence

Current capabilities:

- full backend snapshot export
- full backend snapshot import
- single-user snapshot export
- single-user snapshot import

Important design choice:

The repository layer is the persistence boundary.
Future database adapters should plug in here without changing planner, readiness, memory, or Kai logic.

## System Flow

Typical flow for a planned day:

1. profile is loaded and normalized
2. memory is refreshed from behavior signals and recent workouts
3. weekly plan is generated or read conceptually for the current week
4. today’s planned day context is extracted
5. readiness computes fatigue and recommendation scoring
6. readiness edits the planned session template for today
7. frontend-ready copy is built
8. Kai message is generated from the same state

Typical persistence flow:

1. repositories expose the current persisted state as one snapshot
2. dev tooling can export or restore that snapshot
3. future database-backed repositories should preserve the same snapshot shape

## Core Invariants

These should stay true unless there is a strong reason to change them.

### 1. Preserve session identity first

If today is push day, the backend should try to keep it push day.
Do not jump to unrelated “safe” exercises too early.

### 2. Weekly plan and daily readiness should feel like one system

The daily recommendation should behave like an edited version of the planned day, not a separate brain.

### 3. Recovery wins over preference

Favorites, memory, and focus-muscle signals can bias ranking.
They must not override safety and overlap constraints.

### 4. Frontend should render, not invent

Business logic belongs in the backend.

### 5. Storage should stay behind the repository boundary

Do not let planner, readiness, memory, or Kai logic become coupled to JSON-file details.
If persistence changes later, the coaching core should not need a rewrite.
Frontend should not recreate readiness, progression, or coaching logic.

### 5. Simulation and contract tests protect behavior

If a change affects planning, readiness, memory, or contract shape, update tests accordingly.

## What Is Strong Right Now

- daily readiness and overlap logic
- session identity preservation
- weekly planning with progression intent
- weekly day session templates
- slot-level prescription guidance
- daily editing of planned templates
- slot-aware recommendation memory
- contract test coverage
- cohort simulation harnesses

## What Is Still Early

- richer persistence beyond JSON
- explicit per-slot workout outcome logging
- deeper long-term adaptation beyond lightweight memory
- broader outcome learning from comparable sessions

## Best Mental Model

Think of the system as:

- profile decides what kind of user this is
- planner decides what the week should try to be
- readiness decides what today can honestly become
- Kai explains that decision clearly
- memory nudges future ranking and prescription depth
