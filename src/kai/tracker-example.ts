import {
  buildBehaviorSignals,
  recordWorkoutCompleted,
  recordWorkoutMissed
} from "./tracker.js";
import type { WorkoutRecord } from "./types.js";

let workouts: WorkoutRecord[] = [];

workouts = recordWorkoutCompleted(workouts, {
  id: "workout_1",
  userId: "user_1",
  date: "2026-03-15",
  type: "full_body",
  plannedDuration: 30,
  completedDuration: 28
});

workouts = recordWorkoutCompleted(workouts, {
  id: "workout_2",
  userId: "user_1",
  date: "2026-03-17",
  type: "upper_body",
  plannedDuration: 35,
  completedDuration: 35
});

workouts = recordWorkoutMissed(workouts, {
  id: "workout_3",
  userId: "user_1",
  date: "2026-03-18",
  type: "cardio",
  plannedDuration: 20
});

const signals = buildBehaviorSignals(workouts, "2026-03-19");

console.log("Tracked workouts:");
console.log(workouts);
console.log("");
console.log("Behavior signals:");
console.log(signals);
