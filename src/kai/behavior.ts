import type {
  BehaviorSignals,
  KaiConsistencyRisk,
  KaiMemory,
  KaiRecentEvent
} from "./types.js";

export type KaiRecoveryStatus =
  | "on_track"
  | "slipping"
  | "restarting"
  | "recovered";

export type KaiRecoveryActionType =
  | "log_short_session"
  | "complete_check_in"
  | "resume_last_pattern"
  | "minimum_viable_plan";

export interface KaiRecoveryAction {
  type: KaiRecoveryActionType;
  label: string;
  detail: string;
}

export interface KaiBehaviorSnapshot {
  recoveryStatus: KaiRecoveryStatus;
  recommendationTrustScore: number;
  nextAction?: KaiRecoveryAction;
}

interface BuildKaiBehaviorInput {
  signals: BehaviorSignals;
  consistencyRisk: KaiConsistencyRisk;
  previousMemory?: KaiMemory;
  recentEvent?: KaiRecentEvent;
}

export function buildKaiBehaviorSnapshot(
  input: BuildKaiBehaviorInput
): KaiBehaviorSnapshot {
  const recoveryStatus = deriveRecoveryStatus(input.signals, input.previousMemory);
  const recommendationTrustScore = deriveRecommendationTrustScore(
    input.signals,
    input.previousMemory,
    recoveryStatus
  );

  return {
    recoveryStatus,
    recommendationTrustScore,
    nextAction:
      recoveryStatus === "slipping" || recoveryStatus === "restarting"
        ? deriveRecoveryAction(input.signals, input.consistencyRisk, input.recentEvent)
        : undefined
  };
}

function deriveRecoveryStatus(
  signals: BehaviorSignals,
  previousMemory?: KaiMemory
): KaiRecoveryStatus {
  const previousStatus = previousMemory?.recoveryStatus;

  if (signals.currentStreak >= 3 || signals.consistencyStatus === "consistent") {
    if (previousStatus === "restarting" || previousStatus === "slipping") {
      return "recovered";
    }

    return "on_track";
  }

  if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 5) {
    return "slipping";
  }

  if (
    previousStatus === "slipping" &&
    (signals.recentCompletedCount >= 1 || signals.currentStreak >= 1)
  ) {
    return "restarting";
  }

  if (
    previousStatus === "restarting" &&
    signals.currentStreak >= 2 &&
    signals.recentMissedCount === 0
  ) {
    return "recovered";
  }

  if (signals.recentMissedCount >= 1 || signals.inactiveDays >= 3) {
    return "slipping";
  }

  return "on_track";
}

function deriveRecommendationTrustScore(
  signals: BehaviorSignals,
  previousMemory: KaiMemory | undefined,
  recoveryStatus: KaiRecoveryStatus
): number {
  const previousScore = previousMemory?.recommendationTrustScore ?? 0.5;
  let nextScore = previousScore;

  if (signals.currentStreak >= 2 || signals.consistencyStatus === "consistent") {
    nextScore += 0.05;
  }

  if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 4) {
    nextScore -= 0.06;
  } else if (signals.recentMissedCount >= 1) {
    nextScore -= 0.03;
  }

  if (recoveryStatus === "recovered") {
    nextScore += 0.04;
  } else if (recoveryStatus === "slipping") {
    nextScore -= 0.04;
  }

  return roundToTwoDecimals(clamp(nextScore, 0.2, 0.95));
}

function deriveRecoveryAction(
  signals: BehaviorSignals,
  consistencyRisk: KaiConsistencyRisk,
  recentEvent?: KaiRecentEvent
): KaiRecoveryAction {
  if (signals.inactiveDays >= 7 || signals.recentMissedCount >= 3) {
    return {
      type: "log_short_session",
      label: "Log one short session",
      detail: "Keep it brief and easy to finish. One clean rep is enough to restart momentum."
    };
  }

  if (consistencyRisk === "high" && recentEvent?.workoutType) {
    return {
      type: "resume_last_pattern",
      label: `Resume ${recentEvent.workoutType.replaceAll("_", " ")}`,
      detail: "Go back to the last recognizable pattern and make it small enough to complete."
    };
  }

  if (signals.recentMissedCount >= 2) {
    return {
      type: "minimum_viable_plan",
      label: "Reduce to a minimum viable week",
      detail: "Temporarily aim for the smallest week you can complete cleanly."
    };
  }

  return {
    type: "complete_check_in",
    label: "Complete a quick check-in",
    detail: "Use a quick reflection to reset the signal before pushing the plan harder."
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
