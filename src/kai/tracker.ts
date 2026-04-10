import type {
  BehaviorSignals,
  ConsistencyStatus,
  WorkoutCompletionInput,
  WorkoutExecutionFeedback,
  WorkoutMissedInput,
  WorkoutOutcomeSummary,
  WorkoutRecord
} from "./types.js";
import { getExerciseById } from "../exercises/library.js";
import type { TrainingEffect, WorkoutExerciseEntry } from "../exercises/types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NO_ACTIVITY_DAYS = 999;

export function recordWorkoutCompleted(
  workouts: WorkoutRecord[],
  input: WorkoutCompletionInput
): WorkoutRecord[] {
  const outcomeSummary = summarizeWorkoutOutcome(
    input.type,
    input.sessionExercises ?? [],
    input.plannedDuration,
    input.completedDuration,
    input.executionFeedback
  );
  const nextWorkout: WorkoutRecord = {
    id: input.id,
    userId: input.userId,
    date: input.date,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    type: input.type,
    plannedDuration: input.plannedDuration,
    completedDuration: input.completedDuration,
    sessionExercises: input.sessionExercises,
    executionFeedback: input.executionFeedback,
    outcomeSummary,
    status: "completed"
  };

  return upsertWorkout(workouts, nextWorkout);
}

function summarizeWorkoutOutcome(
  workoutType: string,
  sessionExercises: NonNullable<WorkoutCompletionInput["sessionExercises"]>,
  plannedDuration: number,
  completedDuration: number,
  executionFeedback?: WorkoutExecutionFeedback
): WorkoutOutcomeSummary {
  const templateGroups = getOutcomeEffectGroups(workoutType);
  const inferredCovered = templateGroups.map((effects) =>
    sessionExercises.some((sessionExercise) => {
      const exercise = getExerciseById(sessionExercise.exerciseId);
      return Boolean(
        exercise &&
          (exercise.trainingEffects ?? []).some((effect) => effects.includes(effect))
      );
    })
  );
  const mainCovered = executionFeedback?.mainCovered ?? inferredCovered[0] ?? false;
  const supportCovered =
    executionFeedback?.supportCovered ?? inferredCovered.slice(1).some(Boolean);
  const coveredSlots = [mainCovered, supportCovered, inferredCovered[2] ?? false].filter(Boolean).length;
  const durationCompletionRatio = roundToTwoDecimals(
    Math.max(0, Math.min(1.25, completedDuration / Math.max(plannedDuration, 1)))
  );
  const executionQuality =
    executionFeedback?.executionQuality ??
    classifyExecutionQuality(
      mainCovered,
      supportCovered,
      coveredSlots,
      durationCompletionRatio
    );
  const performedWorkoutType = inferPerformedWorkoutType(sessionExercises);
  const setMetrics = summarizeSetMetrics(sessionExercises);

  return {
    mainCovered,
    supportCovered,
    coveredSlots,
    sessionSize:
      coveredSlots >= 3 ? "full" : coveredSlots >= 2 ? "partial" : "thin",
    durationCompletionRatio,
    executionQuality,
    performedWorkoutType,
    followedPlannedWorkout: executionFeedback?.followedPlannedWorkout,
    followedSuggestedWorkoutType: executionFeedback?.followedSuggestedWorkoutType,
    substitutionCount:
      executionFeedback?.substitutionPairs?.length ??
      executionFeedback?.substitutedExerciseIds?.length ??
      0,
    ...(setMetrics.totalLoggedSets !== undefined
      ? { totalLoggedSets: setMetrics.totalLoggedSets }
      : {}),
    ...(setMetrics.averageRestSeconds !== undefined
      ? { averageRestSeconds: setMetrics.averageRestSeconds }
      : {}),
    ...(setMetrics.restInflationRatio !== undefined
      ? { restInflationRatio: setMetrics.restInflationRatio }
      : {}),
    ...(setMetrics.repDropoffPercent !== undefined
      ? { repDropoffPercent: setMetrics.repDropoffPercent }
      : {}),
    ...(setMetrics.setEffortTrend !== undefined
      ? { setEffortTrend: setMetrics.setEffortTrend }
      : {})
  };
}

function summarizeSetMetrics(
  sessionExercises: NonNullable<WorkoutCompletionInput["sessionExercises"]>
): Pick<
  WorkoutOutcomeSummary,
  | "totalLoggedSets"
  | "averageRestSeconds"
  | "restInflationRatio"
  | "repDropoffPercent"
  | "setEffortTrend"
> {
  let totalLoggedSets = 0;
  let totalRestSeconds = 0;
  let restCount = 0;
  let restInflationTotal = 0;
  let restInflationCount = 0;
  let repDropoffTotal = 0;
  let repDropoffCount = 0;
  const effortValues: number[] = [];

  for (const sessionExercise of sessionExercises) {
    const performedSets = (sessionExercise.performedSets ?? []).filter(
      (set) => set.completed !== false
    );
    if (!performedSets.length) {
      continue;
    }

    totalLoggedSets += performedSets.length;
    const exercise = getExerciseById(sessionExercise.exerciseId);
    const defaultRestMidpoint = exercise
      ? (exercise.prescriptionDefaults.restSeconds[0] +
          exercise.prescriptionDefaults.restSeconds[1]) /
        2
      : undefined;

    const firstReps = performedSets[0]?.reps;
    const lastReps = performedSets.at(-1)?.reps;
    if (
      typeof firstReps === "number" &&
      typeof lastReps === "number" &&
      firstReps > 0 &&
      performedSets.length >= 2
    ) {
      repDropoffTotal += Math.max(0, ((firstReps - lastReps) / firstReps) * 100);
      repDropoffCount += 1;
    }

    for (const set of performedSets) {
      if (typeof set.restSeconds === "number") {
        totalRestSeconds += set.restSeconds;
        restCount += 1;
        if (defaultRestMidpoint && defaultRestMidpoint > 0) {
          restInflationTotal += set.restSeconds / defaultRestMidpoint;
          restInflationCount += 1;
        }
      }

      if (set.effort) {
        effortValues.push(toEffortValue(set.effort));
      }
    }
  }

  return {
    totalLoggedSets: totalLoggedSets || undefined,
    averageRestSeconds:
      restCount > 0 ? roundToTwoDecimals(totalRestSeconds / restCount) : undefined,
    restInflationRatio:
      restInflationCount > 0
        ? roundToTwoDecimals(restInflationTotal / restInflationCount)
        : undefined,
    repDropoffPercent:
      repDropoffCount > 0
        ? roundToTwoDecimals(repDropoffTotal / repDropoffCount)
        : undefined,
    setEffortTrend: effortValues.length >= 2 ? classifyEffortTrend(effortValues) : undefined
  };
}

function classifyEffortTrend(
  effortValues: number[]
): WorkoutOutcomeSummary["setEffortTrend"] {
  const earlyWindow = effortValues.slice(0, Math.max(1, Math.ceil(effortValues.length / 3)));
  const lateWindow = effortValues.slice(-Math.max(1, Math.ceil(effortValues.length / 3)));
  const drift = average(lateWindow) - average(earlyWindow);

  if (drift >= 1) {
    return "sharp_rise";
  }

  if (drift >= 0.5) {
    return "rising";
  }

  return "stable";
}

function toEffortValue(effort: NonNullable<WorkoutExerciseEntry["performedSets"]>[number]["effort"]): number {
  if (effort === "easy") {
    return 1;
  }

  if (effort === "moderate") {
    return 2;
  }

  return 3;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function classifyExecutionQuality(
  mainCovered: boolean,
  supportCovered: boolean,
  coveredSlots: number,
  durationCompletionRatio: number
): WorkoutOutcomeSummary["executionQuality"] {
  if (mainCovered && supportCovered && coveredSlots >= 2 && durationCompletionRatio >= 0.85) {
    return "strong";
  }

  if (mainCovered && coveredSlots >= 1 && durationCompletionRatio >= 0.6) {
    return "workable";
  }

  return "survival";
}

function inferPerformedWorkoutType(
  sessionExercises: NonNullable<WorkoutCompletionInput["sessionExercises"]>
): string | undefined {
  let pushScore = 0;
  let pullScore = 0;
  let lowerScore = 0;

  for (const sessionExercise of sessionExercises) {
    const exercise = getExerciseById(sessionExercise.exerciseId);
    const effects = exercise?.trainingEffects ?? [];

    for (const effect of effects) {
      if (
        effect === "horizontal_press" ||
        effect === "vertical_press" ||
        effect === "chest_isolation" ||
        effect === "triceps_isolation" ||
        effect === "cable_pressdown" ||
        effect === "lateral_delt_isolation" ||
        effect === "side_delt_bias" ||
        effect === "front_delt_press"
      ) {
        pushScore += 1;
      }

      if (
        effect === "vertical_pull" ||
        effect === "horizontal_row" ||
        effect === "rear_delt_isolation" ||
        effect === "trap_isolation" ||
        effect === "upper_trap_isolation" ||
        effect === "biceps_isolation" ||
        effect === "neutral_grip_curl" ||
        effect === "supinated_curl"
      ) {
        pullScore += 1;
      }

      if (
        effect === "quad_bias" ||
        effect === "squat_pattern" ||
        effect === "hinge_heavy" ||
        effect === "hamstring_isolation" ||
        effect === "glute_bias" ||
        effect === "calf_isolation" ||
        effect === "unilateral_leg"
      ) {
        lowerScore += 1;
      }
    }
  }

  const upperScore = pushScore + pullScore;

  if (lowerScore >= 2 && upperScore >= 2) {
    return "full_body";
  }

  if (lowerScore >= 2 && upperScore === 0) {
    return "lower_body";
  }

  if (pushScore >= 2 && pullScore >= 2) {
    return "upper_body";
  }

  if (pushScore >= 2 && pullScore === 0) {
    return "push_day";
  }

  if (pullScore >= 2 && pushScore === 0) {
    return "pull_day";
  }

  if (lowerScore > upperScore && lowerScore >= 1) {
    return "lower_body";
  }

  if (upperScore > lowerScore && pushScore > 0 && pullScore > 0) {
    return "upper_body";
  }

  if (pushScore > 0) {
    return "push_day";
  }

  if (pullScore > 0) {
    return "pull_day";
  }

  return undefined;
}

function getOutcomeEffectGroups(workoutType: string): TrainingEffect[][] {
  if (workoutType === "push_day") {
    return [
      ["horizontal_press", "vertical_press", "chest_isolation"],
      ["lateral_delt_isolation", "side_delt_bias", "triceps_isolation", "cable_pressdown"],
      ["chest_isolation", "side_delt_bias"]
    ];
  }

  if (workoutType === "pull_day") {
    return [
      ["vertical_pull", "horizontal_row"],
      ["horizontal_row", "neutral_grip_curl", "biceps_isolation"],
      ["rear_delt_isolation", "trap_isolation"]
    ];
  }

  if (workoutType === "lower_body") {
    return [
      ["squat_pattern", "quad_bias", "hinge_heavy"],
      ["hamstring_isolation", "glute_bias", "calf_isolation"],
      ["calf_isolation", "quad_bias"]
    ];
  }

  if (workoutType === "upper_body") {
    return [
      ["horizontal_press", "vertical_pull", "horizontal_row"],
      ["horizontal_row", "lateral_delt_isolation", "biceps_isolation"],
      ["chest_isolation", "rear_delt_isolation", "neutral_grip_curl"]
    ];
  }

  return [
    ["quad_bias", "squat_pattern", "hinge_heavy"],
    ["horizontal_press", "vertical_pull", "horizontal_row"],
    ["rear_delt_isolation", "calf_isolation", "neutral_grip_curl"]
  ];
}

export function recordWorkoutMissed(
  workouts: WorkoutRecord[],
  input: WorkoutMissedInput
): WorkoutRecord[] {
  const nextWorkout: WorkoutRecord = {
    id: input.id,
    userId: input.userId,
    date: input.date,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    type: input.type,
    plannedDuration: input.plannedDuration,
    status: "missed"
  };

  return upsertWorkout(workouts, nextWorkout);
}

export function buildBehaviorSignals(
  workouts: WorkoutRecord[],
  asOf: string
): BehaviorSignals {
  const workoutsUpToAsOf = workouts.filter((workout) => workout.date <= asOf);
  const sortedWorkouts = [...workoutsUpToAsOf].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const recentWorkouts = filterRecentWorkouts(sortedWorkouts, asOf);
  const completedWorkouts = sortedWorkouts.filter(
    (workout) => workout.status === "completed"
  );
  const dailyTimeline = buildDailyTimeline(sortedWorkouts);
  const recentCompletedCount = recentWorkouts.filter(
    (workout) => workout.status === "completed"
  ).length;
  const recentMissedCount = recentWorkouts.filter(
    (workout) => workout.status === "missed"
  ).length;
  const lastActivityAt = getLastActivityAt(sortedWorkouts);
  const lastCompletedWorkoutAt =
    getLastCompletedWorkoutAt(completedWorkouts);
  const inactiveDays = lastActivityAt
    ? diffInDays(asOf, lastActivityAt)
    : NO_ACTIVITY_DAYS;
  const currentStreak = calculateCurrentStreak(
    dailyTimeline,
    lastActivityAt
  );
  const longestStreak = calculateLongestStreak(dailyTimeline);
  const consistencyScore = calculateConsistencyScore(
    recentCompletedCount,
    recentMissedCount
  );

  return {
    lastActivityAt,
    lastCompletedWorkoutAt,
    inactiveDays,
    recentCompletedCount,
    recentMissedCount,
    currentStreak,
    longestStreak,
    consistencyScore,
    consistencyStatus: decideConsistencyStatus(
      recentCompletedCount,
      recentMissedCount,
      inactiveDays
    )
  };
}

function upsertWorkout(
  workouts: WorkoutRecord[],
  nextWorkout: WorkoutRecord
): WorkoutRecord[] {
  const existingIndex = workouts.findIndex((workout) => workout.id === nextWorkout.id);

  if (existingIndex === -1) {
    return [...workouts, nextWorkout];
  }

  const nextWorkouts = [...workouts];
  nextWorkouts[existingIndex] = nextWorkout;
  return nextWorkouts;
}

function filterRecentWorkouts(workouts: WorkoutRecord[], asOf: string): WorkoutRecord[] {
  return workouts.filter((workout) => {
    const daysAgo = diffInDays(asOf, workout.date);
    return daysAgo >= 0 && daysAgo <= 6;
  });
}

function getLastActivityAt(workouts: WorkoutRecord[]): string | undefined {
  if (workouts.length === 0) {
    return undefined;
  }

  return [...workouts]
    .sort(compareWorkoutsByTimeline)
    [workouts.length - 1].date;
}

function getLastCompletedWorkoutAt(completedWorkouts: WorkoutRecord[]): string | undefined {
  if (completedWorkouts.length === 0) {
    return undefined;
  }

  return [...completedWorkouts]
    .sort(compareWorkoutsByTimeline)
    [completedWorkouts.length - 1].date;
}

function calculateCurrentStreak(
  dailyTimeline: WorkoutRecord[],
  lastActivityAt?: string
): number {
  if (dailyTimeline.length === 0) {
    return 0;
  }

  if (!lastActivityAt) {
    return 0;
  }

  const latestDay = dailyTimeline[dailyTimeline.length - 1];

  if (latestDay.date !== lastActivityAt || latestDay.status !== "completed") {
    return 0;
  }

  let streak = 1;

  for (let i = dailyTimeline.length - 1; i > 0; i -= 1) {
    const currentDay = dailyTimeline[i];
    const previousDay = dailyTimeline[i - 1];

    if (previousDay.status !== "completed") {
      break;
    }

    const gapInDays = diffInDays(currentDay.date, previousDay.date);

    if (gapInDays <= 2) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

function calculateLongestStreak(dailyTimeline: WorkoutRecord[]): number {
  if (dailyTimeline.length === 0) {
    return 0;
  }

  let longestStreak = 0;
  let currentStreak = 0;

  for (let i = 0; i < dailyTimeline.length; i += 1) {
    const currentDay = dailyTimeline[i];

    if (currentDay.status !== "completed") {
      currentStreak = 0;
      continue;
    }

    if (i === 0) {
      currentStreak = 1;
      continue;
    }

    const previousDay = dailyTimeline[i - 1];
    const gapInDays = diffInDays(currentDay.date, previousDay.date);

    if (previousDay.status === "completed" && gapInDays <= 2) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }

    longestStreak = Math.max(longestStreak, currentStreak);
  }

  return Math.max(longestStreak, currentStreak);
}

function calculateConsistencyScore(
  recentCompletedCount: number,
  recentMissedCount: number
): number {
  const rawScore = 40 + recentCompletedCount * 20 - recentMissedCount * 15;
  return clamp(rawScore, 0, 100);
}

function decideConsistencyStatus(
  recentCompletedCount: number,
  recentMissedCount: number,
  inactiveDays: number
): ConsistencyStatus {
  if (inactiveDays >= 7) {
    return "inactive";
  }

  if (recentCompletedCount >= 3 && recentMissedCount === 0) {
    return "consistent";
  }

  if (recentCompletedCount >= 2) {
    return "building";
  }

  return "starting";
}

function diffInDays(laterDate: string, earlierDate: string): number {
  const later = new Date(laterDate);
  const earlier = new Date(earlierDate);

  return Math.floor((later.getTime() - earlier.getTime()) / DAY_IN_MS);
}

function buildDailyTimeline(workouts: WorkoutRecord[]): WorkoutRecord[] {
  const latestWorkoutByDate = new Map<string, WorkoutRecord>();

  for (const workout of workouts) {
    const existingWorkout = latestWorkoutByDate.get(workout.date);

    if (!existingWorkout) {
      latestWorkoutByDate.set(workout.date, workout);
      continue;
    }

    if (compareWorkoutsByTimeline(existingWorkout, workout) <= 0) {
      latestWorkoutByDate.set(workout.date, workout);
    }
  }

  return [...latestWorkoutByDate.values()].sort(compareWorkoutsByTimeline);
}

function getRecordedAt(workout: WorkoutRecord): string {
  return workout.recordedAt ?? `${workout.date}T12:00:00.000Z`;
}

function compareWorkoutsByTimeline(a: WorkoutRecord, b: WorkoutRecord): number {
  const dateComparison = a.date.localeCompare(b.date);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  return getRecordedAt(a).localeCompare(getRecordedAt(b));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
