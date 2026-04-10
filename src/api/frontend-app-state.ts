import {
  buildFrontendTrainingReadinessResponse as buildFrontendReadinessPayload,
  buildReadinessHistoryEntry
} from "../exercises/frontend-response.js";
import type { FrontendTrainingReadinessResponse } from "../exercises/types.js";
import {
  buildResolvedTrainingReadinessReport,
  resolveTodayReadinessResolution
} from "../kai/service.js";
import type {
  KaiPayload,
  KaiUserProfile,
  KaiWeeklyPlan
} from "../kai/types.js";
import type { BaskRepositories } from "../store/repositories.js";

interface FrontendAppStateKaiService {
  getKaiPayload(userId: string, asOf: string, profile?: KaiUserProfile): KaiPayload;
  getKaiWeeklyPlan(userId: string, asOf: string, profile?: KaiUserProfile): KaiWeeklyPlan;
}

export interface FrontendAppStateResponse {
  userId: string;
  asOf: string;
  profile: KaiUserProfile;
  kaiPayload: KaiPayload;
  todayReadiness: FrontendTrainingReadinessResponse;
}

export function buildFrontendAppStateResponse(input: {
  repositories: BaskRepositories;
  kaiService: FrontendAppStateKaiService;
  userId: string;
  asOf: string;
  profile?: KaiUserProfile;
}): FrontendAppStateResponse {
  const profile =
    input.profile ?? input.repositories.profiles.getProfile(input.userId);
  const kaiPayload = input.kaiService.getKaiPayload(input.userId, input.asOf, profile);
  const weeklyPlan = input.kaiService.getKaiWeeklyPlan(input.userId, input.asOf, profile);
  const plannedWorkoutForDay = input.repositories.plannedWorkouts.findPlannedWorkout(
    input.userId,
    input.asOf
  );
  const todayReadinessResolution = resolveTodayReadinessResolution({
    asOf: input.asOf,
    weeklyPlan,
    plannedWorkoutForDay,
    profile,
    memory: kaiPayload.memory,
    workouts: input.repositories.workouts.getWorkouts(input.userId)
  });
  const trainingReadiness = buildResolvedTrainingReadinessReport({
    repositories: input.repositories,
    userId: input.userId,
    asOf: input.asOf,
    profile,
    weeklyPlan,
    memory: kaiPayload.memory
  });
  const todayReadiness = buildFrontendReadinessPayload(
    input.userId,
    input.asOf,
    trainingReadiness,
    kaiPayload.weeklyPlanContext,
    todayReadinessResolution.plannedDayContext
  );

  input.repositories.readinessHistory.saveReadinessHistory(
    buildReadinessHistoryEntry(todayReadiness)
  );

  return {
    userId: input.userId,
    asOf: input.asOf,
    profile,
    kaiPayload,
    todayReadiness
  };
}
