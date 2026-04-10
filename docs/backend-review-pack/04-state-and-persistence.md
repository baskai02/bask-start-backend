# State And Persistence

## Current Persistence Model

The backend persists through repository interfaces.

Primary repository factory:

- `src/store/repositories.ts`

Database scaffold:

- `src/store/database-repositories.ts`

## Persisted Concepts

The main persisted concepts are:

- workouts
- profiles
- Kai memory
- planned workouts
- readiness history
- weekly chapter history

## Current JSON Files

Stored under `data/`:

- `data/workouts.json`
- `data/profiles.json`
- `data/kai-memory.json`
- `data/planned-workouts.json`
- `data/readiness-history.json`
- `data/weekly-chapter-history.json`
- `data/backend-state.json`

## Repository Snapshot Shape

`BaskStateSnapshot` includes:

- workouts by user
- profiles by user
- memory by user
- planned workouts by user
- readiness history by user
- weekly chapter history by user

There is also a single-user export/import shape.

## Why This Matters

This repository seam is the current migration boundary.

The intent is:

- coaching logic stays in `src/kai/*` and `src/exercises/*`
- storage can change underneath it

Good review feedback here should focus on:

- whether the repository interface is clean enough
- whether domain logic is leaking into storage code
- whether current persisted shapes are too coupled to transient logic

## Build Metadata

Build metadata is now generated during `npm run build` into:

- `dist/build-info.json`

And exposed through:

- `GET /health`

This is there to reduce stale-build confusion during manual verification.

## Migration Review Questions

- Is the repository interface stable enough for a real Postgres/Supabase implementation?
- Are there any domain objects that should stop being persisted raw?
- Are there places where json-backed stores are hiding ordering assumptions or implicit defaults?
- Is import/export normalization strong enough for forward compatibility?

