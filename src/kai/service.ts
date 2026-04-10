import { buildKaiAgentContext } from "./agent-context.js";
import type { KaiAgentContext } from "./agent-types.js";
import {
  buildSuggestedPlanDay,
  buildWeeklyPlan,
  summarizeSuggestedDayTemplateBias,
  toPlannedWorkouts
} from "./planner.js";
import {
  buildKaiWeeklyArc,
  buildKaiWeeklyChapter,
  buildKaiWeeklyInsights,
  buildKaiWeeklyReview,
  buildKaiWeeklyCoachingMessage,
  buildKaiWeeklySummary,
  getWeekRange,
  summarizeWorkoutTypePattern
} from "./weekly.js";
import type {
  DayOrigin,
  SuggestedDayBias,
  PlannedDayReadinessContext,
  ReadinessHistoryEntry,
  TrainingReadinessReport
} from "../exercises/types.js";
import type {
  BehaviorSignals,
  KaiMemory,
  KaiCurrentWeekReplan,
  KaiWeeklyDecisionLogEntry,
  KaiDashboardState,
  KaiPlanMatch,
  KaiPayload,
  KaiRecentEvent,
  KaiTodayStatus,
  KaiUserProfile,
  KaiWeeklyPlan,
  KaiWeeklyState,
  KaiWeeklyPayload,
  KaiWeeklyPlanDay,
  PlannedWorkout,
  WorkoutRecord
} from "./types.js";
import type { MemoryStore } from "../store/memory-store.js";
import type { BaskRepositories } from "../store/repositories.js";
import { buildTrainingReadinessReport } from "../exercises/readiness.js";
import { getExerciseById } from "../exercises/library.js";

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
  getKaiWeeklyPlan(userId: string, asOf: string, profile?: KaiUserProfile): KaiWeeklyPlan;
  persistCurrentWeekReplan(
    userId: string,
    asOf: string,
    profile?: KaiUserProfile
  ): {
    weeklyPlan: KaiWeeklyPlan;
    plannedWorkouts: PlannedWorkout[];
  };
  getAgentContext(userId: string, asOf: string): KaiAgentContext;
  getRecentEvent(userId: string, asOf: string): KaiRecentEvent;
  getPlanMatch(userId: string, asOf: string): KaiPlanMatch;
  getWorkouts(userId: string): WorkoutRecord[];
}

interface CreateKaiServiceOptions {
  repositories: BaskRepositories;
}

export interface TodayReadinessResolution {
  planDay?: KaiWeeklyPlanDay;
  effectivePlanDay?: KaiWeeklyPlanDay;
  effectiveWorkoutType?: string;
  suggestedWorkoutType?: string;
  suggestedWorkoutReasonLabel?: string;
  dayOrigin?: DayOrigin;
  suggestedDayBias?: SuggestedDayBias;
  plannedDayContext?: PlannedDayReadinessContext;
}

export interface ResolvedTrainingReadinessReportInput {
  repositories: BaskRepositories;
  userId: string;
  asOf: string;
  profile: KaiUserProfile;
  weeklyPlan: KaiWeeklyPlan;
  memory?: KaiMemory;
}

export function createKaiService(options: CreateKaiServiceOptions): KaiService {
  const store = options.repositories.workouts;
  const profileStore = options.repositories.profiles;
  const memoryStore = options.repositories.memory;
  const plannedWorkoutStore = options.repositories.plannedWorkouts;
  const readinessHistoryStore = options.repositories.readinessHistory;
  const weeklyChapterHistoryStore = options.repositories.weeklyChapterHistory;

  return {
    getProfile(userId) {
      return profileStore.getProfile(userId);
    },
    getFreshMemory(userId, asOf, profile = profileStore.getProfile(userId)) {
      const workouts = store.getWorkouts(userId);
      const signals = store.getBehaviorSignals(userId, asOf);
      const recentEvent = store.getRecentEvent(userId, asOf);
      const latestCompletedWorkout = [...workouts]
        .filter((workout) => workout.status === "completed" && workout.date <= asOf)
        .sort((left, right) => {
          const dateComparison = left.date.localeCompare(right.date);
          if (dateComparison !== 0) {
            return dateComparison;
          }

          return (left.recordedAt ?? "").localeCompare(right.recordedAt ?? "");
        })
        .at(-1);

      return memoryStore.updateMemory({
        profile,
        signals,
        recentEvent,
        latestCompletedWorkout,
        workouts,
        asOf
      });
    },
    getKaiPayload(userId, asOf, profile = profileStore.getProfile(userId)) {
      const memory = this.getFreshMemory(userId, asOf, profile);
      const workouts = store.getWorkouts(userId);
      const plannedWorkouts = plannedWorkoutStore.getPlannedWorkouts(userId);
      const recentExerciseHistory = buildRecentExerciseHistory(workouts, asOf);
      const signals = store.getBehaviorSignals(userId, asOf);
      const recentEvent = store.getRecentEvent(userId, asOf);
      const weeklyReadinessHistory = buildCurrentWeekReadinessHistory(
        readinessHistoryStore.getReadinessHistory(userId),
        asOf
      );
      const weeklySummary = buildKaiWeeklySummary(
        workouts,
        plannedWorkouts,
        asOf
      );
      const weeklyPerformanceSignals = buildWeeklyPerformanceSignals(
        recentExerciseHistory,
        weeklySummary.weekStart
      );
      const previousWeekSummary = buildKaiWeeklySummary(
        workouts,
        plannedWorkouts,
        shiftDate(asOf, -7)
      );
      const weeklyReview = buildKaiWeeklyReview(
        weeklySummary,
        previousWeekSummary,
        workouts,
        asOf,
        recentExerciseHistory,
        weeklyReadinessHistory,
        weeklyPerformanceSignals
      );
      const weeklyReviewHistory = buildWeeklyReviewHistory(
        workouts,
        plannedWorkouts,
        readinessHistoryStore.getReadinessHistory(userId),
        asOf
      );
      const weeklyPlan = buildWeeklyPlan(
        userId,
        asOf,
        profile,
        memory,
        previousWeekSummary,
        workouts
      );
      const weeklyProgressionHighlights = buildWeeklyProgressionHighlights(weeklyPlan);
      const weeklyExerciseInsights = buildWeeklyExerciseInsights(weeklyPlan);
      const weeklyInsights = buildKaiWeeklyInsights(
        weeklySummary,
        weeklyReview,
        workouts,
        asOf,
        recentExerciseHistory,
        memory.sessionPatternMemory,
        memory.suggestedWorkoutMemory,
        weeklyExerciseInsights,
        weeklyProgressionHighlights,
        weeklyReviewHistory,
        weeklyReadinessHistory,
        weeklyPerformanceSignals
      );
      const currentWeekReplan = summarizeCurrentWeekReplan(
        plannedWorkouts,
        weeklyPlan.weekStart,
        weeklyPlan.weekEnd
      );
      const workoutTypePattern = summarizeWorkoutTypePattern(workouts, asOf);
      const plannedWorkoutForDay = plannedWorkoutStore.findPlannedWorkout(
        userId,
        asOf
      );
      const weeklyPlanContext: NonNullable<KaiPayload["weeklyPlanContext"]> = {
        weekStart: weeklyPlan.weekStart,
        weekEnd: weeklyPlan.weekEnd,
        splitStyle: weeklyPlan.splitStyle,
        targetSessions: weeklyPlan.targetSessions,
        plannedCount: weeklySummary.plannedCount,
        completedCount: weeklySummary.completedCount,
        remainingPlannedCount: weeklySummary.remainingPlannedCount,
        todayPlanned: Boolean(plannedWorkoutForDay),
        weeklyReviewState: weeklyReview.state,
        weeklyAdaptationAction: weeklyReview.adaptationAction,
        currentWeekReplan,
        ...(workoutTypePattern?.trend === "fragile"
          ? { fragileWorkoutTypeLabel: workoutTypePattern.label }
          : {})
      };
      const todayReadiness = resolveTodayReadinessResolution({
        asOf,
        weeklyPlan,
        plannedWorkoutForDay,
        profile,
        memory,
        workouts
      });
      const {
        planDay,
        suggestedWorkoutType,
        suggestedWorkoutReasonLabel,
        effectivePlanDay,
        effectiveWorkoutType,
        suggestedDayBias,
        plannedDayContext
      } = todayReadiness;
      if (suggestedWorkoutType) {
        weeklyPlanContext.suggestedWorkoutTypeLabel = formatWorkoutTypeLabel(
          suggestedWorkoutType
        );
        if (suggestedWorkoutReasonLabel) {
          weeklyPlanContext.suggestedWorkoutReasonLabel =
            suggestedWorkoutReasonLabel;
        }
        if (effectivePlanDay?.rationale?.includes("leans into")) {
          weeklyPlanContext.suggestedWorkoutTemplateNote =
            effectivePlanDay.rationale;
        }
      }
      const suggestedDrift = memory.suggestedWorkoutMemory?.dominantDrift;
      if (
        suggestedDrift &&
        suggestedDrift.occurrences >= 2 &&
        suggestedDrift.followThroughRate <= 0.4
      ) {
        weeklyPlanContext.suggestedWorkoutDriftLabel = formatWorkoutTypeLabel(
          suggestedDrift.performedWorkoutType
        );
      }
      const planMatch = this.getPlanMatch(userId, asOf);
      const nextPlannedWorkout =
        plannedWorkoutForDay &&
        (!recentEvent.date || recentEvent.date !== plannedWorkoutForDay.date)
          ? plannedWorkoutStore.findNextPlannedWorkoutAfter(
              userId,
              asOf,
              plannedWorkoutForDay.id
            )
          : planMatch.matchedPlanned
        ? plannedWorkoutStore.findNextPlannedWorkoutAfter(
            userId,
            asOf,
            planMatch.plannedWorkout?.id
          )
          : plannedWorkoutStore.findNextPlannedWorkoutAfter(
            userId,
            asOf,
            plannedWorkoutForDay?.id
          );
      const provisionalWeeklyChapter = buildKaiWeeklyChapter(
        weeklySummary,
        weeklyReview,
        [],
        weeklyReadinessHistory,
        undefined,
        currentWeekReplan,
        nextPlannedWorkout
      );
      const weeklyArc = buildKaiWeeklyArc(
        weeklyChapterHistoryStore.getWeeklyChapterHistory(userId),
        {
          userId,
          asOf,
          weekStart: weeklySummary.weekStart,
          weekEnd: weeklySummary.weekEnd,
          recordedAt: new Date().toISOString(),
          reviewState: weeklyReview.state,
          adaptationAction: weeklyReview.adaptationAction,
          chapter: provisionalWeeklyChapter,
          insightTitles: [],
          readinessEntryCount: weeklyReadinessHistory.length
        }
      );
      if (weeklyArc) {
        weeklyPlanContext.weeklyArcPattern = weeklyArc.pattern;
        weeklyPlanContext.weeklyArcHeadline = weeklyArc.headline;
      }
      const dailyWeeklyProgressContext = deriveDailyWeeklyProgressContext(
        weeklyReview,
        weeklyInsights
      );
      if (dailyWeeklyProgressContext) {
        weeklyPlanContext.weeklyProgressPattern = dailyWeeklyProgressContext.pattern;
        weeklyPlanContext.weeklyProgressHeadline = dailyWeeklyProgressContext.headline;
      }
      const trainingReadiness = buildTrainingReadinessReport(
        userId,
        workouts,
        asOf,
        effectiveWorkoutType,
        profile.experienceLevel,
        memory.recommendationMemory,
        {
          goal: profile.goal,
          equipmentAccess: profile.equipmentAccess,
          focusMuscles: profile.focusMuscles,
          favoriteExerciseIds: profile.favoriteExerciseIds,
          dislikedExerciseIds: profile.dislikedExerciseIds,
          painFlags: profile.painFlags,
          hardConstraints: profile.hardConstraints,
          plannedFocusMuscles: effectivePlanDay?.exerciseIntent?.focusMuscles,
          plannedAvoidMuscles: effectivePlanDay?.exerciseIntent?.avoidMuscles,
          plannedPreferredExerciseIds: effectivePlanDay?.exerciseIntent?.preferredExerciseIds
        },
        plannedDayContext
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
        weeklyPlanContext,
        signals,
        kai: store.getKaiMessage(
          userId,
          asOf,
          profile,
          memory,
          planMatch,
          plannedWorkoutForDay,
          nextPlannedWorkout,
          trainingReadiness,
          weeklyPlanContext
        )
      };
    },
    getKaiWeeklyPayload(
      userId,
      asOf,
      profile = profileStore.getProfile(userId)
    ) {
      const workouts = store.getWorkouts(userId);
      const plannedWorkouts = plannedWorkoutStore.getPlannedWorkouts(userId);
      const memory = this.getFreshMemory(userId, asOf, profile);
      const recentExerciseHistory = buildRecentExerciseHistory(workouts, asOf);
      const weeklySummary = buildKaiWeeklySummary(workouts, plannedWorkouts, asOf);
      const weeklyReadinessHistory = buildCurrentWeekReadinessHistory(
        readinessHistoryStore.getReadinessHistory(userId),
        asOf
      );
      const previousWeekSummary = buildKaiWeeklySummary(
        workouts,
        plannedWorkouts,
        shiftDate(asOf, -7)
      );
      const weeklyPerformanceSignals = buildWeeklyPerformanceSignals(
        recentExerciseHistory,
        weeklySummary.weekStart
      );
      const weeklyReview = buildKaiWeeklyReview(
        weeklySummary,
        previousWeekSummary,
        workouts,
        asOf,
        recentExerciseHistory,
        weeklyReadinessHistory,
        weeklyPerformanceSignals
      );
      const weeklyReviewHistory = buildWeeklyReviewHistory(
        workouts,
        plannedWorkouts,
        readinessHistoryStore.getReadinessHistory(userId),
        asOf
      );
      const currentWeekReplan = summarizeCurrentWeekReplan(
        plannedWorkouts,
        weeklySummary.weekStart,
        weeklySummary.weekEnd
      );
      const weeklyPlan = buildWeeklyPlan(
        userId,
        asOf,
        profile,
        memory,
        previousWeekSummary,
        workouts
      );
      const weeklyProgressionHighlights = buildWeeklyProgressionHighlights(weeklyPlan);
      const weeklyExerciseInsights = buildWeeklyExerciseInsights(weeklyPlan);
      const weeklyInsights = buildKaiWeeklyInsights(
        weeklySummary,
        weeklyReview,
        workouts,
        asOf,
        recentExerciseHistory,
        memory.sessionPatternMemory,
        memory.suggestedWorkoutMemory,
        weeklyExerciseInsights,
        weeklyProgressionHighlights,
        weeklyReviewHistory,
        weeklyReadinessHistory,
        weeklyPerformanceSignals
      );
      const nextPlannedWorkout = findNextUnresolvedPlannedWorkout(
        plannedWorkouts,
        workouts,
        asOf
      );
      const baseWeeklyChapter = buildKaiWeeklyChapter(
        weeklySummary,
        weeklyReview,
        weeklyInsights,
        weeklyReadinessHistory,
        undefined,
        currentWeekReplan,
        nextPlannedWorkout
      );
      const provisionalWeeklyChapterEntry = {
        userId,
        asOf,
        weekStart: weeklySummary.weekStart,
        weekEnd: weeklySummary.weekEnd,
        recordedAt: new Date().toISOString(),
        reviewState: weeklyReview.state,
        adaptationAction: weeklyReview.adaptationAction,
        chapter: baseWeeklyChapter,
        insightTitles: weeklyInsights.map((insight) => insight.title).slice(0, 6),
        readinessEntryCount: weeklyReadinessHistory.length
      };
      const weeklyArc = buildKaiWeeklyArc(
        weeklyChapterHistoryStore.getWeeklyChapterHistory(userId),
        provisionalWeeklyChapterEntry
      );
      const weeklyChapter = buildKaiWeeklyChapter(
        weeklySummary,
        weeklyReview,
        weeklyInsights,
        weeklyReadinessHistory,
        weeklyArc,
        currentWeekReplan,
        nextPlannedWorkout
      );
      const currentWeeklyChapterEntry = {
        ...provisionalWeeklyChapterEntry,
        chapter: weeklyChapter
      };
      weeklyChapterHistoryStore.saveWeeklyChapterHistory(currentWeeklyChapterEntry);

      return {
        userId,
        asOf,
        profile,
        weeklyState: deriveWeeklyState(weeklySummary),
        weeklySummary,
        weeklyReview,
        weeklyInsights,
        weeklyChapter,
        weeklyArc,
        weeklyReadinessHistory,
        recentExerciseHistory,
        weeklyPerformanceSignals,
        weeklyProgressionHighlights,
        weeklyExerciseInsights,
        currentWeekReplan,
        weeklyDecisionLog: buildWeeklyDecisionLog(
          asOf,
          weeklySummary,
          weeklyReview,
          currentWeekReplan
        ),
        nextPlannedWorkout,
        kai: buildKaiWeeklyCoachingMessage(
          weeklySummary,
          profile,
          nextPlannedWorkout,
          weeklyReview,
          weeklyInsights
        )
      };
    },
    getKaiWeeklyPlan(userId, asOf, profile = profileStore.getProfile(userId)) {
      const memory = this.getFreshMemory(userId, asOf, profile);
      const workouts = store.getWorkouts(userId);
      const plannedWorkouts = plannedWorkoutStore.getPlannedWorkouts(userId);
      const previousWeekSummary = buildKaiWeeklySummary(
        workouts,
        plannedWorkouts,
        shiftDate(asOf, -7)
      );
      return buildWeeklyPlan(userId, asOf, profile, memory, previousWeekSummary, workouts);
    },
    persistCurrentWeekReplan(userId, asOf, profile = profileStore.getProfile(userId)) {
      const weeklyPlan = this.getKaiWeeklyPlan(userId, asOf, profile);
      const workouts = store.getWorkouts(userId);
      const plannedWorkouts = plannedWorkoutStore.getPlannedWorkouts(userId);
      const recentExerciseHistory = buildRecentExerciseHistory(workouts, asOf);
      const weeklySummary = buildKaiWeeklySummary(workouts, plannedWorkouts, asOf);
      const previousWeekSummary = buildKaiWeeklySummary(
        workouts,
        plannedWorkouts,
        shiftDate(asOf, -7)
      );
      const weeklyReview = buildKaiWeeklyReview(
        weeklySummary,
        previousWeekSummary,
        workouts,
        asOf,
        recentExerciseHistory,
        buildCurrentWeekReadinessHistory(
          readinessHistoryStore.getReadinessHistory(userId),
          asOf
        )
      );
      const replannedWorkouts = toPlannedWorkouts(weeklyPlan, {
        fromDate: asOf,
        replan: {
          source: "current_week_replan",
          appliedAt: new Date().toISOString(),
          adaptationAction: weeklyReview.adaptationAction,
          reason: weeklyReview.headline
        }
      });
      const nextPlannedWorkouts = plannedWorkoutStore.replacePlannedWorkoutsInRange(
        userId,
        asOf,
        weeklyPlan.weekEnd,
        replannedWorkouts
      );

      return {
        weeklyPlan,
        plannedWorkouts: nextPlannedWorkouts
      };
    },
    getAgentContext(userId, asOf) {
      return buildKaiAgentContext({
        profile: profileStore.getProfile(userId),
        signals: store.getBehaviorSignals(userId, asOf),
        recentEvent: store.getRecentEvent(userId, asOf),
        workouts: store.getWorkouts(userId)
      });
    },
    getRecentEvent(userId, asOf) {
      return store.getRecentEvent(userId, asOf);
    },
    getPlanMatch(userId, asOf) {
      const recentEvent = store.getRecentEvent(userId, asOf);

      if (
        recentEvent.type === "none" ||
        !recentEvent.date ||
        !recentEvent.workoutType
      ) {
        return { matchedPlanned: false };
      }

      const plannedWorkout = plannedWorkoutStore.findPlannedWorkout(
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
      return store.getWorkouts(userId);
    }
  };
}

function buildWeeklyProgressionHighlights(
  weeklyPlan: KaiWeeklyPlan
): KaiWeeklyPayload["weeklyProgressionHighlights"] {
  return weeklyPlan.days
    .filter((day) => day.status === "planned" && day.workoutType)
    .flatMap((day) =>
      (day.sessionTemplate?.slots ?? [])
        .filter((slot) => Boolean(slot.progressionCue))
        .map((slot) => ({
          date: day.date,
          workoutType: day.workoutType!,
          slot: slot.slot,
          label: slot.label,
          action: slot.progressionCue!.action,
          reason: slot.progressionCue!.reason,
          selectionReason: slot.selectionReason
        }))
    );
}

function buildRecentExerciseHistory(
  workouts: WorkoutRecord[],
  asOf: string
): KaiWeeklyPayload["recentExerciseHistory"] {
  const windowStart = shiftDate(asOf, -42);
  const grouped = new Map<
    string,
    {
      exerciseId: string;
      name: string;
      appearances: number;
      lastPerformedAt: string;
      totalSets: number;
      totalReps: number;
      efforts: Array<NonNullable<WorkoutRecord["sessionExercises"]>[number]["effort"]>;
      executionQualities: Array<NonNullable<WorkoutRecord["outcomeSummary"]>["executionQuality"]>;
      followedPlannedCount: number;
      followedSuggestedCount: number;
      substitutionCount: number;
      performanceSnapshots: Array<{
        date: string;
        recordedAt: string;
        source: "weight_reps" | "reps_volume";
        score: number;
      }>;
    }
  >();

  for (const workout of workouts) {
    if (
      workout.status !== "completed" ||
      workout.date < windowStart ||
      workout.date > asOf ||
      !workout.sessionExercises?.length
    ) {
      continue;
    }

    for (const sessionExercise of workout.sessionExercises) {
      const exercise = getExerciseById(sessionExercise.exerciseId);

      if (!exercise) {
        continue;
      }

      const existing = grouped.get(sessionExercise.exerciseId);

      if (existing) {
        existing.appearances += 1;
        existing.lastPerformedAt =
          existing.lastPerformedAt > workout.date ? existing.lastPerformedAt : workout.date;
        existing.totalSets += sessionExercise.sets;
        existing.totalReps += sessionExercise.reps;
        existing.efforts.push(sessionExercise.effort);
        if (workout.outcomeSummary?.executionQuality) {
          existing.executionQualities.push(workout.outcomeSummary.executionQuality);
        }
        if (workout.outcomeSummary?.followedPlannedWorkout) {
          existing.followedPlannedCount += 1;
        }
        if (workout.outcomeSummary?.followedSuggestedWorkoutType) {
          existing.followedSuggestedCount += 1;
        }
        existing.substitutionCount += workout.outcomeSummary?.substitutionCount ?? 0;
        const performanceSnapshot = buildExercisePerformanceSnapshot(workout, sessionExercise);
        if (performanceSnapshot) {
          existing.performanceSnapshots.push(performanceSnapshot);
        }
        continue;
      }

      grouped.set(sessionExercise.exerciseId, {
        exerciseId: sessionExercise.exerciseId,
        name: exercise.name,
        appearances: 1,
        lastPerformedAt: workout.date,
        totalSets: sessionExercise.sets,
        totalReps: sessionExercise.reps,
        efforts: [sessionExercise.effort],
        executionQualities: workout.outcomeSummary?.executionQuality
          ? [workout.outcomeSummary.executionQuality]
          : [],
        followedPlannedCount: workout.outcomeSummary?.followedPlannedWorkout ? 1 : 0,
        followedSuggestedCount: workout.outcomeSummary?.followedSuggestedWorkoutType ? 1 : 0,
        substitutionCount: workout.outcomeSummary?.substitutionCount ?? 0,
        performanceSnapshots: (() => {
          const performanceSnapshot = buildExercisePerformanceSnapshot(workout, sessionExercise);
          return performanceSnapshot ? [performanceSnapshot] : [];
        })()
      });
    }
  }

  return [...grouped.values()]
    .map((entry) => {
      const progressionSummary = summarizeExerciseProgression(entry.performanceSnapshots);

      return {
        exerciseId: entry.exerciseId,
        name: entry.name,
        appearances: entry.appearances,
        lastPerformedAt: entry.lastPerformedAt,
        averageSets: roundToOneDecimal(entry.totalSets / entry.appearances),
        averageReps: roundToOneDecimal(entry.totalReps / entry.appearances),
        commonEffort: mostCommon(entry.efforts.filter(Boolean)),
        executionQuality:
          mostCommon(entry.executionQualities) ?? ("workable" satisfies KaiWeeklyPayload["recentExerciseHistory"][number]["executionQuality"]),
        followedPlannedRate: roundToOneDecimal(entry.followedPlannedCount / entry.appearances),
        followedSuggestedRate: roundToOneDecimal(entry.followedSuggestedCount / entry.appearances),
        averageSubstitutionCount: roundToOneDecimal(entry.substitutionCount / entry.appearances),
        ...progressionSummary
      };
    })
    .sort((left, right) => {
      const appearancesDelta = right.appearances - left.appearances;
      if (appearancesDelta !== 0) {
        return appearancesDelta;
      }

      const dateDelta = right.lastPerformedAt.localeCompare(left.lastPerformedAt);
      if (dateDelta !== 0) {
        return dateDelta;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

function buildWeeklyPerformanceSignals(
  recentExerciseHistory: KaiWeeklyPayload["recentExerciseHistory"],
  weekStart: string
): KaiWeeklyPayload["weeklyPerformanceSignals"] {
  return recentExerciseHistory
    .filter(
      (entry) =>
        entry.lastPerformedAt >= weekStart &&
        entry.signalSource &&
        entry.latestPerformanceScore !== undefined &&
        entry.progressionVelocity &&
        entry.progressionVelocity !== "insufficient_data" &&
        (entry.latestWasPersonalBest ||
          Math.abs(entry.performanceDeltaPercent ?? 0) >= 5)
    )
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      name: entry.name,
      lastPerformedAt: entry.lastPerformedAt,
      signalSource: entry.signalSource!,
      latestPerformanceScore: entry.latestPerformanceScore!,
      baselinePerformanceScore: entry.baselinePerformanceScore,
      performanceDeltaPercent: entry.performanceDeltaPercent,
      progressionVelocity: entry.progressionVelocity!,
      latestWasPersonalBest: entry.latestWasPersonalBest ?? false,
      personalBestCount: entry.personalBestCount ?? 0
    }))
    .sort((left, right) => {
      const personalBestDelta =
        Number(right.latestWasPersonalBest) - Number(left.latestWasPersonalBest);
      if (personalBestDelta !== 0) {
        return personalBestDelta;
      }

      const deltaMagnitude =
        Math.abs(right.performanceDeltaPercent ?? 0) -
        Math.abs(left.performanceDeltaPercent ?? 0);
      if (deltaMagnitude !== 0) {
        return deltaMagnitude;
      }

      return right.lastPerformedAt.localeCompare(left.lastPerformedAt);
    })
    .slice(0, 6);
}

function deriveDailyWeeklyProgressContext(
  weeklyReview: {
    state: KaiWeeklyPayload["weeklyReview"]["state"];
  },
  weeklyInsights: KaiWeeklyPayload["weeklyInsights"]
):
  | {
      pattern: "quiet_progress" | "flattened_progress";
      headline: string;
    }
  | undefined {
  if (weeklyReview.state !== "steady") {
    return undefined;
  }

  const progressionInsight = weeklyInsights.find(
    (insight) => insight.kind === "progression"
  );

  if (!progressionInsight) {
    return undefined;
  }

  if (
    progressionInsight.title === "Quiet progress still happened this week" ||
    progressionInsight.title === "A real PR landed this week"
  ) {
    return {
      pattern: "quiet_progress",
      headline: "This week is still moving in the right direction"
    };
  }

  if (
    progressionInsight.title.includes("needs a steadier repeat") ||
    progressionInsight.detail.includes("below its recent baseline")
  ) {
    return {
      pattern: "flattened_progress",
      headline: "This week needs one cleaner repeat before it builds again"
    };
  }

  return undefined;
}

function buildWeeklyExerciseInsights(
  weeklyPlan: KaiWeeklyPlan
): KaiWeeklyPayload["weeklyExerciseInsights"] {
  const grouped = new Map<
    string,
    {
      exerciseId: string;
      name: string;
      action: "progress" | "repeat" | "hold_back";
      occurrences: number;
      workoutTypes: Set<string>;
      reasons: Set<string>;
      selectionReasons: Set<string>;
    }
  >();

  for (const day of weeklyPlan.days) {
    if (day.status !== "planned" || !day.workoutType) {
      continue;
    }

    for (const slot of day.sessionTemplate?.slots ?? []) {
      if (!slot.progressionCue || !slot.candidateExerciseIds.length) {
        continue;
      }

      const exerciseId = slot.candidateExerciseIds[0];
      const exercise = getExerciseById(exerciseId);

      if (!exercise) {
        continue;
      }

      const key = `${exerciseId}:${slot.progressionCue.action}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.occurrences += 1;
        existing.workoutTypes.add(day.workoutType);
        existing.reasons.add(slot.progressionCue.reason);
        if (slot.selectionReason) {
          existing.selectionReasons.add(slot.selectionReason);
        }
        continue;
      }

      grouped.set(key, {
        exerciseId,
        name: exercise.name,
        action: slot.progressionCue.action,
        occurrences: 1,
        workoutTypes: new Set([day.workoutType]),
        reasons: new Set([slot.progressionCue.reason]),
        selectionReasons: new Set(slot.selectionReason ? [slot.selectionReason] : [])
      });
    }
  }

  return [...grouped.values()]
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      name: entry.name,
      action: entry.action,
      occurrences: entry.occurrences,
      workoutTypes: [...entry.workoutTypes],
      reasons: [...entry.reasons],
      ...(entry.selectionReasons.size > 0
        ? { selectionReasons: [...entry.selectionReasons] }
        : {})
    }))
    .sort((left, right) => {
      const occurrenceDelta = right.occurrences - left.occurrences;
      if (occurrenceDelta !== 0) {
        return occurrenceDelta;
      }

      const actionDelta =
        progressionActionPriority(left.action) - progressionActionPriority(right.action);
      if (actionDelta !== 0) {
        return actionDelta;
      }

      return left.name.localeCompare(right.name);
    });
}

function progressionActionPriority(action: "progress" | "repeat" | "hold_back"): number {
  if (action === "progress") {
    return 0;
  }

  if (action === "repeat") {
    return 1;
  }

  return 2;
}

function mostCommon<T extends string | undefined>(values: T[]): T | undefined {
  if (!values.length) {
    return undefined;
  }

  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function buildExercisePerformanceSnapshot(
  workout: WorkoutRecord,
  sessionExercise: NonNullable<WorkoutRecord["sessionExercises"]>[number]
):
  | {
      date: string;
      recordedAt: string;
      source: "weight_reps" | "reps_volume";
      score: number;
    }
  | undefined {
  const performedSets = sessionExercise.performedSets?.filter(
    (setEntry) => setEntry.completed !== false
  );

  if (performedSets?.length) {
    const weightedScore = performedSets.reduce((sum, setEntry) => {
      if (typeof setEntry.weightKg !== "number" || setEntry.weightKg <= 0) {
        return sum;
      }

      return sum + setEntry.weightKg * Math.max(setEntry.reps, 0);
    }, 0);

    if (weightedScore > 0) {
      return {
        date: workout.date,
        recordedAt: workout.recordedAt,
        source: "weight_reps",
        score: roundToOneDecimal(weightedScore)
      };
    }

    const repVolumeScore = performedSets.reduce(
      (sum, setEntry) =>
        sum +
        Math.max(setEntry.reps, 0) *
          getEffortScoreMultiplier(setEntry.effort ?? sessionExercise.effort),
      0
    );

    if (repVolumeScore > 0) {
      return {
        date: workout.date,
        recordedAt: workout.recordedAt,
        source: "reps_volume",
        score: roundToOneDecimal(repVolumeScore)
      };
    }
  }

  const fallbackScore =
    Math.max(sessionExercise.sets, 0) *
    Math.max(sessionExercise.reps, 0) *
    getEffortScoreMultiplier(sessionExercise.effort);

  if (fallbackScore <= 0) {
    return undefined;
  }

  return {
    date: workout.date,
    recordedAt: workout.recordedAt,
    source: "reps_volume",
    score: roundToOneDecimal(fallbackScore)
  };
}

function summarizeExerciseProgression(
  performanceSnapshots: Array<{
    date: string;
    recordedAt: string;
    source: "weight_reps" | "reps_volume";
    score: number;
  }>
): Partial<KaiWeeklyPayload["recentExerciseHistory"][number]> {
  if (!performanceSnapshots.length) {
    return {
      progressionVelocity: "insufficient_data"
    };
  }

  const preferredSource = selectPreferredPerformanceSource(performanceSnapshots);
  const comparableSnapshots = performanceSnapshots
    .filter((snapshot) => snapshot.source === preferredSource)
    .sort((left, right) => {
      const dateDelta = left.date.localeCompare(right.date);
      if (dateDelta !== 0) {
        return dateDelta;
      }

      return left.recordedAt.localeCompare(right.recordedAt);
    });

  const latestSnapshot = comparableSnapshots.at(-1);
  if (!latestSnapshot) {
    return {
      progressionVelocity: "insufficient_data"
    };
  }

  const previousSnapshots = comparableSnapshots.slice(0, -1);
  const baselineSnapshots = previousSnapshots.slice(-Math.min(previousSnapshots.length, 2));
  const baselinePerformanceScore = baselineSnapshots.length
    ? roundToOneDecimal(
        baselineSnapshots.reduce((sum, snapshot) => sum + snapshot.score, 0) /
          baselineSnapshots.length
      )
    : undefined;
  const performanceDeltaPercent =
    baselinePerformanceScore && baselinePerformanceScore > 0
      ? roundToOneDecimal(
          ((latestSnapshot.score - baselinePerformanceScore) / baselinePerformanceScore) * 100
        )
      : undefined;
  const previousBest = previousSnapshots.reduce(
    (best, snapshot) => Math.max(best, snapshot.score),
    0
  );
  const latestWasPersonalBest =
    previousSnapshots.length > 0 && latestSnapshot.score > previousBest * 1.005;

  let runningBest = Number.NEGATIVE_INFINITY;
  let personalBestCount = 0;
  for (const snapshot of comparableSnapshots) {
    if (snapshot.score > runningBest * 1.005 || !Number.isFinite(runningBest)) {
      personalBestCount += 1;
      runningBest = snapshot.score;
    }
  }

  return {
    signalSource: preferredSource,
    latestPerformanceScore: latestSnapshot.score,
    baselinePerformanceScore,
    performanceDeltaPercent,
    progressionVelocity:
      performanceDeltaPercent === undefined
        ? "insufficient_data"
        : performanceDeltaPercent >= 5
        ? "rising"
        : performanceDeltaPercent <= -5
        ? "slipping"
        : "steady",
    latestWasPersonalBest,
    personalBestCount
  };
}

function selectPreferredPerformanceSource(
  performanceSnapshots: Array<{
    source: "weight_reps" | "reps_volume";
  }>
): "weight_reps" | "reps_volume" {
  const weightedCount = performanceSnapshots.filter(
    (snapshot) => snapshot.source === "weight_reps"
  ).length;

  if (weightedCount >= 2) {
    return "weight_reps";
  }

  return "reps_volume";
}

function getEffortScoreMultiplier(
  effort?: NonNullable<WorkoutRecord["sessionExercises"]>[number]["effort"]
): number {
  if (effort === "easy") {
    return 0.95;
  }

  if (effort === "hard") {
    return 1.08;
  }

  return 1;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildWeeklyReviewHistory(
  workouts: WorkoutRecord[],
  plannedWorkouts: PlannedWorkout[],
  readinessHistory: ReadinessHistoryEntry[],
  asOf: string,
  lookbackWeeks = 6
): Array<{
  weekStart: string;
  state: KaiWeeklyPayload["weeklyReview"]["state"];
  plannedCount: number;
  completedCount: number;
  missedCount: number;
}> {
  const byWeekStart = new Map<
    string,
    {
      weekStart: string;
      state: KaiWeeklyPayload["weeklyReview"]["state"];
      plannedCount: number;
      completedCount: number;
      missedCount: number;
    }
  >();

  for (let offset = lookbackWeeks - 1; offset >= 0; offset -= 1) {
    const snapshotDate = shiftDate(asOf, -7 * offset);
    const summary = buildKaiWeeklySummary(workouts, plannedWorkouts, snapshotDate);
    const previousSummary = buildKaiWeeklySummary(
      workouts,
      plannedWorkouts,
      shiftDate(snapshotDate, -7)
    );
    const review = buildKaiWeeklyReview(
      summary,
      previousSummary,
      workouts,
      snapshotDate,
      buildRecentExerciseHistory(workouts, snapshotDate),
      buildCurrentWeekReadinessHistory(readinessHistory, snapshotDate)
    );

    byWeekStart.set(summary.weekStart, {
      weekStart: summary.weekStart,
      state: review.state,
      plannedCount: summary.plannedCount,
      completedCount: summary.completedCount,
      missedCount: summary.missedCount
    });
  }

  return [...byWeekStart.values()].sort((left, right) =>
    left.weekStart.localeCompare(right.weekStart)
  );
}

function buildCurrentWeekReadinessHistory(
  readinessHistory: ReadinessHistoryEntry[],
  asOf: string
): ReadinessHistoryEntry[] {
  const { weekStart, weekEnd } = getWeekRange(asOf);

  return readinessHistory.filter(
    (entry) => entry.asOf >= weekStart && entry.asOf <= weekEnd && entry.asOf <= asOf
  );
}

function buildWeeklyDecisionLog(
  asOf: string,
  weeklySummary: KaiWeeklyPayload["weeklySummary"],
  weeklyReview: KaiWeeklyPayload["weeklyReview"],
  currentWeekReplan?: KaiCurrentWeekReplan
): KaiWeeklyDecisionLogEntry[] {
  const entries: KaiWeeklyDecisionLogEntry[] = [
    {
      kind: "generated",
      occurredAt: `${weeklySummary.weekStart}T06:00:00.000Z`,
      headline: "Weekly baseline generated.",
      details: [
        `Week window: ${weeklySummary.weekStart} to ${weeklySummary.weekEnd}.`,
        `Planned sessions in play: ${weeklySummary.plannedCount}.`
      ]
    },
    {
      kind: "reviewed",
      occurredAt: `${asOf}T12:00:00.000Z`,
      headline: weeklyReview.headline,
      details: weeklyReview.reasons.length
        ? weeklyReview.reasons
        : [weeklyReview.nextWeekFocus]
    }
  ];

  if (currentWeekReplan?.active) {
    entries.push({
      kind: "replanned",
      occurredAt: currentWeekReplan.appliedAt ?? `${asOf}T12:00:00.000Z`,
      headline: currentWeekReplan.reason ?? "Current week was replanned.",
      details: [
        currentWeekReplan.adaptationAction
          ? `Adaptation action: ${currentWeekReplan.adaptationAction}.`
          : "Adaptation action: none recorded.",
        `Affected planned workouts: ${currentWeekReplan.affectedPlannedCount}.`
      ]
    });
  }

  return entries;
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

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

function summarizeCurrentWeekReplan(
  plannedWorkouts: PlannedWorkout[],
  weekStart: string,
  weekEnd: string
): KaiCurrentWeekReplan | undefined {
  const replanned = plannedWorkouts.filter(
    (workout) =>
      workout.date >= weekStart &&
      workout.date <= weekEnd &&
      workout.replan?.source === "current_week_replan"
  );

  if (!replanned.length) {
    return {
      active: false,
      affectedPlannedCount: 0
    };
  }

  const latest = [...replanned].sort((left, right) =>
    (right.replan?.appliedAt ?? "").localeCompare(left.replan?.appliedAt ?? "")
  )[0];

  return {
    active: true,
    source: latest.replan?.source,
    adaptationAction: latest.replan?.adaptationAction,
    appliedAt: latest.replan?.appliedAt,
    reason: latest.replan?.reason,
    affectedPlannedCount: replanned.length
  };
}

function resolveEffectivePlanDay(
  weeklyPlan: KaiWeeklyPlan,
  asOf: string,
  plannedWorkoutForDay?: PlannedWorkout
): KaiWeeklyPlan["days"][number] | undefined {
  const generatedDay = weeklyPlan.days.find((day) => day.date === asOf);

  if (!plannedWorkoutForDay) {
    return generatedDay;
  }

  if (
    generatedDay?.status === "planned" &&
    generatedDay.workoutType === plannedWorkoutForDay.type
  ) {
    return generatedDay;
  }

  return generatedDay
    ? {
        ...generatedDay,
        status: "planned",
        workoutType: plannedWorkoutForDay.type,
        plannedDuration: plannedWorkoutForDay.plannedDuration,
        exerciseIntent: undefined,
        sessionTemplate: undefined,
        rationale: "This day is coming from the persisted current-week plan."
      }
    : {
        date: asOf,
        dayName: new Date(`${asOf}T00:00:00.000Z`).toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "UTC"
        }),
        workoutType: plannedWorkoutForDay.type,
        plannedDuration: plannedWorkoutForDay.plannedDuration,
        status: "planned",
        rationale: "This day is coming from the persisted current-week plan."
      };
}

export function resolveTodayReadinessResolution(input: {
  asOf: string;
  weeklyPlan: KaiWeeklyPlan;
  plannedWorkoutForDay?: PlannedWorkout;
  profile: KaiUserProfile;
  memory?: KaiMemory;
  workouts: WorkoutRecord[];
}): TodayReadinessResolution {
  const planDay = resolveEffectivePlanDay(
    input.weeklyPlan,
    input.asOf,
    input.plannedWorkoutForDay
  );
  const suggestedWorkoutSelection =
    !input.plannedWorkoutForDay && planDay?.status !== "planned"
      ? suggestFallbackWorkoutTypeSelection(
          input.memory,
          input.workouts,
          input.asOf,
          input.profile
        )
      : undefined;
  const suggestedWorkoutType = suggestedWorkoutSelection?.workoutType;
  const effectivePlanDay =
    !input.plannedWorkoutForDay && planDay?.status !== "planned" && suggestedWorkoutType
      ? buildSuggestedPlanDay(
          input.asOf,
          suggestedWorkoutType,
          input.profile,
          input.memory,
          input.workouts
        )
      : planDay;
  const effectiveWorkoutType =
    input.plannedWorkoutForDay?.type ??
    (effectivePlanDay?.status === "planned"
      ? effectivePlanDay.workoutType
      : suggestedWorkoutType);
  const isSuggestedDay =
    !input.plannedWorkoutForDay &&
    planDay?.status !== "planned" &&
    Boolean(suggestedWorkoutType);
  const dayOrigin: DayOrigin = input.plannedWorkoutForDay
    ? "planned"
    : isSuggestedDay
      ? "suggested"
      : "unplanned";
  const suggestedDayBias =
    isSuggestedDay && effectiveWorkoutType
      ? summarizeSuggestedDayTemplateBias(
          effectiveWorkoutType,
          input.asOf,
          input.workouts
        )?.pattern
      : undefined;

  return {
    planDay,
    effectivePlanDay,
    effectiveWorkoutType,
    suggestedWorkoutType,
    suggestedWorkoutReasonLabel: suggestedWorkoutSelection?.reasonLabel,
    dayOrigin,
    suggestedDayBias,
    plannedDayContext: {
      dayOrigin,
      originReasonLabel: suggestedWorkoutSelection?.reasonLabel,
      originBias: suggestedDayBias,
      isPlannedDay: dayOrigin !== "unplanned",
      isSuggestedDay: dayOrigin === "suggested",
      suggestedDayBias,
      workoutType: effectiveWorkoutType,
      progressionIntent: effectivePlanDay?.progressionIntent,
      exerciseIntent: effectivePlanDay?.exerciseIntent,
      sessionTemplate: effectivePlanDay?.sessionTemplate
    }
  };
}

export function buildResolvedTrainingReadinessReport(
  input: ResolvedTrainingReadinessReportInput
): TrainingReadinessReport {
  const workouts = input.repositories.workouts.getWorkouts(input.userId);
  const plannedWorkoutForDay = input.repositories.plannedWorkouts.findPlannedWorkout(
    input.userId,
    input.asOf
  );
  const todayReadiness = resolveTodayReadinessResolution({
    asOf: input.asOf,
    weeklyPlan: input.weeklyPlan,
    plannedWorkoutForDay,
    profile: input.profile,
    memory: input.memory,
    workouts
  });
  const effectivePlanDay = todayReadiness.effectivePlanDay;

  return buildTrainingReadinessReport(
    input.userId,
    workouts,
    input.asOf,
    todayReadiness.effectiveWorkoutType,
    input.profile.experienceLevel,
    input.memory?.recommendationMemory,
    {
      goal: input.profile.goal,
      equipmentAccess: input.profile.equipmentAccess,
      focusMuscles: input.profile.focusMuscles,
      favoriteExerciseIds: input.profile.favoriteExerciseIds,
      dislikedExerciseIds: input.profile.dislikedExerciseIds,
      painFlags: input.profile.painFlags,
      plannedFocusMuscles: effectivePlanDay?.exerciseIntent?.focusMuscles,
      plannedAvoidMuscles: effectivePlanDay?.exerciseIntent?.avoidMuscles,
      plannedPreferredExerciseIds: effectivePlanDay?.exerciseIntent?.preferredExerciseIds
    },
    todayReadiness.plannedDayContext
  );
}

export function suggestFallbackWorkoutType(
  memory: KaiMemory | undefined,
  workouts: WorkoutRecord[],
  asOf: string,
  profile?: KaiUserProfile
): string | undefined {
  return suggestFallbackWorkoutTypeSelection(memory, workouts, asOf, profile)?.workoutType;
}

function suggestFallbackWorkoutTypeSelection(
  memory: KaiMemory | undefined,
  workouts: WorkoutRecord[],
  asOf: string,
  profile?: KaiUserProfile
):
  | {
      workoutType: string;
      reasonLabel: string;
    }
  | undefined {
  const pattern = memory?.sessionPatternMemory;
  if (!pattern || pattern.structuredPatternConfidence < 0.6) {
    return undefined;
  }

  const candidateScores = new Map<
    string,
    {
      score: number;
      reasons: Set<"pattern" | "drift" | "handling">;
    }
  >();
  const addCandidate = (
    workoutType: string | undefined,
    scoreDelta: number,
    reason: "pattern" | "drift" | "handling"
  ) => {
    if (!workoutType || !isWorkoutTypeAllowed(workoutType, profile)) {
      return;
    }

    const currentEntry = candidateScores.get(workoutType) ?? {
      score: 0,
      reasons: new Set<"pattern" | "drift" | "handling">()
    };
    currentEntry.score += scoreDelta;
    currentEntry.reasons.add(reason);
    candidateScores.set(workoutType, currentEntry);
  };

  const dominantSuggestedDrift = memory?.suggestedWorkoutMemory?.dominantDrift;
  if (
    dominantSuggestedDrift &&
    dominantSuggestedDrift.occurrences >= 2 &&
    dominantSuggestedDrift.followThroughRate <= 0.4 &&
    (pattern.patternLabel === "repeat_day_by_day" || pattern.patternLabel === "alternating_mix")
  ) {
    if (isWorkoutTypeAllowed(dominantSuggestedDrift.performedWorkoutType, profile)) {
      return {
        workoutType: dominantSuggestedDrift.performedWorkoutType,
        reasonLabel: "recent_follow_through"
      };
    }
  }

  const recentCompleted = workouts
    .filter((workout) => workout.status === "completed" && workout.date <= asOf)
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      (left.recordedAt ?? "").localeCompare(right.recordedAt ?? "")
    );
  const lastWorkoutType =
    recentCompleted.at(-1)?.outcomeSummary?.performedWorkoutType ??
    recentCompleted.at(-1)?.type ??
    pattern.recentSequence.at(-1);

  if (pattern.patternLabel === "repeat_day_by_day") {
    addCandidate(lastWorkoutType, 1.25, "pattern");
    addCandidate(pattern.dominantWorkoutTypes[0], 0.8, "pattern");
  }

  if (lastWorkoutType) {
    const nextFromTransition = findNextWorkoutTypeFromPattern(pattern, lastWorkoutType);
    if (nextFromTransition) {
      addCandidate(nextFromTransition, 1.2, "pattern");
    }
  }

  if (pattern.patternLabel === "alternating_mix" && pattern.dominantWorkoutTypes.length >= 2) {
    const nextType = pattern.dominantWorkoutTypes.find(
      (type: string) => type !== lastWorkoutType
    );
    addCandidate(nextType, 0.95, "pattern");
    addCandidate(pattern.dominantWorkoutTypes[0], 0.55, "pattern");
  }

  if (pattern.patternLabel === "stable_split" && pattern.dominantWorkoutTypes.length > 0) {
    if (lastWorkoutType) {
      const index = pattern.dominantWorkoutTypes.indexOf(lastWorkoutType);
      if (index >= 0) {
        addCandidate(
          pattern.dominantWorkoutTypes[
            (index + 1) % pattern.dominantWorkoutTypes.length
          ],
          1.1,
          "pattern"
        );
      }
    }

    addCandidate(pattern.dominantWorkoutTypes[0], 0.6, "pattern");
  }

  for (const dominantWorkoutType of pattern.dominantWorkoutTypes) {
    addCandidate(dominantWorkoutType, 0.25, "pattern");
  }

  for (const workoutType of candidateScores.keys()) {
    const quality = summarizeWorkoutTypeSuggestionQuality(
      recentCompleted,
      workoutType
    );
    if (quality.score !== 0) {
      addCandidate(workoutType, quality.score, "handling");
    }
    if (pattern.patternLabel !== "repeat_day_by_day" && workoutType === lastWorkoutType) {
      addCandidate(workoutType, -0.35, "pattern");
    }
  }

  const topCandidate = [...candidateScores.entries()].sort((left, right) => {
    if (right[1].score !== left[1].score) {
      return right[1].score - left[1].score;
    }

    return compareWorkoutTypeRecency(recentCompleted, right[0], left[0]);
  })[0];

  if (!topCandidate) {
    return undefined;
  }

  return {
    workoutType: topCandidate[0],
    reasonLabel: chooseSuggestedWorkoutReasonLabel(
      topCandidate[1].reasons,
      dominantSuggestedDrift?.performedWorkoutType,
      topCandidate[0]
    )
  };
}

function isWorkoutTypeAllowed(
  workoutType: string,
  profile?: KaiUserProfile
): boolean {
  return !profile?.hardConstraints?.some(
    (constraint) =>
      constraint.kind === "avoid_workout_type" && constraint.value === workoutType
  );
}

function findNextWorkoutTypeFromPattern(
  pattern: KaiMemory["sessionPatternMemory"],
  lastWorkoutType: string
): string | undefined {
  const transitionCounts = new Map<string, number>();

  for (const transition of pattern.commonTransitions) {
    const [from, to] = transition.split("->");
    if (!from || !to || from !== lastWorkoutType) {
      continue;
    }

    transitionCounts.set(to, (transitionCounts.get(to) ?? 0) + 1);
  }

  return [...transitionCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function summarizeWorkoutTypeSuggestionQuality(
  recentCompleted: WorkoutRecord[],
  workoutType: string
): {
  score: number;
} {
  const matchingSessions = recentCompleted
    .filter((workout) => {
      const performedWorkoutType =
        workout.outcomeSummary?.performedWorkoutType ?? workout.type;
      return performedWorkoutType === workoutType;
    })
    .slice(-4);

  if (!matchingSessions.length) {
    return { score: 0 };
  }

  let score = 0;

  for (const workout of matchingSessions) {
    const outcome = workout.outcomeSummary;
    if (!outcome) {
      continue;
    }

    if (outcome.executionQuality === "strong") {
      score += 0.55;
    } else if (outcome.executionQuality === "workable") {
      score += 0.18;
    } else {
      score -= 0.8;
    }

    if (outcome.sessionSize === "thin") {
      score -= 0.35;
    } else if (outcome.sessionSize === "full") {
      score += 0.15;
    }

    if (outcome.mainCovered && outcome.supportCovered) {
      score += 0.15;
    }
  }

  const latestSession = matchingSessions.at(-1)?.outcomeSummary;
  if (latestSession?.executionQuality === "strong") {
    score += 0.25;
  } else if (latestSession?.executionQuality === "survival") {
    score -= 0.3;
  }

  return {
    score: roundToTwoDecimals(Math.max(-2, Math.min(2, score)))
  };
}

function compareWorkoutTypeRecency(
  recentCompleted: WorkoutRecord[],
  leftWorkoutType: string,
  rightWorkoutType: string
): number {
  const leftIndex = findMostRecentWorkoutTypeIndex(recentCompleted, leftWorkoutType);
  const rightIndex = findMostRecentWorkoutTypeIndex(recentCompleted, rightWorkoutType);
  return leftIndex - rightIndex;
}

function findMostRecentWorkoutTypeIndex(
  recentCompleted: WorkoutRecord[],
  workoutType: string
): number {
  for (let index = recentCompleted.length - 1; index >= 0; index -= 1) {
    const performedWorkoutType =
      recentCompleted[index]?.outcomeSummary?.performedWorkoutType ??
      recentCompleted[index]?.type;
    if (performedWorkoutType === workoutType) {
      return index;
    }
  }

  return -1;
}

function chooseSuggestedWorkoutReasonLabel(
  reasons: Set<"pattern" | "drift" | "handling">,
  dominantDriftWorkoutType: string | undefined,
  selectedWorkoutType: string
): string {
  if (reasons.has("drift") && dominantDriftWorkoutType === selectedWorkoutType) {
    return "recent_follow_through";
  }

  if (reasons.has("handling")) {
    return "recent_handling";
  }

  return "recent_pattern";
}

function formatWorkoutTypeLabel(workoutType: string): string {
  const normalized = workoutType.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
