import type {
  ExperienceLevel,
  KaiUserProfile,
  PlannedWorkoutInput,
  UserGoal,
  WorkoutCompletionInput,
  WorkoutMissedInput
} from "../kai/types.js";
import type { SessionEffort, WorkoutExerciseEntry } from "../exercises/types.js";

const USER_GOALS: UserGoal[] = [
  "lose_weight",
  "build_muscle",
  "get_fitter",
  "build_consistency"
];

const EXPERIENCE_LEVELS: ExperienceLevel[] = ["beginner", "intermediate"];

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
): KaiUserProfile {
  const object = asObject(body, "Request body must be a JSON object.");
  const userId = userIdOverride ?? requireString(object.userId, "userId");
  const name = requireString(object.name, "name");
  const goal = requireEnum(object.goal, USER_GOALS, "goal");
  const experienceLevel = requireEnum(
    object.experienceLevel,
    EXPERIENCE_LEVELS,
    "experienceLevel"
  );

  return {
    userId,
    name,
    goal,
    experienceLevel
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
    sessionExercises: optionalWorkoutExercises(object.sessionExercises)
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
      effort: optionalEffort(object.effort, `sessionExercises[${index}].effort`)
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
