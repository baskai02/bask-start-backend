import { buildKaiMemory } from "../kai/memory.js";
import type {
  BehaviorSignals,
  KaiMemory,
  KaiRecentEvent,
  KaiUserProfile,
  WorkoutRecord
} from "../kai/types.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface MemoryStore {
  getMemory(userId: string): KaiMemory | undefined;
  exportMemoryState(): Record<string, KaiMemory>;
  replaceMemoryState(nextState: Record<string, KaiMemory>): void;
  updateMemory(input: {
    profile: KaiUserProfile;
    signals: BehaviorSignals;
    recentEvent?: KaiRecentEvent;
    latestCompletedWorkout?: WorkoutRecord;
    workouts?: WorkoutRecord[];
    asOf: string;
  }): KaiMemory;
}

interface MemoryStoreOptions {
  storageFilePath?: string;
}

export function createMemoryStore(
  options: MemoryStoreOptions = {}
): MemoryStore {
  const memories = loadJsonFile<Record<string, KaiMemory>>(
    options.storageFilePath,
    {}
  );

  return {
    getMemory(userId) {
      return memories[userId];
    },
    exportMemoryState() {
      return { ...memories };
    },
    replaceMemoryState(nextState) {
      for (const key of Object.keys(memories)) {
        delete memories[key];
      }

      for (const [userId, memory] of Object.entries(nextState)) {
        memories[userId] = memory;
      }

      saveJsonFile(options.storageFilePath, memories);
    },
    updateMemory(input) {
      const nextMemory = buildKaiMemory({
        profile: input.profile,
        signals: input.signals,
        previousMemory: memories[input.profile.userId],
        recentEvent: input.recentEvent,
        latestCompletedWorkout: input.latestCompletedWorkout,
        workouts: input.workouts,
        asOf: input.asOf
      });

      memories[input.profile.userId] = nextMemory;
      saveJsonFile(options.storageFilePath, memories);
      return nextMemory;
    }
  };
}
