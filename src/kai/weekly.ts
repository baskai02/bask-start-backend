import type {
  KaiCoachingMessage,
  KaiUserProfile,
  KaiWeeklySummary,
  PlannedWorkout,
  WorkoutRecord
} from "./types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function buildKaiWeeklySummary(
  workouts: WorkoutRecord[],
  plannedWorkouts: PlannedWorkout[],
  asOf: string
): KaiWeeklySummary {
  const { weekStart, weekEnd } = getWeekRange(asOf);
  const weeklyWorkouts = workouts.filter(
    (workout) => workout.date >= weekStart && workout.date <= weekEnd
  );
  const weeklyPlanned = plannedWorkouts.filter(
    (plannedWorkout) =>
      plannedWorkout.date >= weekStart && plannedWorkout.date <= weekEnd
  );

  let plannedCompletedCount = 0;
  let plannedMissedCount = 0;

  for (const plannedWorkout of weeklyPlanned) {
    const matchedWorkout = weeklyWorkouts.find(
      (workout) =>
        workout.date === plannedWorkout.date &&
        workout.type === plannedWorkout.type
    );

    if (matchedWorkout?.status === "completed") {
      plannedCompletedCount += 1;
      continue;
    }

    if (matchedWorkout?.status === "missed") {
      plannedMissedCount += 1;
    }
  }

  const completedCount = weeklyWorkouts.filter(
    (workout) => workout.status === "completed"
  ).length;
  const missedCount = weeklyWorkouts.filter(
    (workout) => workout.status === "missed"
  ).length;
  const remainingPlannedCount = Math.max(
    weeklyPlanned.length - plannedCompletedCount - plannedMissedCount,
    0
  );
  const planAdherencePercent =
    weeklyPlanned.length === 0
      ? 0
      : Math.round((plannedCompletedCount / weeklyPlanned.length) * 100);

  return {
    weekStart,
    weekEnd,
    weekStatus: decideWeekStatus({
      plannedCount: weeklyPlanned.length,
      completedCount,
      missedCount,
      plannedCompletedCount,
      plannedMissedCount
    }),
    plannedCount: weeklyPlanned.length,
    completedCount,
    missedCount,
    plannedCompletedCount,
    plannedMissedCount,
    unplannedCompletedCount: Math.max(completedCount - plannedCompletedCount, 0),
    remainingPlannedCount,
    planAdherencePercent
  };
}

export function buildKaiWeeklyCoachingMessage(
  summary: KaiWeeklySummary,
  profile?: KaiUserProfile,
  nextPlannedWorkout?: PlannedWorkout
): KaiCoachingMessage {
  const name = profile?.name ?? "there";
  const goal = profile?.goal ?? "build_consistency";
  const beginner = (profile?.experienceLevel ?? "beginner") === "beginner";
  const nextPlannedWorkoutStep = nextPlannedWorkout
    ? `Your next planned workout is ${formatPlannedWorkoutLabel(nextPlannedWorkout)}. Start there.`
    : undefined;

  if (summary.plannedCount > 0 && summary.plannedCompletedCount >= summary.plannedCount) {
    return {
      category: "celebrate",
      text: `${name}, you hit the full plan this week. That is exactly how real progress compounds.`,
      reason: "You completed every planned workout this week.",
      nextStep:
        nextPlannedWorkoutStep ??
        "Keep next week's plan realistic and repeat the same standard."
    };
  }

  if (summary.completedCount >= 3 && summary.missedCount === 0) {
    return {
      category: "celebrate",
      text: `${name}, strong week. You kept showing up and the pattern looks solid.`,
      reason: "You stacked multiple completed workouts this week without misses.",
      nextStep:
        nextPlannedWorkoutStep ??
        "Protect the same rhythm next week instead of adding complexity."
    };
  }

  if (summary.plannedMissedCount >= 2 || summary.missedCount >= 3) {
    return {
      category: "reset",
      text:
        goal === "build_consistency"
          ? `${name}, this week slipped. Reset by lowering the bar and making next week's plan easier to finish.`
          : `${name}, this week got away from you. Lower the bar and rebuild with a simpler plan next week.`,
      reason:
        summary.plannedMissedCount >= 2
          ? "You missed multiple planned workouts this week."
          : "Misses outweighed completed sessions this week.",
      nextStep:
        nextPlannedWorkoutStep ??
        "Set one or two very manageable planned workouts for next week and finish them."
    };
  }

  if (summary.plannedCompletedCount >= 1 && summary.plannedMissedCount >= 1) {
    return {
      category: "encourage",
      text: `${name}, parts of the week were on plan, parts slipped. There is something to build on here.`,
      reason: "You followed through on some planned workouts, but not all of them.",
      nextStep:
        nextPlannedWorkoutStep ??
        "Keep next week simple and try to finish the first planned session early."
    };
  }

  if (summary.completedCount >= 1) {
    return {
      category: "encourage",
      text: beginner
        ? `${name}, you got work done this week. Keep it simple and make next week repeatable.`
        : `${name}, you kept some momentum this week. Now turn that into a steadier pattern.`,
      reason:
        summary.unplannedCompletedCount > 0
          ? "You trained this week, even if it was not all driven by the plan."
          : "You got at least one workout done this week.",
      nextStep:
        nextPlannedWorkoutStep ??
        (summary.plannedCount > 0
          ? "Use the planned workouts next week to turn this into a steadier routine."
          : "Plan one or two workouts for next week and complete them.")
    };
  }

  return {
    category: "start",
    text: `${name}, this week is still at the start. That is okay, but it needs a cleaner opening move.`,
    reason: "You do not have enough completed sessions this week yet to call it a real pattern.",
    nextStep:
      nextPlannedWorkoutStep ?? "Plan one manageable workout for next week and finish it."
  };
}

function getWeekRange(asOf: string): { weekStart: string; weekEnd: string } {
  const date = new Date(`${asOf}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  const start = new Date(date.getTime() - daysFromMonday * DAY_IN_MS);
  const end = new Date(start.getTime() + 6 * DAY_IN_MS);

  return {
    weekStart: toDateString(start),
    weekEnd: toDateString(end)
  };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatPlannedWorkoutLabel(plannedWorkout: PlannedWorkout): string {
  return `${plannedWorkout.type.replaceAll("_", " ")} on ${plannedWorkout.date}`;
}

function decideWeekStatus(input: {
  plannedCount: number;
  completedCount: number;
  missedCount: number;
  plannedCompletedCount: number;
  plannedMissedCount: number;
}): "not_started" | "mixed" | "on_track" | "off_track" {
  if (input.plannedCount === 0 && input.completedCount === 0 && input.missedCount === 0) {
    return "not_started";
  }

  if (input.plannedCount > 0 && input.plannedCompletedCount === input.plannedCount) {
    return "on_track";
  }

  if (input.plannedMissedCount >= 2 || input.missedCount >= 3) {
    return "off_track";
  }

  if (input.completedCount > 0 || input.missedCount > 0) {
    return "mixed";
  }

  return "not_started";
}
