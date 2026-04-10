# Runtime, Routes, And Flows

## Runtime

Server entrypoint:

- `src/server.ts`

Compiled runtime:

- `dist/server.js`

Important endpoints:

- `GET /`
- `GET /health`
- `GET /exercise-library`
- `GET /profile-options`
- `POST /workouts/completed`
- `POST /workouts/missed`
- `POST /workouts/reset`
- `POST /profiles`
- `GET /users/:userId/workouts`
- `GET /users/:userId/planned-workouts`
- `GET /users/:userId/readiness-history`
- `GET /users/:userId/weekly-chapter-history`
- `GET /users/:userId/signals`
- `GET /users/:userId/profile`
- `GET /users/:userId/memory`
- `GET /users/:userId/kai`
- `GET /users/:userId/kai-weekly`
- `GET /users/:userId/weekly-plan`
- `GET /users/:userId/training-readiness`
- `GET /users/:userId/today-readiness`
- `GET /users/:userId/kai-message`
- `GET /users/:userId/kai-agent-input`
- `GET /users/:userId/kai-agent-response`
- `POST /users/:userId/test-scenarios/:scenario`
- `POST /users/:userId/profile`
- `POST /users/:userId/workouts/completed`
- `POST /users/:userId/workout-sessions`
- `POST /users/:userId/workouts/missed`
- `POST /users/:userId/workouts/reset`
- `POST /users/:userId/planned-workouts`
- `POST /users/:userId/weekly-plan/generate`
- `POST /users/:userId/weekly-plan/replan`
- `POST /users/:userId/planned-workouts/reset`

## Highest-Value Product Flow

### Daily frontend flow

1. frontend fetches `GET /users/:userId/kai?asOf=...`
2. frontend fetches `GET /users/:userId/today-readiness?asOf=...`
3. frontend renders backend-supplied coaching and readiness

### Workout save flow

1. frontend posts to `POST /users/:userId/workout-sessions`
2. backend saves workout
3. backend refreshes memory
4. backend returns updated readiness and Kai payload

### Weekly plan flow

1. frontend or tooling calls `POST /users/:userId/weekly-plan/generate`
2. backend computes weekly plan
3. backend stores planned workouts derived from the plan

### Current-week replan flow

1. caller hits `POST /users/:userId/weekly-plan/replan`
2. backend persists a calmer current-week shape
3. later day-level payloads use that persisted replan

## Debug / Development Flow

Most useful manual scenario route:

- `POST /users/:userId/test-scenarios/:scenario`

Recent high-value scenario:

- `suggested_upper_pull_bias`

Good manual verification sequence:

```bash
curl http://localhost:3000/health
curl -s -X POST http://localhost:3000/users/user_1/test-scenarios/suggested_upper_pull_bias >/dev/null
curl "http://localhost:3000/users/user_1/today-readiness?asOf=2026-04-01"
```

## Important Runtime Gotcha

If curl output looks unchanged after source edits, suspect stale `dist` before suspecting the planner or readiness logic.

