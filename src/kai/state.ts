import type { KaiState, WorkoutEvent, WorkoutRecord } from "./types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function buildKaiState(
  workouts: WorkoutRecord[],
  event: WorkoutEvent,
  previousState?: Partial<KaiState>
): KaiState {
  const eventDate = new Date(event.occurredAt);
  const recentWorkouts = workouts.filter((workout) => {
    const workoutDate = new Date(workout.date);
    const diffInDays = Math.floor(
      (eventDate.getTime() - workoutDate.getTime()) / DAY_IN_MS
    );
    return diffInDays >= 0 && diffInDays <= 7;
  });

  const recentCompletedCount = recentWorkouts.filter(
    (workout) => workout.status === "completed"
  ).length;

  const recentMissedCount = recentWorkouts.filter(
    (workout) => workout.status === "missed"
  ).length;

  const completedWorkouts = workouts
    .filter((workout) => workout.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentStreak = calculateCurrentStreak(completedWorkouts);
  const longestStreak = Math.max(previousState?.longestStreak ?? 0, currentStreak);
  const inactiveDays = calculateInactiveDays(workouts, event.occurredAt);
  const consistencyScore = calculateConsistencyScore(
    recentCompletedCount,
    recentMissedCount
  );

  return {
    consistencyScore,
    recentMissedCount,
    recentCompletedCount,
    currentStreak,
    longestStreak,
    inactiveDays,
    momentumState: decideMomentumState(
      recentCompletedCount,
      recentMissedCount,
      inactiveDays
    ),
    lastKaiMessageType: previousState?.lastKaiMessageType,
    lastKaiMessageAt: previousState?.lastKaiMessageAt
  };
}

function calculateCurrentStreak(completedWorkouts: WorkoutRecord[]): number {
  if (completedWorkouts.length === 0) {
    return 0;
  }

  let streak = 1;

  for (let i = completedWorkouts.length - 1; i > 0; i -= 1) {
    const currentDate = new Date(completedWorkouts[i].date);
    const previousDate = new Date(completedWorkouts[i - 1].date);
    const diffInDays = Math.floor(
      (currentDate.getTime() - previousDate.getTime()) / DAY_IN_MS
    );

    if (diffInDays <= 2) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

function calculateInactiveDays(workouts: WorkoutRecord[], occurredAt: string): number {
  const latestCompletedWorkout = workouts
    .filter((workout) => workout.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!latestCompletedWorkout) {
    return 999;
  }

  const now = new Date(occurredAt);
  const lastWorkoutDate = new Date(latestCompletedWorkout.date);

  return Math.floor((now.getTime() - lastWorkoutDate.getTime()) / DAY_IN_MS);
}

function calculateConsistencyScore(
  recentCompletedCount: number,
  recentMissedCount: number
): number {
  const rawScore = recentCompletedCount * 25 - recentMissedCount * 15 + 50;
  return Math.max(0, Math.min(100, rawScore));
}

function decideMomentumState(
  recentCompletedCount: number,
  recentMissedCount: number,
  inactiveDays: number
): KaiState["momentumState"] {
  if (inactiveDays >= 5) {
    return "returning";
  }

  if (recentMissedCount >= 2) {
    return "slipping";
  }

  if (recentCompletedCount >= 2) {
    return "steady";
  }

  return "starting";
}
