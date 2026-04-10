# Lovable UI Build Plan

This is the recommended first UI shape for Lovable.

The goal is not to design every future feature now.
The goal is to build the smallest real product surface that cleanly renders the
backend truth that already exists.

## Core Rule

Lovable should mainly render:

- `GET /users/:userId/app-state?asOf=YYYY-MM-DD`
- `POST /users/:userId/workouts/completed`
- `POST /users/:userId/workouts/missed`
- `GET /users/:userId/workouts`
- `GET /users/:userId/kai-weekly?asOf=YYYY-MM-DD`
- `POST /users/:userId/profile`
- `GET /profile-options`

The frontend should not recreate:

- readiness logic
- recommendation ranking
- recovery reasoning
- weekly planning logic

## Recommended Screen Set

Build these 5 screens first:

1. Today / Home
2. Log Workout
3. History
4. Weekly Recap
5. Profile / Preferences

That is enough to make Bask genuinely testable.

## 1. Today / Home

This should be the main screen.

Backend source:

- `GET /users/:userId/app-state?asOf=YYYY-MM-DD`

Main job:

- tell the user what to do today
- show why
- show what to avoid
- let the user start logging

Sections:

- Header
  - user name
  - date
  - weekly arc headline from `todayReadiness.weeklyPlanContext.weeklyArcHeadline`

- Kai card
  - `kaiPayload.kai.text`
  - optional smaller reason and next step

- Today plan card
  - `todayReadiness.frontendCopy.sessionLabel`
  - `todayReadiness.frontendCopy.readinessHeadline`
  - `todayReadiness.frontendCopy.primaryAction`
  - optional `todayReadiness.frontendCopy.fallbackNote`

- Session plan card
  - objective
  - session style
  - each session block in order
  - render `sessionPlan.blocks[*].focus`
  - render `sessionPlan.blocks[*].exampleExerciseIds` or `exampleExercises`

- Why card
  - `frontendExplanation.planWhy`
  - `frontendExplanation.whatChangedToday`
  - `frontendExplanation.weekContext`
  - `frontendExplanation.whyTodayLooksThisWay`

- Avoid / caution card
  - `frontendExplanation.cautionAreas`
  - `decisionAudit.avoidMuscles`
  - `decisionAudit.avoidMovementPatterns`
  - `exercisesToAvoidToday` top few only

- Better options card
  - `decisionAudit.selectedSubstitutes`
  - show name + short `why`

- Actions bar
  - `Log completed workout`
  - `Log missed workout`
  - `View history`

Recommended mobile layout:

- vertical stack
- one primary card per decision layer
- sticky bottom action bar

Order:

1. Kai
2. Today decision
3. Session plan
4. Why
5. Avoid
6. Better options

## 2. Log Workout

Main job:

- capture a completed or missed workout simply

Backend source:

- `POST /users/:userId/workouts/completed`
- `POST /users/:userId/workouts/missed`
- `GET /exercise-library`

Recommended layout:

- top section: today’s suggested plan summary
- middle section: exercise list builder
- bottom section: submit actions

Features:

- prefill workout type from `todayReadiness.plannedWorkoutType`
- simple exercise picker
- for each exercise:
  - sets
  - reps
  - effort
- duration inputs
- optional execution quality later

Buttons:

- `Complete workout`
- `Mark missed`

Important behavior:

- after submit, refresh from `GET /users/:userId/app-state?asOf=...`
- do not try to update the dashboard locally by hand

## 3. History

Main job:

- show past workouts and coaching snapshots

Backend source:

- `GET /users/:userId/workouts`
- `GET /users/:userId/readiness-history`

Recommended layout:

- segmented control:
  - `Workouts`
  - `Readiness`

Workouts tab:

- date
- type
- duration
- whether it matched a planned day if available in stored payload

Readiness tab:

- readiness headline
- session style
- decision snapshot
- primary exercises

This screen is mainly for self-testing and inspection at first.

## 4. Weekly Recap

Main job:

- show the week story without making the user parse raw history

Backend source:

- `GET /users/:userId/kai-weekly?asOf=YYYY-MM-DD`

Recommended layout:

- week header
- weekly chapter card
- progress signals card
- frictions card
- next-week guidance card

This should feel narrative, not dense.

Focus on:

- weekly headline
- what improved
- what slipped
- what to repeat next week

## 5. Profile / Preferences

Main job:

- edit the settings that affect recommendations

Backend source:

- `GET /profile-options`
- `POST /users/:userId/profile`
- optionally `GET /users/:userId/profile`

Recommended layout:

- basic profile section
  - name
  - goal
  - experience level

- training preferences section
  - preferred days
  - session length
  - training style

- recommendation inputs section
  - equipment access
  - focus muscles
  - favorite exercises
  - disliked exercises
  - pain flags

The profile screen matters because these inputs already affect the backend.

## Navigation Recommendation

Use a 4-tab mobile nav:

- `Today`
- `Log`
- `History`
- `Profile`

Put `Weekly recap` as:

- a card/button from Today
- or a top-right action from Today

That keeps the main navigation simple.

## Lovable Data Model Recommendation

Use one main screen fetch:

- `app-state`

Use one write-refresh pattern:

1. submit write request
2. wait for success
3. refetch `app-state`

Recommended client state buckets:

- `appState`
- `workoutsHistory`
- `readinessHistory`
- `weeklyRecap`
- `profileOptions`

Do not split dashboard state across many separate fetches unless needed.

## First Build Order

Build in this order:

1. Today / Home
2. Profile / Preferences
3. Log Workout
4. Weekly Recap
5. History

Why:

- Today is the main value
- Profile is needed to test recommendation changes
- Logging is needed to create real loop feedback
- Weekly recap becomes useful once there is activity
- History is useful but not required for first usable testing

## What To Render Directly From The Backend

Render directly:

- `frontendCopy`
- `frontendExplanation`
- `decisionAudit`
- `sessionPlan`
- `kaiPayload.kai`

Do not reinterpret:

- readiness score into a different meaning
- avoid lists into a new ranking
- chosen exercises into a frontend-generated plan

## First UI Quality Bar

Before calling the Lovable UI “ready for self-test,” make sure:

- Today screen can load from `app-state`
- profile edits affect recommendations after refresh
- completed workout logging refreshes the same day cleanly
- missed workout logging refreshes the same day cleanly
- equipment-limited and pain-limited cases render without contradictions
- the Today screen clearly shows:
  - what to do
  - why
  - what to avoid
  - what the next action is
