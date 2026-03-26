import type {
  BehaviorSignals,
  KaiRecentEvent,
  KaiUserProfile,
  WorkoutRecord
} from "./types.js";

export interface KaiAgentContext {
  profile: KaiUserProfile;
  signals: BehaviorSignals;
  recentEvent: KaiRecentEvent;
  workoutHistory: Array<{
    date: string;
    type: string;
    status: WorkoutRecord["status"];
    plannedDuration: number;
  }>;
}

export interface KaiAgentResponse {
  message: string;
  reason: string;
  nextStep: string;
}
