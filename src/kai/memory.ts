import type {
  BehaviorSignals,
  KaiConsistencyRisk,
  KaiMemory,
  KaiMotivationStyle,
  KaiRestartStyle,
  KaiUserProfile
} from "./types.js";

interface BuildKaiMemoryInput {
  profile: KaiUserProfile;
  signals: BehaviorSignals;
  previousMemory?: KaiMemory;
  asOf: string;
}

export function buildKaiMemory(input: BuildKaiMemoryInput): KaiMemory {
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
    consistencyRisk: decideConsistencyRisk(input.signals),
    coachingNote: buildCoachingNote(input.profile, input.signals),
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
  signals: BehaviorSignals
): string {
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
