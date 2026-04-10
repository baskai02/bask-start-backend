import type {
  KaiUserProfile,
  PlannedWorkoutInput,
  WorkoutCompletionInput,
  WorkoutMissedInput
} from "../kai/types.js";
import type { BaskRepositories } from "../store/repositories.js";

type WorkoutRepository = Pick<BaskRepositories, "workouts">["workouts"];
type ProfileRepository = Pick<BaskRepositories, "profiles">["profiles"];
type PlannedWorkoutRepository = Pick<
  BaskRepositories,
  "plannedWorkouts"
>["plannedWorkouts"];

export type ScenarioName =
  | "planned_today"
  | "mixed_week"
  | "momentum_week"
  | "missed_plan_reset"
  | "suggested_upper_pull_bias"
  | "thin_history_pain_limited_upper"
  | "thin_history_equipment_limited_upper"
  | "upper_push_fatigued"
  | "posterior_chain_fatigued"
  | "push_day_fatigued"
  | "pull_day_fatigued"
  | "quad_dominant_fatigued";

export interface ScenarioSeedResult {
  scenario: ScenarioName;
  asOf: string;
  profile: KaiUserProfile;
}

interface SeedScenarioOptionsWithRepositories {
  userId: string;
  scenario: ScenarioName;
  repositories: Pick<BaskRepositories, "workouts" | "profiles" | "plannedWorkouts">;
}

interface SeedScenarioOptionsWithStores {
  userId: string;
  scenario: ScenarioName;
  store: WorkoutRepository;
  profileStore: ProfileRepository;
  plannedWorkoutStore: PlannedWorkoutRepository;
}

type SeedScenarioOptions =
  | SeedScenarioOptionsWithRepositories
  | SeedScenarioOptionsWithStores;

export function seedScenario(options: SeedScenarioOptions): ScenarioSeedResult {
  const store =
    "repositories" in options ? options.repositories.workouts : options.store;
  const profileStore =
    "repositories" in options ? options.repositories.profiles : options.profileStore;
  const plannedWorkoutStore =
    "repositories" in options
      ? options.repositories.plannedWorkouts
      : options.plannedWorkoutStore;

  store.clearWorkouts(options.userId);
  plannedWorkoutStore.clearPlannedWorkouts(options.userId);

  const profile = seedProfile(options.userId, profileStore);

  switch (options.scenario) {
    case "planned_today":
      seedPlannedToday(options.userId, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-24", profile };
    case "mixed_week":
      seedMixedWeek(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-22", profile };
    case "momentum_week":
      seedMomentumWeek(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-24", profile };
    case "missed_plan_reset":
      seedMissedPlanReset(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-22", profile };
    case "suggested_upper_pull_bias": {
      const scenarioProfile = profileStore.saveProfile({
        ...profile,
        name: "Suggested Pull Bias",
        goal: "build_muscle",
        experienceLevel: "intermediate",
        targetSessionsPerWeek: 4,
        preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
        preferredSessionLength: 55,
        trainingStylePreference: "balanced"
      });
      seedSuggestedUpperPullBias(options.userId, store);
      return { scenario: options.scenario, asOf: "2026-04-01", profile: scenarioProfile };
    }
    case "thin_history_pain_limited_upper": {
      const scenarioProfile = profileStore.saveProfile({
        ...profile,
        name: "Thin History Pain-Limited Upper",
        goal: "build_muscle",
        experienceLevel: "intermediate",
        targetSessionsPerWeek: 4,
        preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
        preferredSessionLength: 50,
        trainingStylePreference: "balanced",
        painFlags: ["front_delts"]
      });
      seedThinHistoryUpperDay(options.userId, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-30", profile: scenarioProfile };
    }
    case "thin_history_equipment_limited_upper": {
      const scenarioProfile = profileStore.saveProfile({
        ...profile,
        name: "Thin History Equipment-Limited Upper",
        goal: "build_muscle",
        experienceLevel: "intermediate",
        targetSessionsPerWeek: 4,
        preferredWorkoutDays: ["monday", "tuesday", "thursday", "friday"],
        preferredSessionLength: 50,
        trainingStylePreference: "balanced",
        equipmentAccess: "bodyweight_only"
      });
      seedThinHistoryUpperDay(options.userId, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-30", profile: scenarioProfile };
    }
    case "upper_push_fatigued":
      seedUpperPushFatigued(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-24", profile };
    case "posterior_chain_fatigued":
      seedPosteriorChainFatigued(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-24", profile };
    case "push_day_fatigued":
      seedPushDayFatigued(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-24", profile };
    case "pull_day_fatigued":
      seedPullDayFatigued(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-24", profile };
    case "quad_dominant_fatigued":
      seedQuadDominantFatigued(options.userId, store, plannedWorkoutStore);
      return { scenario: options.scenario, asOf: "2026-03-24", profile };
  }
}

function seedProfile(
  userId: string,
  profileStore: ProfileRepository
): KaiUserProfile {
  return profileStore.saveProfile({
    userId,
    name: "Kabur",
    goal: "get_fitter",
    experienceLevel: "beginner"
  });
}

function seedPlannedToday(
  userId: string,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-24", "full_body", 30)
  );
}

function seedThinHistoryUpperDay(
  userId: string,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-30", "upper_body", 45)
  );
}

function seedMixedWeek(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-21", "upper_body", 40)
  );
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_2", "2026-03-22", "lower_body", 35)
  );
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_3", "2026-03-24", "full_body", 30)
  );

  store.recordCompletedWorkout(
    createCompletedWorkout(userId, "workout_1", "2026-03-21", "upper_body", 40, 38)
  );
  store.recordMissedWorkout(
    createMissedWorkout(userId, "workout_2", "2026-03-22", "lower_body", 35)
  );
}

function seedMomentumWeek(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-22", "upper_body", 35)
  );
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_2", "2026-03-23", "lower_body", 35)
  );
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_3", "2026-03-24", "full_body", 30)
  );

  store.recordCompletedWorkout(
    createCompletedWorkout(userId, "workout_1", "2026-03-22", "upper_body", 35, 35)
  );
  store.recordCompletedWorkout(
    createCompletedWorkout(userId, "workout_2", "2026-03-23", "lower_body", 35, 34)
  );
  store.recordCompletedWorkout(
    createCompletedWorkout(userId, "workout_3", "2026-03-24", "full_body", 30, 29)
  );
}

function seedMissedPlanReset(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-21", "upper_body", 40)
  );
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_2", "2026-03-22", "lower_body", 35)
  );
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_3", "2026-03-24", "full_body", 30)
  );

  store.recordMissedWorkout(
    createMissedWorkout(userId, "workout_1", "2026-03-21", "upper_body", 40)
  );
  store.recordMissedWorkout(
    createMissedWorkout(userId, "workout_2", "2026-03-22", "lower_body", 35)
  );
}

function seedSuggestedUpperPullBias(
  userId: string,
  store: WorkoutRepository
): void {
  for (const [index, date] of ["2026-03-25", "2026-03-29"].entries()) {
    store.recordCompletedWorkout({
      ...createCompletedWorkout(
        userId,
        `suggested_upper_pull_bias_upper_${index + 1}`,
        date,
        "upper_body",
        55,
        50
      ),
      sessionExercises: [
        { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "moderate" },
        {
          exerciseId: "chest_supported_machine_row",
          sets: 4,
          reps: 10,
          effort: "moderate"
        },
        { exerciseId: "rear_delt_fly", sets: 3, reps: 15, effort: "moderate" }
      ]
    });
  }

  store.recordCompletedWorkout({
    ...createCompletedWorkout(
      userId,
      "suggested_upper_pull_bias_lower_1",
      "2026-03-27",
      "lower_body",
      55,
      50
    ),
    sessionExercises: [{ exerciseId: "leg_press", sets: 3, reps: 10, effort: "moderate" }]
  });

  store.recordCompletedWorkout({
    ...createCompletedWorkout(
      userId,
      "suggested_upper_pull_bias_lower_2",
      "2026-03-31",
      "lower_body",
      55,
      50
    ),
    sessionExercises: [{ exerciseId: "romanian_deadlift", sets: 3, reps: 8, effort: "moderate" }]
  });
}

function seedUpperPushFatigued(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-24", "lower_body", 40)
  );

  store.recordCompletedWorkout({
    ...createCompletedWorkout(userId, "workout_1", "2026-03-23", "upper_push", 45, 42),
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 4, reps: 8, effort: "hard" },
      { exerciseId: "incline_dumbbell_press", sets: 3, reps: 10, effort: "moderate" },
      { exerciseId: "tricep_pushdown", sets: 3, reps: 12, effort: "moderate" }
    ]
  });
}

function seedPosteriorChainFatigued(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-24", "lower_body", 45)
  );

  store.recordCompletedWorkout({
    ...createCompletedWorkout(
      userId,
      "workout_1",
      "2026-03-23",
      "posterior_chain",
      55,
      50
    ),
    sessionExercises: [
      { exerciseId: "deadlift_conventional", sets: 4, reps: 5, effort: "hard" },
      { exerciseId: "barbell_bent_over_row", sets: 3, reps: 8, effort: "hard" },
      { exerciseId: "shrug", sets: 3, reps: 12, effort: "moderate" }
    ]
  });
}

function seedPushDayFatigued(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-24", "push_day", 45)
  );

  store.recordCompletedWorkout({
    ...createCompletedWorkout(userId, "workout_1", "2026-03-23", "upper_push", 50, 47),
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 5, reps: 6, effort: "hard" },
      { exerciseId: "incline_dumbbell_press", sets: 4, reps: 8, effort: "hard" },
      { exerciseId: "overhead_shoulder_press", sets: 4, reps: 8, effort: "hard" },
      { exerciseId: "tricep_pushdown", sets: 4, reps: 12, effort: "hard" },
      { exerciseId: "overhead_tricep_extension", sets: 3, reps: 12, effort: "moderate" }
    ]
  });

  store.recordCompletedWorkout({
    ...createCompletedWorkout(userId, "workout_2", "2026-03-22", "upper_push", 45, 43),
    sessionExercises: [
      { exerciseId: "barbell_bench_press", sets: 4, reps: 8, effort: "moderate" },
      { exerciseId: "lateral_raise", sets: 4, reps: 15, effort: "moderate" },
      { exerciseId: "triceps_rope_pushdown", sets: 4, reps: 12, effort: "moderate" }
    ]
  });
}

function seedPullDayFatigued(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-24", "pull_day", 45)
  );

  store.recordCompletedWorkout({
    ...createCompletedWorkout(userId, "workout_1", "2026-03-23", "pull_day", 50, 46),
    sessionExercises: [
      { exerciseId: "lat_pulldown", sets: 5, reps: 8, effort: "hard" },
      { exerciseId: "seated_cable_row", sets: 4, reps: 10, effort: "hard" },
      { exerciseId: "chest_supported_dumbbell_row", sets: 4, reps: 10, effort: "hard" },
      { exerciseId: "barbell_curl", sets: 4, reps: 12, effort: "moderate" }
    ]
  });

  store.recordCompletedWorkout({
    ...createCompletedWorkout(userId, "workout_2", "2026-03-22", "pull_day", 45, 42),
    sessionExercises: [
      { exerciseId: "assisted_pull_up_machine", sets: 4, reps: 8, effort: "moderate" },
      { exerciseId: "single_arm_cable_row", sets: 4, reps: 12, effort: "moderate" },
      { exerciseId: "preacher_curl", sets: 3, reps: 12, effort: "moderate" }
    ]
  });
}

function seedQuadDominantFatigued(
  userId: string,
  store: WorkoutRepository,
  plannedWorkoutStore: PlannedWorkoutRepository
): void {
  plannedWorkoutStore.savePlannedWorkout(
    createPlannedWorkout(userId, "planned_1", "2026-03-24", "lower_body", 45)
  );

  store.recordCompletedWorkout({
    ...createCompletedWorkout(userId, "workout_1", "2026-03-23", "lower_body", 50, 48),
    sessionExercises: [
      { exerciseId: "barbell_back_squat", sets: 4, reps: 6, effort: "hard" },
      { exerciseId: "leg_press", sets: 4, reps: 10, effort: "hard" },
      { exerciseId: "leg_extension", sets: 3, reps: 15, effort: "moderate" }
    ]
  });
}

function createPlannedWorkout(
  userId: string,
  id: string,
  date: string,
  type: string,
  plannedDuration: number
): PlannedWorkoutInput {
  return { userId, id, date, type, plannedDuration };
}

function createCompletedWorkout(
  userId: string,
  id: string,
  date: string,
  type: string,
  plannedDuration: number,
  completedDuration: number
): WorkoutCompletionInput {
  return {
    userId,
    id,
    date,
    type,
    plannedDuration,
    completedDuration,
    recordedAt: `${date}T08:00:00.000Z`
  };
}

function createMissedWorkout(
  userId: string,
  id: string,
  date: string,
  type: string,
  plannedDuration: number
): WorkoutMissedInput {
  return {
    userId,
    id,
    date,
    type,
    plannedDuration,
    recordedAt: `${date}T20:00:00.000Z`
  };
}
