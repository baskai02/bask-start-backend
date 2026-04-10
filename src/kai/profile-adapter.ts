import type {
  ExperienceLevel,
  KaiAppProfileSnapshot,
  KaiConfidenceLevel,
  KaiEquipmentAccess,
  KaiUserProfile,
  TrainingStylePreference,
  UserGoal
} from "./types.js";
import type {
  HardConstraint,
  HardConstraintKind,
  HardConstraintSource,
  MuscleGroup
} from "../exercises/types.js";

export function normalizeProfileInput(
  input: KaiUserProfile | KaiAppProfileSnapshot
): KaiUserProfile {
  return {
    userId: input.userId,
    name: normalizeName(input.name),
    goal: normalizeGoal(input),
    experienceLevel: normalizeExperienceLevel(input),
    preferredWorkoutDays: normalizeWorkoutDays(input.preferredWorkoutDays),
    targetSessionsPerWeek: normalizeSessionCount(input),
    preferredSessionLength: normalizeSessionLength(input),
    tonePreference: normalizeTonePreference(input),
    equipmentAccess: normalizeEquipment(input),
    trainingStylePreference: normalizeTrainingStylePreference(input),
    confidenceLevel: normalizeConfidenceLevel(input),
    focusMuscles: normalizeFocusMuscles(input),
    favoriteExerciseIds: normalizeExerciseIds(input.favoriteExerciseIds),
    dislikedExerciseIds: normalizeExerciseIds(input.dislikedExerciseIds),
    painFlags: normalizePainFlags(input),
    constraints: normalizeConstraints(input),
    hardConstraints: normalizeHardConstraints(input)
  };
}

function normalizeName(name: string | null | undefined): string {
  if (!name?.trim()) {
    return "Friend";
  }

  return name.trim();
}

function normalizeGoal(
  input: KaiUserProfile | KaiAppProfileSnapshot
): UserGoal {
  if (input.goal === "build_muscle" || input.goal === "get_fitter" || input.goal === "build_consistency" || input.goal === "lose_weight") {
    return input.goal;
  }

  if (input.goal === "gain_muscle") {
    return "build_muscle";
  }

  if (input.goal === "lose_fat") {
    return "lose_weight";
  }

  if (input.goal === "get_stronger" || ("primaryGoal" in input && input.primaryGoal === "strength")) {
    return "get_fitter";
  }

  if ("primaryGoal" in input && input.primaryGoal === "hypertrophy") {
    return "build_muscle";
  }

  return "build_consistency";
}

function normalizeExperienceLevel(
  input: KaiUserProfile | KaiAppProfileSnapshot
): ExperienceLevel {
  if (input.experienceLevel === "intermediate") {
    return "intermediate";
  }

  if (input.experienceLevel === "experienced") {
    return "intermediate";
  }

  return "beginner";
}

function normalizeSessionCount(
  input: KaiUserProfile | KaiAppProfileSnapshot
): number | undefined {
  const value = "targetSessionsPerWeek" in input
    ? input.targetSessionsPerWeek
    : "weeklyCommitment" in input
      ? input.weeklyCommitment
      : undefined;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return clamp(Math.round(value), 1, 7);
}

function normalizeSessionLength(
  input: KaiUserProfile | KaiAppProfileSnapshot
): number | undefined {
  const value =
    "preferredSessionLength" in input
      ? input.preferredSessionLength
      : "sessionLength" in input
        ? input.sessionLength
        : undefined;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return clamp(Math.round(value), 15, 180);
}

function normalizeWorkoutDays(value: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = [...new Set(value.map((day) => day.trim().toLowerCase()).filter(Boolean))];
  return normalized.length ? normalized : undefined;
}

function normalizeTonePreference(
  input: KaiUserProfile | KaiAppProfileSnapshot
): KaiUserProfile["tonePreference"] {
  if (input.tonePreference === "supportive" || input.tonePreference === "direct" || input.tonePreference === "balanced") {
    return input.tonePreference;
  }

  return undefined;
}

function normalizeEquipment(
  input: KaiUserProfile | KaiAppProfileSnapshot
): KaiEquipmentAccess | undefined {
  const value =
    ("equipmentAccess" in input ? input.equipmentAccess : undefined) ??
    ("equipment" in input ? input.equipment : undefined);

  if (
    value === "full_gym" ||
    value === "dumbbells_only" ||
    value === "bodyweight_only" ||
    value === "machines_only" ||
    value === "mixed"
  ) {
    return value;
  }

  if (value === "gym") {
    return "full_gym";
  }

  if (value === "home") {
    return "mixed";
  }

  return undefined;
}

function normalizeFocusMuscles(
  input: KaiUserProfile | KaiAppProfileSnapshot
): KaiUserProfile["focusMuscles"] {
  if (!Array.isArray(input.focusMuscles)) {
    return undefined;
  }

  const normalized = [...new Set(input.focusMuscles.filter(Boolean))];
  return normalized.length ? normalized : undefined;
}

function normalizeTrainingStylePreference(
  input: KaiUserProfile | KaiAppProfileSnapshot
): TrainingStylePreference | undefined {
  const value =
    ("trainingStylePreference" in input ? input.trainingStylePreference : undefined) ??
    undefined;

  if (
    value === "full_body" ||
    value === "split_routine" ||
    value === "balanced"
  ) {
    return value;
  }

  if (value === "full_body_bias") {
    return "full_body";
  }

  if (value === "split_bias") {
    return "split_routine";
  }

  return undefined;
}

function normalizeConfidenceLevel(
  input: KaiUserProfile | KaiAppProfileSnapshot
): KaiConfidenceLevel | undefined {
  const value = ("confidenceLevel" in input ? input.confidenceLevel : undefined) ?? undefined;

  if (value === "low" || value === "building" || value === "high") {
    return value;
  }

  if (value === "unsure") {
    return "low";
  }

  if (value === "confident") {
    return "high";
  }

  return undefined;
}

function normalizeExerciseIds(value: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = [...new Set(value.map((entry) => entry.trim()).filter(Boolean))];
  return normalized.length ? normalized : undefined;
}

function normalizePainFlags(
  input: KaiUserProfile | KaiAppProfileSnapshot
): KaiUserProfile["painFlags"] {
  if (!Array.isArray(input.painFlags)) {
    return undefined;
  }

  const normalized = [...new Set(input.painFlags.filter(Boolean))];
  return normalized.length ? normalized : undefined;
}

function normalizeConstraints(
  input: KaiUserProfile | KaiAppProfileSnapshot
): string[] | undefined {
  if (!Array.isArray(input.constraints)) {
    return undefined;
  }

  const normalized = [...new Set(input.constraints.map((value) => value.trim()).filter(Boolean))];
  return normalized.length ? normalized : undefined;
}

function normalizeHardConstraints(
  input: KaiUserProfile | KaiAppProfileSnapshot
): KaiUserProfile["hardConstraints"] {
  const constraints: HardConstraint[] = [];
  const seen = new Set<string>();

  const pushConstraint = (constraint: HardConstraint | undefined) => {
    if (!constraint) {
      return;
    }

    const normalizedValue =
      constraint.kind === "avoid_muscle"
        ? normalizeMuscleConstraintValue(constraint.value)
        : constraint.value.trim();
    if (!normalizedValue) {
      return;
    }

    const normalizedConstraint: HardConstraint = {
      kind: constraint.kind,
      value: normalizedValue,
      ...(constraint.note?.trim() ? { note: constraint.note.trim() } : {}),
      ...(constraint.source ? { source: constraint.source } : {})
    };
    const key = `${normalizedConstraint.kind}:${normalizedConstraint.value}:${normalizedConstraint.source ?? ""}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    constraints.push(normalizedConstraint);
  };

  for (const entry of input.hardConstraints ?? []) {
    pushConstraint(normalizeHardConstraintEntry(entry));
  }

  for (const entry of input.constraints ?? []) {
    pushConstraint(parseLegacyConstraint(entry));
  }

  return constraints.length ? constraints : undefined;
}

function normalizeHardConstraintEntry(
  entry: HardConstraint | null | undefined
): HardConstraint | undefined {
  if (!entry) {
    return undefined;
  }

  const kind = normalizeHardConstraintKind(entry.kind);
  const value = entry.value?.trim();
  if (!kind || !value) {
    return undefined;
  }

  const source = normalizeHardConstraintSource(entry.source);
  return {
    kind,
    value,
    ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
    ...(source ? { source } : {})
  };
}

function parseLegacyConstraint(value: string): HardConstraint | undefined {
  const trimmed = value.trim();
  if (!trimmed.includes(":")) {
    return undefined;
  }

  const [rawKind, ...rest] = trimmed.split(":");
  const kind = normalizeHardConstraintKind(rawKind);
  const normalizedValue = rest.join(":").trim();
  if (!kind || !normalizedValue) {
    return undefined;
  }

  return {
    kind,
    value: normalizedValue,
    source: "other"
  };
}

function normalizeHardConstraintKind(
  value: string | null | undefined
): HardConstraintKind | undefined {
  if (
    value === "avoid_exercise" ||
    value === "avoid_muscle" ||
    value === "avoid_workout_type"
  ) {
    return value;
  }

  return undefined;
}

function normalizeHardConstraintSource(
  value: string | null | undefined
): HardConstraintSource | undefined {
  if (
    value === "pain" ||
    value === "injury" ||
    value === "preference" ||
    value === "equipment" ||
    value === "other"
  ) {
    return value;
  }

  return undefined;
}

function normalizeMuscleConstraintValue(value: string): MuscleGroup | string {
  return value.trim() as MuscleGroup;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
