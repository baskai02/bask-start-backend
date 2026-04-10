# Lovable API Contract

This document is the main frontend/backend contract for Lovable.

Use this file as the source of truth for:

- which endpoints Lovable should call
- what request bodies should look like
- what response shapes to expect
- which routes are product routes vs debug routes

## Core Rule

Lovable should not calculate Kai logic.

Lovable should:

- send user actions to the backend
- fetch aggregated Kai state from the backend
- render what the backend returns

This backend owns:

- workout/event tracking
- behavior signals
- Kai memory
- Kai coaching output

## Lovable Setup

If Lovable is hosted on a different origin, run the backend with
`CORS_ALLOW_ORIGINS` set to the Lovable origin.

Example:

```bash
CORS_ALLOW_ORIGINS="https://your-app.lovable.app,http://localhost:5173" npm start
```

Notes:

- use a comma-separated list to allow more than one frontend origin
- use `*` only for loose local debugging
- this backend responds to `OPTIONS` preflight requests for cross-origin fetches

### Railway deploy note

If Lovable preview is hosted remotely, it will not be able to reach
`http://localhost:3000` on your machine.

In that case:

1. deploy the backend to Railway
2. set `CORS_ALLOW_ORIGINS=*` temporarily for testing
3. use the Railway public URL as the Lovable API base URL

Example backend base URL:

```text
https://your-railway-service.up.railway.app
```

### Recommended longer self-test deploy

For longer phone testing with durable data, use:

```text
Lovable frontend
Render backend
Supabase Postgres database
```

See [docs/deploy-render-supabase.md](/Users/olivergilder/Documents/Bask_start/docs/deploy-render-supabase.md).

Recommended first Lovable calls:

1. `GET /health`
2. `GET /profile-options`
3. `GET /exercise-library`
4. `GET /users/:userId/app-state?asOf=YYYY-MM-DD`
5. `POST /users/:userId/workouts/completed`
6. `POST /users/:userId/workouts/missed`

## Main Product Endpoints

### `GET /exercise-library`

Use this to fetch the full exercise library for the frontend picker.

Example:

```bash
curl "http://localhost:3000/exercise-library"
```

Response:

```json
{
  "exercises": [
    {
      "exerciseId": "barbell_bench_press",
      "name": "Barbell Bench Press",
      "category": "strength_hypertrophy",
      "liftType": "compound",
      "skillLevel": "beginner_to_advanced",
      "movementPattern": "horizontal_push",
      "plane": "transverse",
      "stability": "medium",
      "primaryMuscles": ["chest"],
      "secondaryMuscles": ["front_delts", "triceps"],
      "stabilizers": ["core", "upper_back"],
      "contributionWeights": {
        "primary": 1,
        "secondary": 0.5,
        "stabilizer": 0.25
      },
      "equipment": ["barbell", "bench"],
      "alternatives": ["incline_dumbbell_press", "cable_chest_fly"],
      "equipmentType": "barbell",
      "prescriptionDefaults": {
        "strengthReps": [3, 6],
        "hypertrophyReps": [6, 12],
        "enduranceReps": [12, 20],
        "sets": [3, 5],
        "restSeconds": [60, 180]
      },
      "systemicFatigue": "medium",
      "localFatigue": "high",
      "fatigueScore": 8,
      "recoveryTimeHours": 60,
      "tags": ["chest", "push", "barbell"]
    }
  ]
}
```

### `POST /users/:userId/workout-sessions`

Use this as the simplest frontend save action for a completed workout session.

This endpoint:

- saves the completed workout
- saves the exercise entries inside that workout
- recalculates readiness
- returns updated Kai output

Request:

```json
{
  "id": "session_1",
  "date": "2026-03-24",
  "type": "lower_body",
  "plannedDuration": 45,
  "completedDuration": 42,
  "sessionExercises": [
    {
      "exerciseId": "leg_extension",
      "sets": 3,
      "reps": 12,
      "effort": "moderate"
    },
    {
      "exerciseId": "calf_raise",
      "sets": 4,
      "reps": 15,
      "effort": "moderate"
    }
  ]
}
```

Example:

```bash
curl -X POST "http://localhost:3000/users/user_1/workout-sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "session_1",
    "date": "2026-03-24",
    "type": "lower_body",
    "plannedDuration": 45,
    "completedDuration": 42,
    "sessionExercises": [
      {
        "exerciseId": "leg_extension",
        "sets": 3,
        "reps": 12,
        "effort": "moderate"
      },
      {
        "exerciseId": "calf_raise",
        "sets": 4,
        "reps": 15,
        "effort": "moderate"
      }
    ]
  }'
```

Response:

```json
{
  "message": "Workout session saved.",
  "userId": "user_1",
  "asOf": "2026-03-24",
  "session": {
    "id": "session_1",
    "userId": "user_1",
    "date": "2026-03-24",
    "recordedAt": "2026-03-24T10:00:00.000Z",
    "type": "lower_body",
    "plannedDuration": 45,
    "completedDuration": 42,
    "status": "completed",
    "sessionExercises": [
      {
        "exerciseId": "leg_extension",
        "sets": 3,
        "reps": 12,
        "effort": "moderate"
      },
      {
        "exerciseId": "calf_raise",
        "sets": 4,
        "reps": 15,
        "effort": "moderate"
      }
    ]
  },
  "matchedPlanned": false,
  "trainingReadiness": {
    "userId": "user_1",
    "asOf": "2026-03-24",
    "plannedWorkoutType": "lower_body",
    "readinessModel": {
      "source": "objective_signals_only",
      "score": 54.6,
      "band": "moderate",
      "dataConfidence": "medium",
      "dataConfidenceScore": 57,
      "summary": "Objective signals support training, but not the highest-pressure version of the day.",
      "signalScores": {
        "recovery": 49.7,
        "comparableHistory": 62,
        "leadingFatigue": 68,
        "sessionDemand": 70
      },
      "reasons": [
        "Glutes is still the biggest recovery limiter today.",
        "This score is leaning more on current recovery than on deep comparable history."
      ]
    },
    "sessionDecision": {
      "status": "train_modified",
      "summary": "Train, but make the session slightly easier to recover from.",
      "sessionMode": "lower_body_modified",
      "volumeAdjustment": "reduce_10_percent",
      "intensityAdjustment": "keep_submaximal",
    "notes": []
    },
    "frontendCopy": {
      "sessionLabel": "Modified session",
      "readinessHeadline": "Train, but keep the overlap under control.",
      "primaryAction": "Start with leg extension. That is your best fit today.",
      "fallbackNote": "This is the cleanest option the backend sees for today."
    },
    "sessionPlan": {
      "sessionStyle": "modified",
      "objective": "Keep the lower-body session, but shift the work toward lower-fatigue leg options.",
      "focusMuscles": ["quads", "calves"],
      "limitMuscles": ["glutes", "hamstrings", "spinal_erectors"],
      "limitPatterns": ["hinge"],
      "volumeGuidance": "Trim total working sets by about 10 percent.",
      "intensityGuidance": "Keep most working sets around 2-3 reps in reserve.",
      "blocks": []
    },
    "substitutionOptions": [
      {
        "exerciseId": "leg_press",
        "name": "Leg Press",
        "trainingEffects": ["squat_pattern", "quad_bias"],
        "swapForExerciseIds": ["leg_extension"],
        "swapReasonTags": [
          "lower_fatigue",
          "lower_axial_load",
          "lower_setup_friction"
        ],
        "reason": "Preserves the squat pattern training effect while giving you a lower-fatigue option and lower axial load today.",
        "frontendCopy": {
          "title": "Swap Leg Press today",
          "actionLabel": "Try leg extension",
          "explanation": "Leg Extension is the cleanest swap today. You keep a similar training effect with a lower-fatigue option and lower axial load."
        }
      }
    ],
    "muscleLoadSummary": [],
    "overworkedMuscles": [],
    "recoveringMuscles": [],
    "muscleGroupsToAvoidToday": [],
    "exercisesToAvoidToday": [],
    "saferAlternatives": [],
    "deprioritizedExercises": []
  },
  "kaiPayload": {}
}
```

### `GET /users/:userId/today-readiness?asOf=YYYY-MM-DD`

Use this as the main frontend readiness endpoint.

This is the simplest shape for a phone test flow:

- muscle load from recent sessions
- overworked muscles
- objective readiness score with confidence and signal breakdown
- session-level coaching decisions
- frontend-ready explanation of what changed, why, what week pattern the day sits inside, and what to focus on
- session-plan blocks
- substitution suggestions when a riskier exercise can be swapped for a safer one with a similar training effect
- recovering muscles
- muscle groups to avoid today
- exercises to avoid today
- safer alternatives

Each `today-readiness` request also writes a lightweight readiness-history snapshot for that user, so the app can later show what decision the backend surfaced on each day.

Example:

```bash
curl "http://localhost:3000/users/user_1/today-readiness?asOf=2026-03-24"
```

Response:

```json
{
  "userId": "user_1",
  "asOf": "2026-03-24",
  "plannedWorkoutType": "lower_body",
  "readinessModel": {
    "source": "objective_signals_only",
    "score": 54.6,
    "band": "moderate",
    "dataConfidence": "medium",
    "dataConfidenceScore": 57,
    "summary": "Objective signals support training, but not the highest-pressure version of the day.",
    "signalScores": {
      "recovery": 49.7,
      "comparableHistory": 62,
      "leadingFatigue": 68,
      "sessionDemand": 70
    },
    "reasons": [
      "Glutes is still the biggest recovery limiter today.",
      "This score is leaning more on current recovery than on deep comparable history."
    ]
  },
  "frontendCopy": {
    "sessionLabel": "Modified session",
    "readinessHeadline": "Train, but keep the overlap under control. The last few weeks have been up and down, so keep today steady.",
    "primaryAction": "Start with leg extension. That is your best fit today.",
    "fallbackNote": "This is the cleanest option the backend sees for today."
  },
  "frontendExplanation": {
    "planWhy": "Keep the lower-body session, but shift the work toward lower-fatigue leg options.",
    "whatChangedToday": "The day stayed in place, but the backend shifted the work away from the main recovery bottlenecks.",
    "weekContext": "This day sits inside an up-and-down stretch, so the goal is to make the pattern feel steadier.",
    "whyTodayLooksThisWay": [
      "Spinal erectors, glutes, and hamstrings are still the main recovery watch-points.",
      "Safer options today are calf raise or leg extension.",
      "Glutes is still the biggest recovery limiter today."
    ],
    "focusAreas": [
      "Quad-dominant lower-body work",
      "Stable lower-body accessory work"
    ],
    "cautionAreas": [
      "Limit overlap on spinal erectors, glutes, and hamstrings."
    ],
    "startingExercises": ["Leg Extension", "Calf Raise"]
  },
  "sessionDecision": {
    "status": "train_modified",
    "summary": "Train, but make the session slightly easier to recover from.",
    "sessionMode": "lower_body_modified",
    "volumeAdjustment": "reduce_10_percent",
    "intensityAdjustment": "keep_submaximal",
    "notes": [
      "Spinal erectors, glutes, and hamstrings are still the main recovery watch-points.",
      "Safer options today are calf raise or leg extension."
    ]
  },
  "sessionPlan": {
    "sessionStyle": "modified",
    "objective": "Keep the lower-body session, but shift the work toward lower-fatigue leg options.",
    "focusMuscles": ["quads", "calves", "glute_meds"],
    "limitMuscles": ["spinal_erectors", "glutes", "hamstrings"],
    "limitPatterns": [],
    "volumeGuidance": "Trim total working sets by about 10 percent.",
    "intensityGuidance": "Keep most working sets around 2-3 reps in reserve.",
    "blocks": [
      {
        "slot": "main",
        "focus": "Quad-dominant lower-body work",
        "blockTier": "best",
        "exampleExerciseIds": ["leg_extension"],
        "exampleExercises": [
          {
            "exerciseId": "leg_extension",
            "tolerance": "green",
            "fallbackTier": "best"
          }
        ]
      },
      {
        "slot": "secondary",
        "focus": "Stable lower-body accessory work",
        "blockTier": "acceptable",
        "exampleExerciseIds": ["calf_raise", "leg_extension"],
        "exampleExercises": [
          {
            "exerciseId": "calf_raise",
            "tolerance": "yellow",
            "fallbackTier": "acceptable"
          },
          {
            "exerciseId": "leg_extension",
            "tolerance": "green",
            "fallbackTier": "best"
          }
        ]
      }
    ]
  },
  "muscleLoadSummary": [
    {
      "muscle": "glutes",
      "totalLoad": 31.74,
      "unresolvedLoad": 19.39,
      "recoveryTimeHours": 72,
      "hoursSinceLastWorked": 24,
      "hoursUntilRecovered": 48,
      "recoveryState": "overworked",
      "riskScore": 32.79
    },
    {
      "muscle": "quads",
      "totalLoad": 10.35,
      "unresolvedLoad": 6.93,
      "recoveryTimeHours": 72,
      "hoursSinceLastWorked": 24,
      "hoursUntilRecovered": 48,
      "recoveryState": "recovering",
      "riskScore": 11.43
    }
  ],
  "overworkedMuscles": ["glutes", "hamstrings", "spinal_erectors"],
  "recoveringMuscles": ["quads", "adductors", "core"],
  "muscleGroupsToAvoidToday": [
    "spinal_erectors",
    "glutes",
    "hamstrings"
  ],
  "exercisesToAvoidToday": [
    {
      "exerciseId": "deadlift_conventional",
      "name": "Deadlift (Conventional)",
      "bucket": "avoid",
      "score": 178.98,
      "reasons": [
        "glutes is still overworked",
        "hamstrings is still overworked",
        "spinal_erectors is still overworked",
        "hinge pattern is still overworked"
      ]
    }
  ],
  "saferAlternatives": [
    {
      "exerciseId": "calf_raise",
      "name": "Calf Raise",
      "bucket": "recommended",
      "tolerance": "yellow",
      "fallbackTier": "acceptable",
      "score": -5.06,
      "reasons": [
        "Fits today's lower_body plan better",
        "Lower overlap with unrecovered muscles"
      ]
    },
    {
      "exerciseId": "leg_extension",
      "name": "Leg Extension",
      "bucket": "recommended",
      "tolerance": "green",
      "fallbackTier": "best",
      "score": 3.43,
      "reasons": [
        "quads is still recovering",
        "Fits today's lower_body plan better",
        "Lower overlap with unrecovered muscles"
      ]
    }
  ],
  "deprioritizedExercises": [
    {
      "exerciseId": "cable_chest_fly",
      "name": "Cable Chest Fly",
      "bucket": "deprioritize",
      "tolerance": "green",
      "score": 10.94,
      "reasons": [
        "Less relevant to today's lower_body plan"
      ]
    }
  ]
}
```

### `GET /users/:userId/readiness-history`

Use this when the frontend needs the saved daily coaching snapshots for a user.

Example:

```bash
curl "http://localhost:3000/users/user_1/readiness-history"
```

Response:

```json
{
  "userId": "user_1",
  "readinessHistory": [
    {
      "userId": "user_1",
      "asOf": "2026-03-24",
      "recordedAt": "2026-03-24T08:30:00.000Z",
      "plannedWorkoutType": "lower_body",
      "sessionStyle": "modified",
      "sessionDecisionStatus": "train_modified",
      "readinessScore": 54.6,
      "readinessBand": "moderate",
      "dataConfidence": "medium",
      "frontendCopy": {
        "sessionLabel": "Modified session",
        "readinessHeadline": "Train, but keep the overlap under control.",
        "primaryAction": "Start with leg extension. That is your best fit today.",
        "fallbackNote": "This is the cleanest option the backend sees for today."
      },
      "frontendExplanation": {
        "planWhy": "Keep the lower-body session, but shift the work toward lower-fatigue leg options.",
        "whatChangedToday": "The day stayed in place, but the backend shifted the work away from the main recovery bottlenecks.",
        "whyTodayLooksThisWay": [
          "Spinal erectors, glutes, and hamstrings are still the main recovery watch-points."
        ],
        "focusAreas": ["Quad-dominant lower-body work"],
        "cautionAreas": ["Limit overlap on spinal erectors, glutes, and hamstrings."],
        "startingExercises": ["Leg Extension", "Calf Raise"]
      },
      "focusMuscles": ["quads", "calves", "glute_meds"],
      "limitMuscles": ["spinal_erectors", "glutes", "hamstrings"],
      "overworkedMuscles": ["glutes", "hamstrings", "spinal_erectors"],
      "recoveringMuscles": ["quads", "adductors", "core"],
      "muscleGroupsToAvoidToday": ["spinal_erectors", "glutes", "hamstrings"],
      "primaryExerciseIds": ["leg_extension", "calf_raise"]
    }
  ]
}
```

### `GET /users/:userId/app-state?asOf=YYYY-MM-DD`

This is the main Lovable screen-load endpoint.

Lovable should use this endpoint when it wants one backend-owned payload that
already aligns:

- user profile
- Kai/dashboard payload
- today-readiness coaching payload

This is the cleanest browser/frontend fetch because it removes the need for
Lovable to separately coordinate `kai` and `today-readiness`.

Example:

```bash
curl "http://localhost:3000/users/user_1/app-state?asOf=2026-03-24"
```

Response:

```json
{
  "userId": "user_1",
  "asOf": "2026-03-24",
  "profile": {
    "userId": "user_1",
    "name": "Oliver",
    "goal": "build_consistency",
    "experienceLevel": "beginner"
  },
  "kaiPayload": {
    "userId": "user_1",
    "asOf": "2026-03-24",
    "plannedWorkoutForDay": {
      "type": "full_body"
    },
    "kai": {
      "text": "Oliver, keep today simple and repeatable."
    }
  },
  "todayReadiness": {
    "userId": "user_1",
    "asOf": "2026-03-24",
    "plannedWorkoutType": "full_body",
    "frontendCopy": {
      "sessionLabel": "Normal session",
      "readinessHeadline": "Train as planned.",
      "primaryAction": "Start with leg press."
    },
    "decisionAudit": {
      "dayOrigin": "planned",
      "recommendedTrainingDirection": "Run the full-body day as planned."
    }
  }
}
```

Lovable should treat:

- `profile` as the saved user settings layer
- `kaiPayload` as the home/dashboard layer
- `todayReadiness` as the daily coaching / decision layer

Note:

- each `app-state` request also saves the same lightweight readiness-history
  snapshot that `today-readiness` saves
- use `today-readiness` directly only when Lovable needs a readiness-only refresh
  rather than a full screen load

### `GET /users/:userId/kai?asOf=YYYY-MM-DD`

This is the focused Kai/dashboard endpoint.

Use it when Lovable only needs the Kai/dashboard layer, not the full app state.

This payload also includes:

- `dashboardState`
- `todayStatus`
- `planMatch`
- `plannedWorkoutForDay`
- `nextPlannedWorkout`

Example:

```bash
curl "http://localhost:3000/users/user_1/kai?asOf=2026-03-20"
```

Response:

```json
{
  "userId": "user_1",
  "asOf": "2026-03-20",
  "dashboardState": "logged_today",
  "todayStatus": {
    "outcome": "completed",
    "hasLoggedToday": true,
    "canLogCompleted": false,
    "canLogMissed": false
  },
  "profile": {
    "userId": "user_1",
    "name": "Oliver",
    "goal": "build_consistency",
    "experienceLevel": "beginner"
  },
  "memory": {
    "userId": "user_1",
    "name": "Oliver",
    "goal": "build_consistency",
    "experienceLevel": "beginner",
    "motivationStyle": "supportive",
    "consistencyStatus": "building",
    "consistencyScore": 65,
    "currentStreak": 1,
    "recentCompletedCount": 2,
    "recentMissedCount": 1,
    "lastActivityAt": "2026-03-20",
    "restartStyle": "small_sessions",
    "consistencyRisk": "medium",
    "coachingNote": "Building consistency through recent follow-through.",
    "lastUpdated": "2026-03-20"
  },
  "recentEvent": {
    "type": "workout_completed",
    "workoutType": "upper_body",
    "date": "2026-03-20"
  },
  "planMatch": {
    "matchedPlanned": false
  },
  "plannedWorkoutForDay": {
    "id": "planned_2",
    "userId": "user_1",
    "date": "2026-03-20",
    "type": "upper_body",
    "plannedDuration": 30
  },
  "nextPlannedWorkout": {
    "id": "planned_3",
    "userId": "user_1",
    "date": "2026-03-21",
    "type": "lower_body",
    "plannedDuration": 35
  },
  "signals": {
    "lastActivityAt": "2026-03-20",
    "lastCompletedWorkoutAt": "2026-03-20",
    "inactiveDays": 0,
    "recentCompletedCount": 2,
    "recentMissedCount": 1,
    "currentStreak": 1,
    "longestStreak": 2,
    "consistencyScore": 65,
    "consistencyStatus": "building"
  },
  "kai": {
    "category": "encourage",
    "text": "Oliver, that upper body session counts. This is a better direction. Keep the next one simple and repeatable.",
    "reason": "You are moving in the right direction, but the pattern is not stable yet. The pattern still needs another clean rep.",
    "nextStep": "Try to complete the next scheduled workout so this turns into momentum."
  }
}
```

### `POST /users/:userId/profile`

Use this when the frontend saves or updates the user profile.

Request:

```json
{
  "name": "Oliver",
  "goal": "build_consistency",
  "experienceLevel": "beginner",
  "trainingStylePreference": "balanced",
  "confidenceLevel": "building",
  "equipment": "gym",
  "focusMuscles": ["chest", "lats"],
  "favoriteExerciseIds": ["barbell_bench_press", "lat_pulldown"],
  "dislikedExerciseIds": ["burpee"],
  "painFlags": ["front_delts"],
  "constraints": ["short_on_time"]
}
```

Response:

```json
{
  "message": "Profile saved.",
  "userId": "user_1",
  "asOf": "2026-03-20",
  "profile": {
    "userId": "user_1",
    "name": "Oliver",
    "goal": "build_consistency",
    "experienceLevel": "beginner",
    "trainingStylePreference": "balanced",
    "confidenceLevel": "building",
    "equipmentAccess": "full_gym",
    "focusMuscles": ["chest", "lats"],
    "favoriteExerciseIds": ["barbell_bench_press", "lat_pulldown"],
    "dislikedExerciseIds": ["burpee"],
    "painFlags": ["front_delts"],
    "constraints": ["short_on_time"]
  },
  "onboardingOptions": {},
  "kaiPayload": {}
}
```

Note:

- `kaiPayload` is the same shape returned by `GET /users/:userId/kai`
- `onboardingOptions` is the same shape returned by `GET /profile-options`

### `GET /profile-options`

Use this to build onboarding or profile-editing forms without hardcoding enums in the frontend.

Response:

```json
{
  "version": 1,
  "fields": [
    {
      "key": "goal",
      "label": "Goal",
      "type": "single_select",
      "options": [
        { "value": "build_consistency", "label": "Build consistency" },
        { "value": "build_muscle", "label": "Build muscle" }
      ]
    },
    {
      "key": "trainingStylePreference",
      "label": "Preferred training style",
      "type": "single_select",
      "options": [
        { "value": "balanced", "label": "Balanced" },
        { "value": "full_body", "label": "Full body" },
        { "value": "split_routine", "label": "Split routine" }
      ]
    },
    {
      "key": "favoriteExerciseIds",
      "label": "Favorite exercises",
      "type": "multi_select",
      "source": "exercise-library"
    }
  ]
}
```

Important fields now supported by the backend:

- `trainingStylePreference`
- `confidenceLevel`
- `favoriteExerciseIds`
- `dislikedExerciseIds`
- `painFlags`

These fields affect real coaching behavior:

- weekly plan size and split choice
- progression intent
- day-level exercise ranking
- avoidance of sensitive or disliked movements

### `POST /users/:userId/workouts/completed`

Use this when the user completes a workout.

Request:

```json
{
  "id": "workout_1",
  "date": "2026-03-20",
  "type": "upper_body",
  "plannedDuration": 30,
  "completedDuration": 28
}
```

Response:

```json
{
  "message": "Completed workout recorded.",
  "userId": "user_1",
  "asOf": "2026-03-20",
  "workout": {},
  "workouts": [],
  "kaiPayload": {}
}
```

### `POST /users/:userId/workouts/missed`

Use this when the user misses a workout.

Request:

```json
{
  "id": "workout_2",
  "date": "2026-03-21",
  "type": "upper_body",
  "plannedDuration": 30
}
```

Response:

```json
{
  "message": "Missed workout recorded.",
  "userId": "user_1",
  "asOf": "2026-03-21",
  "workout": {},
  "workouts": [],
  "kaiPayload": {}
}
```

### `GET /users/:userId/workouts`

Use this when Lovable needs the full workout history/timeline.

### `GET /exercise-library`

Returns the seeded exercise library used for session analysis, recovery logic, and future recommendations.

### `GET /users/:userId/training-readiness?asOf=YYYY-MM-DD`

Returns:

- `readinessModel`
- `muscleLoadSummary`
- `movementPatternSummary`
- `overworkedMuscles`
- `overworkedPatterns`
- `recommendedExercises`
- `deprioritizedExercises`
- `avoidExercises`
- `recommendedMusclesToAvoid`

### `GET /users/:userId/kai-weekly?asOf=YYYY-MM-DD`

Use this for a weekly recap card or weekly coaching screen.

This endpoint returns:

- `weeklyState`
- `weeklySummary`
- `weeklyReview`
- `weeklyInsights`
- `weeklyChapter`
- `weeklyArc`
- `weeklyReadinessHistory`
- `recentExerciseHistory`
- `weeklyPerformanceSignals`
- `weeklyProgressionHighlights`
- `nextPlannedWorkout`
- `kai`

The `weeklySummary` object includes:

- `weekStatus`
- `planAdherencePercent`

`weeklyReadinessHistory` contains the saved daily readiness snapshots for the current week only. This is the clean bridge between daily coaching and the weekly recap layer.

`weeklyChapter` is the frontend-ready narrative layer for the recap screen. It packages the same weekly truth into:

- `title`
- `summary`
- `storyBeats`
- `wins`
- `frictions`
- `nextChapter`

`weeklyArc` is the multi-week layer. It summarizes the recent pattern across saved weekly chapters, with fields like:

- `pattern`
- `headline`
- `summary`
- `recentStates`
- `recentChapterTitles`

`recentExerciseHistory` now includes lightweight progression tracking for recent lifts, including:

- `signalSource`
- `latestPerformanceScore`
- `baselinePerformanceScore`
- `performanceDeltaPercent`
- `progressionVelocity`
- `latestWasPersonalBest`
- `personalBestCount`

`weeklyPerformanceSignals` is the frontend-ready shortlist for weekly lift progress. It only includes recent lifts that actually moved in a meaningful way or hit a new best, so the recap layer can surface real progress without digging through the whole history.

Each `kai-weekly` request also writes a lightweight weekly-chapter-history snapshot for that user, so the app can build real multi-week narrative arcs later without recomputing exactly what was shown before.

### `GET /users/:userId/weekly-chapter-history`

Use this when Lovable needs past weekly recap chapters, not just the current week.

Example:

```bash
curl "http://localhost:3000/users/user_1/weekly-chapter-history"
```

Returns:

- `weeklyChapterHistory`

Example:

```bash
curl "http://localhost:3000/users/user_1/kai-weekly?asOf=2026-03-22"
```

Response:

```json
{
  "userId": "user_1",
  "asOf": "2026-03-22",
  "profile": {
    "userId": "user_1",
    "name": "Kabur",
    "goal": "get_fitter",
    "experienceLevel": "beginner"
  },
  "weeklyState": "in_progress",
  "weeklySummary": {
    "weekStart": "2026-03-16",
    "weekEnd": "2026-03-22",
    "weekStatus": "mixed",
    "plannedCount": 2,
    "completedCount": 1,
    "missedCount": 1,
    "plannedCompletedCount": 1,
    "plannedMissedCount": 1,
    "unplannedCompletedCount": 0,
    "remainingPlannedCount": 0,
    "planAdherencePercent": 50
  },
  "nextPlannedWorkout": {
    "id": "planned_3",
    "userId": "user_1",
    "date": "2026-03-23",
    "type": "full_body",
    "plannedDuration": 30
  },
  "kai": {
    "category": "encourage",
    "text": "Kabur, parts of the week were on plan, parts slipped. There is something to build on here.",
    "reason": "You followed through on some planned workouts, but not all of them.",
    "nextStep": "Your next planned workout is full body on 2026-03-23. Start there."
  }
}
```

### `POST /users/:userId/workouts/reset`

Dev/testing route only.

Use this while prototyping to clear one user’s workout history.

## Validation Rules

The backend currently validates:

- `goal` must be one of:
  - `lose_weight`
  - `build_muscle`
  - `get_fitter`
  - `build_consistency`
- `experienceLevel` must be:
  - `beginner`
  - `intermediate`
- `plannedDuration` and `completedDuration` must be positive numbers
- `date` and `asOf` must use `YYYY-MM-DD`
- required string fields cannot be empty

Validation errors return JSON like:

```json
{
  "error": "date must use YYYY-MM-DD format."
}
```

Usually with HTTP status `422`.

## Product Routes vs Debug Routes

### Product routes

Lovable should mainly use:

- `GET /users/:userId/app-state`
- `GET /users/:userId/kai`
- `GET /users/:userId/today-readiness`
- `GET /users/:userId/kai-weekly`
- `GET /profile-options`
- `POST /users/:userId/profile`
- `POST /users/:userId/workouts/completed`
- `POST /users/:userId/workouts/missed`
- `GET /users/:userId/workouts`

### Debug/internal routes

Useful for backend testing, but not required for main product wiring:

- `GET /users/:userId/signals`
- `GET /users/:userId/profile`
- `GET /users/:userId/memory`
- `GET /users/:userId/kai-message`
- `GET /users/:userId/kai-agent-input`
- `GET /users/:userId/kai-agent-response`
- `POST /users/:userId/workouts/reset`
- `POST /users/:userId/test-scenarios/:scenario`

Supported test scenarios:

- `planned_today`
- `mixed_week`
- `momentum_week`
- `missed_plan_reset`
- `suggested_upper_pull_bias`
- `thin_history_pain_limited_upper`
- `thin_history_equipment_limited_upper`
- `posterior_chain_fatigued`
- `upper_push_fatigued`
- `push_day_fatigued`
- `pull_day_fatigued`
- `quad_dominant_fatigued`

## Frontend Guidance

Recommended Lovable flow:

1. Load the main screen with `GET /users/:userId/app-state?asOf=...`
2. Render:
   - `appState.profile`
   - `appState.kaiPayload`
   - `appState.todayReadiness`
3. When user completes/misses a workout:
   - call the relevant write endpoint
   - refresh the screen from `GET /users/:userId/app-state?asOf=...`
4. Only call `GET /users/:userId/today-readiness` when the UI needs a lighter
   readiness-only refresh
5. Only call `GET /users/:userId/workouts` when rendering full history
6. Use `GET /users/:userId/kai-weekly` for a weekly recap surface, not for the main daily dashboard

This keeps the frontend simple and lets the backend stay the source of truth.

For the recommended first Lovable screen set and layout, see
[docs/lovable-ui-build-plan.md](/Users/olivergilder/Documents/Bask_start/docs/lovable-ui-build-plan.md).

Minimal Lovable fetch shape:

```ts
const response = await fetch(
  `${BACKEND_URL}/users/${userId}/app-state?asOf=${asOf}`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }
);

if (!response.ok) {
  throw new Error(`App-state request failed: ${response.status}`);
}

const appState = await response.json();

renderProfile(appState.profile);
renderKai(appState.kaiPayload);
renderTodayReadiness(appState.todayReadiness);
```

That is the main integration shape Lovable should start from.
