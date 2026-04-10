import type {
  ExperienceLevel,
  KaiAppProfileSnapshot,
  KaiConfidenceLevel,
  KaiUserProfile,
  PlannedWorkoutInput,
  TrainingStylePreference,
  TonePreference,
  UserGoal,
  WorkoutCompletionInput,
  WorkoutExecutionFeedback,
  WorkoutMissedInput
} from "../kai/types.js";
import type {
  HardConstraint,
  HardConstraintKind,
  HardConstraintSource,
  ExerciseSetEntry,
  MuscleGroup,
  SessionEffort,
  WorkoutExerciseEntry
} from "../exercises/types.js";

const USER_GOALS: UserGoal[] = [
  "lose_weight",
  "build_muscle",
  "get_fitter",
  "build_consistency"
];

const EXPERIENCE_LEVELS: ExperienceLevel[] = ["beginner", "intermediate"];
const HARD_CONSTRAINT_KINDS: HardConstraintKind[] = [
  "avoid_exercise",
  "avoid_muscle",
  "avoid_workout_type"
];
const HARD_CONSTRAINT_SOURCES: HardConstraintSource[] = [
  "pain",
  "injury",
  "preference",
  "equipment",
  "other"
];

export class ValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = statusCode;
  }
}

export function parseAsOfDate(input: string | null | undefined, fallback: string): string {
  const value = input ?? fallback;
  assertDateString(value, "asOf");
  return value;
}

export function parseUserIdBody(body: unknown): { userId: string } {
  const object = asObject(body, "Request body must be a JSON object.");
  return {
    userId: requireString(object.userId, "userId")
  };
}

export function parseProfileInput(
  body: unknown,
  userIdOverride?: string
): KaiUserProfile | KaiAppProfileSnapshot {
  const object = asObject(body, "Request body must be a JSON object.");
  const userId = userIdOverride ?? requireString(object.userId, "userId");
  const name = optionalString(object.name, "name");
  const goal = optionalProfileGoal(object.goal);
  const experienceLevel = optionalExperienceLevel(object.experienceLevel);

  return {
    userId,
    name,
    goal,
    experienceLevel,
    primaryGoal: optionalPrimaryGoal(object.primaryGoal),
    weeklyCommitment: optionalPositiveNumber(object.weeklyCommitment, "weeklyCommitment"),
    sessionLength: optionalPositiveNumber(object.sessionLength, "sessionLength"),
    preferredWorkoutDays: optionalStringArray(object.preferredWorkoutDays, "preferredWorkoutDays"),
    tonePreference: optionalTonePreference(object.tonePreference),
    equipment: optionalEquipmentAccess(object.equipment),
    trainingStylePreference: optionalTrainingStylePreference(object.trainingStylePreference),
    confidenceLevel: optionalConfidenceLevel(object.confidenceLevel),
    focusMuscles: optionalMuscleGroups(object.focusMuscles, "focusMuscles"),
    favoriteExerciseIds: optionalStringArray(object.favoriteExerciseIds, "favoriteExerciseIds"),
    dislikedExerciseIds: optionalStringArray(object.dislikedExerciseIds, "dislikedExerciseIds"),
    painFlags: optionalMuscleGroups(object.painFlags, "painFlags"),
    constraints: optionalStringArray(object.constraints, "constraints"),
    hardConstraints: optionalHardConstraints(object.hardConstraints, "hardConstraints")
  };
}

export function parseWorkoutCompletionInput(
  body: unknown,
  userIdOverride?: string
): WorkoutCompletionInput {
  const object = asObject(body, "Request body must be a JSON object.");
  const userId = userIdOverride ?? requireString(object.userId, "userId");
  const date = requireDateString(object.date, "date");
  const plannedDuration = requirePositiveNumber(
    object.plannedDuration,
    "plannedDuration"
  );
  const completedDuration = requirePositiveNumber(
    object.completedDuration,
    "completedDuration"
  );

  return {
    id: requireString(object.id, "id"),
    userId,
    date,
    recordedAt: optionalString(object.recordedAt, "recordedAt"),
    type: requireString(object.type, "type"),
    plannedDuration,
    completedDuration,
    sessionExercises: optionalWorkoutExercises(object.sessionExercises),
    executionFeedback: optionalExecutionFeedback(object.executionFeedback)
  };
}

export function parseWorkoutMissedInput(
  body: unknown,
  userIdOverride?: string
): WorkoutMissedInput {
  const object = asObject(body, "Request body must be a JSON object.");
  const userId = userIdOverride ?? requireString(object.userId, "userId");

  return {
    id: requireString(object.id, "id"),
    userId,
    date: requireDateString(object.date, "date"),
    recordedAt: optionalString(object.recordedAt, "recordedAt"),
    type: requireString(object.type, "type"),
    plannedDuration: requirePositiveNumber(object.plannedDuration, "plannedDuration")
  };
}

export function parsePlannedWorkoutInput(
  body: unknown,
  userIdOverride?: string
): PlannedWorkoutInput {
  const object = asObject(body, "Request body must be a JSON object.");
  const userId = userIdOverride ?? requireString(object.userId, "userId");

  return {
    id: requireString(object.id, "id"),
    userId,
    date: requireDateString(object.date, "date"),
    type: requireString(object.type, "type"),
    plannedDuration: requirePositiveNumber(object.plannedDuration, "plannedDuration")
  };
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(message);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${fieldName} is required.`);
  }

  return value.trim();
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, fieldName);
}

function requirePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number.`);
  }

  return value;
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new ValidationError(`${fieldName} must be a boolean.`);
  }

  return value;
}

function optionalPositiveNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requirePositiveNumber(value, fieldName);
}

function requireDateString(value: unknown, fieldName: string): string {
  const stringValue = requireString(value, fieldName);
  assertDateString(stringValue, fieldName);
  return stringValue;
}

function assertDateString(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${fieldName} must use YYYY-MM-DD format.`);
  }
}

function requireEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fieldName: string
): T {
  const stringValue = requireString(value, fieldName);

  if (!allowedValues.includes(stringValue as T)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(", ")}.`
    );
  }

  return stringValue as T;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fieldName: string
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireEnum(value, allowedValues, fieldName);
}

function optionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) =>
    requireString(entry, `${fieldName}[${index}]`)
  );
}

function optionalHardConstraints(
  value: unknown,
  fieldName: string
): HardConstraint[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) => {
    const object = asObject(entry, `${fieldName}[${index}] must be an object.`);
    return {
      kind: requireEnum(
        object.kind,
        HARD_CONSTRAINT_KINDS,
        `${fieldName}[${index}].kind`
      ),
      value: requireString(object.value, `${fieldName}[${index}].value`),
      note: optionalString(object.note, `${fieldName}[${index}].note`),
      source: optionalEnum(
        object.source,
        HARD_CONSTRAINT_SOURCES,
        `${fieldName}[${index}].source`
      )
    };
  });
}

function optionalProfileGoal(value: unknown): KaiAppProfileSnapshot["goal"] {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireEnum(
    value,
    [...USER_GOALS, "lose_fat", "gain_muscle", "get_stronger"] as const,
    "goal"
  );
}

function optionalPrimaryGoal(
  value: unknown
): KaiAppProfileSnapshot["primaryGoal"] {
  return optionalEnum(
    value,
    ["hypertrophy", "strength", "both"] as const,
    "primaryGoal"
  );
}

function optionalExperienceLevel(
  value: unknown
): KaiAppProfileSnapshot["experienceLevel"] {
  return optionalEnum(
    value,
    [...EXPERIENCE_LEVELS, "new", "novice", "experienced"] as const,
    "experienceLevel"
  );
}

function optionalTonePreference(value: unknown): TonePreference | undefined {
  return optionalEnum(
    value,
    ["supportive", "direct", "balanced"] as const,
    "tonePreference"
  );
}

function optionalEquipmentAccess(
  value: unknown
): KaiAppProfileSnapshot["equipment"] {
  return optionalEnum(
    value,
    [
      "full_gym",
      "dumbbells_only",
      "bodyweight_only",
      "machines_only",
      "mixed",
      "home",
      "gym"
    ] as const,
    "equipment"
  );
}

function optionalTrainingStylePreference(
  value: unknown
): TrainingStylePreference | "full_body_bias" | "split_bias" | undefined {
  return optionalEnum(
    value,
    ["full_body", "split_routine", "balanced", "full_body_bias", "split_bias"] as const,
    "trainingStylePreference"
  );
}

function optionalConfidenceLevel(
  value: unknown
): KaiConfidenceLevel | "unsure" | "confident" | undefined {
  return optionalEnum(
    value,
    ["low", "building", "high", "unsure", "confident"] as const,
    "confidenceLevel"
  );
}

function optionalMuscleGroups(
  value: unknown,
  fieldName: string
): MuscleGroup[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) =>
    requireEnum(
      entry,
      [
        "chest",
        "front_delts",
        "side_delts",
        "rear_delts",
        "triceps",
        "anconeus",
        "biceps",
        "brachialis",
        "brachioradialis",
        "lats",
        "teres_major",
        "upper_traps",
        "lower_traps",
        "mid_traps",
        "rhomboids",
        "forearm_flexors",
        "rotator_cuff",
        "serratus_anterior",
        "adductors",
        "glute_meds",
        "quads",
        "glutes",
        "hamstrings",
        "calves",
        "spinal_erectors",
        "core",
        "upper_back"
      ] as const,
      `${fieldName}[${index}]`
    )
  );
}

function optionalWorkoutExercises(value: unknown): WorkoutExerciseEntry[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ValidationError("sessionExercises must be an array.");
  }

  return value.map((entry, index) => {
    const object = asObject(
      entry,
      `sessionExercises[${index}] must be a JSON object.`
    );

    return {
      exerciseId: requireString(object.exerciseId, `sessionExercises[${index}].exerciseId`),
      sets: requirePositiveNumber(object.sets, `sessionExercises[${index}].sets`),
      reps: requirePositiveNumber(object.reps, `sessionExercises[${index}].reps`),
      effort: optionalEffort(object.effort, `sessionExercises[${index}].effort`),
      performedSets: optionalPerformedSets(
        object.performedSets,
        `sessionExercises[${index}].performedSets`
      )
    };
  });
}

function optionalExecutionFeedback(value: unknown): WorkoutExecutionFeedback | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const object = asObject(value, "executionFeedback must be a JSON object.");

  return {
    followedPlannedWorkout: optionalBoolean(
      object.followedPlannedWorkout,
      "executionFeedback.followedPlannedWorkout"
    ),
    followedSuggestedWorkoutType: optionalBoolean(
      object.followedSuggestedWorkoutType,
      "executionFeedback.followedSuggestedWorkoutType"
    ),
    mainCovered: optionalBoolean(object.mainCovered, "executionFeedback.mainCovered"),
    supportCovered: optionalBoolean(
      object.supportCovered,
      "executionFeedback.supportCovered"
    ),
    executionQuality: optionalEnum(
      object.executionQuality,
      ["strong", "workable", "survival"] as const,
      "executionFeedback.executionQuality"
    ),
    substitutedExerciseIds: optionalStringArray(
      object.substitutedExerciseIds,
      "executionFeedback.substitutedExerciseIds"
    ),
    substitutionPairs: optionalSubstitutionPairs(
      object.substitutionPairs,
      "executionFeedback.substitutionPairs"
    )
  };
}

function optionalSubstitutionPairs(
  value: unknown,
  fieldName: string
): WorkoutExecutionFeedback["substitutionPairs"] {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) => {
    const object = asObject(entry, `${fieldName}[${index}] must be a JSON object.`);
    return {
      fromExerciseId: requireString(
        object.fromExerciseId,
        `${fieldName}[${index}].fromExerciseId`
      ),
      toExerciseId: requireString(
        object.toExerciseId,
        `${fieldName}[${index}].toExerciseId`
      )
    };
  });
}

function optionalEffort(
  value: unknown,
  fieldName: string
): SessionEffort | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireEnum(
    value,
    ["easy", "moderate", "hard"] as const,
    fieldName
  ) as SessionEffort;
}

function optionalPerformedSets(
  value: unknown,
  fieldName: string
): ExerciseSetEntry[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) => {
    const object = asObject(entry, `${fieldName}[${index}] must be a JSON object.`);
    return {
      reps: requirePositiveNumber(object.reps, `${fieldName}[${index}].reps`),
      weightKg: optionalPositiveNumber(object.weightKg, `${fieldName}[${index}].weightKg`),
      effort: optionalEffort(object.effort, `${fieldName}[${index}].effort`),
      restSeconds: optionalPositiveNumber(
        object.restSeconds,
        `${fieldName}[${index}].restSeconds`
      ),
      completed: optionalBoolean(object.completed, `${fieldName}[${index}].completed`)
    };
  });
}
