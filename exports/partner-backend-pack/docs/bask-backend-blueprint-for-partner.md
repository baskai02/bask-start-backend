# Bask Backend Blueprint

## Goal

Build a coaching backend that can do three things well:

1. understand what the user is likely recovered for today
2. preserve the identity of the planned session while adjusting it intelligently
3. explain the recommendation in product-ready language that the frontend can render directly

This backend is not meant to be just a tracker or a generic recommender. It is the decision layer for an adaptive coach.

## What Exists Today

The current backend already supports:

- user profile storage
- workout history storage
- planned workout storage
- Kai memory storage
- daily readiness analysis
- session modification logic
- accessory-only degraded mode
- safer alternative ranking
- substitution suggestions
- frontend-ready response copy
- Kai coaching output aligned to the same logic
- contract tests for frontend payload stability
- a month-long simulation harness for repeated-training validation

## Core Product Principle

If the user has a planned workout today, the backend should try to preserve that session identity.

Examples:

- push day should stay push day if possible
- pull day should stay pull day if possible
- lower body should stay lower body if possible

If fatigue is high:

- first modify the session
- then degrade to accessory-only if needed
- do not jump to unrelated “safe” exercises unless on-plan options are exhausted

This is one of the key product differences between this backend and a generic exercise recommender.

## Current Module Shape

### 1. Exercise library

Files:

- `src/exercises/library.ts`
- `src/exercises/types.ts`

Purpose:

- define the exercise catalog
- attach training metadata to each exercise

Each exercise currently carries:

- movement pattern
- primary muscles
- secondary muscles
- stabilizers
- fatigue score
- recovery time
- training effects
- equipment type
- alternatives

Important concept:

The system does not think only in broad categories like “back” or “legs.”
It also thinks in training effects such as:

- `horizontal_press`
- `vertical_pull`
- `quad_bias`
- `hamstring_isolation`
- `neutral_grip_curl`
- `upper_trap_isolation`
- `rear_delt_isolation`

That makes fallback decisions much more precise.

### 2. Readiness engine

File:

- `src/exercises/readiness.ts`

Purpose:

- compute daily readiness from recent training history
- summarize fatigue by muscle and movement pattern
- produce session decisions and exercise recommendations

Main responsibilities:

- calculate exercise load from completed sessions
- decay unresolved fatigue over time
- aggregate by muscle and movement pattern
- classify muscles/patterns as:
  - recovered
  - recovering
  - overworked
- score every exercise in the library for today
- group results into:
  - recommended
  - deprioritize
  - avoid
- derive:
  - tolerance: green / yellow / red
  - fallback tier: best / acceptable

Important current behavior:

- readiness is filtered by planned workout type
- push decisions react mainly to push overlap
- pull decisions react mainly to pull overlap
- lower decisions react mainly to lower-body overlap

This was an important improvement because global fatigue alone made the system too conservative.

### 3. Session decision layer

Built inside:

- `src/exercises/readiness.ts`

Purpose:

- convert fatigue signals into a practical decision for today

Current statuses:

- `train_as_planned`
- `train_modified`
- `train_light`
- effective degraded `accessory_only` session plans

The session decision includes:

- summary
- session mode
- volume adjustment
- intensity adjustment
- notes explaining what drove the decision

### 4. Session plan builder

Built inside:

- `src/exercises/readiness.ts`

Purpose:

- turn the decision into a structured session plan the frontend can render

Each plan includes:

- session style
  - normal
  - modified
  - accessory_only
- objective
- coach note
- focus muscles
- limit muscles
- limit patterns
- volume guidance
- intensity guidance
- blocks

Each block includes:

- slot
  - main
  - secondary
  - accessory
- focus text
- block tier
- example exercise ids
- hydrated example exercises with tolerance and fallback tier

This makes the response directly usable by the frontend.

### 5. Frontend response builder

File:

- `src/exercises/frontend-response.ts`

Purpose:

- convert internal readiness output into a stable frontend contract

The response exposes:

- `frontendCopy.sessionLabel`
- `frontendCopy.readinessHeadline`
- `frontendCopy.primaryAction`
- `frontendCopy.fallbackNote`
- `sessionDecision`
- `sessionPlan`
- `substitutionOptions`
- `saferAlternatives`
- `exercisesToAvoidToday`
- `overworkedMuscles`
- `recoveringMuscles`

Important design choice:

The frontend does not need to invent coaching language.
The backend already returns product-ready copy.

### 6. Kai layer

Files:

- `src/kai/service.ts`
- `src/kai/coach.ts`
- `src/kai/types.ts`

Purpose:

- build the coaching payload shown on the dashboard
- keep Kai messaging aligned with the actual readiness logic

Kai currently uses:

- profile
- today status
- recent event
- memory
- behavior signals
- planned workout
- readiness-aligned coaching copy

Important design choice:

Kai is not a separate intelligence system making unrelated decisions.
It is a coaching voice layered on top of the same readiness/session engine.

### 7. Stores

Files:

- `src/store/app-store.ts`
- `src/store/profile-store.ts`
- `src/store/memory-store.ts`
- `src/store/planned-workout-store.ts`

Purpose:

- provide a simple storage abstraction for:
  - workouts
  - profiles
  - Kai memory
  - planned workouts

Current implementation is JSON-backed.
The abstraction is designed so this can later move to Supabase or Postgres.

### 8. Server

File:

- `src/server.ts`

Purpose:

- expose the backend as a usable product API

Current routes include:

- `GET /health`
- `GET /exercise-library`
- `GET /users/:userId/kai`
- `GET /users/:userId/today-readiness`
- `GET /users/:userId/profile`
- `GET /users/:userId/memory`
- `GET /users/:userId/signals`
- `GET /users/:userId/workouts`
- `GET /users/:userId/planned-workouts`
- `POST /workouts/completed`
- `POST /workouts/missed`
- `POST /workouts/reset`
- `POST /profiles`
- `POST /users/:userId/workout-sessions`
- test-scenario seed routes

It also supports:

- CORS
- preflight handling
- a simple home/test page

### 9. Scenarios and simulation

Files:

- `src/dev/scenarios.ts`
- `src/dev/monthly-simulation.ts`

Purpose:

- validate the backend on known scenario states
- pressure-test the system over repeated training

The month simulation currently:

- simulates 28 days
- 6 training days per week
- push / pull / legs
- intermediate user
- records chosen session style for each day
- writes a report to `reports/monthly-ppl-simulation.json`

This has been important for surfacing issues that one-day scenario tests would miss.

## Current Coaching Logic

### Inputs the backend uses

- user profile
- experience level
- workout history
- planned workout for today
- consistency signals
- Kai memory

### Readiness reasoning

The backend looks at:

- unresolved muscle load
- unresolved movement-pattern load
- hours since each area was last trained
- recovery time by exercise
- exercise overlap
- plan relevance

It does not just ask “is the user fatigued?”
It asks:

- what is fatigued
- how relevant is that to today’s plan
- what part of the planned session can still be preserved

### Current experience-aware behavior

The system already treats:

- beginners more conservatively
- intermediates with more tolerance for repeated exposure

This matters a lot for high-frequency programs like 6-day PPL.

### Current fallback logic

The backend currently tries to surface:

- best-tolerated on-plan work first
- acceptable on-plan fallback second
- avoid list separately

Recent pull-specific tuning made it more realistic by:

- treating shrug more like a true upper-trap isolation fallback
- softening neutral-grip curl guardrails slightly for constrained pull fallback decisions

## Current Strengths

### 1. Daily execution quality

This is the strongest part of the system right now.

It can answer:

- what should I do today?
- should I train normally?
- what should I avoid?
- what can I swap?
- should this become an accessory-only day?

### 2. Session identity preservation

This is one of the backend’s best qualities.

It does not panic into random safe movements.
It tries to keep the user on the planned day.

### 3. Frontend-ready contract

The frontend receives:

- stable structure
- session blocks
- ready-made copy
- alternatives
- substitutions

This has made UI integration much easier.

### 4. Testability

The backend is not only scenario-tested.
It is also tested through:

- frontend contract tests
- month-long simulation

## What Is Still Missing

### 1. Weekly planning engine

The backend is strongest at reacting to today.
It does not yet fully own:

- what the week should be
- how next week should adapt
- long-term distribution of stress and progression

### 2. Progression logic

It does not yet deeply manage:

- load progression
- rep progression
- when to repeat vs advance
- when to rotate exercises

### 3. Rich personalization layer

The current system knows:

- goal
- experience
- behavior signals

But it does not yet deeply use:

- equipment constraints
- preferences
- disliked exercises
- pain/injury constraints
- adherence-by-exercise memory

### 4. Production data layer

Storage is still JSON-backed.
The store abstraction is ready to be swapped, but the migration has not happened yet.

## Current Testing State

### Frontend contract tests

The backend currently has explicit contract coverage for:

- normal planned session
- push accessory-only fallback
- pull accessory-only fallback
- modified lower-body session
- substitution-copy path

### Month simulation

Current intermediate 6-day PPL month is roughly landing around:

- 17 normal sessions
- 3 modified sessions
- 4 accessory-only sessions

This is much healthier than the earlier over-conservative versions.

## Current Product Boundary

The backend currently owns:

- coaching logic
- readiness logic
- fallback logic
- substitution logic
- response copy

The frontend should own:

- rendering
- navigation
- presentation
- interaction flow

The frontend should not recreate readiness logic.

## Suggested Next Direction

The next major build step is a weekly planning engine.

Recommended direction:

1. keep the current readiness engine as the execution layer
2. add a weekly planner that decides what the week should be
3. let readiness modify that weekly plan day by day
4. later, add a richer behavior/personalization layer on top

That would move the system from:

- strong daily adaptive coach

to:

- true adaptive training system

## Implementation Philosophy

The backend should remain:

- product-first
- coach-like
- explainable
- testable over time

If complexity is added, it should improve one of these:

- day-level coaching quality
- weekly planning quality
- personalization
- reliability of product behavior

Not complexity for its own sake.
