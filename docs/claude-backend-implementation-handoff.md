# Adaptive Fitness Coach Backend: Claude Implementation Handoff

Use this as a direct implementation prompt for another coding model. The goal is to recreate the current backend behavior and API shape, not invent a different system.

## Mission

Build a TypeScript backend for an adaptive fitness coaching product.

The backend should:

- ingest user profiles, workout history, planned workouts, and coaching memory
- compute daily training readiness from recent workouts
- preserve planned session identity when adjusting workouts
- generate session decisions such as:
  - `train_as_planned`
  - `train_modified`
  - `train_light`
  - degraded `accessory_only` session plans
- rank exercises into:
  - `recommended`
  - `deprioritize`
  - `avoid`
- attach exercise-level tolerance:
  - `green`
  - `yellow`
  - `red`
- attach fallback quality:
  - `best`
  - `acceptable`
- generate frontend-ready readiness copy and substitution copy
- generate Kai coaching output aligned with the same readiness logic
- include a month-long simulation harness for testing the system over repeated training

Do not build a generic workout tracker. Build a coaching backend.

## Core Principle

When a user has a planned workout for today, preserve the session identity if possible.

Examples:

- if today is `push_day`, keep it as push day where possible
- if today is `pull_day`, keep it as pull day where possible
- if today is `lower_body`, keep it lower-body where possible

If fatigue is high, degrade intelligently:

- first try `modified`
- then try `accessory_only`
- do not jump to unrelated “safe” exercises unless there is no coherent on-plan alternative

## Stack

- TypeScript
- Node HTTP server
- JSON-file-backed stores for now
- clean functional modules
- no ORM required for this implementation

Suggested directories:

- `src/server.ts`
- `src/exercises/library.ts`
- `src/exercises/readiness.ts`
- `src/exercises/types.ts`
- `src/exercises/frontend-response.ts`
- `src/kai/service.ts`
- `src/kai/coach.ts`
- `src/kai/types.ts`
- `src/store/*.ts`
- `src/dev/scenarios.ts`
- `src/dev/monthly-simulation.ts`
- `src/__tests__/frontend-readiness-contract.test.ts`

## Core Domain Types

Implement these core enums/unions and interfaces.

### Exercise domain

```ts
type MovementPattern =
  | "horizontal_push"
  | "vertical_push"
  | "vertical_pull"
  | "horizontal_pull"
  | "horizontal_abduction"
  | "elbow_flexion"
  | "elbow_extension"
  | "squat"
  | "lunge"
  | "hinge"
  | "carry"
  | "knee_flexion"
  | "knee_extension"
  | "plantar_flexion";

type MuscleGroup =
  | "chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "triceps"
  | "anconeus"
  | "biceps"
  | "brachialis"
  | "brachioradialis"
  | "lats"
  | "teres_major"
  | "upper_traps"
  | "lower_traps"
  | "mid_traps"
  | "rhomboids"
  | "forearm_flexors"
  | "rotator_cuff"
  | "serratus_anterior"
  | "adductors"
  | "glute_meds"
  | "quads"
  | "glutes"
  | "hamstrings"
  | "calves"
  | "spinal_erectors"
  | "core"
  | "upper_back";

type RecoveryState = "recovered" | "recovering" | "overworked";
type RecommendationBucket = "recommended" | "deprioritize" | "avoid";
type ExerciseTolerance = "green" | "yellow" | "red";
type FallbackTier = "best" | "acceptable";

type TrainingEffect =
  | "quad_bias"
  | "calf_isolation"
  | "hamstring_isolation"
  | "glute_bias"
  | "trap_isolation"
  | "upper_trap_isolation"
  | "hinge_heavy"
  | "squat_pattern"
  | "unilateral_leg"
  | "horizontal_press"
  | "chest_isolation"
  | "vertical_press"
  | "front_delt_press"
  | "triceps_isolation"
  | "cable_pressdown"
  | "overhead_triceps"
  | "lateral_delt_isolation"
  | "side_delt_bias"
  | "rear_delt_isolation"
  | "vertical_pull"
  | "horizontal_row"
  | "biceps_isolation"
  | "neutral_grip_curl"
  | "supinated_curl";
```

### User / Kai domain

```ts
type UserGoal =
  | "lose_weight"
  | "build_muscle"
  | "get_fitter"
  | "build_consistency";

type ExperienceLevel = "beginner" | "intermediate";
type ConsistencyStatus = "inactive" | "starting" | "building" | "consistent";

type KaiCoachingCategory =
  | "celebrate"
  | "encourage"
  | "accountability"
  | "reset"
  | "start";
```

### Session decisions

```ts
type SessionDecisionStatus =
  | "train_as_planned"
  | "train_modified"
  | "train_light"
  | "avoid_overlap";

type SessionVolumeAdjustment =
  | "normal"
  | "reduce_10_percent"
  | "reduce_20_percent"
  | "reduce_30_percent";

type SessionIntensityAdjustment =
  | "normal"
  | "keep_submaximal"
  | "reduce_intensity";
```

### Key interfaces

```ts
interface WorkoutExerciseEntry {
  exerciseId: string;
  sets: number;
  reps: number;
  effort?: "easy" | "moderate" | "hard";
}

interface WorkoutRecord {
  id: string;
  userId: string;
  date: string;
  recordedAt: string;
  type: string;
  plannedDuration: number;
  completedDuration?: number;
  sessionExercises?: WorkoutExerciseEntry[];
  status: "planned" | "completed" | "missed" | "skipped";
}

interface PlannedWorkout {
  id: string;
  userId: string;
  date: string;
  type: string;
  plannedDuration: number;
}

interface KaiUserProfile {
  userId: string;
  name: string;
  goal: UserGoal;
  experienceLevel: ExperienceLevel;
}

interface MuscleLoadSummaryEntry {
  muscle: MuscleGroup;
  totalLoad: number;
  unresolvedLoad: number;
  recoveryTimeHours: number;
  hoursSinceLastWorked?: number;
  hoursUntilRecovered: number;
  recoveryState: RecoveryState;
  riskScore: number;
}

interface MovementPatternSummaryEntry {
  movementPattern: MovementPattern;
  totalLoad: number;
  unresolvedLoad: number;
  recoveryState: RecoveryState;
}

interface ExerciseRecommendation {
  exerciseId: string;
  name: string;
  bucket: RecommendationBucket;
  tolerance: ExerciseTolerance;
  fallbackTier?: FallbackTier;
  score: number;
  reasons: string[];
}

interface SessionDecision {
  status: SessionDecisionStatus;
  summary: string;
  sessionMode: string;
  volumeAdjustment: SessionVolumeAdjustment;
  intensityAdjustment: SessionIntensityAdjustment;
  notes: string[];
}

interface SessionPlanExerciseExample {
  exerciseId: string;
  tolerance?: ExerciseTolerance;
  fallbackTier?: FallbackTier;
}

interface SessionPlanBlock {
  slot: "main" | "secondary" | "accessory";
  focus: string;
  blockTier?: FallbackTier;
  exampleExerciseIds: string[];
  exampleExercises?: SessionPlanExerciseExample[];
}

interface SessionPlan {
  sessionStyle: "normal" | "modified" | "accessory_only";
  objective: string;
  coachNote?: string;
  focusMuscles: MuscleGroup[];
  limitMuscles: MuscleGroup[];
  limitPatterns: MovementPattern[];
  volumeGuidance: string;
  intensityGuidance: string;
  blocks: SessionPlanBlock[];
}

interface ExerciseSubstitutionOption {
  exerciseId: string;
  name: string;
  trainingEffects: TrainingEffect[];
  swapForExerciseIds: string[];
  swapReasonTags: string[];
  reason: string;
  frontendCopy?: {
    title: string;
    actionLabel: string;
    explanation: string;
  };
}

interface TrainingReadinessReport {
  userId: string;
  asOf: string;
  plannedWorkoutType?: string;
  sessionDecision: SessionDecision;
  sessionPlan: SessionPlan;
  substitutionOptions: ExerciseSubstitutionOption[];
  muscleLoadSummary: MuscleLoadSummaryEntry[];
  movementPatternSummary: MovementPatternSummaryEntry[];
  overworkedMuscles: MuscleGroup[];
  overworkedPatterns: MovementPattern[];
  recommendedExercises: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
  avoidExercises: ExerciseRecommendation[];
  recommendedMusclesToAvoid: MuscleGroup[];
}

interface FrontendReadinessCopy {
  sessionLabel: string;
  readinessHeadline: string;
  primaryAction: string;
  fallbackNote?: string;
}

interface FrontendTrainingReadinessResponse {
  userId: string;
  asOf: string;
  plannedWorkoutType?: string;
  frontendCopy: FrontendReadinessCopy;
  sessionDecision: SessionDecision;
  sessionPlan: SessionPlan;
  substitutionOptions: ExerciseSubstitutionOption[];
  muscleLoadSummary: MuscleLoadSummaryEntry[];
  overworkedMuscles: MuscleGroup[];
  recoveringMuscles: MuscleGroup[];
  muscleGroupsToAvoidToday: MuscleGroup[];
  saferAlternatives: ExerciseRecommendation[];
  exercisesToAvoidToday: ExerciseRecommendation[];
}
```

## Exercise Library

Create a hardcoded exercise library containing realistic entries for:

- push:
  - `barbell_bench_press`
  - `incline_dumbbell_press`
  - `cable_chest_fly`
  - `overhead_shoulder_press`
  - `lateral_raise`
  - `tricep_pushdown`
  - `triceps_rope_pushdown`
  - `triceps_cable_pushdown_straight_bar`
  - `overhead_tricep_extension`
- pull:
  - `pull_up`
  - `assisted_pull_up_machine`
  - `lat_pulldown`
  - `single_arm_cable_row`
  - `one_arm_dumbbell_row`
  - `seated_cable_row`
  - `t_bar_row`
  - `barbell_bent_over_row`
  - `chest_supported_machine_row`
  - `chest_supported_dumbbell_row`
  - `rear_delt_fly`
  - `cable_face_pull`
  - `cable_rear_delt_fly`
  - `barbell_curl`
  - `hammer_curl`
  - `preacher_curl`
  - `shrug`
- lower:
  - `leg_press`
  - `leg_extension`
  - `leg_curl`
  - `lying_leg_curl`
  - `seated_leg_curl`
  - `calf_raise`
  - `squat`
  - `barbell_back_squat`
  - `hack_squat`
  - `goblet_squat`
  - `walking_lunge`
  - `bulgarian_split_squat`
  - `romanian_deadlift`
  - `deadlift_conventional`
  - `barbell_hip_thrust`

Each exercise should include:

- movement pattern
- primary / secondary / stabilizer muscles
- fatigue score
- recovery time in hours
- equipment type
- training effects

Important current intent:

- `shrug` should behave like upper trap isolation, not like a full row
- `hammer_curl` should express neutral-grip curl / arm fallback intent
- `rear_delt_fly` should be a pull accessory, but can still be blocked if rear delt overlap is too high

## Readiness Engine

Implement `buildTrainingReadinessReport(userId, workouts, asOf, plannedWorkoutType?, experienceLevel?)`.

### Core load model

For each completed workout exercise:

- calculate exercise load from:
  - sets
  - reps
  - fatigue score
  - effort multiplier
- decay unresolved load over time using:
  - `hoursSinceSession`
  - `recoveryTimeHours`
- apply the load to:
  - primary muscles
  - secondary muscles
  - stabilizers
  - movement pattern

### Recovery states

Produce `muscleLoadSummary` and `movementPatternSummary`.

Use experience-aware thresholds.

Current behavior target:

- `beginner` is more conservative
- `intermediate` tolerates more unresolved load before `overworked`

### Relevant-overlap filtering

Do not degrade a session based on every global overworked muscle.

Filter overworked constraints to the planned day:

- push reacts mainly to:
  - `chest`
  - `front_delts`
  - `side_delts`
  - `triceps`
  - `horizontal_push`
  - `vertical_push`
  - `elbow_extension`
- pull reacts mainly to:
  - `lats`
  - `rhomboids`
  - `mid_traps`
  - `rear_delts`
  - `biceps`
  - `brachialis`
  - `brachioradialis`
  - `upper_traps`
  - `lower_traps`
  - `vertical_pull`
  - `horizontal_pull`
  - `horizontal_abduction`
  - `elbow_flexion`
- lower reacts mainly to:
  - `quads`
  - `glutes`
  - `hamstrings`
  - `adductors`
  - `calves`
  - `glute_meds`
  - `spinal_erectors`
  - `squat`
  - `lunge`
  - `hinge`
  - `knee_flexion`
  - `knee_extension`
  - `plantar_flexion`

### Exercise scoring

Build recommendations by combining:

- muscle overlap penalties
- movement-pattern penalties
- plan-fit scoring
- training-effect guardrails

Return:

- `recommendedExercises`
- `deprioritizedExercises`
- `avoidExercises`

Important bucket behavior:

- `recommended` = viable today
- `deprioritize` = still possible as fallback
- `avoid` = do not surface as today’s solution

### Tolerance / fallback behavior

Calculate:

- `tolerance: green | yellow | red`
- `fallbackTier: best | acceptable`

Intent:

- `green` -> best tolerated
- `yellow` -> acceptable fallback
- `red` -> not a real fallback today

### Training-effect guardrails

Implement effect-level overlap rules such as:

- `horizontal_press` blocked by `chest`, `front_delts`, `triceps`
- `vertical_press` blocked by `front_delts`, `triceps`
- `chest_isolation` blocked by `chest`, caution on `front_delts`
- `neutral_grip_curl` blocked mainly by `brachialis`, caution on `brachioradialis` and `biceps`
- `supinated_curl` blocked by `biceps`
- `horizontal_row` blocked by `lats`, `rhomboids`, `mid_traps`
- `vertical_pull` blocked by `lats`, `biceps`
- `rear_delt_isolation` blocked by `rear_delts`, caution on `rhomboids`, `mid_traps`
- `upper_trap_isolation` blocked by `upper_traps`, caution on `mid_traps`, `rhomboids`

## Session Decision Logic

Build `sessionDecision` from the relevant overworked signals and recommendation pool.

Examples:

- no major relevant flags:
  - `train_as_planned`
- relevant overlap but safe on-plan alternatives exist:
  - `train_modified`
- no workable main block, but coherent small on-plan accessories exist:
  - keep the day and degrade to `accessory_only`

### Push behavior target

When push overlap is high:

- keep push identity
- bias toward lateral raises, cable chest fly, pushdowns, lower-overlap press options
- avoid jumping to random leg work

### Pull behavior target

When pull overlap is high:

- keep pull identity
- prefer constrained fallbacks like:
  - `shrug`
  - `hammer_curl` when arm overlap is not too severe
  - limited rear-delt work only if rear delts are not truly blocked

Do not let pull days collapse too easily unless overlap is genuinely severe.

### Lower behavior target

When posterior fatigue is high:

- preserve lower-body identity
- bias toward:
  - `leg_extension`
  - `calf_raise`
  - `leg_curl`
  - quad-biased options

## Session Plan Builder

Build a `sessionPlan` with:

- `sessionStyle`
- `objective`
- `coachNote`
- `focusMuscles`
- `limitMuscles`
- `limitPatterns`
- `volumeGuidance`
- `intensityGuidance`
- `blocks`

Blocks:

- `main`
- `secondary`
- `accessory`

Each block should contain:

- `focus`
- `exampleExerciseIds`
- `exampleExercises`
- `blockTier`

### Important rules

- dedupe exercises across blocks
- keep plans on-plan where possible
- if the main block is empty but secondary/accessory work exists, consider degrading to `accessory_only`
- do not make `accessory_only` too trigger-happy for intermediate users
- if the downgraded plan is too sparse, backfill with extra safe on-plan fallback options

## Frontend Readiness Response

Implement a separate builder that converts `TrainingReadinessReport` into a frontend-ready response.

Must include:

- `frontendCopy.sessionLabel`
- `frontendCopy.readinessHeadline`
- `frontendCopy.primaryAction`
- `frontendCopy.fallbackNote`
- `sessionDecision`
- `sessionPlan`
- `substitutionOptions`
- `muscleLoadSummary`
- `overworkedMuscles`
- `recoveringMuscles`
- `muscleGroupsToAvoidToday`
- `saferAlternatives`
- `exercisesToAvoidToday`

### Copy behavior

Examples:

- healthy day:
  - session label: `Planned session`
  - headline: `Train normally today.`
- modified:
  - session label: `Modified session`
  - headline: `Train, but keep the overlap under control.`
- accessory-only:
  - session label: `Accessory-only session`
  - headline: `Keep the day, but keep it very small.`

Primary action should use the first meaningful block and its tier.

Examples:

- `Use lateral raise as an acceptable fallback today.`
- `Start with leg extension or calf raise. That is your best fit today.`
- `Use shrug as an acceptable fallback today.`

## Substitution System

Build substitution options by matching high-risk exercises to safer alternatives that preserve similar training effects.

Each substitution should return:

- `title`
- `actionLabel`
- `explanation`

Example style:

- `Swap Leg Press today`
- `Try leg extension`
- `Leg Extension is the cleanest swap today. You keep a similar training effect with a lower-fatigue option and lower axial load.`

## Kai Layer

Build `getKaiPayload(userId, asOf, profile?)`.

It should combine:

- profile
- today status
- recent event
- memory
- behavior signals
- planned workout for day
- readiness-aligned coaching message

Kai categories:

- `celebrate`
- `encourage`
- `accountability`
- `reset`
- `start`

Kai must use the same readiness logic story as the session plan.

If a day is accessory-only, Kai should not speak like it is a full normal session.

## API Endpoints

Expose these routes:

### Core

- `GET /health`
- `GET /exercise-library`

### Profiles / memory / signals

- `GET /users/:userId/profile`
- `GET /users/:userId/memory?asOf=YYYY-MM-DD`
- `GET /users/:userId/signals?asOf=YYYY-MM-DD`

### Readiness / Kai

- `GET /users/:userId/kai?asOf=YYYY-MM-DD`
- `GET /users/:userId/today-readiness?asOf=YYYY-MM-DD`

### Workout logging

- `POST /workouts/completed`
- `POST /workouts/missed`
- `POST /workouts/reset`
- `POST /profiles`
- `POST /users/:userId/workout-sessions`

### Planned workouts

- `GET /users/:userId/planned-workouts`
- `POST /users/:userId/planned-workouts`

### Dev scenarios

Implement scenario seed endpoints like:

- `POST /users/:userId/test-scenarios/push_day_fatigued`
- `POST /users/:userId/test-scenarios/pull_day_fatigued`
- `POST /users/:userId/test-scenarios/posterior_chain_fatigued`

These should seed realistic data for quick UI/backend validation.

## Storage

For now use JSON-backed stores for:

- workouts
- profiles
- Kai memory
- planned workouts

Keep the store abstraction clean so it can later move to Supabase or Postgres.

## CORS

Support:

- `CORS_ALLOW_ORIGINS` env var
- preflight `OPTIONS`
- correct CORS headers on JSON and HTML responses

## Tests

Add snapshot-style contract tests for the frontend readiness payload.

Protect at least:

- normal planned session
- push accessory-only fallback
- pull accessory-only fallback
- modified lower-body session
- substitution copy path

## Simulation Harness

Implement `npm run simulate:month`.

Goal:

- simulate 28 days
- 6 training days per week
- push / pull / legs split
- intermediate profile
- generate a report showing:
  - session style counts
  - consistency stats
  - day-by-day chosen sessions

Write the report to:

- `reports/monthly-ppl-simulation.json`

The simulator should use the readiness engine each day and should build reduced sessions realistically from:

- current session plan
- substitutions
- split-specific low-fatigue defaults

Do not let the simulator distort the backend by clipping reduced sessions too aggressively.

## Current Behavioral Target

For a 28-day intermediate 6-day PPL simulation, the current backend is roughly in this zone:

- around `17 normal`
- around `3 modified`
- around `4 accessory_only`

Late-month pull days may still degrade, but they should now look like coherent reduced sessions, not nonsense.

## Implementation Standard

Do not just mock the shape. Implement the actual logic.

Priorities:

1. correctness of readiness reasoning
2. preserving planned workout identity
3. coherent degraded modes
4. frontend-ready response contract
5. testability over time

## Deliverable

Produce a working TypeScript backend that matches the behavior above, including:

- exercise library
- readiness engine
- Kai service
- API server
- JSON stores
- dev scenarios
- frontend response builder
- contract tests
- month simulation

If you need to simplify, simplify infrastructure before simplifying coaching logic.
