import { buildKaiMemory } from "../kai/memory.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";
export function createMemoryStore(options = {}) {
    const memories = loadJsonFile(options.storageFilePath, {});
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
