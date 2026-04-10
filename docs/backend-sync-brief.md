# Backend Sync Brief

This is the cleanest short technical briefing for the current Bask backend state.

Use it when syncing with a collaborator on:

- what the backend already does well
- what changed recently
- what is now stable enough to stop tuning
- what still looks weaker
- what the next backend section should be

## Current Backend State

The backend is now a layered adaptive coaching system with seven connected parts:

1. profile understanding
2. weekly planning
3. daily readiness
4. memory and lightweight learning
5. execution capture and outcome truth
6. persistence and migration seams
7. evaluation and simulation

The core product behavior is now:

- generate a weekly plan
- assign progression intent per day and per slot
- assign session templates per day
- let daily readiness edit the planned day instead of rebuilding from scratch
- learn from comparable outcomes, recent lift history, and explicit execution feedback
- adapt for both structured users and looser day-by-day users

## What Changed Recently

### 1. Persistence and migration seam

The backend now has a real repository boundary plus snapshot and migration formats.

Current artifacts:

- `src/store/repositories.ts`
- `src/store/database-repositories.ts`
- `src/store/migration.ts`
- `src/dev/state-snapshot.ts`
- `docs/database-migration-blueprint.md`

Current capabilities:

- full backend snapshot export/import
- single-user snapshot export/import
- flat migration-bundle export/import
- database-style repository scaffold behind the same interface

### 2. Weekly review and live replanning

The backend now:

- reviews the current week as `building`, `steady`, `protecting`, or `resetting`
- can persist a calmer current-week replan
- can use the persisted replan as the real source of truth for day-level coaching
- keeps a lightweight weekly decision log

### 3. Execution capture and outcome truth

Completed workouts can now preserve more than just duration and exercise count.

Stored execution truth includes:

- `mainCovered`
- `supportCovered`
- `sessionSize`
- `executionQuality`
- `followedPlannedWorkout`
- `followedSuggestedWorkoutType`
- `substitutionCount`
- `performedWorkoutType`

That truth now feeds:

- recommendation memory weighting
- weekly review
- weekly insights
- recent exercise history
- cohort reporting

### 4. Looser-user / day-by-day support

The backend now supports users who do not follow a rigid weekly program as cleanly.

It can now:

- detect session patterns like:
  - `stable_split`
  - `alternating_mix`
  - `repeat_day_by_day`
  - `unsettled`
- infer a structured no-plan day from recent pattern memory
- use performed workout type instead of only logged labels
- explain when logged day types drift from what was actually trained
- learn when suggested day types keep drifting into another performed day type

### 5. Exercise-level progression visibility

The planner now carries:

- slot-level progression cues:
  - `progress`
  - `repeat`
  - `hold_back`
- weekly progression highlights
- grouped weekly exercise insights
- cohort reporting for progression drift across lifts

## What Feels Strong Right Now

### 1. Continuity

The system now behaves much more like one coaching engine.

The flow is:

- weekly plan
- planned day template
- today-adjusted readiness output
- completed workout truth
- future memory and progression adjustment

### 2. Session identity preservation

The backend still tries to keep:

- push day as push day
- pull day as pull day
- lower day as lower day

And it is now much better at doing that even when sessions are modified.

### 3. Realistic adaptation

The backend now adapts from:

- adherence
- recovery state
- profile inputs
- comparable workout quality
- explicit execution quality
- performed-vs-logged workout truth
- same-week misses and replans

### 4. Better inspectability

You can now inspect:

- weekly review state
- weekly adaptation action
- weekly decision log
- current-week replan state
- recent lift history
- progression highlights
- execution alignment
- migration bundles and state snapshots

### 5. Better evaluation

We now have:

- contract tests
- month simulation
- two-month cohort simulation
- readable markdown cohort summary
- progression reporting
- replan reporting
- execution-alignment reporting

## Latest Evaluation Snapshot

Latest cohort artifacts:

- `reports/two-month-cohort-simulation.json`
- `reports/two-month-cohort-summary.md`

Current five-person cohort highlights:

- `Leah`: 97% adherence, strongest steady intermediate path
- `Nora`: 92% adherence, good beginner consistency path
- `Mika`: 91% adherence, strong intermediate high-frequency path
- `Jonah`: 89% adherence, believable reset-prone split path
- `Iris`: 81% adherence, believable but still most protected full-body path

Main read:

- strong paths now look production-promising
- weaker paths are mostly “too modification-heavy” rather than structurally broken
- same-week replans are showing up without destabilizing adherence
- looser-user support is now real enough to discuss, not just theoretical

## What Is Finished Enough For Now

These parts should be treated as stable enough to stop tuning unless a real issue appears:

- weekly planning core
- progression intent and session templates
- daily readiness template editing
- same-week replanning
- slot-aware recommendation memory
- execution summary storage
- performed workout type inference
- session-pattern memory
- snapshot and migration seams
- cohort reporting and summary generation

## What Still Looks Weaker

These are not blockers, just the clearest remaining weak points:

- some personas still skew modification-heavy
- `Iris` is still the weakest progression/protection path
- some strong users still spend more time in `protecting` than ideal
- suggestion quality for looser users is better, but still early
- real production persistence is still scaffolded rather than implemented

## Best Files To Share In The Sync

- `docs/backend-architecture.md`
- `docs/database-migration-blueprint.md`
- `reports/two-month-cohort-summary.md`
- `reports/backend-state-snapshot.json`
- `reports/backend-migration-bundle.json`

## Recommended Sync Framing

If explaining the current state simply:

"The backend is no longer just a readiness engine. It now has weekly planning, daily template editing, execution-aware learning, same-week replanning, persistence seams, and a real bridge for looser day-by-day users. The strongest current story is continuity: plan the week, adapt today, learn from what actually got done, and carry that into the next week. The biggest remaining weak points are still some over-protection on weaker personas and the fact that production persistence is scaffolded rather than fully implemented."

## Recommended Next Section

The next clean backend section should probably be:

## suggestion quality and day-selection intelligence

The goal:

- improve what the backend suggests when there is no strong planned day
- get smarter about when a suggestion should follow recent performed patterns
- keep the system useful for looser users without building a second full planner

Why this is the right next move:

- it builds naturally on the new performed-work and session-pattern layers
- it improves real product behavior without reopening finished planning sections
- it is a clear user-facing backend gain even without frontend work
