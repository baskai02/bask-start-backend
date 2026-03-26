import { buildKaiAgentContext } from "./agent-context.js";
import type { KaiAgentContext } from "./agent-types.js";
import {
  buildKaiWeeklyCoachingMessage,
  buildKaiWeeklySummary
} from "./weekly.js";
import type {
  BehaviorSignals,
  KaiDashboardState,
  KaiPlanMatch,
  KaiPayload,
  KaiRecentEvent,
  KaiTodayStatus,
  KaiUserProfile,
  KaiWeeklyState,
  KaiWeeklyPayload,
  PlannedWorkout,
  WorkoutRecord
} from "./types.js";
import type { AppStore } from "../store/app-store.js";
import type { MemoryStore } from "../store/memory-store.js";
import type { PlannedWorkoutStore } from "../store/planned-workout-store.js";
import type { ProfileStore } from "../store/profile-store.js";
import { buildTrainingReadinessReport } from "../exercises/readiness.js";

export interface KaiService {
  getProfile(userId: string): KaiUserProfile;
  getFreshMemory(userId: string, asOf: string, profile?: KaiUserProfile): ReturnType<
    MemoryStore["updateMemory"]
  >;
  getKaiPayload(userId: string, asOf: string, profile?: KaiUserProfile): KaiPayload;
  getKaiWeeklyPayload(
    userId: string,
    asOf: string,
    profile?: KaiUserProfile
  ): KaiWeeklyPayload;
  getAgentContext(userId: string, asOf: string): KaiAgentContext;
  getRecentEvent(userId: string, asOf: string): KaiRecentEvent;
  getPlanMatch(userId: string, asOf: string): KaiPlanMatch;
  getWorkouts(userId: string): WorkoutRecord[];
}

interface CreateKaiServiceOptions {
  store: AppStore;
  profileStore: ProfileStore;
  memoryStore: MemoryStore;
  plannedWorkoutStore: PlannedWorkoutStore;
}

export function createKaiService(options: CreateKaiServiceOptions): KaiService {
  return {
    getProfile(userId) {
      return options.profileStore.getProfile(userId);
    },
    getFreshMemory(userId, asOf, profile = options.profileStore.getProfile(userId)) {
      const signals = options.store.getBehaviorSignals(userId, asOf);

      return options.memoryStore.updateMemory({
        profile,
        signals,
        asOf
      });
    },
    getKaiPayload(userId, asOf, profile = options.profileStore.getProfile(userId)) {
      const memory = this.getFreshMemory(userId, asOf, profile);
      const signals = options.store.getBehaviorSignals(userId, asOf);
      const recentEvent = options.store.getRecentEvent(userId, asOf);
      const planMatch = this.getPlanMatch(userId, asOf);
      const plannedWorkoutForDay = options.plannedWorkoutStore.findPlannedWorkout(
        userId,
        asOf
      );
      const nextPlannedWorkout =
        plannedWorkoutForDay &&
        (!recentEvent.date || recentEvent.date !== plannedWorkoutForDay.date)
          ? options.plannedWorkoutStore.findNextPlannedWorkoutAfter(
              userId,
              asOf,
              plannedWorkoutForDay.id
            )
          : planMatch.matchedPlanned
        ? options.plannedWorkoutStore.findNextPlannedWorkoutAfter(
            userId,
            asOf,
            planMatch.plannedWorkout?.id
          )
        : options.plannedWorkoutStore.findNextPlannedWorkoutAfter(
            userId,
            asOf,
            plannedWorkoutForDay?.id
          );
      const trainingReadiness = buildTrainingReadinessReport(
        userId,
        options.store.getWorkouts(userId),
        asOf,
        plannedWorkoutForDay?.type
      );

      return {
        userId,
        asOf,
        profile,
        dashboardState: deriveDashboardState(
          recentEvent,
          plannedWorkoutForDay,
          signals,
          asOf
        ),
        todayStatus: deriveTodayStatus(recentEvent, asOf),
        memory,
        recentEvent,
        planMatch,
        plannedWorkoutForDay,
        nextPlannedWorkout,
        signals,
        kai: options.store.getKaiMessage(
          userId,
          asOf,
          profile,
          memory,
          planMatch,
          plannedWorkoutForDay,
          nextPlannedWorkout,
          trainingReadiness
        )
      };
    },
    getKaiWeeklyPayload(
      userId,
      asOf,
      profile = options.profileStore.getProfile(userId)
    ) {
      const workouts = options.store.getWorkouts(userId);
      const plannedWorkouts = options.plannedWorkoutStore.getPlannedWorkouts(userId);
      const weeklySummary = buildKaiWeeklySummary(workouts, plannedWorkouts, asOf);
      const nextPlannedWorkout = findNextUnresolvedPlannedWorkout(
        plannedWorkouts,
        workouts,
        asOf
      );

      return {
        userId,
        asOf,
        profile,
        weeklyState: deriveWeeklyState(weeklySummary),
        weeklySummary,
        nextPlannedWorkout,
        kai: buildKaiWeeklyCoachingMessage(
          weeklySummary,
          profile,
          nextPlannedWorkout
        )
      };
    },
    getAgentContext(userId, asOf) {
      return buildKaiAgentContext({
        profile: options.profileStore.getProfile(userId),
        signals: options.store.getBehaviorSignals(userId, asOf),
        recentEvent: options.store.getRecentEvent(userId, asOf),
        workouts: options.store.getWorkouts(userId)
      });
    },
    getRecentEvent(userId, asOf) {
      return options.store.getRecentEvent(userId, asOf);
    },
    getPlanMatch(userId, asOf) {
      const recentEvent = options.store.getRecentEvent(userId, asOf);

      if (
        recentEvent.type === "none" ||
        !recentEvent.date ||
        !recentEvent.workoutType
      ) {
        return { matchedPlanned: false };
      }

      const plannedWorkout = options.plannedWorkoutStore.findPlannedWorkout(
        userId,
        recentEvent.date,
        recentEvent.workoutType
      );

      return {
        matchedPlanned: Boolean(plannedWorkout),
        plannedWorkout
      };
    },
    getWorkouts(userId) {
      return options.store.getWorkouts(userId);
    }
  };
}

function deriveDashboardState(
  recentEvent: KaiRecentEvent,
  plannedWorkoutForDay: PlannedWorkout | undefined,
  signals: BehaviorSignals,
  asOf: string
): KaiDashboardState {
  if (plannedWorkoutForDay && recentEvent.date !== asOf) {
    return "planned_today";
  }

  if (recentEvent.date === asOf) {
    return "logged_today";
  }

  if (signals.currentStreak >= 3 || signals.consistencyStatus === "consistent") {
    return "momentum";
  }

  if (signals.recentMissedCount >= 1 || signals.inactiveDays >= 2) {
    return "recovering";
  }

  return "idle";
}

function deriveTodayStatus(
  recentEvent: KaiRecentEvent,
  asOf: string
): KaiTodayStatus {
  const hasLoggedToday = recentEvent.date === asOf && recentEvent.type !== "none";
  const outcome = hasLoggedToday
    ? recentEvent.type === "workout_completed"
      ? "completed"
      : "missed"
    : "none";

  return {
    outcome,
    hasLoggedToday,
    canLogCompleted: !hasLoggedToday,
    canLogMissed: !hasLoggedToday
  };
}

function deriveWeeklyState(summary: {
  weekStatus: "not_started" | "mixed" | "on_track" | "off_track";
  remainingPlannedCount: number;
  plannedCount: number;
}): KaiWeeklyState {
  if (summary.weekStatus === "off_track") {
    return "off_track";
  }

  if (summary.weekStatus === "not_started") {
    return "not_started";
  }

  if (
    summary.weekStatus === "on_track" &&
    summary.plannedCount > 0 &&
    summary.remainingPlannedCount === 0
  ) {
    return "completed";
  }

  return "in_progress";
}

function findNextUnresolvedPlannedWorkout(
  plannedWorkouts: PlannedWorkout[],
  workouts: WorkoutRecord[],
  asOf: string
): PlannedWorkout | undefined {
  return [...plannedWorkouts]
    .filter((plannedWorkout) => plannedWorkout.date >= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
    .find(
      (plannedWorkout) =>
        !workouts.some(
          (workout) =>
            workout.date <= asOf &&
            workout.date === plannedWorkout.date &&
            workout.type === plannedWorkout.type &&
            (workout.status === "completed" || workout.status === "missed")
        )
    );
}
