import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildTrainingReadinessReport } from "../exercises/readiness.js";
import { getExerciseById } from "../exercises/library.js";
import type {
  ExerciseSubstitutionOption,
  SessionEffort,
  SessionPlan,
  WorkoutExerciseEntry
} from "../exercises/types.js";
import { toPlannedWorkouts } from "../kai/planner.js";
import { createKaiService } from "../kai/service.js";
import type {
  KaiUserProfile,
  KaiWeeklyPlan,
  WorkoutCompletionInput,
  WorkoutExecutionFeedback,
  WorkoutMissedInput
} from "../kai/types.js";
import { createJsonRepositories } from "../store/repositories.js";

const START_DATE = "2026-01-05";
const TOTAL_DAYS = 56;

const PERSONAS: PersonaConfig[] = [
  {
    id: "sim_beginner_consistency",
    profile: {
      userId: "sim_beginner_consistency",
      name: "Nora",
      goal: "build_consistency",
      experienceLevel: "beginner",
      targetSessionsPerWeek: 3,
      preferredWorkoutDays: ["monday", "wednesday", "friday"],
      preferredSessionLength: 40,
      focusMuscles: ["glutes", "chest"]
    },
    style: "beginner_consistency"
  },
  {
    id: "sim_intermediate_ppl",
    profile: {
      userId: "sim_intermediate_ppl",
      name: "Mika",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 6,
      preferredWorkoutDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
      preferredSessionLength: 55,
      focusMuscles: ["chest", "lats"]
    },
    style: "intermediate_ppl"
  },
  {
    id: "sim_intermediate_full_body",
    profile: {
      userId: "sim_intermediate_full_body",
      name: "Iris",
      goal: "get_fitter",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 3,
      preferredWorkoutDays: ["monday", "wednesday", "friday"],
      preferredSessionLength: 50,
      focusMuscles: ["quads", "upper_back"]
    },
    style: "intermediate_full_body"
  },
  {
    id: "sim_intermediate_resetting_split",
    profile: {
      userId: "sim_intermediate_resetting_split",
      name: "Jonah",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 4,
      preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
      preferredSessionLength: 45,
      trainingStylePreference: "split_routine",
      confidenceLevel: "low",
      focusMuscles: ["lats", "chest"],
      painFlags: ["front_delts"],
      favoriteExerciseIds: ["lat_pulldown", "chest_supported_machine_row"],
      dislikedExerciseIds: ["overhead_shoulder_press"]
    },
    style: "intermediate_resetting_split"
  },
  {
    id: "sim_intermediate_steady_upper_lower",
    profile: {
      userId: "sim_intermediate_steady_upper_lower",
      name: "Leah",
      goal: "build_muscle",
      experienceLevel: "intermediate",
      targetSessionsPerWeek: 4,
      preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
      preferredSessionLength: 55,
      trainingStylePreference: "balanced",
      confidenceLevel: "high",
      focusMuscles: ["quads", "upper_back"],
      favoriteExerciseIds: ["leg_press", "chest_supported_machine_row", "lat_pulldown"]
    },
    style: "intermediate_steady_upper_lower"
  }
];

type PersonaStyle =
  | "beginner_consistency"
  | "intermediate_ppl"
  | "intermediate_full_body"
  | "intermediate_resetting_split"
  | "intermediate_steady_upper_lower";

interface PersonaConfig {
  id: string;
  profile: KaiUserProfile;
  style: PersonaStyle;
}

type SimulationMode = "adaptive" | "frozen_baseline";

interface PersonaDay {
  date: string;
  dayName: string;
  plannedWorkoutType?: string;
  progressionIntent?: string;
  weeklyReviewState?: string;
  weeklyAdaptationAction?: string;
  currentWeekReplanActive?: boolean;
  completed: boolean;
  missed: boolean;
  sessionStyle?: SessionPlan["sessionStyle"];
  completedDuration?: number;
  exerciseIds?: string[];
  kaiCategory?: string;
  outcomeSummary?: {
    mainCovered: boolean;
    supportCovered: boolean;
    coveredSlots: number;
    sessionSize: "thin" | "partial" | "full";
    durationCompletionRatio: number;
    executionQuality: "strong" | "workable" | "survival";
    followedPlannedWorkout?: boolean;
    followedSuggestedWorkoutType?: boolean;
    substitutionCount?: number;
    totalLoggedSets?: number;
    averageRestSeconds?: number;
    restInflationRatio?: number;
    repDropoffPercent?: number;
    setEffortTrend?: "stable" | "rising" | "sharp_rise";
  };
}

interface PersonaSummary {
  userId: string;
  name: string;
  goal: string;
  experienceLevel: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  plannedTrainingDays: number;
  completedTrainingDays: number;
  missedTrainingDays: number;
  restDays: number;
  adherencePercent: number;
  sessionStyles: Record<string, number>;
  progressionIntents: Record<string, number>;
  progressionCueActions: Record<string, number>;
  progressionCueExercises: Record<string, number>;
  guardedProgressionActions: Record<string, number>;
  guardedProgressionTargets: Record<string, number>;
  guardrailPressurePercent: number;
  progressionVelocityPercent: number;
  coachingEffectivenessScore: number;
  plannedBuildDays: number;
  completedBuildDays: number;
  strongBuildDays: number;
  workableBuildDays: number;
  recentExerciseHistory: Record<string, number>;
  setFatigueSignals: Record<string, number>;
  executionAlignment: Record<string, number>;
  weeklyReviewStates: Record<string, number>;
  weeklyReviewTrajectory:
    | "progressing"
    | "plateaued"
    | "oscillating"
    | "declining"
    | "insufficient_data";
  weeklyAdaptationActions: Record<string, number>;
  kaiCategories: Record<string, number>;
  activeReplanDays: number;
  latestConsistencyScore: number;
  latestConsistencyStatus: string;
  longestStreak: number;
}

interface PersonaReport {
  persona: PersonaSummary;
  weeks: Array<{
    weekStart: string;
    targetSessions: number;
    splitStyle: KaiWeeklyPlan["splitStyle"];
    weeklyReviewState?: string;
    weeklyAdaptationAction?: string;
    currentWeekReplanActive?: boolean;
    weeklyInsightTitles: string[];
    weeklyProgressionActions: Record<string, number>;
    weeklyGuardedProgressionActions: Record<string, number>;
    weeklyGuardedProgressionTargets: Record<string, number>;
    weeklyExerciseActions: Array<{
      exerciseId: string;
      name: string;
      action: "progress" | "repeat" | "hold_back";
      occurrences: number;
    }>;
    weeklyRecentExercises: Array<{
      exerciseId: string;
      name: string;
      appearances: number;
      executionQuality: "strong" | "workable" | "survival";
      followedPlannedRate?: number;
      followedSuggestedRate?: number;
      averageSubstitutionCount?: number;
    }>;
    rationale: string;
  }>;
  days: PersonaDay[];
}

interface CohortReport {
  generatedAt: string;
  startDate: string;
  endDate: string;
  baselinePersonas?: PersonaReport[];
  comparison: {
    adherenceRanking: Array<{
      userId: string;
      name: string;
      adherencePercent: number;
    }>;
    progressionVelocityRanking: Array<{
      userId: string;
      name: string;
      progressionVelocityPercent: number;
    }>;
    coachingEffectivenessRanking: Array<{
      userId: string;
      name: string;
      coachingEffectivenessScore: number;
      adherencePercent: number;
      progressionVelocityPercent: number;
      guardrailPressurePercent: number;
    }>;
    counterfactualGaps: Array<{
      userId: string;
      name: string;
      mode: "adaptive_vs_frozen_baseline";
      adaptive: {
        adherencePercent: number;
        progressionVelocityPercent: number;
        coachingEffectivenessScore: number;
      };
      baseline: {
        adherencePercent: number;
        progressionVelocityPercent: number;
        coachingEffectivenessScore: number;
      };
      delta: {
        adherencePercent: number;
        progressionVelocityPercent: number;
        coachingEffectivenessScore: number;
      };
    }>;
    weeklyPlanDrift: Array<{
      userId: string;
      name: string;
      firstWeekTargetSessions: number;
      lastWeekTargetSessions: number;
      firstWeekSplitStyle: KaiWeeklyPlan["splitStyle"];
      lastWeekSplitStyle: KaiWeeklyPlan["splitStyle"];
      conservativeWeeks: number;
      buildWeeks: number;
      activeReplanWeeks: number;
    }>;
  };
  personas: PersonaReport[];
}

interface SimulatedSetContext {
  style: PersonaStyle;
  date: string;
  plannedWorkoutType: string;
  progressionIntent?: string;
  weeklyReviewState?: string;
  currentWeekReplanActive?: boolean;
  sessionStyle: SessionPlan["sessionStyle"];
  isMain: boolean;
  exerciseIndex: number;
}

runSimulation();

function runSimulation(): void {
  const personas = PERSONAS.map((config) =>
    runPersonaSimulation(config, "adaptive")
  );
  const baselinePersonas = PERSONAS.map((config) =>
    runPersonaSimulation(config, "frozen_baseline")
  );
  const report: CohortReport = {
    generatedAt: new Date().toISOString(),
    startDate: START_DATE,
    endDate: addDays(START_DATE, TOTAL_DAYS - 1),
    baselinePersonas,
    comparison: buildComparison(personas, baselinePersonas),
    personas
  };

  const reportDir = join(process.cwd(), "reports");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, "two-month-cohort-simulation.json");
  const summaryPath = join(reportDir, "two-month-cohort-summary.md");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(summaryPath, buildMarkdownSummary(report));

  console.log(`Saved cohort simulation report to ${reportPath}`);
  console.log(`Saved cohort simulation summary to ${summaryPath}`);
  console.log("");
  console.log("Persona summaries");
  console.log(
    JSON.stringify(
      personas.map((entry) => entry.persona),
      null,
      2
    )
  );
  console.log("");
  console.log("Comparison");
  console.log(JSON.stringify(report.comparison, null, 2));
}

function runPersonaSimulation(
  config: PersonaConfig,
  mode: SimulationMode
): PersonaReport {
  const root = join(
    tmpdir(),
    `bask-cohort-${mode}-${config.id}-${Date.now()}`
  );
  const repositories = createJsonRepositories({
    workoutsStorageFilePath: join(root, "workouts.json"),
    profilesStorageFilePath: join(root, "profiles.json"),
    memoryStorageFilePath: join(root, "memory.json"),
    plannedWorkoutsStorageFilePath: join(root, "planned.json")
  });
  const store = repositories.workouts;
  const profileStore = repositories.profiles;
  const memoryStore = repositories.memory;
  const plannedWorkoutStore = repositories.plannedWorkouts;
  const kaiService = createKaiService({
    repositories
  });

  const profile = profileStore.saveProfile(config.profile);
  const days: PersonaDay[] = [];
  const weeks: PersonaReport["weeks"] = [];
  let replanQueuedForDate: string | undefined;
  let currentWeekPlanDays = new Map<string, KaiWeeklyPlan["days"][number]>();
  let frozenBaselineBlueprint:
    | Array<{
        dayKey: string;
        workoutType: string;
        plannedDuration: number;
        progressionIntent?: KaiWeeklyPlan["days"][number]["progressionIntent"];
        exerciseIntent?: KaiWeeklyPlan["days"][number]["exerciseIntent"];
        sessionTemplate?: KaiWeeklyPlan["days"][number]["sessionTemplate"];
      }>
    | undefined;
  let frozenBaselineSplitStyle: KaiWeeklyPlan["splitStyle"] = "full_body";
  let frozenBaselineTargetSessions = Math.max(
    2,
    Math.min(profile.targetSessionsPerWeek ?? 3, 6)
  );

  for (let dayIndex = 0; dayIndex < TOTAL_DAYS; dayIndex += 1) {
    const date = addDays(START_DATE, dayIndex);
    const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();

    if (mode === "adaptive" && replanQueuedForDate === date) {
      kaiService.persistCurrentWeekReplan(config.id, date, profile);
      replanQueuedForDate = undefined;
    }

    if (dayOfWeek === 1) {
      if (mode === "adaptive") {
        const weeklyPlan = kaiService.getKaiWeeklyPlan(config.id, date, profile);
        const weeklyPayload = kaiService.getKaiWeeklyPayload(config.id, date, profile);
        currentWeekPlanDays = new Map(
          weeklyPlan.days.map((day) => [day.date, day])
        );
        weeks.push({
          weekStart: weeklyPlan.weekStart,
          targetSessions: weeklyPlan.targetSessions,
          splitStyle: weeklyPlan.splitStyle,
          weeklyReviewState: weeklyPayload.weeklyReview.state,
          weeklyAdaptationAction: weeklyPayload.weeklyReview.adaptationAction,
          currentWeekReplanActive: weeklyPayload.currentWeekReplan?.active,
          weeklyInsightTitles: weeklyPayload.weeklyInsights.map((insight) => insight.title),
          weeklyProgressionActions: countBy(
            weeklyPayload.weeklyProgressionHighlights.map((highlight) => highlight.action)
          ),
          weeklyGuardedProgressionActions: countBy(
            weeklyPayload.weeklyProgressionHighlights
              .filter((highlight) =>
                highlight.reason.toLowerCase().includes("set-level strain")
              )
              .map((highlight) => highlight.action)
          ),
          weeklyGuardedProgressionTargets: countBy(
            weeklyPayload.weeklyProgressionHighlights
              .filter((highlight) =>
                highlight.reason.toLowerCase().includes("set-level strain")
              )
              .map((highlight) => `${highlight.label}:${highlight.action}`)
          ),
          weeklyExerciseActions: weeklyPayload.weeklyExerciseInsights.map((insight) => ({
            exerciseId: insight.exerciseId,
            name: insight.name,
            action: insight.action,
            occurrences: insight.occurrences
          })),
          weeklyRecentExercises: weeklyPayload.recentExerciseHistory.map((entry) => ({
            exerciseId: entry.exerciseId,
            name: entry.name,
            appearances: entry.appearances,
            executionQuality: entry.executionQuality,
            followedPlannedRate: entry.followedPlannedRate,
            followedSuggestedRate: entry.followedSuggestedRate,
            averageSubstitutionCount: entry.averageSubstitutionCount
          })),
          rationale: weeklyPlan.rationale
        });
        plannedWorkoutStore.replacePlannedWorkoutsInRange(
          config.id,
          weeklyPlan.weekStart,
          weeklyPlan.weekEnd,
          toPlannedWorkouts(weeklyPlan, {
            replan: {
              source: "weekly_plan_generation",
              appliedAt: `${date}T06:00:00.000Z`,
              reason: "Generated from the current weekly plan."
            }
          }).map((workout, index) => ({
            ...workout,
            id: `week_${weeklyPlan.weekStart}_${index + 1}`
          }))
        );
      } else {
        const weeklyPayload = kaiService.getKaiWeeklyPayload(config.id, date, profile);
        const weekStart = getWeekStart(date);
        const weekEnd = addDays(weekStart, 6);

        if (!frozenBaselineBlueprint) {
          const seedPlan = kaiService.getKaiWeeklyPlan(config.id, date, profile);
          frozenBaselineSplitStyle = seedPlan.splitStyle;
          frozenBaselineTargetSessions = seedPlan.targetSessions;
          frozenBaselineBlueprint = seedPlan.days
            .filter((day) => day.status === "planned" && day.workoutType)
            .map((day) => ({
              dayKey: toWorkoutDayKey(day.date),
              workoutType: day.workoutType!,
              plannedDuration: day.plannedDuration ?? 50,
              progressionIntent: day.progressionIntent,
              exerciseIntent: day.exerciseIntent,
              sessionTemplate: day.sessionTemplate
            }));
        }

        const frozenWeekDays = buildFrozenBaselineWeekDays(
          weekStart,
          frozenBaselineBlueprint ?? []
        );
        currentWeekPlanDays = new Map(
          frozenWeekDays.map((day) => [day.date, day])
        );
        weeks.push({
          weekStart,
          targetSessions: frozenBaselineTargetSessions,
          splitStyle: frozenBaselineSplitStyle,
          weeklyReviewState: weeklyPayload.weeklyReview.state,
          weeklyAdaptationAction: weeklyPayload.weeklyReview.adaptationAction,
          currentWeekReplanActive: false,
          weeklyInsightTitles: [],
          weeklyProgressionActions: {},
          weeklyGuardedProgressionActions: {},
          weeklyGuardedProgressionTargets: {},
          weeklyExerciseActions: [],
          weeklyRecentExercises: weeklyPayload.recentExerciseHistory.map((entry) => ({
            exerciseId: entry.exerciseId,
            name: entry.name,
            appearances: entry.appearances,
            executionQuality: entry.executionQuality,
            followedPlannedRate: entry.followedPlannedRate,
            followedSuggestedRate: entry.followedSuggestedRate,
            averageSubstitutionCount: entry.averageSubstitutionCount
          })),
          rationale:
            "Baseline frozen weekly structure (non-adaptive control): no live replans, no recommendation-memory carryover."
        });
        plannedWorkoutStore.replacePlannedWorkoutsInRange(
          config.id,
          weekStart,
          weekEnd,
          frozenWeekDays
            .filter((day) => day.status === "planned" && day.workoutType)
            .map((day, index) => ({
              id: `week_frozen_${weekStart}_${index + 1}`,
              userId: config.id,
              date: day.date,
              type: day.workoutType!,
              plannedDuration: day.plannedDuration ?? 50,
              replan: {
                source: "weekly_plan_generation" as const,
                appliedAt: `${date}T06:00:00.000Z`,
                reason: "Generated from the frozen baseline plan."
              }
            }))
        );
      }
    }

    const plannedWorkout = plannedWorkoutStore.findPlannedWorkout(config.id, date);
    const planDay = currentWeekPlanDays.get(date);
    const weeklyPayload = kaiService.getKaiWeeklyPayload(config.id, date, profile);
    const kaiPayload = kaiService.getKaiPayload(config.id, date, profile);

    if (!plannedWorkout || !planDay || planDay.status !== "planned") {
      days.push({
        date,
        dayName: formatDayName(dayOfWeek),
        weeklyReviewState: weeklyPayload.weeklyReview.state,
        weeklyAdaptationAction: weeklyPayload.weeklyReview.adaptationAction,
        currentWeekReplanActive: weeklyPayload.currentWeekReplan?.active,
        completed: false,
        missed: false,
        kaiCategory: kaiPayload.kai.category
      });
      continue;
    }

    const compatiblePlanDay =
      planDay.workoutType === plannedWorkout.type
        ? planDay
        : {
            ...planDay,
            workoutType: plannedWorkout.type,
            plannedDuration: plannedWorkout.plannedDuration,
            exerciseIntent: undefined,
            sessionTemplate: undefined
          };

    const readiness = buildTrainingReadinessReport(
      config.id,
      store.getWorkouts(config.id),
      date,
      plannedWorkout.type,
      profile.experienceLevel,
      mode === "adaptive"
        ? memoryStore.getMemory(config.id)?.recommendationMemory
        : undefined,
      {
        goal: profile.goal,
        focusMuscles: profile.focusMuscles,
        favoriteExerciseIds: profile.favoriteExerciseIds,
        dislikedExerciseIds: profile.dislikedExerciseIds,
        painFlags: profile.painFlags,
        plannedFocusMuscles: compatiblePlanDay.exerciseIntent?.focusMuscles,
        plannedAvoidMuscles: compatiblePlanDay.exerciseIntent?.avoidMuscles,
        plannedPreferredExerciseIds: compatiblePlanDay.exerciseIntent?.preferredExerciseIds
      },
      {
        isPlannedDay: true,
        progressionIntent: compatiblePlanDay.progressionIntent,
        exerciseIntent: compatiblePlanDay.exerciseIntent,
        sessionTemplate: compatiblePlanDay.sessionTemplate
      }
    );

    if (
      shouldMissWorkout(
        config.style,
        date,
        readiness.sessionPlan.sessionStyle,
        planDay.progressionIntent,
        plannedWorkout.plannedDuration,
        plannedWorkout.type
      )
    ) {
      const missedInput: WorkoutMissedInput = {
        id: `missed_${config.id}_${date}`,
        userId: config.id,
        date,
        recordedAt: `${date}T20:00:00.000Z`,
        type: plannedWorkout.type,
        plannedDuration: plannedWorkout.plannedDuration
      };
      store.recordMissedWorkout(missedInput);
      if (mode === "adaptive") {
        replanQueuedForDate = addDays(date, 1);
      }

      const nextKaiPayload = kaiService.getKaiPayload(config.id, date, profile);
      days.push({
        date,
        dayName: formatDayName(dayOfWeek),
        plannedWorkoutType: plannedWorkout.type,
        progressionIntent: planDay.progressionIntent,
        weeklyReviewState: weeklyPayload.weeklyReview.state,
        weeklyAdaptationAction: weeklyPayload.weeklyReview.adaptationAction,
        currentWeekReplanActive:
          mode === "adaptive" ? weeklyPayload.currentWeekReplan?.active : false,
        completed: false,
        missed: true,
        sessionStyle: readiness.sessionPlan.sessionStyle,
        kaiCategory: nextKaiPayload.kai.category
      });
      continue;
    }

    const simulatedSession = buildSimulatedSession(
      {
        style: config.style,
        date,
        plannedWorkoutType: plannedWorkout.type,
        progressionIntent: planDay.progressionIntent,
        weeklyReviewState: weeklyPayload.weeklyReview.state,
        currentWeekReplanActive:
          mode === "adaptive" ? weeklyPayload.currentWeekReplan?.active : false
      },
      readiness.sessionPlan,
      readiness.substitutionOptions
    );

    const completedInput: WorkoutCompletionInput = {
      id: `completed_${config.id}_${date}`,
      userId: config.id,
      date,
      recordedAt: `${date}T18:00:00.000Z`,
      type: plannedWorkout.type,
      plannedDuration: plannedWorkout.plannedDuration,
      completedDuration: simulatedSession.completedDuration,
      sessionExercises: simulatedSession.sessionExercises,
      executionFeedback: simulatedSession.executionFeedback
    };
    store.recordCompletedWorkout(completedInput);

    const nextKaiPayload = kaiService.getKaiPayload(config.id, date, profile);
    days.push({
      date,
      dayName: formatDayName(dayOfWeek),
      plannedWorkoutType: plannedWorkout.type,
      progressionIntent: planDay.progressionIntent,
      weeklyReviewState: weeklyPayload.weeklyReview.state,
      weeklyAdaptationAction: weeklyPayload.weeklyReview.adaptationAction,
      currentWeekReplanActive:
        mode === "adaptive" ? weeklyPayload.currentWeekReplan?.active : false,
      completed: true,
      missed: false,
      sessionStyle: readiness.sessionPlan.sessionStyle,
      completedDuration: simulatedSession.completedDuration,
      exerciseIds: simulatedSession.sessionExercises.map((entry) => entry.exerciseId),
      kaiCategory: nextKaiPayload.kai.category,
      outcomeSummary: store
        .getWorkouts(config.id)
        .find((workout) => workout.id === completedInput.id)?.outcomeSummary
    });
  }

  const lastDate = addDays(START_DATE, TOTAL_DAYS - 1);
  const finalSignals = store.getBehaviorSignals(config.id, lastDate);
  const plannedTrainingDays = days.filter((day) => Boolean(day.plannedWorkoutType)).length;
  const completedTrainingDays = days.filter((day) => day.completed).length;
  const missedTrainingDays = days.filter((day) => day.missed).length;
  const adherencePercent =
    plannedTrainingDays === 0
      ? 0
      : Math.round((completedTrainingDays / plannedTrainingDays) * 100);
  const progressionVelocity = summarizeProgressionVelocity(days);
  const weeklyReviewTrajectory = classifyWeeklyReviewTrajectory(weeks);
  const progressionCueActions = countBy(
    weeks.flatMap((week) =>
      Object.entries(week.weeklyProgressionActions).flatMap(([action, count]) =>
        Array.from({ length: count }, () => action)
      )
    )
  );
  const guardedProgressionActions = countBy(
    weeks.flatMap((week) =>
      Object.entries(week.weeklyGuardedProgressionActions).flatMap(([action, count]) =>
        Array.from({ length: count }, () => action)
      )
    )
  );
  const earnedProgressCueCount = progressionCueActions.progress ?? 0;
  const guardedCueTotal = sumCountMap(guardedProgressionActions);
  const guardrailPressurePercent =
    guardedCueTotal + earnedProgressCueCount === 0
      ? 0
      : Math.round(
          (guardedCueTotal / (guardedCueTotal + earnedProgressCueCount)) * 100
        );
  const coachingEffectivenessScore = scoreCoachingEffectiveness({
    adherencePercent,
    progressionVelocityPercent: progressionVelocity.progressionVelocityPercent,
    guardrailPressurePercent,
    plannedBuildDays: progressionVelocity.plannedBuildDays,
    goal: profile.goal,
    experienceLevel: profile.experienceLevel
  });

  return {
    persona: {
      userId: config.id,
      name: profile.name,
      goal: profile.goal,
      experienceLevel: profile.experienceLevel,
      startDate: START_DATE,
      endDate: lastDate,
      totalDays: TOTAL_DAYS,
      plannedTrainingDays,
      completedTrainingDays,
      missedTrainingDays,
      restDays: TOTAL_DAYS - plannedTrainingDays,
      adherencePercent,
      sessionStyles: countBy(
        days.map((day) => day.sessionStyle).filter(Boolean) as string[]
      ),
      progressionIntents: countBy(
        days.map((day) => day.progressionIntent).filter(Boolean) as string[]
      ),
      progressionCueActions,
      progressionCueExercises: countBy(
        weeks.flatMap((week) =>
          week.weeklyExerciseActions.flatMap((entry) =>
            Array.from(
              { length: entry.occurrences },
              () => `${entry.name}:${entry.action}`
            )
          )
        )
      ),
      guardedProgressionActions,
      guardedProgressionTargets: countBy(
        weeks.flatMap((week) =>
          Object.entries(week.weeklyGuardedProgressionTargets).flatMap(([target, count]) =>
            Array.from({ length: count }, () => target)
          )
        )
      ),
      guardrailPressurePercent,
      progressionVelocityPercent: progressionVelocity.progressionVelocityPercent,
      coachingEffectivenessScore,
      plannedBuildDays: progressionVelocity.plannedBuildDays,
      completedBuildDays: progressionVelocity.completedBuildDays,
      strongBuildDays: progressionVelocity.strongBuildDays,
      workableBuildDays: progressionVelocity.workableBuildDays,
      recentExerciseHistory: countBy(
        weeks.flatMap((week) =>
          week.weeklyRecentExercises.flatMap((entry) =>
            Array.from(
              { length: entry.appearances },
              () => `${entry.name}:${entry.executionQuality}`
            )
          )
        )
      ),
      setFatigueSignals: countBy(
        days
          .filter((day) => day.outcomeSummary)
          .flatMap((day) => {
            const tags: string[] = [];
            if (
              day.outcomeSummary?.setEffortTrend === "rising" ||
              day.outcomeSummary?.setEffortTrend === "sharp_rise"
            ) {
              tags.push("effort_rise");
            }
            if ((day.outcomeSummary?.restInflationRatio ?? 0) >= 1.2) {
              tags.push("rest_inflation");
            }
            if ((day.outcomeSummary?.repDropoffPercent ?? 0) >= 18) {
              tags.push("rep_dropoff");
            }
            if (!tags.length) {
              tags.push("none_flagged");
            }
            return tags;
          })
      ),
      executionAlignment: countBy(
        days
          .filter((day) => day.outcomeSummary)
          .flatMap((day) => {
            const tags: string[] = [];
            if (day.outcomeSummary?.followedPlannedWorkout) {
              tags.push("followed_planned");
            }
            if (day.outcomeSummary?.followedSuggestedWorkoutType) {
              tags.push("followed_suggested");
            }
            if ((day.outcomeSummary?.substitutionCount ?? 0) > 0) {
              tags.push("used_substitutions");
            }
            if (tags.length === 0) {
              tags.push("no_explicit_alignment");
            }
            return tags;
          })
      ),
      weeklyReviewStates: countBy(
        days.map((day) => day.weeklyReviewState).filter(Boolean) as string[]
      ),
      weeklyReviewTrajectory,
      weeklyAdaptationActions: countBy(
        days.map((day) => day.weeklyAdaptationAction).filter(Boolean) as string[]
      ),
      kaiCategories: countBy(
        days.map((day) => day.kaiCategory).filter(Boolean) as string[]
      ),
      activeReplanDays: days.filter((day) => day.currentWeekReplanActive).length,
      latestConsistencyScore: finalSignals.consistencyScore,
      latestConsistencyStatus: finalSignals.consistencyStatus,
      longestStreak: finalSignals.longestStreak
    },
    weeks,
    days
  };
}

function buildFrozenBaselineWeekDays(
  weekStart: string,
  blueprint: Array<{
    dayKey: string;
    workoutType: string;
    plannedDuration: number;
    progressionIntent?: KaiWeeklyPlan["days"][number]["progressionIntent"];
    exerciseIntent?: KaiWeeklyPlan["days"][number]["exerciseIntent"];
    sessionTemplate?: KaiWeeklyPlan["days"][number]["sessionTemplate"];
  }>
): KaiWeeklyPlan["days"] {
  const byDayKey = new Map(blueprint.map((entry) => [entry.dayKey, entry]));

  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(weekStart, offset);
    const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const dayKey = toWorkoutDayKey(date);
    const planned = byDayKey.get(dayKey);

    if (!planned) {
      return {
        date,
        dayName: formatDayName(dayOfWeek),
        status: "rest" as const,
        rationale: "Baseline frozen structure keeps this as a rest day."
      };
    }

    return {
      date,
      dayName: formatDayName(dayOfWeek),
      status: "planned" as const,
      workoutType: planned.workoutType,
      plannedDuration: planned.plannedDuration,
      progressionIntent: planned.progressionIntent,
      exerciseIntent: planned.exerciseIntent,
      sessionTemplate: planned.sessionTemplate,
      rationale:
        "Baseline frozen structure: this day repeats the same planned pattern each week."
    };
  });
}

function buildComparison(
  personas: PersonaReport[],
  baselinePersonas: PersonaReport[]
): CohortReport["comparison"] {
  const baselineByUserId = new Map(
    baselinePersonas.map((entry) => [entry.persona.userId, entry])
  );

  return {
    adherenceRanking: [...personas]
      .sort((left, right) => right.persona.adherencePercent - left.persona.adherencePercent)
      .map((entry) => ({
        userId: entry.persona.userId,
        name: entry.persona.name,
        adherencePercent: entry.persona.adherencePercent
      })),
    progressionVelocityRanking: [...personas]
      .sort(
        (left, right) =>
          right.persona.progressionVelocityPercent -
          left.persona.progressionVelocityPercent
      )
      .map((entry) => ({
        userId: entry.persona.userId,
        name: entry.persona.name,
        progressionVelocityPercent: entry.persona.progressionVelocityPercent
      })),
    coachingEffectivenessRanking: [...personas]
      .sort(
        (left, right) =>
          right.persona.coachingEffectivenessScore -
          left.persona.coachingEffectivenessScore
      )
      .map((entry) => ({
        userId: entry.persona.userId,
        name: entry.persona.name,
        coachingEffectivenessScore: entry.persona.coachingEffectivenessScore,
        adherencePercent: entry.persona.adherencePercent,
        progressionVelocityPercent: entry.persona.progressionVelocityPercent,
        guardrailPressurePercent: entry.persona.guardrailPressurePercent
      })),
    counterfactualGaps: personas
      .map((entry) => {
        const baseline = baselineByUserId.get(entry.persona.userId)?.persona;
        if (!baseline) {
          return undefined;
        }

        return {
          userId: entry.persona.userId,
          name: entry.persona.name,
          mode: "adaptive_vs_frozen_baseline" as const,
          adaptive: {
            adherencePercent: entry.persona.adherencePercent,
            progressionVelocityPercent: entry.persona.progressionVelocityPercent,
            coachingEffectivenessScore: entry.persona.coachingEffectivenessScore
          },
          baseline: {
            adherencePercent: baseline.adherencePercent,
            progressionVelocityPercent: baseline.progressionVelocityPercent,
            coachingEffectivenessScore: baseline.coachingEffectivenessScore
          },
          delta: {
            adherencePercent:
              entry.persona.adherencePercent - baseline.adherencePercent,
            progressionVelocityPercent:
              entry.persona.progressionVelocityPercent -
              baseline.progressionVelocityPercent,
            coachingEffectivenessScore:
              entry.persona.coachingEffectivenessScore -
              baseline.coachingEffectivenessScore
          }
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          (right?.delta.coachingEffectivenessScore ?? 0) -
          (left?.delta.coachingEffectivenessScore ?? 0)
      ) as CohortReport["comparison"]["counterfactualGaps"],
    weeklyPlanDrift: personas.map((entry) => ({
      userId: entry.persona.userId,
      name: entry.persona.name,
      firstWeekTargetSessions: entry.weeks[0]?.targetSessions ?? 0,
      lastWeekTargetSessions: entry.weeks.at(-1)?.targetSessions ?? 0,
      firstWeekSplitStyle: entry.weeks[0]?.splitStyle ?? "full_body",
      lastWeekSplitStyle: entry.weeks.at(-1)?.splitStyle ?? "full_body",
      conservativeWeeks: entry.weeks.filter((week) =>
        week.rationale.toLowerCase().includes("simplified") ||
        week.rationale.toLowerCase().includes("easier to finish")
      ).length,
      buildWeeks: entry.weeks.filter((week) =>
        week.rationale.toLowerCase().includes("earned a slightly fuller week")
      ).length,
      activeReplanWeeks: countDistinctWeekStarts(
        entry.days
          .filter((day) => day.currentWeekReplanActive)
          .map((day) => getWeekStart(day.date))
      )
    }))
  };
}

function buildMarkdownSummary(report: CohortReport): string {
  const lines: string[] = [
    "# Two-Month Cohort Simulation",
    "",
    `Generated: ${report.generatedAt}`,
    `Window: ${report.startDate} to ${report.endDate}`,
    "",
    "## Topline",
    ""
  ];

  for (const entry of report.comparison.adherenceRanking) {
    lines.push(`- ${entry.name}: ${entry.adherencePercent}% adherence`);
  }

  lines.push("", "## Progression Velocity", "");

  for (const entry of report.comparison.progressionVelocityRanking) {
    lines.push(`- ${entry.name}: ${entry.progressionVelocityPercent}%`);
  }

  lines.push("", "## Coaching Effectiveness (Composite)", "");

  for (const entry of report.comparison.coachingEffectivenessRanking) {
    lines.push(
      `- ${entry.name}: ${entry.coachingEffectivenessScore} (adherence ${entry.adherencePercent}%, progression ${entry.progressionVelocityPercent}%, guardrail pressure ${entry.guardrailPressurePercent}%)`
    );
  }

  lines.push("", "## Counterfactual (Adaptive vs Frozen Baseline)", "");

  for (const entry of report.comparison.counterfactualGaps) {
    lines.push(
      `- ${entry.name}: score Δ ${formatSignedNumber(entry.delta.coachingEffectivenessScore)}, adherence Δ ${formatSignedNumber(entry.delta.adherencePercent)}%, progression Δ ${formatSignedNumber(entry.delta.progressionVelocityPercent)}%`
    );
  }

  lines.push("", "## Weekly Drift", "");

  for (const entry of report.comparison.weeklyPlanDrift) {
    lines.push(
      `- ${entry.name}: ${entry.firstWeekSplitStyle} ${entry.firstWeekTargetSessions} -> ${entry.lastWeekSplitStyle} ${entry.lastWeekTargetSessions}, conservative weeks ${entry.conservativeWeeks}, build weeks ${entry.buildWeeks}, active replan weeks ${entry.activeReplanWeeks}`
    );
  }

  lines.push("", "## Persona Readouts", "");

  for (const persona of report.personas) {
    const summary = persona.persona;
    const outcomeStats = summarizeOutcomeStats(persona.days);
    const coachingRead = buildPersonaCoachingRead(summary, outcomeStats, persona.weeks);

    lines.push(`### ${summary.name}`);
    lines.push("");
    lines.push(`- Goal: ${summary.goal}`);
    lines.push(`- Experience: ${summary.experienceLevel}`);
    lines.push(
      `- Adherence: ${summary.adherencePercent}% (${summary.completedTrainingDays}/${summary.plannedTrainingDays} planned sessions completed)`
    );
    lines.push(
      `- Session mix: ${formatCountMap(summary.sessionStyles)}`
    );
    lines.push(
      `- Progression intents: ${formatCountMap(summary.progressionIntents)}`
    );
    lines.push(
      `- Progression cues: ${formatCountMap(summary.progressionCueActions)}`
    );
    lines.push(
      `- Progression velocity: ${summary.progressionVelocityPercent}% (${summary.completedBuildDays}/${summary.plannedBuildDays} build days completed, strong ${summary.strongBuildDays}, workable ${summary.workableBuildDays})`
    );
    lines.push(`- Coaching effectiveness score: ${summary.coachingEffectivenessScore}`);
    lines.push(
      `- Top progression lifts: ${formatTopEntries(summary.progressionCueExercises, 4)}`
    );
    lines.push(
      `- Guarded progression: ${formatCountMap(summary.guardedProgressionActions)}`
    );
    lines.push(`- Guardrail pressure: ${summary.guardrailPressurePercent}%`);
    lines.push(
      `- Guarded lifts: ${formatTopEntries(summary.guardedProgressionTargets, 4)}`
    );
    lines.push(
      `- Recent lift trends: ${formatTopEntries(summary.recentExerciseHistory, 4)}`
    );
    lines.push(
      `- Set-level fatigue: ${formatCountMap(summary.setFatigueSignals)}`
    );
    lines.push(
      `- Execution alignment: ${formatCountMap(summary.executionAlignment)}`
    );
    lines.push(
      `- Suggested-day drift: ${formatSuggestedDayDrift(persona.weeks)}`
    );
    lines.push(
      `- Weekly review states: ${formatCountMap(summary.weeklyReviewStates)}`
    );
    lines.push(`- Weekly review trajectory: ${summary.weeklyReviewTrajectory}`);
    lines.push(
      `- Weekly adaptation actions: ${formatCountMap(summary.weeklyAdaptationActions)}`
    );
    lines.push(
      `- Outcome sizes: ${formatCountMap(outcomeStats.sessionSizes)}`
    );
    lines.push(
      `- Execution quality: ${formatCountMap(outcomeStats.executionQuality)}`
    );
    lines.push(
      `- Slot coverage: main ${outcomeStats.mainCoveragePercent}% / support ${outcomeStats.supportCoveragePercent}%`
    );
    lines.push(
      `- Weekly drift: ${persona.weeks[0]?.splitStyle ?? "n/a"} ${persona.weeks[0]?.targetSessions ?? 0} -> ${persona.weeks.at(-1)?.splitStyle ?? "n/a"} ${persona.weeks.at(-1)?.targetSessions ?? 0}`
    );
    lines.push(
      `- Weekly progression drift: ${formatWeeklyProgressionDrift(persona.weeks)}`
    );
    lines.push(
      `- Weekly guarded progression drift: ${formatWeeklyGuardedProgressionDrift(persona.weeks)}`
    );
    lines.push(
      `- Weekly exercise drift: ${formatWeeklyExerciseDrift(persona.weeks)}`
    );
    lines.push(
      `- Weekly recent-lift drift: ${formatWeeklyRecentExerciseDrift(persona.weeks)}`
    );
    lines.push(
      `- Weekly insight themes: ${formatInsightTitles(persona.weeks)}`
    );
    lines.push(`- Active replan days: ${summary.activeReplanDays}`);
    lines.push(`- Read: ${coachingRead}`);
    lines.push("");
  }

  lines.push("## Quick Calls", "");
  for (const persona of report.personas) {
    lines.push(`- ${buildQuickCall(persona)}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function summarizeOutcomeStats(days: PersonaDay[]): {
  sessionSizes: Record<string, number>;
  executionQuality: Record<string, number>;
  mainCoveragePercent: number;
  supportCoveragePercent: number;
} {
  const completedWithSummary = days.filter(
    (day): day is PersonaDay & NonNullable<Pick<PersonaDay, "outcomeSummary">> =>
      day.completed && Boolean(day.outcomeSummary)
  );

  if (!completedWithSummary.length) {
    return {
      sessionSizes: {},
      executionQuality: {},
      mainCoveragePercent: 0,
      supportCoveragePercent: 0
    };
  }

  return {
    sessionSizes: countBy(
      completedWithSummary.map((day) => day.outcomeSummary!.sessionSize)
    ),
    executionQuality: countBy(
      completedWithSummary.map((day) => day.outcomeSummary!.executionQuality)
    ),
    mainCoveragePercent: Math.round(
      (completedWithSummary.filter((day) => day.outcomeSummary!.mainCovered).length /
        completedWithSummary.length) *
        100
    ),
    supportCoveragePercent: Math.round(
      (completedWithSummary.filter((day) => day.outcomeSummary!.supportCovered).length /
        completedWithSummary.length) *
        100
    )
  };
}

function countDistinctWeekStarts(weekStarts: string[]): number {
  return new Set(weekStarts).size;
}

function formatSuggestedDayDrift(weeks: PersonaReport["weeks"]): string {
  const driftTitles = weeks
    .flatMap((week) => week.weeklyInsightTitles)
    .filter((title) => title.startsWith("Suggested "));

  if (!driftTitles.length) {
    return "none";
  }

  return formatTopEntries(countBy(driftTitles), 2);
}

function buildPersonaCoachingRead(
  summary: PersonaSummary,
  outcomeStats: ReturnType<typeof summarizeOutcomeStats>,
  weeks: PersonaReport["weeks"]
): string {
  const activeReplanWeeks = countDistinctWeekStarts(
    weeks
      .filter((week) => week.currentWeekReplanActive)
      .map((week) => week.weekStart)
  );

  if (summary.adherencePercent >= 90 && (summary.sessionStyles.accessory_only ?? 0) <= 1) {
    if (summary.progressionVelocityPercent < 35 && summary.plannedBuildDays >= 4) {
      return "Adherence is high, but progression velocity is still soft. This path may be getting protected more than it needs.";
    }
    return "Strong overall. The coach is keeping the plan productive without overcollapsing sessions.";
  }

  if (summary.weeklyReviewTrajectory === "declining" && summary.adherencePercent >= 80) {
    return "Adherence is still good, but weekly momentum is drifting down. This path needs an earlier protection trigger.";
  }

  if (summary.weeklyReviewTrajectory === "oscillating") {
    return "Momentum is oscillating week to week. The coach should hold one simpler block longer before pushing progression.";
  }

  if (summary.adherencePercent < 75 && outcomeStats.supportCoveragePercent < 60) {
    return "Still a fragile path. The coach is likely asking for more support work than this persona reliably finishes.";
  }

  if (activeReplanWeeks >= 2 && summary.adherencePercent >= 80) {
    return "Adaptation looks healthy. The coach is using live replans without losing the week.";
  }

  if ((summary.sessionStyles.modified ?? 0) > (summary.sessionStyles.normal ?? 0)) {
    return "Mostly believable, but still modification-heavy. Good candidate for future progression or recovery tuning.";
  }

  if ((weeks.at(-1)?.targetSessions ?? 0) < (weeks[0]?.targetSessions ?? 0)) {
    return "Adaptive in a healthy way. The week is simplifying under pressure instead of pretending nothing changed.";
  }

  return "Reasonable overall. The coach looks stable, with no major red flags in this window.";
}

function buildQuickCall(persona: PersonaReport): string {
  const summary = persona.persona;
  const accessoryOnly = summary.sessionStyles.accessory_only ?? 0;
  const modified = summary.sessionStyles.modified ?? 0;
  const outcomeStats = summarizeOutcomeStats(persona.days);
  const earnedProgressCues = summary.progressionCueActions.progress ?? 0;
  const guardedCueTotal = sumCountMap(summary.guardedProgressionActions);
  const isBeginner = summary.experienceLevel === "beginner";
  const isConsistencyGoal = summary.goal === "build_consistency";
  const isMuscleGoal = summary.goal === "build_muscle";
  const guardrailPressurePercent =
    earnedProgressCues + guardedCueTotal === 0
      ? 0
      : Math.round((guardedCueTotal / (earnedProgressCues + guardedCueTotal)) * 100);
  const baseGuardrailWarningThreshold = isBeginner ? 85 : 70;
  const baseLowProgressThreshold = isBeginner ? 45 : 65;
  const baseHealthyProgressThreshold = isBeginner ? 45 : 60;
  const baseMinimumBuildDaysForWarning = isBeginner ? 6 : 4;
  const guardrailWarningThreshold =
    baseGuardrailWarningThreshold +
    (isConsistencyGoal ? 5 : 0) -
    (isMuscleGoal && !isBeginner ? 5 : 0);
  const lowProgressThreshold =
    baseLowProgressThreshold -
    (isConsistencyGoal ? 5 : 0) +
    (isMuscleGoal && !isBeginner ? 5 : 0);
  const healthyProgressThreshold =
    baseHealthyProgressThreshold -
    (isConsistencyGoal ? 5 : 0) +
    (isMuscleGoal && !isBeginner ? 3 : 0);
  const minimumBuildDaysForWarning =
    baseMinimumBuildDaysForWarning + (isConsistencyGoal ? 1 : 0);
  const guardedModificationWarningThreshold = isConsistencyGoal ? 75 : 65;
  const trajectory = summary.weeklyReviewTrajectory;

  if (trajectory === "declining" && summary.adherencePercent >= 80) {
    return `${summary.name} is still showing up, but weekly momentum is trending down and needs earlier protection.`;
  }

  if (trajectory === "oscillating") {
    return `${summary.name} is oscillating between states; next tuning should stabilize one repeatable block before pushing progression.`;
  }

  if (summary.adherencePercent >= 90 && accessoryOnly <= 1) {
    if (
      !isBeginner &&
      summary.progressionVelocityPercent < 35 &&
      summary.plannedBuildDays >= minimumBuildDaysForWarning
    ) {
      return `${summary.name} is consistent, but progression is still too slow for how adherent this persona is.`;
    }

    if (guardedCueTotal > 0) {
      if (
        guardrailPressurePercent >= guardrailWarningThreshold &&
        summary.progressionVelocityPercent < lowProgressThreshold &&
        summary.plannedBuildDays >= minimumBuildDaysForWarning
      ) {
        return isBeginner
          ? `${summary.name} is consistent, and the heavier guardrails are expected for this beginner path (${earnedProgressCues} progress vs ${guardedCueTotal} guarded cues).`
          : `${summary.name} is consistent, but guarded progression is outweighing earned progression (${earnedProgressCues} progress vs ${guardedCueTotal} guarded cues).`;
      }

      if (summary.progressionVelocityPercent >= healthyProgressThreshold) {
        return `${summary.name} is progressing with healthy guardrails (${earnedProgressCues} progress vs ${guardedCueTotal} guarded cues).`;
      }

      if (isBeginner) {
        return `${summary.name} is building consistency with protective guardrails, which is appropriate at this stage.`;
      }
    }

    return `${summary.name} looks production-promising for this persona.`;
  }

  if (summary.adherencePercent < 75) {
    return `${summary.name} is still the weakest path and the best candidate for future planner tuning.`;
  }

  if ((outcomeStats.executionQuality.survival ?? 0) >= 4) {
    return `${summary.name} is staying engaged, but too many sessions are landing in survival mode.`;
  }

  if (modified > (summary.sessionStyles.normal ?? 0)) {
    if (
      guardedCueTotal > 0 &&
      guardrailPressurePercent >= guardedModificationWarningThreshold
    ) {
      return isBeginner
        ? `${summary.name} is stable and protection-heavy, which is still reasonable for this stage.`
        : `${summary.name} is stable but heavily guardrailed (${earnedProgressCues} progress vs ${guardedCueTotal} guarded cues), so next tuning should reduce unnecessary hold-backs.`;
    }
    return `${summary.name} is stable but still modification-heavy, so future tuning should focus on keeping more days normal.`;
  }

  return `${summary.name} looks solid enough to move on from for now.`;
}

function formatCountMap(values: Record<string, number>): string {
  const entries = Object.entries(values).sort((left, right) => right[1] - left[1]);
  if (!entries.length) {
    return "none";
  }

  return entries.map(([key, count]) => `${key} ${count}`).join(", ");
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function sumCountMap(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function scoreCoachingEffectiveness(input: {
  adherencePercent: number;
  progressionVelocityPercent: number;
  guardrailPressurePercent: number;
  plannedBuildDays: number;
  goal: string;
  experienceLevel: string;
}): number {
  const progressionWeight = input.plannedBuildDays >= 4 ? 0.45 : 0.35;
  const adherenceWeight = input.goal === "build_consistency" ? 0.5 : 0.4;
  const guardrailWeight = 1 - progressionWeight - adherenceWeight;
  const normalizedGuardrail = 100 - input.guardrailPressurePercent;
  const beginnerBuffer = input.experienceLevel === "beginner" ? 3 : 0;

  return Math.round(
    input.adherencePercent * adherenceWeight +
      input.progressionVelocityPercent * progressionWeight +
      normalizedGuardrail * guardrailWeight +
      beginnerBuffer
  );
}

function classifyWeeklyReviewTrajectory(
  weeks: PersonaReport["weeks"]
):
  | "progressing"
  | "plateaued"
  | "oscillating"
  | "declining"
  | "insufficient_data" {
  const states = weeks
    .map((week) => week.weeklyReviewState)
    .filter(Boolean)
    .slice(-6) as Array<NonNullable<PersonaReport["weeks"][number]["weeklyReviewState"]>>;

  if (states.length < 3) {
    return "insufficient_data";
  }

  const latest = states.at(-1)!;
  const transitionCount = states.slice(1).reduce((count, state, index) => {
    return state === states[index] ? count : count + 1;
  }, 0);
  const stateDelta =
    weeklyReviewStateScore(states.at(-1)!) - weeklyReviewStateScore(states[0]);
  const recentTail = states.slice(-3);
  const fragileTailCount = recentTail.filter(
    (state) => state === "protecting" || state === "resetting"
  ).length;
  const hadFragileState = states.some(
    (state) => state === "protecting" || state === "resetting"
  );

  if (transitionCount >= 3 && fragileTailCount >= 1 && latest !== "building") {
    return "oscillating";
  }

  if (stateDelta <= -2 || (fragileTailCount >= 2 && latest !== "building")) {
    return "declining";
  }

  if (
    stateDelta >= 2 &&
    hadFragileState &&
    (latest === "steady" || latest === "building")
  ) {
    return "progressing";
  }

  if (
    transitionCount === 0 &&
    states.length >= 4 &&
    (latest === "steady" || latest === "protecting")
  ) {
    return "plateaued";
  }

  return latest === "building" ? "progressing" : "plateaued";
}

function weeklyReviewStateScore(state: string): number {
  if (state === "building") {
    return 3;
  }

  if (state === "steady") {
    return 2;
  }

  if (state === "protecting") {
    return 1;
  }

  return 0;
}

function summarizeProgressionVelocity(days: PersonaDay[]): {
  progressionVelocityPercent: number;
  plannedBuildDays: number;
  completedBuildDays: number;
  strongBuildDays: number;
  workableBuildDays: number;
} {
  const buildDays = days.filter(
    (day) => day.plannedWorkoutType && day.progressionIntent === "build"
  );
  const completedBuildDays = buildDays.filter(
    (day) => day.completed && day.outcomeSummary
  );
  let realizedProgressScore = 0;
  let strongBuildDays = 0;
  let workableBuildDays = 0;

  for (const day of completedBuildDays) {
    const outcome = day.outcomeSummary!;
    const qualityWeight =
      outcome.executionQuality === "strong"
        ? 1
        : outcome.executionQuality === "workable"
          ? 0.72
          : 0.38;
    const coverageWeight = outcome.mainCovered
      ? outcome.supportCovered
        ? 1
        : 0.9
      : 0.55;
    const styleWeight =
      day.sessionStyle === "normal"
        ? 1
        : day.sessionStyle === "modified"
          ? 0.82
          : day.sessionStyle === "conservative"
            ? 0.7
            : 0.58;
    realizedProgressScore += qualityWeight * coverageWeight * styleWeight;

    if (outcome.executionQuality === "strong") {
      strongBuildDays += 1;
    } else if (outcome.executionQuality === "workable") {
      workableBuildDays += 1;
    }
  }

  return {
    progressionVelocityPercent:
      buildDays.length === 0
        ? 0
        : Math.round((realizedProgressScore / buildDays.length) * 100),
    plannedBuildDays: buildDays.length,
    completedBuildDays: completedBuildDays.length,
    strongBuildDays,
    workableBuildDays
  };
}

function formatInsightTitles(weeks: PersonaReport["weeks"]): string {
  const titles = countBy(weeks.flatMap((week) => week.weeklyInsightTitles));
  return formatCountMap(titles);
}

function formatWeeklyProgressionDrift(weeks: PersonaReport["weeks"]): string {
  if (!weeks.length) {
    return "none";
  }

  const first = formatCountMap(weeks[0].weeklyProgressionActions);
  const last = formatCountMap(weeks.at(-1)?.weeklyProgressionActions ?? {});
  return `${first} -> ${last}`;
}

function formatWeeklyGuardedProgressionDrift(weeks: PersonaReport["weeks"]): string {
  if (!weeks.length) {
    return "n/a";
  }

  const first = formatCountMap(weeks[0].weeklyGuardedProgressionActions);
  const last = formatCountMap(weeks.at(-1)?.weeklyGuardedProgressionActions ?? {});
  return `${first} -> ${last}`;
}

function formatWeeklyExerciseDrift(weeks: PersonaReport["weeks"]): string {
  if (!weeks.length) {
    return "none";
  }

  const first = formatWeeklyExerciseActions(weeks[0].weeklyExerciseActions);
  const last = formatWeeklyExerciseActions(weeks.at(-1)?.weeklyExerciseActions ?? []);
  return `${first} -> ${last}`;
}

function formatWeeklyRecentExerciseDrift(weeks: PersonaReport["weeks"]): string {
  if (!weeks.length) {
    return "none";
  }

  const first = formatWeeklyRecentExercises(weeks[0].weeklyRecentExercises);
  const last = formatWeeklyRecentExercises(weeks.at(-1)?.weeklyRecentExercises ?? []);
  return `${first} -> ${last}`;
}

function formatWeeklyExerciseActions(
  entries: Array<{
    exerciseId: string;
    name: string;
    action: "progress" | "repeat" | "hold_back";
    occurrences: number;
  }>
): string {
  if (!entries.length) {
    return "none";
  }

  return entries
    .slice()
    .sort((left, right) => {
      const occurrenceDelta = right.occurrences - left.occurrences;
      if (occurrenceDelta !== 0) {
        return occurrenceDelta;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 3)
    .map((entry) => `${entry.name} ${entry.action} ${entry.occurrences}`)
    .join(", ");
}

function formatWeeklyRecentExercises(
  entries: Array<{
    exerciseId: string;
    name: string;
    appearances: number;
    executionQuality: "strong" | "workable" | "survival";
    followedPlannedRate?: number;
    followedSuggestedRate?: number;
    averageSubstitutionCount?: number;
  }>
): string {
  if (!entries.length) {
    return "none";
  }

  return entries
    .slice(0, 3)
    .map((entry) => {
      const alignment =
        (entry.followedPlannedRate ?? 0) >= 0.5
          ? "planned"
          : (entry.followedSuggestedRate ?? 0) >= 0.5
            ? "suggested"
            : (entry.averageSubstitutionCount ?? 0) >= 1
              ? "subbed"
              : "mixed";
      return `${entry.name} ${entry.executionQuality} ${entry.appearances} ${alignment}`;
    })
    .join(", ");
}

function formatTopEntries(values: Record<string, number>, limit: number): string {
  const entries = Object.entries(values).sort((left, right) => right[1] - left[1]);
  if (!entries.length) {
    return "none";
  }

  return entries
    .slice(0, limit)
    .map(([key, count]) => `${key} ${count}`)
    .join(", ");
}

function shouldMissWorkout(
  style: PersonaStyle,
  date: string,
  sessionStyle: SessionPlan["sessionStyle"],
  progressionIntent: string | undefined,
  plannedDuration: number,
  plannedWorkoutType: string
): boolean {
  const roll = deterministicRoll(`${style}:${date}`);
  const disruptionRoll = deterministicRoll(`${style}:${date}:life`);
  const weekIndex = Math.floor(daysBetween(START_DATE, date) / 7);
  const profileWave = getWeeklyAdherenceWave(style, weekIndex);
  let completionProbability =
    style === "beginner_consistency"
      ? 0.71
      : style === "intermediate_ppl"
        ? 0.88
        : style === "intermediate_resetting_split"
          ? 0.78
          : style === "intermediate_steady_upper_lower"
            ? 0.86
            : 0.89;

  completionProbability += profileWave;

  if (sessionStyle === "accessory_only") {
    completionProbability -= style === "intermediate_ppl" ? 0.08 : 0.06;
  } else if (sessionStyle === "conservative") {
    completionProbability += 0.02;
  } else if (sessionStyle === "modified") {
    completionProbability -= 0.03;
  }

  if (progressionIntent === "conservative") {
    completionProbability += 0.05;
  }

  if (progressionIntent === "build") {
    completionProbability -= style === "beginner_consistency" ? 0.06 : 0.03;
  }

  if (plannedDuration <= 30) {
    completionProbability += 0.05;
  } else if (plannedDuration <= 40) {
    completionProbability += 0.03;
  } else if (plannedDuration >= 55) {
    completionProbability -= 0.02;
  }

  if (style === "intermediate_full_body" && plannedWorkoutType === "full_body") {
    if (plannedDuration <= 35) {
      completionProbability += 0.04;
    } else if (plannedDuration <= 42) {
      completionProbability += 0.02;
    }
  }

  if (style === "intermediate_ppl" && weekIndex >= 5) {
    completionProbability -= 0.03;
  }

  if (style === "intermediate_full_body" && isFriday(date)) {
    completionProbability -= 0.02;
  }

  const disruptionMisses =
    style === "beginner_consistency"
      ? (weekIndex === 3 || weekIndex === 6) && disruptionRoll > 0.82
      : style === "intermediate_ppl"
        ? weekIndex >= 5 && disruptionRoll > 0.9
        : style === "intermediate_resetting_split"
          ? (weekIndex === 2 || weekIndex === 5) && disruptionRoll > 0.84
          : style === "intermediate_steady_upper_lower"
            ? weekIndex >= 6 && disruptionRoll > 0.92
            : (weekIndex === 4 || weekIndex === 7) && disruptionRoll > 0.86;

  return disruptionMisses || roll > clamp(completionProbability, 0.45, 0.96);
}

function deterministicRoll(seed: string): number {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1000;
  }

  return hash / 1000;
}

function getWeeklyAdherenceWave(style: PersonaStyle, weekIndex: number): number {
  if (style === "beginner_consistency") {
    const wave = [0.04, 0.02, -0.02, -0.06, 0.01, 0.03, -0.01, 0.02];
    return wave[weekIndex] ?? 0;
  }

  if (style === "intermediate_ppl") {
    const wave = [0.02, 0.03, 0.01, -0.02, -0.04, -0.06, -0.03, 0.01];
    return wave[weekIndex] ?? 0;
  }

  if (style === "intermediate_resetting_split") {
    const wave = [0.01, -0.02, -0.05, 0, 0.02, -0.03, 0.01, 0.03];
    return wave[weekIndex] ?? 0;
  }

  if (style === "intermediate_steady_upper_lower") {
    const wave = [0.03, 0.02, 0.02, 0.01, 0, -0.01, 0.01, 0.02];
    return wave[weekIndex] ?? 0;
  }

  const wave = [0.03, 0.01, 0.02, -0.01, -0.03, 0, 0.02, -0.02];
  return wave[weekIndex] ?? 0;
}

function buildSimulatedSession(
  context: Omit<SimulatedSetContext, "sessionStyle" | "isMain" | "exerciseIndex">,
  sessionPlan: SessionPlan,
  substitutionOptions: ExerciseSubstitutionOption[]
): {
  completedDuration: number;
  sessionExercises: WorkoutExerciseEntry[];
  executionFeedback: WorkoutExecutionFeedback;
} {
  const performedSetContext = {
    ...context,
    sessionStyle: sessionPlan.sessionStyle
  };

  if (sessionPlan.sessionStyle === "accessory_only") {
    const accessoryExercises = buildReducedSessionExerciseIds(
      context.plannedWorkoutType,
      sessionPlan,
      substitutionOptions,
      3
    );

    return {
      completedDuration: 25,
      sessionExercises: accessoryExercises.map((exerciseId) => ({
        exerciseId,
        sets: 2,
        reps: 12,
        effort: "moderate"
      })),
      executionFeedback: buildExecutionFeedback(
        sessionPlan,
        substitutionOptions,
        25,
        accessoryExercises
      )
    };
  }

  if (sessionPlan.sessionStyle === "conservative") {
    const conservativeExercises = buildReducedSessionExerciseIds(
      context.plannedWorkoutType,
      sessionPlan,
      substitutionOptions,
      3
    );

    return {
      completedDuration: 40,
      sessionExercises: conservativeExercises.map((exerciseId, index) => ({
        exerciseId,
        sets: index === 0 ? 3 : 2,
        reps: index === 0 ? 8 : 12,
        effort: "moderate",
        performedSets: buildSimulatedPerformedSets(
          exerciseId,
          index === 0 ? 3 : 2,
          index === 0 ? 8 : 12,
          {
            ...performedSetContext,
            isMain: index === 0,
            exerciseIndex: index
          }
        )
      })),
      executionFeedback: buildExecutionFeedback(
        sessionPlan,
        substitutionOptions,
        40,
        conservativeExercises
      )
    };
  }

  if (sessionPlan.sessionStyle === "modified") {
    const modifiedExercises = buildReducedSessionExerciseIds(
      context.plannedWorkoutType,
      sessionPlan,
      substitutionOptions,
      3
    );

    return {
      completedDuration: 45,
      sessionExercises: modifiedExercises.map((exerciseId, index) => ({
        exerciseId,
        sets: index === 0 ? 4 : 3,
        reps: index === 0 ? 8 : 12,
        effort: "moderate",
        performedSets: buildSimulatedPerformedSets(
          exerciseId,
          index === 0 ? 4 : 3,
          index === 0 ? 8 : 12,
          {
            ...performedSetContext,
            isMain: index === 0,
            exerciseIndex: index
          }
        )
      })),
      executionFeedback: buildExecutionFeedback(
        sessionPlan,
        substitutionOptions,
        45,
        modifiedExercises
      )
    };
  }

  const plannedExercises = collectPlanExercises(sessionPlan);
  const templateExercises = getTemplateExercises(context.plannedWorkoutType);

  const completedDuration = context.plannedWorkoutType === "full_body" ? 52 : 60;
  const sessionExercises: WorkoutExerciseEntry[] =
    plannedExercises.length >= 3
      ? plannedExercises.slice(0, 4).map((exerciseId, index) => ({
          exerciseId,
          sets: index === 0 ? 4 : 3,
          reps: index === 0 ? 8 : 10,
          effort: "moderate",
          performedSets: buildSimulatedPerformedSets(
            exerciseId,
            index === 0 ? 4 : 3,
            index === 0 ? 8 : 10,
            {
              ...performedSetContext,
              isMain: index === 0,
              exerciseIndex: index
            }
          )
        }))
      : templateExercises.map((entry, index) => ({
          ...entry,
          performedSets: buildSimulatedPerformedSets(entry.exerciseId, entry.sets, entry.reps, {
            ...performedSetContext,
            isMain: index === 0,
            exerciseIndex: index
          })
        }));

  return {
    completedDuration,
    sessionExercises,
    executionFeedback: buildExecutionFeedback(
      sessionPlan,
      substitutionOptions,
      completedDuration,
      sessionExercises.map((entry) => entry.exerciseId)
    )
  };
}

function buildExecutionFeedback(
  sessionPlan: SessionPlan,
  substitutionOptions: ExerciseSubstitutionOption[],
  completedDuration: number,
  sessionExerciseIds: string[]
): WorkoutExecutionFeedback {
  const plannedExerciseIds = collectPlanExercises(sessionPlan);
  const mainExerciseIds = dedupe(
    sessionPlan.blocks
      .filter((block) => block.slot === "main")
      .flatMap((block) =>
        (block.exampleExercises ?? []).map((exercise) => exercise.exerciseId)
      )
      .concat(
        sessionPlan.blocks
          .filter((block) => block.slot === "main")
          .flatMap((block) => block.exampleExerciseIds)
      )
  );
  const supportExerciseIds = dedupe(
    sessionPlan.blocks
      .filter((block) => block.slot !== "main")
      .flatMap((block) =>
        (block.exampleExercises ?? []).map((exercise) => exercise.exerciseId)
      )
      .concat(
        sessionPlan.blocks
          .filter((block) => block.slot !== "main")
          .flatMap((block) => block.exampleExerciseIds)
      )
  );
  const substitutionExerciseIds = dedupe(
    substitutionOptions.flatMap((option) => option.swapForExerciseIds)
  );
  const matchedPlanCount = sessionExerciseIds.filter((exerciseId) =>
    plannedExerciseIds.includes(exerciseId)
  ).length;
  const substitutedExerciseIds = dedupe(
    sessionExerciseIds.filter(
      (exerciseId) =>
        substitutionExerciseIds.includes(exerciseId) &&
        !plannedExerciseIds.includes(exerciseId)
    )
  );
  const mainCovered = sessionExerciseIds.some((exerciseId) =>
    mainExerciseIds.includes(exerciseId)
  );
  const supportCovered = sessionExerciseIds.some((exerciseId) =>
    supportExerciseIds.includes(exerciseId)
  );
  const completionRatio =
    sessionExerciseIds.length === 0
      ? 0
      : matchedPlanCount / Math.max(sessionExerciseIds.length, 1);
  const followedPlannedWorkout =
    sessionPlan.sessionStyle === "normal"
      ? completionRatio >= 0.75 && substitutedExerciseIds.length === 0
      : sessionPlan.sessionStyle === "conservative"
        ? mainCovered && completionRatio >= 0.5 && substitutedExerciseIds.length <= 1
        : sessionPlan.sessionStyle === "modified"
          ? mainCovered && completionRatio >= 0.34 && substitutedExerciseIds.length <= 1
          : false;

  return {
    followedPlannedWorkout,
    mainCovered,
    supportCovered,
    executionQuality: classifySimulatedExecutionQuality(
      sessionPlan,
      completedDuration,
      mainCovered,
      supportCovered
    ),
    substitutedExerciseIds
  };
}

function buildSimulatedPerformedSets(
  exerciseId: string,
  sets: number,
  reps: number,
  context: SimulatedSetContext
): WorkoutExerciseEntry["performedSets"] {
  const baseRest = resolveBaseRestSeconds(exerciseId, context.isMain);
  const strainTier = getSimulatedSetStrainTier(context, exerciseId);

  return Array.from({ length: sets }, (_, index) => {
    const repDrop = getSimulatedRepDrop(strainTier, index, sets, context.isMain);
    const effort = getSimulatedSetEffort(strainTier, index, sets);
    const restMultiplier = getSimulatedRestMultiplier(strainTier, index, sets, context);
    const restSeconds = Math.round(baseRest * restMultiplier);

    return {
      reps: Math.max(4, reps - repDrop),
      effort,
      restSeconds,
      completed: true
    };
  });
}

function resolveBaseRestSeconds(exerciseId: string, isMain: boolean): number {
  const exercise = getExerciseById(exerciseId);
  if (exercise) {
    return Math.round(
      (exercise.prescriptionDefaults.restSeconds[0] + exercise.prescriptionDefaults.restSeconds[1]) /
        2
    );
  }

  return isMain ? 120 : 90;
}

function getSimulatedSetStrainTier(
  context: SimulatedSetContext,
  exerciseId: string
): "stable" | "accumulating" | "strained" {
  const weekIndex = Math.floor(daysBetween(START_DATE, context.date) / 7);
  let strainScore =
    context.sessionStyle === "modified"
      ? 1
      : context.sessionStyle === "conservative"
        ? 0.2
        : context.sessionStyle === "accessory_only"
          ? -0.5
          : 0.45;

  if (context.progressionIntent === "build") {
    strainScore += 0.3;
  } else if (context.progressionIntent === "conservative") {
    strainScore -= 0.1;
  }

  if (context.weeklyReviewState === "protecting") {
    strainScore += 0.15;
  } else if (context.weeklyReviewState === "resetting") {
    strainScore += 0.3;
  }

  if (context.currentWeekReplanActive) {
    strainScore += 0.12;
  }

  if (context.plannedWorkoutType === "full_body" || context.plannedWorkoutType === "lower_body") {
    strainScore += context.isMain ? 0.16 : 0.08;
  }

  if (context.style === "intermediate_full_body") {
    strainScore += 0.22;
  } else if (context.style === "intermediate_resetting_split") {
    strainScore += 0.26;
  } else if (context.style === "intermediate_ppl" && weekIndex >= 4) {
    strainScore += 0.14;
  } else if (context.style === "beginner_consistency") {
    strainScore -= 0.08;
  }

  if (weekIndex >= 5) {
    strainScore += 0.08;
  }

  strainScore += deterministicRoll(
    `${context.style}:${context.date}:${exerciseId}:${context.exerciseIndex}:set-strain`
  ) * 0.45;

  if (context.sessionStyle === "conservative") {
    strainScore = Math.min(strainScore, 1.02);
  }

  if (strainScore >= 1.1) {
    return "strained";
  }

  if (strainScore >= 0.62) {
    return "accumulating";
  }

  return "stable";
}

function getSimulatedRepDrop(
  strainTier: "stable" | "accumulating" | "strained",
  index: number,
  sets: number,
  isMain: boolean
): number {
  const setProgress = sets <= 1 ? 0 : index / (sets - 1);

  if (strainTier === "stable") {
    if (isMain && index === sets - 1) {
      return 1;
    }
    return 0;
  }

  if (strainTier === "accumulating") {
    if (setProgress >= 0.9) {
      return isMain ? 2 : 1;
    }
    if (setProgress >= 0.55) {
      return 1;
    }
    return 0;
  }

  if (setProgress >= 0.8) {
    return isMain ? 3 : 2;
  }
  if (setProgress >= 0.45) {
    return isMain ? 2 : 1;
  }
  return 0;
}

function getSimulatedSetEffort(
  strainTier: "stable" | "accumulating" | "strained",
  index: number,
  sets: number
): SessionEffort {
  const setProgress = sets <= 1 ? 0 : index / (sets - 1);

  if (strainTier === "stable") {
    return setProgress >= 0.95 ? "hard" : "moderate";
  }

  if (strainTier === "accumulating") {
    return setProgress >= 0.55 ? "hard" : "moderate";
  }

  return setProgress >= 0.3 ? "hard" : "moderate";
}

function getSimulatedRestMultiplier(
  strainTier: "stable" | "accumulating" | "strained",
  index: number,
  sets: number,
  context: SimulatedSetContext
): number {
  const setProgress = sets <= 1 ? 0 : index / (sets - 1);

  if (strainTier === "stable") {
    return context.sessionStyle === "conservative" ? 0.96 + setProgress * 0.08 : 1 + setProgress * 0.08;
  }

  if (strainTier === "accumulating") {
    return 1.02 + setProgress * 0.28;
  }

  return 1.08 + setProgress * 0.42;
}

function classifySimulatedExecutionQuality(
  sessionPlan: SessionPlan,
  completedDuration: number,
  mainCovered: boolean,
  supportCovered: boolean
): "strong" | "workable" | "survival" {
  if (sessionPlan.sessionStyle === "accessory_only") {
    return "survival";
  }

  if (sessionPlan.sessionStyle === "normal" && mainCovered && supportCovered && completedDuration >= 50) {
    return "strong";
  }

  if (mainCovered && (supportCovered || completedDuration >= 40)) {
    return "workable";
  }

  return "survival";
}

function collectPlanExercises(sessionPlan: SessionPlan): string[] {
  const planned = sessionPlan.blocks.flatMap((block) =>
    (block.exampleExercises ?? []).map((exercise) => exercise.exerciseId)
  );

  if (planned.length) {
    return dedupe(planned);
  }

  return dedupe(sessionPlan.blocks.flatMap((block) => block.exampleExerciseIds));
}

function buildReducedSessionExerciseIds(
  plannedWorkoutType: string,
  sessionPlan: SessionPlan,
  substitutionOptions: ExerciseSubstitutionOption[],
  targetCount: number
): string[] {
  const planExercises = collectPlanExercises(sessionPlan);
  const substitutionExercises = substitutionOptions.flatMap((option) => option.swapForExerciseIds);
  const reducedTemplateExercises = getReducedTemplateExerciseIds(plannedWorkoutType);
  const fullTemplateExercises = getTemplateExercises(plannedWorkoutType).map(
    (entry) => entry.exerciseId
  );

  return dedupe([
    ...planExercises,
    ...substitutionExercises,
    ...reducedTemplateExercises,
    ...fullTemplateExercises
  ]).slice(0, targetCount);
}

function getReducedTemplateExerciseIds(plannedWorkoutType: string): string[] {
  if (plannedWorkoutType === "push_day") {
    return ["lateral_raise", "tricep_pushdown", "cable_chest_fly"];
  }

  if (plannedWorkoutType === "pull_day") {
    return ["shrug", "hammer_curl", "rear_delt_fly"];
  }

  if (plannedWorkoutType === "lower_body") {
    return ["leg_curl", "calf_raise", "leg_extension"];
  }

  if (plannedWorkoutType === "upper_body") {
    return ["lat_pulldown", "barbell_bench_press", "hammer_curl"];
  }

  return ["leg_press", "barbell_bench_press", "lat_pulldown"];
}

function getTemplateExercises(plannedWorkoutType: string): WorkoutExerciseEntry[] {
  if (plannedWorkoutType === "push_day") {
    return [
      { exerciseId: "barbell_bench_press", sets: 4, reps: 6, effort: "hard" },
      { exerciseId: "incline_dumbbell_press", sets: 3, reps: 8, effort: "moderate" },
      { exerciseId: "lateral_raise", sets: 3, reps: 15, effort: "moderate" },
      { exerciseId: "triceps_rope_pushdown", sets: 3, reps: 12, effort: "moderate" }
    ];
  }

  if (plannedWorkoutType === "pull_day") {
    return [
      { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "hard" },
      { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" },
      { exerciseId: "shrug", sets: 3, reps: 12, effort: "moderate" }
    ];
  }

  if (plannedWorkoutType === "lower_body") {
    return [
      { exerciseId: "leg_press", sets: 4, reps: 8, effort: "hard" },
      { exerciseId: "romanian_deadlift", sets: 3, reps: 8, effort: "hard" },
      { exerciseId: "leg_extension", sets: 3, reps: 12, effort: "moderate" },
      { exerciseId: "calf_raise", sets: 4, reps: 15, effort: "moderate" }
    ];
  }

  if (plannedWorkoutType === "upper_body") {
    return [
      { exerciseId: "barbell_bench_press", sets: 4, reps: 6, effort: "moderate" },
      { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
      { exerciseId: "lateral_raise", sets: 3, reps: 15, effort: "moderate" },
      { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" }
    ];
  }

  return [
    { exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" },
    { exerciseId: "barbell_bench_press", sets: 3, reps: 8, effort: "moderate" },
    { exerciseId: "lat_pulldown", sets: 3, reps: 10, effort: "moderate" },
    { exerciseId: "calf_raise", sets: 3, reps: 15, effort: "moderate" }
  ];
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toWorkoutDayKey(dateString: string): string {
  const dayOfWeek = new Date(`${dateString}T12:00:00.000Z`).getUTCDay();
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ][dayOfWeek];
}

function getWeekStart(dateString: string): string {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  const dayOfWeek = date.getUTCDay();
  const distanceFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setUTCDate(date.getUTCDate() - distanceFromMonday);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T12:00:00.000Z`).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function isFriday(dateString: string): boolean {
  return new Date(`${dateString}T12:00:00.000Z`).getUTCDay() === 5;
}

function formatDayName(dayOfWeek: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
