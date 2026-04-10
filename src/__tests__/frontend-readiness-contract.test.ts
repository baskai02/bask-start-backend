import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFrontendAppStateResponse } from "../api/frontend-app-state.js";
import { seedScenario } from "../dev/scenarios.js";
import {
  buildSubstitutionOptions,
  buildTrainingReadinessReport
} from "../exercises/readiness.js";
import {
  buildFrontendTrainingReadinessResponse,
  buildReadinessHistoryEntry
} from "../exercises/frontend-response.js";
import {
  getExerciseById,
  getExerciseLibrary,
  getExercisesByTrainingEffect
} from "../exercises/library.js";
import {
  buildResolvedTrainingReadinessReport,
  createKaiService,
  resolveTodayReadinessResolution,
  suggestFallbackWorkoutType
} from "../kai/service.js";
import {
  buildSuggestedPlanDay,
  buildWeeklyPlan,
  summarizeSuggestedDayTemplateBias
} from "../kai/planner.js";
import { normalizeProfileInput } from "../kai/profile-adapter.js";
import { buildKaiMemory } from "../kai/memory.js";
import {
  buildKaiWeeklyArc,
  buildKaiWeeklyChapter,
  buildKaiWeeklyCoachingMessage,
  buildKaiWeeklyInsights,
  buildKaiWeeklyReview
} from "../kai/weekly.js";
import { createAppStore } from "../store/app-store.js";
import { createPlannedWorkoutStore } from "../store/planned-workout-store.js";
import { createProfileStore } from "../store/profile-store.js";
import {
  createDatabaseRepositories,
  createFileDatabaseAdapter,
  createInMemoryDatabaseAdapter,
  createPersistedRepositories
} from "../store/database-repositories.js";
import {
  createJsonRepositories,
  type BaskStateSnapshot
} from "../store/repositories.js";
import {
  migrationBundleToSnapshot,
  snapshotToMigrationBundle,
  userMigrationBundleToSnapshot,
  userSnapshotToMigrationBundle
} from "../store/migration.js";

function findMuscleLoad(
  report: ReturnType<typeof buildTrainingReadinessReport>,
  muscle: string
) {
  return report.muscleLoadSummary.find((entry) => entry.muscle === muscle);
}

function requireMuscleLoad(
  report: ReturnType<typeof buildTrainingReadinessReport>,
  muscle: string
) {
  const entry = findMuscleLoad(report, muscle);
  assert.ok(entry, `expected ${muscle} to exist in the muscle load summary`);
  return entry;
}

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
    trainingReadiness,
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      splitStyle: "full_body",
      targetSessions: 3,
      plannedCount: 1,
      completedCount: 0,
      remainingPlannedCount: 1,
      todayPlanned: true
    }
  );

  assert.deepEqual(
    {
      plannedWorkoutType: response.plannedWorkoutType,
      frontendCopy: response.frontendCopy,
      weeklyPlanContext: response.weeklyPlanContext,
      sessionDecision: response.sessionDecision,
      primaryBlock: response.sessionPlan.blocks[0],
      saferAlternatives: response.saferAlternatives.slice(0, 3)
    },
    {
      plannedWorkoutType: "full_body",
      frontendCopy: {
        sessionLabel: "Normal session",
        readinessHeadline: "Train as planned.",
        primaryAction:
          "Start with squat. This is a sensible repeatable place to begin today.",
        fallbackNote: undefined
      },
      weeklyPlanContext: {
        weekStart: "2026-03-23",
        weekEnd: "2026-03-29",
        splitStyle: "full_body",
        targetSessions: 3,
        plannedCount: 1,
        completedCount: 0,
        remainingPlannedCount: 1,
        todayPlanned: true
      },
      sessionDecision: {
        status: "train_as_planned",
        summary: "Train as planned.",
        sessionMode: "full_body_normal",
        volumeAdjustment: "normal",
        intensityAdjustment: "normal",
        progressionIntent: undefined,
        notes: ["No major recovery flags are standing out today."]
      },
      primaryBlock: {
        slot: "main",
        focus: "Start with the best-fitting lower-body anchor for today",
        exampleExerciseIds: ["squat"],
        blockTier: undefined,
        exampleExercises: [
          {
            exerciseId: "squat",
            tolerance: "green",
            fallbackTier: undefined
          }
        ]
      },
      saferAlternatives: [
        {
          exerciseId: "squat",
          name: "Squat",
          bucket: "recommended",
          tolerance: "green",
          fallbackTier: undefined,
          score: 0,
          reasons: ["Lower overlap with unrecovered muscles"]
        },
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
          exerciseId: "pull_up",
          name: "Pull-up",
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

test("today-readiness packages a frontend explanation for a normal planned session", () => {
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

  assert.equal(response.frontendExplanation.planWhy, response.sessionPlan.objective);
  assert.equal(response.frontendExplanation.whatChangedToday, undefined);
  assert.equal(
    response.frontendExplanation.whyTodayLooksThisWay.includes(
      "No major recovery flags are standing out today."
    ),
    true
  );
  assert.equal(
    response.frontendExplanation.focusAreas.includes(
      "Start with the best-fitting lower-body anchor for today"
    ),
    true
  );
  assert.equal(response.frontendExplanation.startingExercises.includes("Squat"), true);
});

test("today-readiness packages a frontend decision audit for a normal planned session", () => {
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
    plannedWorkout?.type,
    "beginner",
    undefined,
    undefined,
    {
      dayOrigin: "planned",
      isPlannedDay: true,
      workoutType: plannedWorkout?.type
    }
  );
  const response = buildFrontendTrainingReadinessResponse(
    "user_1",
    seeded.asOf,
    trainingReadiness,
    undefined,
    {
      dayOrigin: "planned",
      isPlannedDay: true,
      workoutType: plannedWorkout?.type
    }
  );

  assert.equal(response.decisionAudit.dayOrigin, "planned");
  assert.equal(response.decisionAudit.originReasonLabel, undefined);
  assert.equal(response.decisionAudit.originBias, undefined);
  assert.equal(
    response.decisionAudit.recommendedTrainingDirection,
    response.sessionPlan.objective
  );
  assert.deepEqual(
    response.decisionAudit.selectedSubstitutes
      .slice(0, 3)
      .map((entry) => entry.exerciseId),
    response.saferAlternatives.slice(0, 3).map((entry) => entry.exerciseId)
  );
  assert.equal(
    response.decisionAudit.selectedSubstitutes[0]?.selectionTier,
    "best_fit"
  );
  assert.equal(
    response.decisionAudit.recoveringMuscles.join(","),
    response.recoveringMuscles.join(",")
  );
  assert.match(response.decisionAudit.userExplanation, /Train as planned\./i);
  assert.match(response.decisionAudit.userExplanation, /sensible repeatable defaults/i);
  assert.match(
    response.decisionAudit.kaiExplanation,
    new RegExp(response.sessionDecision.sessionMode)
  );
  assert.match(
    response.decisionAudit.kaiExplanation,
    /confidence low_repeatable_defaults/i
  );
  assert.equal(response.decisionAudit.debugExplanation?.dayProvenance, "planned day");
  assert.match(
    response.decisionAudit.debugExplanation?.confidenceContext ?? "",
    /comparable history is still thin/i
  );
  assert.equal(
    (response.decisionAudit.debugExplanation?.recommendationNotes.length ?? 0) > 0,
    true
  );
});

test("frontend app-state response keeps Kai and today-readiness aligned for browser clients", () => {
  const repositories = createJsonRepositories();
  const seeded = seedScenario({
    userId: "user_app_state",
    scenario: "planned_today",
    repositories
  });
  const kaiService = createKaiService({ repositories });
  const response = buildFrontendAppStateResponse({
    repositories,
    kaiService,
    userId: "user_app_state",
    asOf: seeded.asOf
  });

  assert.equal(response.userId, "user_app_state");
  assert.equal(response.asOf, seeded.asOf);
  assert.equal(response.profile.userId, "user_app_state");
  assert.equal(response.kaiPayload.asOf, seeded.asOf);
  assert.equal(response.todayReadiness.asOf, seeded.asOf);
  assert.equal(response.kaiPayload.plannedWorkoutForDay?.type, "full_body");
  assert.equal(response.todayReadiness.plannedWorkoutType, "full_body");
  assert.equal(response.todayReadiness.decisionAudit.dayOrigin, "planned");
});

test("frontend app-state response keeps constrained thin-history upper days browser-ready", () => {
  const repositories = createJsonRepositories();
  const seeded = seedScenario({
    userId: "user_app_state_equipment_upper",
    scenario: "thin_history_equipment_limited_upper",
    repositories
  });
  const kaiService = createKaiService({ repositories });
  const response = buildFrontendAppStateResponse({
    repositories,
    kaiService,
    userId: "user_app_state_equipment_upper",
    asOf: seeded.asOf
  });

  assert.equal(response.userId, "user_app_state_equipment_upper");
  assert.equal(response.asOf, "2026-03-30");
  assert.equal(response.profile.equipmentAccess, "bodyweight_only");
  assert.equal(response.kaiPayload.plannedWorkoutForDay?.type, "upper_body");
  assert.equal(response.todayReadiness.plannedWorkoutType, "upper_body");
  assert.equal(response.todayReadiness.readinessModel.dataConfidence, "low");
  assert.equal(response.todayReadiness.decisionAudit.dayOrigin, "planned");
  assert.match(
    response.todayReadiness.decisionAudit.userExplanation,
    /equipment/i
  );
  assert.equal(
    response.todayReadiness.decisionAudit.selectedSubstitutes[0]?.exerciseId,
    "pull_up"
  );
  assert.match(response.todayReadiness.frontendCopy.primaryAction, /pull-up/i);
  assert.doesNotMatch(response.todayReadiness.frontendCopy.primaryAction, /lat pulldown/i);
  assert.deepEqual(
    response.todayReadiness.frontendExplanation.startingExercises,
    ["Pull-up"]
  );
  assert.equal(
    response.todayReadiness.sessionPlan.blocks[0]?.exampleExerciseIds.includes("lat_pulldown"),
    false
  );
  assert.equal(
    response.todayReadiness.substitutionOptions.length,
    0
  );
});

test("frontend decision audit stays explicitly unplanned when no day provenance is provided", () => {
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

  assert.equal(response.decisionAudit.dayOrigin, "unplanned");
  assert.equal(response.decisionAudit.originReasonLabel, undefined);
  assert.equal(response.decisionAudit.originBias, undefined);
  assert.equal(
    response.decisionAudit.debugExplanation?.dayProvenance,
    "unplanned day"
  );
});

test("frontend safer alternatives prioritize the session-plan examples first", () => {
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
    response.saferAlternatives.slice(0, 3).map((exercise) => exercise.exerciseId),
    ["squat", "barbell_bench_press", "pull_up"]
  );
});

test("today-readiness headline and explanation carry the rebuilding weekly arc", () => {
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
    trainingReadiness,
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      splitStyle: "full_body",
      targetSessions: 3,
      plannedCount: 1,
      completedCount: 0,
      remainingPlannedCount: 1,
      todayPlanned: true,
      weeklyArcPattern: "rebuilding",
      weeklyArcHeadline: "You are climbing back up"
    }
  );

  assert.equal(
    response.frontendCopy.readinessHeadline,
    "Train as planned. You are climbing back up, so keep today repeatable."
  );
  assert.equal(
    response.frontendExplanation.weekContext,
    "This day sits inside a rebuild stretch, so the goal is to keep progress feeling repeatable."
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

  const primaryBlock = response.sessionPlan.blocks.find(
    (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
  );

  assert.equal(response.plannedWorkoutType, "pull_day");
  assert.deepEqual(response.frontendCopy, {
    sessionLabel: "Accessory-only session",
    readinessHeadline: "Keep the day, but keep it very small.",
    primaryAction: response.frontendCopy.primaryAction,
    fallbackNote: "This works today, but it is more fallback than ideal."
  });
  assert.match(
    response.frontendCopy.primaryAction,
    /^Use .*shrug.* as an acceptable fallback today\.$/
  );
  assert.equal(response.sessionPlan.sessionStyle, "accessory_only");
  assert.deepEqual(
    {
      slot: primaryBlock?.slot,
      focus: primaryBlock?.focus,
      blockTier: primaryBlock?.blockTier
    },
    {
      slot: "secondary",
      focus: "Lighter upper-back or arm work",
      blockTier: "acceptable"
    }
  );
  assert.equal(primaryBlock?.exampleExerciseIds.includes("shrug"), true);
  assert.equal(
    primaryBlock?.exampleExercises?.some((exercise) => exercise.exerciseId === "shrug"),
    true
  );
  assert.equal(response.substitutionOptions[0], undefined);
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

  const primaryBlock = response.sessionPlan.blocks.find(
    (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
  );

  assert.equal(response.plannedWorkoutType, "push_day");
  assert.deepEqual(response.frontendCopy, {
    sessionLabel: "Accessory-only session",
    readinessHeadline: "Keep the day, but keep it very small.",
    primaryAction: response.frontendCopy.primaryAction,
    fallbackNote: "This works today, but it is more fallback than ideal."
  });
  assert.match(
    response.frontendCopy.primaryAction,
    /^Use .*lateral raise.* as an acceptable fallback today\.$/
  );
  assert.equal(response.sessionPlan.sessionStyle, "accessory_only");
  assert.deepEqual(
    {
      slot: primaryBlock?.slot,
      focus: primaryBlock?.focus,
      blockTier: primaryBlock?.blockTier
    },
    {
      slot: "secondary",
      focus: "Lower-cost push accessories",
      blockTier: "acceptable"
    }
  );
  assert.equal(primaryBlock?.exampleExerciseIds.includes("lateral_raise"), true);
  assert.equal(
    primaryBlock?.exampleExerciseIds.includes("cable_lateral_raise"),
    true
  );
  assert.equal(response.saferAlternatives[0]?.exerciseId, "lateral_raise");
  assert.equal(response.saferAlternatives[0]?.tolerance, "yellow");
});

test("today-readiness explanation surfaces fallback-only changes clearly", () => {
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

  assert.equal(
    response.frontendExplanation.whatChangedToday,
    "The original day stayed in place, but it was reduced to small fallback work."
  );
  assert.equal(
    response.frontendExplanation.focusAreas.includes("Lower-cost push accessories"),
    true
  );
  assert.equal(
    response.frontendExplanation.cautionAreas.some((item) =>
      item.includes("front delts") || item.includes("triceps")
    ),
    true
  );
  assert.equal(
    response.frontendExplanation.startingExercises.some((name) =>
      name.toLowerCase().includes("lateral raise")
    ),
    true
  );
});

test("today-readiness decision audit surfaces recovering, avoid, and recommendation rationale on a fatigued day", () => {
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

  assert.equal(response.decisionAudit.recoveringMuscles.length > 0, true);
  assert.equal(response.decisionAudit.avoidMuscles.length > 0, true);
  assert.equal(response.decisionAudit.deprioritizedExercises.length > 0, true);
  assert.equal(response.decisionAudit.selectedSubstitutes.length > 0, true);
  assert.equal(
    response.decisionAudit.deprioritizedExercises.every((entry) => entry.why.length > 0),
    true
  );
  assert.equal(
    response.decisionAudit.selectedSubstitutes.every((entry) => entry.why.length > 0),
    true
  );
  assert.equal(
    response.decisionAudit.selectedSubstitutes.every((entry) => Boolean(entry.provenance)),
    true
  );
  assert.equal(
    response.decisionAudit.deprioritizedExercises.every((entry) => Boolean(entry.provenance)),
    true
  );
  assert.equal(
    response.decisionAudit.selectedSubstitutes.every(
      (entry) => entry.selectionTier === "acceptable_fallback"
    ),
    true
  );
  assert.equal(
    response.decisionAudit.deprioritizedExercises.some(
      (entry) =>
        entry.exerciseId === "tricep_pushdown" &&
        entry.why.some((reason) => reason.includes("triceps is still overworked"))
    ),
    true
  );
  assert.match(response.decisionAudit.userExplanation, /fallback options/i);
  assert.match(response.decisionAudit.userExplanation, /keep/i);
  assert.match(response.decisionAudit.kaiExplanation, /fit acceptable_fallback/i);
  assert.equal(
    (response.decisionAudit.debugExplanation?.topRecoveryLimiters.length ?? 0) > 0,
    true
  );
});

test("today-readiness explanation stays aligned with an oscillating weekly arc on a modified day", () => {
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
    trainingReadiness,
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      splitStyle: "full_body",
      targetSessions: 3,
      plannedCount: 2,
      completedCount: 1,
      remainingPlannedCount: 1,
      todayPlanned: true,
      weeklyArcPattern: "oscillating",
      weeklyArcHeadline: "The last few weeks have been up and down"
    }
  );

  assert.match(
    response.frontendCopy.readinessHeadline,
    /The last few weeks have been up and down, so keep today steady\./
  );
  assert.equal(
    response.frontendExplanation.weekContext,
    "This day sits inside an up-and-down stretch, so the goal is to make the pattern feel steadier."
  );
});

test("today-readiness exposes a strong objective readiness model for a clean planned day", () => {
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

  assert.equal(response.readinessModel.source, "objective_signals_only");
  assert.equal(response.readinessModel.score >= 70, true);
  assert.equal(response.readinessModel.band, "high");
  assert.equal(response.readinessModel.signalScores.recovery >= 75, true);
  assert.equal(response.readinessModel.reasons.length >= 1, true);
});

test("today-readiness drops the objective readiness model when a day is heavily fatigued", () => {
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

  assert.equal(response.readinessModel.score < 50, true);
  assert.equal(response.readinessModel.band, "low");
  assert.equal(
    response.readinessModel.reasons.some(
      (reason) =>
        reason.toLowerCase().includes("recovery") ||
        reason.toLowerCase().includes("fatigue")
    ),
    true
  );
});

test("objective readiness model reports low confidence when history is thin", () => {
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-24",
    "full_body"
  );

  assert.equal(trainingReadiness.readinessModel.dataConfidence, "low");
  assert.equal(trainingReadiness.readinessModel.source, "objective_signals_only");
  assert.equal(trainingReadiness.readinessModel.signalScores.comparableHistory, 62);
});

test("exercise library gives every current training effect at least two exercise options", () => {
  const effectsWithCounts = new Map<string, number>();

  for (const exercise of getExerciseLibrary()) {
    for (const effect of exercise.trainingEffects ?? []) {
      effectsWithCounts.set(effect, (effectsWithCounts.get(effect) ?? 0) + 1);
    }
  }

  const singleOptionEffects = [...effectsWithCounts.entries()]
    .filter(([, count]) => count < 2)
    .map(([effect]) => effect)
    .sort();

  assert.deepEqual(singleOptionEffects, []);
  assert.equal(getExercisesByTrainingEffect("vertical_press").length >= 2, true);
  assert.equal(getExercisesByTrainingEffect("chest_isolation").length >= 2, true);
  assert.equal(getExercisesByTrainingEffect("glute_bias").length >= 2, true);
});

test("exercise library assigns contribution weights that match exercise context", () => {
  const exerciseLibrary = getExerciseLibrary();
  const barbellBenchPress = getExerciseById("barbell_bench_press");
  const pecDeckFly = getExerciseById("pec_deck_fly");
  const gobletSquat = getExerciseById("goblet_squat");
  const bulgarianSplitSquat = getExerciseById("bulgarian_split_squat");
  const oneArmDumbbellRow = getExerciseById("one_arm_dumbbell_row");
  const chestSupportedDumbbellRow = getExerciseById("chest_supported_dumbbell_row");
  const preacherCurl = getExerciseById("preacher_curl");
  const smithMachineShrug = getExerciseById("smith_machine_shrug");

  assert.deepEqual(barbellBenchPress?.contributionWeights, {
    primary: 0.98,
    secondary: 0.6,
    stabilizer: 0.24
  });
  assert.deepEqual(pecDeckFly?.contributionWeights, {
    primary: 1.08,
    secondary: 0.16,
    stabilizer: 0.04
  });
  assert.deepEqual(gobletSquat?.contributionWeights, {
    primary: 0.94,
    secondary: 0.58,
    stabilizer: 0.3
  });
  assert.deepEqual(bulgarianSplitSquat?.contributionWeights, {
    primary: 0.9,
    secondary: 0.68,
    stabilizer: 0.42
  });
  assert.deepEqual(preacherCurl?.contributionWeights, {
    primary: 1.12,
    secondary: 0.18,
    stabilizer: 0.02
  });
  assert.deepEqual(smithMachineShrug?.contributionWeights, {
    primary: 1.1,
    secondary: 0.16,
    stabilizer: 0.05
  });
  assert.equal(
    (oneArmDumbbellRow?.contributionWeights.stabilizer ?? 0) >
      (chestSupportedDumbbellRow?.contributionWeights.stabilizer ?? 0),
    true
  );
  assert.equal(
    exerciseLibrary.every(
      (exercise) =>
        !(
          exercise.contributionWeights.primary === 1 &&
          exercise.contributionWeights.secondary === 0.5 &&
          exercise.contributionWeights.stabilizer === 0.25
        )
    ),
    true
  );
  assert.equal(
    exerciseLibrary.every(
      (exercise) =>
        exercise.contributionWeights.primary >= exercise.contributionWeights.secondary &&
        exercise.contributionWeights.secondary >= exercise.contributionWeights.stabilizer
    ),
    true
  );
});

test("exercise library keeps core family weight relationships coherent", () => {
  const overheadShoulderPress = getExerciseById("overhead_shoulder_press");
  const machineShoulderPress = getExerciseById("machine_shoulder_press");
  const shrug = getExerciseById("shrug");
  const preacherCurl = getExerciseById("preacher_curl");
  const barbellCurl = getExerciseById("barbell_curl");
  const tricepPushdown = getExerciseById("tricep_pushdown");
  const cableOverheadTricepExtension = getExerciseById("cable_overhead_tricep_extension");
  const smithMachineShrug = getExerciseById("smith_machine_shrug");
  const squat = getExerciseById("squat");
  const legPress = getExerciseById("leg_press");

  assert.equal(
    (overheadShoulderPress?.contributionWeights.stabilizer ?? 0) >
      (machineShoulderPress?.contributionWeights.stabilizer ?? 0),
    true
  );
  assert.equal(
    (preacherCurl?.contributionWeights.primary ?? 0) >
      (barbellCurl?.contributionWeights.primary ?? 0),
    true
  );
  assert.equal(
    (preacherCurl?.contributionWeights.stabilizer ?? 0) <
      (barbellCurl?.contributionWeights.stabilizer ?? 0),
    true
  );
  assert.equal(
    (tricepPushdown?.contributionWeights.primary ?? 0) >
      (cableOverheadTricepExtension?.contributionWeights.primary ?? 0),
    true
  );
  assert.equal(
    (cableOverheadTricepExtension?.contributionWeights.stabilizer ?? 0) >
      (tricepPushdown?.contributionWeights.stabilizer ?? 0),
    true
  );
  assert.equal(
    (smithMachineShrug?.contributionWeights.primary ?? 0) >
      (shrug?.contributionWeights.primary ?? 0),
    true
  );
  assert.equal(
    (smithMachineShrug?.contributionWeights.stabilizer ?? 0) <
      (shrug?.contributionWeights.stabilizer ?? 0),
    true
  );
  assert.equal(
    (legPress?.contributionWeights.stabilizer ?? 0) <
      (squat?.contributionWeights.stabilizer ?? 0),
    true
  );
});

test("readiness muscle load now changes between supported and cable isolation variants", () => {
  const cableFlyReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_cable_fly",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 45,
        completedDuration: 40,
        status: "completed",
        sessionExercises: [
          { exerciseId: "cable_chest_fly", sets: 4, reps: 12, effort: "moderate" }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const pecDeckReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_pec_deck",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 45,
        completedDuration: 40,
        status: "completed",
        sessionExercises: [{ exerciseId: "pec_deck_fly", sets: 4, reps: 12, effort: "moderate" }]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const cableChest = requireMuscleLoad(cableFlyReport, "chest");
  const pecDeckChest = requireMuscleLoad(pecDeckReport, "chest");
  const cableFrontDelts = requireMuscleLoad(cableFlyReport, "front_delts");
  const pecDeckFrontDelts = requireMuscleLoad(pecDeckReport, "front_delts");
  const cableCore = requireMuscleLoad(cableFlyReport, "core");
  const pecDeckCore = findMuscleLoad(pecDeckReport, "core");

  assert.equal(pecDeckChest.totalLoad > cableChest.totalLoad, true);
  assert.equal(cableFrontDelts.totalLoad > pecDeckFrontDelts.totalLoad, true);
  assert.equal(cableCore.totalLoad > 0, true);
  assert.equal(pecDeckCore, undefined);
});

test("readiness muscle load differs between standing and supported curl variations", () => {
  const standingCurlReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_barbell_curl",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 40,
        completedDuration: 35,
        status: "completed",
        sessionExercises: [{ exerciseId: "barbell_curl", sets: 4, reps: 10, effort: "moderate" }]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const preacherCurlReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_preacher_curl",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 40,
        completedDuration: 35,
        status: "completed",
        sessionExercises: [{ exerciseId: "preacher_curl", sets: 4, reps: 10, effort: "moderate" }]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const standingBiceps = requireMuscleLoad(standingCurlReport, "biceps");
  const preacherBiceps = requireMuscleLoad(preacherCurlReport, "biceps");
  const standingCore = requireMuscleLoad(standingCurlReport, "core");
  const preacherCore = findMuscleLoad(preacherCurlReport, "core");

  assert.equal(preacherBiceps.totalLoad > standingBiceps.totalLoad, true);
  assert.equal(standingCore.totalLoad > 0, true);
  assert.equal(preacherCore, undefined);
});

test("readiness muscle load differs between pushdown and overhead triceps variations", () => {
  const pushdownReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_pushdown",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 40,
        completedDuration: 35,
        status: "completed",
        sessionExercises: [
          { exerciseId: "tricep_pushdown", sets: 4, reps: 12, effort: "moderate" }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const overheadExtensionReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_cable_overhead_extension",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 40,
        completedDuration: 35,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "cable_overhead_tricep_extension",
            sets: 4,
            reps: 12,
            effort: "moderate"
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const pushdownTriceps = requireMuscleLoad(pushdownReport, "triceps");
  const overheadTriceps = requireMuscleLoad(overheadExtensionReport, "triceps");
  const pushdownFrontDelts = findMuscleLoad(pushdownReport, "front_delts");
  const overheadFrontDelts = requireMuscleLoad(overheadExtensionReport, "front_delts");

  assert.equal(pushdownTriceps.totalLoad > overheadTriceps.totalLoad, true);
  assert.equal(pushdownFrontDelts, undefined);
  assert.equal(overheadFrontDelts.totalLoad > 0, true);
});

test("readiness muscle load differs between free and guided shrug variations", () => {
  const shrugReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_shrug",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 35,
        completedDuration: 30,
        status: "completed",
        sessionExercises: [{ exerciseId: "shrug", sets: 4, reps: 12, effort: "moderate" }]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const smithShrugReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_smith_shrug",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 35,
        completedDuration: 30,
        status: "completed",
        sessionExercises: [
          { exerciseId: "smith_machine_shrug", sets: 4, reps: 12, effort: "moderate" }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const shrugUpperTraps = requireMuscleLoad(shrugReport, "upper_traps");
  const smithUpperTraps = requireMuscleLoad(smithShrugReport, "upper_traps");
  const shrugCore = requireMuscleLoad(shrugReport, "core");
  const smithCore = requireMuscleLoad(smithShrugReport, "core");

  assert.equal(smithUpperTraps.totalLoad > shrugUpperTraps.totalLoad, true);
  assert.equal(shrugCore.totalLoad > smithCore.totalLoad, true);
});

test("readiness muscle load differs between supported and unsupported row variations", () => {
  const supportedRowReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_supported_row",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 45,
        completedDuration: 40,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "chest_supported_machine_row",
            sets: 4,
            reps: 10,
            effort: "moderate"
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const unsupportedRowReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_unsupported_row",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 45,
        completedDuration: 40,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bent_over_row",
            sets: 4,
            reps: 10,
            effort: "moderate"
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const supportedSpinalErectors = findMuscleLoad(supportedRowReport, "spinal_erectors");
  const unsupportedSpinalErectors = requireMuscleLoad(unsupportedRowReport, "spinal_erectors");
  const supportedCore = findMuscleLoad(supportedRowReport, "core");
  const unsupportedCore = requireMuscleLoad(unsupportedRowReport, "core");

  assert.equal(supportedSpinalErectors, undefined);
  assert.equal(unsupportedSpinalErectors.totalLoad > 0, true);
  assert.equal((supportedCore?.totalLoad ?? 0) < unsupportedCore.totalLoad, true);
});

test("readiness muscle load differs between unilateral and bilateral leg variations", () => {
  const unilateralReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_bulgarian_split_squat",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 50,
        completedDuration: 42,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "bulgarian_split_squat",
            sets: 3,
            reps: 10,
            effort: "moderate"
          }
        ]
      }
    ],
    "2026-03-24",
    "lower_body"
  );

  const bilateralReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_back_squat",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 50,
        completedDuration: 42,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_back_squat",
            sets: 3,
            reps: 10,
            effort: "moderate"
          }
        ]
      }
    ],
    "2026-03-24",
    "lower_body"
  );

  const unilateralGluteMeds = requireMuscleLoad(unilateralReport, "glute_meds");
  const bilateralGluteMeds = requireMuscleLoad(bilateralReport, "glute_meds");
  const unilateralQuads = requireMuscleLoad(unilateralReport, "quads");
  const bilateralQuads = requireMuscleLoad(bilateralReport, "quads");
  const unilateralSpinalErectors = requireMuscleLoad(unilateralReport, "spinal_erectors");
  const bilateralSpinalErectors = requireMuscleLoad(bilateralReport, "spinal_erectors");

  assert.equal(
    unilateralGluteMeds.totalLoad / unilateralQuads.totalLoad >
      bilateralGluteMeds.totalLoad / bilateralQuads.totalLoad,
    true
  );
  assert.equal(bilateralSpinalErectors.totalLoad > unilateralSpinalErectors.totalLoad, true);
});

test("readiness uses performed sets when actual work is lighter than the planned prescription", () => {
  const estimatedReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "estimated_squat_load",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        completedDuration: 50,
        status: "completed",
        sessionExercises: [
          { exerciseId: "barbell_back_squat", sets: 4, reps: 8, effort: "moderate" }
        ]
      }
    ],
    "2026-03-24",
    "lower_body"
  );

  const setAwareReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "set_aware_squat_load",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        completedDuration: 32,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_back_squat",
            sets: 4,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, effort: "moderate", restSeconds: 135, completed: true },
              { reps: 7, effort: "moderate", restSeconds: 145, completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-24",
    "lower_body"
  );

  const estimatedQuads = requireMuscleLoad(estimatedReport, "quads");
  const setAwareQuads = requireMuscleLoad(setAwareReport, "quads");

  assert.equal(setAwareQuads.totalLoad < estimatedQuads.totalLoad, true);
  assert.equal(setAwareQuads.unresolvedLoad < estimatedQuads.unresolvedLoad, true);
  assert.equal(setAwareQuads.recoveryTimeHours < estimatedQuads.recoveryTimeHours, true);
});

test("readiness uses logged weight to distinguish heavier and lighter versions of the same lift", () => {
  const lighterBenchReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "lighter_bench_load",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 40,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 40, effort: "moderate", completed: true },
              { reps: 8, weightKg: 40, effort: "moderate", completed: true },
              { reps: 8, weightKg: 40, effort: "moderate", completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const heavierBenchReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "heavier_bench_load",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 40,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 80, effort: "moderate", completed: true },
              { reps: 8, weightKg: 80, effort: "moderate", completed: true },
              { reps: 8, weightKg: 80, effort: "moderate", completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const lighterChest = requireMuscleLoad(lighterBenchReport, "chest");
  const heavierChest = requireMuscleLoad(heavierBenchReport, "chest");
  const lighterFrontDelts = requireMuscleLoad(lighterBenchReport, "front_delts");
  const heavierFrontDelts = requireMuscleLoad(heavierBenchReport, "front_delts");

  assert.equal(heavierChest.totalLoad > lighterChest.totalLoad, true);
  assert.equal(heavierChest.unresolvedLoad > lighterChest.unresolvedLoad, true);
  assert.equal(heavierFrontDelts.totalLoad > lighterFrontDelts.totalLoad, true);
});

test("readiness extends recovery when performed sets show rising fatigue inside the exercise", () => {
  const cleanReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "clean_bench_sets",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 42,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 4,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, effort: "moderate", restSeconds: 110, completed: true },
              { reps: 8, effort: "moderate", restSeconds: 115, completed: true },
              { reps: 8, effort: "moderate", restSeconds: 120, completed: true },
              { reps: 8, effort: "moderate", restSeconds: 120, completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const fatiguedReport = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "fatigued_bench_sets",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 45,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 4,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, effort: "moderate", restSeconds: 110, completed: true },
              { reps: 8, effort: "moderate", restSeconds: 125, completed: true },
              { reps: 7, effort: "hard", restSeconds: 145, completed: true },
              { reps: 6, effort: "hard", restSeconds: 160, completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const cleanChest = requireMuscleLoad(cleanReport, "chest");
  const fatiguedChest = requireMuscleLoad(fatiguedReport, "chest");

  assert.equal(fatiguedChest.unresolvedLoad > cleanChest.unresolvedLoad, true);
  assert.equal(fatiguedChest.recoveryTimeHours > cleanChest.recoveryTimeHours, true);
  assert.equal(fatiguedChest.hoursUntilRecovered > cleanChest.hoursUntilRecovered, true);
});

test("readiness treats small near-finished residual fatigue as recovered instead of automatically recovering", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "almost_done_chest_fly",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 35,
        completedDuration: 14,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "cable_chest_fly",
            sets: 3,
            reps: 12,
            effort: "easy",
            performedSets: [{ reps: 12, effort: "easy", restSeconds: 75, completed: true }]
          }
        ]
      }
    ],
    "2026-03-24",
    "upper_body"
  );

  const chest = requireMuscleLoad(report, "chest");

  assert.equal(chest.unresolvedLoad < 2, true);
  assert.equal(chest.hoursUntilRecovered <= 12, true);
  assert.equal(chest.recoveryState, "recovered");
});

test("readiness still marks stacked long-recovery posterior-chain fatigue as overworked", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "posterior_stack",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 70,
        completedDuration: 63,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "deadlift_conventional",
            sets: 4,
            reps: 5,
            effort: "hard",
            performedSets: [
              { reps: 5, effort: "moderate", restSeconds: 180, completed: true },
              { reps: 5, effort: "hard", restSeconds: 210, completed: true },
              { reps: 4, effort: "hard", restSeconds: 240, completed: true },
              { reps: 4, effort: "hard", restSeconds: 255, completed: true }
            ]
          },
          {
            exerciseId: "romanian_deadlift",
            sets: 3,
            reps: 8,
            effort: "hard",
            performedSets: [
              { reps: 8, effort: "moderate", restSeconds: 150, completed: true },
              { reps: 7, effort: "hard", restSeconds: 180, completed: true },
              { reps: 6, effort: "hard", restSeconds: 195, completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-24",
    "lower_body"
  );

  const hamstrings = requireMuscleLoad(report, "hamstrings");
  const spinalErectors = requireMuscleLoad(report, "spinal_erectors");

  assert.equal(hamstrings.recoveryState, "overworked");
  assert.equal(spinalErectors.recoveryState, "overworked");
  assert.equal(hamstrings.hoursUntilRecovered >= 36, true);
});

test("readiness marks fully resolved historical load as recovered", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "resolved_upper_load",
        userId: "user_1",
        date: "2026-03-28",
        recordedAt: "2026-03-28T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 60,
        completedDuration: 54,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 5,
            reps: 8,
            effort: "hard"
          }
        ]
      }
    ],
    "2026-04-01",
    "upper_body"
  );

  const chest = requireMuscleLoad(report, "chest");
  const triceps = requireMuscleLoad(report, "triceps");

  assert.equal(chest.unresolvedLoad, 0);
  assert.equal(chest.hoursUntilRecovered, 0);
  assert.equal(chest.recoveryState, "recovered");
  assert.equal(triceps.unresolvedLoad, 0);
  assert.equal(triceps.hoursUntilRecovered, 0);
  assert.equal(triceps.recoveryState, "recovered");
  assert.equal(
    report.readinessModel.reasons.some((reason) =>
      /biggest recovery limiter/i.test(reason)
    ),
    false
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

  const topAlternativeIds = response.saferAlternatives.slice(0, 2).map((exercise) => exercise.exerciseId);

  assert.equal(response.plannedWorkoutType, "lower_body");
  assert.deepEqual(response.frontendCopy, {
    sessionLabel: "Modified session",
    readinessHeadline: "Train, but keep the overlap under control.",
    primaryAction: "Start with leg extension or calf raise. This is a sensible repeatable place to begin today.",
    fallbackNote: "This is a sensible default while the backend is still learning your pattern."
  });
  assert.deepEqual(
    {
      status: response.sessionDecision.status,
      summary: response.sessionDecision.summary,
      sessionMode: response.sessionDecision.sessionMode,
      volumeAdjustment: response.sessionDecision.volumeAdjustment,
      intensityAdjustment: response.sessionDecision.intensityAdjustment,
      progressionIntent: response.sessionDecision.progressionIntent,
      firstNote: response.sessionDecision.notes[0]
    },
    {
      status: "train_modified",
      summary: "Train, but make the session slightly easier to recover from.",
      sessionMode: "lower_body_modified",
      volumeAdjustment: "reduce_10_percent",
      intensityAdjustment: "keep_submaximal",
      progressionIntent: undefined,
      firstNote: "Glutes, hamstrings, and spinal erectors are still the main recovery watch-points."
    }
  );
  assert.match(response.sessionDecision.notes[1] ?? "", /^Safer options today are .*calf raise.*\.$/);
  assert.equal(response.sessionPlan.sessionStyle, "modified");
  assert.deepEqual(
    {
      slot: response.sessionPlan.blocks[0]?.slot,
      focus: response.sessionPlan.blocks[0]?.focus,
      blockTier: response.sessionPlan.blocks[0]?.blockTier
    },
    {
      slot: "main",
      focus: "Quad-dominant lower-body work",
      blockTier: "best"
    }
  );
  assert.equal(
    response.sessionPlan.blocks[0]?.exampleExerciseIds.includes("leg_extension"),
    true
  );
  assert.equal(
    response.sessionPlan.blocks[0]?.exampleExerciseIds.includes("calf_raise"),
    true
  );
  assert.equal(topAlternativeIds.includes("calf_raise"), true);
  assert.equal(
    topAlternativeIds.some((exerciseId) =>
      ["leg_extension", "seated_calf_raise"].includes(exerciseId)
    ),
    true
  );
});

test("today-readiness explanation names the shift on a modified lower-body day", () => {
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

  assert.equal(
    response.frontendExplanation.whatChangedToday,
    "The day stayed in place, but the backend shifted the work away from the main recovery bottlenecks."
  );
  assert.equal(
    response.frontendExplanation.whyTodayLooksThisWay.includes(
      "Glutes, hamstrings, and spinal erectors are still the main recovery watch-points."
    ),
    true
  );
  assert.equal(
    response.frontendExplanation.cautionAreas.includes(
      "Limit overlap on glutes, hamstrings, and spinal erectors."
    ),
    true
  );
  assert.deepEqual(response.frontendExplanation.startingExercises, [
    "Leg Extension",
    "Calf Raise"
  ]);
});

test("today-readiness history entries keep the frontend coaching snapshot", () => {
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
  const historyEntry = buildReadinessHistoryEntry(
    response,
    "2026-03-24T08:30:00.000Z"
  );
  const selectedSubstituteIds = response.decisionAudit.selectedSubstitutes
    .map((entry) => entry.exerciseId)
    .filter((exerciseId) => !historyEntry.primaryExerciseIds.includes(exerciseId))
    .slice(0, 4);

  assert.deepEqual(
    {
      asOf: historyEntry.asOf,
      plannedWorkoutType: historyEntry.plannedWorkoutType,
      sessionStyle: historyEntry.sessionStyle,
      sessionDecisionStatus: historyEntry.sessionDecisionStatus,
      focusMuscles: historyEntry.focusMuscles,
      primaryExerciseIds: historyEntry.primaryExerciseIds,
      explanation: historyEntry.frontendExplanation,
      decisionSnapshot: historyEntry.decisionSnapshot
    },
    {
      asOf: "2026-03-24",
      plannedWorkoutType: "lower_body",
      sessionStyle: "modified",
      sessionDecisionStatus: "train_modified",
      focusMuscles: ["quads", "calves", "glute_meds"],
      primaryExerciseIds: ["leg_extension", "calf_raise"],
      explanation: response.frontendExplanation,
      decisionSnapshot: {
        dayOrigin: response.decisionAudit.dayOrigin,
        decisionSummary:
          response.decisionAudit.debugExplanation?.decisionSummary ??
          `${response.sessionDecision.status} | ${response.sessionPlan.sessionStyle}`,
        recommendedTrainingDirection: response.decisionAudit.recommendedTrainingDirection,
        topRecoveryLimiters:
          response.decisionAudit.debugExplanation?.topRecoveryLimiters.slice(0, 3) ?? [],
        musclesToAvoid: response.decisionAudit.avoidMuscles.slice(0, 6),
        movementPatternsToAvoid: response.decisionAudit.avoidMovementPatterns.slice(0, 4),
        primaryExerciseIds: ["leg_extension", "calf_raise"],
        ...(selectedSubstituteIds.length ? { selectedSubstituteIds } : {})
      }
    }
  );
});

test("modified sessions preserve a workable main slot before collapsing into support-only work", () => {
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_push",
        userId: "user_1",
        date: "2026-03-23",
        recordedAt: "2026-03-23T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 45,
        status: "completed",
        sessionExercises: [
          { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
          { exerciseId: "incline_dumbbell_press", sets: 3, reps: 10, effort: "moderate" },
          { exerciseId: "tricep_pushdown", sets: 3, reps: 12, effort: "moderate" }
        ]
      }
    ],
    "2026-03-24",
    "upper_body",
    "intermediate"
  );

  const mainBlock = trainingReadiness.sessionPlan.blocks.find(
    (block) => block.slot === "main"
  );

  assert.ok(
    ["normal", "modified"].includes(trainingReadiness.sessionPlan.sessionStyle),
    "expected the day to stay workable instead of collapsing into accessory-only support work"
  );
  assert.ok((mainBlock?.exampleExerciseIds.length ?? 0) >= 1);
});

test("upper-body days keep a real push or pull anchor instead of collapsing into arm-only work", () => {
  const trainingReadiness = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "recent_upper",
        userId: "user_1",
        date: "2026-03-21",
        recordedAt: "2026-03-21T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 48,
        status: "completed",
        sessionExercises: [
          { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
          { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
          { exerciseId: "tricep_pushdown", sets: 3, reps: 12, effort: "moderate" }
        ]
      }
    ],
    "2026-03-24",
    "upper_body",
    "intermediate"
  );

  const mainBlock = trainingReadiness.sessionPlan.blocks.find(
    (block) => block.slot === "main"
  );
  const mainExerciseIds = mainBlock?.exampleExerciseIds ?? [];

  assert.ok(mainExerciseIds.length >= 1);
  assert.ok(
    mainExerciseIds.some((exerciseId) => {
      const exercise = getExerciseById(exerciseId);
      const effects = exercise?.trainingEffects ?? [];
      return (
        effects.includes("horizontal_press") ||
        effects.includes("vertical_pull") ||
        effects.includes("horizontal_row")
      );
    }),
    "expected the upper-body main block to keep a real push or pull anchor"
  );
});

test("today-readiness names the fragile workout type when a protected day matches it", () => {
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
    trainingReadiness,
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      splitStyle: "full_body",
      targetSessions: 3,
      plannedCount: 2,
      completedCount: 1,
      remainingPlannedCount: 1,
      todayPlanned: true,
      fragileWorkoutTypeLabel: "Lower body"
    }
  );

  assert.equal(
    response.frontendCopy.readinessHeadline,
    "Train, but keep the overlap under control. Lower body work has been the least stable part of the week."
  );
});

test("today-readiness names suggested-day drift for a no-plan inferred day", () => {
  const response = buildFrontendTrainingReadinessResponse(
    "user_1",
    "2026-03-24",
    {
      userId: "user_1",
      asOf: "2026-03-24",
      plannedWorkoutType: "upper_body",
      readinessModel: {
        source: "objective_signals_only",
        score: 58,
        band: "moderate",
        dataConfidence: "medium",
        dataConfidenceScore: 52,
        summary: "Objective signals support training, but not the highest-pressure version of the day.",
        signalScores: {
          recovery: 61,
          comparableHistory: 62,
          leadingFatigue: 68,
          sessionDemand: 70
        },
        reasons: ["Recent comparable sessions showed early fatigue markers that are worth respecting."]
      },
      sessionDecision: {
        status: "train_modified",
        summary: "Train, but keep the overlap under control.",
        sessionMode: "modified_upper_body",
        volumeAdjustment: "reduce_20_percent",
        intensityAdjustment: "keep_submaximal",
        notes: []
      },
      sessionPlan: {
        sessionStyle: "modified",
        objective: "Keep an upper-body session workable without overreaching.",
        coachNote: "Keep this one tidy.",
        focusMuscles: ["chest", "lats"],
        limitMuscles: [],
        limitPatterns: [],
        volumeGuidance: "Trim total work slightly.",
        intensityGuidance: "Stay a little shy of failure.",
        blocks: [
          {
            slot: "main",
            focus: "main",
            blockTier: "best",
            exampleExerciseIds: ["barbell_bench_press"]
          }
        ]
      },
      substitutionOptions: [],
      muscleLoadSummary: [],
      movementPatternSummary: [],
      overworkedMuscles: [],
      overworkedPatterns: [],
      recommendedExercises: [],
      deprioritizedExercises: [],
      avoidExercises: [],
      recommendedMusclesToAvoid: []
    },
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      splitStyle: "upper_lower",
      targetSessions: 4,
      plannedCount: 3,
      completedCount: 1,
      remainingPlannedCount: 2,
      todayPlanned: false,
      suggestedWorkoutTypeLabel: "Upper body",
      suggestedWorkoutDriftLabel: "Pull day"
    }
  );

  assert.match(
    response.frontendCopy.readinessHeadline,
    /Recent upper body suggestions have often turned into pull day work instead\./
  );
});

test("completed workouts store a lightweight outcome summary for later planning", () => {
  const store = createAppStore();

  const workouts = store.recordCompletedWorkout({
    id: "completed_1",
    userId: "user_1",
    date: "2026-03-30",
    recordedAt: "2026-03-30T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 47,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
      { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "chest_supported_machine_row", sets: 3, reps: 12, effort: "moderate" }
    ]
  });

  const latest = workouts.find((workout) => workout.id === "completed_1");

  assert.deepEqual(latest?.outcomeSummary, {
    mainCovered: true,
    supportCovered: true,
    coveredSlots: 2,
    sessionSize: "partial",
    durationCompletionRatio: 0.85,
    executionQuality: "strong",
    performedWorkoutType: "upper_body",
    followedPlannedWorkout: undefined,
    followedSuggestedWorkoutType: undefined,
    substitutionCount: 0
  });
});

test("completed workouts preserve explicit execution feedback and fold it into outcome summary", () => {
  const store = createAppStore();

  const workouts = store.recordCompletedWorkout({
    id: "completed_feedback_1",
    userId: "user_feedback",
    date: "2026-03-30",
    recordedAt: "2026-03-30T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 32,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" }
    ],
    executionFeedback: {
      followedPlannedWorkout: true,
      mainCovered: true,
      supportCovered: false,
      executionQuality: "workable",
      substitutedExerciseIds: ["incline_dumbbell_press"]
    }
  });

  const latest = workouts.find((workout) => workout.id === "completed_feedback_1");

  assert.deepEqual(latest?.executionFeedback, {
    followedPlannedWorkout: true,
    mainCovered: true,
    supportCovered: false,
    executionQuality: "workable",
    substitutedExerciseIds: ["incline_dumbbell_press"]
  });
  assert.deepEqual(latest?.outcomeSummary, {
    mainCovered: true,
    supportCovered: false,
    coveredSlots: 1,
    sessionSize: "thin",
    durationCompletionRatio: 0.58,
    executionQuality: "workable",
    performedWorkoutType: "push_day",
    followedPlannedWorkout: true,
    followedSuggestedWorkoutType: undefined,
    substitutionCount: 1
  });
});

test("completed workouts preserve explicit substitution pairs and count them in outcome summary", () => {
  const store = createAppStore();

  const workouts = store.recordCompletedWorkout({
    id: "completed_feedback_pairs_1",
    userId: "user_feedback",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 50,
    completedDuration: 38,
    sessionExercises: [
      { exerciseId: "goblet_squat", sets: 3, reps: 10, effort: "moderate" }
    ],
    executionFeedback: {
      followedPlannedWorkout: false,
      mainCovered: true,
      supportCovered: false,
      executionQuality: "workable",
      substitutionPairs: [
        {
          fromExerciseId: "barbell_back_squat",
          toExerciseId: "goblet_squat"
        }
      ]
    }
  });

  const latest = workouts.find((workout) => workout.id === "completed_feedback_pairs_1");

  assert.deepEqual(latest?.executionFeedback, {
    followedPlannedWorkout: false,
    mainCovered: true,
    supportCovered: false,
    executionQuality: "workable",
    substitutionPairs: [
      {
        fromExerciseId: "barbell_back_squat",
        toExerciseId: "goblet_squat"
      }
    ]
  });
  assert.equal(latest?.outcomeSummary?.substitutionCount, 1);
});

test("completed workouts summarize per-set fatigue markers when set data is logged", () => {
  const store = createAppStore();

  const workouts = store.recordCompletedWorkout({
    id: "completed_set_fidelity_1",
    userId: "user_sets",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 41,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 4,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 60, effort: "moderate", restSeconds: 110, completed: true },
          { reps: 8, weightKg: 60, effort: "moderate", restSeconds: 125, completed: true },
          { reps: 7, weightKg: 60, effort: "hard", restSeconds: 145, completed: true },
          { reps: 6, weightKg: 60, effort: "hard", restSeconds: 160, completed: true }
        ]
      }
    ]
  });

  const latest = workouts.find((workout) => workout.id === "completed_set_fidelity_1");

  assert.equal(latest?.outcomeSummary?.totalLoggedSets, 4);
  assert.equal(latest?.outcomeSummary?.averageRestSeconds, 135);
  assert.equal(latest?.outcomeSummary?.restInflationRatio, 1.13);
  assert.equal(latest?.outcomeSummary?.repDropoffPercent, 25);
  assert.equal(latest?.outcomeSummary?.setEffortTrend, "sharp_rise");
});

test("weekly payload surfaces when logged day types drift from performed work", () => {
  const repositories = createJsonRepositories();

  repositories.profiles.saveProfile({
    userId: "user_performed_drift",
    name: "Performed Drift",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55
  });

  repositories.workouts.recordCompletedWorkout({
    id: "performed_drift_1",
    userId: "user_performed_drift",
    date: "2026-03-20",
    recordedAt: "2026-03-20T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 45,
    sessionExercises: [
      { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
      { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" }
    ]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "performed_drift_2",
    userId: "user_performed_drift",
    date: "2026-03-24",
    recordedAt: "2026-03-24T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 44,
    sessionExercises: [
      { exerciseId: "lat_pulldown", sets: 4, reps: 10, effort: "moderate" },
      { exerciseId: "rear_delt_fly", sets: 3, reps: 15, effort: "moderate" },
      { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" }
    ]
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_performed_drift", "2026-03-30");

  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "workout_type" &&
        /drifting apart/i.test(insight.title) &&
        /upper body/i.test(insight.detail) &&
        /pull day/i.test(insight.detail)
    )
  );
});

test("recommendation memory weights thin sessions lower than fuller successful sessions", () => {
  const baseInput = {
    profile: {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle" as const,
      experienceLevel: "intermediate" as const
    },
    signals: {
      lastActivityAt: "2026-03-30",
      lastCompletedWorkoutAt: "2026-03-30",
      inactiveDays: 0,
      recentCompletedCount: 1,
      recentMissedCount: 0,
      currentStreak: 1,
      longestStreak: 1,
      consistencyScore: 60,
      consistencyStatus: "building" as const
    },
    asOf: "2026-03-30"
  };

  const fullMemory = buildKaiMemory({
    ...baseInput,
    latestCompletedWorkout: {
      id: "full_1",
      userId: "user_1",
      date: "2026-03-30",
      recordedAt: "2026-03-30T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 52,
      status: "completed",
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 12, effort: "moderate" }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 3,
        sessionSize: "full",
        durationCompletionRatio: 0.95,
        executionQuality: "strong"
      }
    }
  });

  const thinMemory = buildKaiMemory({
    ...baseInput,
    latestCompletedWorkout: {
      id: "thin_1",
      userId: "user_1",
      date: "2026-03-30",
      recordedAt: "2026-03-30T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 25,
      status: "completed",
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 2, reps: 8, effort: "easy" }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: false,
        coveredSlots: 1,
        sessionSize: "thin",
        durationCompletionRatio: 0.45,
        executionQuality: "survival"
      }
    }
  });

  assert.ok(
    (fullMemory.recommendationMemory.byExerciseId.barbell_bench_press ?? 0) >
      (thinMemory.recommendationMemory.byExerciseId.barbell_bench_press ?? 0)
  );
  assert.ok(
    (fullMemory.recommendationMemory.byExerciseSlotKey["main:barbell_bench_press"] ?? 0) >
      (thinMemory.recommendationMemory.byExerciseSlotKey["main:barbell_bench_press"] ?? 0)
  );
  assert.deepEqual(fullMemory.sessionPatternMemory, {
    patternLabel: "unsettled",
    dominantWorkoutTypes: [],
    recentSequence: [],
    commonTransitions: [],
    structuredPatternConfidence: 0
  });
});

test("recommendation memory weights high-substitution deviations lower than clean planned execution", () => {
  const baseInput = {
    profile: {
      userId: "user_exec_memory",
      name: "Exec Memory",
      goal: "build_muscle" as const,
      experienceLevel: "intermediate" as const
    },
    signals: {
      lastActivityAt: "2026-03-30",
      lastCompletedWorkoutAt: "2026-03-30",
      inactiveDays: 0,
      recentCompletedCount: 1,
      recentMissedCount: 0,
      currentStreak: 1,
      longestStreak: 1,
      consistencyScore: 60,
      consistencyStatus: "building" as const
    },
    asOf: "2026-03-30"
  };

  const cleanMemory = buildKaiMemory({
    ...baseInput,
    latestCompletedWorkout: {
      id: "clean_exec_1",
      userId: "user_exec_memory",
      date: "2026-03-30",
      recordedAt: "2026-03-30T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 50,
      status: "completed",
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: false,
        coveredSlots: 1,
        sessionSize: "thin",
        durationCompletionRatio: 0.91,
        executionQuality: "workable",
        followedPlannedWorkout: true,
        substitutionCount: 0
      }
    }
  });

  const deviatedMemory = buildKaiMemory({
    ...baseInput,
    latestCompletedWorkout: {
      id: "deviated_exec_1",
      userId: "user_exec_memory",
      date: "2026-03-30",
      recordedAt: "2026-03-30T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 50,
      status: "completed",
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: false,
        coveredSlots: 1,
        sessionSize: "thin",
        durationCompletionRatio: 0.91,
        executionQuality: "workable",
        followedPlannedWorkout: false,
        substitutionCount: 3
      }
    }
  });

  assert.ok(
    (cleanMemory.recommendationMemory.byExerciseId.barbell_bench_press ?? 0) >
      (deviatedMemory.recommendationMemory.byExerciseId.barbell_bench_press ?? 0)
  );
});

test("recommendation memory gently decays stale exercise and substitution preferences over time", () => {
  const decayedMemory = buildKaiMemory({
    profile: {
      userId: "user_memory_decay",
      name: "Memory Decay",
      goal: "build_muscle",
      experienceLevel: "intermediate"
    },
    signals: {
      lastActivityAt: "2026-04-09",
      lastCompletedWorkoutAt: "2026-03-10",
      inactiveDays: 30,
      recentCompletedCount: 0,
      recentMissedCount: 0,
      currentStreak: 0,
      longestStreak: 4,
      consistencyScore: 40,
      consistencyStatus: "starting"
    },
    previousMemory: {
      userId: "user_memory_decay",
      name: "Memory Decay",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "consistent",
      consistencyScore: 82,
      currentStreak: 4,
      recentCompletedCount: 4,
      recentMissedCount: 0,
      lastActivityAt: "2026-03-10",
      restartStyle: "standard_sessions",
      consistencyRisk: "low",
      recoveryStatus: "recovered",
      recommendationTrustScore: 0.7,
      recommendationMemory: {
        byExerciseId: {
          barbell_bench_press: 0.32
        },
        byExerciseSlotKey: {
          "main:barbell_bench_press": 0.32
        },
        byReasonTag: {
          "steady_progress": 0.24
        },
        bySubstitutedExerciseId: {
          incline_dumbbell_press: 0.4
        },
        bySubstitutedExerciseSlotKey: {
          "main:incline_dumbbell_press": 0.45
        },
        bySubstitutedWorkoutTypeExerciseKey: {
          "upper_body:incline_dumbbell_press": 0.5
        },
        bySubstitutionPairKey: {
          "barbell_bench_press->incline_dumbbell_press": 0.55
        }
      },
      sessionPatternMemory: {
        patternLabel: "unsettled",
        dominantWorkoutTypes: [],
        recentSequence: [],
        commonTransitions: [],
        structuredPatternConfidence: 0
      },
      suggestedWorkoutMemory: {
        overallFollowThroughRate: 0
      },
      coachingNote: "Old preference memory should soften over time.",
      lastUpdated: "2026-03-10T08:00:00.000Z"
    },
    asOf: "2026-04-09"
  });

  assert.ok(
    (decayedMemory.recommendationMemory.byExerciseId.barbell_bench_press ?? 0) < 0.32
  );
  assert.ok(
    (decayedMemory.recommendationMemory.byExerciseSlotKey["main:barbell_bench_press"] ?? 0) < 0.32
  );
  assert.ok(
    (decayedMemory.recommendationMemory.bySubstitutedExerciseId?.incline_dumbbell_press ?? 0) < 0.4
  );
  assert.ok(
    (
      decayedMemory.recommendationMemory.bySubstitutionPairKey?.[
        "barbell_bench_press->incline_dumbbell_press"
      ] ?? 0
    ) < 0.55
  );
});

test("memory stores a lightweight recent session pattern for day-by-day users", () => {
  const memory = buildKaiMemory({
    profile: {
      userId: "user_pattern",
      name: "Pattern User",
      goal: "build_muscle",
      experienceLevel: "intermediate"
    },
    signals: {
      lastActivityAt: "2026-03-30",
      lastCompletedWorkoutAt: "2026-03-30",
      inactiveDays: 0,
      recentCompletedCount: 4,
      recentMissedCount: 0,
      currentStreak: 4,
      longestStreak: 4,
      consistencyScore: 82,
      consistencyStatus: "consistent"
    },
    latestCompletedWorkout: {
      id: "pattern_4",
      userId: "user_pattern",
      date: "2026-03-30",
      recordedAt: "2026-03-30T09:00:00.000Z",
      type: "lower_body",
      plannedDuration: 55,
      completedDuration: 50,
      status: "completed",
      sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 2,
        sessionSize: "partial",
        durationCompletionRatio: 0.91,
        executionQuality: "strong"
      }
    },
    workouts: [
      {
        id: "pattern_1",
        userId: "user_pattern",
        date: "2026-03-24",
        recordedAt: "2026-03-24T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 50,
        status: "completed"
      },
      {
        id: "pattern_2",
        userId: "user_pattern",
        date: "2026-03-26",
        recordedAt: "2026-03-26T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        completedDuration: 50,
        status: "completed"
      },
      {
        id: "pattern_3",
        userId: "user_pattern",
        date: "2026-03-28",
        recordedAt: "2026-03-28T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 50,
        status: "completed"
      },
      {
        id: "pattern_4",
        userId: "user_pattern",
        date: "2026-03-30",
        recordedAt: "2026-03-30T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        completedDuration: 50,
        status: "completed"
      }
    ],
    asOf: "2026-03-30"
  });

  assert.deepEqual(memory.sessionPatternMemory, {
    patternLabel: "alternating_mix",
    dominantWorkoutTypes: ["upper_body", "lower_body"],
    recentSequence: ["upper_body", "lower_body", "upper_body", "lower_body"],
    commonTransitions: ["upper_body->lower_body", "lower_body->upper_body"],
    structuredPatternConfidence: 0.7
  });
});

test("session pattern memory prefers performed workout families over logged labels when they drift", () => {
  const memory = buildKaiMemory({
    profile: {
      userId: "user_pattern_performed",
      name: "Performed Pattern",
      goal: "build_muscle",
      experienceLevel: "intermediate"
    },
    signals: {
      lastActivityAt: "2026-03-30",
      lastCompletedWorkoutAt: "2026-03-30",
      inactiveDays: 0,
      recentCompletedCount: 4,
      recentMissedCount: 0,
      currentStreak: 4,
      longestStreak: 4,
      consistencyScore: 82,
      consistencyStatus: "consistent"
    },
    workouts: [
      {
        id: "performed_pattern_1",
        userId: "user_pattern_performed",
        date: "2026-03-24",
        recordedAt: "2026-03-24T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 48,
        status: "completed",
        outcomeSummary: {
          mainCovered: true,
          supportCovered: false,
          coveredSlots: 1,
          sessionSize: "thin",
          durationCompletionRatio: 0.87,
          executionQuality: "workable",
          performedWorkoutType: "pull_day",
          followedPlannedWorkout: false,
          followedSuggestedWorkoutType: undefined,
          substitutionCount: 0
        }
      },
      {
        id: "performed_pattern_2",
        userId: "user_pattern_performed",
        date: "2026-03-26",
        recordedAt: "2026-03-26T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 47,
        status: "completed",
        outcomeSummary: {
          mainCovered: true,
          supportCovered: false,
          coveredSlots: 1,
          sessionSize: "thin",
          durationCompletionRatio: 0.85,
          executionQuality: "workable",
          performedWorkoutType: "pull_day",
          followedPlannedWorkout: false,
          followedSuggestedWorkoutType: undefined,
          substitutionCount: 0
        }
      },
      {
        id: "performed_pattern_3",
        userId: "user_pattern_performed",
        date: "2026-03-28",
        recordedAt: "2026-03-28T09:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        completedDuration: 48,
        status: "completed",
        outcomeSummary: {
          mainCovered: true,
          supportCovered: false,
          coveredSlots: 1,
          sessionSize: "thin",
          durationCompletionRatio: 0.87,
          executionQuality: "workable",
          performedWorkoutType: "lower_body",
          followedPlannedWorkout: true,
          followedSuggestedWorkoutType: undefined,
          substitutionCount: 0
        }
      },
      {
        id: "performed_pattern_4",
        userId: "user_pattern_performed",
        date: "2026-03-30",
        recordedAt: "2026-03-30T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 46,
        status: "completed",
        outcomeSummary: {
          mainCovered: true,
          supportCovered: false,
          coveredSlots: 1,
          sessionSize: "thin",
          durationCompletionRatio: 0.84,
          executionQuality: "workable",
          performedWorkoutType: "pull_day",
          followedPlannedWorkout: false,
          followedSuggestedWorkoutType: undefined,
          substitutionCount: 0
        }
      }
    ],
    asOf: "2026-03-30"
  });

  assert.deepEqual(memory.sessionPatternMemory.recentSequence, [
    "upper_body",
    "upper_body",
    "lower_body",
    "upper_body"
  ]);
  assert.equal(memory.sessionPatternMemory.dominantWorkoutTypes[0], "upper_body");
});

test("weekly plan stays stable for an intermediate six-day split", () => {
  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-26",
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      preferredWorkoutDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
      targetSessionsPerWeek: 6,
      preferredSessionLength: 55,
      focusMuscles: ["chest", "lats"]
    },
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "consistent",
      consistencyScore: 92,
      currentStreak: 8,
      recentCompletedCount: 5,
      recentMissedCount: 0,
      restartStyle: "standard_sessions",
      consistencyRisk: "low",
      recoveryStatus: "recovered",
      recommendationTrustScore: 0.75,
      recommendationMemory: {
        byExerciseId: {},
        byExerciseSlotKey: {},
        byReasonTag: {}
      },
      sessionPatternMemory: {
        patternLabel: "unsettled",
        dominantWorkoutTypes: [],
        recentSequence: [],
        commonTransitions: [],
        structuredPatternConfidence: 0
      },
      nextRecoveryAction: undefined,
      coachingNote: "On track",
      lastUpdated: "2026-03-26T08:00:00.000Z"
    }
  );

  assert.deepEqual(
    {
      weekStart: plan.weekStart,
      weekEnd: plan.weekEnd,
      targetSessions: plan.targetSessions,
      splitStyle: plan.splitStyle,
      workoutDays: plan.days
        .filter((day) => day.status === "planned")
        .map((day) => ({
          date: day.date,
          workoutType: day.workoutType,
          plannedDuration: day.plannedDuration,
          progressionIntent: day.progressionIntent
        })),
      restDays: plan.days
        .filter((day) => day.status === "rest")
        .map((day) => day.dayName)
    },
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      targetSessions: 6,
      splitStyle: "push_pull_legs",
      workoutDays: [
        {
          date: "2026-03-23",
          workoutType: "push_day",
          plannedDuration: 55,
          progressionIntent: "repeat"
        },
        {
          date: "2026-03-24",
          workoutType: "pull_day",
          plannedDuration: 55,
          progressionIntent: "repeat"
        },
        {
          date: "2026-03-25",
          workoutType: "lower_body",
          plannedDuration: 55,
          progressionIntent: "repeat"
        },
        {
          date: "2026-03-26",
          workoutType: "push_day",
          plannedDuration: 55,
          progressionIntent: "repeat"
        },
        {
          date: "2026-03-27",
          workoutType: "pull_day",
          plannedDuration: 55,
          progressionIntent: "repeat"
        },
        {
          date: "2026-03-28",
          workoutType: "lower_body",
          plannedDuration: 55,
          progressionIntent: "repeat"
        }
      ],
      restDays: ["Sunday"]
    }
  );
});

test("weekly plan adapts downward after a missed week", () => {
  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_consistency",
      experienceLevel: "intermediate",
      preferredWorkoutDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      targetSessionsPerWeek: 5,
      preferredSessionLength: 50
    },
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_consistency",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "building",
      consistencyScore: 54,
      currentStreak: 0,
      recentCompletedCount: 1,
      recentMissedCount: 3,
      restartStyle: "small_sessions",
      consistencyRisk: "high",
      recoveryStatus: "slipping",
      recommendationTrustScore: 0.2,
      recommendationMemory: {
        byExerciseId: {},
        byExerciseSlotKey: {},
        byReasonTag: {}
      },
      sessionPatternMemory: {
        patternLabel: "unsettled",
        dominantWorkoutTypes: [],
        recentSequence: [],
        commonTransitions: [],
        structuredPatternConfidence: 0
      },
      nextRecoveryAction: undefined,
      coachingNote: "Needs a reset",
      lastUpdated: "2026-03-30T08:00:00.000Z"
    },
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "off_track",
      plannedCount: 5,
      completedCount: 1,
      missedCount: 3,
      plannedCompletedCount: 1,
      plannedMissedCount: 3,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 20,
      mainCoveragePercent: 0,
      supportCoveragePercent: 0,
      thinSessionCount: 1,
      fullSessionCount: 0
    }
  );

  assert.deepEqual(
    {
      targetSessions: plan.targetSessions,
      splitStyle: plan.splitStyle,
      rationale: plan.rationale,
      workoutDays: plan.days
        .filter((day) => day.status === "planned")
        .map((day) => ({
          dayName: day.dayName,
          plannedDuration: day.plannedDuration,
          workoutType: day.workoutType,
          progressionIntent: day.progressionIntent
        }))
    },
    {
      targetSessions: 3,
      splitStyle: "full_body",
      rationale:
        "3 planned sessions using a full body structure. The week is slightly compressed to protect adherence. Recent misses pulled the plan down to something easier to finish.",
      workoutDays: [
        {
          dayName: "Monday",
          plannedDuration: 30,
          workoutType: "full_body",
          progressionIntent: "conservative"
        },
        {
          dayName: "Tuesday",
          plannedDuration: 30,
          workoutType: "full_body",
          progressionIntent: "conservative"
        },
        {
          dayName: "Wednesday",
          plannedDuration: 30,
          workoutType: "full_body",
          progressionIntent: "conservative"
        }
      ]
    }
  );
});

test("weekly plan can follow a stable recent split pattern for day-by-day users", () => {
  const plan = buildWeeklyPlan(
    "user_pattern_plan",
    "2026-03-30",
    {
      userId: "user_pattern_plan",
      name: "Pattern Planner",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 5,
      preferredSessionLength: 55,
      trainingStylePreference: "balanced"
    },
    {
      userId: "user_pattern_plan",
      name: "Pattern Planner",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "consistent",
      consistencyScore: 88,
      currentStreak: 4,
      recentCompletedCount: 4,
      recentMissedCount: 0,
      restartStyle: "standard_sessions",
      consistencyRisk: "low",
      recoveryStatus: "recovered",
      recommendationTrustScore: 0.7,
      recommendationMemory: {
        byExerciseId: {},
        byExerciseSlotKey: {},
        byReasonTag: {}
      },
      sessionPatternMemory: {
        patternLabel: "stable_split",
        dominantWorkoutTypes: ["push_day", "pull_day", "lower_body"],
        recentSequence: ["push_day", "pull_day", "lower_body", "push_day", "pull_day", "lower_body"],
        commonTransitions: ["push_day->pull_day", "pull_day->lower_body"],
        structuredPatternConfidence: 0.8
      },
      nextRecoveryAction: undefined,
      coachingNote: "Recent pattern is stable",
      lastUpdated: "2026-03-30T08:00:00.000Z"
    }
  );

  assert.equal(plan.splitStyle, "push_pull_legs");
  assert.match(plan.rationale, /Recent training patterns are shaping the week toward a push pull legs structure\./);
  assert.deepEqual(
    plan.days
      .filter((day) => day.status === "planned")
      .map((day) => day.workoutType),
    ["lower_body", "push_day", "pull_day", "lower_body", "push_day"]
  );
});

test("current week reshapes remaining days after an early missed session", () => {
  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-25",
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
      targetSessionsPerWeek: 4,
      preferredSessionLength: 55,
      trainingStylePreference: "balanced"
    },
    undefined,
    {
      weekStart: "2026-03-16",
      weekEnd: "2026-03-22",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4
    },
    [
      {
        id: "missed_1",
        userId: "user_1",
        date: "2026-03-24",
        recordedAt: "2026-03-24T07:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        status: "missed"
      }
    ]
  );

  const remainingDays = plan.days
    .filter((day) => day.date >= "2026-03-25")
    .map((day) => ({
      date: day.date,
      status: day.status,
      workoutType: day.workoutType,
      progressionIntent: day.progressionIntent,
      plannedDuration: day.plannedDuration
    }));

  assert.deepEqual(remainingDays, [
    {
      date: "2026-03-25",
      status: "rest",
      workoutType: undefined,
      progressionIntent: undefined,
      plannedDuration: undefined
    },
    {
      date: "2026-03-26",
      status: "planned",
      workoutType: "upper_body",
      progressionIntent: "conservative",
      plannedDuration: 50
    },
    {
      date: "2026-03-27",
      status: "planned",
      workoutType: "lower_body",
      progressionIntent: "conservative",
      plannedDuration: 50
    },
    {
      date: "2026-03-28",
      status: "planned",
      workoutType: "upper_body",
      progressionIntent: "conservative",
      plannedDuration: 45
    },
    {
      date: "2026-03-29",
      status: "rest",
      workoutType: undefined,
      progressionIntent: undefined,
      plannedDuration: undefined
    }
  ]);
});

test("weekly review marks a rough week as resetting", () => {
  const review = buildKaiWeeklyReview(
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "off_track",
      plannedCount: 5,
      completedCount: 1,
      missedCount: 3,
      plannedCompletedCount: 1,
      plannedMissedCount: 3,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 20,
      mainCoveragePercent: 0,
      supportCoveragePercent: 0,
      thinSessionCount: 1,
      fullSessionCount: 0
    },
    {
      weekStart: "2026-03-16",
      weekEnd: "2026-03-22",
      weekStatus: "mixed",
      plannedCount: 4,
      completedCount: 2,
      missedCount: 1,
      plannedCompletedCount: 2,
      plannedMissedCount: 1,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 50,
      mainCoveragePercent: 50,
      supportCoveragePercent: 50,
      thinSessionCount: 1,
      fullSessionCount: 0
    }
  );

  assert.deepEqual(review, {
    state: "resetting",
    adaptationAction: "reset_next_week",
    headline: "Next week should reset to something easier to finish.",
    reasons: [
      "Multiple planned workouts were missed.",
      "Less than half of the planned week was completed.",
      "Misses outweighed meaningful completed work."
    ],
    nextWeekFocus:
      "Lower the bar, shrink the week, and make the first workout easy to complete."
  });
});

test("weekly review keeps an early unproven week steady instead of resetting", () => {
  const review = buildKaiWeeklyReview(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "not_started",
      plannedCount: 4,
      completedCount: 0,
      missedCount: 0,
      plannedCompletedCount: 0,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 4,
      planAdherencePercent: 0,
      mainCoveragePercent: 0,
      supportCoveragePercent: 0,
      thinSessionCount: 0,
      fullSessionCount: 0
    },
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4
    }
  );

  assert.deepEqual(review, {
    state: "steady",
    adaptationAction: "hold_next_week",
    headline: "The week is still early and should stay simple.",
    reasons: ["The week has open planned work, but nothing has actually slipped yet."],
    nextWeekFocus: "Get the first planned session done before judging the week."
  });
});

test("weekly review protects a high-adherence week when main work keeps thinning out", () => {
  const review = buildKaiWeeklyReview({
    weekStart: "2026-03-30",
    weekEnd: "2026-04-05",
    weekStatus: "on_track",
    plannedCount: 4,
    completedCount: 4,
    missedCount: 0,
    plannedCompletedCount: 4,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 0,
    planAdherencePercent: 100,
    mainCoveragePercent: 50,
    supportCoveragePercent: 100,
    thinSessionCount: 2,
    fullSessionCount: 0
  });

  assert.deepEqual(review, {
    state: "protecting",
    adaptationAction: "protect_next_week",
    headline: "Next week should stay finishable rather than expand.",
    reasons: [
      "The main work kept thinning out even when sessions were completed.",
      "Too many completed sessions were survival-style instead of full work."
    ],
    nextWeekFocus: "Keep the next week modest and protect consistency before building again."
  });
});

test("weekly review notices when completed sessions drift too far from the original plan", () => {
  const review = buildKaiWeeklyReview({
    weekStart: "2026-03-30",
    weekEnd: "2026-04-05",
    weekStatus: "mixed",
    plannedCount: 4,
    completedCount: 3,
    missedCount: 0,
    plannedCompletedCount: 3,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 1,
    planAdherencePercent: 75,
    mainCoveragePercent: 100,
    supportCoveragePercent: 67,
    thinSessionCount: 0,
    fullSessionCount: 1,
    survivalSessionCount: 0,
    strongSessionCount: 2,
    explicitPlannedFollowThroughCount: 1,
    substitutionCount: 4
  });

  assert.equal(review.state, "protecting");
  assert.match(
    review.reasons.join(" "),
    /Completed sessions needed enough substitutions or changes that the original plan is not holding cleanly\./
  );
  assert.match(
    review.reasons.join(" "),
    /Some completed sessions got done, but not closely enough to the original planned version\./
  );
});

test("weekly review protects when set-level fatigue markers dominate the week", () => {
  const review = buildKaiWeeklyReview({
    weekStart: "2026-03-30",
    weekEnd: "2026-04-05",
    weekStatus: "mixed",
    plannedCount: 4,
    completedCount: 3,
    missedCount: 0,
    plannedCompletedCount: 3,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 1,
    planAdherencePercent: 75,
    mainCoveragePercent: 100,
    supportCoveragePercent: 67,
    thinSessionCount: 0,
    fullSessionCount: 1,
    survivalSessionCount: 0,
    strongSessionCount: 2,
    setFatigueFlagCount: 2,
    restInflationSessionCount: 2,
    repDropoffSessionCount: 2
  });

  assert.equal(review.state, "protecting");
  assert.match(
    review.reasons.join(" "),
    /Set-level fatigue markers are rising before the week is fully breaking down\./
  );
});

test("weekly review protects when readiness keeps toning days down", () => {
  const review = buildKaiWeeklyReview(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    undefined,
    [],
    "2026-04-05",
    [],
    [
      {
        userId: "user_readiness_week",
        asOf: "2026-03-31",
        recordedAt: "2026-03-31T07:00:00.000Z",
        plannedWorkoutType: "upper_body",
        sessionStyle: "modified",
        sessionDecisionStatus: "train_modified",
        readinessScore: 58,
        readinessBand: "moderate",
        dataConfidence: "medium",
        frontendCopy: {
          sessionLabel: "Modified session",
          readinessHeadline: "Train, but keep the overlap under control.",
          primaryAction: "Start with machine row."
        },
        frontendExplanation: {
          planWhy: "Keep the upper-body day, but trim overlap.",
          whyTodayLooksThisWay: ["Back work was still a recovery watch-point."],
          focusAreas: ["Stable pull work"],
          cautionAreas: ["Limit overlap on lats."],
          startingExercises: ["Machine Row"]
        },
        focusMuscles: ["lats"],
        limitMuscles: ["lats"],
        overworkedMuscles: [],
        recoveringMuscles: ["lats"],
        muscleGroupsToAvoidToday: ["lats"],
        primaryExerciseIds: ["chest_supported_machine_row"]
      },
      {
        userId: "user_readiness_week",
        asOf: "2026-04-02",
        recordedAt: "2026-04-02T07:00:00.000Z",
        plannedWorkoutType: "lower_body",
        sessionStyle: "conservative",
        sessionDecisionStatus: "train_light",
        readinessScore: 46,
        readinessBand: "low",
        dataConfidence: "medium",
        frontendCopy: {
          sessionLabel: "Conservative session",
          readinessHeadline: "Keep today light and easy to recover from.",
          primaryAction: "Start with leg extension."
        },
        frontendExplanation: {
          planWhy: "Keep the lower-body day moving with lighter work.",
          whyTodayLooksThisWay: ["Posterior chain fatigue was still hanging around."],
          focusAreas: ["Low-cost leg work"],
          cautionAreas: ["Limit overlap on glutes and hamstrings."],
          startingExercises: ["Leg Extension"]
        },
        focusMuscles: ["quads"],
        limitMuscles: ["glutes", "hamstrings"],
        overworkedMuscles: [],
        recoveringMuscles: ["hamstrings"],
        muscleGroupsToAvoidToday: ["hamstrings"],
        primaryExerciseIds: ["leg_extension"]
      }
    ]
  );

  assert.equal(review.state, "protecting");
  assert.match(review.reasons.join(" "), /2\/2 readiness checks needed the day toned down\./);
});

test("weekly review holds steady when adherence is strong but lift performance is slipping", () => {
  const review = buildKaiWeeklyReview(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    [],
    "2026-04-05",
    [
      {
        exerciseId: "barbell_bench_press",
        name: "Barbell Bench Press",
        appearances: 3,
        lastPerformedAt: "2026-04-04",
        averageSets: 3,
        averageReps: 8,
        commonEffort: "moderate",
        executionQuality: "strong",
        followedPlannedRate: 1,
        followedSuggestedRate: 0,
        averageSubstitutionCount: 0,
        signalSource: "weight_reps",
        latestPerformanceScore: 1440,
        baselinePerformanceScore: 1560,
        performanceDeltaPercent: -7.7,
        progressionVelocity: "slipping",
        latestWasPersonalBest: false,
        personalBestCount: 1
      }
    ],
    [],
    [
      {
        exerciseId: "barbell_bench_press",
        name: "Barbell Bench Press",
        lastPerformedAt: "2026-04-04",
        signalSource: "weight_reps",
        latestPerformanceScore: 1440,
        baselinePerformanceScore: 1560,
        performanceDeltaPercent: -7.7,
        progressionVelocity: "slipping",
        latestWasPersonalBest: false,
        personalBestCount: 1
      }
    ]
  );

  assert.equal(review.state, "steady");
  assert.equal(review.adaptationAction, "hold_next_week");
  assert.match(review.headline, /main lifts should settle before building/i);
  assert.match(review.nextWeekFocus, /Repeat the structure once more/i);
});

test("weekly review names quiet progress when adherence is solid but the week has not fully earned a build", () => {
  const review = buildKaiWeeklyReview(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "mixed",
      plannedCount: 4,
      completedCount: 3,
      missedCount: 1,
      plannedCompletedCount: 3,
      plannedMissedCount: 1,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 75,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 3,
      survivalSessionCount: 0,
      strongSessionCount: 3
    },
    [],
    "2026-04-05",
    [
      {
        exerciseId: "barbell_bench_press",
        name: "Barbell Bench Press",
        appearances: 3,
        lastPerformedAt: "2026-04-04",
        averageSets: 3,
        averageReps: 8,
        commonEffort: "moderate",
        executionQuality: "strong",
        followedPlannedRate: 1,
        followedSuggestedRate: 0,
        averageSubstitutionCount: 0,
        signalSource: "weight_reps",
        latestPerformanceScore: 1560,
        baselinePerformanceScore: 1470,
        performanceDeltaPercent: 6.1,
        progressionVelocity: "rising",
        latestWasPersonalBest: false,
        personalBestCount: 1
      }
    ],
    [],
    [
      {
        exerciseId: "barbell_bench_press",
        name: "Barbell Bench Press",
        lastPerformedAt: "2026-04-04",
        signalSource: "weight_reps",
        latestPerformanceScore: 1560,
        baselinePerformanceScore: 1470,
        performanceDeltaPercent: 6.1,
        progressionVelocity: "rising",
        latestWasPersonalBest: false,
        personalBestCount: 1
      }
    ]
  );

  assert.equal(review.state, "steady");
  assert.equal(review.adaptationAction, "hold_next_week");
  assert.match(review.headline, /still moved forward/i);
  assert.match(review.nextWeekFocus, /small progress keep stacking/i);
});

test("weekly payload surfaces set-level fatigue insight when markers are present", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_set_insight",
    name: "Set Insight",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "set_plan_1",
    userId: "user_set_insight",
    date: "2026-03-30",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "set_workout_1",
    userId: "user_set_insight",
    date: "2026-03-30",
    recordedAt: "2026-03-30T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 41,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 4,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, effort: "moderate", restSeconds: 110, completed: true },
          { reps: 8, effort: "moderate", restSeconds: 125, completed: true },
          { reps: 7, effort: "hard", restSeconds: 145, completed: true },
          { reps: 6, effort: "hard", restSeconds: 160, completed: true }
        ]
      }
    ]
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_set_insight", "2026-03-30");

  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "set_fatigue" &&
        insight.title === "Set-level fatigue markers are rising" &&
        insight.detail.includes("1 sessions with rising effort")
    )
  );
});

test("weekly payload surfaces saved readiness snapshots and readiness insight", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_readiness_payload",
    name: "Readiness Payload",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "user_readiness_payload",
    asOf: "2026-03-31",
    recordedAt: "2026-03-31T07:00:00.000Z",
    plannedWorkoutType: "upper_body",
    sessionStyle: "modified",
    sessionDecisionStatus: "train_modified",
    readinessScore: 61,
    readinessBand: "moderate",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Modified session",
      readinessHeadline: "Train, but keep the overlap under control.",
      primaryAction: "Start with machine row."
    },
    frontendExplanation: {
      planWhy: "Keep the upper-body day, but trim overlap.",
      whyTodayLooksThisWay: ["Back work was still a recovery watch-point."],
      focusAreas: ["Stable pull work"],
      cautionAreas: ["Limit overlap on lats."],
      startingExercises: ["Machine Row"]
    },
    focusMuscles: ["lats"],
    limitMuscles: ["lats"],
    overworkedMuscles: [],
    recoveringMuscles: ["lats"],
    muscleGroupsToAvoidToday: ["lats"],
    primaryExerciseIds: ["chest_supported_machine_row"]
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "user_readiness_payload",
    asOf: "2026-04-02",
    recordedAt: "2026-04-02T07:00:00.000Z",
    plannedWorkoutType: "lower_body",
    sessionStyle: "accessory_only",
    sessionDecisionStatus: "avoid_overlap",
    readinessScore: 43,
    readinessBand: "low",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Accessory-only session",
      readinessHeadline: "Keep the day, but keep it very small.",
      primaryAction: "Use calf raise as an acceptable fallback today."
    },
    frontendExplanation: {
      planWhy: "Keep the day alive with very small work.",
      whatChangedToday: "The original day stayed in place, but it was reduced to small fallback work.",
      whyTodayLooksThisWay: ["Posterior chain fatigue was still the main limiter."],
      focusAreas: ["Low-cost leg accessories"],
      cautionAreas: ["Limit overlap on glutes and hamstrings."],
      startingExercises: ["Calf Raise"]
    },
    focusMuscles: ["calves"],
    limitMuscles: ["glutes", "hamstrings"],
    overworkedMuscles: ["glutes"],
    recoveringMuscles: ["hamstrings"],
    muscleGroupsToAvoidToday: ["glutes", "hamstrings"],
    primaryExerciseIds: ["calf_raise"]
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload(
    "user_readiness_payload",
    "2026-04-03"
  );

  assert.equal(weeklyPayload.weeklyReadinessHistory.length, 2);
  assert.equal(weeklyPayload.weeklyReadinessHistory[0]?.asOf, "2026-03-31");
  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "readiness" &&
        insight.title === "Readiness kept trimming the week" &&
        insight.detail.includes("2/2 readiness checks")
    )
  );
});

test("weekly chapter turns weekly truth into a frontend-ready narrative", () => {
  const chapter = buildKaiWeeklyChapter(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "mixed",
      plannedCount: 4,
      completedCount: 2,
      missedCount: 1,
      plannedCompletedCount: 2,
      plannedMissedCount: 1,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 50,
      mainCoveragePercent: 100,
      supportCoveragePercent: 50,
      thinSessionCount: 1,
      fullSessionCount: 1,
      survivalSessionCount: 1,
      strongSessionCount: 1
    },
    {
      state: "protecting",
      adaptationAction: "protect_next_week",
      headline: "Next week should stay finishable rather than expand.",
      reasons: [
        "At least one planned workout slipped.",
        "2/2 readiness checks needed the day toned down."
      ],
      nextWeekFocus: "Keep the next week modest and protect consistency before building again."
    },
    [
      {
        kind: "readiness",
        title: "Readiness kept trimming the week",
        detail:
          "2/2 readiness checks called for a modified, conservative, or accessory-only day."
      },
      {
        kind: "momentum",
        title: "Weekly state: protecting",
        detail: "Keep the next week modest and protect consistency before building again."
      }
    ],
    [
      {
        userId: "user_1",
        asOf: "2026-03-31",
        recordedAt: "2026-03-31T07:00:00.000Z",
        plannedWorkoutType: "upper_body",
        sessionStyle: "modified",
        sessionDecisionStatus: "train_modified",
        readinessScore: 61,
        readinessBand: "moderate",
        dataConfidence: "medium",
        frontendCopy: {
          sessionLabel: "Modified session",
          readinessHeadline: "Train, but keep the overlap under control.",
          primaryAction: "Start with machine row."
        },
        frontendExplanation: {
          planWhy: "Keep the upper-body day, but trim overlap.",
          whyTodayLooksThisWay: ["Back work was still a recovery watch-point."],
          focusAreas: ["Stable pull work"],
          cautionAreas: ["Limit overlap on lats."],
          startingExercises: ["Machine Row"]
        },
        focusMuscles: ["lats"],
        limitMuscles: ["lats"],
        overworkedMuscles: [],
        recoveringMuscles: ["lats"],
        muscleGroupsToAvoidToday: ["lats"],
        primaryExerciseIds: ["chest_supported_machine_row"]
      },
      {
        userId: "user_1",
        asOf: "2026-04-02",
        recordedAt: "2026-04-02T07:00:00.000Z",
        plannedWorkoutType: "lower_body",
        sessionStyle: "accessory_only",
        sessionDecisionStatus: "avoid_overlap",
        readinessScore: 43,
        readinessBand: "low",
        dataConfidence: "medium",
        frontendCopy: {
          sessionLabel: "Accessory-only session",
          readinessHeadline: "Keep the day, but keep it very small.",
          primaryAction: "Use calf raise as an acceptable fallback today."
        },
        frontendExplanation: {
          planWhy: "Keep the day alive with very small work.",
          whatChangedToday: "The original day stayed in place, but it was reduced to small fallback work.",
          whyTodayLooksThisWay: ["Posterior chain fatigue was still the main limiter."],
          focusAreas: ["Low-cost leg accessories"],
          cautionAreas: ["Limit overlap on glutes and hamstrings."],
          startingExercises: ["Calf Raise"]
        },
        focusMuscles: ["calves"],
        limitMuscles: ["glutes", "hamstrings"],
        overworkedMuscles: ["glutes"],
        recoveringMuscles: ["hamstrings"],
        muscleGroupsToAvoidToday: ["glutes", "hamstrings"],
        primaryExerciseIds: ["calf_raise"]
      }
    ],
    undefined,
    {
      active: true,
      source: "current_week_replan",
      adaptationAction: "protect_next_week",
      appliedAt: "2026-04-02T10:00:00.000Z",
      reason: "Current week was trimmed to stay finishable.",
      affectedPlannedCount: 2
    },
    {
      id: "next_upper",
      userId: "user_1",
      date: "2026-04-04",
      type: "upper_body",
      plannedDuration: 50
    }
  );

  assert.equal(chapter.tone, "protecting");
  assert.equal(chapter.title, "The week needed trimming to stay on track");
  assert.match(chapter.summary, /2\/2 readiness checks still had to tone the day down/i);
  assert.ok(
    chapter.storyBeats.some((beat) =>
      beat.includes("modified, conservative, or accessory-only work")
    )
  );
  assert.ok(
    chapter.storyBeats.some((beat) =>
      beat.includes("The plan was reshaped mid-week")
    )
  );
  assert.ok(
    chapter.frictions.includes("At least one planned workout slipped.")
  );
  assert.match(chapter.nextChapter, /Next up: Upper Body on 2026-04-04\./);
});

test("weekly chapter keeps positive workout-type signals out of frictions", () => {
  const chapter = buildKaiWeeklyChapter(
    {
      weekStart: "2026-04-06",
      weekEnd: "2026-04-12",
      weekStatus: "not_started",
      plannedCount: 0,
      completedCount: 0,
      missedCount: 0,
      plannedCompletedCount: 0,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 0,
      mainCoveragePercent: 0,
      supportCoveragePercent: 0,
      thinSessionCount: 0,
      fullSessionCount: 0,
      survivalSessionCount: 0,
      strongSessionCount: 0,
      explicitPlannedFollowThroughCount: 0,
      suggestedFollowThroughCount: 0,
      substitutionCount: 0,
      setFatigueFlagCount: 0,
      restInflationSessionCount: 0,
      repDropoffSessionCount: 0
    },
    {
      state: "steady",
      adaptationAction: "hold_next_week",
      headline: "The week is still mostly unproven.",
      reasons: ["There is not enough training activity yet to call this week strong or weak."],
      nextWeekFocus: "Keep next week simple and establish one clear completed session early."
    },
    [
      {
        kind: "workout_type",
        title: "Upper push days are holding up well",
        detail:
          "Recent upper push sessions have stayed reliable without misses or survival-style drop-offs."
      },
      {
        kind: "exercise_history",
        title: "Barbell Bench Press is staying in the mix",
        detail: "Barbell Bench Press appeared 7 times recently with workable execution."
      }
    ]
  );

  assert.equal(
    chapter.frictions.some((entry) => entry.includes("upper push sessions have stayed reliable")),
    false
  );
  assert.ok(
    chapter.wins.some(
      (entry) =>
        entry === "Upper push days are holding up well" ||
        entry === "Barbell Bench Press is staying in the mix"
    )
  );
});

test("weekly chapter uses the multi-week arc when the user is rebuilding", () => {
  const chapter = buildKaiWeeklyChapter(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 3,
      completedCount: 2,
      missedCount: 0,
      plannedCompletedCount: 2,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 67,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 2,
      survivalSessionCount: 0,
      strongSessionCount: 2,
      explicitPlannedFollowThroughCount: 2,
      suggestedFollowThroughCount: 0,
      substitutionCount: 0,
      setFatigueFlagCount: 0,
      restInflationSessionCount: 0,
      repDropoffSessionCount: 0
    },
    {
      state: "steady",
      adaptationAction: "hold_next_week",
      headline: "The week landed cleanly and should hold steady.",
      reasons: ["The planned week was completed cleanly."],
      nextWeekFocus: "Repeat a similar week before asking for more."
    },
    [
      {
        kind: "momentum",
        title: "Weekly momentum is climbing back up",
        detail:
          "Recent state sequence: resetting -> protecting -> steady. Keep the structure steady and let progression return gradually."
      }
    ],
    [],
    {
      pattern: "rebuilding",
      headline: "You are climbing back up",
      summary:
        "Recent weeks are moving from rougher territory toward steadier training. Keep building from that calmer base.",
      recentStates: ["resetting", "protecting", "steady"],
      recentChapterTitles: [
        "The week asked for a reset",
        "The week needed protecting",
        "The week found steady ground"
      ]
    }
  );

  assert.equal(chapter.title, "You are climbing back up");
  assert.match(
    chapter.summary,
    /Recent weeks are moving from rougher territory toward steadier training/i
  );
  assert.ok(
    chapter.storyBeats.some((beat) =>
      beat.includes("Keep building from that calmer base")
    )
  );
  assert.match(chapter.nextChapter, /Keep this rebuild moving with one more steady week\./);
});

test("weekly payload includes a weekly chapter for the frontend", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_weekly_chapter",
    name: "Weekly Chapter",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "planned_upper_one",
    userId: "user_weekly_chapter",
    date: "2026-03-31",
    type: "upper_body",
    plannedDuration: 50
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "planned_lower_one",
    userId: "user_weekly_chapter",
    date: "2026-04-02",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "planned_pull_next",
    userId: "user_weekly_chapter",
    date: "2026-04-05",
    type: "pull_day",
    plannedDuration: 45
  });
  repositories.workouts.recordCompletedWorkout({
    id: "completed_upper_one",
    userId: "user_weekly_chapter",
    date: "2026-03-31",
    type: "upper_body",
    plannedDuration: 50,
    completedDuration: 44,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 4, reps: 8, effort: "moderate" }
    ]
  });
  repositories.workouts.recordMissedWorkout({
    id: "missed_lower_one",
    userId: "user_weekly_chapter",
    date: "2026-04-02",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "user_weekly_chapter",
    asOf: "2026-03-31",
    recordedAt: "2026-03-31T07:00:00.000Z",
    plannedWorkoutType: "upper_body",
    sessionStyle: "modified",
    sessionDecisionStatus: "train_modified",
    readinessScore: 58,
    readinessBand: "moderate",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Modified session",
      readinessHeadline: "Train, but trim overlap.",
      primaryAction: "Start with machine row."
    },
    frontendExplanation: {
      planWhy: "Keep the day in place, but make it easier to recover from.",
      whyTodayLooksThisWay: ["Upper fatigue was still hanging around."],
      focusAreas: ["Stable upper work"],
      cautionAreas: ["Limit overlap on chest and front delts."],
      startingExercises: ["Machine Row"]
    },
    focusMuscles: ["lats"],
    limitMuscles: ["chest", "front_delts"],
    overworkedMuscles: [],
    recoveringMuscles: ["chest"],
    muscleGroupsToAvoidToday: ["chest"],
    primaryExerciseIds: ["chest_supported_machine_row"]
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "user_weekly_chapter",
    asOf: "2026-04-02",
    recordedAt: "2026-04-02T07:00:00.000Z",
    plannedWorkoutType: "lower_body",
    sessionStyle: "conservative",
    sessionDecisionStatus: "train_light",
    readinessScore: 49,
    readinessBand: "low",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Conservative session",
      readinessHeadline: "Keep the day lighter.",
      primaryAction: "Use a smaller lower-body anchor."
    },
    frontendExplanation: {
      planWhy: "Keep the day alive, but stop it from becoming a deep fatigue hole.",
      whyTodayLooksThisWay: ["Posterior chain recovery was still lagging."],
      focusAreas: ["Low-cost lower work"],
      cautionAreas: ["Limit overlap on glutes and hamstrings."],
      startingExercises: ["Leg Extension"]
    },
    focusMuscles: ["quads"],
    limitMuscles: ["glutes", "hamstrings"],
    overworkedMuscles: ["glutes"],
    recoveringMuscles: ["hamstrings"],
    muscleGroupsToAvoidToday: ["glutes", "hamstrings"],
    primaryExerciseIds: ["leg_extension"]
  });

  const weeklyPayload = createKaiService({ repositories }).getKaiWeeklyPayload(
    "user_weekly_chapter",
    "2026-04-03"
  );

  assert.equal(weeklyPayload.weeklyChapter.tone, "protecting");
  assert.equal(
    weeklyPayload.weeklyChapter.title,
    "The week needed trimming to stay on track"
  );
  assert.ok(weeklyPayload.weeklyChapter.storyBeats.length >= 2);
  assert.ok(
    weeklyPayload.weeklyChapter.frictions.some((entry) =>
      entry.includes("readiness checks needed the day toned down")
    )
  );
  assert.match(weeklyPayload.weeklyChapter.nextChapter, /Next up: Pull Day on 2026-04-05\./);
});

test("weekly payload saves one chapter history snapshot per week", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_weekly_history",
    name: "Weekly History",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "weekly_history_plan",
    userId: "user_weekly_history",
    date: "2026-04-03",
    type: "upper_body",
    plannedDuration: 50
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "user_weekly_history",
    asOf: "2026-04-03",
    recordedAt: "2026-04-03T07:00:00.000Z",
    plannedWorkoutType: "upper_body",
    sessionStyle: "modified",
    sessionDecisionStatus: "train_modified",
    readinessScore: 57,
    readinessBand: "moderate",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Modified session",
      readinessHeadline: "Train, but trim overlap.",
      primaryAction: "Start with machine row."
    },
    frontendExplanation: {
      planWhy: "Keep the day alive, but make it easier to recover from.",
      whyTodayLooksThisWay: ["Upper fatigue was still hanging around."],
      focusAreas: ["Stable upper work"],
      cautionAreas: ["Limit overlap on chest and front delts."],
      startingExercises: ["Machine Row"]
    },
    focusMuscles: ["lats"],
    limitMuscles: ["chest", "front_delts"],
    overworkedMuscles: [],
    recoveringMuscles: ["chest"],
    muscleGroupsToAvoidToday: ["chest"],
    primaryExerciseIds: ["chest_supported_machine_row"]
  });

  const kaiService = createKaiService({ repositories });
  const firstPayload = kaiService.getKaiWeeklyPayload(
    "user_weekly_history",
    "2026-04-03"
  );
  const firstHistory = repositories.weeklyChapterHistory.getWeeklyChapterHistory(
    "user_weekly_history"
  );

  assert.equal(firstHistory.length, 1);
  assert.equal(firstHistory[0]?.weekStart, firstPayload.weeklySummary.weekStart);
  assert.equal(firstHistory[0]?.chapter.title, firstPayload.weeklyChapter.title);

  const secondPayload = kaiService.getKaiWeeklyPayload(
    "user_weekly_history",
    "2026-04-04"
  );
  const secondHistory = repositories.weeklyChapterHistory.getWeeklyChapterHistory(
    "user_weekly_history"
  );

  assert.equal(secondHistory.length, 1);
  assert.equal(secondHistory[0]?.weekStart, secondPayload.weeklySummary.weekStart);
  assert.equal(secondHistory[0]?.chapter.title, secondPayload.weeklyChapter.title);
});

test("weekly payload includes a multi-week arc from saved chapter history", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_weekly_arc",
    name: "Weekly Arc",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_weekly_arc",
    asOf: "2026-03-21",
    weekStart: "2026-03-16",
    weekEnd: "2026-03-22",
    recordedAt: "2026-03-21T12:00:00.000Z",
    reviewState: "resetting",
    adaptationAction: "reset_next_week",
    chapter: {
      tone: "resetting",
      title: "The week asked for a reset",
      summary: "The week got away from you.",
      storyBeats: [],
      wins: [],
      frictions: ["Misses outweighed meaningful completed work."],
      nextChapter: "Lower the bar and restart."
    },
    insightTitles: ["Weekly state: resetting"],
    readinessEntryCount: 0
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_weekly_arc",
    asOf: "2026-03-28",
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    recordedAt: "2026-03-28T12:00:00.000Z",
    reviewState: "protecting",
    adaptationAction: "protect_next_week",
    chapter: {
      tone: "protecting",
      title: "The week needed protecting",
      summary: "The week stayed fragile.",
      storyBeats: [],
      wins: [],
      frictions: ["Readiness kept trimming the week."],
      nextChapter: "Keep it simpler."
    },
    insightTitles: ["Weekly state: protecting"],
    readinessEntryCount: 2
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "weekly_arc_plan_1",
    userId: "user_weekly_arc",
    date: "2026-04-01",
    type: "upper_body",
    plannedDuration: 50
  });
  repositories.workouts.recordCompletedWorkout({
    id: "weekly_arc_completed_1",
    userId: "user_weekly_arc",
    date: "2026-04-01",
    type: "upper_body",
    plannedDuration: 50,
    completedDuration: 45,
    sessionExercises: [{ exerciseId: "barbell_bench_press", sets: 3, reps: 8 }]
  });

  const weeklyPayload = createKaiService({ repositories }).getKaiWeeklyPayload(
    "user_weekly_arc",
    "2026-04-03"
  );

  assert.equal(weeklyPayload.weeklyArc?.pattern, "rebuilding");
  assert.equal(weeklyPayload.weeklyArc?.headline, "You are climbing back up");
  assert.deepEqual(weeklyPayload.weeklyArc?.recentStates, [
    "resetting",
    "protecting",
    "steady"
  ]);
});

test("weekly review names the fragile workout type when one day pattern keeps slipping", () => {
  const review = buildKaiWeeklyReview(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "mixed",
      plannedCount: 4,
      completedCount: 2,
      missedCount: 2,
      plannedCompletedCount: 2,
      plannedMissedCount: 1,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 50,
      mainCoveragePercent: 100,
      supportCoveragePercent: 50,
      thinSessionCount: 1,
      fullSessionCount: 1,
      survivalSessionCount: 1,
      strongSessionCount: 1
    },
    undefined,
    [
      {
        id: "lower_miss_1",
        userId: "user_1",
        date: "2026-03-27",
        recordedAt: "2026-03-27T19:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        status: "missed"
      },
      {
        id: "lower_miss_2",
        userId: "user_1",
        date: "2026-03-24",
        recordedAt: "2026-03-24T19:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        status: "missed"
      }
    ],
    "2026-04-01"
  );

  assert.ok(
    review.reasons.includes("Lower body sessions are still the main area to protect.")
  );
});

test("weekly review notices when logged day types drift from what was actually trained", () => {
  const review = buildKaiWeeklyReview(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "mixed",
      plannedCount: 4,
      completedCount: 3,
      missedCount: 0,
      plannedCompletedCount: 3,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 75,
      mainCoveragePercent: 100,
      supportCoveragePercent: 67,
      thinSessionCount: 0,
      fullSessionCount: 1,
      survivalSessionCount: 0,
      strongSessionCount: 2
    },
    undefined,
    [
      {
        id: "performed_drift_review_1",
        userId: "user_1",
        date: "2026-03-24",
        recordedAt: "2026-03-24T19:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 45,
        sessionExercises: [{ exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" }],
        outcomeSummary: {
          mainCovered: true,
          supportCovered: false,
          coveredSlots: 1,
          sessionSize: "thin",
          durationCompletionRatio: 0.82,
          executionQuality: "workable",
          performedWorkoutType: "pull_day",
          followedPlannedWorkout: false,
          followedSuggestedWorkoutType: undefined,
          substitutionCount: 0
        },
        status: "completed"
      },
      {
        id: "performed_drift_review_2",
        userId: "user_1",
        date: "2026-03-27",
        recordedAt: "2026-03-27T19:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 44,
        sessionExercises: [{ exerciseId: "chest_supported_machine_row", sets: 4, reps: 10, effort: "moderate" }],
        outcomeSummary: {
          mainCovered: true,
          supportCovered: false,
          coveredSlots: 1,
          sessionSize: "thin",
          durationCompletionRatio: 0.8,
          executionQuality: "workable",
          performedWorkoutType: "pull_day",
          followedPlannedWorkout: false,
          followedSuggestedWorkoutType: undefined,
          substitutionCount: 0
        },
        status: "completed"
      }
    ],
    "2026-04-01"
  );

  assert.match(
    review.reasons.join(" "),
    /Recent sessions logged as upper body have looked more like pull day in practice\./
  );
});

test("weekly service payloads expose review and adaptation context", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55
  });

  repositories.plannedWorkouts.savePlannedWorkout({
    id: "planned_1",
    userId: "user_1",
    date: "2026-03-30",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "planned_2",
    userId: "user_1",
    date: "2026-04-01",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "planned_prev_1",
    userId: "user_1",
    date: "2026-03-23",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "planned_prev_2",
    userId: "user_1",
    date: "2026-03-25",
    type: "lower_body",
    plannedDuration: 55
  });

  repositories.workouts.recordCompletedWorkout({
    id: "workout_prev_1",
    userId: "user_1",
    date: "2026-03-23",
    recordedAt: "2026-03-23T10:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52
  });
  repositories.workouts.recordCompletedWorkout({
    id: "workout_prev_2",
    userId: "user_1",
    date: "2026-03-25",
    recordedAt: "2026-03-25T10:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 50
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_1", "2026-03-31");
  const kaiPayload = kaiService.getKaiPayload("user_1", "2026-03-30");

  assert.deepEqual(weeklyPayload.weeklyReview, {
    state: "steady",
    adaptationAction: "hold_next_week",
    headline: "The week is still early and should stay simple.",
    reasons: [
      "The week has open planned work, but nothing has actually slipped yet."
    ],
    nextWeekFocus: "Get the first planned session done before judging the week."
  });
  assert.deepEqual(
    weeklyPayload.weeklyDecisionLog.map((entry) => entry.kind),
    ["generated", "reviewed"]
  );
  assert.deepEqual(
    weeklyPayload.weeklyInsights.map((insight) => insight.kind),
    ["adherence", "momentum"]
  );

  assert.deepEqual(kaiPayload.weeklyPlanContext, {
    weekStart: "2026-03-30",
    weekEnd: "2026-04-05",
    splitStyle: kaiPayload.weeklyPlanContext?.splitStyle,
    targetSessions: kaiPayload.weeklyPlanContext?.targetSessions,
    plannedCount: 2,
    completedCount: 0,
    remainingPlannedCount: 2,
    todayPlanned: true,
    weeklyReviewState: "steady",
    weeklyAdaptationAction: "hold_next_week",
    currentWeekReplan: {
      active: false,
      affectedPlannedCount: 0
    }
  });
});

test("weekly payload and Kai memory surface dominant suggested-day drift", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_suggestion_drift",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "wednesday", "friday"],
    preferredSessionLength: 55
  });

  for (const [index, date] of ["2026-03-22", "2026-03-25", "2026-03-28"].entries()) {
    repositories.workouts.recordCompletedWorkout({
      id: `suggested_drift_${index + 1}`,
      userId: "user_suggestion_drift",
      date,
      recordedAt: `${date}T18:00:00.000Z`,
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 44,
      sessionExercises: [
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
        { exerciseId: "chest_supported_machine_row", sets: 4, reps: 10, effort: "moderate" }
      ],
      executionFeedback: {
        followedSuggestedWorkoutType: false,
        mainCovered: true,
        supportCovered: false,
        executionQuality: "workable"
      }
    });
  }

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_suggestion_drift", "2026-04-01");
  const kaiPayload = kaiService.getKaiPayload("user_suggestion_drift", "2026-04-01");
  const driftInsight = weeklyPayload.weeklyInsights.find(
    (insight) =>
      insight.kind === "execution_alignment" &&
      /suggested upper body keep drifting into pull day/i.test(insight.title)
  );

  assert.ok(kaiPayload.memory.suggestedWorkoutMemory);
  assert.equal(
    kaiPayload.memory.suggestedWorkoutMemory?.dominantDrift?.suggestedWorkoutType,
    "upper_body"
  );
  assert.equal(
    kaiPayload.memory.suggestedWorkoutMemory?.dominantDrift?.performedWorkoutType,
    "pull_day"
  );
  assert.ok(driftInsight);
});

test("weekly payload exposes execution-quality insights from completed sessions", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_exec",
    name: "Exec User",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "exec_plan_1",
    userId: "user_exec",
    date: "2026-03-30",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "exec_plan_2",
    userId: "user_exec",
    date: "2026-04-01",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "exec_workout_1",
    userId: "user_exec",
    date: "2026-03-30",
    recordedAt: "2026-03-30T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
      { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "chest_supported_machine_row", sets: 3, reps: 12, effort: "moderate" }
    ],
    executionFeedback: {
      followedPlannedWorkout: true
    }
  });
  repositories.workouts.recordCompletedWorkout({
    id: "exec_workout_2",
    userId: "user_exec",
    date: "2026-03-27",
    recordedAt: "2026-03-27T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
      { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" }
    ]
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_exec", "2026-04-01");

  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "execution" &&
        insight.title === "Execution quality was solid" &&
        insight.detail.includes("1 strong sessions")
    )
  );
  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "workout_type" &&
        insight.title === "Upper body days are holding up well"
    )
  );
  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "exercise_history" &&
        insight.title === "Barbell Bench Press is repeating well" &&
        insight.detail.includes("2 times recently")
    )
  );
  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "execution_alignment" &&
        insight.title === "Execution stayed fairly aligned" &&
        insight.detail.includes("1 planned follow-through sessions")
    )
  );
  assert.ok(weeklyPayload.weeklyProgressionHighlights.length > 0);
  assert.deepEqual(weeklyPayload.weeklyPerformanceSignals, []);
  assert.ok(
    weeklyPayload.weeklyExerciseInsights.some(
      (insight) =>
        insight.exerciseId === "barbell_bench_press" &&
        insight.name === "Barbell Bench Press" &&
        insight.action === "repeat" &&
        insight.occurrences >= 1 &&
        insight.reasons.some((reason) => reason.includes("reinforce the day"))
    )
  );
  assert.deepEqual(weeklyPayload.recentExerciseHistory[0], {
    exerciseId: "barbell_bench_press",
    name: "Barbell Bench Press",
    appearances: 2,
    lastPerformedAt: "2026-03-30",
    averageSets: 3,
    averageReps: 8,
    commonEffort: "moderate",
    executionQuality: "strong",
    followedPlannedRate: 0.5,
    followedSuggestedRate: 0,
    averageSubstitutionCount: 0,
    signalSource: "reps_volume",
    latestPerformanceScore: 24,
    baselinePerformanceScore: 24,
    performanceDeltaPercent: 0,
    progressionVelocity: "steady",
    latestWasPersonalBest: false,
    personalBestCount: 1
  });
  assert.equal(
    weeklyPayload.kai.reason,
    "The week still needs simplifying, but the work you did complete was handled well."
  );
});

test("weekly payload surfaces alternating day-by-day session patterns", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_pattern",
    name: "Pattern User",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4
  });
  repositories.workouts.recordCompletedWorkout({
    id: "pattern_workout_1",
    userId: "user_pattern",
    date: "2026-03-25",
    recordedAt: "2026-03-25T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 50,
    completedDuration: 45,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" }
    ]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "pattern_workout_2",
    userId: "user_pattern",
    date: "2026-03-27",
    recordedAt: "2026-03-27T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 50,
    completedDuration: 45,
    sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "pattern_workout_3",
    userId: "user_pattern",
    date: "2026-03-29",
    recordedAt: "2026-03-29T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 50,
    completedDuration: 45,
    sessionExercises: [{ exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "pattern_workout_4",
    userId: "user_pattern",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 50,
    completedDuration: 45,
    sessionExercises: [
      { exerciseId: "romanian_deadlift", sets: 3, reps: 8, effort: "moderate" }
    ]
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_pattern", "2026-04-01");

  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "session_pattern" &&
        insight.title === "An alternating pattern is starting to hold" &&
        insight.detail.includes("upper_body and lower_body")
    )
  );
});

test("weekly payload surfaces fragile workout-type insights when a day type keeps slipping", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_fragile",
    name: "Fragile User",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4
  });
  repositories.workouts.recordMissedWorkout({
    id: "fragile_miss_1",
    userId: "user_fragile",
    date: "2026-03-24",
    recordedAt: "2026-03-24T19:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.workouts.recordMissedWorkout({
    id: "fragile_miss_2",
    userId: "user_fragile",
    date: "2026-03-28",
    recordedAt: "2026-03-28T19:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "fragile_survival_1",
    userId: "user_fragile",
    date: "2026-03-30",
    recordedAt: "2026-03-30T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 26,
    sessionExercises: [
      { exerciseId: "leg_press", sets: 2, reps: 10, effort: "easy" }
    ]
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_fragile", "2026-04-01");

  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "workout_type" &&
        insight.title === "Lower body days need more protection" &&
        insight.detail.includes("2 misses")
    )
  );
});

test("daily Kai context names the fragile workout type when today's plan is in that area", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_daily_fragile",
    name: "Daily Fragile",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_fragile_plan",
    userId: "user_daily_fragile",
    date: "2026-04-01",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.workouts.recordMissedWorkout({
    id: "daily_fragile_miss_1",
    userId: "user_daily_fragile",
    date: "2026-03-27",
    recordedAt: "2026-03-27T19:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55
  });
  repositories.workouts.recordMissedWorkout({
    id: "daily_fragile_miss_2",
    userId: "user_daily_fragile",
    date: "2026-03-24",
    recordedAt: "2026-03-24T19:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55
  });

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_daily_fragile", "2026-04-01");

  assert.equal(kaiPayload.weeklyPlanContext?.fragileWorkoutTypeLabel, "Lower body");
  assert.match(
    kaiPayload.kai.reason,
    /Lower body work has been the least stable part of the week\./
  );
});

test("daily Kai context carries a rebuilding weekly arc into the coaching message", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_daily_arc_rebuild",
    name: "Daily Arc",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3,
    preferredWorkoutDays: ["monday", "wednesday", "friday"],
    preferredSessionLength: 50
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_daily_arc_rebuild",
    asOf: "2026-03-21",
    weekStart: "2026-03-16",
    weekEnd: "2026-03-22",
    recordedAt: "2026-03-21T12:00:00.000Z",
    reviewState: "resetting",
    adaptationAction: "reset_next_week",
    chapter: {
      tone: "resetting",
      title: "The week needed a reset",
      summary: "The week slipped badly.",
      storyBeats: [],
      wins: [],
      frictions: ["Multiple planned workouts were missed."],
      nextChapter: "Shrink the next week."
    },
    insightTitles: ["Weekly state: resetting"],
    readinessEntryCount: 0
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_daily_arc_rebuild",
    asOf: "2026-03-28",
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    recordedAt: "2026-03-28T12:00:00.000Z",
    reviewState: "protecting",
    adaptationAction: "protect_next_week",
    chapter: {
      tone: "protecting",
      title: "The week needed protecting",
      summary: "The week stayed fragile.",
      storyBeats: [],
      wins: [],
      frictions: ["Readiness kept trimming the week."],
      nextChapter: "Keep it simpler."
    },
    insightTitles: ["Weekly state: protecting"],
    readinessEntryCount: 2
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_arc_rebuild_plan",
    userId: "user_daily_arc_rebuild",
    date: "2026-04-01",
    type: "upper_body",
    plannedDuration: 50
  });

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_daily_arc_rebuild", "2026-04-01");

  assert.equal(kaiPayload.weeklyPlanContext?.weeklyArcPattern, "rebuilding");
  assert.equal(kaiPayload.weeklyPlanContext?.weeklyArcHeadline, "You are climbing back up");
  assert.match(kaiPayload.kai.reason, /You are climbing back up\./);
  assert.match(
    kaiPayload.kai.nextStep,
    /That helps the rebuild keep moving in the right direction\./
  );
});

test("daily Kai context names quiet progress when the week is steady but still moving forward", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_daily_quiet_progress",
    name: "Quiet Progress",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 2,
    preferredWorkoutDays: ["tuesday", "friday"],
    preferredSessionLength: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_quiet_progress_plan_1",
    userId: "user_daily_quiet_progress",
    date: "2026-03-31",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_quiet_progress_1",
    userId: "user_daily_quiet_progress",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 3,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 60, effort: "moderate", completed: true },
          { reps: 8, weightKg: 60, effort: "moderate", completed: true },
          { reps: 8, weightKg: 60, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lat_pulldown",
        sets: 3,
        reps: 10,
        effort: "moderate",
        performedSets: [
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lateral_raise",
        sets: 2,
        reps: 15,
        effort: "moderate",
        performedSets: [
          { reps: 15, weightKg: 10, effort: "moderate", completed: true },
          { reps: 15, weightKg: 10, effort: "moderate", completed: true }
        ]
      }
    ]
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_quiet_progress_plan_2",
    userId: "user_daily_quiet_progress",
    date: "2026-04-03",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_quiet_progress_2",
    userId: "user_daily_quiet_progress",
    date: "2026-04-03",
    recordedAt: "2026-04-03T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 3,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 65, effort: "moderate", completed: true },
          { reps: 8, weightKg: 65, effort: "moderate", completed: true },
          { reps: 8, weightKg: 65, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lat_pulldown",
        sets: 3,
        reps: 10,
        effort: "moderate",
        performedSets: [
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lateral_raise",
        sets: 2,
        reps: 15,
        effort: "moderate",
        performedSets: [
          { reps: 15, weightKg: 10, effort: "moderate", completed: true },
          { reps: 15, weightKg: 10, effort: "moderate", completed: true }
        ]
      }
    ]
  });

  const kaiPayload = createKaiService({ repositories }).getKaiPayload(
    "user_daily_quiet_progress",
    "2026-04-05"
  );

  assert.equal(kaiPayload.weeklyPlanContext?.weeklyProgressPattern, "quiet_progress");
  assert.match(
    kaiPayload.weeklyPlanContext?.weeklyProgressHeadline ?? "",
    /still moving in the right direction/i
  );
  assert.match(kaiPayload.kai.nextStep, /quiet progress/i);
});

test("daily Kai context names flattened progress when the week needs one cleaner repeat", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_daily_flattened_progress",
    name: "Flattened Progress",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 2,
    preferredWorkoutDays: ["tuesday", "friday"],
    preferredSessionLength: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_flattened_progress_plan_1",
    userId: "user_daily_flattened_progress",
    date: "2026-03-31",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_flattened_progress_1",
    userId: "user_daily_flattened_progress",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 3,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 65, effort: "moderate", completed: true },
          { reps: 8, weightKg: 65, effort: "moderate", completed: true },
          { reps: 8, weightKg: 65, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lat_pulldown",
        sets: 3,
        reps: 10,
        effort: "moderate",
        performedSets: [
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lateral_raise",
        sets: 2,
        reps: 15,
        effort: "moderate",
        performedSets: [
          { reps: 15, weightKg: 10, effort: "moderate", completed: true },
          { reps: 15, weightKg: 10, effort: "moderate", completed: true }
        ]
      }
    ]
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_flattened_progress_plan_2",
    userId: "user_daily_flattened_progress",
    date: "2026-04-03",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_flattened_progress_2",
    userId: "user_daily_flattened_progress",
    date: "2026-04-03",
    recordedAt: "2026-04-03T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 3,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 60, effort: "moderate", completed: true },
          { reps: 8, weightKg: 60, effort: "moderate", completed: true },
          { reps: 8, weightKg: 60, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lat_pulldown",
        sets: 3,
        reps: 10,
        effort: "moderate",
        performedSets: [
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true },
          { reps: 10, weightKg: 55, effort: "moderate", completed: true }
        ]
      },
      {
        exerciseId: "lateral_raise",
        sets: 2,
        reps: 15,
        effort: "moderate",
        performedSets: [
          { reps: 15, weightKg: 10, effort: "moderate", completed: true },
          { reps: 15, weightKg: 10, effort: "moderate", completed: true }
        ]
      }
    ]
  });

  const kaiPayload = createKaiService({ repositories }).getKaiPayload(
    "user_daily_flattened_progress",
    "2026-04-05"
  );

  assert.equal(kaiPayload.weeklyPlanContext?.weeklyProgressPattern, "flattened_progress");
  assert.match(
    kaiPayload.weeklyPlanContext?.weeklyProgressHeadline ?? "",
    /cleaner repeat before it builds again/i
  );
  assert.match(kaiPayload.kai.nextStep, /cleaner repeat/i);
});

test("daily Kai context names an alternating day-by-day pattern when it is stable enough", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_daily_pattern",
    name: "Daily Pattern",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_pattern_plan",
    userId: "user_daily_pattern",
    date: "2026-04-01",
    type: "upper_body",
    plannedDuration: 55
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_pattern_workout_1",
    userId: "user_daily_pattern",
    date: "2026-03-25",
    recordedAt: "2026-03-25T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_pattern_workout_2",
    userId: "user_daily_pattern",
    date: "2026-03-27",
    recordedAt: "2026-03-27T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_pattern_workout_3",
    userId: "user_daily_pattern",
    date: "2026-03-29",
    recordedAt: "2026-03-29T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "daily_pattern_workout_4",
    userId: "user_daily_pattern",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "romanian_deadlift", sets: 3, reps: 8, effort: "moderate" }]
  });

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_daily_pattern", "2026-04-01");

  assert.match(
    kaiPayload.kai.reason,
    /Your recent training has been alternating between upper_body and lower_body\./
  );
});

test("daily Kai payload suggests a natural workout type when no day is formally planned", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_suggested_day",
    name: "Suggested Day",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55,
    trainingStylePreference: "balanced"
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_day_1",
    userId: "user_suggested_day",
    date: "2026-03-25",
    recordedAt: "2026-03-25T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_day_2",
    userId: "user_suggested_day",
    date: "2026-03-27",
    recordedAt: "2026-03-27T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_day_3",
    userId: "user_suggested_day",
    date: "2026-03-29",
    recordedAt: "2026-03-29T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_day_4",
    userId: "user_suggested_day",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "romanian_deadlift", sets: 3, reps: 8, effort: "moderate" }]
  });

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_suggested_day", "2026-04-01");

  assert.equal(kaiPayload.plannedWorkoutForDay, undefined);
  assert.equal(kaiPayload.weeklyPlanContext?.todayPlanned, false);
  assert.equal(kaiPayload.weeklyPlanContext?.suggestedWorkoutTypeLabel, "Upper body");
  assert.match(
    kaiPayload.kai.reason,
    /Your recent training has been alternating between upper_body and lower_body\./
  );

  const readiness = buildTrainingReadinessReport(
    "user_suggested_day",
    repositories.workouts.getWorkouts("user_suggested_day"),
    "2026-04-01",
    "upper_body",
    "intermediate",
    kaiPayload.memory.recommendationMemory,
    {
      goal: "build_muscle"
    },
    {
      isPlannedDay: true,
      progressionIntent: "repeat",
      exerciseIntent: {
        focusMuscles: ["chest", "lats", "upper_back"],
        avoidMuscles: [],
        preferredExerciseIds: []
      },
      sessionTemplate: {
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            label: "Primary upper-body movement",
            targetEffects: ["horizontal_press", "vertical_pull", "horizontal_row"],
            candidateExerciseIds: ["barbell_bench_press", "lat_pulldown"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "hypertrophy_bias",
              effort: "working"
            },
            progressionCue: {
              action: "repeat",
              reason: "Keep this close to the last successful version and reinforce the pattern."
            }
          }
        ]
      }
    }
  );

  assert.equal(readiness.plannedWorkoutType, "upper_body");
  assert.ok(readiness.sessionPlan.blocks[0].exampleExerciseIds.length > 0);
});

test("suggested upper-body day leans into the mix the user actually performs lately", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_suggested_day_shape",
    name: "Suggested Day Shape",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55,
    trainingStylePreference: "balanced"
  });

  for (const [index, date] of ["2026-03-25", "2026-03-29"].entries()) {
    repositories.workouts.recordCompletedWorkout({
      id: `suggested_day_shape_upper_${index + 1}`,
      userId: "user_suggested_day_shape",
      date,
      recordedAt: `${date}T09:00:00.000Z`,
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 50,
      sessionExercises: [
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
        {
          exerciseId: "chest_supported_machine_row",
          sets: 4,
          reps: 10,
          effort: "moderate"
        },
        { exerciseId: "rear_delt_fly", sets: 3, reps: 15, effort: "moderate" }
      ]
    });
  }

  repositories.workouts.recordCompletedWorkout({
    id: "suggested_day_shape_lower_1",
    userId: "user_suggested_day_shape",
    date: "2026-03-27",
    recordedAt: "2026-03-27T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_day_shape_lower_2",
    userId: "user_suggested_day_shape",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [{ exerciseId: "romanian_deadlift", sets: 3, reps: 8, effort: "moderate" }]
  });

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_suggested_day_shape", "2026-04-01");
  const profile = repositories.profiles.getProfile("user_suggested_day_shape");
  const suggestedPlanDay = buildSuggestedPlanDay(
    "2026-04-01",
    "upper_body",
    profile,
    kaiPayload.memory,
    repositories.workouts.getWorkouts("user_suggested_day_shape")
  );
  const trainingReadiness = buildTrainingReadinessReport(
    "user_suggested_day_shape",
    repositories.workouts.getWorkouts("user_suggested_day_shape"),
    "2026-04-01",
    "upper_body",
    "intermediate",
    kaiPayload.memory.recommendationMemory,
    {
      goal: "build_muscle"
    },
    {
      isPlannedDay: true,
      isSuggestedDay: true,
      suggestedDayBias: "pull_bias",
      workoutType: suggestedPlanDay.workoutType,
      progressionIntent: suggestedPlanDay.progressionIntent,
      exerciseIntent: suggestedPlanDay.exerciseIntent,
      sessionTemplate: suggestedPlanDay.sessionTemplate
    }
  );
  const frontendResponse = buildFrontendTrainingReadinessResponse(
    "user_suggested_day_shape",
    "2026-04-01",
    trainingReadiness,
    kaiPayload.weeklyPlanContext
  );

  assert.equal(kaiPayload.weeklyPlanContext?.suggestedWorkoutTypeLabel, "Upper body");
  assert.match(
    kaiPayload.weeklyPlanContext?.suggestedWorkoutTemplateNote ?? "",
    /leans into the pull work/i
  );
  assert.match(suggestedPlanDay.rationale, /leans into the pull work/i);
  assert.match(frontendResponse.frontendExplanation.weekContext ?? "", /leans into the pull work/i);
  assert.equal(
    suggestedPlanDay.sessionTemplate?.slots[0]?.label,
    "Primary pull-biased movement"
  );
  assert.ok(
    suggestedPlanDay.sessionTemplate?.slots[0]?.candidateExerciseIds.includes("lat_pulldown")
  );
  assert.ok(
    suggestedPlanDay.sessionTemplate?.slots[0]?.candidateExerciseIds.includes(
      "chest_supported_machine_row"
    )
  );
  assert.ok(
    !suggestedPlanDay.sessionTemplate?.slots[0]?.candidateExerciseIds.includes(
      "barbell_bench_press"
    )
  );
  assert.ok(
    suggestedPlanDay.sessionTemplate?.slots[1]?.candidateExerciseIds.includes(
      "barbell_bench_press"
    )
  );
  assert.deepEqual(
    [...(trainingReadiness.sessionPlan.blocks[0]?.exampleExerciseIds.slice(0, 2) ?? [])].sort(),
    ["chest_supported_machine_row", "lat_pulldown"]
  );
  assert.deepEqual(
    [...frontendResponse.saferAlternatives.slice(0, 2).map((entry) => entry.exerciseId)].sort(),
    ["chest_supported_machine_row", "lat_pulldown"]
  );
  assert.ok(
    frontendResponse.saferAlternatives
      .slice(0, 4)
      .map((entry) => entry.exerciseId)
      .includes("assisted_pull_up_machine")
  );
});

test("generic upper-body days keep one push and one pull anchor when history is thin", () => {
  const readiness = buildTrainingReadinessReport(
    "user_upper_balanced",
    [],
    "2026-03-30",
    "upper_body"
  );
  const mainBlock = readiness.sessionPlan.blocks.find((block) => block.slot === "main");
  const mainExerciseIds = mainBlock?.exampleExerciseIds ?? [];

  assert.equal(mainExerciseIds.includes("barbell_bench_press"), true);
  assert.equal(
    mainExerciseIds.some((exerciseId) => ["lat_pulldown", "pull_up"].includes(exerciseId)),
    true
  );
  assert.equal(readiness.readinessModel.dataConfidence, "low");
  assert.equal(readiness.sessionDecision.status, "train_as_planned");
});

test("dev scenario seeds a pull-biased suggested upper-body day you can inspect through the server", () => {
  const repositories = createJsonRepositories();
  const seeded = seedScenario({
    userId: "user_suggested_upper_pull_bias",
    scenario: "suggested_upper_pull_bias",
    repositories
  });
  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_suggested_upper_pull_bias", seeded.asOf);
  const suggestedPlanDay = buildSuggestedPlanDay(
    seeded.asOf,
    "upper_body",
    repositories.profiles.getProfile("user_suggested_upper_pull_bias"),
    kaiPayload.memory,
    repositories.workouts.getWorkouts("user_suggested_upper_pull_bias")
  );
  const frontendResponse = buildFrontendTrainingReadinessResponse(
    "user_suggested_upper_pull_bias",
    seeded.asOf,
    buildTrainingReadinessReport(
      "user_suggested_upper_pull_bias",
      repositories.workouts.getWorkouts("user_suggested_upper_pull_bias"),
      seeded.asOf,
      "upper_body",
      "intermediate",
      kaiPayload.memory.recommendationMemory,
      {
        goal: "build_muscle"
      },
      {
        isPlannedDay: true,
        isSuggestedDay: true,
        suggestedDayBias: "pull_bias",
        workoutType: "upper_body",
        progressionIntent: "repeat",
        exerciseIntent: suggestedPlanDay.exerciseIntent,
        sessionTemplate: suggestedPlanDay.sessionTemplate
      }
    ),
    kaiPayload.weeklyPlanContext
  );

  assert.equal(seeded.asOf, "2026-04-01");
  assert.equal(kaiPayload.weeklyPlanContext?.todayPlanned, false);
  assert.equal(kaiPayload.weeklyPlanContext?.suggestedWorkoutTypeLabel, "Upper body");
  assert.match(
    kaiPayload.weeklyPlanContext?.suggestedWorkoutTemplateNote ?? "",
    /leans into the pull work/i
  );
  assert.ok(
    !suggestedPlanDay.sessionTemplate?.slots[0]?.candidateExerciseIds.includes(
      "barbell_bench_press"
    )
  );
  assert.deepEqual(
    [...frontendResponse.saferAlternatives.slice(0, 2).map((entry) => entry.exerciseId)].sort(),
    ["chest_supported_machine_row", "lat_pulldown"]
  );
});

test("today-readiness resolver preserves suggested-day bias for the live server path", () => {
  const repositories = createJsonRepositories();
  const seeded = seedScenario({
    userId: "user_suggested_upper_pull_bias_server",
    scenario: "suggested_upper_pull_bias",
    repositories
  });
  const kaiService = createKaiService({ repositories });
  const profile = repositories.profiles.getProfile(
    "user_suggested_upper_pull_bias_server"
  );
  const kaiPayload = kaiService.getKaiPayload(
    "user_suggested_upper_pull_bias_server",
    seeded.asOf,
    profile
  );
  const weeklyPlan = kaiService.getKaiWeeklyPlan(
    "user_suggested_upper_pull_bias_server",
    seeded.asOf,
    profile
  );
  const resolution = resolveTodayReadinessResolution({
    asOf: seeded.asOf,
    weeklyPlan,
    profile,
    memory: kaiPayload.memory,
    workouts: repositories.workouts.getWorkouts("user_suggested_upper_pull_bias_server")
  });
  const trainingReadiness = buildTrainingReadinessReport(
    "user_suggested_upper_pull_bias_server",
    repositories.workouts.getWorkouts("user_suggested_upper_pull_bias_server"),
    seeded.asOf,
    resolution.effectiveWorkoutType,
    profile.experienceLevel,
    kaiPayload.memory.recommendationMemory,
    {
      goal: profile.goal,
      equipmentAccess: profile.equipmentAccess,
      focusMuscles: profile.focusMuscles,
      favoriteExerciseIds: profile.favoriteExerciseIds,
      dislikedExerciseIds: profile.dislikedExerciseIds,
      painFlags: profile.painFlags,
      plannedFocusMuscles: resolution.effectivePlanDay?.exerciseIntent?.focusMuscles,
      plannedAvoidMuscles: resolution.effectivePlanDay?.exerciseIntent?.avoidMuscles,
      plannedPreferredExerciseIds:
        resolution.effectivePlanDay?.exerciseIntent?.preferredExerciseIds
    },
    resolution.plannedDayContext
  );

  assert.equal(resolution.plannedDayContext?.isSuggestedDay, true);
  assert.equal(resolution.plannedDayContext?.dayOrigin, "suggested");
  assert.equal(resolution.plannedDayContext?.originReasonLabel, "recent_pattern");
  assert.equal(resolution.plannedDayContext?.originBias, "pull_bias");
  assert.equal(resolution.plannedDayContext?.suggestedDayBias, "pull_bias");
  assert.ok(
    !resolution.effectivePlanDay?.sessionTemplate?.slots[0]?.candidateExerciseIds.includes(
      "barbell_bench_press"
    )
  );
  assert.deepEqual(
    [...(trainingReadiness.sessionPlan.blocks[0]?.exampleExerciseIds.slice(0, 2) ?? [])].sort(),
    ["chest_supported_machine_row", "lat_pulldown"]
  );

  const frontendResponse = buildFrontendTrainingReadinessResponse(
    "user_suggested_upper_pull_bias_server",
    seeded.asOf,
    trainingReadiness,
    undefined,
    resolution.plannedDayContext
  );
  assert.equal(frontendResponse.decisionAudit.dayOrigin, "suggested");
  assert.equal(frontendResponse.decisionAudit.originReasonLabel, "recent_pattern");
  assert.equal(frontendResponse.decisionAudit.originBias, "pull_bias");
  assert.deepEqual(frontendResponse.decisionAudit.selectedSubstitutes[0]?.provenance, {
    selectionSource: "template_primary",
    templateFitApplied: true,
    recoveryPenaltyApplied: true,
    equipmentConstraintApplied: false,
    painConstraintApplied: false,
    memoryNudgeApplied: false
  });
  assert.deepEqual(
    frontendResponse.decisionAudit.deprioritizedExercises.find(
      (entry) => entry.exerciseId === "leg_curl"
    )?.provenance,
    {
      selectionSource: "generic_fallback",
      templateFitApplied: false,
      recoveryPenaltyApplied: true,
      equipmentConstraintApplied: false,
      painConstraintApplied: false,
      memoryNudgeApplied: false
    }
  );
  assert.match(
    frontendResponse.decisionAudit.debugExplanation?.dayProvenance ?? "",
    /suggested day \| reason recent pattern \| bias pull bias/i
  );
  assert.equal(frontendResponse.decisionAudit.debugExplanation?.confidenceContext, undefined);
  assert.equal(
    /low_repeatable_defaults/i.test(frontendResponse.decisionAudit.kaiExplanation),
    false
  );
});

test("shared raw training-readiness builder stays aligned for raw routes and seeded snapshots", () => {
  const repositories = createJsonRepositories();
  const seeded = seedScenario({
    userId: "user_suggested_upper_pull_bias_raw",
    scenario: "suggested_upper_pull_bias",
    repositories
  });
  const kaiService = createKaiService({ repositories });
  const profile = repositories.profiles.getProfile(
    "user_suggested_upper_pull_bias_raw"
  );
  const weeklyPlan = kaiService.getKaiWeeklyPlan(
    "user_suggested_upper_pull_bias_raw",
    seeded.asOf,
    profile
  );
  const rawTrainingReadiness = buildResolvedTrainingReadinessReport({
    repositories,
    userId: "user_suggested_upper_pull_bias_raw",
    asOf: seeded.asOf,
    profile,
    weeklyPlan,
    memory: repositories.memory.getMemory("user_suggested_upper_pull_bias_raw")
  });

  assert.equal(rawTrainingReadiness.plannedWorkoutType, "upper_body");
  assert.deepEqual(
    [...(rawTrainingReadiness.sessionPlan.blocks[0]?.exampleExerciseIds ?? [])].sort(),
    ["assisted_pull_up_machine", "chest_supported_machine_row", "lat_pulldown"]
  );
  assert.deepEqual(
    rawTrainingReadiness.sessionPlan.blocks[1]?.exampleExerciseIds,
    [
      "barbell_bench_press",
      "incline_dumbbell_press",
      "overhead_shoulder_press"
    ]
  );
});

test("dev scenario seeds a thin-history pain-limited upper day for live inspection", () => {
  const repositories = createJsonRepositories();
  const seeded = seedScenario({
    userId: "user_thin_history_pain_upper",
    scenario: "thin_history_pain_limited_upper",
    repositories
  });
  const profile = repositories.profiles.getProfile("user_thin_history_pain_upper");
  const plannedWorkout = repositories.plannedWorkouts.findPlannedWorkout(
    "user_thin_history_pain_upper",
    seeded.asOf
  );
  const trainingReadiness = buildTrainingReadinessReport(
    "user_thin_history_pain_upper",
    repositories.workouts.getWorkouts("user_thin_history_pain_upper"),
    seeded.asOf,
    plannedWorkout?.type,
    profile.experienceLevel,
    undefined,
    {
      goal: profile.goal,
      equipmentAccess: profile.equipmentAccess,
      focusMuscles: profile.focusMuscles,
      favoriteExerciseIds: profile.favoriteExerciseIds,
      dislikedExerciseIds: profile.dislikedExerciseIds,
      painFlags: profile.painFlags
    },
    {
      dayOrigin: "planned",
      isPlannedDay: true,
      workoutType: plannedWorkout?.type
    }
  );
  const frontendResponse = buildFrontendTrainingReadinessResponse(
    "user_thin_history_pain_upper",
    seeded.asOf,
    trainingReadiness,
    undefined,
    {
      dayOrigin: "planned",
      isPlannedDay: true,
      workoutType: plannedWorkout?.type
    }
  );

  assert.equal(seeded.asOf, "2026-03-30");
  assert.equal(plannedWorkout?.type, "upper_body");
  assert.deepEqual(profile.painFlags, ["front_delts"]);
  assert.equal(trainingReadiness.plannedWorkoutType, "upper_body");
  assert.notEqual(trainingReadiness.recommendedExercises[0]?.exerciseId, "rear_delt_fly");
  assert.equal(
    trainingReadiness.recommendedExercises.slice(0, 4).some((entry) =>
      ["assisted_pull_up_machine", "lat_pulldown", "seated_cable_row"].includes(entry.exerciseId)
    ),
    true
  );
  assert.equal(frontendResponse.decisionAudit.dayOrigin, "planned");
  assert.match(
    frontendResponse.decisionAudit.selectedSubstitutes[0]?.why.join(" ") ?? "",
    /sensible repeatable default while history is still thin/i
  );
});

test("dev scenario seeds a thin-history equipment-limited upper day for live inspection", () => {
  const repositories = createJsonRepositories();
  const seeded = seedScenario({
    userId: "user_thin_history_equipment_upper",
    scenario: "thin_history_equipment_limited_upper",
    repositories
  });
  const profile = repositories.profiles.getProfile("user_thin_history_equipment_upper");
  const plannedWorkout = repositories.plannedWorkouts.findPlannedWorkout(
    "user_thin_history_equipment_upper",
    seeded.asOf
  );
  const trainingReadiness = buildTrainingReadinessReport(
    "user_thin_history_equipment_upper",
    repositories.workouts.getWorkouts("user_thin_history_equipment_upper"),
    seeded.asOf,
    plannedWorkout?.type,
    profile.experienceLevel,
    undefined,
    {
      goal: profile.goal,
      equipmentAccess: profile.equipmentAccess,
      focusMuscles: profile.focusMuscles,
      favoriteExerciseIds: profile.favoriteExerciseIds,
      dislikedExerciseIds: profile.dislikedExerciseIds,
      painFlags: profile.painFlags
    },
    {
      dayOrigin: "planned",
      isPlannedDay: true,
      workoutType: plannedWorkout?.type
    }
  );
  const frontendResponse = buildFrontendTrainingReadinessResponse(
    "user_thin_history_equipment_upper",
    seeded.asOf,
    trainingReadiness,
    undefined,
    {
      dayOrigin: "planned",
      isPlannedDay: true,
      workoutType: plannedWorkout?.type
    }
  );

  assert.equal(seeded.asOf, "2026-03-30");
  assert.equal(plannedWorkout?.type, "upper_body");
  assert.equal(profile.equipmentAccess, "bodyweight_only");
  assert.equal(trainingReadiness.recommendedExercises[0]?.exerciseId, "pull_up");
  assert.equal(
    trainingReadiness.avoidExercises.some(
      (entry) =>
        entry.exerciseId === "barbell_bench_press" &&
        entry.reasons.some((reason) => reason.startsWith("Equipment mismatch:"))
    ),
    true
  );
  assert.equal(frontendResponse.decisionAudit.dayOrigin, "planned");
  assert.match(frontendResponse.decisionAudit.userExplanation, /equipment limits/i);
  assert.match(
    frontendResponse.decisionAudit.selectedSubstitutes[0]?.why.join(" ") ?? "",
    /sensible repeatable default while history is still thin/i
  );
});

test("suggested-day bias ignores missed and future workouts when inferring pull bias", () => {
  const suggestedBias = summarizeSuggestedDayTemplateBias("upper_body", "2026-04-01", [
    {
      id: "completed_pull_1",
      userId: "user_bias_filter",
      date: "2026-03-25",
      recordedAt: "2026-03-25T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 50,
      status: "completed",
      sessionExercises: [
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
        { exerciseId: "chest_supported_machine_row", sets: 4, reps: 10, effort: "moderate" }
      ]
    },
    {
      id: "completed_pull_2",
      userId: "user_bias_filter",
      date: "2026-03-29",
      recordedAt: "2026-03-29T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 50,
      status: "completed",
      sessionExercises: [
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
        { exerciseId: "rear_delt_fly", sets: 3, reps: 15, effort: "moderate" }
      ]
    },
    {
      id: "future_push",
      userId: "user_bias_filter",
      date: "2026-04-03",
      recordedAt: "2026-04-03T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 50,
      status: "completed",
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 4, reps: 6, effort: "moderate" }
      ]
    },
    {
      id: "missed_push",
      userId: "user_bias_filter",
      date: "2026-03-30",
      recordedAt: "2026-03-30T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      status: "missed"
    }
  ]);

  assert.equal(suggestedBias?.pattern, "pull_bias");
});

test("daily Kai reason explains dominant suggested-day drift for looser no-plan users", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_suggested_drift_day",
    name: "Suggested Drift",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "wednesday", "friday"],
    preferredSessionLength: 55,
    trainingStylePreference: "balanced"
  });

  for (const [index, date] of ["2026-03-24", "2026-03-27", "2026-03-30"].entries()) {
    repositories.workouts.recordCompletedWorkout({
      id: `suggested_drift_day_${index + 1}`,
      userId: "user_suggested_drift_day",
      date,
      recordedAt: `${date}T09:00:00.000Z`,
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 45,
      sessionExercises: [
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
        { exerciseId: "chest_supported_machine_row", sets: 4, reps: 10, effort: "moderate" }
      ],
      executionFeedback: {
        followedSuggestedWorkoutType: false,
        mainCovered: true,
        supportCovered: false,
        executionQuality: "workable"
      }
    });
  }

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_suggested_drift_day", "2026-04-01");

  assert.equal(kaiPayload.plannedWorkoutForDay, undefined);
  assert.match(
    kaiPayload.kai.reason,
    /Recent suggested upper body sessions have often turned into pull day work instead\./
  );
});

test("daily Kai reset guidance calms an oscillating weekly arc", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_daily_arc_reset",
    name: "Arc Reset",
    goal: "build_consistency",
    experienceLevel: "beginner",
    targetSessionsPerWeek: 3,
    preferredWorkoutDays: ["monday", "wednesday", "friday"],
    preferredSessionLength: 45
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_daily_arc_reset",
    asOf: "2026-03-14",
    weekStart: "2026-03-09",
    weekEnd: "2026-03-15",
    recordedAt: "2026-03-14T12:00:00.000Z",
    reviewState: "steady",
    adaptationAction: "hold_next_week",
    chapter: {
      tone: "steady",
      title: "The week stayed simple",
      summary: "The week held together.",
      storyBeats: [],
      wins: ["A simple week got done."],
      frictions: [],
      nextChapter: "Repeat the same shape."
    },
    insightTitles: ["Weekly state: steady"],
    readinessEntryCount: 0
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_daily_arc_reset",
    asOf: "2026-03-21",
    weekStart: "2026-03-16",
    weekEnd: "2026-03-22",
    recordedAt: "2026-03-21T12:00:00.000Z",
    reviewState: "protecting",
    adaptationAction: "protect_next_week",
    chapter: {
      tone: "protecting",
      title: "The week needed protecting",
      summary: "The week got trimmed down.",
      storyBeats: [],
      wins: [],
      frictions: ["Readiness kept trimming the week."],
      nextChapter: "Keep it lighter."
    },
    insightTitles: ["Weekly state: protecting"],
    readinessEntryCount: 2
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_daily_arc_reset",
    asOf: "2026-03-28",
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    recordedAt: "2026-03-28T12:00:00.000Z",
    reviewState: "steady",
    adaptationAction: "hold_next_week",
    chapter: {
      tone: "steady",
      title: "The week found steady ground",
      summary: "The week steadied again.",
      storyBeats: [],
      wins: ["One clean week landed."],
      frictions: [],
      nextChapter: "Keep it steady."
    },
    insightTitles: ["Weekly state: steady"],
    readinessEntryCount: 0
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_arc_reset_plan_1",
    userId: "user_daily_arc_reset",
    date: "2026-03-31",
    type: "full_body",
    plannedDuration: 45
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "daily_arc_reset_plan_2",
    userId: "user_daily_arc_reset",
    date: "2026-04-02",
    type: "full_body",
    plannedDuration: 45
  });
  repositories.workouts.recordMissedWorkout({
    id: "daily_arc_reset_miss_1",
    userId: "user_daily_arc_reset",
    date: "2026-03-31",
    recordedAt: "2026-03-31T18:00:00.000Z",
    type: "full_body",
    plannedDuration: 45
  });
  repositories.workouts.recordMissedWorkout({
    id: "daily_arc_reset_miss_2",
    userId: "user_daily_arc_reset",
    date: "2026-04-02",
    recordedAt: "2026-04-02T18:00:00.000Z",
    type: "full_body",
    plannedDuration: 45
  });

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_daily_arc_reset", "2026-04-03");

  assert.equal(kaiPayload.weeklyPlanContext?.weeklyArcPattern, "oscillating");
  assert.match(kaiPayload.kai.reason, /The last few weeks have been up and down\./);
  assert.match(
    kaiPayload.kai.nextStep,
    /Keep this simple enough that the pattern stops swinging around\./
  );
});

test("fallback workout suggestion prefers the recent performed workout type for repeat day-by-day users", () => {
  const repositories = createJsonRepositories();

  for (const [index, date] of ["2026-03-24", "2026-03-27", "2026-03-30"].entries()) {
    repositories.workouts.recordCompletedWorkout({
      id: `performed_repeat_${index + 1}`,
      userId: "user_performed_repeat",
      date,
      recordedAt: `${date}T09:00:00.000Z`,
      type: "upper_body",
      plannedDuration: 50,
      completedDuration: 44,
      sessionExercises: [
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" },
        { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" }
      ],
      executionFeedback: {
        followedPlannedWorkout: false,
        mainCovered: true,
        supportCovered: true,
        executionQuality: "workable"
      }
    });
  }

  const workouts = repositories.workouts.getWorkouts("user_performed_repeat");
  const memory = {
    sessionPatternMemory: {
      patternLabel: "repeat_day_by_day" as const,
      dominantWorkoutTypes: ["upper_body"],
      recentSequence: ["upper_body", "upper_body", "upper_body"],
      commonTransitions: ["upper_body->upper_body"],
      structuredPatternConfidence: 0.7
    }
  };

  assert.equal(
    suggestFallbackWorkoutType(memory as never, workouts, "2026-04-02"),
    "pull_day"
  );
});

test("fallback workout suggestion can follow dominant suggested-day drift when explicit follow-through is weak", () => {
  const memory = {
    sessionPatternMemory: {
      patternLabel: "repeat_day_by_day" as const,
      dominantWorkoutTypes: ["upper_body"],
      recentSequence: ["upper_body", "upper_body", "upper_body"],
      commonTransitions: ["upper_body->upper_body"],
      structuredPatternConfidence: 0.7
    },
    suggestedWorkoutMemory: {
      overallFollowThroughRate: 0.2,
      dominantDrift: {
        suggestedWorkoutType: "upper_body",
        performedWorkoutType: "pull_day",
        occurrences: 3,
        followThroughRate: 0.2
      }
    }
  };

  assert.equal(
    suggestFallbackWorkoutType(memory as never, [], "2026-04-02"),
    "pull_day"
  );
});

test("fallback workout suggestion favors the day type that has been landing better lately", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_suggested_quality_day",
    name: "Suggested Quality",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "thursday", "friday"],
    preferredSessionLength: 55,
    trainingStylePreference: "balanced"
  });

  repositories.workouts.recordCompletedWorkout({
    id: "suggested_quality_day_1",
    userId: "user_suggested_quality_day",
    date: "2026-03-22",
    recordedAt: "2026-03-22T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 32,
    sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }],
    executionFeedback: {
      mainCovered: true,
      supportCovered: false,
      executionQuality: "survival"
    }
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_quality_day_2",
    userId: "user_suggested_quality_day",
    date: "2026-03-24",
    recordedAt: "2026-03-24T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
      { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "lateral_raise", sets: 2, reps: 15, effort: "moderate" }
    ],
    executionFeedback: {
      mainCovered: true,
      supportCovered: true,
      executionQuality: "strong"
    }
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_quality_day_3",
    userId: "user_suggested_quality_day",
    date: "2026-03-27",
    recordedAt: "2026-03-27T09:00:00.000Z",
    type: "lower_body",
    plannedDuration: 55,
    completedDuration: 34,
    sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }],
    executionFeedback: {
      mainCovered: true,
      supportCovered: false,
      executionQuality: "survival"
    }
  });
  repositories.workouts.recordCompletedWorkout({
    id: "suggested_quality_day_4",
    userId: "user_suggested_quality_day",
    date: "2026-03-30",
    recordedAt: "2026-03-30T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
      { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "lateral_raise", sets: 2, reps: 15, effort: "moderate" }
    ],
    executionFeedback: {
      mainCovered: true,
      supportCovered: true,
      executionQuality: "strong"
    }
  });

  const kaiService = createKaiService({ repositories });
  const kaiPayload = kaiService.getKaiPayload("user_suggested_quality_day", "2026-04-01");

  assert.equal(
    suggestFallbackWorkoutType(
      kaiPayload.memory,
      repositories.workouts.getWorkouts("user_suggested_quality_day"),
      "2026-04-01",
      repositories.profiles.getProfile("user_suggested_quality_day")
    ),
    "upper_body"
  );
  assert.equal(kaiPayload.weeklyPlanContext?.suggestedWorkoutTypeLabel, "Upper body");
  assert.equal(kaiPayload.weeklyPlanContext?.suggestedWorkoutReasonLabel, "recent_handling");
});

test("current week replanning persists calmer remaining workouts with metadata", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55,
    trainingStylePreference: "balanced"
  });
  repositories.plannedWorkouts.replacePlannedWorkoutsInRange(
    "user_1",
    "2026-03-24",
    "2026-03-29",
    [
      {
        id: "planned_a",
        userId: "user_1",
        date: "2026-03-24",
        type: "upper_body",
        plannedDuration: 55
      },
      {
        id: "planned_b",
        userId: "user_1",
        date: "2026-03-26",
        type: "upper_body",
        plannedDuration: 55
      },
      {
        id: "planned_c",
        userId: "user_1",
        date: "2026-03-27",
        type: "lower_body",
        plannedDuration: 55
      }
    ]
  );
  repositories.workouts.recordMissedWorkout({
    id: "missed_1",
    userId: "user_1",
    date: "2026-03-24",
    recordedAt: "2026-03-24T07:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55
  });

  const kaiService = createKaiService({ repositories });
  const replanned = kaiService.persistCurrentWeekReplan("user_1", "2026-03-25");

  assert.deepEqual(
    replanned.plannedWorkouts
      .filter((workout) => workout.date >= "2026-03-25")
      .map((workout) => ({
        date: workout.date,
        type: workout.type,
        plannedDuration: workout.plannedDuration,
        replan: workout.replan
          ? {
              source: workout.replan.source,
              adaptationAction: workout.replan.adaptationAction,
              reason: workout.replan.reason
            }
          : undefined
      })),
    [
      {
        date: "2026-03-28",
        type: "upper_body",
        plannedDuration: 45,
        replan: {
          source: "current_week_replan",
          adaptationAction: "protect_next_week",
          reason: "Next week should stay finishable rather than expand."
        }
      },
      {
        date: "2026-03-27",
        type: "lower_body",
        plannedDuration: 35,
        replan: {
          source: "current_week_replan",
          adaptationAction: "protect_next_week",
          reason: "Next week should stay finishable rather than expand."
        }
      },
      {
        date: "2026-03-26",
        type: "upper_body",
        plannedDuration: 35,
        replan: {
          source: "current_week_replan",
          adaptationAction: "protect_next_week",
          reason: "Next week should stay finishable rather than expand."
        }
      }
    ]
  );
});

test("persisted current-week replans appear in weekly payloads and Kai context", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
    preferredSessionLength: 55,
    trainingStylePreference: "balanced"
  });
  repositories.plannedWorkouts.replacePlannedWorkoutsInRange(
    "user_1",
    "2026-03-24",
    "2026-03-29",
    [
      {
        id: "planned_a",
        userId: "user_1",
        date: "2026-03-24",
        type: "upper_body",
        plannedDuration: 55
      },
      {
        id: "planned_b",
        userId: "user_1",
        date: "2026-03-26",
        type: "upper_body",
        plannedDuration: 55
      }
    ]
  );
  repositories.workouts.recordMissedWorkout({
    id: "missed_1",
    userId: "user_1",
    date: "2026-03-24",
    recordedAt: "2026-03-24T07:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55
  });

  const kaiService = createKaiService({ repositories });
  kaiService.persistCurrentWeekReplan("user_1", "2026-03-25");
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_1", "2026-03-25");
  const kaiPayload = kaiService.getKaiPayload("user_1", "2026-03-26");

  assert.deepEqual(weeklyPayload.currentWeekReplan, {
    active: true,
    source: "current_week_replan",
    adaptationAction: "protect_next_week",
    appliedAt: weeklyPayload.currentWeekReplan?.appliedAt,
    reason: "Next week should stay finishable rather than expand.",
    affectedPlannedCount: 3
  });
  assert.deepEqual(
    weeklyPayload.weeklyDecisionLog.map((entry) => entry.kind),
    ["generated", "reviewed", "replanned"]
  );

  assert.deepEqual(kaiPayload.weeklyPlanContext?.currentWeekReplan, {
    active: true,
    source: "current_week_replan",
    adaptationAction: "protect_next_week",
    appliedAt: kaiPayload.weeklyPlanContext?.currentWeekReplan?.appliedAt,
    reason: "Next week should stay finishable rather than expand.",
    affectedPlannedCount: 3
  });

  assert.match(
    kaiPayload.kai.text,
    /This week was already reshaped after earlier friction\./
  );
});

test("strained comparable outcomes cool future build intent for the same workout type", () => {
  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
      targetSessionsPerWeek: 4,
      preferredSessionLength: 55,
      trainingStylePreference: "balanced"
    },
    undefined,
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4
    },
    [
      {
        id: "strained_upper",
        userId: "user_1",
        date: "2026-03-28",
        recordedAt: "2026-03-28T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 28,
        status: "completed",
        sessionExercises: [
          { exerciseId: "barbell_bench_press", sets: 2, reps: 8, effort: "easy" }
        ],
        outcomeSummary: {
          mainCovered: true,
          supportCovered: false,
          coveredSlots: 1,
          sessionSize: "thin",
          durationCompletionRatio: 0.51,
          executionQuality: "survival"
        }
      }
    ]
  );

  const upperDays = plan.days.filter(
    (day) => day.status === "planned" && day.workoutType === "upper_body"
  );

  assert.deepEqual(
    upperDays.map((day) => ({
      date: day.date,
      progressionIntent: day.progressionIntent
    })),
    [
      {
        date: "2026-03-30",
        progressionIntent: "repeat"
      },
      {
        date: "2026-04-02",
        progressionIntent: "conservative"
      }
    ]
  );
});

test("fragile workout-type reliability cools future build intent for that day type", () => {
  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
      targetSessionsPerWeek: 4,
      preferredSessionLength: 55,
      trainingStylePreference: "balanced"
    },
    undefined,
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      strongSessionCount: 4,
      survivalSessionCount: 0
    },
    [
      {
        id: "missed_lower_1",
        userId: "user_1",
        date: "2026-03-27",
        recordedAt: "2026-03-27T19:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        status: "missed"
      },
      {
        id: "missed_lower_2",
        userId: "user_1",
        date: "2026-03-20",
        recordedAt: "2026-03-20T19:00:00.000Z",
        type: "lower_body",
        plannedDuration: 55,
        status: "missed"
      },
      {
        id: "strong_upper_1",
        userId: "user_1",
        date: "2026-03-26",
        recordedAt: "2026-03-26T19:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 54,
        status: "completed",
        sessionExercises: [
          { exerciseId: "barbell_bench_press", sets: 4, reps: 6, effort: "hard" },
          { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "hard" },
          { exerciseId: "lateral_raise", sets: 3, reps: 15, effort: "moderate" }
        ],
        outcomeSummary: {
          mainCovered: true,
          supportCovered: true,
          coveredSlots: 3,
          sessionSize: "full",
          durationCompletionRatio: 0.98,
          executionQuality: "strong"
        }
      }
    ]
  );

  const upperDays = plan.days.filter(
    (day) => day.status === "planned" && day.workoutType === "upper_body"
  );
  const lowerDays = plan.days.filter(
    (day) => day.status === "planned" && day.workoutType === "lower_body"
  );

  assert.deepEqual(
    upperDays.map((day) => day.progressionIntent),
    ["repeat", "build"]
  );
  assert.deepEqual(
    lowerDays.map((day) => day.progressionIntent),
    ["conservative", "conservative"]
  );
});

test("training readiness respects conservative day intent", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    undefined,
    {
      isPlannedDay: true,
      progressionIntent: "conservative"
    }
  );

  assert.deepEqual(report.sessionDecision, {
    status: "train_as_planned",
    summary: "Train, but keep it lighter than usual.",
    sessionMode: "upper_body_conservative",
    volumeAdjustment: "reduce_10_percent",
    intensityAdjustment: "keep_submaximal",
    progressionIntent: "conservative",
    notes: [
      "Today is meant to be a lighter session inside the week.",
      "No major recovery flags are standing out today."
    ]
  });
  assert.equal(report.sessionPlan.sessionStyle, "conservative");
  assert.equal(report.sessionPlan.objective, "Run the upper-body day, but keep it easy to repeat.");
  assert.equal(
    report.sessionPlan.coachNote,
    "Keep the structure simple and leave a little energy in the tank."
  );
});

test("weekly plan uses richer onboarding preferences", () => {
  const plan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 5,
    preferredSessionLength: 55,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday", "saturday"],
    trainingStylePreference: "split_routine",
    confidenceLevel: "low",
    focusMuscles: ["chest", "lats"]
  });

  assert.deepEqual(
    {
      targetSessions: plan.targetSessions,
      splitStyle: plan.splitStyle,
      workoutDays: plan.days
        .filter((day) => day.status === "planned")
        .map((day) => ({
          dayName: day.dayName,
          plannedDuration: day.plannedDuration,
          progressionIntent: day.progressionIntent,
          workoutType: day.workoutType
        }))
    },
    {
      targetSessions: 4,
      splitStyle: "upper_lower",
      workoutDays: [
        {
          dayName: "Monday",
          plannedDuration: 50,
          progressionIntent: "repeat",
          workoutType: "upper_body"
        },
        {
          dayName: "Tuesday",
          plannedDuration: 50,
          progressionIntent: "conservative",
          workoutType: "lower_body"
        },
        {
          dayName: "Thursday",
          plannedDuration: 50,
          progressionIntent: "conservative",
          workoutType: "upper_body"
        },
        {
          dayName: "Friday",
          plannedDuration: 50,
          progressionIntent: "conservative",
          workoutType: "lower_body"
        }
      ]
    }
  );
});

test("low-confidence onboarding avoids build-heavy progression", () => {
  const plan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 5,
    preferredSessionLength: 55,
    preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday", "saturday"],
    trainingStylePreference: "split_routine",
    confidenceLevel: "low"
  });

  assert.equal(plan.targetSessions, 4);
  assert.ok(
    plan.days
      .filter((day) => day.status === "planned")
      .every((day) => day.progressionIntent !== "build")
  );
});

test("weekly plan sequence responds to favorites and pain flags", () => {
  const plan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 6,
    preferredSessionLength: 55,
    trainingStylePreference: "split_routine",
    confidenceLevel: "high",
    favoriteExerciseIds: ["lat_pulldown", "chest_supported_machine_row"],
    dislikedExerciseIds: ["barbell_bench_press"],
    painFlags: ["front_delts"],
    focusMuscles: ["lats", "upper_back"]
  });

  assert.deepEqual(
    {
      splitStyle: plan.splitStyle,
      workoutDays: plan.days
        .filter((day) => day.status === "planned")
        .map((day) => ({
          workoutType: day.workoutType,
          progressionIntent: day.progressionIntent
        }))
    },
    {
      splitStyle: "hybrid_upper_lower",
      workoutDays: [
        {
          workoutType: "pull_day",
          progressionIntent: "repeat"
        },
        {
          workoutType: "lower_body",
          progressionIntent: "repeat"
        },
        {
          workoutType: "upper_body",
          progressionIntent: "conservative"
        },
        {
          workoutType: "lower_body",
          progressionIntent: "repeat"
        },
        {
          workoutType: "full_body",
          progressionIntent: "repeat"
        },
        {
          workoutType: "pull_day",
          progressionIntent: "repeat"
        }
      ]
    }
  );
});

test("weekly plan avoids hard-constrained workout types", () => {
  const plan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    trainingStylePreference: "split_routine",
    hardConstraints: [
      {
        kind: "avoid_workout_type",
        value: "lower_body",
        source: "injury",
        note: "Keep lower-body days out for now."
      }
    ]
  });

  assert.equal(
    plan.days.some(
      (day) => day.status === "planned" && day.workoutType === "lower_body"
    ),
    false
  );
});

test("pain-limited upper days stay out of build intent on an on-track week", () => {
  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 4,
      preferredSessionLength: 55,
      preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
      trainingStylePreference: "balanced",
      painFlags: ["front_delts"]
    },
    undefined,
    {
      weekStart: "2026-03-23",
      weekEnd: "2026-03-29",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4
    }
  );

  const upperDays = plan.days.filter(
    (day) => day.status === "planned" && day.workoutType === "upper_body"
  );

  assert.ok(upperDays.length > 0);
  assert.ok(upperDays.every((day) => day.progressionIntent !== "build"));
});

test("weekly plan carries day-level exercise intent", () => {
  const plan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 5,
    preferredSessionLength: 55,
    trainingStylePreference: "split_routine",
    confidenceLevel: "building",
    focusMuscles: ["chest", "lats"],
    favoriteExerciseIds: ["barbell_bench_press", "lat_pulldown"],
    painFlags: ["front_delts"]
  });

  assert.deepEqual(
    plan.days
      .filter((day) => day.status === "planned")
      .slice(0, 3)
      .map((day) => ({
        workoutType: day.workoutType,
        exerciseIntent: day.exerciseIntent
      })),
    [
      {
        workoutType: "pull_day",
        exerciseIntent: {
          focusMuscles: ["lats", "upper_back", "biceps"],
          avoidMuscles: [],
          preferredExerciseIds: ["lat_pulldown"]
        }
      },
      {
        workoutType: "lower_body",
        exerciseIntent: {
          focusMuscles: ["quads", "glutes", "hamstrings"],
          avoidMuscles: [],
          preferredExerciseIds: []
        }
      },
      {
        workoutType: "upper_body",
        exerciseIntent: {
          focusMuscles: ["chest", "lats", "upper_back"],
          avoidMuscles: ["front_delts"],
          preferredExerciseIds: ["barbell_bench_press", "lat_pulldown"]
        }
      }
    ]
  );
});

test("weekly plan carries day-level session templates", () => {
  const plan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 5,
    preferredSessionLength: 55,
    trainingStylePreference: "split_routine",
    confidenceLevel: "building",
    focusMuscles: ["chest", "lats"],
    favoriteExerciseIds: ["barbell_bench_press", "lat_pulldown"],
    painFlags: ["front_delts"]
  });

  assert.deepEqual(
    plan.days
      .filter((day) => day.status === "planned")
      .slice(0, 2)
      .map((day) => ({
        workoutType: day.workoutType,
        sessionStyle: day.sessionTemplate?.sessionStyle,
        slots: day.sessionTemplate?.slots.map((slot) => ({
          slot: slot.slot,
          targetEffects: slot.targetEffects,
          candidateExerciseIds: slot.candidateExerciseIds,
          prescriptionIntent: slot.prescriptionIntent,
          progressionCue: slot.progressionCue
        }))
      })),
    [
      {
        workoutType: "pull_day",
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            targetEffects: ["vertical_pull", "horizontal_row"],
            candidateExerciseIds: ["lat_pulldown", "assisted_pull_up_machine", "pull_up"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "strength_bias",
              effort: "working"
            },
            progressionCue: {
              action: "repeat",
              reason: "Keep this slot steady and look for a clean repeat."
            }
          },
          {
            slot: "secondary",
            targetEffects: ["horizontal_row", "neutral_grip_curl", "biceps_isolation"],
            candidateExerciseIds: [
              "lat_pulldown",
              "chest_supported_machine_row",
              "single_arm_cable_row"
            ],
            prescriptionIntent: {
              sets: "moderate",
              reps: "hypertrophy_bias",
              effort: "working"
            },
            progressionCue: {
              action: "repeat",
              reason: "Use this slot to reinforce the day, not to force progression."
            }
          },
          {
            slot: "accessory",
            targetEffects: ["rear_delt_isolation", "trap_isolation"],
            candidateExerciseIds: ["lat_pulldown", "rear_delt_fly"],
            prescriptionIntent: {
              sets: "low",
              reps: "pump_bias",
              effort: "submaximal"
            },
            progressionCue: {
              action: "repeat",
              reason: "Use this slot to reinforce the day, not to force progression."
            }
          }
        ]
      },
      {
        workoutType: "lower_body",
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            targetEffects: ["squat_pattern", "quad_bias", "hinge_heavy"],
            candidateExerciseIds: ["leg_press", "squat", "barbell_back_squat"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "strength_bias",
              effort: "working"
            },
            progressionCue: {
              action: "repeat",
              reason: "Keep this slot steady and look for a clean repeat."
            }
          },
          {
            slot: "secondary",
            targetEffects: ["hamstring_isolation", "glute_bias", "calf_isolation"],
            candidateExerciseIds: ["leg_curl", "lying_leg_curl", "seated_leg_curl"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "hypertrophy_bias",
              effort: "working"
            },
            progressionCue: {
              action: "repeat",
              reason: "Use this slot to reinforce the day, not to force progression."
            }
          },
          {
            slot: "accessory",
            targetEffects: ["calf_isolation", "quad_bias"],
            candidateExerciseIds: ["calf_raise", "leg_press", "squat"],
            prescriptionIntent: {
              sets: "low",
              reps: "pump_bias",
              effort: "submaximal"
            },
            progressionCue: {
              action: "repeat",
              reason: "Use this slot to reinforce the day, not to force progression."
            }
          }
        ]
      }
    ]
  );
});

test("progression intent changes weekly session template depth", () => {
  const conservativePlan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_consistency",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredSessionLength: 50,
    trainingStylePreference: "balanced",
    confidenceLevel: "low",
    focusMuscles: ["lats"]
  });

  const buildPlan = buildWeeklyPlan("user_1", "2026-03-30", {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 6,
    preferredSessionLength: 55,
    trainingStylePreference: "split_routine",
    confidenceLevel: "high",
    favoriteExerciseIds: ["barbell_bench_press", "incline_dumbbell_press"]
  }, undefined, {
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    weekStatus: "on_track",
    plannedCount: 5,
    completedCount: 5,
    missedCount: 0,
    plannedCompletedCount: 5,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 0,
    planAdherencePercent: 100,
    mainCoveragePercent: 100,
    supportCoveragePercent: 100,
    thinSessionCount: 0,
    fullSessionCount: 5
  });

  const conservativeDay = conservativePlan.days.find(
    (day) => day.status === "planned" && day.progressionIntent === "conservative"
  );
  const buildDay = buildPlan.days.find(
    (day) => day.status === "planned" && day.progressionIntent === "build"
  );

  assert.deepEqual(
    {
      conservativeSessionStyle: conservativeDay?.sessionTemplate?.sessionStyle,
      conservativeSlotCount: conservativeDay?.sessionTemplate?.slots.length,
      buildSessionStyle: buildDay?.sessionTemplate?.sessionStyle,
      buildMainCandidateCount: buildDay?.sessionTemplate?.slots[0]?.candidateExerciseIds.length
    },
    {
      conservativeSessionStyle: "conservative",
      conservativeSlotCount: 2,
      buildSessionStyle: "build",
      buildMainCandidateCount: 4
    }
  );
  assert.deepEqual(conservativeDay?.sessionTemplate?.slots[0]?.prescriptionIntent, {
    sets: "low",
    reps: "hypertrophy_bias",
    effort: "submaximal"
  });
  assert.deepEqual(conservativeDay?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "hold_back",
    reason: "Keep this main lift comfortable today and leave a little in the tank."
  });
  assert.deepEqual(buildDay?.sessionTemplate?.slots[0]?.prescriptionIntent, {
    sets: "high",
    reps: "strength_bias",
    effort: "push"
  });
  assert.deepEqual(buildDay?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "progress",
    reason: "This slot is the best place to progress if the day feels good."
  });
});

test("weekly coaching message can explain performed-work drift when the week needs protecting", () => {
  const message = buildKaiWeeklyCoachingMessage(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "mixed",
      plannedCount: 4,
      completedCount: 2,
      missedCount: 1,
      plannedCompletedCount: 2,
      plannedMissedCount: 1,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 50,
      mainCoveragePercent: 100,
      supportCoveragePercent: 67,
      thinSessionCount: 0,
      fullSessionCount: 1,
      survivalSessionCount: 0,
      strongSessionCount: 2
    },
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate"
    },
    undefined,
    {
      state: "protecting",
      adaptationAction: "protect_next_week",
      headline: "Next week should stay finishable rather than expand.",
      reasons: [],
      nextWeekFocus: "Keep the next week modest and protect consistency before building again."
    },
    [
      {
        kind: "workout_type",
        title: "Logged day types and performed work are drifting apart",
        detail:
          "Recent sessions logged as upper body have looked more like pull day from the exercises that were actually performed."
      }
    ]
  );

  assert.match(
    message.reason,
    /Recent sessions logged as upper body have looked more like pull day/
  );
});

test("weekly coaching message can use trajectory guidance when progression cues are not present", () => {
  const message = buildKaiWeeklyCoachingMessage(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "mixed",
      plannedCount: 3,
      completedCount: 2,
      missedCount: 1,
      plannedCompletedCount: 2,
      plannedMissedCount: 1,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 67,
      mainCoveragePercent: 100,
      supportCoveragePercent: 67,
      thinSessionCount: 0,
      fullSessionCount: 1,
      survivalSessionCount: 0,
      strongSessionCount: 1
    },
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate"
    },
    undefined,
    {
      state: "protecting",
      adaptationAction: "protect_next_week",
      headline: "Next week should stay finishable rather than expand.",
      reasons: [],
      nextWeekFocus: "Keep the next week modest and protect consistency before building again."
    },
    [
      {
        kind: "momentum",
        title: "Weekly momentum is oscillating instead of stabilizing",
        detail:
          "Recent states are bouncing (resetting -> protecting -> steady -> protecting). Hold one simpler structure for 1-2 weeks before asking for more."
      }
    ]
  );

  assert.match(message.reason, /Recent states are bouncing/);
  assert.match(message.nextStep ?? "", /Hold one simpler structure/i);
});

test("weekly insights surface guarded progression when a main lift is repeating because of set-level strain", () => {
  const insights = buildKaiWeeklyInsights(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    undefined,
    [],
    "2026-03-30",
    [],
    undefined,
    undefined,
    [],
    [
      {
        date: "2026-04-01",
        workoutType: "upper_body",
        slot: "main",
        label: "Primary upper slot",
        action: "repeat",
        reason: "Recent comparable work showed rising set-level strain, so repeat cleanly before progressing."
      }
    ]
  );

  assert.ok(
    insights.some(
      (insight) =>
        insight.kind === "progression" &&
        insight.title === "The week can still move forward, but one lift should repeat cleanly first" &&
        insight.detail.includes("Primary upper slot is staying at repeat")
    )
  );
});

test("weekly insights flag when guarded progression outweighs progress cues", () => {
  const insights = buildKaiWeeklyInsights(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 5,
      completedCount: 5,
      missedCount: 0,
      plannedCompletedCount: 5,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 5,
      survivalSessionCount: 0,
      strongSessionCount: 5
    },
    undefined,
    [],
    "2026-03-30",
    [],
    undefined,
    undefined,
    [],
    [
      {
        date: "2026-03-31",
        workoutType: "upper_body",
        slot: "main",
        label: "Primary upper slot",
        action: "repeat",
        reason: "Recent comparable work showed rising set-level strain, so repeat cleanly before progressing."
      },
      {
        date: "2026-04-02",
        workoutType: "upper_body",
        slot: "secondary",
        label: "Upper support slot",
        action: "hold_back",
        reason: "Set-level strain has been rising, so keep this slot easier to recover from."
      },
      {
        date: "2026-04-03",
        workoutType: "lower_body",
        slot: "main",
        label: "Primary lower slot",
        action: "repeat",
        reason: "Recent comparable work showed rising set-level strain, so repeat cleanly before progressing."
      },
      {
        date: "2026-04-04",
        workoutType: "lower_body",
        slot: "accessory",
        label: "Lower accessory slot",
        action: "hold_back",
        reason: "Set-level strain has been rising, so keep this slot easier to recover from."
      },
      {
        date: "2026-04-05",
        workoutType: "pull_day",
        slot: "main",
        label: "Primary pull slot",
        action: "progress",
        reason: "This lift has repeated strongly enough to earn progression."
      }
    ]
  );

  assert.ok(
    insights.some(
      (insight) =>
        insight.kind === "progression" &&
        insight.title === "Guardrails are outweighing progression this week" &&
        insight.detail.includes("4 guarded progression cues vs 1 progress cues")
    )
  );
});

test("weekly payload tracks progression velocity and a real PR from weighted set history", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_pr",
    name: "PR User",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 3
  });

  repositories.workouts.recordCompletedWorkout({
    id: "pr_workout_1",
    userId: "user_pr",
    date: "2026-03-24",
    recordedAt: "2026-03-24T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 3,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 60, effort: "moderate", completed: true },
          { reps: 8, weightKg: 60, effort: "moderate", completed: true },
          { reps: 8, weightKg: 60, effort: "moderate", completed: true }
        ]
      }
    ]
  });

  repositories.workouts.recordCompletedWorkout({
    id: "pr_workout_2",
    userId: "user_pr",
    date: "2026-03-28",
    recordedAt: "2026-03-28T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 3,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 62.5, effort: "moderate", completed: true },
          { reps: 8, weightKg: 62.5, effort: "moderate", completed: true },
          { reps: 8, weightKg: 62.5, effort: "moderate", completed: true }
        ]
      }
    ]
  });

  repositories.workouts.recordCompletedWorkout({
    id: "pr_workout_3",
    userId: "user_pr",
    date: "2026-03-31",
    recordedAt: "2026-03-31T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 3,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, weightKg: 65, effort: "moderate", completed: true },
          { reps: 8, weightKg: 65, effort: "moderate", completed: true },
          { reps: 8, weightKg: 65, effort: "moderate", completed: true }
        ]
      }
    ]
  });

  const weeklyPayload = createKaiService({ repositories }).getKaiWeeklyPayload(
    "user_pr",
    "2026-03-31"
  );

  assert.deepEqual(weeklyPayload.weeklyPerformanceSignals, [
    {
      exerciseId: "barbell_bench_press",
      name: "Barbell Bench Press",
      lastPerformedAt: "2026-03-31",
      signalSource: "weight_reps",
      latestPerformanceScore: 1560,
      baselinePerformanceScore: 1470,
      performanceDeltaPercent: 6.1,
      progressionVelocity: "rising",
      latestWasPersonalBest: true,
      personalBestCount: 3
    }
  ]);

  assert.equal(weeklyPayload.recentExerciseHistory[0]?.signalSource, "weight_reps");
  assert.equal(weeklyPayload.recentExerciseHistory[0]?.latestWasPersonalBest, true);
  assert.equal(weeklyPayload.recentExerciseHistory[0]?.progressionVelocity, "rising");
  assert.equal(weeklyPayload.recentExerciseHistory[0]?.performanceDeltaPercent, 6.1);
  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "progression" &&
        insight.title === "A real PR landed this week" &&
        insight.detail.includes("Barbell Bench Press hit a new best this week")
    )
  );
  assert.ok(
    weeklyPayload.weeklyChapter.wins.some((entry) =>
      entry.includes("A real PR landed this week")
    )
  );
});

test("weekly chapter frames steady upward weeks as quiet progress", () => {
  const chapter = buildKaiWeeklyChapter(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    {
      state: "steady",
      adaptationAction: "hold_next_week",
      headline: "The week stayed steady and still moved forward.",
      reasons: ["At least one recurring lift is moving up cleanly instead of just repeating."],
      nextWeekFocus: "Repeat the structure once more and let the small progress keep stacking."
    },
    [
      {
        kind: "progression",
        title: "Quiet progress still happened this week",
        detail:
          "Barbell Bench Press is tracking 6.1% above its recent baseline, even without needing a bigger weekly jump."
      }
    ]
  );

  assert.match(chapter.title, /quiet, but still moved forward/i);
  assert.match(chapter.summary, /still moved in the right direction/i);
  assert.ok(
    chapter.wins.some((entry) => entry.includes("Quiet progress still happened this week"))
  );
});

test("weekly chapter calls out when a steady week flattened instead of moving forward", () => {
  const chapter = buildKaiWeeklyChapter(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    {
      state: "steady",
      adaptationAction: "hold_next_week",
      headline: "The week stayed finishable, but the main lifts should settle before building.",
      reasons: ["Lift performance dipped enough that the week should protect clean repeats before it builds."],
      nextWeekFocus: "Repeat the structure once more and let the key lifts look cleaner before you ask for more."
    },
    [
      {
        kind: "progression",
        title: "Barbell Bench Press needs a steadier repeat",
        detail:
          "Barbell Bench Press came in 7.7% below its recent baseline, so it should repeat cleanly before it asks for more."
      }
    ]
  );

  assert.match(chapter.title, /progress flattened out/i);
  assert.match(chapter.summary, /did not really move forward/i);
  assert.ok(
    chapter.frictions.some((entry) => entry.includes("below its recent baseline"))
  );
});

test("weekly insights surface trajectory when recent weekly states are climbing back up", () => {
  const insights = buildKaiWeeklyInsights(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 3,
      missedCount: 0,
      plannedCompletedCount: 3,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 1,
      planAdherencePercent: 75,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 3,
      survivalSessionCount: 0,
      strongSessionCount: 3
    },
    {
      state: "steady",
      adaptationAction: "hold_next_week",
      headline: "The week landed cleanly and should hold steady.",
      reasons: ["The planned week was completed cleanly."],
      nextWeekFocus: "Repeat a similar week before asking for more."
    },
    [],
    "2026-04-05",
    [],
    undefined,
    undefined,
    [],
    [],
    [
      {
        weekStart: "2026-02-23",
        state: "resetting",
        plannedCount: 3,
        completedCount: 1,
        missedCount: 2
      },
      {
        weekStart: "2026-03-02",
        state: "protecting",
        plannedCount: 3,
        completedCount: 2,
        missedCount: 1
      },
      {
        weekStart: "2026-03-09",
        state: "steady",
        plannedCount: 3,
        completedCount: 3,
        missedCount: 0
      },
      {
        weekStart: "2026-03-16",
        state: "steady",
        plannedCount: 3,
        completedCount: 3,
        missedCount: 0
      }
    ]
  );

  assert.ok(
    insights.some(
      (insight) =>
        insight.kind === "momentum" &&
        insight.title === "Weekly momentum is climbing back up" &&
        insight.detail.includes("resetting -> protecting -> steady -> steady")
    )
  );
});

test("weekly arc detects when recent weeks are climbing back up", () => {
  const arc = buildKaiWeeklyArc(
    [
      {
        userId: "user_arc",
        asOf: "2026-03-07",
        weekStart: "2026-03-02",
        weekEnd: "2026-03-08",
        recordedAt: "2026-03-07T12:00:00.000Z",
        reviewState: "resetting",
        adaptationAction: "reset_next_week",
        chapter: {
          tone: "resetting",
          title: "The week asked for a reset",
          summary: "The week got away from you.",
          storyBeats: [],
          wins: [],
          frictions: ["Misses outweighed meaningful completed work."],
          nextChapter: "Lower the bar and restart."
        },
        insightTitles: ["Weekly state: resetting"],
        readinessEntryCount: 0
      },
      {
        userId: "user_arc",
        asOf: "2026-03-14",
        weekStart: "2026-03-09",
        weekEnd: "2026-03-15",
        recordedAt: "2026-03-14T12:00:00.000Z",
        reviewState: "protecting",
        adaptationAction: "protect_next_week",
        chapter: {
          tone: "protecting",
          title: "The week needed protecting",
          summary: "The week stayed fragile.",
          storyBeats: [],
          wins: [],
          frictions: ["Readiness kept trimming the week."],
          nextChapter: "Keep it simpler."
        },
        insightTitles: ["Weekly state: protecting"],
        readinessEntryCount: 2
      }
    ],
    {
      userId: "user_arc",
      asOf: "2026-03-21",
      weekStart: "2026-03-16",
      weekEnd: "2026-03-22",
      recordedAt: "2026-03-21T12:00:00.000Z",
      reviewState: "steady",
      adaptationAction: "hold_next_week",
      chapter: {
        tone: "steady",
        title: "The week found steady ground",
        summary: "The week landed more cleanly.",
        storyBeats: [],
        wins: ["Main work mostly held up."],
        frictions: [],
        nextChapter: "Repeat a similar week."
      },
      insightTitles: ["Weekly state: steady"],
      readinessEntryCount: 1
    }
  );

  assert.equal(arc?.pattern, "rebuilding");
  assert.equal(arc?.headline, "You are climbing back up");
  assert.deepEqual(arc?.recentStates, ["resetting", "protecting", "steady"]);
});

test("weekly coaching message can explain guarded progression inside a strong week", () => {
  const message = buildKaiWeeklyCoachingMessage(
    {
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      weekStatus: "on_track",
      plannedCount: 4,
      completedCount: 4,
      missedCount: 0,
      plannedCompletedCount: 4,
      plannedMissedCount: 0,
      unplannedCompletedCount: 0,
      remainingPlannedCount: 0,
      planAdherencePercent: 100,
      mainCoveragePercent: 100,
      supportCoveragePercent: 100,
      thinSessionCount: 0,
      fullSessionCount: 4,
      survivalSessionCount: 0,
      strongSessionCount: 4
    },
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate"
    },
    undefined,
    {
      state: "building",
      adaptationAction: "build_next_week",
      headline: "The week supported building.",
      reasons: [],
      nextWeekFocus: "Let next week grow slightly."
    },
    [
      {
        kind: "progression",
        title: "The week can still move forward, but one lift should repeat cleanly first",
        detail:
          "Primary upper slot is staying at repeat for now because recent comparable work showed rising set-level strain."
      }
    ]
  );

  assert.match(message.reason, /Primary upper slot is staying at repeat/i);
  assert.match(message.nextStep ?? "", /repeat the guarded lift cleanly/i);
});

test("weekly template prescriptions respond to comparable recent workout handling", () => {
  const profile = {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle" as const,
    experienceLevel: "intermediate" as const,
    targetSessionsPerWeek: 4,
    preferredSessionLength: 55,
    trainingStylePreference: "balanced" as const,
    preferredWorkoutDays: ["monday", "wednesday", "friday", "saturday"]
  };
  const onTrackWeek = {
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    weekStatus: "on_track" as const,
    plannedCount: 4,
    completedCount: 4,
    missedCount: 0,
    plannedCompletedCount: 4,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 0,
    planAdherencePercent: 100,
    mainCoveragePercent: 100,
    supportCoveragePercent: 100,
    thinSessionCount: 0,
    fullSessionCount: 4
  };
  const strongWorkouts = [
    {
      id: "w1",
      userId: "user_1",
      date: "2026-03-23",
      recordedAt: "2026-03-23T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 56,
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "hard" as const },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" as const },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 12, effort: "moderate" as const }
      ],
      status: "completed" as const
    },
    {
      id: "w1b",
      userId: "user_1",
      date: "2026-03-26",
      recordedAt: "2026-03-26T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 54,
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "hard" as const },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" as const },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 12, effort: "moderate" as const }
      ],
      status: "completed" as const
    }
  ];
  const strainedWorkouts = [
    {
      id: "w2",
      userId: "user_1",
      date: "2026-03-23",
      recordedAt: "2026-03-23T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 32,
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 2, reps: 8, effort: "easy" as const },
        { exerciseId: "lat_pulldown", sets: 2, reps: 10, effort: "easy" as const }
      ],
      status: "completed" as const
    }
  ];

  const strongPlan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    profile,
    undefined,
    onTrackWeek,
    strongWorkouts
  );
  const strainedPlan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    profile,
    undefined,
    onTrackWeek,
    strainedWorkouts
  );

  const strongDay = strongPlan.days.find(
    (day) =>
      day.status === "planned" &&
      day.workoutType === "upper_body" &&
      day.progressionIntent === "build"
  );
  const strainedDay = strainedPlan.days.find(
    (day) =>
      day.status === "planned" &&
      day.workoutType === "upper_body" &&
      day.progressionIntent === "conservative"
  );

  assert.deepEqual(strongDay?.sessionTemplate?.slots[0]?.prescriptionIntent, {
    sets: "high",
    reps: "strength_bias",
    effort: "push"
  });
  assert.deepEqual(strongDay?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "progress",
    reason: "This slot is the best place to progress if the day feels good."
  });
  assert.deepEqual(strainedDay?.sessionTemplate?.slots[0]?.prescriptionIntent, {
    sets: "low",
    reps: "hypertrophy_bias",
    effort: "submaximal"
  });
  assert.deepEqual(strainedDay?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "hold_back",
    reason: "Keep this main lift comfortable today and leave a little in the tank."
  });
});

test("weekly progression cues can hold back a main slot when recent comparable work showed rising set-level strain", () => {
  const profile = {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle" as const,
    experienceLevel: "intermediate" as const,
    targetSessionsPerWeek: 4,
    preferredSessionLength: 55,
    trainingStylePreference: "balanced" as const,
    preferredWorkoutDays: ["monday", "wednesday", "friday", "saturday"]
  };
  const onTrackWeek = {
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    weekStatus: "on_track" as const,
    plannedCount: 4,
    completedCount: 4,
    missedCount: 0,
    plannedCompletedCount: 4,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 0,
    planAdherencePercent: 100,
    mainCoveragePercent: 100,
    supportCoveragePercent: 100,
    thinSessionCount: 0,
    fullSessionCount: 4,
    survivalSessionCount: 0,
    strongSessionCount: 4
  };
  const strainedButCompletedWorkouts = [
    {
      id: "fatigue_w1",
      userId: "user_1",
      date: "2026-03-24",
      recordedAt: "2026-03-24T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 53,
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 4, reps: 8, effort: "moderate" as const },
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" as const },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" as const }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 3,
        sessionSize: "full" as const,
        durationCompletionRatio: 0.96,
        executionQuality: "strong" as const,
        restInflationRatio: 1.24,
        repDropoffPercent: 19,
        setEffortTrend: "rising" as const
      },
      status: "completed" as const
    },
    {
      id: "fatigue_w2",
      userId: "user_1",
      date: "2026-03-27",
      recordedAt: "2026-03-27T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 51,
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" as const },
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" as const },
        { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" as const }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 3,
        sessionSize: "full" as const,
        durationCompletionRatio: 0.93,
        executionQuality: "strong" as const,
        restInflationRatio: 1.22,
        repDropoffPercent: 18,
        setEffortTrend: "rising" as const
      },
      status: "completed" as const
    }
  ];

  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    profile,
    undefined,
    onTrackWeek,
    strainedButCompletedWorkouts
  );
  const day = plan.days.find(
    (entry) =>
      entry.status === "planned" &&
      entry.workoutType === "upper_body" &&
      entry.progressionIntent === "build"
  );

  assert.deepEqual(day?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "repeat",
    reason: "Recent sets got harder as the session went on, so repeat this cleanly before adding more."
  });
});

test("weekly progression cues reward a lift that is moving up cleanly", () => {
  const profile = {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle" as const,
    experienceLevel: "intermediate" as const,
    targetSessionsPerWeek: 4,
    preferredSessionLength: 55,
    trainingStylePreference: "balanced" as const,
    preferredWorkoutDays: ["monday", "wednesday", "friday", "saturday"]
  };
  const onTrackWeek = {
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    weekStatus: "on_track" as const,
    plannedCount: 4,
    completedCount: 4,
    missedCount: 0,
    plannedCompletedCount: 4,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 0,
    planAdherencePercent: 100,
    mainCoveragePercent: 100,
    supportCoveragePercent: 100,
    thinSessionCount: 0,
    fullSessionCount: 4,
    survivalSessionCount: 0,
    strongSessionCount: 4
  };
  const risingWorkouts = [
    {
      id: "rising_w1",
      userId: "user_1",
      date: "2026-03-24",
      recordedAt: "2026-03-24T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 55,
      sessionExercises: [
        {
          exerciseId: "barbell_bench_press",
          sets: 3,
          reps: 8,
          effort: "moderate" as const,
          performedSets: [
            { reps: 8, weightKg: 60, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 60, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 60, effort: "moderate" as const, completed: true }
          ]
        },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" as const },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" as const }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 3,
        sessionSize: "full" as const,
        durationCompletionRatio: 1,
        executionQuality: "strong" as const
      },
      status: "completed" as const
    },
    {
      id: "rising_w2",
      userId: "user_1",
      date: "2026-03-27",
      recordedAt: "2026-03-27T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 55,
      sessionExercises: [
        {
          exerciseId: "barbell_bench_press",
          sets: 3,
          reps: 8,
          effort: "moderate" as const,
          performedSets: [
            { reps: 8, weightKg: 65, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 65, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 65, effort: "moderate" as const, completed: true }
          ]
        },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" as const },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" as const }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 3,
        sessionSize: "full" as const,
        durationCompletionRatio: 1,
        executionQuality: "strong" as const
      },
      status: "completed" as const
    }
  ];

  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    profile,
    undefined,
    onTrackWeek,
    risingWorkouts
  );
  const day = plan.days.find(
    (entry) =>
      entry.status === "planned" &&
      entry.workoutType === "upper_body" &&
      entry.progressionIntent === "build"
  );

  assert.deepEqual(day?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "progress",
    reason: "This lift just moved forward, so it has earned a small progression."
  });
});

test("weekly progression cues hold a slipping lift back even inside a build day", () => {
  const profile = {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle" as const,
    experienceLevel: "intermediate" as const,
    targetSessionsPerWeek: 4,
    preferredSessionLength: 55,
    trainingStylePreference: "balanced" as const,
    preferredWorkoutDays: ["monday", "wednesday", "friday", "saturday"]
  };
  const onTrackWeek = {
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    weekStatus: "on_track" as const,
    plannedCount: 4,
    completedCount: 4,
    missedCount: 0,
    plannedCompletedCount: 4,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 0,
    planAdherencePercent: 100,
    mainCoveragePercent: 100,
    supportCoveragePercent: 100,
    thinSessionCount: 0,
    fullSessionCount: 4,
    survivalSessionCount: 0,
    strongSessionCount: 4
  };
  const slippingWorkouts = [
    {
      id: "slipping_w1",
      userId: "user_1",
      date: "2026-03-24",
      recordedAt: "2026-03-24T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 55,
      sessionExercises: [
        {
          exerciseId: "barbell_bench_press",
          sets: 3,
          reps: 8,
          effort: "moderate" as const,
          performedSets: [
            { reps: 8, weightKg: 65, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 65, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 65, effort: "moderate" as const, completed: true }
          ]
        },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" as const },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" as const }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 3,
        sessionSize: "full" as const,
        durationCompletionRatio: 1,
        executionQuality: "strong" as const
      },
      status: "completed" as const
    },
    {
      id: "slipping_w2",
      userId: "user_1",
      date: "2026-03-27",
      recordedAt: "2026-03-27T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 55,
      sessionExercises: [
        {
          exerciseId: "barbell_bench_press",
          sets: 3,
          reps: 8,
          effort: "moderate" as const,
          performedSets: [
            { reps: 8, weightKg: 60, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 60, effort: "moderate" as const, completed: true },
            { reps: 8, weightKg: 60, effort: "moderate" as const, completed: true }
          ]
        },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" as const },
        { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" as const }
      ],
      outcomeSummary: {
        mainCovered: true,
        supportCovered: true,
        coveredSlots: 3,
        sessionSize: "full" as const,
        durationCompletionRatio: 1,
        executionQuality: "strong" as const
      },
      status: "completed" as const
    }
  ];

  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    profile,
    undefined,
    onTrackWeek,
    slippingWorkouts
  );
  const day = plan.days.find(
    (entry) =>
      entry.status === "planned" &&
      entry.workoutType === "upper_body" &&
      entry.progressionIntent === "build"
  );

  assert.deepEqual(day?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "repeat",
    reason: "This lift dipped recently, so repeat it cleanly before you ask it to climb again."
  });
});

test("weekly template feedback can calm support slots when recent comparable sessions only covered the main work", () => {
  const profile = {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle" as const,
    experienceLevel: "intermediate" as const,
    targetSessionsPerWeek: 4,
    preferredSessionLength: 55,
    trainingStylePreference: "balanced" as const,
    preferredWorkoutDays: ["monday", "wednesday", "friday", "saturday"]
  };
  const onTrackWeek = {
    weekStart: "2026-03-23",
    weekEnd: "2026-03-29",
    weekStatus: "on_track" as const,
    plannedCount: 4,
    completedCount: 4,
    missedCount: 0,
    plannedCompletedCount: 4,
    plannedMissedCount: 0,
    unplannedCompletedCount: 0,
    remainingPlannedCount: 0,
    planAdherencePercent: 100,
    mainCoveragePercent: 100,
    supportCoveragePercent: 100,
    thinSessionCount: 0,
    fullSessionCount: 4
  };
  const mainOnlyWorkouts = [
    {
      id: "w3",
      userId: "user_1",
      date: "2026-03-23",
      recordedAt: "2026-03-23T09:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55,
      completedDuration: 46,
      sessionExercises: [
        { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" as const },
        { exerciseId: "incline_dumbbell_press", sets: 3, reps: 10, effort: "moderate" as const },
        { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" as const }
      ],
      status: "completed" as const
    }
  ];

  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    profile,
    undefined,
    onTrackWeek,
    mainOnlyWorkouts
  );
  const day = plan.days.find(
    (entry) =>
      entry.status === "planned" &&
      entry.workoutType === "upper_body" &&
      entry.progressionIntent === "build"
  );

  assert.deepEqual(day?.sessionTemplate?.slots[0]?.prescriptionIntent, {
    sets: "high",
    reps: "strength_bias",
    effort: "push"
  });
  assert.deepEqual(day?.sessionTemplate?.slots[0]?.progressionCue, {
    action: "progress",
    reason: "This slot is the best place to progress if the day feels good."
  });
  assert.deepEqual(day?.sessionTemplate?.slots[1]?.prescriptionIntent, {
    sets: "low",
    reps: "pump_bias",
    effort: "submaximal"
  });
  assert.deepEqual(day?.sessionTemplate?.slots[1]?.progressionCue, {
    action: "hold_back",
    reason: "Support work kept dropping off, so keep this slot easier to finish."
  });
  assert.equal(day?.sessionTemplate?.slots[1]?.candidateExerciseIds.length, 2);
});

test("daily readiness uses weekly day exercise intent", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      focusMuscles: ["chest", "lats"],
      favoriteExerciseIds: ["barbell_bench_press", "lat_pulldown"],
      painFlags: ["front_delts"],
      plannedFocusMuscles: ["lats", "upper_back"],
      plannedAvoidMuscles: ["front_delts"],
      plannedPreferredExerciseIds: ["lat_pulldown"]
    },
    {
      isPlannedDay: true,
      progressionIntent: "repeat",
      exerciseIntent: {
        focusMuscles: ["lats", "upper_back"],
        avoidMuscles: ["front_delts"],
        preferredExerciseIds: ["lat_pulldown"]
      }
    }
  );

  assert.equal(report.recommendedExercises[0]?.exerciseId, "lat_pulldown");
});

test("daily readiness hard-avoids constrained exercises", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      hardConstraints: [
        {
          kind: "avoid_exercise",
          value: "barbell_bench_press",
          source: "injury",
          note: "Shoulder flare-up."
        }
      ]
    }
  );

  assert.equal(
    report.recommendedExercises.some(
      (entry) => entry.exerciseId === "barbell_bench_press"
    ),
    false
  );
  assert.equal(
    report.avoidExercises.some(
      (entry) =>
        entry.exerciseId === "barbell_bench_press" &&
        entry.reasons.some((reason) => reason.startsWith("Hard constraint:"))
    ),
    true
  );
  assert.equal(
    report.substitutionOptions.some(
      (entry) => entry.exerciseId === "barbell_bench_press"
    ),
    false
  );
});

test("daily readiness hard-avoids exercises that do not fit the user's equipment access", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      equipmentAccess: "dumbbells_only"
    }
  );

  assert.equal(
    report.recommendedExercises.some((entry) => entry.exerciseId === "barbell_bench_press"),
    false
  );
  assert.equal(
    report.avoidExercises.some(
      (entry) =>
        entry.exerciseId === "barbell_bench_press" &&
        entry.reasons.some((reason) => reason.startsWith("Equipment mismatch:"))
    ),
    true
  );
  assert.equal(
    report.recommendedExercises.some(
      (entry) =>
        entry.exerciseId === "incline_dumbbell_press" ||
        entry.exerciseId === "pull_up"
    ),
    true
  );
});

test("daily readiness uses slot-aware recommendation memory when a planned template matches", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    {
      byExerciseId: {},
      byExerciseSlotKey: {
        "main:lat_pulldown": 0.3
      },
      byReasonTag: {}
    },
    {
      goal: "build_muscle"
    },
    {
      isPlannedDay: true,
      progressionIntent: "repeat",
      exerciseIntent: {
        focusMuscles: ["lats", "upper_back"],
        avoidMuscles: [],
        preferredExerciseIds: []
      },
      sessionTemplate: {
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            label: "Primary upper slot",
            targetEffects: ["horizontal_press", "vertical_pull", "horizontal_row"],
            candidateExerciseIds: ["lat_pulldown", "barbell_bench_press"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "strength_bias",
              effort: "working"
            }
          }
        ]
      }
    }
  );

  const latPulldown = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "lat_pulldown"
  );
  const bench = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "barbell_bench_press"
  );

  assert.equal(latPulldown?.exerciseId, "lat_pulldown");
  assert.equal(bench?.exerciseId, "barbell_bench_press");
  assert.ok((latPulldown?.score ?? 999) < (bench?.score ?? 999));
  assert.deepEqual(latPulldown?.provenance, {
    selectionSource: "template_primary",
    templateFitApplied: false,
    recoveryPenaltyApplied: false,
    equipmentConstraintApplied: false,
    painConstraintApplied: false,
    memoryNudgeApplied: true
  });
  assert.deepEqual(bench?.provenance, {
    selectionSource: "template_candidate",
    templateFitApplied: false,
    recoveryPenaltyApplied: false,
    equipmentConstraintApplied: false,
    painConstraintApplied: false,
    memoryNudgeApplied: false
  });
});

test("daily readiness favors a lift that is moving up cleanly", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "progress_w1",
        userId: "user_1",
        date: "2026-03-20",
        recordedAt: "2026-03-20T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 55,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 60, effort: "moderate", completed: true },
              { reps: 8, weightKg: 60, effort: "moderate", completed: true },
              { reps: 8, weightKg: 60, effort: "moderate", completed: true }
            ]
          }
        ]
      },
      {
        id: "progress_w2",
        userId: "user_1",
        date: "2026-03-27",
        recordedAt: "2026-03-27T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 55,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 65, effort: "moderate", completed: true },
              { reps: 8, weightKg: 65, effort: "moderate", completed: true },
              { reps: 8, weightKg: 65, effort: "moderate", completed: true }
            ]
          },
          {
            exerciseId: "incline_dumbbell_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 24, effort: "moderate", completed: true },
              { reps: 8, weightKg: 24, effort: "moderate", completed: true },
              { reps: 8, weightKg: 24, effort: "moderate", completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-30",
    "upper_body",
    "intermediate"
  );

  const bench = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "barbell_bench_press"
  );
  const incline = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "incline_dumbbell_press"
  );

  assert.equal(bench?.exerciseId, "barbell_bench_press");
  assert.equal(incline?.exerciseId, "incline_dumbbell_press");
  assert.ok((bench?.score ?? 999) < (incline?.score ?? 999));
  assert.ok(
    bench?.reasons.some((reason) => reason === "Recent performance has been moving up cleanly.")
  );
});

test("daily readiness cools a lift that has been slipping recently", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [
      {
        id: "slip_w1",
        userId: "user_1",
        date: "2026-03-20",
        recordedAt: "2026-03-20T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 55,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 65, effort: "moderate", completed: true },
              { reps: 8, weightKg: 65, effort: "moderate", completed: true },
              { reps: 8, weightKg: 65, effort: "moderate", completed: true }
            ]
          },
          {
            exerciseId: "incline_dumbbell_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 22, effort: "moderate", completed: true },
              { reps: 8, weightKg: 22, effort: "moderate", completed: true },
              { reps: 8, weightKg: 22, effort: "moderate", completed: true }
            ]
          }
        ]
      },
      {
        id: "slip_w2",
        userId: "user_1",
        date: "2026-03-27",
        recordedAt: "2026-03-27T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 55,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 60, effort: "moderate", completed: true },
              { reps: 8, weightKg: 60, effort: "moderate", completed: true },
              { reps: 8, weightKg: 60, effort: "moderate", completed: true }
            ]
          },
          {
            exerciseId: "incline_dumbbell_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 24, effort: "moderate", completed: true },
              { reps: 8, weightKg: 24, effort: "moderate", completed: true },
              { reps: 8, weightKg: 24, effort: "moderate", completed: true }
            ]
          }
        ]
      }
    ],
    "2026-03-30",
    "upper_body",
    "intermediate"
  );

  const bench = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "barbell_bench_press"
  );
  const incline = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "incline_dumbbell_press"
  );

  assert.equal(bench?.exerciseId, "barbell_bench_press");
  assert.equal(incline?.exerciseId, "incline_dumbbell_press");
  assert.ok((bench?.score ?? -999) > (incline?.score ?? -999));
  assert.ok(
    bench?.reasons.some((reason) => reason === "Recent performance has been slipping.")
  );
});

test("daily readiness learns from repeated substitutions and starts favoring the substituted lift", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "lower_body",
    "intermediate",
    {
      byExerciseId: {},
      byExerciseSlotKey: {},
      byReasonTag: {},
      bySubstitutedExerciseId: {
        goblet_squat: 0.4
      },
      bySubstitutedExerciseSlotKey: {}
    },
    {
      goal: "build_muscle"
    }
  );

  const gobletSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "goblet_squat"
  );
  const backSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "barbell_back_squat"
  );

  assert.equal(gobletSquat?.exerciseId, "goblet_squat");
  assert.equal(backSquat?.exerciseId, "barbell_back_squat");
  assert.ok((gobletSquat?.score ?? 999) < (backSquat?.score ?? 999));
});

test("daily readiness learns slot-specific substitutions for the planned main lift", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "lower_body",
    "intermediate",
    {
      byExerciseId: {},
      byExerciseSlotKey: {},
      byReasonTag: {},
      bySubstitutedExerciseId: {},
      bySubstitutedExerciseSlotKey: {
        "main:goblet_squat": 0.45
      },
      bySubstitutedWorkoutTypeExerciseKey: {}
    },
    {
      goal: "build_muscle",
      plannedPreferredExerciseIds: ["barbell_back_squat", "goblet_squat"]
    },
    {
      workoutType: "lower_body",
      progressionIntent: "repeat",
      exerciseIntent: {
        focusMuscles: ["quads", "glutes", "hamstrings"],
        avoidMuscles: [],
        preferredExerciseIds: ["barbell_back_squat", "goblet_squat"]
      },
      sessionTemplate: {
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            label: "Primary lower-body movement",
            targetEffects: ["squat_pattern", "quad_bias", "hinge_heavy"],
            candidateExerciseIds: ["barbell_back_squat", "goblet_squat", "leg_press"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "strength_bias",
              effort: "working"
            }
          }
        ]
      }
    }
  );

  const gobletSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "goblet_squat"
  );
  const backSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "barbell_back_squat"
  );

  assert.equal(gobletSquat?.exerciseId, "goblet_squat");
  assert.equal(backSquat?.exerciseId, "barbell_back_squat");
  assert.ok((gobletSquat?.score ?? 999) < (backSquat?.score ?? 999));
});

test("daily readiness learns workout-type-specific substitutions for the planned day", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "lower_body",
    "intermediate",
    {
      byExerciseId: {},
      byExerciseSlotKey: {},
      byReasonTag: {},
      bySubstitutedExerciseId: {},
      bySubstitutedExerciseSlotKey: {},
      bySubstitutedWorkoutTypeExerciseKey: {
        "lower_body:goblet_squat": 0.45
      }
    },
    {
      goal: "build_muscle",
      plannedPreferredExerciseIds: ["barbell_back_squat", "goblet_squat"]
    },
    {
      workoutType: "lower_body",
      progressionIntent: "repeat",
      exerciseIntent: {
        focusMuscles: ["quads", "glutes", "hamstrings"],
        avoidMuscles: [],
        preferredExerciseIds: ["barbell_back_squat", "goblet_squat"]
      },
      sessionTemplate: {
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            label: "Primary lower-body movement",
            targetEffects: ["squat_pattern", "quad_bias", "hinge_heavy"],
            candidateExerciseIds: ["barbell_back_squat", "goblet_squat", "leg_press"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "strength_bias",
              effort: "working"
            }
          }
        ]
      }
    }
  );

  const gobletSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "goblet_squat"
  );
  const backSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "barbell_back_squat"
  );

  assert.equal(gobletSquat?.exerciseId, "goblet_squat");
  assert.equal(backSquat?.exerciseId, "barbell_back_squat");
  assert.ok((gobletSquat?.score ?? 999) < (backSquat?.score ?? 999));
});

test("daily readiness learns explicit substitution pairs for the planned lift", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "lower_body",
    "intermediate",
    {
      byExerciseId: {},
      byExerciseSlotKey: {},
      byReasonTag: {},
      bySubstitutedExerciseId: {},
      bySubstitutedExerciseSlotKey: {},
      bySubstitutedWorkoutTypeExerciseKey: {},
      bySubstitutionPairKey: {
        "barbell_back_squat->goblet_squat": 0.5
      }
    },
    {
      goal: "build_muscle",
      plannedPreferredExerciseIds: ["barbell_back_squat", "goblet_squat"]
    },
    {
      workoutType: "lower_body",
      progressionIntent: "repeat",
      exerciseIntent: {
        focusMuscles: ["quads", "glutes", "hamstrings"],
        avoidMuscles: [],
        preferredExerciseIds: ["barbell_back_squat", "goblet_squat"]
      },
      sessionTemplate: {
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            label: "Primary lower-body movement",
            targetEffects: ["squat_pattern", "quad_bias", "hinge_heavy"],
            candidateExerciseIds: ["barbell_back_squat", "goblet_squat", "leg_press"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "strength_bias",
              effort: "working"
            }
          }
        ]
      }
    }
  );

  const gobletSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "goblet_squat"
  );
  const backSquat = report.recommendedExercises.find(
    (entry) => entry.exerciseId === "barbell_back_squat"
  );

  assert.equal(gobletSquat?.exerciseId, "goblet_squat");
  assert.equal(backSquat?.exerciseId, "barbell_back_squat");
  assert.ok((gobletSquat?.score ?? 999) < (backSquat?.score ?? 999));
});

test("weekly plan starts preferring lifts the user keeps substituting into", () => {
  const plan = buildWeeklyPlan(
    "user_1",
    "2026-03-30",
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 4,
      preferredSessionLength: 50,
      trainingStylePreference: "balanced",
      confidenceLevel: "building"
    },
    {
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "consistent",
      consistencyScore: 88,
      currentStreak: 3,
      recentCompletedCount: 3,
      recentMissedCount: 0,
      restartStyle: "standard_sessions",
      consistencyRisk: "low",
      recoveryStatus: "recovered",
      recommendationTrustScore: 0.7,
      recommendationMemory: {
        byExerciseId: {},
        byExerciseSlotKey: {},
        byReasonTag: {},
        bySubstitutedExerciseId: {
          goblet_squat: 0.4
        },
        bySubstitutedExerciseSlotKey: {
          "main:goblet_squat": 0.45
        },
        bySubstitutedWorkoutTypeExerciseKey: {
          "lower_body:goblet_squat": 0.45
        },
        bySubstitutionPairKey: {
          "barbell_back_squat->goblet_squat": 0.5
        }
      },
      sessionPatternMemory: {
        patternLabel: "stable_split",
        dominantWorkoutTypes: ["upper_body", "lower_body"],
        recentSequence: ["upper_body", "lower_body", "upper_body", "lower_body"],
        commonTransitions: ["upper_body->lower_body", "lower_body->upper_body"],
        structuredPatternConfidence: 0.8
      },
      nextRecoveryAction: {
        type: "minimum_viable_plan",
        label: "Train normally",
        detail: "Keep building with normal work."
      },
      coachingNote: "Responding well to repeatable sessions.",
      lastUpdated: "2026-03-30"
    }
  );

  const lowerDay = plan.days.find(
    (day) => day.status === "planned" && day.workoutType === "lower_body"
  );

  assert.equal(
    lowerDay?.sessionTemplate?.slots[0]?.candidateExerciseIds[0],
    "goblet_squat"
  );
  assert.match(
    lowerDay?.sessionTemplate?.slots[0]?.selectionReason ?? "",
    /preferred swap|reliable/i
  );
});

test("weekly plan can flip the default from repeated substitution-pair memory alone", () => {
  const plan = buildWeeklyPlan(
    "user_pair_only",
    "2026-03-30",
    {
      userId: "user_pair_only",
      name: "Pair User",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 4,
      preferredSessionLength: 50,
      trainingStylePreference: "balanced",
      confidenceLevel: "building"
    },
    {
      userId: "user_pair_only",
      name: "Pair User",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "consistent",
      consistencyScore: 85,
      currentStreak: 3,
      recentCompletedCount: 3,
      recentMissedCount: 0,
      restartStyle: "standard_sessions",
      consistencyRisk: "low",
      recoveryStatus: "recovered",
      recommendationTrustScore: 0.7,
      recommendationMemory: {
        byExerciseId: {},
        byExerciseSlotKey: {},
        byReasonTag: {},
        bySubstitutedExerciseId: {},
        bySubstitutedExerciseSlotKey: {},
        bySubstitutedWorkoutTypeExerciseKey: {},
        bySubstitutionPairKey: {
          "barbell_back_squat->goblet_squat": 0.5
        }
      },
      sessionPatternMemory: {
        patternLabel: "stable_split",
        dominantWorkoutTypes: ["upper_body", "lower_body"],
        recentSequence: ["upper_body", "lower_body", "upper_body", "lower_body"],
        commonTransitions: ["upper_body->lower_body", "lower_body->upper_body"],
        structuredPatternConfidence: 0.8
      },
      nextRecoveryAction: {
        type: "minimum_viable_plan",
        label: "Train normally",
        detail: "Keep building with normal work."
      },
      coachingNote: "Responding well to repeatable sessions.",
      lastUpdated: "2026-03-30"
    }
  );

  const lowerDay = plan.days.find(
    (day) => day.status === "planned" && day.workoutType === "lower_body"
  );

  assert.equal(
    lowerDay?.sessionTemplate?.slots[0]?.candidateExerciseIds[0],
    "goblet_squat"
  );
  assert.match(
    lowerDay?.sessionTemplate?.slots[0]?.selectionReason ?? "",
    /preferred swap|default/i
  );
});

test("weekly payload surfaces learned selection reasons from repeated substitutions", () => {
  const repositories = createJsonRepositories();
  repositories.profiles.saveProfile({
    userId: "user_selection",
    name: "Selection User",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    targetSessionsPerWeek: 4,
    preferredSessionLength: 50,
    trainingStylePreference: "balanced",
    confidenceLevel: "building"
  });
  repositories.memory.replaceMemoryState({
    user_selection: {
      userId: "user_selection",
      name: "Selection User",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "consistent",
      consistencyScore: 88,
      currentStreak: 3,
      recentCompletedCount: 3,
      recentMissedCount: 0,
      restartStyle: "standard_sessions",
      consistencyRisk: "low",
      recoveryStatus: "recovered",
      recommendationTrustScore: 0.7,
      recommendationMemory: {
        byExerciseId: {},
        byExerciseSlotKey: {},
        byReasonTag: {},
        bySubstitutedExerciseId: {
          goblet_squat: 0.4
        },
        bySubstitutedExerciseSlotKey: {
          "main:goblet_squat": 0.45
        },
        bySubstitutedWorkoutTypeExerciseKey: {
          "lower_body:goblet_squat": 0.45
        },
        bySubstitutionPairKey: {
          "barbell_back_squat->goblet_squat": 0.5
        }
      },
      sessionPatternMemory: {
        patternLabel: "stable_split",
        dominantWorkoutTypes: ["upper_body", "lower_body"],
        recentSequence: ["upper_body", "lower_body", "upper_body", "lower_body"],
        commonTransitions: ["upper_body->lower_body", "lower_body->upper_body"],
        structuredPatternConfidence: 0.8
      },
      nextRecoveryAction: {
        type: "minimum_viable_plan",
        label: "Train normally",
        detail: "Keep building with normal work."
      },
      coachingNote: "Responding well to repeatable sessions.",
      lastUpdated: "2026-03-30"
    }
  });

  const kaiService = createKaiService({ repositories });
  const weeklyPayload = kaiService.getKaiWeeklyPayload("user_selection", "2026-03-30");

  assert.ok(
    weeklyPayload.weeklyInsights.some(
      (insight) =>
        insight.kind === "selection" &&
        insight.title.includes("Goblet Squat") &&
        /preferred swap|more reliable/i.test(insight.detail)
    )
  );
  assert.ok(
    weeklyPayload.weeklyExerciseInsights.some(
      (insight) =>
        insight.exerciseId === "goblet_squat" &&
        (insight.selectionReasons ?? []).some((reason) =>
          /preferred swap|more reliable/i.test(reason)
        )
    )
  );
});

test("daily readiness edits the planned template instead of rebuilding from scratch", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      focusMuscles: ["chest", "lats"],
      favoriteExerciseIds: ["barbell_bench_press", "lat_pulldown"],
      painFlags: ["front_delts"],
      plannedFocusMuscles: ["lats", "upper_back"],
      plannedAvoidMuscles: ["front_delts"],
      plannedPreferredExerciseIds: ["lat_pulldown"]
    },
    {
      isPlannedDay: true,
      progressionIntent: "conservative",
      exerciseIntent: {
        focusMuscles: ["lats", "upper_back"],
        avoidMuscles: ["front_delts"],
        preferredExerciseIds: ["lat_pulldown"]
      },
      sessionTemplate: {
        sessionStyle: "conservative",
        slots: [
          {
            slot: "main",
            label: "Best-tolerated upper anchor",
            targetEffects: ["vertical_pull", "horizontal_press"],
            candidateExerciseIds: ["lat_pulldown", "barbell_bench_press"],
            prescriptionIntent: {
              sets: "low",
              reps: "hypertrophy_bias",
              effort: "submaximal"
            }
          },
          {
            slot: "secondary",
            label: "Balanced upper support work",
            targetEffects: ["horizontal_row", "lateral_delt_isolation", "biceps_isolation"],
            candidateExerciseIds: ["chest_supported_machine_row", "lateral_raise"],
            prescriptionIntent: {
              sets: "low",
              reps: "pump_bias",
              effort: "submaximal"
            }
          }
        ]
      }
    }
  );

  const mainBlock = report.sessionPlan.blocks.find((block) => block.slot === "main");
  const secondaryBlock = report.sessionPlan.blocks.find(
    (block) => block.slot === "secondary"
  );

  assert.equal(mainBlock?.focus, "Best-tolerated upper anchor");
  assert.deepEqual(mainBlock?.prescriptionIntent, {
    sets: "low",
    reps: "hypertrophy_bias",
    effort: "submaximal"
  });
  assert.deepEqual(mainBlock?.progressionCue, {
    action: "hold_back",
    reason: "Keep this main lift comfortable today and leave a little in the tank."
  });
  assert.deepEqual(mainBlock?.exampleExerciseIds.slice(0, 2), [
    "lat_pulldown",
    "barbell_bench_press"
  ]);
  assert.equal(mainBlock?.exampleExercises?.[0]?.exerciseId, "lat_pulldown");
  assert.equal(mainBlock?.exampleExercises?.[1]?.exerciseId, "barbell_bench_press");
  assert.equal(secondaryBlock?.focus, "Balanced upper support work");
  assert.deepEqual(secondaryBlock?.prescriptionIntent, {
    sets: "low",
    reps: "pump_bias",
    effort: "submaximal"
  });
  assert.deepEqual(secondaryBlock?.progressionCue, {
    action: "hold_back",
    reason: "Keep this part light and straightforward today."
  });
  assert.equal(secondaryBlock?.exampleExerciseIds[0], "chest_supported_machine_row");
  assert.ok((secondaryBlock?.exampleExerciseIds.length ?? 0) >= 1);
});

test("daily readiness reorders planned slot examples toward lifts that are moving better", () => {
  const report = buildTrainingReadinessReport(
    "user_progressive_template",
    [
      {
        id: "upper_progress_1",
        userId: "user_progressive_template",
        date: "2026-03-24",
        recordedAt: "2026-03-24T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 50,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 60, effort: "moderate", completed: true },
              { reps: 8, weightKg: 60, effort: "moderate", completed: true },
              { reps: 8, weightKg: 60, effort: "moderate", completed: true }
            ]
          },
          {
            exerciseId: "incline_dumbbell_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 32.5, effort: "moderate", completed: true },
              { reps: 8, weightKg: 32.5, effort: "moderate", completed: true },
              { reps: 8, weightKg: 32.5, effort: "moderate", completed: true }
            ]
          }
        ]
      },
      {
        id: "upper_progress_2",
        userId: "user_progressive_template",
        date: "2026-03-29",
        recordedAt: "2026-03-29T09:00:00.000Z",
        type: "upper_body",
        plannedDuration: 55,
        completedDuration: 50,
        status: "completed",
        sessionExercises: [
          {
            exerciseId: "barbell_bench_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 65, effort: "moderate", completed: true },
              { reps: 8, weightKg: 65, effort: "moderate", completed: true },
              { reps: 8, weightKg: 65, effort: "moderate", completed: true }
            ]
          },
          {
            exerciseId: "incline_dumbbell_press",
            sets: 3,
            reps: 8,
            effort: "moderate",
            performedSets: [
              { reps: 8, weightKg: 30, effort: "moderate", completed: true },
              { reps: 8, weightKg: 30, effort: "moderate", completed: true },
              { reps: 8, weightKg: 30, effort: "moderate", completed: true }
            ]
          }
        ]
      }
    ],
    "2026-04-03",
    "upper_body",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      plannedPreferredExerciseIds: [
        "incline_dumbbell_press",
        "barbell_bench_press",
        "lat_pulldown"
      ]
    },
    {
      isPlannedDay: true,
      progressionIntent: "build",
      exerciseIntent: {
        focusMuscles: ["chest", "lats"],
        avoidMuscles: [],
        preferredExerciseIds: [
          "incline_dumbbell_press",
          "barbell_bench_press",
          "lat_pulldown"
        ]
      },
      sessionTemplate: {
        sessionStyle: "build",
        slots: [
          {
            slot: "main",
            label: "Planned primary press",
            targetEffects: ["horizontal_press"],
            candidateExerciseIds: ["incline_dumbbell_press", "barbell_bench_press"],
            prescriptionIntent: {
              sets: "high",
              reps: "strength_bias",
              effort: "push"
            }
          },
          {
            slot: "secondary",
            label: "Planned upper support",
            targetEffects: ["vertical_pull", "horizontal_row"],
            candidateExerciseIds: ["lat_pulldown", "seated_cable_row"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "hypertrophy_bias",
              effort: "working"
            }
          }
        ]
      }
    }
  );

  assert.deepEqual(report.sessionPlan.blocks[0]?.exampleExerciseIds.slice(0, 2), [
    "barbell_bench_press",
    "incline_dumbbell_press"
  ]);
});

test("daily readiness downgrades planned slot prescriptions when fatigue changes the day", () => {
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

  const report = buildTrainingReadinessReport(
    "user_1",
    store.getWorkouts("user_1"),
    seeded.asOf,
    "push_day",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      focusMuscles: ["chest", "side_delts"],
      favoriteExerciseIds: ["barbell_bench_press", "lateral_raise"],
      plannedFocusMuscles: ["chest", "side_delts"],
      plannedAvoidMuscles: ["front_delts", "triceps"],
      plannedPreferredExerciseIds: ["barbell_bench_press", "lateral_raise"]
    },
    {
      isPlannedDay: true,
      progressionIntent: "build",
      exerciseIntent: {
        focusMuscles: ["chest", "side_delts"],
        avoidMuscles: ["front_delts", "triceps"],
        preferredExerciseIds: ["barbell_bench_press", "lateral_raise"]
      },
      sessionTemplate: {
        sessionStyle: "build",
        slots: [
          {
            slot: "main",
            label: "Planned primary press",
            targetEffects: ["horizontal_press", "chest_isolation"],
            candidateExerciseIds: ["barbell_bench_press", "incline_dumbbell_press"],
            prescriptionIntent: {
              sets: "high",
              reps: "strength_bias",
              effort: "push"
            }
          },
          {
            slot: "secondary",
            label: "Planned shoulder support",
            targetEffects: ["lateral_delt_isolation", "triceps_isolation"],
            candidateExerciseIds: ["lateral_raise", "tricep_pushdown"],
            prescriptionIntent: {
              sets: "moderate",
              reps: "hypertrophy_bias",
              effort: "working"
            }
          }
        ]
      }
    }
  );

  assert.equal(report.sessionDecision.status, "train_modified");
  const modifiedMainBlock = report.sessionPlan.blocks.find((block) => block.slot === "main");
  const modifiedSecondaryBlock = report.sessionPlan.blocks.find(
    (block) => block.slot === "secondary"
  );

  assert.deepEqual(modifiedMainBlock?.focus, "Planned primary press");
  assert.deepEqual(modifiedMainBlock?.prescriptionIntent, {
    sets: "moderate",
    reps: "strength_bias",
    effort: "working"
  });
  assert.deepEqual(modifiedMainBlock?.progressionCue, {
    action: "repeat",
    reason: "Today is more about moving well than pushing, so repeat this slot cleanly."
  });
  assert.deepEqual(modifiedMainBlock?.exampleExerciseIds.slice(0, 2), [
    "barbell_bench_press",
    "incline_dumbbell_press"
  ]);

  assert.deepEqual(modifiedSecondaryBlock?.focus, "Planned shoulder support");
  assert.deepEqual(modifiedSecondaryBlock?.prescriptionIntent, {
    sets: "low",
    reps: "pump_bias",
    effort: "submaximal"
  });
  assert.deepEqual(modifiedSecondaryBlock?.progressionCue, {
    action: "hold_back",
    reason: "Keep this support work light and straightforward today."
  });
  assert.equal(modifiedSecondaryBlock?.exampleExerciseIds[0], "lateral_raise");
  assert.ok((modifiedSecondaryBlock?.exampleExerciseIds.length ?? 0) >= 1);
});

test("daily readiness keeps mild intermediate upper-body pressure normal when recent comparable sessions held up cleanly", () => {
  const repositories = createJsonRepositories();

  repositories.workouts.recordCompletedWorkout({
    id: "upper_aligned_1",
    userId: "user_alignment_tolerance",
    date: "2026-03-24",
    recordedAt: "2026-03-24T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 4, reps: 6, effort: "moderate" },
      { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
      { exerciseId: "lateral_raise", sets: 3, reps: 15, effort: "moderate" }
    ],
    executionFeedback: {
      followedPlannedWorkout: true,
      mainCovered: true,
      supportCovered: true,
      executionQuality: "strong"
    }
  });
  repositories.workouts.recordCompletedWorkout({
    id: "upper_aligned_2",
    userId: "user_alignment_tolerance",
    date: "2026-03-27",
    recordedAt: "2026-03-27T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
      { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" }
    ],
    executionFeedback: {
      followedPlannedWorkout: true,
      mainCovered: true,
      supportCovered: true,
      executionQuality: "strong"
    }
  });
  repositories.workouts.recordCompletedWorkout({
    id: "upper_pressure_recent_1",
    userId: "user_alignment_tolerance",
    date: "2026-03-28",
    recordedAt: "2026-03-28T09:00:00.000Z",
    type: "pull_day",
    plannedDuration: 25,
    completedDuration: 22,
    sessionExercises: [
      { exerciseId: "lat_pulldown", sets: 6, reps: 12, effort: "hard" }
    ]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "upper_pressure_recent",
    userId: "user_alignment_tolerance",
    date: "2026-03-29",
    recordedAt: "2026-03-29T09:00:00.000Z",
    type: "pull_day",
    plannedDuration: 25,
    completedDuration: 22,
    sessionExercises: [
      { exerciseId: "lat_pulldown", sets: 6, reps: 12, effort: "hard" }
    ]
  });

  const report = buildTrainingReadinessReport(
    "user_alignment_tolerance",
    repositories.workouts.getWorkouts("user_alignment_tolerance"),
    "2026-03-30",
    "upper_body",
    "intermediate"
  );

  assert.equal(report.sessionDecision.status, "train_as_planned");
  assert.match(
    report.sessionDecision.notes.join(" "),
    /recent comparable sessions have been holding up cleanly/i
  );
});

test("daily readiness softens a day when recent comparable sessions showed leading set-level fatigue", () => {
  const repositories = createJsonRepositories();

  repositories.workouts.recordCompletedWorkout({
    id: "upper_set_fatigue_1",
    userId: "user_set_fatigue_readiness",
    date: "2026-03-12",
    recordedAt: "2026-03-12T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 44,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 4,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, effort: "moderate", restSeconds: 110, completed: true },
          { reps: 8, effort: "moderate", restSeconds: 125, completed: true },
          { reps: 7, effort: "hard", restSeconds: 145, completed: true },
          { reps: 6, effort: "hard", restSeconds: 160, completed: true }
        ]
      }
    ]
  });
  repositories.workouts.recordCompletedWorkout({
    id: "upper_set_fatigue_2",
    userId: "user_set_fatigue_readiness",
    date: "2026-03-19",
    recordedAt: "2026-03-19T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 43,
    sessionExercises: [
      {
        exerciseId: "lat_pulldown",
        sets: 4,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, effort: "moderate", restSeconds: 105, completed: true },
          { reps: 8, effort: "moderate", restSeconds: 120, completed: true },
          { reps: 7, effort: "hard", restSeconds: 140, completed: true },
          { reps: 6, effort: "hard", restSeconds: 155, completed: true }
        ]
      }
    ]
  });

  const report = buildTrainingReadinessReport(
    "user_set_fatigue_readiness",
    repositories.workouts.getWorkouts("user_set_fatigue_readiness"),
    "2026-03-30",
    "upper_body",
    "intermediate"
  );

  assert.equal(report.sessionDecision.status, "train_modified");
  assert.match(
    report.sessionDecision.summary,
    /keep the day cleaner than the recent fatigue trend/i
  );
  assert.match(
    report.sessionDecision.notes.join(" "),
    /Recent comparable sessions showed rising set-level fatigue/i
  );
});

test("daily readiness does not overreact to set-level fatigue when strong comparable build history has earned tolerance", () => {
  const repositories = createJsonRepositories();

  repositories.workouts.recordCompletedWorkout({
    id: "upper_build_aligned_1",
    userId: "user_set_fatigue_tolerance",
    date: "2026-03-10",
    recordedAt: "2026-03-10T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 52,
    sessionExercises: [
      {
        exerciseId: "barbell_bench_press",
        sets: 4,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, effort: "moderate", restSeconds: 110, completed: true },
          { reps: 8, effort: "moderate", restSeconds: 125, completed: true },
          { reps: 7, effort: "hard", restSeconds: 145, completed: true },
          { reps: 6, effort: "hard", restSeconds: 160, completed: true }
        ]
      },
      { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" }
    ],
    executionFeedback: {
      followedPlannedWorkout: true,
      mainCovered: true,
      supportCovered: true,
      executionQuality: "strong"
    }
  });
  repositories.workouts.recordCompletedWorkout({
    id: "upper_build_aligned_2",
    userId: "user_set_fatigue_tolerance",
    date: "2026-03-18",
    recordedAt: "2026-03-18T09:00:00.000Z",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [
      {
        exerciseId: "lat_pulldown",
        sets: 4,
        reps: 8,
        effort: "moderate",
        performedSets: [
          { reps: 8, effort: "moderate", restSeconds: 105, completed: true },
          { reps: 8, effort: "moderate", restSeconds: 120, completed: true },
          { reps: 7, effort: "hard", restSeconds: 140, completed: true },
          { reps: 6, effort: "hard", restSeconds: 155, completed: true }
        ]
      },
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" }
    ],
    executionFeedback: {
      followedPlannedWorkout: true,
      mainCovered: true,
      supportCovered: true,
      executionQuality: "strong"
    }
  });

  const report = buildTrainingReadinessReport(
    "user_set_fatigue_tolerance",
    repositories.workouts.getWorkouts("user_set_fatigue_tolerance"),
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    { goal: "build_muscle" },
    {
      isPlannedDay: true,
      progressionIntent: "build",
      exerciseIntent: {
        focusMuscles: ["chest", "lats", "upper_back"],
        avoidMuscles: [],
        preferredExerciseIds: []
      },
      sessionTemplate: {
        sessionStyle: "normal",
        slots: [
          {
            slot: "main",
            label: "Primary upper slot",
            targetEffects: ["horizontal_press", "vertical_pull", "horizontal_row"],
            candidateExerciseIds: ["barbell_bench_press", "lat_pulldown"],
            prescriptionIntent: {
              sets: "high",
              reps: "strength_bias",
              effort: "push"
            }
          }
        ]
      }
    }
  );

  assert.equal(report.sessionDecision.status, "train_as_planned");
});

test("readiness ranking uses favorite, disliked, and pain-profile inputs", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "full_body",
    "beginner",
    undefined,
    {
      goal: "build_muscle",
      favoriteExerciseIds: ["squat"],
      dislikedExerciseIds: ["barbell_bench_press"],
      painFlags: ["chest"]
    }
  );

  assert.equal(report.recommendedExercises[0]?.exerciseId, "squat");
  assert.equal(
    report.recommendedExercises.slice(0, 5).some((entry) => entry.exerciseId === "barbell_bench_press"),
    false
  );
});

test("low-confidence pain-limited upper-body days favor anchor defaults over isolated drift", () => {
  const report = buildTrainingReadinessReport(
    "user_1",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      painFlags: ["front_delts"]
    }
  );

  const topIds = report.recommendedExercises.slice(0, 4).map((entry) => entry.exerciseId);

  assert.notEqual(report.recommendedExercises[0]?.exerciseId, "rear_delt_fly");
  assert.equal(
    topIds.some((exerciseId) =>
      [
        "lat_pulldown",
        "pull_up",
        "assisted_pull_up_machine",
        "chest_supported_machine_row"
      ].includes(exerciseId)
    ),
    true
  );
});

test("frontend readiness response keeps inaccessible exercises out when equipment access is limited", () => {
  const trainingReadiness = buildTrainingReadinessReport(
    "user_equipment_access",
    [],
    "2026-03-30",
    "upper_body",
    "intermediate",
    undefined,
    {
      goal: "build_muscle",
      equipmentAccess: "bodyweight_only"
    }
  );
  const response = buildFrontendTrainingReadinessResponse(
    "user_equipment_access",
    "2026-03-30",
    trainingReadiness
  );

  assert.equal(
    response.exercisesToAvoidToday.some(
      (entry) =>
        entry.exerciseId === "barbell_bench_press" &&
        entry.reasons.some((reason) => reason.startsWith("Equipment mismatch:"))
    ),
    true
  );
  assert.equal(
    response.saferAlternatives.some((entry) => entry.exerciseId === "pull_up"),
    true
  );
  assert.equal(
    response.saferAlternatives.some((entry) => entry.exerciseId === "barbell_bench_press"),
    false
  );
  assert.equal(response.saferAlternatives.length <= 8, true);
  assert.match(response.decisionAudit.userExplanation, /equipment limits/i);
  assert.match(response.decisionAudit.kaiExplanation, /constraint equipment/i);
  assert.equal(response.decisionAudit.selectedSubstitutes[0]?.exerciseId, "pull_up");
  assert.match(
    response.decisionAudit.selectedSubstitutes[0]?.why.join(" "),
    /sensible repeatable default/i
  );
  assert.match(response.frontendCopy.primaryAction, /pull-up/i);
  assert.doesNotMatch(response.frontendCopy.primaryAction, /lat pulldown/i);
  assert.deepEqual(response.frontendExplanation.startingExercises, ["Pull-up"]);
  assert.equal(
    response.sessionPlan.blocks[0]?.exampleExerciseIds.includes("lat_pulldown"),
    false
  );
  assert.equal(
    response.sessionPlan.blocks[1]?.exampleExerciseIds.includes(
      "chest_supported_machine_row"
    ),
    false
  );
  assert.equal(response.substitutionOptions.length, 0);
});

test("profile adapter normalizes richer onboarding fields", () => {
  const profile = normalizeProfileInput({
    userId: "user_1",
    name: " Oliver ",
    goal: "gain_muscle",
    experienceLevel: "experienced",
    weeklyCommitment: 4,
    sessionLength: 48,
    preferredWorkoutDays: ["Monday", "Thursday"],
    trainingStylePreference: "split_bias",
    confidenceLevel: "unsure",
    equipment: "gym",
    focusMuscles: ["chest", "lats"],
    favoriteExerciseIds: ["barbell_bench_press", "lat_pulldown"],
    dislikedExerciseIds: ["burpee"],
    painFlags: ["front_delts"],
    constraints: [" short_on_time ", " avoid_exercise:barbell_back_squat "],
    hardConstraints: [
      {
        kind: "avoid_muscle",
        value: "front_delts",
        source: "pain",
        note: "Keep pressing stress down."
      }
    ]
  });

  assert.deepEqual(profile, {
    userId: "user_1",
    name: "Oliver",
    goal: "build_muscle",
    experienceLevel: "intermediate",
    preferredWorkoutDays: ["monday", "thursday"],
    targetSessionsPerWeek: 4,
    preferredSessionLength: 48,
    trainingStylePreference: "split_routine",
    confidenceLevel: "low",
    equipmentAccess: "full_gym",
    focusMuscles: ["chest", "lats"],
    favoriteExerciseIds: ["barbell_bench_press", "lat_pulldown"],
    dislikedExerciseIds: ["burpee"],
    painFlags: ["front_delts"],
    constraints: ["short_on_time", "avoid_exercise:barbell_back_squat"],
    hardConstraints: [
      {
        kind: "avoid_muscle",
        value: "front_delts",
        source: "pain",
        note: "Keep pressing stress down."
      },
      {
        kind: "avoid_exercise",
        value: "barbell_back_squat",
        source: "other"
      }
    ],
    tonePreference: undefined
  });
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

test("substitution options surface learned preferred swaps when explicit pair history exists", () => {
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
  const report = buildTrainingReadinessReport(
    "user_1",
    store.getWorkouts("user_1"),
    seeded.asOf,
    plannedWorkout?.type,
    undefined,
    {
      byExerciseId: {},
      byExerciseSlotKey: {},
      byReasonTag: {},
      bySubstitutedExerciseId: {
        leg_extension: 0.3
      },
      bySubstitutedExerciseSlotKey: {
        "main:leg_extension": 0.35
      },
      bySubstitutedWorkoutTypeExerciseKey: {
        "lower_body:leg_extension": 0.4
      },
      bySubstitutionPairKey: {
        "leg_press->leg_extension": 0.5
      }
    }
  );

  const backSquatSwap = report.substitutionOptions.find(
    (entry) => entry.exerciseId === "leg_press"
  );

  assert.equal(backSquatSwap?.exerciseId, "leg_press");
  assert.equal(backSquatSwap?.swapForExerciseIds[0], "leg_extension");
  assert.equal(backSquatSwap?.preferredByHistory, true);
  assert.match(
    backSquatSwap?.reason ?? "",
    /worked well for this user recently/i
  );
  assert.match(
    backSquatSwap?.frontendCopy?.explanation ?? "",
    /reliable repeat swap for this user/i
  );
});

test("substitution options prefer the replacement that is moving better lately", () => {
  const options = buildSubstitutionOptions({
    plannedWorkoutType: "pull_day",
    recommendedExercises: [
      {
        exerciseId: "hammer_curl",
        name: "Hammer Curl",
        bucket: "recommended",
        tolerance: "green",
        score: 0,
        reasons: []
      },
      {
        exerciseId: "rope_hammer_curl",
        name: "Rope Hammer Curl",
        bucket: "recommended",
        tolerance: "green",
        score: 0,
        reasons: []
      }
    ],
    candidateExercises: [
      {
        exerciseId: "barbell_curl",
        name: "Barbell Curl",
        bucket: "deprioritize",
        tolerance: "yellow",
        score: 10,
        reasons: ["biceps are still a little taxed"]
      }
    ],
    progressionSignalMap: new Map([
      ["hammer_curl", { trend: "slipping" }],
      ["rope_hammer_curl", { trend: "rising" }]
    ])
  });

  assert.equal(options[0]?.exerciseId, "barbell_curl");
  assert.equal(options[0]?.swapForExerciseIds[0], "rope_hammer_curl");
  assert.match(options[0]?.reason ?? "", /moving better lately/i);
  assert.match(options[0]?.frontendCopy?.explanation ?? "", /moving better lately/i);
});

test("repository snapshot exports unified persisted backend state", () => {
  const repositories = createJsonRepositories();
  const profile = repositories.profiles.saveProfile({
    userId: "user_export",
    name: "Export User",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });

  repositories.plannedWorkouts.savePlannedWorkout({
    id: "plan_export_1",
    userId: "user_export",
    date: "2026-04-07",
    type: "pull_day",
    plannedDuration: 50
  });

  repositories.workouts.recordCompletedWorkout({
    id: "workout_export_1",
    userId: "user_export",
    date: "2026-04-06",
    type: "pull_day",
    plannedDuration: 50,
    completedDuration: 52,
    sessionExercises: [
      { exerciseId: "lat_pulldown", sets: 3, reps: 10 },
      { exerciseId: "barbell_curl", sets: 3, reps: 12 }
    ]
  });

  const memory = repositories.memory.updateMemory({
    profile,
    signals: repositories.workouts.getBehaviorSignals("user_export", "2026-04-06"),
    recentEvent: repositories.workouts.getRecentEvent("user_export", "2026-04-06"),
    latestCompletedWorkout: repositories.workouts.getWorkouts("user_export")[0],
    asOf: "2026-04-06"
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "user_export",
    asOf: "2026-04-06",
    recordedAt: "2026-04-06T10:00:00.000Z",
    plannedWorkoutType: "pull_day",
    sessionStyle: "normal",
    sessionDecisionStatus: "train_as_planned",
    readinessScore: 78,
    readinessBand: "high",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Normal session",
      readinessHeadline: "Train as planned.",
      primaryAction: "Start with lat pulldown."
    },
    frontendExplanation: {
      planWhy: "Keep the pull day productive.",
      whyTodayLooksThisWay: ["No major recovery flags are standing out today."],
      focusAreas: ["Vertical pull work"],
      cautionAreas: [],
      startingExercises: ["Lat Pulldown"]
    },
    focusMuscles: ["lats"],
    limitMuscles: [],
    overworkedMuscles: [],
    recoveringMuscles: [],
    muscleGroupsToAvoidToday: [],
    primaryExerciseIds: ["lat_pulldown"]
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_export",
    asOf: "2026-04-06",
    weekStart: "2026-04-06",
    weekEnd: "2026-04-12",
    recordedAt: "2026-04-06T12:00:00.000Z",
    reviewState: "steady",
    adaptationAction: "hold_next_week",
    chapter: {
      tone: "steady",
      title: "The week found steady ground",
      summary: "1/1 planned sessions landed this week. The week landed cleanly and should hold steady.",
      storyBeats: ["1/1 planned sessions were completed, with 0 still left open."],
      wins: ["Main work mostly held up when sessions were completed."],
      frictions: [],
      nextChapter: "Repeat a similar week before asking for more."
    },
    insightTitles: ["Plan adherence held up"],
    readinessEntryCount: 1
  });

  const snapshot = repositories.exportState();

  assert.equal(snapshot.profiles.user_export?.name, "Export User");
  assert.equal(snapshot.workouts.user_export?.length, 1);
  assert.equal(snapshot.plannedWorkouts.user_export?.[0]?.type, "pull_day");
  assert.equal(snapshot.memory.user_export?.consistencyScore, memory.consistencyScore);
  assert.equal(snapshot.readinessHistory.user_export?.[0]?.primaryExerciseIds[0], "lat_pulldown");
  assert.equal(snapshot.weeklyChapterHistory.user_export?.[0]?.chapter.title, "The week found steady ground");
});

test("repository exportUserState returns a single coherent user snapshot", () => {
  const repositories = createJsonRepositories();

  repositories.profiles.saveProfile({
    userId: "user_scope",
    name: "Scoped User",
    goal: "build_consistency",
    experienceLevel: "beginner"
  });
  repositories.profiles.saveProfile({
    userId: "user_other",
    name: "Other User",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });

  repositories.plannedWorkouts.savePlannedWorkout({
    id: "scope_plan_1",
    userId: "user_scope",
    date: "2026-04-08",
    type: "full_body",
    plannedDuration: 45
  });
  repositories.workouts.recordMissedWorkout({
    id: "scope_missed_1",
    userId: "user_scope",
    date: "2026-04-05",
    type: "full_body",
    plannedDuration: 45
  });
  repositories.workouts.recordCompletedWorkout({
    id: "other_completed_1",
    userId: "user_other",
    date: "2026-04-05",
    type: "push_day",
    plannedDuration: 45,
    completedDuration: 44,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8 }
    ]
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "user_scope",
    asOf: "2026-04-08",
    recordedAt: "2026-04-08T07:00:00.000Z",
    plannedWorkoutType: "full_body",
    sessionStyle: "conservative",
    sessionDecisionStatus: "train_light",
    readinessScore: 49,
    readinessBand: "low",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Conservative session",
      readinessHeadline: "Keep today light and easy to recover from.",
      primaryAction: "Start with squat."
    },
    frontendExplanation: {
      planWhy: "Keep momentum without adding much fatigue.",
      whatChangedToday: "The session was kept intentionally light so recovery can catch back up.",
      whyTodayLooksThisWay: ["Quads are still the biggest recovery limiter today."],
      focusAreas: ["Low-pressure lower-body work"],
      cautionAreas: ["Limit overlap on quads."],
      startingExercises: ["Squat"]
    },
    focusMuscles: ["quads"],
    limitMuscles: ["quads"],
    overworkedMuscles: [],
    recoveringMuscles: ["quads"],
    muscleGroupsToAvoidToday: ["quads"],
    primaryExerciseIds: ["squat"]
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_scope",
    asOf: "2026-04-08",
    weekStart: "2026-04-06",
    weekEnd: "2026-04-12",
    recordedAt: "2026-04-08T12:00:00.000Z",
    reviewState: "protecting",
    adaptationAction: "protect_next_week",
    chapter: {
      tone: "protecting",
      title: "The week needed protecting",
      summary: "0/1 planned sessions landed this week. Next week should stay finishable rather than expand.",
      storyBeats: ["The week is still too early to read as a real pattern."],
      wins: [],
      frictions: ["1/1 readiness checks needed the day toned down."],
      nextChapter: "Keep the next week modest and protect consistency before building again."
    },
    insightTitles: ["Readiness kept trimming the week"],
    readinessEntryCount: 1
  });

  const userState = repositories.exportUserState("user_scope");

  assert.equal(userState.profile.name, "Scoped User");
  assert.equal(userState.workouts.length, 1);
  assert.equal(userState.workouts[0]?.status, "missed");
  assert.equal(userState.plannedWorkouts.length, 1);
  assert.equal(userState.plannedWorkouts[0]?.type, "full_body");
  assert.equal(userState.readinessHistory.length, 1);
  assert.equal(userState.readinessHistory[0]?.sessionStyle, "conservative");
  assert.equal(userState.weeklyChapterHistory[0]?.reviewState, "protecting");
  assert.equal(userState.memory, undefined);
});

test("repository importState restores a full persisted backend snapshot", () => {
  const sourceRepositories = createJsonRepositories();

  sourceRepositories.profiles.saveProfile({
    userId: "user_restore",
    name: "Restore User",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });
  sourceRepositories.plannedWorkouts.savePlannedWorkout({
    id: "restore_plan_1",
    userId: "user_restore",
    date: "2026-04-09",
    type: "upper_body",
    plannedDuration: 55
  });
  sourceRepositories.workouts.recordCompletedWorkout({
    id: "restore_workout_1",
    userId: "user_restore",
    date: "2026-04-08",
    type: "upper_body",
    plannedDuration: 55,
    completedDuration: 50,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8 },
      { exerciseId: "lat_pulldown", sets: 3, reps: 10 }
    ]
  });

  const restoreProfile = sourceRepositories.profiles.getProfile("user_restore");
  sourceRepositories.memory.updateMemory({
    profile: restoreProfile,
    signals: sourceRepositories.workouts.getBehaviorSignals("user_restore", "2026-04-08"),
    recentEvent: sourceRepositories.workouts.getRecentEvent("user_restore", "2026-04-08"),
    latestCompletedWorkout: sourceRepositories.workouts.getWorkouts("user_restore")[0],
    asOf: "2026-04-08"
  });
  sourceRepositories.readinessHistory.saveReadinessHistory({
    userId: "user_restore",
    asOf: "2026-04-09",
    recordedAt: "2026-04-09T06:00:00.000Z",
    plannedWorkoutType: "upper_body",
    sessionStyle: "normal",
    sessionDecisionStatus: "train_as_planned",
    readinessScore: 72,
    readinessBand: "high",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Normal session",
      readinessHeadline: "Train as planned.",
      primaryAction: "Start with barbell bench press."
    },
    frontendExplanation: {
      planWhy: "Run the full upper-body day normally.",
      whyTodayLooksThisWay: ["No major recovery flags are standing out today."],
      focusAreas: ["Horizontal push work"],
      cautionAreas: [],
      startingExercises: ["Barbell Bench Press"]
    },
    focusMuscles: ["chest", "front_delts", "triceps"],
    limitMuscles: [],
    overworkedMuscles: [],
    recoveringMuscles: [],
    muscleGroupsToAvoidToday: [],
    primaryExerciseIds: ["barbell_bench_press"],
    decisionSnapshot: {
      dayOrigin: "planned",
      decisionSummary: "train_as_planned | normal | high 72",
      recommendedTrainingDirection: "Run the full upper-body day normally.",
      topRecoveryLimiters: [],
      musclesToAvoid: [],
      movementPatternsToAvoid: [],
      primaryExerciseIds: ["barbell_bench_press"]
    }
  });
  sourceRepositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "user_restore",
    asOf: "2026-04-09",
    weekStart: "2026-04-06",
    weekEnd: "2026-04-12",
    recordedAt: "2026-04-09T12:00:00.000Z",
    reviewState: "steady",
    adaptationAction: "hold_next_week",
    chapter: {
      tone: "steady",
      title: "The week found steady ground",
      summary: "1/1 planned sessions landed this week. The week landed cleanly and should hold steady.",
      storyBeats: ["1/1 planned sessions were completed, with 0 still left open."],
      wins: ["The sessions that happened were mostly handled with good execution."],
      frictions: [],
      nextChapter: "Repeat a similar week before asking for more."
    },
    insightTitles: ["Execution quality was solid"],
    readinessEntryCount: 1
  });

  const snapshot = sourceRepositories.exportState();
  const targetRepositories = createJsonRepositories();
  const restored = targetRepositories.importState(snapshot);

  assert.deepEqual(restored, snapshot);
  assert.equal(targetRepositories.exportUserState("user_restore").plannedWorkouts[0]?.type, "upper_body");
  assert.equal(targetRepositories.exportUserState("user_restore").readinessHistory[0]?.asOf, "2026-04-09");
  assert.equal(
    targetRepositories.exportUserState("user_restore").readinessHistory[0]?.decisionSnapshot
      ?.decisionSummary,
    "train_as_planned | normal | high 72"
  );
  assert.equal(
    targetRepositories.exportUserState("user_restore").weeklyChapterHistory[0]?.chapter.title,
    "The week found steady ground"
  );
});

test("repository importState backfills readiness history for older snapshots", () => {
  const repositories = createJsonRepositories();

  repositories.importState({
    workouts: {},
    profiles: {
      legacy_user: {
        userId: "legacy_user",
        name: "Legacy User",
        goal: "build_consistency",
        experienceLevel: "beginner"
      }
    },
    memory: {},
    plannedWorkouts: {}
  } as any);

  const userState = repositories.exportUserState("legacy_user");

  assert.equal(userState.profile.name, "Legacy User");
  assert.deepEqual(userState.readinessHistory, []);
  assert.deepEqual(userState.weeklyChapterHistory, []);
});

test("repository importUserState restores one user without disturbing others", () => {
  const repositories = createJsonRepositories();

  repositories.profiles.saveProfile({
    userId: "existing_user",
    name: "Existing User",
    goal: "build_consistency",
    experienceLevel: "beginner"
  });
  repositories.workouts.recordMissedWorkout({
    id: "existing_missed_1",
    userId: "existing_user",
    date: "2026-04-02",
    type: "full_body",
    plannedDuration: 40
  });

  const imported = repositories.importUserState("import_user", {
    profile: {
      userId: "import_user",
      name: "Imported User",
      goal: "build_muscle",
      experienceLevel: "intermediate"
    },
    workouts: [
      {
        id: "import_workout_1",
        userId: "import_user",
        date: "2026-04-03",
        recordedAt: "2026-04-03T10:00:00.000Z",
        type: "pull_day",
        status: "completed",
        plannedDuration: 50,
        completedDuration: 48,
        sessionExercises: [
          { exerciseId: "lat_pulldown", sets: 3, reps: 10 }
        ]
      }
    ],
    memory: {
      userId: "import_user",
      name: "Imported User",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      motivationStyle: "balanced",
      consistencyStatus: "building",
      consistencyScore: 78,
      currentStreak: 2,
      recentCompletedCount: 2,
      recentMissedCount: 0,
      restartStyle: "small_sessions",
      consistencyRisk: "medium",
      recoveryStatus: "on_track",
      recommendationTrustScore: 0.5,
      recommendationMemory: {
        byExerciseId: {},
        byExerciseSlotKey: {},
        byReasonTag: {}
      },
      sessionPatternMemory: {
        patternLabel: "unsettled",
        dominantWorkoutTypes: [],
        recentSequence: [],
        commonTransitions: [],
        structuredPatternConfidence: 0
      },
      coachingNote: "Imported state",
      lastUpdated: "2026-04-03"
    },
    plannedWorkouts: [
      {
        id: "import_plan_1",
        userId: "import_user",
        date: "2026-04-04",
        type: "pull_day",
        plannedDuration: 50
      }
    ],
    readinessHistory: [
      {
        userId: "import_user",
        asOf: "2026-04-04",
        recordedAt: "2026-04-04T06:00:00.000Z",
        plannedWorkoutType: "pull_day",
        sessionStyle: "modified",
        sessionDecisionStatus: "train_modified",
        readinessScore: 58,
        readinessBand: "moderate",
        dataConfidence: "medium",
        frontendCopy: {
          sessionLabel: "Modified session",
          readinessHeadline: "Train, but keep the overlap under control.",
          primaryAction: "Start with lat pulldown."
        },
        frontendExplanation: {
          planWhy: "Keep the pull day, but trim overlap.",
          whyTodayLooksThisWay: ["Lats are still the biggest recovery limiter today."],
          focusAreas: ["Vertical pull work"],
          cautionAreas: ["Limit overlap on lats."],
          startingExercises: ["Lat Pulldown"]
        },
        focusMuscles: ["lats"],
        limitMuscles: ["lats"],
        overworkedMuscles: [],
        recoveringMuscles: ["lats"],
        muscleGroupsToAvoidToday: ["lats"],
        primaryExerciseIds: ["lat_pulldown"]
      }
    ],
    weeklyChapterHistory: [
      {
        userId: "import_user",
        asOf: "2026-04-04",
        weekStart: "2026-03-30",
        weekEnd: "2026-04-05",
        recordedAt: "2026-04-04T12:00:00.000Z",
        reviewState: "protecting",
        adaptationAction: "protect_next_week",
        chapter: {
          tone: "protecting",
          title: "The week needed trimming to stay on track",
          summary: "1/1 planned sessions landed this week. 1/1 readiness checks still had to tone the day down, so the week stayed in protecting mode.",
          storyBeats: ["1/1 planned sessions were completed, with 0 still left open."],
          wins: ["Main work mostly held up when sessions were completed."],
          frictions: ["1/1 readiness checks needed the day toned down."],
          nextChapter: "Keep the next week modest and protect consistency before building again."
        },
        insightTitles: ["Readiness kept trimming the week"],
        readinessEntryCount: 1
      }
    ]
  });

  assert.equal(imported.profile.name, "Imported User");
  assert.equal(imported.workouts.length, 1);
  assert.equal(imported.plannedWorkouts[0]?.type, "pull_day");
  assert.equal(imported.readinessHistory[0]?.sessionDecisionStatus, "train_modified");
  assert.equal(imported.weeklyChapterHistory[0]?.chapter.title, "The week needed trimming to stay on track");
  assert.equal(repositories.exportUserState("existing_user").profile.name, "Existing User");
  assert.equal(repositories.exportUserState("existing_user").workouts.length, 1);
});

test("migration bundle round-trips a full backend snapshot", () => {
  const repositories = createJsonRepositories();

  repositories.profiles.saveProfile({
    userId: "bundle_user",
    name: "Bundle User",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });
  repositories.workouts.recordCompletedWorkout({
    id: "bundle_workout_1",
    userId: "bundle_user",
    date: "2026-04-10",
    type: "push_day",
    plannedDuration: 50,
    completedDuration: 47,
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 3, reps: 8 }
    ]
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "bundle_plan_1",
    userId: "bundle_user",
    date: "2026-04-11",
    type: "pull_day",
    plannedDuration: 50
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "bundle_user",
    asOf: "2026-04-11",
    recordedAt: "2026-04-11T08:00:00.000Z",
    plannedWorkoutType: "pull_day",
    sessionStyle: "normal",
    sessionDecisionStatus: "train_as_planned",
    readinessScore: 75,
    readinessBand: "high",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Normal session",
      readinessHeadline: "Train as planned.",
      primaryAction: "Start with lat pulldown."
    },
    frontendExplanation: {
      planWhy: "Run the pull day normally.",
      whyTodayLooksThisWay: ["No major recovery flags are standing out today."],
      focusAreas: ["Vertical pull work"],
      cautionAreas: [],
      startingExercises: ["Lat Pulldown"]
    },
    focusMuscles: ["lats"],
    limitMuscles: [],
    overworkedMuscles: [],
    recoveringMuscles: [],
    muscleGroupsToAvoidToday: [],
    primaryExerciseIds: ["lat_pulldown"],
    decisionSnapshot: {
      dayOrigin: "planned",
      decisionSummary: "train_as_planned | normal | high 75",
      recommendedTrainingDirection: "Run the pull day normally.",
      topRecoveryLimiters: [],
      musclesToAvoid: [],
      movementPatternsToAvoid: [],
      primaryExerciseIds: ["lat_pulldown"]
    }
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "bundle_user",
    asOf: "2026-04-11",
    weekStart: "2026-04-06",
    weekEnd: "2026-04-12",
    recordedAt: "2026-04-11T12:00:00.000Z",
    reviewState: "steady",
    adaptationAction: "hold_next_week",
    chapter: {
      tone: "steady",
      title: "The week found steady ground",
      summary: "1/1 planned sessions landed this week. The week landed cleanly and should hold steady.",
      storyBeats: ["1/1 planned sessions were completed, with 0 still left open."],
      wins: ["Main work mostly held up when sessions were completed."],
      frictions: [],
      nextChapter: "Repeat a similar week before asking for more."
    },
    insightTitles: ["Plan adherence held up"],
    readinessEntryCount: 1
  });

  const snapshot = repositories.exportState();
  const bundle = snapshotToMigrationBundle(snapshot);

  assert.deepEqual(migrationBundleToSnapshot(bundle), snapshot);
});

test("user migration bundle round-trips a single user snapshot", () => {
  const repositories = createJsonRepositories();

  repositories.profiles.saveProfile({
    userId: "bundle_scope_user",
    name: "Bundle Scope User",
    goal: "build_consistency",
    experienceLevel: "beginner"
  });
  repositories.workouts.recordMissedWorkout({
    id: "bundle_scope_missed_1",
    userId: "bundle_scope_user",
    date: "2026-04-10",
    type: "full_body",
    plannedDuration: 35
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "bundle_scope_plan_1",
    userId: "bundle_scope_user",
    date: "2026-04-12",
    type: "full_body",
    plannedDuration: 35
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "bundle_scope_user",
    asOf: "2026-04-12",
    recordedAt: "2026-04-12T08:00:00.000Z",
    plannedWorkoutType: "full_body",
    sessionStyle: "conservative",
    sessionDecisionStatus: "train_light",
    readinessScore: 46,
    readinessBand: "low",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Conservative session",
      readinessHeadline: "Keep today light and easy to recover from.",
      primaryAction: "Start with squat."
    },
    frontendExplanation: {
      planWhy: "Keep momentum with a light full-body day.",
      whyTodayLooksThisWay: ["Quads are still the biggest recovery limiter today."],
      focusAreas: ["Light lower-body work"],
      cautionAreas: ["Limit overlap on quads."],
      startingExercises: ["Squat"]
    },
    focusMuscles: ["quads"],
    limitMuscles: ["quads"],
    overworkedMuscles: [],
    recoveringMuscles: ["quads"],
    muscleGroupsToAvoidToday: ["quads"],
    primaryExerciseIds: ["squat"],
    decisionSnapshot: {
      dayOrigin: "planned",
      decisionSummary: "train_light | conservative | low 46",
      recommendedTrainingDirection: "Keep momentum with a light full-body day.",
      topRecoveryLimiters: ["quads (recovering)"],
      musclesToAvoid: ["quads"],
      movementPatternsToAvoid: [],
      primaryExerciseIds: ["squat"]
    }
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "bundle_scope_user",
    asOf: "2026-04-12",
    weekStart: "2026-04-06",
    weekEnd: "2026-04-12",
    recordedAt: "2026-04-12T12:00:00.000Z",
    reviewState: "protecting",
    adaptationAction: "protect_next_week",
    chapter: {
      tone: "protecting",
      title: "The week needed protecting",
      summary: "0/1 planned sessions landed this week. Next week should stay finishable rather than expand.",
      storyBeats: ["The week is still too early to read as a real pattern."],
      wins: [],
      frictions: ["1/1 readiness checks needed the day toned down."],
      nextChapter: "Keep the next week modest and protect consistency before building again."
    },
    insightTitles: ["Readiness kept trimming the week"],
    readinessEntryCount: 1
  });

  const userSnapshot = repositories.exportUserState("bundle_scope_user");
  const bundle = userSnapshotToMigrationBundle("bundle_scope_user", userSnapshot);

  assert.deepEqual(userMigrationBundleToSnapshot(bundle), userSnapshot);
});

test("legacy user migration bundle backfills readiness history", () => {
  const snapshot = userMigrationBundleToSnapshot({
    userId: "legacy_bundle_user",
    workouts: [],
    profiles: [
      {
        userId: "legacy_bundle_user",
        name: "Legacy Bundle User",
        goal: "build_consistency",
        experienceLevel: "beginner"
      }
    ],
    memory: [],
    plannedWorkouts: []
  } as any);

  assert.equal(snapshot.profile.name, "Legacy Bundle User");
  assert.deepEqual(snapshot.readinessHistory, []);
  assert.deepEqual(snapshot.weeklyChapterHistory, []);
});

test("database repository scaffold persists writes through the adapter boundary", () => {
  const adapter = createInMemoryDatabaseAdapter();
  const repositories = createDatabaseRepositories({ adapter });

  repositories.profiles.saveProfile({
    userId: "db_user",
    name: "DB User",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });
  repositories.plannedWorkouts.savePlannedWorkout({
    id: "db_plan_1",
    userId: "db_user",
    date: "2026-04-15",
    type: "pull_day",
    plannedDuration: 50
  });
  repositories.workouts.recordCompletedWorkout({
    id: "db_workout_1",
    userId: "db_user",
    date: "2026-04-14",
    type: "pull_day",
    plannedDuration: 50,
    completedDuration: 46,
    sessionExercises: [
      { exerciseId: "lat_pulldown", sets: 3, reps: 10 }
    ]
  });
  repositories.readinessHistory.saveReadinessHistory({
    userId: "db_user",
    asOf: "2026-04-15",
    recordedAt: "2026-04-15T07:00:00.000Z",
    plannedWorkoutType: "pull_day",
    sessionStyle: "normal",
    sessionDecisionStatus: "train_as_planned",
    readinessScore: 74,
    readinessBand: "high",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Normal session",
      readinessHeadline: "Train as planned.",
      primaryAction: "Start with lat pulldown."
    },
    frontendExplanation: {
      planWhy: "Run the pull day normally.",
      whyTodayLooksThisWay: ["No major recovery flags are standing out today."],
      focusAreas: ["Vertical pull work"],
      cautionAreas: [],
      startingExercises: ["Lat Pulldown"]
    },
    focusMuscles: ["lats"],
    limitMuscles: [],
    overworkedMuscles: [],
    recoveringMuscles: [],
    muscleGroupsToAvoidToday: [],
    primaryExerciseIds: ["lat_pulldown"]
  });
  repositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "db_user",
    asOf: "2026-04-15",
    weekStart: "2026-04-13",
    weekEnd: "2026-04-19",
    recordedAt: "2026-04-15T12:00:00.000Z",
    reviewState: "steady",
    adaptationAction: "hold_next_week",
    chapter: {
      tone: "steady",
      title: "The week found steady ground",
      summary: "1/1 planned sessions landed this week. The week landed cleanly and should hold steady.",
      storyBeats: ["1/1 planned sessions were completed, with 0 still left open."],
      wins: ["Main work mostly held up when sessions were completed."],
      frictions: [],
      nextChapter: "Repeat a similar week before asking for more."
    },
    insightTitles: ["Plan adherence held up"],
    readinessEntryCount: 1
  });

  const reloadedRepositories = createDatabaseRepositories({ adapter });

  assert.equal(reloadedRepositories.exportUserState("db_user").profile.name, "DB User");
  assert.equal(reloadedRepositories.exportUserState("db_user").workouts.length, 1);
  assert.equal(
    reloadedRepositories.exportUserState("db_user").plannedWorkouts[0]?.type,
    "pull_day"
  );
  assert.equal(reloadedRepositories.exportUserState("db_user").readinessHistory[0]?.asOf, "2026-04-15");
  assert.equal(
    reloadedRepositories.exportUserState("db_user").weeklyChapterHistory[0]?.chapter.title,
    "The week found steady ground"
  );
});

test("persisted repository scaffold supports async snapshot persistence", async () => {
  let persistedSnapshot: BaskStateSnapshot = {
    workouts: {},
    profiles: {},
    memory: {},
    plannedWorkouts: {},
    readinessHistory: {},
    weeklyChapterHistory: {}
  };
  const persistedWrites: string[] = [];
  const repositories = createPersistedRepositories({
    initialState: persistedSnapshot,
    async persistSnapshot(snapshot) {
      await Promise.resolve();
      persistedSnapshot = structuredClone(snapshot);
      persistedWrites.push(Object.keys(snapshot.profiles).join(","));
    }
  });

  repositories.profiles.saveProfile({
    userId: "async_db_user",
    name: "Async DB User",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });

  await Promise.resolve();

  assert.equal(persistedSnapshot.profiles.async_db_user?.name, "Async DB User");
  assert.deepEqual(persistedWrites, ["async_db_user"]);
});

test("file database adapter persists writes across repository instances", (context) => {
  const tempDir = mkdtempSync(join(tmpdir(), "bask-db-adapter-"));
  context.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const stateFilePath = join(tempDir, "backend-state.json");
  const firstRepositories = createDatabaseRepositories({
    adapter: createFileDatabaseAdapter({ stateFilePath })
  });

  firstRepositories.profiles.saveProfile({
    userId: "file_db_user",
    name: "File DB User",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });
  firstRepositories.plannedWorkouts.savePlannedWorkout({
    id: "file_db_plan_1",
    userId: "file_db_user",
    date: "2026-04-15",
    type: "upper_body",
    plannedDuration: 50
  });
  firstRepositories.workouts.recordCompletedWorkout({
    id: "file_db_workout_1",
    userId: "file_db_user",
    date: "2026-04-14",
    type: "upper_body",
    plannedDuration: 50,
    completedDuration: 45,
    sessionExercises: [{ exerciseId: "barbell_bench_press", sets: 3, reps: 8 }]
  });
  firstRepositories.readinessHistory.saveReadinessHistory({
    userId: "file_db_user",
    asOf: "2026-04-15",
    recordedAt: "2026-04-15T07:00:00.000Z",
    plannedWorkoutType: "upper_body",
    sessionStyle: "normal",
    sessionDecisionStatus: "train_as_planned",
    readinessScore: 76,
    readinessBand: "high",
    dataConfidence: "medium",
    frontendCopy: {
      sessionLabel: "Normal session",
      readinessHeadline: "Train as planned.",
      primaryAction: "Start with barbell bench press."
    },
    frontendExplanation: {
      planWhy: "Run the upper-body day normally.",
      whyTodayLooksThisWay: ["No major recovery flags are standing out today."],
      focusAreas: ["Horizontal push work"],
      cautionAreas: [],
      startingExercises: ["Barbell Bench Press"]
    },
    focusMuscles: ["chest", "front_delts", "triceps"],
    limitMuscles: [],
    overworkedMuscles: [],
    recoveringMuscles: [],
    muscleGroupsToAvoidToday: [],
    primaryExerciseIds: ["barbell_bench_press"]
  });
  firstRepositories.weeklyChapterHistory.saveWeeklyChapterHistory({
    userId: "file_db_user",
    asOf: "2026-04-15",
    weekStart: "2026-04-13",
    weekEnd: "2026-04-19",
    recordedAt: "2026-04-15T12:00:00.000Z",
    reviewState: "steady",
    adaptationAction: "hold_next_week",
    chapter: {
      tone: "steady",
      title: "The week found steady ground",
      summary: "1/1 planned sessions landed this week. The week landed cleanly and should hold steady.",
      storyBeats: ["1/1 planned sessions were completed, with 0 still left open."],
      wins: ["The sessions that happened were mostly handled with good execution."],
      frictions: [],
      nextChapter: "Repeat a similar week before asking for more."
    },
    insightTitles: ["Execution quality was solid"],
    readinessEntryCount: 1
  });

  const secondRepositories = createDatabaseRepositories({
    adapter: createFileDatabaseAdapter({ stateFilePath })
  });
  const reloadedUserState = secondRepositories.exportUserState("file_db_user");

  assert.equal(reloadedUserState.profile.name, "File DB User");
  assert.equal(reloadedUserState.workouts.length, 1);
  assert.equal(reloadedUserState.plannedWorkouts[0]?.type, "upper_body");
  assert.equal(reloadedUserState.readinessHistory[0]?.primaryExerciseIds[0], "barbell_bench_press");
  assert.equal(reloadedUserState.weeklyChapterHistory[0]?.chapter.title, "The week found steady ground");
});

test("file database adapter bootstraps from the provided initial snapshot", (context) => {
  const tempDir = mkdtempSync(join(tmpdir(), "bask-db-adapter-seed-"));
  context.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const stateFilePath = join(tempDir, "backend-state.json");
  const repositories = createDatabaseRepositories({
    adapter: createFileDatabaseAdapter({
      stateFilePath,
      initialState: {
        workouts: {},
        profiles: {
          seed_user: {
            userId: "seed_user",
            name: "Seed User",
            goal: "build_consistency",
            experienceLevel: "beginner"
          }
        },
        memory: {},
        plannedWorkouts: {},
        readinessHistory: {},
        weeklyChapterHistory: {}
      }
    })
  });

  assert.equal(repositories.exportUserState("seed_user").profile.name, "Seed User");
});

test("database repository scaffold matches json repositories for a planned-day Kai payload", () => {
  const jsonRepositories = createJsonRepositories();
  const dbRepositories = createDatabaseRepositories({
    adapter: createInMemoryDatabaseAdapter()
  });

  const jsonSeeded = seedScenario({
    userId: "user_1",
    scenario: "planned_today",
    repositories: jsonRepositories
  });
  const dbSeeded = seedScenario({
    userId: "user_1",
    scenario: "planned_today",
    repositories: dbRepositories
  });

  const jsonService = createKaiService({ repositories: jsonRepositories });
  const dbService = createKaiService({ repositories: dbRepositories });
  const jsonPayload = jsonService.getKaiPayload("user_1", jsonSeeded.asOf);
  const dbPayload = dbService.getKaiPayload("user_1", dbSeeded.asOf);

  assert.deepEqual(
    {
      dashboardState: dbPayload.dashboardState,
      todayStatus: dbPayload.todayStatus,
      plannedWorkoutType: dbPayload.plannedWorkoutForDay?.type,
      weeklyPlanContext: dbPayload.weeklyPlanContext,
      kai: dbPayload.kai
    },
    {
      dashboardState: jsonPayload.dashboardState,
      todayStatus: jsonPayload.todayStatus,
      plannedWorkoutType: jsonPayload.plannedWorkoutForDay?.type,
      weeklyPlanContext: jsonPayload.weeklyPlanContext,
      kai: jsonPayload.kai
    }
  );
});

test("database repository scaffold matches json repositories for persisted weekly replans", () => {
  const jsonRepositories = createJsonRepositories();
  const dbRepositories = createDatabaseRepositories({
    adapter: createInMemoryDatabaseAdapter()
  });

  for (const repositories of [jsonRepositories, dbRepositories]) {
    repositories.profiles.saveProfile({
      userId: "user_1",
      name: "Oliver",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 4,
      preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
      preferredSessionLength: 55,
      trainingStylePreference: "balanced"
    });
    repositories.plannedWorkouts.replacePlannedWorkoutsInRange(
      "user_1",
      "2026-03-24",
      "2026-03-29",
      [
        {
          id: "planned_a",
          userId: "user_1",
          date: "2026-03-24",
          type: "upper_body",
          plannedDuration: 55
        },
        {
          id: "planned_b",
          userId: "user_1",
          date: "2026-03-26",
          type: "upper_body",
          plannedDuration: 55
        }
      ]
    );
    repositories.workouts.recordMissedWorkout({
      id: "missed_1",
      userId: "user_1",
      date: "2026-03-24",
      recordedAt: "2026-03-24T07:00:00.000Z",
      type: "upper_body",
      plannedDuration: 55
    });
  }

  const jsonService = createKaiService({ repositories: jsonRepositories });
  const dbService = createKaiService({ repositories: dbRepositories });
  jsonService.persistCurrentWeekReplan("user_1", "2026-03-25");
  dbService.persistCurrentWeekReplan("user_1", "2026-03-25");

  const jsonWeeklyPayload = jsonService.getKaiWeeklyPayload("user_1", "2026-03-25");
  const dbWeeklyPayload = dbService.getKaiWeeklyPayload("user_1", "2026-03-25");

  assert.deepEqual(
    {
      currentWeekReplan: {
        ...dbWeeklyPayload.currentWeekReplan,
        appliedAt: Boolean(dbWeeklyPayload.currentWeekReplan?.appliedAt)
      },
      weeklyDecisionLog: dbWeeklyPayload.weeklyDecisionLog.map((entry) => ({
        ...entry,
        occurredAt: Boolean(entry.occurredAt)
      })),
      plannedWorkouts: dbRepositories.plannedWorkouts.getPlannedWorkouts("user_1").map(
        (workout) => ({
          ...workout,
          replan: workout.replan
            ? {
                ...workout.replan,
                appliedAt: Boolean(workout.replan.appliedAt)
              }
            : undefined
        })
      )
    },
    {
      currentWeekReplan: {
        ...jsonWeeklyPayload.currentWeekReplan,
        appliedAt: Boolean(jsonWeeklyPayload.currentWeekReplan?.appliedAt)
      },
      weeklyDecisionLog: jsonWeeklyPayload.weeklyDecisionLog.map((entry) => ({
        ...entry,
        occurredAt: Boolean(entry.occurredAt)
      })),
      plannedWorkouts: jsonRepositories.plannedWorkouts.getPlannedWorkouts("user_1").map(
        (workout) => ({
          ...workout,
          replan: workout.replan
            ? {
                ...workout.replan,
                appliedAt: Boolean(workout.replan.appliedAt)
              }
            : undefined
        })
      )
    }
  );
});
