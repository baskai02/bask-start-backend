const USER_GOALS = [
    "lose_weight",
    "build_muscle",
    "get_fitter",
    "build_consistency"
];
const EXPERIENCE_LEVELS = ["beginner", "intermediate"];
export class ValidationError extends Error {
    statusCode;
    constructor(message, statusCode = 422) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = statusCode;
    }
}
export function parseAsOfDate(input, fallback) {
    const value = input ?? fallback;
    assertDateString(value, "asOf");
    return value;
}
export function parseUserIdBody(body) {
    const object = asObject(body, "Request body must be a JSON object.");
    return {
        userId: requireString(object.userId, "userId")
    };
}
export function parseProfileInput(body, userIdOverride) {
    const object = asObject(body, "Request body must be a JSON object.");
    const userId = userIdOverride ?? requireString(object.userId, "userId");
    const name = requireString(object.name, "name");
    const goal = requireEnum(object.goal, USER_GOALS, "goal");
    const experienceLevel = requireEnum(object.experienceLevel, EXPERIENCE_LEVELS, "experienceLevel");
    return {
        userId,
        name,
        goal,
        experienceLevel
    };
}
export function parseWorkoutCompletionInput(body, userIdOverride) {
    const object = asObject(body, "Request body must be a JSON object.");
    const userId = userIdOverride ?? requireString(object.userId, "userId");
    const date = requireDateString(object.date, "date");
    const plannedDuration = requirePositiveNumber(object.plannedDuration, "plannedDuration");
    const completedDuration = requirePositiveNumber(object.completedDuration, "completedDuration");
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
export function parseWorkoutMissedInput(body, userIdOverride) {
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
export function parsePlannedWorkoutInput(body, userIdOverride) {
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
function asObject(value, message) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ValidationError(message);
    }
    return value;
}
function requireString(value, fieldName) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new ValidationError(`${fieldName} is required.`);
    }
    return value.trim();
}
function optionalString(value, fieldName) {
    if (value === undefined) {
        return undefined;
    }
    return requireString(value, fieldName);
}
function requirePositiveNumber(value, fieldName) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new ValidationError(`${fieldName} must be a positive number.`);
    }
    return value;
}
function requireDateString(value, fieldName) {
    const stringValue = requireString(value, fieldName);
    assertDateString(stringValue, fieldName);
    return stringValue;
}
function assertDateString(value, fieldName) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ValidationError(`${fieldName} must use YYYY-MM-DD format.`);
    }
}
function requireEnum(value, allowedValues, fieldName) {
    const stringValue = requireString(value, fieldName);
    if (!allowedValues.includes(stringValue)) {
        throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
    }
    return stringValue;
}
function optionalWorkoutExercises(value) {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new ValidationError("sessionExercises must be an array.");
    }
    return value.map((entry, index) => {
        const object = asObject(entry, `sessionExercises[${index}] must be a JSON object.`);
        return {
            exerciseId: requireString(object.exerciseId, `sessionExercises[${index}].exerciseId`),
            sets: requirePositiveNumber(object.sets, `sessionExercises[${index}].sets`),
            reps: requirePositiveNumber(object.reps, `sessionExercises[${index}].reps`),
            effort: optionalEffort(object.effort, `sessionExercises[${index}].effort`)
        };
    });
}
function optionalEffort(value, fieldName) {
    if (value === undefined) {
        return undefined;
    }
    return requireEnum(value, ["easy", "moderate", "hard"], fieldName);
}
