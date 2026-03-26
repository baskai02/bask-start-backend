import { runKaiCoaching } from "./engine.js";
import type { UserProfile, WorkoutEvent, WorkoutRecord } from "./types.js";

const user: UserProfile = {
  userId: "user_1",
  name: "Oliver",
  goal: "build_consistency",
  experienceLevel: "beginner",
  preferredWorkoutDays: ["monday", "wednesday", "friday"],
  targetSessionsPerWeek: 3,
  preferredSessionLength: 30,
  tonePreference: "balanced"
};

const workouts: WorkoutRecord[] = [
  {
    id: "workout_1",
    userId: "user_1",
    date: "2026-03-15",
    recordedAt: "2026-03-15T08:00:00.000Z",
    type: "full_body",
    plannedDuration: 30,
    completedDuration: 28,
    status: "completed"
  },
  {
    id: "workout_2",
    userId: "user_1",
    date: "2026-03-17",
    recordedAt: "2026-03-17T08:00:00.000Z",
    type: "full_body",
    plannedDuration: 30,
    completedDuration: 32,
    status: "completed"
  }
];

const event: WorkoutEvent = {
  type: "workout_completed",
  userId: "user_1",
  occurredAt: "2026-03-19"
};

const result = runKaiCoaching({
  user,
  workouts,
  progressLogs: [],
  event
});

console.log(result);
