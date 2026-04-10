import type {
  HardConstraint,
  MuscleGroup,
  SuggestedDayBias,
  TrainingEffect
} from "../exercises/types.js";
import { getExerciseById } from "../exercises/library.js";
import {
  describeConservativeSlotCue,
  describeConservativeWorkoutRationale,
  describeStrainedComparableCue
} from "./coaching-copy.js";
import { getWeekRange } from "./weekly.js";
import type {
  KaiMemory,
  KaiUserProfile,
  KaiWeeklyPlan,
  KaiWeeklyPlanDay,
  KaiWeeklySummary,
  PlannedWorkout,
  WorkoutRecord
} from "./types.js";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
] as const;

const WORKOUT_DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const;

type SplitStyle = KaiWeeklyPlan["splitStyle"];

export function buildWeeklyPlan(
  userId: string,
  asOf: string,
  profile?: KaiUserProfile,
  memory?: KaiMemory,
  previousWeekSummary?: KaiWeeklySummary,
  workouts: WorkoutRecord[] = []
): KaiWeeklyPlan {
  const { weekStart, weekEnd } = getWeekRange(asOf);
  const normalizedProfile = profile ?? {
    userId,
    name: "Friend",
    goal: "build_consistency",
    experienceLevel: "beginner"
  };
  const targetSessions = decideTargetSessions(
    normalizedProfile,
    memory,
    previousWeekSummary
  );
  const splitStyle = respectSplitStyleConstraints(
    pickSplitStyle(targetSessions, normalizedProfile, memory),
    targetSessions,
    normalizedProfile
  );
  const plannedDays = pickPlannedDays(
    normalizedProfile.preferredWorkoutDays,
    targetSessions
  );
  const sequence = buildWorkoutSequence(
    splitStyle,
    targetSessions,
    normalizedProfile,
    memory
  );
  let sequenceIndex = 0;

  const days: KaiWeeklyPlanDay[] = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(weekStart, offset);
    const dayKey = getWorkoutDayKey(date);
    const dayName = DAY_NAMES[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
    const isPlanned = plannedDays.includes(dayKey);

    if (!isPlanned) {
      days.push({
        date,
        dayName,
        status: "rest",
        rationale: buildRestRationale(normalizedProfile, memory)
      });
      continue;
    }

    const workoutType = sequence[sequenceIndex] ?? sequence[sequence.length - 1];
    const comparableWorkoutHandling = summarizeComparableWorkoutHandling(
      workoutType,
      asOf,
      workouts
    );
    const workoutTypeReliability = summarizeWorkoutTypeReliability(
      workoutType,
      asOf,
      workouts
    );
    const progressionIntent = decideProgressionIntent(
      workoutType,
      sequenceIndex,
      targetSessions,
      normalizedProfile,
      memory,
      previousWeekSummary,
      comparableWorkoutHandling,
      workoutTypeReliability
    );
    sequenceIndex += 1;
    const plannedDuration = finalizePlannedDuration(
      decidePlannedDuration(
        normalizedProfile.preferredSessionLength,
        normalizedProfile.experienceLevel,
        memory,
        previousWeekSummary
      ),
      splitStyle,
      progressionIntent,
      normalizedProfile
    );

    days.push({
      date,
      dayName,
      workoutType,
      plannedDuration,
      status: "planned",
      progressionIntent,
      exerciseIntent: buildDayExerciseIntent(workoutType, normalizedProfile),
      sessionTemplate: buildDaySessionTemplate(
        workoutType,
        progressionIntent,
        normalizedProfile,
        memory,
        comparableWorkoutHandling,
        asOf,
        workouts
      ),
      rationale: buildWorkoutRationale(
        workoutType,
        progressionIntent,
        normalizedProfile,
        memory
      )
    });
  }

  const adjustedDays = reshapeCurrentWeekDays(
    days,
    asOf,
    normalizedProfile,
    memory,
    workouts
  );

  return {
    userId,
    asOf,
    weekStart,
    weekEnd,
    profile: normalizedProfile,
    recoveryStatus: memory?.recoveryStatus,
    targetSessions,
    splitStyle,
    rationale: buildPlanRationale(
      normalizedProfile,
      splitStyle,
      targetSessions,
      memory,
      previousWeekSummary
    ),
    days: adjustedDays
  };
}

export function toPlannedWorkouts(
  plan: KaiWeeklyPlan,
  options?: {
    fromDate?: string;
    replan?: PlannedWorkout["replan"];
  }
): PlannedWorkout[] {
  return plan.days
    .filter(
      (day) =>
        day.status === "planned" &&
        day.workoutType &&
        day.plannedDuration &&
        (!options?.fromDate || day.date >= options.fromDate)
    )
    .map((day, index) => ({
      id: `plan_${plan.weekStart}_${index + 1}`,
      userId: plan.userId,
      date: day.date,
      type: day.workoutType!,
      plannedDuration: day.plannedDuration!,
      replan: options?.replan
    }));
}

export function buildSuggestedPlanDay(
  asOf: string,
  workoutType: string,
  profile: KaiUserProfile,
  memory?: KaiMemory,
  workouts: WorkoutRecord[] = []
): Pick<
  KaiWeeklyPlanDay,
  | "date"
  | "dayName"
  | "status"
  | "workoutType"
  | "plannedDuration"
  | "progressionIntent"
  | "exerciseIntent"
  | "sessionTemplate"
  | "rationale"
> {
  const comparableWorkoutHandling = summarizeComparableWorkoutHandling(
    workoutType,
    asOf,
    workouts
  );
  const suggestedDayTemplateBias = summarizeSuggestedDayTemplateBias(
    workoutType,
    asOf,
    workouts
  );
  const progressionIntent =
    comparableWorkoutHandling?.trend === "strained" ||
    isPainLimitedWorkoutType(workoutType, profile.painFlags) ||
    isWorkoutTypeHardConstrained(workoutType, profile.hardConstraints)
      ? "conservative"
      : "repeat";
  const plannedDuration = finalizePlannedDuration(
    decidePlannedDuration(
      profile.preferredSessionLength,
      profile.experienceLevel
    ),
    suggestSplitStyleFromWorkoutType(workoutType),
    progressionIntent,
    profile
  );

  return {
    date: asOf,
    dayName: new Date(`${asOf}T00:00:00.000Z`).toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC"
    }),
    status: "planned",
    workoutType,
    plannedDuration,
    progressionIntent,
    exerciseIntent: buildDayExerciseIntent(workoutType, profile),
    sessionTemplate: buildDaySessionTemplate(
      workoutType,
      progressionIntent,
      profile,
      memory,
      comparableWorkoutHandling,
      asOf,
      workouts,
      suggestedDayTemplateBias
    ),
    rationale: buildSuggestedDayRationale(suggestedDayTemplateBias)
  };
}

function decideTargetSessions(
  profile: KaiUserProfile,
  memory?: KaiMemory,
  previousWeekSummary?: KaiWeeklySummary
): number {
  const baseTarget = Math.max(2, Math.min(profile.targetSessionsPerWeek ?? 3, 6));
  let adjustedTarget = baseTarget;

  if (profile.confidenceLevel === "low") {
    adjustedTarget = Math.max(2, Math.min(adjustedTarget, baseTarget >= 4 ? baseTarget - 1 : baseTarget));
  } else if (profile.confidenceLevel === "high" && baseTarget < 5) {
    adjustedTarget = Math.min(baseTarget + 1, 5);
  }

  if (memory?.recoveryStatus === "restarting") {
    adjustedTarget = Math.max(2, Math.min(adjustedTarget, 3));
  }

  if (memory?.recoveryStatus === "slipping") {
    adjustedTarget = Math.max(2, Math.min(adjustedTarget, 4));
  }

  if (previousWeekSummary) {
    const missedTooMuch =
      previousWeekSummary.plannedMissedCount >= 2 ||
      (previousWeekSummary.plannedCount >= 2 &&
        previousWeekSummary.planAdherencePercent < 50);
    const roughLowFrequencyWeek = isRoughLowFrequencyWeek(profile, previousWeekSummary);
    const earnedMore =
      previousWeekSummary.weekStatus === "on_track" &&
      previousWeekSummary.plannedCount >= Math.max(adjustedTarget - 1, 2) &&
      hasStrongEnoughExecution(previousWeekSummary);

    if (missedTooMuch) {
      adjustedTarget = Math.max(
        2,
        adjustedTarget - (profile.goal === "build_consistency" ? 1 : 2)
      );
    } else if (roughLowFrequencyWeek) {
      adjustedTarget = Math.max(2, adjustedTarget - 1);
    } else if (
      earnedMore &&
      memory?.recoveryStatus !== "slipping" &&
      memory?.recoveryStatus !== "restarting"
    ) {
      const upperCap = baseTarget;
      adjustedTarget = Math.min(upperCap, adjustedTarget + 1);
    }
  }

  return adjustedTarget;
}

function pickSplitStyle(
  targetSessions: number,
  profile: KaiUserProfile,
  memory?: KaiMemory
): SplitStyle {
  const bias = deriveWeeklyBias(profile);
  const patternSuggestedSplit = suggestSplitStyleFromSessionPattern(
    targetSessions,
    profile,
    memory
  );

  if (targetSessions <= 3) {
    // Low-frequency weeks stay intentionally simple for now. Pattern memory still
    // influences sequence and suggested days later, but the split itself stays full body.
    return "full_body";
  }

  if (targetSessions === 4) {
    if (
      patternSuggestedSplit === "upper_lower" ||
      patternSuggestedSplit === "hybrid_upper_lower"
    ) {
      return "upper_lower";
    }

    if (
      profile.trainingStylePreference === "full_body" ||
      bias.avoidPushHeavy ||
      bias.avoidPullHeavy
    ) {
      return "upper_lower";
    }

    return "upper_lower";
  }

  if (targetSessions === 5) {
    if (
      patternSuggestedSplit === "push_pull_legs" &&
      !bias.avoidPushHeavy &&
      !bias.avoidPullHeavy &&
      !bias.avoidLowerHeavy
    ) {
      return "push_pull_legs";
    }

    if (
      profile.trainingStylePreference === "split_routine" &&
      !bias.avoidPushHeavy &&
      !bias.avoidPullHeavy &&
      !bias.avoidLowerHeavy
    ) {
      return "push_pull_legs";
    }

    return "hybrid_upper_lower";
  }

  if (
    profile.trainingStylePreference === "full_body" ||
    bias.avoidPushHeavy ||
    bias.avoidPullHeavy ||
    bias.avoidLowerHeavy
  ) {
    return "hybrid_upper_lower";
  }

  if (patternSuggestedSplit === "push_pull_legs") {
    return "push_pull_legs";
  }

  return "push_pull_legs";
}

function respectSplitStyleConstraints(
  splitStyle: SplitStyle,
  targetSessions: number,
  profile: KaiUserProfile
): SplitStyle {
  if (canUseSplitStyle(splitStyle, profile)) {
    return splitStyle;
  }

  const fallbacks =
    targetSessions <= 3
      ? (["upper_lower", "full_body", "hybrid_upper_lower"] as SplitStyle[])
      : targetSessions === 4
        ? (["upper_lower", "hybrid_upper_lower", "full_body"] as SplitStyle[])
        : (["hybrid_upper_lower", "upper_lower", "full_body"] as SplitStyle[]);

  return fallbacks.find((candidate) => canUseSplitStyle(candidate, profile)) ?? splitStyle;
}

function pickPlannedDays(
  preferredWorkoutDays: string[] | undefined,
  targetSessions: number
): string[] {
  const normalizedPreferred = (preferredWorkoutDays ?? [])
    .map((day) => day.trim().toLowerCase())
    .filter((day): day is (typeof WORKOUT_DAY_ORDER)[number] =>
      WORKOUT_DAY_ORDER.includes(day as (typeof WORKOUT_DAY_ORDER)[number])
    );

  if (normalizedPreferred.length >= targetSessions) {
    return WORKOUT_DAY_ORDER.filter((day) => normalizedPreferred.includes(day)).slice(
      0,
      targetSessions
    );
  }

  if (normalizedPreferred.length > 0) {
    const filled = [...normalizedPreferred];

    for (const day of WORKOUT_DAY_ORDER) {
      if (filled.length >= targetSessions) {
        break;
      }

      if (!filled.includes(day)) {
        filled.push(day);
      }
    }

    return filled.slice(0, targetSessions);
  }

  return defaultWorkoutDays(targetSessions);
}

function defaultWorkoutDays(targetSessions: number): string[] {
  const patterns: Record<number, string[]> = {
    2: ["monday", "thursday"],
    3: ["monday", "wednesday", "friday"],
    4: ["monday", "tuesday", "thursday", "friday"],
    5: ["monday", "tuesday", "wednesday", "friday", "saturday"],
    6: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  };

  return patterns[targetSessions] ?? patterns[3];
}

function buildWorkoutSequence(
  splitStyle: SplitStyle,
  targetSessions: number,
  profile?: KaiUserProfile,
  memory?: KaiMemory
): string[] {
  const bias = deriveWeeklyBias(profile);
  const base =
    splitStyle === "full_body"
      ? ["full_body", "full_body", "full_body"]
      : splitStyle === "upper_lower"
        ? bias.lowerScore > bias.upperScore
          ? ["lower_body", "upper_body", "lower_body", "upper_body"]
          : ["upper_body", "lower_body", "upper_body", "lower_body"]
        : splitStyle === "hybrid_upper_lower"
        ? bias.lowerScore > bias.upperScore
            ? [
                "lower_body",
                "upper_body",
                "lower_body",
                "pull_day",
                "full_body",
                "upper_body"
              ]
            : bias.avoidPushHeavy
              ? [
                  "pull_day",
                  "lower_body",
                  "upper_body",
                  "lower_body",
                  "full_body",
                  "pull_day"
                ]
              : [
                  "push_day",
                  "pull_day",
                  "lower_body",
                  "upper_body",
                  "full_body",
                  "lower_body"
                ]
          : bias.pullScore > bias.pushScore && bias.pullScore >= bias.lowerScore
            ? ["pull_day", "push_day", "lower_body", "pull_day", "push_day", "lower_body"]
            : bias.lowerScore > bias.pushScore && bias.lowerScore > bias.pullScore
              ? ["lower_body", "push_day", "pull_day", "lower_body", "push_day", "pull_day"]
              : ["push_day", "pull_day", "lower_body", "push_day", "pull_day", "lower_body"];

  return applyWorkoutTypeConstraintsToSequence(
    orientSequenceFromSessionPattern(base, splitStyle, targetSessions, memory).slice(
      0,
      targetSessions
    ),
    profile
  );
}

function applyWorkoutTypeConstraintsToSequence(
  sequence: string[],
  profile?: KaiUserProfile
): string[] {
  if (!profile?.hardConstraints?.length) {
    return sequence;
  }

  return sequence.map((workoutType) =>
    isWorkoutTypeHardConstrained(workoutType, profile.hardConstraints)
      ? chooseAlternativeWorkoutType(workoutType, profile.hardConstraints)
      : workoutType
  );
}

function decidePlannedDuration(
  preferredSessionLength: number | undefined,
  experienceLevel: KaiUserProfile["experienceLevel"],
  memory?: KaiMemory,
  previousWeekSummary?: KaiWeeklySummary
): number {
  const baseline = preferredSessionLength ?? (experienceLevel === "intermediate" ? 55 : 40);
  let adjustedBaseline = baseline;

  if (memory?.recoveryStatus === "restarting") {
    adjustedBaseline = Math.max(25, Math.min(adjustedBaseline, 40));
  }

  if (memory?.recoveryStatus === "slipping") {
    adjustedBaseline = Math.max(30, Math.min(adjustedBaseline, 45));
  }

  if (memory?.recoveryStatus === "recovered") {
    adjustedBaseline = Math.max(35, adjustedBaseline);
  }

  if (previousWeekSummary?.plannedMissedCount && previousWeekSummary.plannedMissedCount >= 2) {
    adjustedBaseline = Math.max(25, adjustedBaseline - 10);
  } else if (
    previousWeekSummary?.weekStatus === "on_track" &&
    experienceLevel === "intermediate"
  ) {
    adjustedBaseline = Math.min(60, adjustedBaseline + 5);
  }

  return adjustedBaseline;
}

function finalizePlannedDuration(
  plannedDuration: number,
  splitStyle: SplitStyle,
  progressionIntent: NonNullable<KaiWeeklyPlanDay["progressionIntent"]>,
  profile: KaiUserProfile
): number {
  let adjusted = plannedDuration;
  const lowFrequencyIntermediateFullBody =
    splitStyle === "full_body" && profile.experienceLevel === "intermediate";

  if (lowFrequencyIntermediateFullBody) {
    adjusted = Math.min(adjusted, progressionIntent === "repeat" ? 42 : 45);
  }

  if (profile.confidenceLevel === "low") {
    adjusted = Math.max(25, adjusted - 5);
  }

  if (progressionIntent === "conservative" && lowFrequencyIntermediateFullBody) {
    adjusted = Math.max(25, Math.min(30, adjusted - 5));
  }

  if (progressionIntent === "build" && lowFrequencyIntermediateFullBody) {
    adjusted = Math.min(adjusted, 45);
  }

  return adjusted;
}

function buildPlanRationale(
  profile: KaiUserProfile,
  splitStyle: SplitStyle,
  targetSessions: number,
  memory?: KaiMemory,
  previousWeekSummary?: KaiWeeklySummary
): string {
  const roughLowFrequencyWeek = previousWeekSummary
    ? isRoughLowFrequencyWeek(profile, previousWeekSummary)
    : false;
  const recoveryNote =
    memory?.recoveryStatus === "restarting"
      ? "The week is deliberately simplified to rebuild momentum."
      : memory?.recoveryStatus === "slipping"
        ? "The week is slightly compressed to protect adherence."
        : memory?.recoveryStatus === "recovered"
          ? "The week can return to a fuller training rhythm."
          : "The week stays close to the user's normal training rhythm.";
  const adherenceNote =
    previousWeekSummary?.plannedMissedCount && previousWeekSummary.plannedMissedCount >= 2
      ? "Recent misses pulled the plan down to something easier to finish."
      : roughLowFrequencyWeek
        ? "Recent follow-through was shaky, so this week stays lighter and easier to complete."
      : previousWeekSummary?.weekStatus === "on_track"
        ? "Recent follow-through earned a slightly fuller week."
        : undefined;
  const preferenceNote = buildPreferenceNote(profile, splitStyle, memory);

  return `${targetSessions} planned sessions using a ${splitStyle.replaceAll("_", " ")} structure. ${recoveryNote}${adherenceNote ? ` ${adherenceNote}` : ""}${preferenceNote ? ` ${preferenceNote}` : ""}`;
}

function buildWorkoutRationale(
  workoutType: string,
  progressionIntent: NonNullable<KaiWeeklyPlanDay["progressionIntent"]>,
  profile: KaiUserProfile,
  memory?: KaiMemory
): string {
  const readableWorkoutType = formatWorkoutType(workoutType);
  const intentNote =
    progressionIntent === "build"
      ? "If readiness is good, let this be a forward-moving session."
      : progressionIntent === "repeat"
        ? "Keep this close to the last successful version and reinforce the pattern."
        : describeConservativeWorkoutRationale();
  const focusNote =
    profile.focusMuscles && profile.focusMuscles.length > 0
      ? `Bias safe choices toward ${profile.focusMuscles.slice(0, 2).join(" and ")}.`
      : "Use standard exercise selection for this day.";
  const confidenceNote =
    profile.confidenceLevel === "low"
      ? "Keep the session easy to start and easy to finish."
      : profile.confidenceLevel === "high"
        ? "If readiness is clean, this can be one of the more confident days in the week."
        : "Keep the session practical and repeatable.";
  const recoveryNote =
    memory?.recoveryStatus === "slipping" || memory?.recoveryStatus === "restarting"
      ? "Keep the session recoverable and avoid overbuilding volume."
      : "Run a normal productive session if readiness supports it.";

  return `${readableWorkoutType}. ${intentNote} ${recoveryNote} ${confidenceNote} ${focusNote}`;
}

function buildRestRationale(profile: KaiUserProfile, memory?: KaiMemory): string {
  if (memory?.recoveryStatus === "restarting") {
    return "Keep this day open so the week stays finishable.";
  }

  if (profile.goal === "build_consistency") {
    return "Use this as a low-friction recovery day to make the whole week easier to complete.";
  }

  return "Use this day for recovery so the planned sessions stay higher quality.";
}

function reshapeCurrentWeekDays(
  days: KaiWeeklyPlanDay[],
  asOf: string,
  profile: KaiUserProfile,
  memory: KaiMemory | undefined,
  workouts: WorkoutRecord[]
): KaiWeeklyPlanDay[] {
  const weekStart = days[0]?.date;

  if (!weekStart) {
    return days;
  }

  const priorWeekWorkouts = workouts.filter(
    (workout) =>
      workout.date >= weekStart &&
      workout.date < asOf &&
      (workout.status === "completed" || workout.status === "missed")
  );

  if (!priorWeekWorkouts.length) {
    return days;
  }

  const priorMisses = priorWeekWorkouts.filter(
    (workout) => workout.status === "missed"
  ).length;
  const latestMissedWorkout = [...priorWeekWorkouts]
    .filter((workout) => workout.status === "missed")
    .sort((left, right) =>
      right.date.localeCompare(left.date) ||
      (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "")
    )[0];
  const priorThinOrStrained = priorWeekWorkouts.filter((workout) =>
    isThinOrStrainedWeekWorkout(workout)
  ).length;

  if (priorMisses === 0 && priorThinOrStrained === 0) {
    return days;
  }

  const futurePlannedDays = days.filter(
    (day) => day.status === "planned" && day.date >= asOf
  );
  const futureRestDays = days.filter(
    (day) => day.status === "rest" && day.date > asOf
  );

  if (!futurePlannedDays.length && !futureRestDays.length) {
    return days;
  }

  const removableFutureDays = futurePlannedDays
    .filter((day) => day.date > asOf)
    .sort((left, right) => right.date.localeCompare(left.date));
  const rescheduledDate =
    priorMisses === 1 && latestMissedWorkout
      ? futureRestDays.sort((left, right) => left.date.localeCompare(right.date))[0]?.date
          ?? removableFutureDays[0]?.date
      : undefined;
  const dropCount = Math.min(
    priorMisses >= 2 ? 2 : 0,
    Math.max(removableFutureDays.length - (rescheduledDate ? 1 : 0), 0)
  );
  const removedDates = new Set(
    removableFutureDays
      .filter((day) => day.date !== rescheduledDate)
      .slice(0, dropCount)
      .map((day) => day.date)
  );

  return days.map((day) => {
    if (removedDates.has(day.date) && day.status === "planned") {
      return {
        date: day.date,
        dayName: day.dayName,
        status: "rest",
        rationale:
          "This day was freed up after an earlier miss so the remaining week stays finishable."
      };
    }

    if (rescheduledDate && latestMissedWorkout && day.status === "rest" && day.date === rescheduledDate) {
      const rescheduledHandling = summarizeComparableWorkoutHandling(
        latestMissedWorkout.type,
        asOf,
        workouts
      );
      const movedDuration = Math.max(
        25,
        latestMissedWorkout.plannedDuration - 10
      );

      return {
        date: day.date,
        dayName: day.dayName,
        status: "planned",
        workoutType: latestMissedWorkout.type,
        plannedDuration: movedDuration,
        progressionIntent: "conservative",
        exerciseIntent: buildDayExerciseIntent(latestMissedWorkout.type, profile),
        sessionTemplate: buildDaySessionTemplate(
          latestMissedWorkout.type,
          "conservative",
          profile,
          memory,
          rescheduledHandling,
          asOf,
          workouts
        ),
        rationale:
          "This rest slot was repurposed to catch up the earlier missed session without crowding the rest of the week."
      };
    }

    if (day.status !== "planned" || day.date < asOf || !day.workoutType) {
      return day;
    }

    if (rescheduledDate && latestMissedWorkout && day.date === rescheduledDate) {
      const rescheduledHandling = summarizeComparableWorkoutHandling(
        latestMissedWorkout.type,
        asOf,
        workouts
      );
      const movedDuration = Math.max(
        25,
        latestMissedWorkout.plannedDuration - 10
      );

      return {
        ...day,
        workoutType: latestMissedWorkout.type,
        plannedDuration: movedDuration,
        progressionIntent: "conservative",
        exerciseIntent: buildDayExerciseIntent(latestMissedWorkout.type, profile),
        sessionTemplate: buildDaySessionTemplate(
          latestMissedWorkout.type,
          "conservative",
          profile,
          memory,
          rescheduledHandling,
          asOf,
          workouts
        ),
        rationale:
          "This slot was repurposed to catch up the earlier missed session without overcrowding the rest of the week."
      };
    }

    const comparableWorkoutHandling = summarizeComparableWorkoutHandling(
      day.workoutType,
      asOf,
      workouts
    );
    const shouldCalmDay = priorMisses > 0 || priorThinOrStrained > 0;
    const currentIntent = day.progressionIntent ?? "repeat";
    const nextIntent = shouldCalmDay
      ? day.date === asOf && currentIntent === "build"
        ? "repeat"
        : "conservative"
      : currentIntent;
    const nextDuration = Math.max(
      25,
      (day.plannedDuration ?? profile.preferredSessionLength ?? 40) -
        (priorMisses > 0 ? 10 : 5)
    );

    return {
      ...day,
      plannedDuration: nextDuration,
      progressionIntent: nextIntent,
      sessionTemplate: buildDaySessionTemplate(
        day.workoutType,
        nextIntent,
        profile,
        memory,
        comparableWorkoutHandling,
        asOf,
        workouts
      ),
      rationale: `${day.rationale} The remaining week was calmed down after earlier missed or thin work.`
    };
  });
}

function formatWorkoutType(workoutType: string): string {
  const label = workoutType.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isThinOrStrainedWeekWorkout(workout: WorkoutRecord): boolean {
  if (workout.status !== "completed") {
    return false;
  }

  if (workout.outcomeSummary) {
    return workout.outcomeSummary.executionQuality === "survival";
  }

  return (
    (workout.completedDuration ?? 0) / Math.max(workout.plannedDuration, 1) < 0.7
  );
}

function decideProgressionIntent(
  workoutType: string,
  plannedIndex: number,
  targetSessions: number,
  profile: KaiUserProfile,
  memory?: KaiMemory,
  previousWeekSummary?: KaiWeeklySummary,
  comparableWorkoutHandling?: ComparableWorkoutHandling,
  workoutTypeReliability?: WorkoutTypeReliability
): NonNullable<KaiWeeklyPlanDay["progressionIntent"]> {
  const missedTooMuch =
    previousWeekSummary?.plannedMissedCount !== undefined &&
    (previousWeekSummary.plannedMissedCount >= 2 ||
      (previousWeekSummary.plannedCount >= 2 &&
        previousWeekSummary.planAdherencePercent < 50));
  const roughLowFrequencyWeek =
    previousWeekSummary && isRoughLowFrequencyWeek(profile, previousWeekSummary);

  if (
    memory?.recoveryStatus === "restarting" ||
    memory?.recoveryStatus === "slipping" ||
    missedTooMuch
  ) {
    return "conservative";
  }

  if (workoutTypeReliability?.trend === "fragile") {
    return plannedIndex === 0 ? "repeat" : "conservative";
  }

  if (comparableWorkoutHandling?.trend === "strained") {
    return plannedIndex === 0 ? "repeat" : "conservative";
  }

  if (profile.confidenceLevel === "low") {
    return plannedIndex === 0 ? "repeat" : "conservative";
  }

  if (isPainLimitedWorkoutType(workoutType, profile.painFlags)) {
    return plannedIndex === 0 ? "repeat" : "conservative";
  }

  if (targetSessions <= 3 && profile.experienceLevel === "intermediate") {
    if (roughLowFrequencyWeek) {
      return plannedIndex < 2 ? "conservative" : "repeat";
    }

    if (
      previousWeekSummary?.weekStatus === "on_track" &&
      hasStrongEnoughExecution(previousWeekSummary)
    ) {
      return plannedIndex === 1 ? "build" : "repeat";
    }

    if (plannedIndex === 1) {
      return "conservative";
    }

    return "repeat";
  }

  if (
    previousWeekSummary?.weekStatus === "on_track" &&
    hasStrongEnoughExecution(previousWeekSummary)
  ) {
    if (
      workoutTypeReliability?.trend === "mixed" &&
      (workoutTypeReliability.recentMisses > 0 || workoutTypeReliability.survivalRate > 0.25)
    ) {
      return plannedIndex === 0 ? "repeat" : comparableWorkoutHandling?.trend === "strong"
        ? "build"
        : "repeat";
    }

    if (comparableWorkoutHandling?.trend === "strong" && plannedIndex > 0) {
      return "build";
    }

    return plannedIndex === 0 ? "repeat" : "build";
  }

  return "repeat";
}

function hasStrongEnoughExecution(summary: KaiWeeklySummary): boolean {
  const strongSessionCount = summary.strongSessionCount ?? 0;
  const survivalSessionCount = summary.survivalSessionCount ?? 0;

  if (summary.completedCount === 0) {
    return false;
  }

  return (
    strongSessionCount >= Math.max(1, Math.floor(summary.completedCount / 2)) ||
    (summary.mainCoveragePercent >= 80 &&
      survivalSessionCount <= Math.floor(summary.completedCount / 3))
  );
}

function isRoughLowFrequencyWeek(
  profile: KaiUserProfile,
  previousWeekSummary: KaiWeeklySummary
): boolean {
  return (
    profile.experienceLevel === "intermediate" &&
    (profile.targetSessionsPerWeek ?? 3) <= 3 &&
    previousWeekSummary.plannedCount >= 3 &&
    previousWeekSummary.planAdherencePercent < 80
  );
}

function deriveWeeklyBias(profile?: KaiUserProfile): {
  upperScore: number;
  lowerScore: number;
  pushScore: number;
  pullScore: number;
  avoidPushHeavy: boolean;
  avoidPullHeavy: boolean;
  avoidLowerHeavy: boolean;
} {
  const focus = new Set(profile?.focusMuscles ?? []);
  const pain = new Set(profile?.painFlags ?? []);
  let upperScore = 0;
  let lowerScore = 0;
  let pushScore = 0;
  let pullScore = 0;

  upperScore += countMatches(focus, ["chest", "front_delts", "side_delts", "rear_delts", "lats", "upper_back", "rhomboids"]) * 0.8;
  lowerScore += countMatches(focus, ["quads", "glutes", "hamstrings", "calves"]) * 0.8;
  pushScore += countMatches(focus, ["chest", "front_delts", "side_delts", "triceps"]) * 0.9;
  pullScore += countMatches(focus, ["lats", "rear_delts", "biceps", "upper_back", "rhomboids"]) * 0.9;

  for (const exerciseId of profile?.favoriteExerciseIds ?? []) {
    const family = classifyExerciseFamily(exerciseId);
    upperScore += family.upper;
    lowerScore += family.lower;
    pushScore += family.push;
    pullScore += family.pull;
  }

  for (const exerciseId of profile?.dislikedExerciseIds ?? []) {
    const family = classifyExerciseFamily(exerciseId);
    upperScore -= family.upper * 0.7;
    lowerScore -= family.lower * 0.7;
    pushScore -= family.push * 0.9;
    pullScore -= family.pull * 0.9;
  }

  const avoidPushHeavy = countMatches(pain, ["chest", "front_delts", "triceps"]) >= 1;
  const avoidPullHeavy = countMatches(pain, ["lats", "rear_delts", "biceps", "upper_back", "rhomboids", "mid_traps", "upper_traps"]) >= 1;
  const avoidLowerHeavy = countMatches(pain, ["quads", "glutes", "hamstrings", "spinal_erectors", "calves"]) >= 1;

  if (avoidPushHeavy) {
    upperScore -= 1;
    pushScore -= 2;
  }

  if (avoidPullHeavy) {
    upperScore -= 0.5;
    pullScore -= 2;
  }

  if (avoidLowerHeavy) {
    lowerScore -= 2;
  }

  return {
    upperScore,
    lowerScore,
    pushScore,
    pullScore,
    avoidPushHeavy,
    avoidPullHeavy,
    avoidLowerHeavy
  };
}

function classifyExerciseFamily(exerciseId: string): {
  upper: number;
  lower: number;
  push: number;
  pull: number;
} {
  const exercise = getExerciseById(exerciseId);
  if (!exercise) {
    return { upper: 0, lower: 0, push: 0, pull: 0 };
  }

  const movement = exercise.movementPattern;
  const trainingEffects = new Set(exercise.trainingEffects ?? []);
  const upper =
    movement.includes("push") || movement.includes("pull") || trainingEffects.has("horizontal_press") || trainingEffects.has("vertical_pull") || trainingEffects.has("horizontal_row")
      ? 1
      : 0;
  const lower =
    trainingEffects.has("quad_bias") ||
    trainingEffects.has("squat_pattern") ||
    trainingEffects.has("hinge_heavy") ||
    trainingEffects.has("hamstring_isolation") ||
    trainingEffects.has("glute_bias") ||
    trainingEffects.has("calf_isolation")
      ? 1
      : 0;
  const push =
    movement.includes("push") ||
    trainingEffects.has("horizontal_press") ||
    trainingEffects.has("vertical_press") ||
    trainingEffects.has("chest_isolation")
      ? 1
      : 0;
  const pull =
    movement.includes("pull") ||
    trainingEffects.has("vertical_pull") ||
    trainingEffects.has("horizontal_row") ||
    trainingEffects.has("rear_delt_isolation") ||
    trainingEffects.has("biceps_isolation") ||
    trainingEffects.has("neutral_grip_curl")
      ? 1
      : 0;

  return { upper, lower, push, pull };
}

function countMatches(set: Set<string>, values: string[]): number {
  return values.filter((value) => set.has(value)).length;
}

function buildPreferenceNote(
  profile: KaiUserProfile,
  splitStyle: SplitStyle,
  memory?: KaiMemory
): string | undefined {
  const notes: string[] = [];

  if (profile.trainingStylePreference === "full_body" && splitStyle === "full_body") {
    notes.push("The week stays full-body first to match the user's preferred training style.");
  }

  if (profile.trainingStylePreference === "split_routine" && splitStyle !== "full_body") {
    notes.push("The week leans into a split structure because the user prefers more separation between days.");
  }

  if (profile.painFlags?.length) {
    notes.push(`Pain flags are nudging the week away from the highest-overlap day types around ${profile.painFlags.slice(0, 2).join(" and ")}.`);
  }

  const patternMemory = memory?.sessionPatternMemory;
  if (
    patternMemory &&
    patternMemory.structuredPatternConfidence >= 0.6 &&
    patternMemory.patternLabel !== "unsettled"
  ) {
    notes.push(
      `Recent training patterns are shaping the week toward a ${splitStyle.replaceAll("_", " ")} structure.`
    );
  }

  return notes[0];
}

function suggestSplitStyleFromSessionPattern(
  targetSessions: number,
  profile: KaiUserProfile,
  memory?: KaiMemory
): SplitStyle | undefined {
  const pattern = memory?.sessionPatternMemory;
  if (!pattern || pattern.structuredPatternConfidence < 0.6) {
    return undefined;
  }

  const dominantTypes = new Set(pattern.dominantWorkoutTypes);

  if (
    pattern.patternLabel === "repeat_day_by_day" ||
    dominantTypes.has("full_body")
  ) {
    return "full_body";
  }

  if (
    targetSessions >= 5 &&
    dominantTypes.has("push_day") &&
    dominantTypes.has("pull_day") &&
    dominantTypes.has("lower_body") &&
    profile.trainingStylePreference !== "full_body"
  ) {
    return "push_pull_legs";
  }

  if (
    dominantTypes.has("upper_body") &&
    dominantTypes.has("lower_body")
  ) {
    return targetSessions >= 4 ? "upper_lower" : "full_body";
  }

  return undefined;
}

function orientSequenceFromSessionPattern(
  baseSequence: string[],
  splitStyle: SplitStyle,
  targetSessions: number,
  memory?: KaiMemory
): string[] {
  const pattern = memory?.sessionPatternMemory;
  if (!pattern || pattern.structuredPatternConfidence < 0.6 || baseSequence.length === 0) {
    return baseSequence;
  }

  const preferredFirst =
    pattern.recentSequence.at(-1) ??
    pattern.dominantWorkoutTypes[0];

  if (!preferredFirst || !baseSequence.includes(preferredFirst)) {
    return baseSequence;
  }

  if (splitStyle === "upper_lower" || splitStyle === "push_pull_legs") {
    const firstIndex = baseSequence.indexOf(preferredFirst);
    if (firstIndex > 0) {
      return [...baseSequence.slice(firstIndex), ...baseSequence.slice(0, firstIndex)];
    }
  }

  if (splitStyle === "full_body" && targetSessions <= 3) {
    return baseSequence;
  }

  return baseSequence;
}

function suggestSplitStyleFromWorkoutType(workoutType: string): SplitStyle {
  if (workoutType === "full_body") {
    return "full_body";
  }

  if (workoutType === "upper_body" || workoutType === "lower_body") {
    return "upper_lower";
  }

  return "push_pull_legs";
}

function isPainLimitedWorkoutType(workoutType: string, painFlags?: string[]): boolean {
  const pain = new Set(painFlags ?? []);

  if (workoutType === "push_day") {
    return countMatches(pain, ["chest", "front_delts", "triceps"]) >= 1;
  }

  if (workoutType === "pull_day") {
    return countMatches(pain, ["lats", "rear_delts", "biceps", "upper_back", "rhomboids"]) >= 1;
  }

  if (workoutType === "lower_body") {
    return countMatches(pain, ["quads", "glutes", "hamstrings", "spinal_erectors", "calves"]) >= 1;
  }

  if (workoutType === "upper_body") {
    return countMatches(pain, ["chest", "front_delts", "triceps", "lats", "rear_delts", "biceps", "upper_back"]) >= 1;
  }

  return countMatches(pain, ["front_delts", "quads", "hamstrings", "upper_back"]) >= 2;
}

function getWorkoutDayKey(date: string): (typeof WORKOUT_DAY_ORDER)[number] {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return WORKOUT_DAY_ORDER[(day + 6) % 7];
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildDayExerciseIntent(
  workoutType: string,
  profile: KaiUserProfile
): NonNullable<KaiWeeklyPlanDay["exerciseIntent"]> {
  const focusMuscles = dedupeMuscles([
    ...relevantFocusMusclesForWorkoutType(workoutType, profile.focusMuscles),
    ...defaultFocusMusclesForWorkoutType(workoutType)
  ]).slice(0, 3);
  const avoidMuscles = dedupeMuscles(
    relevantPainFlagsForWorkoutType(workoutType, profile.painFlags).concat(
      relevantHardConstraintMusclesForWorkoutType(workoutType, profile.hardConstraints)
    )
  ).slice(0, 3);
  const preferredExerciseIds = (profile.favoriteExerciseIds ?? [])
    .filter((exerciseId) => isExerciseRelevantToWorkoutType(exerciseId, workoutType))
    .slice(0, 3);

  return {
    focusMuscles,
    avoidMuscles,
    preferredExerciseIds
  };
}

function buildDaySessionTemplate(
  workoutType: string,
  progressionIntent: NonNullable<KaiWeeklyPlanDay["progressionIntent"]>,
  profile: KaiUserProfile,
  memory?: KaiMemory,
  comparableWorkoutHandling?: ComparableWorkoutHandling,
  asOf?: string,
  workouts: WorkoutRecord[] = [],
  suggestedDayTemplateBias?: SuggestedDayTemplateBias
): NonNullable<KaiWeeklyPlanDay["sessionTemplate"]> {
  const effectGroups = getTemplateEffectsForWorkoutType(
    workoutType,
    progressionIntent,
    suggestedDayTemplateBias
  );
  const sessionStyle =
    progressionIntent === "build"
      ? "build"
      : progressionIntent === "conservative"
        ? "conservative"
        : "normal";
  const slotGroups =
    progressionIntent === "conservative"
      ? effectGroups.slice(0, 2)
      : effectGroups;

  return {
    sessionStyle,
    slots: slotGroups.map((group, index) => {
      const slot = index === 0 ? "main" : index === 1 ? "secondary" : "accessory";
      const candidateExerciseIds = pickTemplateCandidateExerciseIds(
        workoutType,
        group.targetEffects,
        profile,
        progressionIntent,
        slot,
        memory,
        comparableWorkoutHandling
      );
      const primaryExerciseReliability =
        candidateExerciseIds[0] && asOf
          ? summarizeExerciseReliability(candidateExerciseIds[0], asOf, workouts)
          : undefined;

      return {
        slot,
        label: group.label,
        targetEffects: group.targetEffects,
        candidateExerciseIds,
        selectionReason: candidateExerciseIds[0]
          ? buildTemplateSelectionReason(
              candidateExerciseIds[0],
              slot,
              workoutType,
              memory
            )
          : undefined,
        prescriptionIntent: buildSlotPrescriptionIntent(
          progressionIntent,
          slot,
          comparableWorkoutHandling
        ),
        progressionCue: buildSlotProgressionCue(
          progressionIntent,
          slot,
          comparableWorkoutHandling,
          primaryExerciseReliability
        )
      };
    })
  };
}

interface ComparableWorkoutHandling {
  trend: "strong" | "steady" | "strained";
  mainCovered: boolean;
  supportCovered: boolean;
  leadingFatigueTrend?: "clean" | "watch" | "strained";
}

interface WorkoutTypeReliability {
  trend: "reliable" | "mixed" | "fragile";
  completionRate: number;
  survivalRate: number;
  recentMisses: number;
}

interface ExerciseReliability {
  trend: "strong" | "steady" | "fragile";
  appearances: number;
  strongRate: number;
  survivalRate: number;
  performanceTrend?: "rising" | "steady" | "slipping" | "insufficient_data";
  performanceDeltaPercent?: number;
  latestWasPersonalBest?: boolean;
}

interface SuggestedDayTemplateBias {
  pattern: SuggestedDayBias;
  rationale: string;
}

function relevantFocusMusclesForWorkoutType(
  workoutType: string,
  focusMuscles?: MuscleGroup[]
): MuscleGroup[] {
  if (!focusMuscles?.length) {
    return [];
  }

  return focusMuscles.filter((muscle) => isMuscleRelevantToWorkoutType(muscle, workoutType));
}

function relevantPainFlagsForWorkoutType(
  workoutType: string,
  painFlags?: MuscleGroup[]
): MuscleGroup[] {
  if (!painFlags?.length) {
    return [];
  }

  return painFlags.filter((muscle) => isMuscleRelevantToWorkoutType(muscle, workoutType));
}

function defaultFocusMusclesForWorkoutType(workoutType: string): MuscleGroup[] {
  if (workoutType === "push_day") {
    return ["chest", "side_delts", "triceps"];
  }

  if (workoutType === "pull_day") {
    return ["lats", "upper_back", "biceps"];
  }

  if (workoutType === "lower_body") {
    return ["quads", "glutes", "hamstrings"];
  }

  if (workoutType === "upper_body") {
    return ["chest", "lats", "upper_back"];
  }

  return ["quads", "chest", "lats"];
}

export function summarizeSuggestedDayTemplateBias(
  workoutType: string,
  asOf: string,
  workouts: WorkoutRecord[]
): SuggestedDayTemplateBias | undefined {
  const comparableWorkouts = workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        workout.date < asOf &&
        (
          (workout.outcomeSummary?.performedWorkoutType ?? workout.type) === workoutType ||
          workout.type === workoutType
        )
    )
    .sort((left, right) =>
      right.date.localeCompare(left.date) ||
      (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "")
    )
    .slice(0, 3);

  if (comparableWorkouts.length < 2) {
    return undefined;
  }

  if (workoutType === "upper_body") {
    let pushScore = 0;
    let pullScore = 0;

    for (const workout of comparableWorkouts) {
      for (const sessionExercise of workout.sessionExercises ?? []) {
        const exercise = getExerciseById(sessionExercise.exerciseId);
        if (!exercise) {
          continue;
        }

        for (const effect of exercise.trainingEffects ?? []) {
          if (
            effect === "horizontal_press" ||
            effect === "vertical_press" ||
            effect === "chest_isolation" ||
            effect === "front_delt_press" ||
            effect === "triceps_isolation" ||
            effect === "cable_pressdown" ||
            effect === "overhead_triceps"
          ) {
            pushScore += 1;
          }

          if (
            effect === "vertical_pull" ||
            effect === "horizontal_row" ||
            effect === "rear_delt_isolation" ||
            effect === "biceps_isolation" ||
            effect === "neutral_grip_curl" ||
            effect === "trap_isolation"
          ) {
            pullScore += 1;
          }
        }
      }
    }

    if (pullScore - pushScore >= 2) {
      return {
        pattern: "pull_bias",
        rationale:
          "This suggested day is inferred from the user's recent training pattern and leans into the pull work they have actually been doing lately."
      };
    }

    if (pushScore - pullScore >= 2) {
      return {
        pattern: "push_bias",
        rationale:
          "This suggested day is inferred from the user's recent training pattern and leans into the press work they have actually been doing lately."
      };
    }
  }

  if (workoutType === "lower_body") {
    let quadScore = 0;
    let hingeScore = 0;

    for (const workout of comparableWorkouts) {
      for (const sessionExercise of workout.sessionExercises ?? []) {
        const exercise = getExerciseById(sessionExercise.exerciseId);
        if (!exercise) {
          continue;
        }

        for (const effect of exercise.trainingEffects ?? []) {
          if (
            effect === "squat_pattern" ||
            effect === "quad_bias" ||
            effect === "unilateral_leg"
          ) {
            quadScore += 1;
          }

          if (
            effect === "hinge_heavy" ||
            effect === "hamstring_isolation" ||
            effect === "glute_bias"
          ) {
            hingeScore += 1;
          }
        }
      }
    }

    if (hingeScore - quadScore >= 2) {
      return {
        pattern: "hinge_bias",
        rationale:
          "This suggested day is inferred from the user's recent training pattern and leans into the posterior-chain work they have actually been doing lately."
      };
    }

    if (quadScore - hingeScore >= 2) {
      return {
        pattern: "quad_bias",
        rationale:
          "This suggested day is inferred from the user's recent training pattern and leans into the quad-focused work they have actually been doing lately."
      };
    }
  }

  return undefined;
}

function buildSuggestedDayRationale(
  suggestedDayTemplateBias?: SuggestedDayTemplateBias
): string {
  return (
    suggestedDayTemplateBias?.rationale ??
    "This suggested day is inferred from the user's recent training pattern rather than a fixed planned session."
  );
}

function getTemplateEffectsForWorkoutType(
  workoutType: string,
  progressionIntent: NonNullable<KaiWeeklyPlanDay["progressionIntent"]>,
  suggestedDayTemplateBias?: SuggestedDayTemplateBias
): Array<{ label: string; targetEffects: TrainingEffect[] }> {
  const conservative = progressionIntent === "conservative";

  if (workoutType === "push_day") {
    return [
      {
        label: conservative ? "Low-overlap press" : "Primary push movement",
        targetEffects: conservative
          ? ["chest_isolation", "horizontal_press"]
          : ["horizontal_press", "vertical_press"]
      },
      {
        label: "Push support work",
        targetEffects: ["lateral_delt_isolation", "cable_pressdown", "triceps_isolation"]
      },
      {
        label: "Optional finishing work",
        targetEffects: ["chest_isolation", "side_delt_bias"]
      }
    ];
  }

  if (workoutType === "pull_day") {
    return [
      {
        label: conservative ? "Most recoverable pull" : "Primary pull movement",
        targetEffects: conservative
          ? ["vertical_pull", "rear_delt_isolation"]
          : ["vertical_pull", "horizontal_row"]
      },
      {
        label: "Upper-back or arm support",
        targetEffects: ["horizontal_row", "neutral_grip_curl", "biceps_isolation"]
      },
      {
        label: "Optional finishing work",
        targetEffects: ["rear_delt_isolation", "trap_isolation"]
      }
    ];
  }

  if (workoutType === "lower_body") {
    if (suggestedDayTemplateBias?.pattern === "hinge_bias") {
      return [
        {
          label: conservative ? "Most recoverable hinge" : "Primary hinge pattern",
          targetEffects: conservative
            ? ["glute_bias", "hamstring_isolation"]
            : ["hinge_heavy", "glute_bias", "hamstring_isolation"]
        },
        {
          label: "Quad or calf support",
          targetEffects: ["quad_bias", "unilateral_leg", "calf_isolation"]
        },
        {
          label: "Optional finishing work",
          targetEffects: ["calf_isolation", "quad_bias"]
        }
      ];
    }

    if (suggestedDayTemplateBias?.pattern === "quad_bias") {
      return [
        {
          label: conservative ? "Recoverable leg anchor" : "Primary squat pattern",
          targetEffects: conservative
            ? ["quad_bias", "unilateral_leg"]
            : ["squat_pattern", "quad_bias", "unilateral_leg"]
        },
        {
          label: "Posterior-chain support",
          targetEffects: ["hamstring_isolation", "glute_bias", "calf_isolation"]
        },
        {
          label: "Optional finishing work",
          targetEffects: ["calf_isolation", "quad_bias"]
        }
      ];
    }

    return [
      {
        label: conservative ? "Recoverable leg anchor" : "Primary lower-body movement",
        targetEffects: conservative
          ? ["quad_bias", "unilateral_leg"]
          : ["squat_pattern", "quad_bias", "hinge_heavy"]
      },
      {
        label: "Lower-body support work",
        targetEffects: ["hamstring_isolation", "glute_bias", "calf_isolation"]
      },
      {
        label: "Optional finishing work",
        targetEffects: ["calf_isolation", "quad_bias"]
      }
    ];
  }

  if (workoutType === "upper_body") {
    if (suggestedDayTemplateBias?.pattern === "pull_bias") {
      return [
        {
          label: conservative ? "Best-tolerated upper anchor" : "Primary pull-biased movement",
          targetEffects: conservative
            ? ["vertical_pull", "horizontal_row"]
            : ["vertical_pull", "horizontal_row", "rear_delt_isolation"]
        },
        {
          label: "Press or delt support",
          targetEffects: [
            "horizontal_press",
            "vertical_press",
            "lateral_delt_isolation",
            "chest_isolation"
          ]
        },
        {
          label: "Optional finishing work",
          targetEffects: ["rear_delt_isolation", "neutral_grip_curl", "biceps_isolation"]
        }
      ];
    }

    if (suggestedDayTemplateBias?.pattern === "push_bias") {
      return [
        {
          label: conservative ? "Best-tolerated upper anchor" : "Primary push-biased movement",
          targetEffects: conservative
            ? ["horizontal_press", "chest_isolation"]
            : ["horizontal_press", "vertical_press", "chest_isolation"]
        },
        {
          label: "Pull or delt support",
          targetEffects: ["horizontal_row", "vertical_pull", "lateral_delt_isolation"]
        },
        {
          label: "Optional finishing work",
          targetEffects: ["chest_isolation", "neutral_grip_curl", "rear_delt_isolation"]
        }
      ];
    }

    return [
      {
        label: conservative ? "Best-tolerated upper anchor" : "Primary upper-body movement",
        targetEffects: conservative
          ? ["vertical_pull", "horizontal_press"]
          : ["horizontal_press", "vertical_pull", "horizontal_row"]
      },
      {
        label: "Balanced upper support work",
        targetEffects: ["horizontal_row", "lateral_delt_isolation", "biceps_isolation"]
      },
      {
        label: "Optional finishing work",
        targetEffects: ["chest_isolation", "rear_delt_isolation", "neutral_grip_curl"]
      }
    ];
  }

  return [
    {
      label: conservative ? "Easier lower-body start" : "Lower-body anchor",
      targetEffects: conservative
        ? ["quad_bias", "unilateral_leg"]
        : ["quad_bias", "squat_pattern", "hinge_heavy"]
    },
    {
      label: "Simple upper-body support",
      targetEffects: ["horizontal_press", "vertical_pull", "horizontal_row"]
    },
    {
      label: "Optional finishing work",
      targetEffects: ["rear_delt_isolation", "calf_isolation", "neutral_grip_curl"]
    }
  ];
}

function pickTemplateCandidateExerciseIds(
  workoutType: string,
  targetEffects: TrainingEffect[],
  profile: KaiUserProfile,
  progressionIntent: NonNullable<KaiWeeklyPlanDay["progressionIntent"]>,
  slot: "main" | "secondary" | "accessory",
  memory?: KaiMemory,
  comparableWorkoutHandling?: ComparableWorkoutHandling
): string[] {
  const preferredFirst = (profile.favoriteExerciseIds ?? []).filter((exerciseId) =>
    isExerciseRelevantToWorkoutType(exerciseId, workoutType)
  );
  const substitutionPreferred = getSubstitutionPreferredExerciseIds(
    targetEffects,
    workoutType,
    profile,
    slot,
    memory
  );
  const candidates = preferredFirst
    .concat(substitutionPreferred)
    .concat(
      getLibraryCandidateExerciseIds(targetEffects, profile)
    )
    .filter((exerciseId, index, values) => values.indexOf(exerciseId) === index)
    .filter((exerciseId) => !profile.dislikedExerciseIds?.includes(exerciseId))
    .filter((exerciseId) => !exerciseTouchesPainFlag(exerciseId, profile.painFlags))
    .filter((exerciseId) => !exerciseViolatesHardConstraint(exerciseId, profile.hardConstraints))
    .filter((exerciseId) => isExerciseRelevantToWorkoutType(exerciseId, workoutType));
  const rankedCandidates = rankCandidatesFromSubstitutionMemory(
    candidates,
    slot,
    workoutType,
    memory
  );

  const maxCount =
    progressionIntent === "build"
      ? slot === "main"
        ? 4
        : 3
      : progressionIntent === "conservative"
        ? slot === "main"
          ? 2
          : 2
        : 3;

  return rankedCandidates.slice(
    0,
    adjustCandidateDepth(maxCount, slot, comparableWorkoutHandling)
  );
}

function getSubstitutionPreferredExerciseIds(
  targetEffects: TrainingEffect[],
  workoutType: string,
  profile: KaiUserProfile,
  slot: "main" | "secondary" | "accessory",
  memory?: KaiMemory
): string[] {
  const substitutionMemory = memory?.recommendationMemory?.bySubstitutedExerciseId;
  const substitutionSlotMemory =
    memory?.recommendationMemory?.bySubstitutedExerciseSlotKey;
  const substitutionWorkoutTypeMemory =
    memory?.recommendationMemory?.bySubstitutedWorkoutTypeExerciseKey;
  const substitutionPairMemory =
    memory?.recommendationMemory?.bySubstitutionPairKey;

  if (
    !substitutionMemory &&
    !substitutionSlotMemory &&
    !substitutionWorkoutTypeMemory &&
    !substitutionPairMemory
  ) {
    return [];
  }

  return buildSubstitutionCandidateScores(slot, memory, workoutType)
    .filter((entry) => entry.score >= 0.12 || entry.defaultFlipByPair)
    .map((entry) => entry.exerciseId)
    .filter((exerciseId) => !profile.dislikedExerciseIds?.includes(exerciseId))
    .filter((exerciseId) => !exerciseTouchesPainFlag(exerciseId, profile.painFlags))
    .filter((exerciseId) => !exerciseViolatesHardConstraint(exerciseId, profile.hardConstraints))
    .filter((exerciseId) => isExerciseRelevantToWorkoutType(exerciseId, workoutType))
    .filter((exerciseId) => {
      const exercise = getExerciseById(exerciseId);
      return exercise
        ? (exercise.trainingEffects ?? []).some((effect) => targetEffects.includes(effect))
        : false;
    })
    .slice(0, 2);
}

function rankCandidatesFromSubstitutionMemory(
  candidates: string[],
  slot: "main" | "secondary" | "accessory",
  workoutType: string,
  memory?: KaiMemory
): string[] {
  if (
    !candidates.length ||
    (!memory?.recommendationMemory?.bySubstitutedExerciseId &&
      !memory?.recommendationMemory?.bySubstitutedExerciseSlotKey &&
      !memory?.recommendationMemory?.bySubstitutedWorkoutTypeExerciseKey &&
      !memory?.recommendationMemory?.bySubstitutionPairKey)
  ) {
    return candidates;
  }

  const substitutionScores = new Map(
    buildSubstitutionCandidateScores(slot, memory, workoutType).map((entry) => [
      entry.exerciseId,
      entry.score
    ])
  );

  return [...candidates]
    .map((exerciseId, index) => ({
      exerciseId,
      index,
      substitutionScore: substitutionScores.get(exerciseId) ?? 0
    }))
    .sort((left, right) => {
      if (right.substitutionScore !== left.substitutionScore) {
        return right.substitutionScore - left.substitutionScore;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.exerciseId);
}

function buildSubstitutionCandidateScores(
  slot: "main" | "secondary" | "accessory",
  memory?: KaiMemory,
  workoutType?: string
): Array<{ exerciseId: string; score: number; defaultFlipByPair: boolean }> {
  const genericScores = memory?.recommendationMemory?.bySubstitutedExerciseId ?? {};
  const slotScores = memory?.recommendationMemory?.bySubstitutedExerciseSlotKey ?? {};
  const workoutTypeScores =
    memory?.recommendationMemory?.bySubstitutedWorkoutTypeExerciseKey ?? {};
  const pairScores = memory?.recommendationMemory?.bySubstitutionPairKey ?? {};
  const exerciseIds = new Set([
    ...Object.keys(genericScores),
    ...Object.keys(slotScores).map((key) => key.split(":").slice(1).join(":")),
    ...Object.keys(workoutTypeScores).map((key) => key.split(":").slice(1).join(":")),
    ...Object.keys(pairScores).map((key) => key.split("->")[1] ?? "")
  ]);

  return [...exerciseIds]
    .map((exerciseId) => {
      const pairScore = resolveSubstitutionPairScore(pairScores, exerciseId);
      const defaultFlipByPair = pairScore >= 0.5;

      return {
        exerciseId,
        score: roundToTwoDecimals(
          (genericScores[exerciseId] ?? 0) * 0.3 +
            (slotScores[`${slot}:${exerciseId}`] ?? 0) * 0.35 +
            ((workoutType ? workoutTypeScores[`${workoutType}:${exerciseId}`] ?? 0 : 0) * 0.2) +
            pairScore * 0.15 +
            (defaultFlipByPair ? 0.08 : 0)
        ),
        defaultFlipByPair
      };
    })
    .sort((left, right) => right.score - left.score);
}

function buildTemplateSelectionReason(
  exerciseId: string,
  slot: "main" | "secondary" | "accessory",
  workoutType: string,
  memory?: KaiMemory
): string | undefined {
  if (!memory?.recommendationMemory) {
    return undefined;
  }

  const genericScore =
    memory.recommendationMemory.bySubstitutedExerciseId?.[exerciseId] ?? 0;
  const slotScore =
    memory.recommendationMemory.bySubstitutedExerciseSlotKey?.[
      `${slot}:${exerciseId}`
    ] ?? 0;
  const workoutTypeScore =
    memory.recommendationMemory.bySubstitutedWorkoutTypeExerciseKey?.[
      `${workoutType}:${exerciseId}`
    ] ?? 0;
  const pairScore = resolveSubstitutionPairScore(
    memory.recommendationMemory.bySubstitutionPairKey ?? {},
    exerciseId
  );
  const strongestScore = Math.max(genericScore, slotScore, workoutTypeScore, pairScore);

  if (strongestScore < 0.18) {
    return undefined;
  }

  if (pairScore >= 0.5) {
    return "This lift is prioritized because the user has chosen this same preferred swap repeatedly, so it now becomes the default.";
  }

  if (pairScore >= strongestScore) {
    return "This lift is prioritized because it has become the user's preferred swap for this movement recently.";
  }

  if (workoutTypeScore >= strongestScore) {
    return "This lift is prioritized because it has been the more reliable version of this workout type recently.";
  }

  if (slotScore >= strongestScore) {
    return "This lift is prioritized because it has been the more reliable fit for this slot recently.";
  }

  return "This lift is prioritized because it has repeatedly worked well as a replacement recently.";
}

function resolveSubstitutionPairScore(
  pairScores: Record<string, number>,
  exerciseId: string
): number {
  return Object.entries(pairScores)
    .filter(([key]) => key.endsWith(`->${exerciseId}`))
    .reduce((best, [, score]) => Math.max(best, score), 0);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function adjustCandidateDepth(
  maxCount: number,
  slot: "main" | "secondary" | "accessory",
  comparableWorkoutHandling?: ComparableWorkoutHandling
): number {
  if (!comparableWorkoutHandling) {
    return maxCount;
  }

  if (slot !== "main" && !comparableWorkoutHandling.supportCovered) {
    return Math.max(1, Math.min(maxCount, 2));
  }

  if (slot === "main" && comparableWorkoutHandling.trend === "strained") {
    return Math.max(2, maxCount - 1);
  }

  if (slot === "main" && comparableWorkoutHandling.trend === "strong") {
    return Math.min(maxCount + 1, 4);
  }

  return maxCount;
}

function buildSlotPrescriptionIntent(
  progressionIntent: NonNullable<KaiWeeklyPlanDay["progressionIntent"]>,
  slot: "main" | "secondary" | "accessory",
  comparableWorkoutHandling?: ComparableWorkoutHandling
): NonNullable<KaiWeeklyPlanDay["sessionTemplate"]>["slots"][number]["prescriptionIntent"] {
  const base: NonNullable<KaiWeeklyPlanDay["sessionTemplate"]>["slots"][number]["prescriptionIntent"] =
    progressionIntent === "conservative"
      ? slot === "main"
        ? {
            sets: "low",
            reps: "hypertrophy_bias",
            effort: "submaximal"
          }
        : {
            sets: "low",
            reps: "pump_bias",
            effort: "submaximal"
          }
      : progressionIntent === "build"
        ? slot === "main"
          ? {
              sets: "high",
              reps: "strength_bias",
              effort: "push"
            }
          : slot === "secondary"
            ? {
                sets: "moderate",
                reps: "hypertrophy_bias",
                effort: "working"
              }
            : {
                sets: "moderate",
                reps: "pump_bias",
                effort: "working"
              }
        : slot === "main"
          ? {
              sets: "moderate",
              reps: "strength_bias",
              effort: "working"
            }
          : slot === "secondary"
            ? {
                sets: "moderate",
                reps: "hypertrophy_bias",
                effort: "working"
              }
            : {
                sets: "low",
                reps: "pump_bias",
                effort: "submaximal"
              };

  return applyComparableWorkoutHandling(base, slot, comparableWorkoutHandling);
}

function buildSlotProgressionCue(
  progressionIntent: NonNullable<KaiWeeklyPlanDay["progressionIntent"]>,
  slot: "main" | "secondary" | "accessory",
  comparableWorkoutHandling?: ComparableWorkoutHandling,
  exerciseReliability?: ExerciseReliability
): NonNullable<KaiWeeklyPlanDay["sessionTemplate"]>["slots"][number]["progressionCue"] {
  if (progressionIntent === "conservative") {
    return {
      action: "hold_back",
      reason: describeConservativeSlotCue(slot)
    };
  }

  if (comparableWorkoutHandling?.trend === "strained") {
    return {
      action: slot === "main" ? "repeat" : "hold_back",
      reason:
        slot === "main"
          ? "The last comparable session looked strained, so repeat before pushing."
          : "Support work has not held up well enough to push yet."
    };
  }

  if (comparableWorkoutHandling?.leadingFatigueTrend === "strained") {
    return {
      action: slot === "main" ? "repeat" : "hold_back",
      reason: describeStrainedComparableCue(slot)
    };
  }

  if (exerciseReliability?.trend === "fragile") {
    return {
      action: slot === "main" ? "repeat" : "hold_back",
      reason:
        slot === "main"
          ? "This lift has not looked stable enough recently to push yet."
          : "This lift has been unstable recently, so keep it easier to finish."
    };
  }

  if (exerciseReliability?.performanceTrend === "slipping") {
    return {
      action: slot === "main" ? "repeat" : "hold_back",
      reason:
        slot === "main"
          ? "This lift dipped recently, so repeat it cleanly before you ask it to climb again."
          : "This part has slipped recently, so keep it easier until it feels steadier again."
    };
  }

  if (slot !== "main" && comparableWorkoutHandling && !comparableWorkoutHandling.supportCovered) {
    return {
      action: "hold_back",
      reason: "Support work kept dropping off, so keep this slot easier to finish."
    };
  }

  if (slot === "main" && progressionIntent === "build") {
    return {
      action: "progress",
      reason:
        exerciseReliability?.latestWasPersonalBest
          ? "This lift just moved forward, so it has earned a small progression."
          : exerciseReliability?.performanceTrend === "rising"
          ? "This lift has been moving up cleanly, so it can take a small progression."
          : exerciseReliability?.trend === "strong"
          ? "This lift has repeated strongly enough to earn progression."
          : comparableWorkoutHandling?.trend === "strong"
          ? "Recent comparable work held up well, so this slot can progress."
          : "This slot is the best place to progress if the day feels good."
    };
  }

  return {
    action: "repeat",
    reason:
      slot === "main"
        ? "Keep this slot steady and look for a clean repeat."
        : "Use this slot to reinforce the day, not to force progression."
  };
}

function applyComparableWorkoutHandling(
  base: NonNullable<KaiWeeklyPlanDay["sessionTemplate"]>["slots"][number]["prescriptionIntent"],
  slot: "main" | "secondary" | "accessory",
  comparableWorkoutHandling?: ComparableWorkoutHandling
): NonNullable<KaiWeeklyPlanDay["sessionTemplate"]>["slots"][number]["prescriptionIntent"] {
  if (!comparableWorkoutHandling || comparableWorkoutHandling.trend === "steady") {
    if (slot !== "main" && comparableWorkoutHandling && !comparableWorkoutHandling.supportCovered) {
      return {
        sets: "low",
        reps: "pump_bias",
        effort: "submaximal"
      };
    }

    return base;
  }

  if (comparableWorkoutHandling.trend === "strong") {
    if (
      slot === "accessory" ||
      (slot === "secondary" && !comparableWorkoutHandling.supportCovered)
    ) {
      return base;
    }

    return {
      sets: nudgeSets(base.sets, 1),
      reps:
        slot === "main" && base.reps === "hypertrophy_bias"
          ? "strength_bias"
          : base.reps,
      effort: nudgeEffort(base.effort, 1)
    };
  }

  if (slot !== "main" && !comparableWorkoutHandling.supportCovered) {
    return {
      sets: "low",
      reps: "pump_bias",
      effort: "submaximal"
    };
  }

  return {
    sets: nudgeSets(base.sets, -1),
    reps:
      slot === "main"
        ? base.reps === "strength_bias"
          ? "hypertrophy_bias"
          : base.reps
        : "pump_bias",
    effort: nudgeEffort(base.effort, -1)
  };
}

function nudgeSets(
  sets: "low" | "moderate" | "high",
  direction: -1 | 1
): "low" | "moderate" | "high" {
  const scale = ["low", "moderate", "high"] as const;
  return scale[Math.max(0, Math.min(scale.length - 1, scale.indexOf(sets) + direction))];
}

function nudgeEffort(
  effort: "submaximal" | "working" | "push",
  direction: -1 | 1
): "submaximal" | "working" | "push" {
  const scale = ["submaximal", "working", "push"] as const;
  return scale[Math.max(0, Math.min(scale.length - 1, scale.indexOf(effort) + direction))];
}

function summarizeComparableWorkoutHandling(
  workoutType: string,
  asOf: string,
  workouts: WorkoutRecord[]
): ComparableWorkoutHandling | undefined {
  const comparable = workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        workout.type === workoutType &&
        workout.date < asOf &&
        (workout.completedDuration ?? 0) > 0
    )
    .sort((left, right) =>
      right.date.localeCompare(left.date) ||
      (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "")
    )
    .slice(0, 2);

  if (!comparable.length) {
    return undefined;
  }

  const coverage = comparable.map((workout) =>
    workout.outcomeSummary
      ? {
          coveredSlots: workout.outcomeSummary.coveredSlots,
          mainCovered: workout.outcomeSummary.mainCovered,
          supportCovered: workout.outcomeSummary.supportCovered,
          executionQuality: workout.outcomeSummary.executionQuality
        }
      : summarizeWorkoutSlotCoverage(workoutType, workout)
  );
  const averageDurationRatio =
    comparable.reduce(
      (sum, workout) =>
        sum +
        Math.min(
          1.2,
          (workout.completedDuration ?? 0) / Math.max(workout.plannedDuration, 1)
        ),
      0
    ) / comparable.length;
  const averageCoveredSlots =
    coverage.reduce((sum, workoutCoverage) => sum + workoutCoverage.coveredSlots, 0) /
    coverage.length;
  const averageExerciseCount =
    comparable.reduce(
      (sum, workout) => sum + (workout.sessionExercises?.length ?? 0),
      0
    ) / comparable.length;
  const mainCoverageRate =
    coverage.filter((workoutCoverage) => workoutCoverage.mainCovered).length / coverage.length;
  const supportCoverageRate =
    coverage.filter((workoutCoverage) => workoutCoverage.supportCovered).length / coverage.length;
  const averageExecutionScore =
    coverage.reduce(
      (sum, workoutCoverage) =>
        sum +
        (workoutCoverage.executionQuality === "strong"
          ? 1
          : workoutCoverage.executionQuality === "workable"
            ? 0.7
            : 0.35),
      0
    ) / coverage.length;
  const comparableLeadingFatigue = summarizeComparableWorkoutLeadingFatigue(comparable);

  if (
    averageDurationRatio >= 0.9 &&
    averageCoveredSlots >= 2.5 &&
    mainCoverageRate >= 1 &&
    averageExecutionScore >= 0.9
  ) {
    return {
      trend: "strong",
      mainCovered: true,
      supportCovered: supportCoverageRate >= 0.5,
      leadingFatigueTrend: comparableLeadingFatigue
    };
  }

  if (
    averageDurationRatio <= 0.7 ||
    mainCoverageRate < 1 ||
    averageExecutionScore < 0.6 ||
    (averageCoveredSlots < 2 && averageExerciseCount < 3)
  ) {
    return {
      trend: "strained",
      mainCovered: mainCoverageRate >= 0.5,
      supportCovered: supportCoverageRate >= 0.5,
      leadingFatigueTrend: comparableLeadingFatigue
    };
  }

  return {
    trend: "steady",
    mainCovered: mainCoverageRate >= 0.5,
    supportCovered: supportCoverageRate >= 0.5,
    leadingFatigueTrend: comparableLeadingFatigue
  };
}

function summarizeComparableWorkoutLeadingFatigue(
  workouts: WorkoutRecord[]
): ComparableWorkoutHandling["leadingFatigueTrend"] {
  if (!workouts.length) {
    return "clean";
  }

  const markerScores = workouts.map((workout) => {
    const summary = workout.outcomeSummary;
    if (!summary) {
      return 0;
    }

    const effortRise =
      summary.setEffortTrend === "rising" || summary.setEffortTrend === "sharp_rise";
    const restInflation = (summary.restInflationRatio ?? 0) >= 1.18;
    const repDropoff = (summary.repDropoffPercent ?? 0) >= 16;

    return Number(effortRise) + Number(restInflation) + Number(repDropoff);
  });

  const averageMarkerScore =
    markerScores.reduce((sum, score) => sum + score, 0) / markerScores.length;
  const anySharpRise = workouts.some(
    (workout) => workout.outcomeSummary?.setEffortTrend === "sharp_rise"
  );

  if (anySharpRise || averageMarkerScore >= 1.5) {
    return "strained";
  }

  if (averageMarkerScore >= 0.75) {
    return "watch";
  }

  return "clean";
}

function summarizeWorkoutTypeReliability(
  workoutType: string,
  asOf: string,
  workouts: WorkoutRecord[]
): WorkoutTypeReliability | undefined {
  const relevant = workouts
    .filter(
      (workout) =>
        workout.type === workoutType &&
        workout.date < asOf &&
        (workout.status === "completed" || workout.status === "missed")
    )
    .sort((left, right) =>
      right.date.localeCompare(left.date) ||
      (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "")
    )
    .slice(0, 4);

  if (!relevant.length) {
    return undefined;
  }

  const completed = relevant.filter((workout) => workout.status === "completed");
  const missed = relevant.filter((workout) => workout.status === "missed");
  const survivalCount = completed.filter((workout) =>
    isSurvivalStyleWorkout(workoutType, workout)
  ).length;
  const workableCount = completed.filter((workout) =>
    isWorkableOrBetterWorkout(workoutType, workout)
  ).length;
  const completionRate = completed.length / relevant.length;
  const survivalRate = completed.length ? survivalCount / completed.length : 1;
  const recentMisses = missed.length;

  if (
    relevant.length >= 2 &&
    (recentMisses >= 2 || completionRate < 0.6 || survivalRate >= 0.5)
  ) {
    return {
      trend: "fragile",
      completionRate,
      survivalRate,
      recentMisses
    };
  }

  if (
    completed.length >= 2 &&
    recentMisses === 0 &&
    workableCount >= Math.max(1, Math.ceil(completed.length * 0.75)) &&
    survivalRate < 0.25
  ) {
    return {
      trend: "reliable",
      completionRate,
      survivalRate,
      recentMisses
    };
  }

  return {
    trend: "mixed",
    completionRate,
    survivalRate,
    recentMisses
  };
}

function summarizeExerciseReliability(
  exerciseId: string,
  asOf: string,
  workouts: WorkoutRecord[]
): ExerciseReliability | undefined {
  const relevant = workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        workout.date < asOf &&
        workout.sessionExercises?.some((sessionExercise) => sessionExercise.exerciseId === exerciseId)
    )
    .sort((left, right) =>
      right.date.localeCompare(left.date) ||
      (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "")
    )
    .slice(0, 4);

  if (!relevant.length) {
    return undefined;
  }

  const strongCount = relevant.filter(
    (workout) => workout.outcomeSummary?.executionQuality === "strong"
  ).length;
  const survivalCount = relevant.filter(
    (workout) => workout.outcomeSummary?.executionQuality === "survival"
  ).length;
  const performanceSnapshots = relevant
    .map((workout) =>
      buildPlannerExercisePerformanceSnapshot(
        workout,
        workout.sessionExercises?.find(
          (sessionExercise) => sessionExercise.exerciseId === exerciseId
        )
      )
    )
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
  const performanceSummary = summarizePlannerExerciseProgression(performanceSnapshots);
  const strongRate = strongCount / relevant.length;
  const survivalRate = survivalCount / relevant.length;

  if (relevant.length >= 2 && strongRate >= 0.75) {
    return {
      trend: "strong",
      appearances: relevant.length,
      strongRate,
      survivalRate,
      ...performanceSummary
    };
  }

  if (relevant.length >= 2 && survivalRate >= 0.5) {
    return {
      trend: "fragile",
      appearances: relevant.length,
      strongRate,
      survivalRate,
      ...performanceSummary
    };
  }

  return {
    trend: "steady",
    appearances: relevant.length,
    strongRate,
    survivalRate,
    ...performanceSummary
  };
}

function buildPlannerExercisePerformanceSnapshot(
  workout: WorkoutRecord,
  sessionExercise?: NonNullable<WorkoutRecord["sessionExercises"]>[number]
):
  | {
      date: string;
      recordedAt: string;
      source: "weight_reps" | "reps_volume";
      score: number;
    }
  | undefined {
  if (!sessionExercise) {
    return undefined;
  }

  const performedSets = sessionExercise.performedSets?.filter(
    (setEntry) => setEntry.completed !== false
  );

  if (performedSets?.length) {
    const weightedScore = performedSets.reduce((sum, setEntry) => {
      if (typeof setEntry.weightKg !== "number" || setEntry.weightKg <= 0) {
        return sum;
      }

      return sum + setEntry.weightKg * Math.max(setEntry.reps, 0);
    }, 0);

    if (weightedScore > 0) {
      return {
        date: workout.date,
        recordedAt: workout.recordedAt,
        source: "weight_reps",
        score: roundToOneDecimal(weightedScore)
      };
    }

    const repVolumeScore = performedSets.reduce(
      (sum, setEntry) =>
        sum +
        Math.max(setEntry.reps, 0) *
          getPlannerEffortScoreMultiplier(setEntry.effort ?? sessionExercise.effort),
      0
    );

    if (repVolumeScore > 0) {
      return {
        date: workout.date,
        recordedAt: workout.recordedAt,
        source: "reps_volume",
        score: roundToOneDecimal(repVolumeScore)
      };
    }
  }

  const fallbackScore =
    Math.max(sessionExercise.sets, 0) *
    Math.max(sessionExercise.reps, 0) *
    getPlannerEffortScoreMultiplier(sessionExercise.effort);

  if (fallbackScore <= 0) {
    return undefined;
  }

  return {
    date: workout.date,
    recordedAt: workout.recordedAt,
    source: "reps_volume",
    score: roundToOneDecimal(fallbackScore)
  };
}

function summarizePlannerExerciseProgression(
  performanceSnapshots: Array<{
    date: string;
    recordedAt: string;
    source: "weight_reps" | "reps_volume";
    score: number;
  }>
): Pick<
  ExerciseReliability,
  "performanceTrend" | "performanceDeltaPercent" | "latestWasPersonalBest"
> {
  if (!performanceSnapshots.length) {
    return {
      performanceTrend: "insufficient_data"
    };
  }

  const weightedCount = performanceSnapshots.filter(
    (snapshot) => snapshot.source === "weight_reps"
  ).length;
  const preferredSource = weightedCount >= 2 ? "weight_reps" : "reps_volume";
  const comparableSnapshots = performanceSnapshots
    .filter((snapshot) => snapshot.source === preferredSource)
    .sort((left, right) => {
      const dateDelta = left.date.localeCompare(right.date);
      if (dateDelta !== 0) {
        return dateDelta;
      }

      return left.recordedAt.localeCompare(right.recordedAt);
    });
  const latestSnapshot = comparableSnapshots.at(-1);
  if (!latestSnapshot) {
    return {
      performanceTrend: "insufficient_data"
    };
  }

  const previousSnapshots = comparableSnapshots.slice(0, -1);
  const baselineSnapshots = previousSnapshots.slice(-Math.min(previousSnapshots.length, 2));
  const baselinePerformanceScore = baselineSnapshots.length
    ? roundToOneDecimal(
        baselineSnapshots.reduce((sum, snapshot) => sum + snapshot.score, 0) /
          baselineSnapshots.length
      )
    : undefined;
  const performanceDeltaPercent =
    baselinePerformanceScore && baselinePerformanceScore > 0
      ? roundToOneDecimal(
          ((latestSnapshot.score - baselinePerformanceScore) / baselinePerformanceScore) * 100
        )
      : undefined;
  const previousBest = previousSnapshots.reduce(
    (best, snapshot) => Math.max(best, snapshot.score),
    0
  );

  return {
    performanceTrend:
      performanceDeltaPercent === undefined
        ? "insufficient_data"
        : performanceDeltaPercent >= 5
        ? "rising"
        : performanceDeltaPercent <= -5
        ? "slipping"
        : "steady",
    performanceDeltaPercent,
    latestWasPersonalBest:
      previousSnapshots.length > 0 && latestSnapshot.score > previousBest * 1.005
  };
}

function getPlannerEffortScoreMultiplier(
  effort?: NonNullable<WorkoutRecord["sessionExercises"]>[number]["effort"]
): number {
  if (effort === "easy") {
    return 0.95;
  }

  if (effort === "hard") {
    return 1.08;
  }

  return 1;
}

function summarizeWorkoutSlotCoverage(
  workoutType: string,
  workout: WorkoutRecord
): {
  coveredSlots: number;
  mainCovered: boolean;
  supportCovered: boolean;
  executionQuality: "strong" | "workable" | "survival";
} {
  const templateGroups = getTemplateEffectsForWorkoutType(workoutType, "repeat");
  const covered = templateGroups.map((group, index) => {
    const slotCovered = (workout.sessionExercises ?? []).some((sessionExercise) => {
      const exercise = getExerciseById(sessionExercise.exerciseId);
      if (!exercise) {
        return false;
      }

      return (exercise.trainingEffects ?? []).some((effect) =>
        group.targetEffects.includes(effect)
      );
    });

    return {
      index,
      slotCovered
    };
  });

  return {
    coveredSlots: covered.filter((slot) => slot.slotCovered).length,
    mainCovered: covered[0]?.slotCovered ?? false,
    supportCovered: covered.slice(1).some((slot) => slot.slotCovered),
    executionQuality:
      (covered[0]?.slotCovered ?? false) &&
      covered.slice(1).some((slot) => slot.slotCovered) &&
      ((workout.completedDuration ?? 0) / Math.max(workout.plannedDuration, 1)) >= 0.85
        ? "strong"
        : (covered[0]?.slotCovered ?? false) &&
            ((workout.completedDuration ?? 0) / Math.max(workout.plannedDuration, 1)) >= 0.6
          ? "workable"
          : "survival"
  };
}

function isSurvivalStyleWorkout(workoutType: string, workout: WorkoutRecord): boolean {
  if (workout.outcomeSummary) {
    return workout.outcomeSummary.executionQuality === "survival";
  }

  return summarizeWorkoutSlotCoverage(workoutType, workout).executionQuality === "survival";
}

function isWorkableOrBetterWorkout(workoutType: string, workout: WorkoutRecord): boolean {
  if (workout.outcomeSummary) {
    return workout.outcomeSummary.executionQuality !== "survival";
  }

  return summarizeWorkoutSlotCoverage(workoutType, workout).executionQuality !== "survival";
}

function getLibraryCandidateExerciseIds(
  targetEffects: TrainingEffect[],
  profile: KaiUserProfile
): string[] {
  return targetEffects.flatMap((targetEffect) =>
    libraryExerciseIdsForEffect(targetEffect).filter(
      (exerciseId) => !profile.dislikedExerciseIds?.includes(exerciseId)
    )
  );
}

function libraryExerciseIdsForEffect(targetEffect: TrainingEffect): string[] {
  const preferred = exerciseIdsByEffect(targetEffect);
  return preferred.slice(0, 4);
}

function isMuscleRelevantToWorkoutType(muscle: MuscleGroup, workoutType: string): boolean {
  if (workoutType === "push_day") {
    return ["chest", "front_delts", "side_delts", "triceps"].includes(muscle);
  }

  if (workoutType === "pull_day") {
    return [
      "lats",
      "rear_delts",
      "biceps",
      "upper_back",
      "rhomboids",
      "mid_traps",
      "upper_traps"
    ].includes(muscle);
  }

  if (workoutType === "lower_body") {
    return ["quads", "glutes", "hamstrings", "calves", "spinal_erectors"].includes(muscle);
  }

  if (workoutType === "upper_body") {
    return [
      "chest",
      "front_delts",
      "side_delts",
      "rear_delts",
      "triceps",
      "lats",
      "biceps",
      "upper_back",
      "rhomboids"
    ].includes(muscle);
  }

  return [
    "quads",
    "glutes",
    "hamstrings",
    "calves",
    "chest",
    "front_delts",
    "side_delts",
    "rear_delts",
    "lats",
    "biceps",
    "triceps",
    "upper_back"
  ].includes(muscle);
}

function isExerciseRelevantToWorkoutType(exerciseId: string, workoutType: string): boolean {
  const family = classifyExerciseFamily(exerciseId);

  if (workoutType === "push_day") {
    return family.push > 0;
  }

  if (workoutType === "pull_day") {
    return family.pull > 0;
  }

  if (workoutType === "lower_body") {
    return family.lower > 0;
  }

  if (workoutType === "upper_body") {
    return family.upper > 0;
  }

  return family.upper > 0 || family.lower > 0;
}

function exerciseTouchesPainFlag(
  exerciseId: string,
  painFlags?: MuscleGroup[]
): boolean {
  if (!painFlags?.length) {
    return false;
  }

  const exercise = getExerciseById(exerciseId);
  if (!exercise) {
    return false;
  }

  const painSet = new Set(painFlags);
  return [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some((muscle) =>
    painSet.has(muscle)
  );
}

function exerciseViolatesHardConstraint(
  exerciseId: string,
  hardConstraints?: HardConstraint[]
): boolean {
  if (!hardConstraints?.length) {
    return false;
  }

  const exercise = getExerciseById(exerciseId);
  if (!exercise) {
    return false;
  }

  return hardConstraints.some((constraint) => {
    if (constraint.kind === "avoid_exercise") {
      return constraint.value === exerciseId;
    }

    if (constraint.kind === "avoid_muscle") {
      return [
        ...exercise.primaryMuscles,
        ...exercise.secondaryMuscles,
        ...exercise.stabilizers
      ].includes(constraint.value as MuscleGroup);
    }

    return false;
  });
}

function relevantHardConstraintMusclesForWorkoutType(
  workoutType: string,
  hardConstraints?: HardConstraint[]
): MuscleGroup[] {
  if (!hardConstraints?.length) {
    return [];
  }

  return hardConstraints
    .filter((constraint) => constraint.kind === "avoid_muscle")
    .map((constraint) => constraint.value as MuscleGroup)
    .filter((muscle) => isMuscleRelevantToWorkoutType(muscle, workoutType));
}

function isWorkoutTypeHardConstrained(
  workoutType: string,
  hardConstraints?: HardConstraint[]
): boolean {
  if (!hardConstraints?.length) {
    return false;
  }

  return hardConstraints.some(
    (constraint) =>
      constraint.kind === "avoid_workout_type" && constraint.value === workoutType
  );
}

function canUseSplitStyle(
  splitStyle: SplitStyle,
  profile: KaiUserProfile
): boolean {
  if (splitStyle === "full_body") {
    return !isWorkoutTypeHardConstrained("full_body", profile.hardConstraints);
  }

  if (splitStyle === "upper_lower") {
    return (
      !isWorkoutTypeHardConstrained("upper_body", profile.hardConstraints) &&
      !isWorkoutTypeHardConstrained("lower_body", profile.hardConstraints)
    );
  }

  if (splitStyle === "push_pull_legs") {
    return (
      !isWorkoutTypeHardConstrained("push_day", profile.hardConstraints) &&
      !isWorkoutTypeHardConstrained("pull_day", profile.hardConstraints) &&
      !isWorkoutTypeHardConstrained("lower_body", profile.hardConstraints)
    );
  }

  return (
    (!isWorkoutTypeHardConstrained("upper_body", profile.hardConstraints) ||
      !isWorkoutTypeHardConstrained("push_day", profile.hardConstraints) ||
      !isWorkoutTypeHardConstrained("pull_day", profile.hardConstraints)) &&
    (!isWorkoutTypeHardConstrained("lower_body", profile.hardConstraints) ||
      !isWorkoutTypeHardConstrained("full_body", profile.hardConstraints))
  );
}

function chooseAlternativeWorkoutType(
  workoutType: string,
  hardConstraints?: HardConstraint[]
): string {
  const fallbackOrder =
    workoutType === "lower_body"
      ? ["upper_body", "pull_day", "push_day", "full_body"]
      : workoutType === "upper_body"
        ? ["lower_body", "push_day", "pull_day", "full_body"]
        : workoutType === "push_day"
          ? ["upper_body", "pull_day", "lower_body", "full_body"]
          : workoutType === "pull_day"
            ? ["upper_body", "push_day", "lower_body", "full_body"]
            : ["upper_body", "lower_body", "push_day", "pull_day"];

  return (
    fallbackOrder.find(
      (candidate) => !isWorkoutTypeHardConstrained(candidate, hardConstraints)
    ) ?? workoutType
  );
}

function exerciseIdsByEffect(targetEffect: TrainingEffect): string[] {
  const ids = [
    "barbell_bench_press",
    "incline_dumbbell_press",
    "cable_chest_fly",
    "overhead_shoulder_press",
    "lateral_raise",
    "tricep_pushdown",
    "triceps_rope_pushdown",
    "lat_pulldown",
    "assisted_pull_up_machine",
    "pull_up",
    "chest_supported_machine_row",
    "single_arm_cable_row",
    "one_arm_dumbbell_row",
    "rear_delt_fly",
    "hammer_curl",
    "preacher_curl",
    "shrug",
    "leg_press",
    "squat",
    "barbell_back_squat",
    "bulgarian_split_squat",
    "walking_lunge",
    "romanian_deadlift",
    "leg_curl",
    "lying_leg_curl",
    "seated_leg_curl",
    "leg_extension",
    "calf_raise",
    "barbell_hip_thrust"
  ];

  return ids.filter((exerciseId) => {
    const exercise = getExerciseById(exerciseId);
    return exercise?.trainingEffects?.includes(targetEffect);
  });
}

function dedupeMuscles(values: MuscleGroup[]): MuscleGroup[] {
  return [...new Set(values)];
}
