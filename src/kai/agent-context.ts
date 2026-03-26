import type { KaiAgentContext } from "./agent-types.js";
import type {
  BehaviorSignals,
  KaiRecentEvent,
  KaiUserProfile,
  WorkoutRecord
} from "./types.js";

interface BuildKaiAgentContextInput {
  profile: KaiUserProfile;
  signals: BehaviorSignals;
  recentEvent: KaiRecentEvent;
  workouts: WorkoutRecord[];
}

export function buildKaiAgentContext(
  input: BuildKaiAgentContextInput
): KaiAgentContext {
  return {
    profile: input.profile,
    signals: input.signals,
    recentEvent: input.recentEvent,
    workoutHistory: input.workouts
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((workout) => ({
        date: workout.date,
        type: workout.type,
        status: workout.status,
        plannedDuration: workout.plannedDuration
      }))
  };
}
