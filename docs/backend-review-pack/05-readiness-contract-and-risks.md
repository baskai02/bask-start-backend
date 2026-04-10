# Readiness Contract And Risks

## Most Important Frontend Payload

The most product-critical payload right now is:

- `GET /users/:userId/today-readiness?asOf=YYYY-MM-DD`

The frontend depends on this being structurally stable and semantically honest.

## What A Correct Response Shape Looks Like

Abbreviated good shape:

```json
{
  "userId": "user_1",
  "asOf": "2026-04-01",
  "plannedWorkoutType": "upper_body",
  "frontendCopy": {
    "sessionLabel": "Normal session",
    "readinessHeadline": "Train as planned.",
    "primaryAction": "Start with chest-supported machine row."
  },
  "frontendExplanation": {
    "planWhy": "Run the upper-body day as planned.",
    "weekContext": "This suggested day is inferred from the user's recent training pattern and leans into the pull work they have actually been doing lately.",
    "whyTodayLooksThisWay": [],
    "focusAreas": ["Primary pull-biased movement"],
    "cautionAreas": [],
    "startingExercises": ["Chest-Supported Machine Row", "Lat Pulldown"]
  },
  "weeklyPlanContext": {
    "todayPlanned": false,
    "suggestedWorkoutTypeLabel": "Upper body"
  },
  "readinessModel": {
    "source": "objective_signals_only",
    "score": 59.99,
    "band": "moderate"
  },
  "sessionDecision": {
    "status": "train_as_planned",
    "sessionMode": "upper_body_normal"
  },
  "sessionPlan": {
    "sessionStyle": "normal",
    "objective": "Run the upper-body day as planned.",
    "blocks": [
      {
        "slot": "main",
        "focus": "Primary pull-biased movement",
        "exampleExerciseIds": [
          "chest_supported_machine_row",
          "lat_pulldown"
        ]
      }
    ]
  },
  "saferAlternatives": [
    {
      "exerciseId": "chest_supported_machine_row"
    },
    {
      "exerciseId": "lat_pulldown"
    }
  ]
}
```

## Known Bad Output Example

For the pull-biased suggested-day scenario, this is the wrong kind of output:

```json
{
  "sessionPlan": {
    "blocks": [
      {
        "slot": "main",
        "exampleExerciseIds": [
          "chest_supported_machine_row",
          "barbell_bench_press",
          "incline_dumbbell_press"
        ]
      }
    ]
  }
}
```

If that appears on the pull-biased suggested `upper_body` day, one of these is probably true:

- template intent is being overridden by generic merge/ranking behavior
- a stale build is running from `dist`

## Current High-Value Invariants

### 1. Session identity preservation

If the system planned push, pull, lower, or a coherent suggested upper/lower day, readiness should try to preserve that identity instead of jumping to generic safe exercises too early.

### 2. Planner intent should beat generic fallback ranking

Planner templates carry intent.

Generic readiness ranking is a fallback mechanism.

If generic ranking overrides template shape too early, the backend stops being one coaching system and becomes two competing ones.

### 3. Memory should nudge, not dominate

Recommendation memory should bias ranking, not overpower recovery, constraints, or template intent.

### 4. Contract tests are product-facing

`src/__tests__/frontend-readiness-contract.test.ts` is not just internal unit coverage. It protects the API shape and behavior the frontend depends on.

## Current Architectural Tensions

### `isSuggestedDay` as a hidden mode switch

`isSuggestedDay` is useful, but it is starting to control multiple branches of behavior.

Good review feedback would assess whether that should stay a boolean or grow into a richer context object with explicit suggested-day metadata.

### Priority inversion risk in merge logic

The recent `mergeTemplateExerciseIds(...)` fix addressed one concrete bug, but the broader risk remains:

- higher-level intent can be accidentally flattened into peer-ranked lists

This is the kind of logic that deserves close review.

## Useful Review Prompts

- Where are intent and ranking layered cleanly, and where are they being mixed?
- Which booleans are becoming hidden mode switches?
- What parts of the readiness response are too coupled to internal engine details?
- Which regressions are likely to pass unit logic but fail live-server behavior?
- What missing tests would most reduce planner/readiness drift?

