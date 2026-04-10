# Deploy Bask With Render + Supabase

This is the recommended setup for testing Bask from your phone for a while.

## Recommended Stack

- Lovable hosts the frontend.
- Render hosts the Node backend.
- Supabase Postgres stores durable backend state.

The backend remains the source of truth. Supabase is only the database.

## Why This Setup

This setup gives you:

- phone access without your computer running
- durable stored data
- a normal hosted Node backend
- a Postgres database you can keep using later
- a simple path to auth later if you choose Supabase Auth

## Supabase Setup

1. Create a Supabase project.
2. Open the project dashboard.
3. Use the `Connect` flow to copy a Postgres connection string.
4. Prefer the Session pooler connection string if your backend host does not support IPv6.

Supabase's docs say:

- frontend apps should use the Data API
- backend Postgres clients should use a connection string
- persistent clients can use direct connection or session pooler depending on IPv6 support

For Bask, the Node backend is the Postgres client.

## Render Setup

Create a Render Web Service from this repository.

Use:

```text
Build command: npm install && npm run build
Start command: npm start
```

Set environment variables:

```text
BASK_REPOSITORY_BACKEND=postgres
DATABASE_URL=your_supabase_connection_string
CORS_ALLOW_ORIGINS=*
```

Optional:

```text
BASK_POSTGRES_STATE_TABLE=bask_state_snapshots
BASK_POSTGRES_STATE_KEY=default
BASK_POSTGRES_SSL=true
```

For initial Lovable testing, `CORS_ALLOW_ORIGINS=*` is easiest.
Later, tighten it to the real Lovable origin.

Render provides the `PORT` environment variable automatically. The Bask server
already reads `process.env.PORT`.

## What The Backend Stores

The Postgres mode stores one durable backend snapshot in this table:

```text
bask_state_snapshots
```

That snapshot includes:

- workouts
- profiles
- Kai memory
- planned workouts
- readiness history
- weekly chapter history

This is intentionally simple for the first self-test period. It avoids a large
table-by-table migration while still giving you durable Postgres storage.

## Lovable Setup

After Render deploys, copy the Render public URL.

It will look like:

```text
https://your-service.onrender.com
```

Tell Lovable:

```text
Update the shared backend API base URL constant.

Replace the current localhost value with:

https://your-service.onrender.com

Keep the API layer structure the same.
Do not change any fetch helper names.

Then run the backend debug panel and confirm:
- GET /health succeeds
- GET /users/user_1/app-state?asOf=2026-03-30 succeeds
```

## Smoke Tests

After deploy, test:

```bash
curl -i https://your-service.onrender.com/health
curl -s https://your-service.onrender.com/users/user_1/app-state?asOf=2026-03-30
```

Then seed a scenario:

```bash
curl -s -X POST https://your-service.onrender.com/users/user_1/test-scenarios/thin_history_equipment_limited_upper
curl -s https://your-service.onrender.com/users/user_1/app-state?asOf=2026-03-30
```

Expected:

- `profile.equipmentAccess` is `bodyweight_only`
- `todayReadiness.frontendCopy.primaryAction` mentions `pull-up`
- `todayReadiness.frontendExplanation.startingExercises` is `["Pull-up"]`
- `todayReadiness.sessionPlan.blocks[0].exampleExerciseIds` is `["pull_up"]`

## Local Postgres Mode

You can also run Postgres mode locally:

```bash
BASK_REPOSITORY_BACKEND=postgres \
DATABASE_URL="postgres://..." \
CORS_ALLOW_ORIGINS="*" \
npm start
```

Local JSON mode still works by default:

```bash
npm start
```
