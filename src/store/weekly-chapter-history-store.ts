import type { KaiWeeklyChapterHistoryEntry } from "../kai/types.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface WeeklyChapterHistoryStore {
  getWeeklyChapterHistory(userId: string): KaiWeeklyChapterHistoryEntry[];
  getLatestWeeklyChapterHistory(
    userId: string,
    asOf?: string
  ): KaiWeeklyChapterHistoryEntry | undefined;
  exportWeeklyChapterHistoryState(): Record<string, KaiWeeklyChapterHistoryEntry[]>;
  replaceWeeklyChapterHistoryState(
    nextState: Record<string, KaiWeeklyChapterHistoryEntry[]>
  ): void;
  saveWeeklyChapterHistory(
    entry: KaiWeeklyChapterHistoryEntry
  ): KaiWeeklyChapterHistoryEntry;
  clearWeeklyChapterHistory(userId: string): void;
}

interface WeeklyChapterHistoryStoreOptions {
  storageFilePath?: string;
}

export function createWeeklyChapterHistoryStore(
  options: WeeklyChapterHistoryStoreOptions = {}
): WeeklyChapterHistoryStore {
  const historyByUser = loadJsonFile<Record<string, KaiWeeklyChapterHistoryEntry[]>>(
    options.storageFilePath,
    {}
  );

  return {
    getWeeklyChapterHistory(userId) {
      return [...(historyByUser[userId] ?? [])];
    },
    getLatestWeeklyChapterHistory(userId, asOf) {
      const matchingEntries = (historyByUser[userId] ?? []).filter((entry) =>
        asOf ? entry.weekStart <= asOf : true
      );

      return [...matchingEntries].sort(compareHistoryEntries).at(-1);
    },
    exportWeeklyChapterHistoryState() {
      return structuredClone(historyByUser);
    },
    replaceWeeklyChapterHistoryState(nextState) {
      for (const key of Object.keys(historyByUser)) {
        delete historyByUser[key];
      }

      for (const [userId, entries] of Object.entries(nextState)) {
        historyByUser[userId] = [...entries].sort(compareHistoryEntries);
      }

      saveJsonFile(options.storageFilePath, historyByUser);
    },
    saveWeeklyChapterHistory(entry) {
      const currentHistory = historyByUser[entry.userId] ?? [];
      const nextHistory = [
        ...currentHistory.filter(
          (existingEntry) => existingEntry.weekStart !== entry.weekStart
        ),
        structuredClone(entry)
      ].sort(compareHistoryEntries);

      historyByUser[entry.userId] = nextHistory;
      saveJsonFile(options.storageFilePath, historyByUser);
      return entry;
    },
    clearWeeklyChapterHistory(userId) {
      delete historyByUser[userId];
      saveJsonFile(options.storageFilePath, historyByUser);
    }
  };
}

function compareHistoryEntries(
  left: KaiWeeklyChapterHistoryEntry,
  right: KaiWeeklyChapterHistoryEntry
): number {
  const weekComparison = left.weekStart.localeCompare(right.weekStart);

  if (weekComparison !== 0) {
    return weekComparison;
  }

  return left.recordedAt.localeCompare(right.recordedAt);
}
