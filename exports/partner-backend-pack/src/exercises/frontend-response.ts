import { getExerciseLibrary } from "./library.js";
import type {
  FrontendReadinessCopy,
  FrontendTrainingReadinessResponse,
  TrainingReadinessReport
} from "./types.js";

export function buildFrontendTrainingReadinessResponse(
  userId: string,
  asOf: string,
  trainingReadiness: TrainingReadinessReport
): FrontendTrainingReadinessResponse {
  return {
    userId,
    asOf,
    plannedWorkoutType: trainingReadiness.plannedWorkoutType,
    frontendCopy: buildFrontendReadinessCopy(trainingReadiness),
    sessionDecision: trainingReadiness.sessionDecision,
    sessionPlan: trainingReadiness.sessionPlan,
    substitutionOptions: trainingReadiness.substitutionOptions,
    muscleLoadSummary: trainingReadiness.muscleLoadSummary,
    overworkedMuscles: trainingReadiness.overworkedMuscles,
    recoveringMuscles: trainingReadiness.muscleLoadSummary
      .filter((entry) => entry.recoveryState === "recovering")
      .map((entry) => entry.muscle),
    muscleGroupsToAvoidToday: trainingReadiness.recommendedMusclesToAvoid,
    exercisesToAvoidToday: trainingReadiness.avoidExercises,
    saferAlternatives: trainingReadiness.recommendedExercises,
    deprioritizedExercises: trainingReadiness.deprioritizedExercises
  };
}

export function buildFrontendReadinessCopy(
  trainingReadiness: TrainingReadinessReport
): FrontendReadinessCopy {
  const primaryBlock = trainingReadiness.sessionPlan.blocks.find(
    (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
  );
  const primaryExamples =
    primaryBlock?.exampleExercises?.map((example) => example.exerciseId) ??
    primaryBlock?.exampleExerciseIds ??
    [];
  const primaryNames = primaryExamples
    .map(
      (exerciseId) =>
        getExerciseLibrary().find((exercise) => exercise.exerciseId === exerciseId)?.name
    )
    .filter((name): name is string => Boolean(name));

  return {
    sessionLabel: toSessionLabel(trainingReadiness.sessionPlan.sessionStyle),
    readinessHeadline: toReadinessHeadline(trainingReadiness),
    primaryAction: toPrimaryAction(trainingReadiness, primaryBlock?.blockTier, primaryNames),
    fallbackNote: toFallbackNote(primaryBlock?.blockTier, primaryNames)
  };
}

function toSessionLabel(sessionStyle: "normal" | "modified" | "accessory_only"): string {
  if (sessionStyle === "accessory_only") {
    return "Accessory-only session";
  }

  if (sessionStyle === "modified") {
    return "Modified session";
  }

  return "Normal session";
}

function toReadinessHeadline(trainingReadiness: TrainingReadinessReport): string {
  if (trainingReadiness.sessionPlan.sessionStyle === "accessory_only") {
    return "Keep the day, but keep it very small.";
  }

  if (trainingReadiness.sessionDecision.status === "train_modified") {
    return "Train, but keep the overlap under control.";
  }

  if (trainingReadiness.sessionDecision.status === "train_light") {
    return "Keep today light and easy to recover from.";
  }

  return "Train as planned.";
}

function toPrimaryAction(
  trainingReadiness: TrainingReadinessReport,
  blockTier: "best" | "acceptable" | undefined,
  exerciseNames: string[]
): string {
  if (!exerciseNames.length) {
    return trainingReadiness.sessionPlan.coachNote ?? trainingReadiness.sessionDecision.summary;
  }

  const formattedNames = formatNameList(exerciseNames);

  if (blockTier === "best") {
    return `Start with ${formattedNames}. That is your best fit today.`;
  }

  if (blockTier === "acceptable") {
    return `Use ${formattedNames} as an acceptable fallback today.`;
  }

  return `Start with ${formattedNames}.`;
}

function toFallbackNote(
  blockTier: "best" | "acceptable" | undefined,
  exerciseNames: string[]
): string | undefined {
  if (!exerciseNames.length) {
    return undefined;
  }

  if (blockTier === "best") {
    return "This is the cleanest option the backend sees for today.";
  }

  if (blockTier === "acceptable") {
    return "This works today, but it is more fallback than ideal.";
  }

  return undefined;
}

function formatNameList(names: string[]): string {
  if (names.length === 1) {
    return names[0].toLowerCase();
  }

  return `${names[0].toLowerCase()} or ${names[1].toLowerCase()}`;
}
