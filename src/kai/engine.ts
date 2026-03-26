import { decideKaiMessage } from "./rules.js";
import { buildKaiState } from "./state.js";
import { buildKaiMessage } from "./templates.js";
import type {
  KaiMessage,
  KaiState,
  ProgressLog,
  UserProfile,
  WorkoutEvent,
  WorkoutRecord
} from "./types.js";

export interface RunKaiCoachingInput {
  user: UserProfile;
  workouts: WorkoutRecord[];
  progressLogs: ProgressLog[];
  event: WorkoutEvent;
  previousState?: Partial<KaiState>;
}

export interface RunKaiCoachingResult {
  nextState: KaiState;
  message: KaiMessage;
}

export function runKaiCoaching(
  input: RunKaiCoachingInput
): RunKaiCoachingResult {
  const nextState = buildKaiState(
    input.workouts,
    input.event,
    input.previousState
  );

  const decision = decideKaiMessage({
    user: input.user,
    workouts: input.workouts,
    progressLogs: input.progressLogs,
    event: input.event,
    state: nextState
  });

  const message = buildKaiMessage(decision.messageType, decision.tone, {
    user: input.user,
    workouts: input.workouts,
    progressLogs: input.progressLogs,
    event: input.event,
    state: nextState
  });

  return {
    nextState: {
      ...nextState,
      lastKaiMessageType: message.type,
      lastKaiMessageAt: input.event.occurredAt
    },
    message
  };
}
