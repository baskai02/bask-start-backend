import { createAppStore, type AppStore } from "./app-store.js";
import {
  createMemoryStore,
  type MemoryStore
} from "./memory-store.js";
import {
  createPlannedWorkoutStore,
  type PlannedWorkoutStore
} from "./planned-workout-store.js";
import {
  createReadinessHistoryStore,
  type ReadinessHistoryStore
} from "./readiness-history-store.js";
import {
  createWeeklyChapterHistoryStore,
  type WeeklyChapterHistoryStore
} from "./weekly-chapter-history-store.js";
import {
  createProfileStore,
  type ProfileStore
} from "./profile-store.js";
import type {
  KaiMemory,
  KaiWeeklyChapterHistoryEntry,
  KaiUserProfile,
  PlannedWorkout,
  WorkoutRecord
} from "../kai/types.js";
import type { ReadinessHistoryEntry } from "../exercises/types.js";

export interface BaskStateSnapshot {
  workouts: Record<string, WorkoutRecord[]>;
  profiles: Record<string, KaiUserProfile>;
  memory: Record<string, KaiMemory>;
  plannedWorkouts: Record<string, PlannedWorkout[]>;
  readinessHistory: Record<string, ReadinessHistoryEntry[]>;
  weeklyChapterHistory: Record<string, KaiWeeklyChapterHistoryEntry[]>;
}

export interface BaskUserStateSnapshot {
  workouts: WorkoutRecord[];
  profile: KaiUserProfile;
  memory?: KaiMemory;
  plannedWorkouts: PlannedWorkout[];
  readinessHistory: ReadinessHistoryEntry[];
  weeklyChapterHistory: KaiWeeklyChapterHistoryEntry[];
}

export interface BaskRepositories {
  workouts: AppStore;
  profiles: ProfileStore;
  memory: MemoryStore;
  plannedWorkouts: PlannedWorkoutStore;
  readinessHistory: ReadinessHistoryStore;
  weeklyChapterHistory: WeeklyChapterHistoryStore;
  exportState(): BaskStateSnapshot;
  importState(snapshot: BaskStateSnapshot): BaskStateSnapshot;
  exportUserState(userId: string): BaskUserStateSnapshot;
  importUserState(userId: string, snapshot: BaskUserStateSnapshot): BaskUserStateSnapshot;
}

interface LegacyBaskStateSnapshot {
  workouts: Record<string, WorkoutRecord[]>;
  profiles: Record<string, KaiUserProfile>;
  memory: Record<string, KaiMemory>;
  plannedWorkouts: Record<string, PlannedWorkout[]>;
  readinessHistory?: Record<string, ReadinessHistoryEntry[]>;
  weeklyChapterHistory?: Record<string, KaiWeeklyChapterHistoryEntry[]>;
}

interface LegacyBaskUserStateSnapshot {
  workouts: WorkoutRecord[];
  profile: KaiUserProfile;
  memory?: KaiMemory;
  plannedWorkouts: PlannedWorkout[];
  readinessHistory?: ReadinessHistoryEntry[];
  weeklyChapterHistory?: KaiWeeklyChapterHistoryEntry[];
}

export interface JsonRepositoryOptions {
  workoutsStorageFilePath?: string;
  profilesStorageFilePath?: string;
  memoryStorageFilePath?: string;
  plannedWorkoutsStorageFilePath?: string;
  readinessHistoryStorageFilePath?: string;
  weeklyChapterHistoryStorageFilePath?: string;
}

export function createJsonRepositories(
  options: JsonRepositoryOptions = {}
): BaskRepositories {
  const workouts = createAppStore({
      storageFilePath: options.workoutsStorageFilePath
    });
  const profiles = createProfileStore({
      storageFilePath: options.profilesStorageFilePath
    });
  const memory = createMemoryStore({
      storageFilePath: options.memoryStorageFilePath
    });
  const plannedWorkouts = createPlannedWorkoutStore({
      storageFilePath: options.plannedWorkoutsStorageFilePath
    });
  const readinessHistory = createReadinessHistoryStore({
      storageFilePath: options.readinessHistoryStorageFilePath
    });
  const weeklyChapterHistory = createWeeklyChapterHistoryStore({
      storageFilePath: options.weeklyChapterHistoryStorageFilePath
    });

  return {
    workouts,
    profiles,
    memory,
    plannedWorkouts,
    readinessHistory,
    weeklyChapterHistory,
    exportState() {
      return {
        workouts: workouts.exportWorkoutsState(),
        profiles: profiles.exportProfilesState(),
        memory: memory.exportMemoryState(),
        plannedWorkouts: plannedWorkouts.exportPlannedWorkoutsState(),
        readinessHistory: readinessHistory.exportReadinessHistoryState(),
        weeklyChapterHistory: weeklyChapterHistory.exportWeeklyChapterHistoryState()
      };
    },
    importState(snapshot) {
      const normalizedSnapshot = normalizeStateSnapshot(snapshot);

      workouts.replaceWorkoutsState(normalizedSnapshot.workouts);
      profiles.replaceProfilesState(normalizedSnapshot.profiles);
      memory.replaceMemoryState(normalizedSnapshot.memory);
      plannedWorkouts.replacePlannedWorkoutsState(normalizedSnapshot.plannedWorkouts);
      readinessHistory.replaceReadinessHistoryState(normalizedSnapshot.readinessHistory);
      weeklyChapterHistory.replaceWeeklyChapterHistoryState(
        normalizedSnapshot.weeklyChapterHistory
      );

      return this.exportState();
    },
    exportUserState(userId) {
      return {
        workouts: workouts.getWorkouts(userId),
        profile: profiles.getProfile(userId),
        memory: memory.getMemory(userId),
        plannedWorkouts: plannedWorkouts.getPlannedWorkouts(userId),
        readinessHistory: readinessHistory.getReadinessHistory(userId),
        weeklyChapterHistory: weeklyChapterHistory.getWeeklyChapterHistory(userId)
      };
    },
    importUserState(userId, snapshot) {
      const normalizedSnapshot = normalizeUserStateSnapshot(snapshot);
      const nextWorkoutsState = workouts.exportWorkoutsState();
      nextWorkoutsState[userId] = normalizedSnapshot.workouts;
      workouts.replaceWorkoutsState(nextWorkoutsState);

      const nextProfilesState = profiles.exportProfilesState();
      nextProfilesState[userId] = normalizedSnapshot.profile;
      profiles.replaceProfilesState(nextProfilesState);

      const nextMemoryState = memory.exportMemoryState();
      if (normalizedSnapshot.memory) {
        nextMemoryState[userId] = normalizedSnapshot.memory;
      } else {
        delete nextMemoryState[userId];
      }
      memory.replaceMemoryState(nextMemoryState);

      const nextPlannedWorkoutsState = plannedWorkouts.exportPlannedWorkoutsState();
      nextPlannedWorkoutsState[userId] = normalizedSnapshot.plannedWorkouts;
      plannedWorkouts.replacePlannedWorkoutsState(nextPlannedWorkoutsState);

      const nextReadinessHistoryState = readinessHistory.exportReadinessHistoryState();
      nextReadinessHistoryState[userId] = normalizedSnapshot.readinessHistory;
      readinessHistory.replaceReadinessHistoryState(nextReadinessHistoryState);

      const nextWeeklyChapterHistoryState =
        weeklyChapterHistory.exportWeeklyChapterHistoryState();
      nextWeeklyChapterHistoryState[userId] = normalizedSnapshot.weeklyChapterHistory;
      weeklyChapterHistory.replaceWeeklyChapterHistoryState(nextWeeklyChapterHistoryState);

      return this.exportUserState(userId);
    }
  };
}

function normalizeStateSnapshot(
  snapshot: BaskStateSnapshot | LegacyBaskStateSnapshot
): BaskStateSnapshot {
  return {
    workouts: snapshot.workouts,
    profiles: snapshot.profiles,
    memory: snapshot.memory,
    plannedWorkouts: snapshot.plannedWorkouts,
    readinessHistory: snapshot.readinessHistory ?? {},
    weeklyChapterHistory: snapshot.weeklyChapterHistory ?? {}
  };
}

function normalizeUserStateSnapshot(
  snapshot: BaskUserStateSnapshot | LegacyBaskUserStateSnapshot
): BaskUserStateSnapshot {
  return {
    workouts: snapshot.workouts,
    profile: snapshot.profile,
    memory: snapshot.memory,
    plannedWorkouts: snapshot.plannedWorkouts,
    readinessHistory: snapshot.readinessHistory ?? [],
    weeklyChapterHistory: snapshot.weeklyChapterHistory ?? []
  };
}
