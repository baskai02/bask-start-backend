# Kai MVP Backend

This project is a small, beginner-friendly backend starting point for Kai.

For the current frontend/backend handoff contract, see:

- [docs/lovable-api-contract.md](/Users/olivergilder/Documents/Bask_start/docs/lovable-api-contract.md)

The first real MVP foundation in this repo is the behavior tracking layer:

- track `workout completed`
- track `workout missed`
- derive `current streak`
- derive `consistency status`
- derive `last activity date`

Everything is intentionally simple and local:

- no database yet, just a JSON file
- tiny local API only
- no AI dependency yet
- no advanced architecture yet

## Current Structure

- `src/kai/types.ts`
  Shared TypeScript types for workouts, events, state, and behavior signals.
- `src/kai/tracker.ts`
  The first real Kai foundation. It records workout outcomes and calculates behavior signals.
- `src/kai/tracker-example.ts`
  A tiny manual example that shows how the tracker works.
- `src/kai/coach.ts`
  The first simple Kai message layer. It turns behavior signals and the most recent event into one coaching message.
- `src/kai/agent-prompt.ts`
  Kai's future system prompt and user prompt template for when you connect a real AI model.
- `src/kai/agent-context.ts`
  Builds the structured context object that a real Kai agent would receive.
- `src/kai/agent-types.ts`
  Defines the structured context and response shapes for the future Kai agent layer.
- `src/kai/memory.ts`
  Builds the first structured Kai memory object for each user.
- `src/kai/agent-client.ts`
  Makes the first real server-side OpenAI call for Kai and parses the JSON response.
- `src/ui/home-page.ts`
  A tiny browser page so you can click buttons and see Kai update without using curl.
- `src/store/memory-store.ts`
  Stores Kai's structured per-user memory in a local JSON file.
- `src/store/app-store.ts`
  A very small local store that keeps workouts by user and saves them to a JSON file.
- `src/store/profile-store.ts`
  A tiny local store for user profiles like name, goal, and experience level.
- `src/store/planned-workout-store.ts`
  A tiny local store for planned workouts so the backend can track intended sessions separately from completed or missed logs.
- `src/server.ts`
  A tiny Node server with a few routes so you can interact with the tracker like a real backend.
- `data/workouts.json`
  The local JSON file used to persist workout history between server restarts.
- `data/profiles.json`
  The local JSON file used to persist user profile information.
- `data/kai-memory.json`
  The local JSON file used to persist Kai's per-user memory.
- `data/planned-workouts.json`
  The local JSON file used to persist planned workouts by user.
- `src/kai/state.ts`
  Existing derived Kai state logic from the earlier scaffold.
- `src/kai/rules.ts`
  Existing rule-based coaching decisions from the earlier scaffold.
- `src/kai/templates.ts`
  Existing message templates from the earlier scaffold.
- `src/kai/engine.ts`
  Existing orchestration for message generation from the earlier scaffold.

## Manual Test

1. Install dependencies:

```bash
npm install
```

2. Compile the project:

```bash
npm run build
```

3. Run the tracker example:

```bash
node dist/kai/tracker-example.js
```

You should see:

- an array of tracked workouts
- a `signals` object with fields like:
  `lastActivityAt`, `recentCompletedCount`, `recentMissedCount`, `currentStreak`, `longestStreak`, `consistencyScore`, and `consistencyStatus`

## Manual Test With The Local API

## Connect From Lovable

If Lovable is running on a different origin than this backend, start the server with
`CORS_ALLOW_ORIGINS` set to the Lovable app origin.

Example:

```bash
CORS_ALLOW_ORIGINS="https://your-lovable-app.lovable.app,http://localhost:5173" npm start
```

### Railway + Lovable

If you want Lovable's hosted preview to reach the backend, deploy this backend to
Railway and use the Railway public URL as the frontend API base URL.

This server supports Railway's injected port automatically via `process.env.PORT`.

Recommended Railway environment variables:

```bash
CORS_ALLOW_ORIGINS=*
```

Use `*` for temporary testing only. Once the app is connected, tighten this to
the real Lovable origin or origins.

Then point Lovable at:

```text
https://your-railway-service.up.railway.app
```

### Recommended Longer Self-Test Setup

For testing Bask from your phone for a while, the recommended setup is:

```text
Lovable frontend
Render backend
Supabase Postgres database
```

See [docs/deploy-render-supabase.md](/Users/olivergilder/Documents/Bask_start/docs/deploy-render-supabase.md).

Notes:

- use a comma-separated list when you want to allow both Lovable and a local frontend
- use `*` during local debugging if you do not need a stricter allow-list
- the backend now handles `OPTIONS` preflight requests automatically

For the cleanest Lovable handoff, start with:

- `GET /users/:userId/kai?asOf=YYYY-MM-DD`
- `GET /users/:userId/today-readiness?asOf=YYYY-MM-DD`
- `POST /users/:userId/workout-sessions`
- `GET /exercise-library`

### Main Lovable endpoint

The main backend contract for Lovable should now be:

```bash
curl "http://localhost:3000/users/user_1/kai?asOf=2026-03-20"
```

This returns one aggregated payload with:

- `profile`
- `memory`
- `recentEvent`
- `planMatch`
- `signals`
- `kai`

The `kai` object now includes:

- `category`
- `text`
- `reason`
- `nextStep`

The `memory` object now also includes small learned pattern fields like:

- `restartStyle`
- `consistencyRisk`

Frontend should prefer this endpoint for rendering Kai-driven screens.

The write endpoints now also return a consistent shape:

- `message`
- `userId`
- `asOf`
- `workout` when relevant
- `workouts`
- `matchedPlanned`
- `matchedPlannedWorkout` when relevant
- `profile` when relevant
- `kaiPayload`

The backend now validates:

- required fields
- allowed `goal` values
- allowed `experienceLevel` values
- positive workout durations
- `YYYY-MM-DD` date format for `date` and `asOf`

1. Start the server:

```bash
npm start
```

You should see:

```bash
Kai server running at http://localhost:3000
```

2. In a second terminal window, record a completed workout:

```bash
curl -X POST http://localhost:3000/users/user_1/workouts/completed \
  -H "Content-Type: application/json" \
  -d '{
    "id": "workout_1",
    "date": "2026-03-19",
    "type": "full_body",
    "plannedDuration": 30,
    "completedDuration": 28
  }'
```

3. Record a missed workout:

```bash
curl -X POST http://localhost:3000/users/user_1/workouts/missed \
  -H "Content-Type: application/json" \
  -d '{
    "id": "workout_2",
    "date": "2026-03-20",
    "type": "cardio",
    "plannedDuration": 20
  }'
```

If that completed or missed workout matches a saved planned workout on the same date and type, the response now includes:

- `matchedPlanned: true`
- `matchedPlannedWorkout`

4. Fetch the main Kai payload:

```bash
curl "http://localhost:3000/users/user_1/kai?asOf=2026-03-20"
```

You should get back JSON showing:

- the user's current behavior signals
- the latest recent event
- Kai memory
- the current Kai message

5. Save a user profile:

```bash
curl -X POST http://localhost:3000/users/user_1/profile \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Oliver",
    "goal": "build_consistency",
    "experienceLevel": "beginner"
  }'
```

This returns the saved profile plus an updated `kaiPayload`.

6. Fetch workout history:

```bash
curl "http://localhost:3000/users/user_1/workouts"
```

7. Clear one user's workout data:

```bash
curl -X POST http://localhost:3000/users/user_1/workouts/reset
```

8. Save a planned workout:

```bash
curl -X POST http://localhost:3000/users/user_1/planned-workouts \
  -H "Content-Type: application/json" \
  -d '{
    "id": "planned_1",
    "date": "2026-03-21",
    "type": "upper_body",
    "plannedDuration": 40
  }'
```

9. Fetch planned workouts:

```bash
curl "http://localhost:3000/users/user_1/planned-workouts"
```

10. Inspect the future Kai agent input package:

```bash
curl "http://localhost:3000/users/user_1/kai-agent-input?asOf=2026-03-24"
```

This returns:

- Kai's system prompt
- Kai's user prompt template
- the structured app context the future model call would receive

11. Test the first real AI response endpoint:

First set your API key in Terminal:

```bash
export OPENAI_API_KEY="your_api_key_here"
```

Optional: choose a model:

```bash
export OPENAI_MODEL="gpt-5-mini"
```

Then call:

```bash
curl "http://localhost:3000/users/user_1/kai-agent-response?asOf=2026-03-24"
```

This returns:

- the structured Kai context
- a real AI-generated JSON response with:
  - `message`
  - `reason`
  - `nextStep`

12. Inspect Kai's saved memory for a user:

```bash
curl "http://localhost:3000/users/user_1/memory?asOf=2026-03-24"
```

This returns the first structured version of what Kai "knows" about that user.

13. Fetch Kai's weekly coaching summary:

```bash
curl "http://localhost:3000/users/user_1/kai-weekly?asOf=2026-03-23"
```

This returns:

- the weekly summary for the Monday-Sunday week containing `asOf`
- the number of planned, completed, and missed workouts that week
- a weekly Kai coaching message with:
  - `text`
  - `reason`
  - `nextStep`

## Compatibility routes

The older prototype routes still work for local testing:

- `POST /workouts/completed`
- `POST /workouts/missed`
- `POST /workouts/reset`
- `POST /profiles`
- `GET /users/:userId/kai-message`

But for Lovable integration, prefer:

- `GET /users/:userId/kai`
- `POST /users/:userId/profile`
- `POST /users/:userId/workouts/completed`
- `POST /users/:userId/workouts/missed`
- `POST /users/:userId/workouts/reset`
- `GET /users/:userId/planned-workouts`
- `POST /users/:userId/planned-workouts`

## Manual Test In The Browser

1. Start the server:

```bash
npm start
```

2. Open this in your browser:

```bash
http://localhost:3000
```

3. On the page:

- leave `user_1` as the user id
- leave today's date or change it
- click `Mark Completed` or `Mark Missed`
- watch Kai update on the right side
- look at the workout history list below the form
- click `Clear User Data` if you want to reset your testing
- change the profile at the top and click `Save Profile`
- notice Kai's wording changes based on the saved profile
- notice completed workouts, missed workouts, and streak wins now produce more distinct Kai responses

What you should notice:

- the page records the workout using your backend
- the backend recalculates the user's signals
- Kai's message changes based on those signals
- your test data stays there even after restarting the server

## API Routes

- `GET /health`
  Quick check that the server is running.
- `POST /workouts/completed`
  Records one completed workout for a user.
- `POST /workouts/missed`
  Records one missed workout for a user.
- `GET /users/:userId/signals?asOf=YYYY-MM-DD`
  Returns the current behavior signals for that user.
- `GET /users/:userId/kai-message?asOf=YYYY-MM-DD`
  Returns the current behavior signals and the simple coaching message Kai would give.
- `GET /users/:userId/kai-weekly?asOf=YYYY-MM-DD`
  Returns Kai's weekly coaching summary and weekly coaching message.
- `GET /users/:userId/kai-agent-input?asOf=YYYY-MM-DD`
  Returns the future Kai agent package: system prompt, user prompt template, and structured context.
- `GET /users/:userId/kai-agent-response?asOf=YYYY-MM-DD`
  Calls the OpenAI API with Kai's prompt package and returns a real AI response.
- `GET /users/:userId/memory?asOf=YYYY-MM-DD`
  Returns Kai's saved structured memory for that user.
- `GET /users/:userId/profile`
  Returns that user's saved profile.
- `GET /users/:userId/workouts`
  Returns that user's saved workout history.
- `GET /users/:userId/planned-workouts`
  Returns that user's planned workouts.
- `POST /users/:userId/planned-workouts`
  Saves one planned workout for that user.
- `POST /profiles`
  Saves a user's profile.
- `POST /workouts/reset`
  Clears one user's saved workout history.
- `GET /`
  Opens the tiny local Kai MVP web page.

## Why This Foundation Exists

Kai cannot coach well until the app can reliably answer simple questions like:

- Did the user complete a workout?
- Did they miss one?
- When were they last active?
- Are they building consistency or falling off?

This layer gives the app those answers first.

The new local API makes it easier to understand the next step of app building:

- the app sends an action in
- the backend stores it
- the backend returns useful Kai data back out

The coaching layer adds one more simple step:

- the backend looks at those signals
- Kai picks a simple coaching response based on rules

## Agent Preparation

The app now also includes the first backend preparation for a future real Kai agent:

- a Kai system prompt
- a Kai user prompt template
- a structured context builder
- a structured response shape

These files are not connected to a live AI model yet.
They are the setup layer that will eventually let your backend send good data to an AI model in a clean way.

## Local Persistence

Workout data is now saved to:

`data/workouts.json`

Profile data is now saved to:

`data/profiles.json`

Kai memory is now saved to:

`data/kai-memory.json`

Planned workouts are now saved to:

`data/planned-workouts.json`

That means:

- you can stop the server
- start it again
- and your recorded workouts are still there
