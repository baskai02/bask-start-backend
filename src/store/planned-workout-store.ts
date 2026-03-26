import type {
  PlannedWorkout,
  PlannedWorkoutInput
} from "../kai/types.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface PlannedWorkoutStore {
  getPlannedWorkouts(userId: string): PlannedWorkout[];
  findPlannedWorkout(userId: string, date: string, type?: string): PlannedWorkout | undefined;
  findNextPlannedWorkout(userId: string, asOf: string): PlannedWorkout | undefined;
  findNextPlannedWorkoutAfter(
    userId: string,
    asOf: string,
    excludePlannedWorkoutId?: string
  ): PlannedWorkout | undefined;
  savePlannedWorkout(input: PlannedWorkoutInput): PlannedWorkout[];
  clearPlannedWorkouts(userId: string): void;
}

interface PlannedWorkoutStoreOptions {
  storageFilePath?: string;
}

export function createPlannedWorkoutStore(
  options: PlannedWorkoutStoreOptions = {}
): PlannedWorkoutStore {
  const plannedWorkoutsByUser = loadJsonFile<Record<string, PlannedWorkout[]>>(
    options.storageFilePath,
    {}
  );

  return {
    getPlannedWorkouts(userId) {
      return [...(plannedWorkoutsByUser[userId] ?? [])].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
    },
    findPlannedWorkout(userId, date, type) {
      const plannedWorkouts = plannedWorkoutsByUser[userId] ?? [];

      return plannedWorkouts.find(
        (workout) =>
          workout.date === date && (type ? workout.type === type : true)
      );
    },
    findNextPlannedWorkout(userId, asOf) {
      const plannedWorkouts = plannedWorkoutsByUser[userId] ?? [];

      return [...plannedWorkouts]
        .filter((workout) => workout.date >= asOf)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    },
    findNextPlannedWorkoutAfter(userId, asOf, excludePlannedWorkoutId) {
      const plannedWorkouts = plannedWorkoutsByUser[userId] ?? [];

      return [...plannedWorkouts]
        .filter(
          (workout) =>
            workout.date >= asOf &&
            (!excludePlannedWorkoutId || workout.id !== excludePlannedWorkoutId)
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    },
    savePlannedWorkout(input) {
      const current = plannedWorkoutsByUser[input.userId] ?? [];
      const filtered = current.filter((workout) => workout.id !== input.id);
      const next = [...filtered, input].sort((a, b) => b.date.localeCompare(a.date));

      plannedWorkoutsByUser[input.userId] = next;
      saveJsonFile(options.storageFilePath, plannedWorkoutsByUser);
      return next;
    },
    clearPlannedWorkouts(userId) {
      delete plannedWorkoutsByUser[userId];
      saveJsonFile(options.storageFilePath, plannedWorkoutsByUser);
    }
  };
}
