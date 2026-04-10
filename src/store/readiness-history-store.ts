import type { ReadinessHistoryEntry } from "../exercises/types.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface ReadinessHistoryStore {
  getReadinessHistory(userId: string): ReadinessHistoryEntry[];
  getLatestReadinessHistory(userId: string, asOf?: string): ReadinessHistoryEntry | undefined;
  exportReadinessHistoryState(): Record<string, ReadinessHistoryEntry[]>;
  replaceReadinessHistoryState(nextState: Record<string, ReadinessHistoryEntry[]>): void;
  saveReadinessHistory(entry: ReadinessHistoryEntry): ReadinessHistoryEntry;
  clearReadinessHistory(userId: string): void;
}

interface ReadinessHistoryStoreOptions {
  storageFilePath?: string;
}

export function createReadinessHistoryStore(
  options: ReadinessHistoryStoreOptions = {}
): ReadinessHistoryStore {
  const historyByUser = loadJsonFile<Record<string, ReadinessHistoryEntry[]>>(
    options.storageFilePath,
    {}
  );

  return {
    getReadinessHistory(userId) {
      return [...(historyByUser[userId] ?? [])];
    },
    getLatestReadinessHistory(userId, asOf) {
      const matchingEntries = (historyByUser[userId] ?? []).filter((entry) =>
        asOf ? entry.asOf <= asOf : true
      );

      return [...matchingEntries].sort(compareHistoryEntries)[matchingEntries.length - 1];
    },
    exportReadinessHistoryState() {
      return structuredClone(historyByUser);
    },
    replaceReadinessHistoryState(nextState) {
      for (const key of Object.keys(historyByUser)) {
        delete historyByUser[key];
      }

      for (const [userId, entries] of Object.entries(nextState)) {
        historyByUser[userId] = [...entries].sort(compareHistoryEntries);
      }

      saveJsonFile(options.storageFilePath, historyByUser);
    },
    saveReadinessHistory(entry) {
      const currentHistory = historyByUser[entry.userId] ?? [];
      const nextHistory = [
        ...currentHistory.filter((existingEntry) => existingEntry.asOf !== entry.asOf),
        structuredClone(entry)
      ].sort(compareHistoryEntries);

      historyByUser[entry.userId] = nextHistory;
      saveJsonFile(options.storageFilePath, historyByUser);
      return entry;
    },
    clearReadinessHistory(userId) {
      delete historyByUser[userId];
      saveJsonFile(options.storageFilePath, historyByUser);
    }
  };
}

function compareHistoryEntries(
  left: ReadinessHistoryEntry,
  right: ReadinessHistoryEntry
): number {
  const asOfComparison = left.asOf.localeCompare(right.asOf);

  if (asOfComparison !== 0) {
    return asOfComparison;
  }

  return left.recordedAt.localeCompare(right.recordedAt);
}
