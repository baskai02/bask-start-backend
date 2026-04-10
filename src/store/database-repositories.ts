import { resolve } from "node:path";
import type { AppStore } from "./app-store.js";
import type { MemoryStore } from "./memory-store.js";
import type { PlannedWorkoutStore } from "./planned-workout-store.js";
import type { ProfileStore } from "./profile-store.js";
import type { ReadinessHistoryStore } from "./readiness-history-store.js";
import type { WeeklyChapterHistoryStore } from "./weekly-chapter-history-store.js";
import {
  createJsonRepositories,
  type BaskRepositories,
  type BaskStateSnapshot,
  type BaskUserStateSnapshot
} from "./repositories.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface DatabaseStateAdapter {
  readState(): BaskStateSnapshot;
  writeState(snapshot: BaskStateSnapshot): void;
}

export interface DatabaseRepositoryOptions {
  adapter: DatabaseStateAdapter;
}

export interface PersistedRepositoryOptions {
  initialState: BaskStateSnapshot;
  persistSnapshot(snapshot: BaskStateSnapshot): void | Promise<void>;
}

export interface FileDatabaseAdapterOptions {
  stateFilePath: string;
  initialState?: BaskStateSnapshot;
}

export function createDatabaseRepositories(
  options: DatabaseRepositoryOptions
): BaskRepositories {
  return createPersistedRepositories({
    initialState: options.adapter.readState(),
    persistSnapshot: (snapshot) => options.adapter.writeState(snapshot)
  });
}

export function createPersistedRepositories(
  options: PersistedRepositoryOptions
): BaskRepositories {
  const repositories = createJsonRepositories();
  repositories.importState(options.initialState);

  const persist = () => {
    void options.persistSnapshot(repositories.exportState());
  };

  const workouts = wrapWorkoutStore(repositories.workouts, persist);
  const profiles = wrapProfileStore(repositories.profiles, persist);
  const memory = wrapMemoryStore(repositories.memory, persist);
  const plannedWorkouts = wrapPlannedWorkoutStore(
    repositories.plannedWorkouts,
    persist
  );
  const readinessHistory = wrapReadinessHistoryStore(
    repositories.readinessHistory,
    persist
  );
  const weeklyChapterHistory = wrapWeeklyChapterHistoryStore(
    repositories.weeklyChapterHistory,
    persist
  );

  return {
    workouts,
    profiles,
    memory,
    plannedWorkouts,
    readinessHistory,
    weeklyChapterHistory,
    exportState: repositories.exportState,
    importState(snapshot: BaskStateSnapshot) {
      const imported = repositories.importState(snapshot);
      persist();
      return imported;
    },
    exportUserState: repositories.exportUserState,
    importUserState(userId: string, snapshot: BaskUserStateSnapshot) {
      const imported = repositories.importUserState(userId, snapshot);
      persist();
      return imported;
    }
  };
}

export function createInMemoryDatabaseAdapter(
  initialState: BaskStateSnapshot = createEmptyStateSnapshot()
): DatabaseStateAdapter {
  let snapshot = structuredClone(initialState);

  return {
    readState() {
      return structuredClone(snapshot);
    },
    writeState(nextSnapshot) {
      snapshot = structuredClone(nextSnapshot);
    }
  };
}

export function createFileDatabaseAdapter(
  options: FileDatabaseAdapterOptions
): DatabaseStateAdapter {
  const stateFilePath = resolve(options.stateFilePath);
  const loadedSnapshot = loadJsonFile<unknown>(stateFilePath);
  const fallbackSnapshot =
    options.initialState ? structuredClone(options.initialState) : createEmptyStateSnapshot();

  if (loadedSnapshot !== undefined && !isBaskStateSnapshot(loadedSnapshot)) {
    throw new Error(
      `Invalid backend state snapshot in ${stateFilePath}. Expected { workouts, profiles, memory, plannedWorkouts, readinessHistory?, weeklyChapterHistory? }.`
    );
  }

  let snapshot =
    loadedSnapshot === undefined
      ? fallbackSnapshot
      : structuredClone(loadedSnapshot);

  saveJsonFile(stateFilePath, snapshot);

  return {
    readState() {
      return structuredClone(snapshot);
    },
    writeState(nextSnapshot) {
      snapshot = structuredClone(nextSnapshot);
      saveJsonFile(stateFilePath, snapshot);
    }
  };
}

function wrapWorkoutStore(store: AppStore, persist: () => void): AppStore {
  return {
    ...store,
    replaceWorkoutsState(nextState) {
      store.replaceWorkoutsState(nextState);
      persist();
    },
    recordCompletedWorkout(input) {
      const result = store.recordCompletedWorkout(input);
      persist();
      return result;
    },
    recordMissedWorkout(input) {
      const result = store.recordMissedWorkout(input);
      persist();
      return result;
    },
    clearWorkouts(userId) {
      store.clearWorkouts(userId);
      persist();
    }
  };
}

function createEmptyStateSnapshot(): BaskStateSnapshot {
  return {
    workouts: {},
    profiles: {},
    memory: {},
    plannedWorkouts: {},
    readinessHistory: {},
    weeklyChapterHistory: {}
  };
}

function isBaskStateSnapshot(value: unknown): value is BaskStateSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRecordOfArrays(value.workouts) &&
    isRecord(value.profiles) &&
    isRecord(value.memory) &&
    isRecordOfArrays(value.plannedWorkouts) &&
    (value.readinessHistory === undefined || isRecordOfArrays(value.readinessHistory)) &&
    (value.weeklyChapterHistory === undefined ||
      isRecordOfArrays(value.weeklyChapterHistory))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordOfArrays(value: unknown): value is Record<string, unknown[]> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => Array.isArray(entry))
  );
}

function wrapProfileStore(store: ProfileStore, persist: () => void): ProfileStore {
  return {
    ...store,
    replaceProfilesState(nextState) {
      store.replaceProfilesState(nextState);
      persist();
    },
    saveProfile(profile) {
      const result = store.saveProfile(profile);
      persist();
      return result;
    },
    saveProfileSnapshot(profile) {
      const result = store.saveProfileSnapshot(profile);
      persist();
      return result;
    }
  };
}

function wrapMemoryStore(store: MemoryStore, persist: () => void): MemoryStore {
  return {
    ...store,
    replaceMemoryState(nextState) {
      store.replaceMemoryState(nextState);
      persist();
    },
    updateMemory(input) {
      const result = store.updateMemory(input);
      persist();
      return result;
    }
  };
}

function wrapPlannedWorkoutStore(
  store: PlannedWorkoutStore,
  persist: () => void
): PlannedWorkoutStore {
  return {
    ...store,
    replacePlannedWorkoutsState(nextState) {
      store.replacePlannedWorkoutsState(nextState);
      persist();
    },
    savePlannedWorkout(input) {
      const result = store.savePlannedWorkout(input);
      persist();
      return result;
    },
    replacePlannedWorkoutsInRange(userId, startDate, endDate, inputs) {
      const result = store.replacePlannedWorkoutsInRange(
        userId,
        startDate,
        endDate,
        inputs
      );
      persist();
      return result;
    },
    clearPlannedWorkouts(userId) {
      store.clearPlannedWorkouts(userId);
      persist();
    }
  };
}

function wrapReadinessHistoryStore(
  store: ReadinessHistoryStore,
  persist: () => void
): ReadinessHistoryStore {
  return {
    ...store,
    replaceReadinessHistoryState(nextState) {
      store.replaceReadinessHistoryState(nextState);
      persist();
    },
    saveReadinessHistory(entry) {
      const result = store.saveReadinessHistory(entry);
      persist();
      return result;
    },
    clearReadinessHistory(userId) {
      store.clearReadinessHistory(userId);
      persist();
    }
  };
}

function wrapWeeklyChapterHistoryStore(
  store: WeeklyChapterHistoryStore,
  persist: () => void
): WeeklyChapterHistoryStore {
  return {
    ...store,
    replaceWeeklyChapterHistoryState(nextState) {
      store.replaceWeeklyChapterHistoryState(nextState);
      persist();
    },
    saveWeeklyChapterHistory(entry) {
      const result = store.saveWeeklyChapterHistory(entry);
      persist();
      return result;
    },
    clearWeeklyChapterHistory(userId) {
      store.clearWeeklyChapterHistory(userId);
      persist();
    }
  };
}
