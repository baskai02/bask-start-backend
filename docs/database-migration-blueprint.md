# Database Migration Blueprint

This file is the cleanest short plan for moving Bask from JSON-backed persistence to a real database-backed repository layer.

Use it when deciding:

- whether to move to Supabase/Postgres yet
- how to map the current backend state into tables
- what should change first
- what should *not* change during migration

## Goal

Move persistence to a real database without rewriting the coaching core.

That means:

- planner logic stays in `src/kai/*`
- readiness logic stays in `src/exercises/*`
- Kai messaging stays in `src/kai/*`
- only the repository implementation changes

The repository boundary in `src/store/repositories.ts` is now the migration seam.

## Current Persistence Formats

The backend already supports two useful export/import formats:

### 1. Snapshot format

Nested app-state shape:

- workouts by user
- profiles by user
- memory by user
- planned workouts by user

Best use:

- exact backup/restore
- local debugging
- full app-state cloning

### 2. Migration bundle format

Flat row-oriented shape:

- `workouts[]`
- `profiles[]`
- `memory[]`
- `plannedWorkouts[]`

Best use:

- database seeding
- migration scripts
- future Supabase/Postgres import

## Recommended First Database Tables

These should be the first database-backed tables because they already map cleanly to the current backend.

### 1. `profiles`

One row per user.

Suggested columns:

- `user_id` primary key
- `name`
- `goal`
- `experience_level`
- `target_sessions_per_week`
- `preferred_workout_days` json/array
- `preferred_session_length`
- `training_style_preference`
- `confidence_level`
- `focus_muscles` json/array
- `favorite_exercise_ids` json/array
- `disliked_exercise_ids` json/array
- `pain_flags` json/array
- `constraints` json/array
- `tone_preference`
- timestamps

### 2. `workouts`

One row per completed or missed workout event.

Suggested columns:

- `id` primary key
- `user_id`
- `date`
- `recorded_at`
- `type`
- `status`
- `planned_duration`
- `completed_duration` nullable
- `session_exercises` json
- `outcome_summary` json
- timestamps

### 3. `kai_memory`

One row per user.

Suggested columns:

- `user_id` primary key
- `name`
- `goal`
- `experience_level`
- `motivation_style`
- `consistency_status`
- `consistency_score`
- `current_streak`
- `recent_completed_count`
- `recent_missed_count`
- `last_activity_at`
- `restart_style`
- `consistency_risk`
- `recovery_status`
- `recommendation_trust_score`
- `recommendation_memory` json
- `next_recovery_action` json nullable
- `coaching_note`
- `last_updated`

### 4. `planned_workouts`

One row per planned day.

Suggested columns:

- `id` primary key
- `user_id`
- `date`
- `type`
- `planned_duration`
- `replan` json nullable
- timestamps

## Tables To Avoid Early

Do not over-normalize too early.

Probably avoid splitting these immediately:

- session exercises into a separate join table
- recommendation memory into multiple relational tables
- weekly plans into permanent first-class tables

Why:

- the current coaching engine still changes quickly
- some state is better kept as JSON until the shape stabilizes further

## Recommended Repository Migration Order

This is the safest order.

### Phase 1. Keep JSON as source of truth, prove mapping

Use the flat migration bundle as the contract.

Do:

- export current state
- verify row mappings
- confirm that every current persisted concept fits the proposed schema

Do not:

- touch planner/readiness/Kai logic

### Phase 2. Add database-backed repository scaffold

Create a parallel repository implementation that satisfies the same `BaskRepositories` interface.

Example future shape:

- `createJsonRepositories(...)`
- `createDatabaseRepositories(...)`

At first, the database-backed version can even be partial or read-only.

### Phase 3. Read-path migration

Switch safe reads first:

- profiles
- planned workouts
- workouts
- memory last

This lets us validate behavior without risking write corruption too early.

### Phase 4. Write-path migration

After reads are trusted:

- completed workout writes
- missed workout writes
- planned workout writes
- memory updates

### Phase 5. Remove JSON as source of truth

Only after:

- parity checks are stable
- simulations still behave normally
- contract tests pass unchanged

## What Must Stay Stable During Migration

These are the key invariants.

### 1. Repository interface first

Migration should happen behind the repository boundary.

### 2. Coaching logic should not learn SQL details

Planner, readiness, memory, and Kai should not know whether data came from JSON or Postgres.

### 3. Snapshot shape should stay valid

Even after moving to a database, it should still be possible to export:

- full app snapshot
- flat migration bundle
- user-scoped snapshot

### 4. Tests should remain backend-behavior focused

The important question is not “did we write SQL.”
It is:

- did weekly planning still behave the same
- did readiness still behave the same
- did memory still behave the same

## Best Immediate Next Step

If we choose to start real DB work, the safest first implementation step is:

### build a `createDatabaseRepositories` scaffold

That scaffold should:

- satisfy the same `BaskRepositories` interface
- initially support export/import and basic reads
- leave the JSON implementation untouched

Current status:

- `createDatabaseRepositories(...)` now exists as an adapter-backed scaffold
- `createInMemoryDatabaseAdapter()` exists for local testing of the repository boundary
- `createFileDatabaseAdapter()` now exists for durable adapter-backed state in one JSON file (`backend-state.json`)
- `BASK_REPOSITORY_BACKEND=database_adapter` switches server and snapshot tooling onto the adapter path

That gives us parallel infrastructure without destabilizing the app.

## Short Recommendation

Do not jump straight into a full Supabase rewrite.

The right move is:

1. keep the repository boundary
2. keep the snapshot and migration bundle formats
3. add a database-backed repository implementation behind the same interface
4. migrate reads before writes

That is the safest path from the current strong coaching backend to real persistence.
