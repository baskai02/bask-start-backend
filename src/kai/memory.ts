import { buildKaiBehaviorSnapshot } from "./behavior.js";
import { getExerciseById } from "../exercises/library.js";
import type {
  BehaviorSignals,
  KaiConsistencyRisk,
  KaiMemory,
  KaiRecentEvent,
  KaiSessionPatternMemory,
  KaiSuggestedWorkoutMemory,
  WorkoutOutcomeSummary,
  WorkoutRecord,
  KaiMotivationStyle,
  KaiRestartStyle,
  KaiUserProfile
} from "./types.js";

interface BuildKaiMemoryInput {
  profile: KaiUserProfile;
  signals: BehaviorSignals;
  previousMemory?: KaiMemory;
  recentEvent?: KaiRecentEvent;
  latestCompletedWorkout?: WorkoutRecord;
  workouts?: WorkoutRecord[];
  asOf: string;
}

export function buildKaiMemory(input: BuildKaiMemoryInput): KaiMemory {
  const consistencyRisk = decideConsistencyRisk(input.signals);
  const behavior = buildKaiBehaviorSnapshot({
    signals: input.signals,
    consistencyRisk,
    previousMemory: input.previousMemory,
    recentEvent: input.recentEvent
  });

  return {
    userId: input.profile.userId,
    name: input.profile.name,
    goal: input.profile.goal,
    experienceLevel: input.profile.experienceLevel,
    motivationStyle: decideMotivationStyle(input.profile, input.signals),
    consistencyStatus: input.signals.consistencyStatus,
    consistencyScore: input.signals.consistencyScore,
    currentStreak: input.signals.currentStreak,
    recentCompletedCount: input.signals.recentCompletedCount,
    recentMissedCount: input.signals.recentMissedCount,
    lastActivityAt: input.signals.lastActivityAt,
    restartStyle: decideRestartStyle(input.profile, input.signals, input.previousMemory),
    consistencyRisk,
    recoveryStatus: behavior.recoveryStatus,
    recommendationTrustScore: behavior.recommendationTrustScore,
    recommendationMemory: buildRecommendationMemory(
      input.previousMemory,
      input.latestCompletedWorkout,
      input.asOf
    ),
    sessionPatternMemory: buildSessionPatternMemory(input.workouts ?? [], input.asOf),
    suggestedWorkoutMemory: buildSuggestedWorkoutMemory(input.workouts ?? [], input.asOf),
    nextRecoveryAction: behavior.nextAction,
    coachingNote: buildCoachingNote(input.profile, input.signals, behavior),
    lastUpdated: input.asOf
  };
}

function decideMotivationStyle(
  profile: KaiUserProfile,
  signals: BehaviorSignals
): KaiMotivationStyle {
  if (profile.experienceLevel === "beginner") {
    return "supportive";
  }

  if (signals.recentMissedCount >= 3) {
    return "supportive";
  }

  if (signals.currentStreak >= 3 || signals.consistencyStatus === "consistent") {
    return "direct";
  }

  return "balanced";
}

function decideRestartStyle(
  profile: KaiUserProfile,
  signals: BehaviorSignals,
  previousMemory?: KaiMemory
): KaiRestartStyle {
  if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 4) {
    return "small_sessions";
  }

  if (
    previousMemory?.restartStyle === "small_sessions" &&
    signals.currentStreak < 3 &&
    signals.consistencyStatus !== "consistent"
  ) {
    return "small_sessions";
  }

  return profile.experienceLevel === "beginner"
    ? "small_sessions"
    : "standard_sessions";
}

function decideConsistencyRisk(signals: BehaviorSignals): KaiConsistencyRisk {
  if (signals.recentMissedCount >= 3 || signals.inactiveDays >= 4) {
    return "high";
  }

  if (signals.recentMissedCount >= 1 || signals.consistencyStatus === "building") {
    return "medium";
  }

  return "low";
}

function buildCoachingNote(
  profile: KaiUserProfile,
  signals: BehaviorSignals,
  behavior: ReturnType<typeof buildKaiBehaviorSnapshot>
): string {
  if (behavior.recoveryStatus === "slipping" && behavior.nextAction) {
    return `Recovery is slipping. ${behavior.nextAction.label} is the cleanest next move.`;
  }

  if (behavior.recoveryStatus === "restarting") {
    return "Momentum is rebuilding. Keep the next step small enough to repeat.";
  }

  if (signals.recentMissedCount >= 3) {
    return profile.goal === "build_consistency"
      ? "Needs low-friction resets after missed workouts."
      : "Needs a simpler rebuild step before pushing intensity.";
  }

  if (signals.currentStreak >= 3) {
    return "Responding well to rhythm and repeatable sessions.";
  }

  if (signals.recentCompletedCount >= 2) {
    return "Building consistency through recent follow-through.";
  }

  return "Needs clear, simple next steps to build rhythm.";
}

function buildRecommendationMemory(
  previousMemory: KaiMemory | undefined,
  latestCompletedWorkout: WorkoutRecord | undefined,
  asOf: string
): KaiMemory["recommendationMemory"] {
  const previous = previousMemory?.recommendationMemory ?? {
    byExerciseId: {},
    byExerciseSlotKey: {},
    byReasonTag: {},
    bySubstitutedExerciseId: {},
    bySubstitutedExerciseSlotKey: {},
    bySubstitutedWorkoutTypeExerciseKey: {},
    bySubstitutionPairKey: {}
  };
  const nextMemory: KaiMemory["recommendationMemory"] = {
    byExerciseId: { ...previous.byExerciseId },
    byExerciseSlotKey: { ...previous.byExerciseSlotKey },
    byReasonTag: { ...previous.byReasonTag },
    bySubstitutedExerciseId: { ...(previous.bySubstitutedExerciseId ?? {}) },
    bySubstitutedExerciseSlotKey: { ...(previous.bySubstitutedExerciseSlotKey ?? {}) },
    bySubstitutedWorkoutTypeExerciseKey: {
      ...(previous.bySubstitutedWorkoutTypeExerciseKey ?? {})
    },
    bySubstitutionPairKey: { ...(previous.bySubstitutionPairKey ?? {}) }
  };

  applyRecommendationMemoryDecay(
    nextMemory,
    calculateRecommendationMemoryDecayFactor(previousMemory?.lastUpdated, asOf)
  );

  if (!latestCompletedWorkout?.sessionExercises?.length) {
    return nextMemory;
  }

  for (const [index, sessionExercise] of latestCompletedWorkout.sessionExercises.entries()) {
    const sessionMultiplier = getOutcomeSessionMultiplier(
      latestCompletedWorkout.outcomeSummary
    );
    const current = nextMemory.byExerciseId[sessionExercise.exerciseId] ?? 0;
    nextMemory.byExerciseId[sessionExercise.exerciseId] = roundToTwoDecimals(
      clamp(current + 0.08 * sessionMultiplier, -0.32, 0.32)
    );

    const effectiveWorkoutType =
      latestCompletedWorkout.outcomeSummary?.performedWorkoutType ??
      latestCompletedWorkout.type;
    const inferredSlot = inferCompletedExerciseSlot(
      effectiveWorkoutType,
      sessionExercise.exerciseId,
      index,
      latestCompletedWorkout.sessionExercises.length
    );
    const slotKey = buildExerciseSlotKey(
      inferredSlot,
      sessionExercise.exerciseId
    );
    const slotMultiplier =
      inferredSlot === "main"
        ? latestCompletedWorkout.outcomeSummary?.mainCovered === false
          ? 0.5
          : 1
        : latestCompletedWorkout.outcomeSummary?.supportCovered === false
          ? 0.35
          : 1;
    const currentSlotValue = nextMemory.byExerciseSlotKey[slotKey] ?? 0;
    nextMemory.byExerciseSlotKey[slotKey] = roundToTwoDecimals(
      clamp(currentSlotValue + 0.08 * sessionMultiplier * slotMultiplier, -0.32, 0.32)
    );
  }

  for (const substitutedExerciseId of latestCompletedWorkout.executionFeedback?.substitutedExerciseIds ?? []) {
    const currentSubstitutionValue =
      nextMemory.bySubstitutedExerciseId?.[substitutedExerciseId] ?? 0;
    nextMemory.bySubstitutedExerciseId![substitutedExerciseId] = roundToTwoDecimals(
      clamp(currentSubstitutionValue + 0.12 * getOutcomeSessionMultiplier(latestCompletedWorkout.outcomeSummary), -0.4, 0.4)
    );

    const effectiveWorkoutType =
      latestCompletedWorkout.outcomeSummary?.performedWorkoutType ??
      latestCompletedWorkout.type;
    const workoutTypeExerciseKey = buildWorkoutTypeExerciseKey(
      effectiveWorkoutType,
      substitutedExerciseId
    );
    const currentWorkoutTypeSubstitutionValue =
      nextMemory.bySubstitutedWorkoutTypeExerciseKey?.[workoutTypeExerciseKey] ?? 0;
    nextMemory.bySubstitutedWorkoutTypeExerciseKey![workoutTypeExerciseKey] =
      roundToTwoDecimals(
        clamp(
          currentWorkoutTypeSubstitutionValue +
            0.15 * getOutcomeSessionMultiplier(latestCompletedWorkout.outcomeSummary),
          -0.5,
          0.5
        )
      );
    const substitutedIndex = latestCompletedWorkout.sessionExercises?.findIndex(
      (exercise) => exercise.exerciseId === substitutedExerciseId
    );
    if (substitutedIndex !== undefined && substitutedIndex >= 0) {
      const substitutedSlot = inferCompletedExerciseSlot(
        effectiveWorkoutType,
        substitutedExerciseId,
        substitutedIndex,
        latestCompletedWorkout.sessionExercises?.length ?? 1
      );
      const substitutedSlotKey = buildExerciseSlotKey(
        substitutedSlot,
        substitutedExerciseId
      );
      const currentSubstitutionSlotValue =
        nextMemory.bySubstitutedExerciseSlotKey?.[substitutedSlotKey] ?? 0;
      nextMemory.bySubstitutedExerciseSlotKey![substitutedSlotKey] = roundToTwoDecimals(
        clamp(
          currentSubstitutionSlotValue +
            0.14 * getOutcomeSessionMultiplier(latestCompletedWorkout.outcomeSummary),
          -0.45,
          0.45
        )
      );
    }
  }

  for (const pair of latestCompletedWorkout.executionFeedback?.substitutionPairs ?? []) {
    const pairKey = buildSubstitutionPairKey(
      pair.fromExerciseId,
      pair.toExerciseId
    );
    const currentPairValue =
      nextMemory.bySubstitutionPairKey?.[pairKey] ?? 0;
    nextMemory.bySubstitutionPairKey![pairKey] = roundToTwoDecimals(
      clamp(
        currentPairValue +
          0.18 * getOutcomeSessionMultiplier(latestCompletedWorkout.outcomeSummary),
        -0.55,
        0.55
      )
    );
  }

  return nextMemory;
}

function calculateRecommendationMemoryDecayFactor(
  previousLastUpdated: string | undefined,
  asOf: string
): number {
  if (!previousLastUpdated) {
    return 1;
  }

  const elapsedDays = diffInDays(previousLastUpdated, asOf);
  if (elapsedDays <= 0) {
    return 1;
  }

  return Math.pow(0.992, elapsedDays);
}

function applyRecommendationMemoryDecay(
  memory: KaiMemory["recommendationMemory"],
  decayFactor: number
): void {
  if (decayFactor >= 0.9999) {
    return;
  }

  decayRecommendationMap(memory.byExerciseId, decayFactor);
  decayRecommendationMap(memory.byExerciseSlotKey, decayFactor);
  decayRecommendationMap(memory.byReasonTag, decayFactor);
  decayRecommendationMap(memory.bySubstitutedExerciseId, decayFactor);
  decayRecommendationMap(memory.bySubstitutedExerciseSlotKey, decayFactor);
  decayRecommendationMap(memory.bySubstitutedWorkoutTypeExerciseKey, decayFactor);
  decayRecommendationMap(memory.bySubstitutionPairKey, decayFactor);
}

function decayRecommendationMap(
  values: Record<string, number> | undefined,
  decayFactor: number
): void {
  if (!values) {
    return;
  }

  for (const [key, value] of Object.entries(values)) {
    const nextValue = roundToTwoDecimals(value * decayFactor);
    if (Math.abs(nextValue) < 0.01) {
      delete values[key];
      continue;
    }

    values[key] = nextValue;
  }
}

function buildSessionPatternMemory(
  workouts: WorkoutRecord[],
  asOf: string
): KaiSessionPatternMemory {
  const recentCompleted = workouts
    .filter((workout) => workout.status === "completed" && workout.date <= asOf)
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      (left.recordedAt ?? "").localeCompare(right.recordedAt ?? "")
    )
    .slice(-6);

  if (!recentCompleted.length) {
    return {
      patternLabel: "unsettled",
      dominantWorkoutTypes: [],
      recentSequence: [],
      commonTransitions: [],
      structuredPatternConfidence: 0
    };
  }

  const recentSequence = recentCompleted.map((workout) =>
    toPatternWorkoutType(workout.outcomeSummary?.performedWorkoutType ?? workout.type)
  );
  const dominantWorkoutTypes = Object.entries(countBy(recentSequence))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([workoutType]) => workoutType);
  const transitions = recentSequence
    .slice(1)
    .map((workoutType, index) => `${recentSequence[index]}->${workoutType}`);
  const transitionCounts = countBy(transitions);
  const commonTransitions = Object.entries(transitionCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([transition]) => transition);
  const uniqueTypes = new Set(recentSequence).size;
  const repeatedTransitions = Object.values(transitionCounts).filter((count) => count >= 2).length;
  const structuredPatternConfidence = roundToTwoDecimals(
    Math.min(
      1,
      Math.max(
        0,
        (recentSequence.length >= 4 ? 0.35 : 0.15) +
          repeatedTransitions * 0.2 +
          (uniqueTypes <= 3 ? 0.15 : 0)
      )
    )
  );

  return {
    patternLabel: decideSessionPatternLabel(recentSequence, uniqueTypes, repeatedTransitions),
    dominantWorkoutTypes,
    recentSequence,
    commonTransitions,
    structuredPatternConfidence
  };
}

function buildSuggestedWorkoutMemory(
  workouts: WorkoutRecord[],
  asOf: string
): KaiSuggestedWorkoutMemory {
  const recentCompleted = workouts
    .filter((workout) => workout.status === "completed" && workout.date <= asOf)
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      (left.recordedAt ?? "").localeCompare(right.recordedAt ?? "")
    )
    .slice(-8);

  if (!recentCompleted.length) {
    return {
      overallFollowThroughRate: 0
    };
  }

  let explicitSuggestedSessions = 0;
  let followedSuggestedSessions = 0;
  const driftCounts: Record<string, number> = {};
  const suggestionFollowThroughCounts: Record<string, { explicit: number; followed: number }> = {};

  for (const workout of recentCompleted) {
    const followedSuggested = workout.outcomeSummary?.followedSuggestedWorkoutType;
    if (followedSuggested === undefined) {
      continue;
    }

    explicitSuggestedSessions += 1;
    if (followedSuggested) {
      followedSuggestedSessions += 1;
    }

    const suggestedType = workout.type;
    const performedType = workout.outcomeSummary?.performedWorkoutType;
    if (!suggestionFollowThroughCounts[suggestedType]) {
      suggestionFollowThroughCounts[suggestedType] = { explicit: 0, followed: 0 };
    }
    suggestionFollowThroughCounts[suggestedType].explicit += 1;
    if (followedSuggested) {
      suggestionFollowThroughCounts[suggestedType].followed += 1;
    }

    if (!performedType || performedType === suggestedType || followedSuggested) {
      continue;
    }

    const driftKey = `${suggestedType}->${performedType}`;
    driftCounts[driftKey] = (driftCounts[driftKey] ?? 0) + 1;
  }

  const dominantDriftEntry = Object.entries(driftCounts).sort((left, right) => right[1] - left[1])[0];
  if (!dominantDriftEntry) {
    return {
      overallFollowThroughRate: roundToTwoDecimals(
        explicitSuggestedSessions > 0 ? followedSuggestedSessions / explicitSuggestedSessions : 0
      )
    };
  }

  const [driftKey, occurrences] = dominantDriftEntry;
  const [suggestedWorkoutType, performedWorkoutType] = driftKey.split("->");
  const followThroughStats = suggestionFollowThroughCounts[suggestedWorkoutType] ?? {
    explicit: 0,
    followed: 0
  };

  return {
    overallFollowThroughRate: roundToTwoDecimals(
      explicitSuggestedSessions > 0 ? followedSuggestedSessions / explicitSuggestedSessions : 0
    ),
    dominantDrift: {
      suggestedWorkoutType,
      performedWorkoutType,
      occurrences,
      followThroughRate: roundToTwoDecimals(
        followThroughStats.explicit > 0
          ? followThroughStats.followed / followThroughStats.explicit
          : 0
      )
    }
  };
}

function decideSessionPatternLabel(
  recentSequence: string[],
  uniqueTypes: number,
  repeatedTransitions: number
): KaiSessionPatternMemory["patternLabel"] {
  if (recentSequence.length < 3) {
    return "unsettled";
  }

  if (uniqueTypes <= 3 && repeatedTransitions >= 2) {
    return "stable_split";
  }

  if (uniqueTypes <= 2 && repeatedTransitions >= 1) {
    return "alternating_mix";
  }

  if (uniqueTypes === 1) {
    return "repeat_day_by_day";
  }

  return "unsettled";
}

function inferCompletedExerciseSlot(
  workoutType: string,
  exerciseId: string,
  index: number,
  sessionLength: number
): "main" | "secondary" | "accessory" {
  if (index === 0) {
    return "main";
  }

  const exercise = getExerciseById(exerciseId);
  if (!exercise) {
    return index >= Math.max(2, sessionLength - 1) ? "accessory" : "secondary";
  }

  const lowerFatigueAccessory =
    exercise.liftType === "isolation" ||
    exercise.systemicFatigue === "low" ||
    (exercise.trainingEffects ?? []).some((effect) =>
      [
        "calf_isolation",
        "rear_delt_isolation",
        "neutral_grip_curl",
        "biceps_isolation",
        "lateral_delt_isolation",
        "triceps_isolation",
        "cable_pressdown",
        "chest_isolation"
      ].includes(effect)
    );

  if (index >= Math.max(2, sessionLength - 1) || lowerFatigueAccessory) {
    return "accessory";
  }

  if (workoutType === "full_body" && index === 1) {
    return "secondary";
  }

  return "secondary";
}

function toPatternWorkoutType(workoutType: string): string {
  if (workoutType === "push_day" || workoutType === "pull_day" || workoutType === "upper_body") {
    return "upper_body";
  }

  return workoutType;
}

function buildExerciseSlotKey(
  slot: "main" | "secondary" | "accessory",
  exerciseId: string
): string {
  return `${slot}:${exerciseId}`;
}

function buildWorkoutTypeExerciseKey(
  workoutType: string,
  exerciseId: string
): string {
  return `${workoutType}:${exerciseId}`;
}

function buildSubstitutionPairKey(
  fromExerciseId: string,
  toExerciseId: string
): string {
  return `${fromExerciseId}->${toExerciseId}`;
}

function getOutcomeSessionMultiplier(
  outcomeSummary: WorkoutOutcomeSummary | undefined
): number {
  let multiplier = 1;

  if (outcomeSummary?.executionQuality === "strong") {
    multiplier = 1;
  } else if (outcomeSummary?.executionQuality === "workable") {
    multiplier = 0.7;
  } else if (outcomeSummary?.executionQuality === "survival") {
    multiplier = 0.4;
  } else {
    const sessionSize = outcomeSummary?.sessionSize;
    if (sessionSize === "full") {
      multiplier = 1;
    } else if (sessionSize === "partial") {
      multiplier = 0.75;
    } else if (sessionSize === "thin") {
      multiplier = 0.45;
    }
  }

  if (outcomeSummary?.followedPlannedWorkout || outcomeSummary?.followedSuggestedWorkoutType) {
    multiplier += 0.1;
  } else if (outcomeSummary?.followedPlannedWorkout === false) {
    multiplier -= 0.1;
  }

  if ((outcomeSummary?.substitutionCount ?? 0) > 0) {
    multiplier *= Math.max(0.7, 1 - (outcomeSummary?.substitutionCount ?? 0) * 0.08);
  }

  return roundToTwoDecimals(clamp(multiplier, 0.25, 1.1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function diffInDays(from: string, to: string): number {
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);

  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime <= fromTime) {
    return 0;
  }

  return Math.floor((toTime - fromTime) / (1000 * 60 * 60 * 24));
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
