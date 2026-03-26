import test from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../dev/scenarios.js";
import { buildTrainingReadinessReport } from "../exercises/readiness.js";
import { buildFrontendTrainingReadinessResponse } from "../exercises/frontend-response.js";
import { createAppStore } from "../store/app-store.js";
import { createPlannedWorkoutStore } from "../store/planned-workout-store.js";
import { createProfileStore } from "../store/profile-store.js";

test("today-readiness contract stays stable for a normal planned session", () => {
  const store = createAppStore();
  const profileStore = createProfileStore();
  const plannedWorkoutStore = createPlannedWorkoutStore();
  const seeded = seedScenario({
    userId: "user_1",
    scenario: "planned_today",
    store,
    profileStore,
    plannedWorkoutStore
  });
  const plannedWorkout = plannedWorkoutStore.findPlannedWorkout("user_1", seeded.asOf);
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    store.getWorkouts("user_1"),
    seeded.asOf,
    plannedWorkout?.type
  );
  const response = buildFrontendTrainingReadinessResponse(
    "user_1",
    seeded.asOf,
    trainingReadiness
  );

  assert.deepEqual(
    {
      plannedWorkoutType: response.plannedWorkoutType,
      frontendCopy: response.frontendCopy,
      sessionDecision: response.sessionDecision,
      primaryBlock: response.sessionPlan.blocks[0],
      saferAlternatives: response.saferAlternatives.slice(0, 3)
    },
    {
      plannedWorkoutType: "full_body",
      frontendCopy: {
        sessionLabel: "Normal session",
        readinessHeadline: "Train as planned.",
        primaryAction: "Start with barbell bench press or incline dumbbell press.",
        fallbackNote: undefined
      },
      sessionDecision: {
        status: "train_as_planned",
        summary: "Train as planned.",
        sessionMode: "full_body_normal",
        volumeAdjustment: "normal",
        intensityAdjustment: "normal",
        notes: ["No major recovery flags are standing out today."]
      },
      primaryBlock: {
        slot: "main",
        focus: "Use the best-fitting lower-overlap work first",
        exampleExerciseIds: ["barbell_bench_press", "incline_dumbbell_press"],
        blockTier: undefined,
        exampleExercises: [
          {
            exerciseId: "barbell_bench_press",
            tolerance: "green",
            fallbackTier: undefined
          },
          {
            exerciseId: "incline_dumbbell_press",
            tolerance: "green",
            fallbackTier: undefined
          }
        ]
      },
      saferAlternatives: [
        {
          exerciseId: "barbell_bench_press",
          name: "Barbell Bench Press",
          bucket: "recommended",
          tolerance: "green",
          fallbackTier: undefined,
          score: 0,
          reasons: ["Lower overlap with unrecovered muscles"]
        },
        {
          exerciseId: "incline_dumbbell_press",
          name: "Incline Dumbbell Press",
          bucket: "recommended",
          tolerance: "green",
          fallbackTier: undefined,
          score: 0,
          reasons: ["Lower overlap with unrecovered muscles"]
        },
        {
          exerciseId: "cable_chest_fly",
          name: "Cable Chest Fly",
          bucket: "recommended",
          tolerance: "green",
          fallbackTier: undefined,
          score: 0,
          reasons: ["Lower overlap with unrecovered muscles"]
        }
      ]
    }
  );
});

test("today-readiness contract stays stable for pull accessory-only fallback", () => {
  const store = createAppStore();
  const profileStore = createProfileStore();
  const plannedWorkoutStore = createPlannedWorkoutStore();
  const seeded = seedScenario({
    userId: "user_1",
    scenario: "pull_day_fatigued",
    store,
    profileStore,
    plannedWorkoutStore
  });
  const plannedWorkout = plannedWorkoutStore.findPlannedWorkout("user_1", seeded.asOf);
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    store.getWorkouts("user_1"),
    seeded.asOf,
    plannedWorkout?.type
  );
  const response = buildFrontendTrainingReadinessResponse(
    "user_1",
    seeded.asOf,
    trainingReadiness
  );

  assert.deepEqual(
    {
      plannedWorkoutType: response.plannedWorkoutType,
      frontendCopy: response.frontendCopy,
      sessionStyle: response.sessionPlan.sessionStyle,
      primaryBlock: response.sessionPlan.blocks.find(
        (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
      ),
      firstSubstitution: response.substitutionOptions[0]
    },
    {
      plannedWorkoutType: "pull_day",
      frontendCopy: {
        sessionLabel: "Accessory-only session",
        readinessHeadline: "Keep the day, but keep it very small.",
        primaryAction: "Use shrug or hammer curl as an acceptable fallback today.",
        fallbackNote: "This works today, but it is more fallback than ideal."
      },
      sessionStyle: "accessory_only",
      primaryBlock: {
        slot: "secondary",
        focus: "Lighter upper-back or arm work",
        blockTier: "acceptable",
        exampleExerciseIds: ["shrug", "hammer_curl"],
        exampleExercises: [
          {
            exerciseId: "shrug",
            tolerance: "yellow",
            fallbackTier: "acceptable"
          },
          {
            exerciseId: "hammer_curl",
            tolerance: "yellow",
            fallbackTier: "acceptable"
          }
        ]
      },
      firstSubstitution: undefined
    }
  );
});

test("today-readiness contract stays stable for push accessory-only fallback", () => {
  const store = createAppStore();
  const profileStore = createProfileStore();
  const plannedWorkoutStore = createPlannedWorkoutStore();
  const seeded = seedScenario({
    userId: "user_1",
    scenario: "push_day_fatigued",
    store,
    profileStore,
    plannedWorkoutStore
  });
  const plannedWorkout = plannedWorkoutStore.findPlannedWorkout("user_1", seeded.asOf);
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    store.getWorkouts("user_1"),
    seeded.asOf,
    plannedWorkout?.type
  );
  const response = buildFrontendTrainingReadinessResponse(
    "user_1",
    seeded.asOf,
    trainingReadiness
  );

  assert.deepEqual(
    {
      plannedWorkoutType: response.plannedWorkoutType,
      frontendCopy: response.frontendCopy,
      sessionStyle: response.sessionPlan.sessionStyle,
      primaryBlock: response.sessionPlan.blocks.find(
        (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
      ),
      saferAlternatives: response.saferAlternatives.slice(0, 1)
    },
    {
      plannedWorkoutType: "push_day",
      frontendCopy: {
        sessionLabel: "Accessory-only session",
        readinessHeadline: "Keep the day, but keep it very small.",
        primaryAction: "Use lateral raise as an acceptable fallback today.",
        fallbackNote: "This works today, but it is more fallback than ideal."
      },
      sessionStyle: "accessory_only",
      primaryBlock: {
        slot: "secondary",
        focus: "Lower-cost push accessories",
        blockTier: "acceptable",
        exampleExerciseIds: ["lateral_raise"],
        exampleExercises: [
          {
            exerciseId: "lateral_raise",
            tolerance: "yellow",
            fallbackTier: "acceptable"
          }
        ]
      },
      saferAlternatives: [
        {
          exerciseId: "lateral_raise",
          name: "Lateral Raise",
          bucket: "recommended",
          tolerance: "yellow",
          fallbackTier: "acceptable",
          score: 14.05,
          reasons: [
            "side_delts is still recovering",
            "Fits today's push plan better",
            "Lower overlap with unrecovered muscles"
          ]
        }
      ]
    }
  );
});

test("today-readiness contract stays stable for a modified lower-body session", () => {
  const store = createAppStore();
  const profileStore = createProfileStore();
  const plannedWorkoutStore = createPlannedWorkoutStore();
  const seeded = seedScenario({
    userId: "user_1",
    scenario: "posterior_chain_fatigued",
    store,
    profileStore,
    plannedWorkoutStore
  });
  const plannedWorkout = plannedWorkoutStore.findPlannedWorkout("user_1", seeded.asOf);
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    store.getWorkouts("user_1"),
    seeded.asOf,
    plannedWorkout?.type
  );
  const response = buildFrontendTrainingReadinessResponse(
    "user_1",
    seeded.asOf,
    trainingReadiness
  );

  assert.deepEqual(
    {
      plannedWorkoutType: response.plannedWorkoutType,
      frontendCopy: response.frontendCopy,
      sessionDecision: response.sessionDecision,
      sessionStyle: response.sessionPlan.sessionStyle,
      primaryBlock: response.sessionPlan.blocks[0],
      saferAlternatives: response.saferAlternatives.slice(0, 2)
    },
    {
      plannedWorkoutType: "lower_body",
      frontendCopy: {
        sessionLabel: "Modified session",
        readinessHeadline: "Train, but keep the overlap under control.",
        primaryAction: "Start with leg extension or calf raise. That is your best fit today.",
        fallbackNote: "This is the cleanest option the backend sees for today."
      },
      sessionDecision: {
        status: "train_modified",
        summary: "Train, but make the session slightly easier to recover from.",
        sessionMode: "lower_body_modified",
        volumeAdjustment: "reduce_10_percent",
        intensityAdjustment: "keep_submaximal",
        notes: [
          "Spinal erectors, glutes, and hamstrings are still the main recovery watch-points.",
          "Safer options today are calf raise or leg extension."
        ]
      },
      sessionStyle: "modified",
      primaryBlock: {
        slot: "main",
        focus: "Quad-dominant lower-body work",
        exampleExerciseIds: ["leg_extension", "calf_raise"],
        blockTier: "best",
        exampleExercises: [
          {
            exerciseId: "leg_extension",
            tolerance: "green",
            fallbackTier: "best"
          },
          {
            exerciseId: "calf_raise",
            tolerance: "green",
            fallbackTier: "best"
          }
        ]
      },
      saferAlternatives: [
        {
          exerciseId: "calf_raise",
          name: "Calf Raise",
          bucket: "recommended",
          tolerance: "green",
          fallbackTier: "best",
          score: -9.55,
          reasons: [
            "Fits today's lower-body plan better",
            "Lower overlap with unrecovered muscles"
          ]
        },
        {
          exerciseId: "leg_extension",
          name: "Leg Extension",
          bucket: "recommended",
          tolerance: "green",
          fallbackTier: "best",
          score: -8.2,
          reasons: [
            "Fits today's lower-body plan better",
            "Lower overlap with unrecovered muscles"
          ]
        }
      ]
    }
  );
});

test("today-readiness contract stays stable for posterior substitution copy", () => {
  const store = createAppStore();
  const profileStore = createProfileStore();
  const plannedWorkoutStore = createPlannedWorkoutStore();
  const seeded = seedScenario({
    userId: "user_1",
    scenario: "posterior_chain_fatigued",
    store,
    profileStore,
    plannedWorkoutStore
  });
  const plannedWorkout = plannedWorkoutStore.findPlannedWorkout("user_1", seeded.asOf);
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    store.getWorkouts("user_1"),
    seeded.asOf,
    plannedWorkout?.type
  );
  const response = buildFrontendTrainingReadinessResponse(
    "user_1",
    seeded.asOf,
    trainingReadiness
  );

  assert.deepEqual(response.substitutionOptions.slice(0, 2), [
    {
      exerciseId: "leg_press",
      name: "Leg Press",
      trainingEffects: ["squat_pattern", "quad_bias"],
      swapForExerciseIds: ["leg_extension"],
      swapReasonTags: ["lower_fatigue", "lower_axial_load", "lower_setup_friction"],
      reason:
        "Preserves the squat pattern training effect while giving you a lower-fatigue option and lower axial load today.",
      frontendCopy: {
        title: "Swap Leg Press today",
        actionLabel: "Try leg extension",
        explanation:
          "Leg Extension is the cleanest swap today. You keep a similar training effect with a lower-fatigue option and lower axial load."
      }
    },
    {
      exerciseId: "walking_lunge",
      name: "Walking Lunge",
      trainingEffects: ["unilateral_leg", "quad_bias"],
      swapForExerciseIds: ["leg_extension"],
      swapReasonTags: ["lower_fatigue", "lower_axial_load", "lower_setup_friction"],
      reason:
        "Preserves the unilateral leg training effect while giving you a lower-fatigue option and lower axial load today.",
      frontendCopy: {
        title: "Swap Walking Lunge today",
        actionLabel: "Try leg extension",
        explanation:
          "Leg Extension is the cleanest swap today. You keep a similar training effect with a lower-fatigue option and lower axial load."
      }
    }
  ]);
});
