import type {
  BaskStateSnapshot,
  BaskUserStateSnapshot
} from "./repositories.js";
import type {
  KaiMemory,
  KaiWeeklyChapterHistoryEntry,
  KaiUserProfile,
  PlannedWorkout,
  WorkoutRecord
} from "../kai/types.js";
import type { ReadinessHistoryEntry } from "../exercises/types.js";

export interface BaskMigrationBundle {
  workouts: WorkoutRecord[];
  profiles: KaiUserProfile[];
  memory: KaiMemory[];
  plannedWorkouts: PlannedWorkout[];
  readinessHistory: ReadinessHistoryEntry[];
  weeklyChapterHistory: KaiWeeklyChapterHistoryEntry[];
}

export interface BaskUserMigrationBundle extends BaskMigrationBundle {
  userId: string;
}

interface LegacyBaskMigrationBundle {
  workouts: WorkoutRecord[];
  profiles: KaiUserProfile[];
  memory: KaiMemory[];
  plannedWorkouts: PlannedWorkout[];
  readinessHistory?: ReadinessHistoryEntry[];
  weeklyChapterHistory?: KaiWeeklyChapterHistoryEntry[];
}

export function snapshotToMigrationBundle(
  snapshot: BaskStateSnapshot
): BaskMigrationBundle {
  return {
    workouts: flattenRecord(snapshot.workouts),
    profiles: Object.values(snapshot.profiles),
    memory: Object.values(snapshot.memory),
    plannedWorkouts: flattenRecord(snapshot.plannedWorkouts),
    readinessHistory: flattenRecord(snapshot.readinessHistory),
    weeklyChapterHistory: flattenRecord(snapshot.weeklyChapterHistory)
  };
}

export function migrationBundleToSnapshot(
  bundle: BaskMigrationBundle | LegacyBaskMigrationBundle
): BaskStateSnapshot {
  return {
    workouts: groupByUserId(bundle.workouts),
    profiles: Object.fromEntries(
      bundle.profiles.map((profile) => [profile.userId, profile])
    ),
    memory: Object.fromEntries(
      bundle.memory.map((memory) => [memory.userId, memory])
    ),
    plannedWorkouts: groupByUserId(bundle.plannedWorkouts),
    readinessHistory: groupByUserId(bundle.readinessHistory ?? []),
    weeklyChapterHistory: groupByUserId(bundle.weeklyChapterHistory ?? [])
  };
}

export function userSnapshotToMigrationBundle(
  userId: string,
  snapshot: BaskUserStateSnapshot
): BaskUserMigrationBundle {
  return {
    userId,
    workouts: [...snapshot.workouts],
    profiles: [snapshot.profile],
    memory: snapshot.memory ? [snapshot.memory] : [],
    plannedWorkouts: [...snapshot.plannedWorkouts],
    readinessHistory: [...snapshot.readinessHistory],
    weeklyChapterHistory: [...snapshot.weeklyChapterHistory]
  };
}

export function userMigrationBundleToSnapshot(
  bundle: BaskUserMigrationBundle | (LegacyBaskMigrationBundle & { userId: string })
): BaskUserStateSnapshot {
  const [profile] = bundle.profiles;

  if (!profile || profile.userId !== bundle.userId) {
    throw new Error("User migration bundle is missing a matching profile row.");
  }

  return {
    workouts: bundle.workouts.filter((workout) => workout.userId === bundle.userId),
    profile,
    memory: bundle.memory.find((memory) => memory.userId === bundle.userId),
    plannedWorkouts: bundle.plannedWorkouts.filter(
      (plannedWorkout) => plannedWorkout.userId === bundle.userId
    ),
    readinessHistory: (bundle.readinessHistory ?? []).filter(
      (entry) => entry.userId === bundle.userId
    ),
    weeklyChapterHistory: (bundle.weeklyChapterHistory ?? []).filter(
      (entry) => entry.userId === bundle.userId
    )
  };
}

function flattenRecord<T>(value: Record<string, T[]>): T[] {
  return Object.values(value).flat();
}

function groupByUserId<T extends { userId: string }>(
  rows: T[]
): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((accumulator, row) => {
    accumulator[row.userId] ??= [];
    accumulator[row.userId].push(row);
    return accumulator;
  }, {});
}
