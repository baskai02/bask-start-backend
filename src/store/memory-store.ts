import { buildKaiMemory } from "../kai/memory.js";
import type {
  BehaviorSignals,
  KaiMemory,
  KaiUserProfile
} from "../kai/types.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface MemoryStore {
  getMemory(userId: string): KaiMemory | undefined;
  updateMemory(input: {
    profile: KaiUserProfile;
    signals: BehaviorSignals;
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
    updateMemory(input) {
      const nextMemory = buildKaiMemory({
        profile: input.profile,
        signals: input.signals,
        previousMemory: memories[input.profile.userId],
        asOf: input.asOf
      });

      memories[input.profile.userId] = nextMemory;
      saveJsonFile(options.storageFilePath, memories);
      return nextMemory;
    }
  };
}
