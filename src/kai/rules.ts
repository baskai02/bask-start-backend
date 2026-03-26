import type { KaiContext, KaiMessageType, TonePreference } from "./types.js";

export interface KaiDecision {
  messageType: KaiMessageType;
  tone: TonePreference;
}

export function decideKaiMessage(context: KaiContext): KaiDecision {
  const tone = decideTone(context);
  const messageType = decideMessageType(context);

  return { messageType, tone };
}

function decideMessageType(context: KaiContext): KaiMessageType {
  const { event, state, user } = context;

  if (event.type === "weekly_check_in") {
    return "reflection";
  }

  if (event.type === "progress_logged") {
    return "celebration";
  }

  if (event.type === "user_returned") {
    return "reinforcement";
  }

  if (event.type === "workout_missed") {
    if (state.recentMissedCount >= 2 || state.inactiveDays >= 3) {
      return "reset";
    }

    return "accountability";
  }

  if (event.type === "workout_completed") {
    if ([3, 5, 7].includes(state.currentStreak)) {
      return "celebration";
    }

    if (user.experienceLevel === "beginner") {
      return "confidence";
    }

    return "reinforcement";
  }

  return "reinforcement";
}

function decideTone(context: KaiContext): TonePreference {
  const { user, state } = context;

  if (user.tonePreference !== "balanced") {
    return user.tonePreference;
  }

  if (user.experienceLevel === "beginner") {
    return "supportive";
  }

  if (state.momentumState === "slipping" || state.inactiveDays >= 3) {
    return "supportive";
  }

  return "direct";
}
