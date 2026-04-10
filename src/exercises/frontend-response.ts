import { getExerciseLibrary } from "./library.js";
import { describeConservativeSessionHeadline } from "../kai/coaching-copy.js";
import type {
  DayOrigin,
  FrontendExerciseDecisionRationale,
  FrontendReadinessCopy,
  FrontendReadinessDecisionAudit,
  FrontendReadinessExplanation,
  FrontendWeeklyPlanContext,
  FrontendTrainingReadinessResponse,
  MovementPattern,
  PlannedDayReadinessContext,
  ReadinessDecisionSnapshot,
  ReadinessHistoryEntry,
  TrainingReadinessReport
} from "./types.js";

export function buildFrontendTrainingReadinessResponse(
  userId: string,
  asOf: string,
  trainingReadiness: TrainingReadinessReport,
  weeklyPlanContext?: FrontendWeeklyPlanContext,
  plannedDayContext?: PlannedDayReadinessContext
): FrontendTrainingReadinessResponse {
  const frontendTrainingReadiness = buildFrontendSafeReadinessReport(trainingReadiness);
  const primaryExerciseNames = resolvePrimaryExerciseNames(frontendTrainingReadiness);
  const frontendCopy = buildFrontendReadinessCopy(
    frontendTrainingReadiness,
    weeklyPlanContext,
    primaryExerciseNames
  );
  const frontendExplanation = buildFrontendReadinessExplanation(
    frontendTrainingReadiness,
    primaryExerciseNames,
    weeklyPlanContext
  );
  const auditSafeAlternatives = collectOrderedSafeAlternatives(frontendTrainingReadiness);
  const saferAlternatives = stripRecommendationProvenanceFromList(
    auditSafeAlternatives
  );
  const recoveringMuscles = frontendTrainingReadiness.muscleLoadSummary
    .filter((entry) => entry.recoveryState === "recovering")
    .map((entry) => entry.muscle);
  const decisionAudit = buildFrontendReadinessDecisionAudit(
    frontendTrainingReadiness,
    frontendCopy,
    frontendExplanation,
    auditSafeAlternatives,
    recoveringMuscles,
    plannedDayContext
  );

  return {
    userId,
    asOf,
    plannedWorkoutType: trainingReadiness.plannedWorkoutType,
    frontendCopy,
    frontendExplanation,
    decisionAudit,
    weeklyPlanContext,
    readinessModel: frontendTrainingReadiness.readinessModel,
    sessionDecision: frontendTrainingReadiness.sessionDecision,
    sessionPlan: frontendTrainingReadiness.sessionPlan,
    substitutionOptions: frontendTrainingReadiness.substitutionOptions,
    muscleLoadSummary: frontendTrainingReadiness.muscleLoadSummary,
    overworkedMuscles: frontendTrainingReadiness.overworkedMuscles,
    recoveringMuscles,
    muscleGroupsToAvoidToday: frontendTrainingReadiness.recommendedMusclesToAvoid,
    exercisesToAvoidToday: frontendTrainingReadiness.avoidExercises.map(
      stripRecommendationProvenance
    ),
    saferAlternatives,
    deprioritizedExercises: frontendTrainingReadiness.deprioritizedExercises.map(
      stripRecommendationProvenance
    )
  };
}

export function buildFrontendReadinessCopy(
  trainingReadiness: TrainingReadinessReport,
  weeklyPlanContext?: FrontendWeeklyPlanContext,
  primaryExerciseNames = resolvePrimaryExerciseNames(trainingReadiness)
): FrontendReadinessCopy {
  const primaryBlock = trainingReadiness.sessionPlan.blocks.find(
    (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
  );

  return {
    sessionLabel: toSessionLabel(trainingReadiness.sessionPlan.sessionStyle),
    readinessHeadline: toReadinessHeadline(trainingReadiness, weeklyPlanContext),
    primaryAction: toPrimaryAction(
      trainingReadiness,
      primaryBlock?.blockTier,
      primaryExerciseNames
    ),
    fallbackNote: toFallbackNote(
      trainingReadiness,
      primaryBlock?.blockTier,
      primaryExerciseNames
    )
  };
}

export function buildFrontendReadinessExplanation(
  trainingReadiness: TrainingReadinessReport,
  primaryExerciseNames = resolvePrimaryExerciseNames(trainingReadiness),
  weeklyPlanContext?: FrontendWeeklyPlanContext
): FrontendReadinessExplanation {
  const weekContext = toWeekContext(weeklyPlanContext);

  return {
    planWhy: trainingReadiness.sessionPlan.objective,
    whatChangedToday: toWhatChangedToday(trainingReadiness),
    ...(weekContext ? { weekContext } : {}),
    whyTodayLooksThisWay: collectWhyTodayLooksThisWay(trainingReadiness),
    focusAreas: collectFocusAreas(trainingReadiness),
    cautionAreas: collectCautionAreas(trainingReadiness),
    startingExercises: primaryExerciseNames
  };
}

export function buildReadinessHistoryEntry(
  response: FrontendTrainingReadinessResponse,
  recordedAt = new Date().toISOString()
): ReadinessHistoryEntry {
  const primaryExerciseIds = resolvePrimaryExerciseIds(response.sessionPlan);

  return {
    userId: response.userId,
    asOf: response.asOf,
    recordedAt,
    plannedWorkoutType: response.plannedWorkoutType,
    sessionStyle: response.sessionPlan.sessionStyle,
    sessionDecisionStatus: response.sessionDecision.status,
    readinessScore: response.readinessModel.score,
    readinessBand: response.readinessModel.band,
    dataConfidence: response.readinessModel.dataConfidence,
    frontendCopy: response.frontendCopy,
    frontendExplanation: response.frontendExplanation,
    focusMuscles: response.sessionPlan.focusMuscles,
    limitMuscles: response.sessionPlan.limitMuscles,
    overworkedMuscles: response.overworkedMuscles,
    recoveringMuscles: response.recoveringMuscles,
    muscleGroupsToAvoidToday: response.muscleGroupsToAvoidToday,
    primaryExerciseIds,
    decisionSnapshot: buildReadinessDecisionSnapshot(response, primaryExerciseIds)
  };
}

function toSessionLabel(
  sessionStyle: "normal" | "conservative" | "modified" | "accessory_only"
): string {
  if (sessionStyle === "accessory_only") {
    return "Accessory-only session";
  }

  if (sessionStyle === "conservative") {
    return "Conservative session";
  }

  if (sessionStyle === "modified") {
    return "Modified session";
  }

  return "Normal session";
}

function toReadinessHeadline(
  trainingReadiness: TrainingReadinessReport,
  weeklyPlanContext?: FrontendWeeklyPlanContext
): string {
  const arcContext = toHeadlineArcContext(weeklyPlanContext);
  const workoutTypeContext =
    weeklyPlanContext?.fragileWorkoutTypeLabel &&
    trainingReadiness.plannedWorkoutType &&
    weeklyPlanContext.fragileWorkoutTypeLabel.toLowerCase().replaceAll(" ", "_") ===
      trainingReadiness.plannedWorkoutType
      ? ` ${weeklyPlanContext.fragileWorkoutTypeLabel} work has been the least stable part of the week.`
      : "";
  const suggestedDriftContext =
    !weeklyPlanContext?.todayPlanned &&
    weeklyPlanContext?.suggestedWorkoutDriftLabel &&
    weeklyPlanContext?.suggestedWorkoutTypeLabel
      ? ` Recent ${weeklyPlanContext.suggestedWorkoutTypeLabel.toLowerCase()} suggestions have often turned into ${weeklyPlanContext.suggestedWorkoutDriftLabel.toLowerCase()} work instead.`
      : "";

  if (trainingReadiness.sessionPlan.sessionStyle === "accessory_only") {
    return `Keep the day, but keep it very small.${arcContext}${workoutTypeContext}${suggestedDriftContext}`;
  }

  if (trainingReadiness.sessionPlan.sessionStyle === "conservative") {
    return `${describeConservativeSessionHeadline()}${arcContext}${workoutTypeContext}${suggestedDriftContext}`;
  }

  if (trainingReadiness.sessionDecision.status === "train_modified") {
    return `Train, but keep the overlap under control.${arcContext}${workoutTypeContext}${suggestedDriftContext}`;
  }

  if (trainingReadiness.sessionDecision.status === "train_light") {
    return `Keep today light and easy to recover from.${arcContext}${workoutTypeContext}${suggestedDriftContext}`;
  }

  return `Train as planned.${arcContext}${suggestedDriftContext}`;
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
    if (isLowConfidenceReadiness(trainingReadiness)) {
      return `Start with ${formattedNames}. This is a sensible repeatable place to begin today.`;
    }

    return `Start with ${formattedNames}. That is your best fit today.`;
  }

  if (blockTier === "acceptable") {
    return `Use ${formattedNames} as an acceptable fallback today.`;
  }

  if (isLowConfidenceReadiness(trainingReadiness)) {
    return `Start with ${formattedNames}. This is a sensible repeatable place to begin today.`;
  }

  return `Start with ${formattedNames}.`;
}

function toFallbackNote(
  trainingReadiness: TrainingReadinessReport,
  blockTier: "best" | "acceptable" | undefined,
  exerciseNames: string[]
): string | undefined {
  if (!exerciseNames.length) {
    return undefined;
  }

  if (blockTier === "best") {
    if (isLowConfidenceReadiness(trainingReadiness)) {
      return "This is a sensible default while the backend is still learning your pattern.";
    }

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

function buildFrontendSafeReadinessReport(
  trainingReadiness: TrainingReadinessReport
): TrainingReadinessReport {
  const blockedExerciseIds = collectFrontendBlockedExerciseIds(trainingReadiness);
  const sessionPlan = filterSessionPlanForFrontend(
    trainingReadiness.sessionPlan,
    blockedExerciseIds
  );

  return {
    ...trainingReadiness,
    sessionPlan,
    substitutionOptions: filterSubstitutionOptionsForFrontend(
      trainingReadiness.substitutionOptions,
      sessionPlan,
      blockedExerciseIds
    )
  };
}

function collectFrontendBlockedExerciseIds(
  trainingReadiness: TrainingReadinessReport
): Set<string> {
  return new Set(
    trainingReadiness.avoidExercises
      .filter((entry) =>
        entry.reasons.some(
          (reason) =>
            reason.startsWith("Equipment mismatch:") ||
            reason.startsWith("Hard constraint:")
        )
      )
      .map((entry) => entry.exerciseId)
  );
}

function filterSessionPlanForFrontend(
  sessionPlan: TrainingReadinessReport["sessionPlan"],
  blockedExerciseIds: Set<string>
): TrainingReadinessReport["sessionPlan"] {
  if (!blockedExerciseIds.size) {
    return sessionPlan;
  }

  return {
    ...sessionPlan,
    blocks: sessionPlan.blocks.map((block) => {
      const exampleExercises = block.exampleExercises?.filter(
        (example) => !blockedExerciseIds.has(example.exerciseId)
      );
      const exampleExerciseIds = (
        exampleExercises?.map((example) => example.exerciseId) ?? block.exampleExerciseIds
      ).filter((exerciseId) => !blockedExerciseIds.has(exerciseId));

      return {
        ...block,
        exampleExerciseIds,
        ...(exampleExercises ? { exampleExercises } : {})
      };
    })
  };
}

function filterSubstitutionOptionsForFrontend(
  substitutionOptions: TrainingReadinessReport["substitutionOptions"],
  sessionPlan: TrainingReadinessReport["sessionPlan"],
  blockedExerciseIds: Set<string>
): TrainingReadinessReport["substitutionOptions"] {
  if (!blockedExerciseIds.size) {
    return substitutionOptions;
  }

  const visiblePlanExerciseIds = new Set(
    sessionPlan.blocks.flatMap((block) => block.exampleExerciseIds)
  );

  return substitutionOptions
    .filter((option) => visiblePlanExerciseIds.has(option.exerciseId))
    .map((option) => {
      const swapForExerciseIds = option.swapForExerciseIds.filter(
        (exerciseId) => !blockedExerciseIds.has(exerciseId)
      );

      return {
        ...option,
        swapForExerciseIds
      };
    })
    .filter((option) => option.swapForExerciseIds.length > 0);
}

function resolvePrimaryExerciseNames(trainingReadiness: TrainingReadinessReport): string[] {
  const primaryExamples = resolvePrimaryExerciseIds(trainingReadiness.sessionPlan);

  return primaryExamples
    .map((exerciseId) => getExerciseName(exerciseId))
    .filter((name): name is string => Boolean(name));
}

function resolvePrimaryExerciseIds(
  sessionPlan: TrainingReadinessReport["sessionPlan"]
): string[] {
  const primaryBlock = sessionPlan.blocks.find(
    (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
  );

  return (
    primaryBlock?.exampleExercises?.map((example) => example.exerciseId) ??
    primaryBlock?.exampleExerciseIds ??
    []
  );
}

function collectWhyTodayLooksThisWay(trainingReadiness: TrainingReadinessReport): string[] {
  const reasons = dedupeStrings([
    ...trainingReadiness.sessionDecision.notes,
    ...trainingReadiness.readinessModel.reasons
  ]).slice(0, 4);

  if (reasons.length) {
    return reasons;
  }

  return [trainingReadiness.sessionDecision.summary];
}

function toHeadlineArcContext(
  weeklyPlanContext?: FrontendWeeklyPlanContext
): string {
  switch (weeklyPlanContext?.weeklyArcPattern) {
    case "rebuilding":
      return " You are climbing back up, so keep today repeatable.";
    case "building":
      return " The last few weeks are stacking well, so protect that momentum.";
    case "protecting":
      return " Recent weeks have needed more protection, so keep the session manageable.";
    case "oscillating":
      return " The last few weeks have been up and down, so keep today steady.";
    case "steady":
      return " You are building a steadier base, so keep the rhythm clean.";
    case "starting":
      return " A longer pattern is just starting to form, so keep the day simple.";
    default:
      return "";
  }
}

function toWeekContext(
  weeklyPlanContext?: FrontendWeeklyPlanContext
): string | undefined {
  const baseContext = (() => {
    switch (weeklyPlanContext?.weeklyArcPattern) {
      case "rebuilding":
        return "This day sits inside a rebuild stretch, so the goal is to keep progress feeling repeatable.";
      case "building":
        return "This day sits inside a stronger run of weeks, so the goal is to keep the momentum clean.";
      case "protecting":
        return "This day sits inside a more protective stretch, so the goal is to finish it without digging a bigger hole.";
      case "oscillating":
        return "This day sits inside an up-and-down stretch, so the goal is to make the pattern feel steadier.";
      case "steady":
        return "This day sits inside a steadier stretch, so the goal is to keep the routine consistent.";
      case "starting":
        return "This day is part of an early pattern, so the goal is to make it easy to repeat.";
      default:
        return undefined;
    }
  })();

  if (weeklyPlanContext?.suggestedWorkoutTemplateNote) {
    return [baseContext, weeklyPlanContext.suggestedWorkoutTemplateNote]
      .filter(Boolean)
      .join(" ");
  }

  return baseContext;
}

function trimFrontendSafeAlternatives(
  trainingReadiness: TrainingReadinessReport
): TrainingReadinessReport["recommendedExercises"] {
  return stripRecommendationProvenanceFromList(
    collectOrderedSafeAlternatives(trainingReadiness)
  );
}

function collectOrderedSafeAlternatives(
  trainingReadiness: TrainingReadinessReport
): TrainingReadinessReport["recommendedExercises"] {
  const recommendedById = new Map(
    trainingReadiness.recommendedExercises.map((entry) => [entry.exerciseId, entry])
  );
  const orderedExerciseIds: string[] = [];

  for (const block of trainingReadiness.sessionPlan.blocks) {
    const blockIds =
      block.exampleExercises?.map((example) => example.exerciseId) ??
      block.exampleExerciseIds ??
      [];

    for (const exerciseId of blockIds) {
      if (recommendedById.has(exerciseId) && !orderedExerciseIds.includes(exerciseId)) {
        orderedExerciseIds.push(exerciseId);
      }
    }
  }

  for (const entry of trainingReadiness.recommendedExercises) {
    if (!orderedExerciseIds.includes(entry.exerciseId)) {
      orderedExerciseIds.push(entry.exerciseId);
    }
  }

  return orderedExerciseIds
    .map((exerciseId) => recommendedById.get(exerciseId))
    .filter(
      (
        entry
      ): entry is TrainingReadinessReport["recommendedExercises"][number] => Boolean(entry)
    )
    .slice(0, 8);
}

function stripRecommendationProvenanceFromList(
  entries: TrainingReadinessReport["recommendedExercises"]
): TrainingReadinessReport["recommendedExercises"] {
  return entries.map(stripRecommendationProvenance);
}

function stripRecommendationProvenance(
  entry: TrainingReadinessReport["recommendedExercises"][number]
): TrainingReadinessReport["recommendedExercises"][number] {
  return {
    exerciseId: entry.exerciseId,
    name: entry.name,
    bucket: entry.bucket,
    tolerance: entry.tolerance,
    fallbackTier: entry.fallbackTier,
    score: entry.score,
    reasons: entry.reasons
  };
}

function buildFrontendReadinessDecisionAudit(
  trainingReadiness: TrainingReadinessReport,
  frontendCopy: FrontendReadinessCopy,
  frontendExplanation: FrontendReadinessExplanation,
  saferAlternatives: TrainingReadinessReport["recommendedExercises"],
  recoveringMuscles: FrontendTrainingReadinessResponse["recoveringMuscles"],
  plannedDayContext?: PlannedDayReadinessContext
): FrontendReadinessDecisionAudit {
  const dayOrigin = resolveDayOrigin(plannedDayContext);
  const recoveredMuscles = trainingReadiness.muscleLoadSummary
    .filter((entry) => entry.recoveryState === "recovered")
    .map((entry) => entry.muscle)
    .slice(0, 8);
  const avoidMovementPatterns = dedupeMovementPatterns([
    ...trainingReadiness.sessionPlan.limitPatterns,
    ...trainingReadiness.overworkedPatterns
  ]).slice(0, 4);
  const deprioritizedExercises = toExerciseDecisionRationales(
    orderAuditDeprioritizedExercises(trainingReadiness.deprioritizedExercises),
    4
  );
  const selectedSubstitutes = toExerciseDecisionRationales(saferAlternatives, 4);

  return {
    dayOrigin,
    ...(plannedDayContext?.originReasonLabel
      ? { originReasonLabel: plannedDayContext.originReasonLabel }
      : {}),
    ...(plannedDayContext?.originBias
      ? { originBias: plannedDayContext.originBias }
      : plannedDayContext?.suggestedDayBias
        ? { originBias: plannedDayContext.suggestedDayBias }
        : {}),
    recommendedTrainingDirection: trainingReadiness.sessionPlan.objective,
    recoveredMuscles,
    recoveringMuscles,
    avoidMuscles: trainingReadiness.recommendedMusclesToAvoid.slice(0, 6),
    avoidMovementPatterns,
    deprioritizedExercises,
    selectedSubstitutes,
    userExplanation: buildUserFacingDecisionExplanation(
      trainingReadiness,
      frontendCopy,
      recoveringMuscles,
      trainingReadiness.recommendedMusclesToAvoid,
      avoidMovementPatterns,
      selectedSubstitutes
    ),
    kaiExplanation: buildKaiFriendlyDecisionExplanation(
      trainingReadiness,
      frontendExplanation,
      recoveringMuscles,
      trainingReadiness.recommendedMusclesToAvoid,
      avoidMovementPatterns,
      selectedSubstitutes
    ),
    debugExplanation: buildDebugDecisionExplanation(
      trainingReadiness,
      dayOrigin,
      plannedDayContext,
      deprioritizedExercises,
      selectedSubstitutes,
      avoidMovementPatterns
    )
  };
}

function collectFocusAreas(trainingReadiness: TrainingReadinessReport): string[] {
  const blockFocus = dedupeStrings(
    trainingReadiness.sessionPlan.blocks
      .filter((block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0)
      .map((block) => block.focus)
  ).slice(0, 3);

  if (blockFocus.length) {
    return blockFocus;
  }

  return trainingReadiness.sessionPlan.focusMuscles.slice(0, 3).map(formatMuscleLabel);
}

function collectCautionAreas(trainingReadiness: TrainingReadinessReport): string[] {
  const cautions: string[] = [];

  if (trainingReadiness.sessionPlan.limitMuscles.length) {
    cautions.push(
      `Limit overlap on ${formatLabelList(
        trainingReadiness.sessionPlan.limitMuscles.slice(0, 3).map(formatMuscleLabel)
      )}.`
    );
  } else if (trainingReadiness.overworkedMuscles.length) {
    cautions.push(
      `Watch ${formatLabelList(
        trainingReadiness.overworkedMuscles.slice(0, 3).map(formatMuscleLabel)
      )} closely today.`
    );
  }

  if (trainingReadiness.sessionPlan.limitPatterns.length) {
    cautions.push(
      `Keep ${formatLabelList(
        trainingReadiness.sessionPlan.limitPatterns.slice(0, 2).map(formatMovementPatternLabel)
      )} loading lighter today.`
    );
  }

  if (trainingReadiness.avoidExercises[0]) {
    const topAvoidReason = trainingReadiness.avoidExercises[0].reasons[0];

    cautions.push(
      topAvoidReason?.startsWith("Equipment mismatch:")
        ? topAvoidReason
        : `Avoid ${trainingReadiness.avoidExercises[0].name} today.`
    );
  }

  return dedupeStrings(cautions).slice(0, 3);
}

function toWhatChangedToday(trainingReadiness: TrainingReadinessReport): string | undefined {
  if (trainingReadiness.sessionPlan.sessionStyle === "accessory_only") {
    return "The original day stayed in place, but it was reduced to small fallback work.";
  }

  if (trainingReadiness.sessionPlan.sessionStyle === "conservative") {
    return "The session stayed on the calendar, but the backend cooled the volume and intensity.";
  }

  if (trainingReadiness.sessionDecision.status === "train_modified") {
    return "The day stayed in place, but the backend shifted the work away from the main recovery bottlenecks.";
  }

  if (trainingReadiness.sessionDecision.status === "train_light") {
    return "The session was kept intentionally light so recovery can catch back up.";
  }

  return undefined;
}

function getExerciseName(exerciseId: string): string | undefined {
  return getExerciseLibrary().find((exercise) => exercise.exerciseId === exerciseId)?.name;
}

function toExerciseDecisionRationales(
  exercises: TrainingReadinessReport["recommendedExercises"] | TrainingReadinessReport["deprioritizedExercises"],
  limit: number
): FrontendExerciseDecisionRationale[] {
  return exercises.slice(0, limit).map((entry) => ({
    exerciseId: entry.exerciseId,
    name: entry.name,
    why: entry.reasons.slice(0, 3),
    ...(resolveSelectionTier(entry)
      ? { selectionTier: resolveSelectionTier(entry) }
      : {}),
    ...(entry.provenance ? { provenance: entry.provenance } : {})
  }));
}

function resolveSelectionTier(
  entry: TrainingReadinessReport["recommendedExercises"][number]
): FrontendExerciseDecisionRationale["selectionTier"] | undefined {
  if (entry.fallbackTier === "acceptable") {
    return "acceptable_fallback";
  }

  if (entry.bucket === "recommended") {
    return "best_fit";
  }

  return undefined;
}

function orderAuditDeprioritizedExercises(
  exercises: TrainingReadinessReport["deprioritizedExercises"]
): TrainingReadinessReport["deprioritizedExercises"] {
  return [...exercises].sort((left, right) => {
    const leftPriority = getAuditDeprioritizedPriority(left);
    const rightPriority = getAuditDeprioritizedPriority(right);

    return (
      leftPriority.onPlanRank - rightPriority.onPlanRank ||
      leftPriority.recoveryRank - rightPriority.recoveryRank ||
      leftPriority.toleranceRank - rightPriority.toleranceRank ||
      left.score - right.score
    );
  });
}

function getAuditDeprioritizedPriority(
  entry: TrainingReadinessReport["deprioritizedExercises"][number]
): {
  onPlanRank: number;
  recoveryRank: number;
  toleranceRank: number;
} {
  const onPlan =
    entry.reasons.some((reason) => reason.startsWith("Fits today's")) ||
    entry.fallbackTier !== undefined ||
    entry.provenance?.selectionSource !== "generic_fallback";
  const recoveryLimited =
    entry.provenance?.recoveryPenaltyApplied ||
    entry.reasons.some(
      (reason) =>
        reason.includes("still recovering") || reason.includes("still overworked")
    );
  const toleranceRank =
    entry.tolerance === "red" ? 0 : entry.tolerance === "yellow" ? 1 : 2;

  return {
    onPlanRank: onPlan ? 0 : 1,
    recoveryRank: recoveryLimited ? 0 : 1,
    toleranceRank
  };
}

function buildReadinessDecisionSnapshot(
  response: FrontendTrainingReadinessResponse,
  primaryExerciseIds: string[]
): ReadinessDecisionSnapshot {
  const selectedSubstituteIds = response.decisionAudit.selectedSubstitutes
    .map((entry) => entry.exerciseId)
    .filter((exerciseId) => !primaryExerciseIds.includes(exerciseId))
    .slice(0, 4);

  return {
    dayOrigin: response.decisionAudit.dayOrigin,
    decisionSummary:
      response.decisionAudit.debugExplanation?.decisionSummary ??
      `${response.sessionDecision.status} | ${response.sessionPlan.sessionStyle}`,
    recommendedTrainingDirection: response.decisionAudit.recommendedTrainingDirection,
    topRecoveryLimiters: response.decisionAudit.debugExplanation?.topRecoveryLimiters.slice(0, 3) ?? [],
    musclesToAvoid: response.decisionAudit.avoidMuscles.slice(0, 6),
    movementPatternsToAvoid: response.decisionAudit.avoidMovementPatterns.slice(0, 4),
    primaryExerciseIds,
    ...(selectedSubstituteIds.length ? { selectedSubstituteIds } : {})
  };
}

function buildUserFacingDecisionExplanation(
  trainingReadiness: TrainingReadinessReport,
  frontendCopy: FrontendReadinessCopy,
  recoveringMuscles: string[],
  avoidMuscles: string[],
  avoidMovementPatterns: MovementPattern[],
  selectedSubstitutes: FrontendExerciseDecisionRationale[]
): string {
  const whySentence = frontendCopy.primaryAction.endsWith(".")
    ? frontendCopy.primaryAction
    : `${frontendCopy.primaryAction}.`;
  const cautionLabels = [
    ...avoidMuscles.slice(0, 3).map(formatMuscleLabel),
    ...avoidMovementPatterns.slice(0, 2).map(formatMovementPatternLabel)
  ];
  const cautionSentence = cautionLabels.length
    ? `Keep overlap away from ${formatLabelList(cautionLabels)} today.`
    : recoveringMuscles.length
      ? `Keep overlap away from ${formatLabelList(
          recoveringMuscles.slice(0, 3).map(formatMuscleLabel)
        )} today.`
      : undefined;
  const fallbackSentence = areSelectedExercisesFallbackOnly(selectedSubstitutes)
    ? "Treat today's picks as acceptable fallback options, not the cleanest full version of the day."
    : undefined;
  const constraintSentence = buildConstraintExplanation(trainingReadiness, selectedSubstitutes);
  const confidenceSentence = isLowConfidenceReadiness(trainingReadiness)
    ? "The backend is leaning on sensible repeatable defaults while it builds more comparable history for this kind of day."
    : undefined;

  return [
    frontendCopy.readinessHeadline,
    whySentence,
    cautionSentence,
    fallbackSentence,
    constraintSentence,
    confidenceSentence
  ]
    .filter(Boolean)
    .join(" ");
}

function buildKaiFriendlyDecisionExplanation(
  trainingReadiness: TrainingReadinessReport,
  frontendExplanation: FrontendReadinessExplanation,
  recoveringMuscles: string[],
  avoidMuscles: string[],
  avoidMovementPatterns: MovementPattern[],
  selectedSubstitutes: FrontendExerciseDecisionRationale[]
): string {
  const focus = frontendExplanation.focusAreas[0]?.toLowerCase();
  const topLimiter =
    avoidMuscles[0] ?? recoveringMuscles[0] ?? trainingReadiness.overworkedMuscles[0];
  const patternLimiter = avoidMovementPatterns[0];
  const fit =
    areSelectedExercisesFallbackOnly(selectedSubstitutes)
      ? "fit acceptable_fallback"
      : hasBestFitSelection(selectedSubstitutes)
        ? "fit best_available"
        : undefined;
  const constraint = buildKaiConstraintLabel(trainingReadiness, selectedSubstitutes);
  const confidence = isLowConfidenceReadiness(trainingReadiness)
    ? "confidence low_repeatable_defaults"
    : undefined;
  const limiterParts = [
    topLimiter ? `limiter ${formatMuscleLabel(topLimiter)}` : undefined,
    patternLimiter ? `pattern ${formatMovementPatternLabel(patternLimiter)}` : undefined
  ].filter(Boolean);

  return [
    `${trainingReadiness.sessionDecision.sessionMode}: ${trainingReadiness.sessionPlan.objective}`,
    focus ? `focus ${focus}` : undefined,
    limiterParts.length ? limiterParts.join(", ") : undefined,
    fit,
    constraint,
    confidence
  ]
    .filter(Boolean)
    .join(" | ");
}

function isLowConfidenceReadiness(trainingReadiness: TrainingReadinessReport): boolean {
  return trainingReadiness.readinessModel.dataConfidence === "low";
}

function areSelectedExercisesFallbackOnly(
  selectedSubstitutes: FrontendExerciseDecisionRationale[]
): boolean {
  return (
    selectedSubstitutes.length > 0 &&
    selectedSubstitutes.every(
      (entry) =>
        entry.selectionTier === "acceptable_fallback" ||
        entry.selectionTier === undefined
    ) &&
    selectedSubstitutes.some(
      (entry) => entry.selectionTier === "acceptable_fallback"
    )
  );
}

function hasBestFitSelection(
  selectedSubstitutes: FrontendExerciseDecisionRationale[]
): boolean {
  return selectedSubstitutes.some((entry) => entry.selectionTier === "best_fit");
}

function buildConstraintExplanation(
  trainingReadiness: TrainingReadinessReport,
  selectedSubstitutes: FrontendExerciseDecisionRationale[]
): string | undefined {
  if (
    trainingReadiness.avoidExercises.some((entry) =>
      entry.reasons.some((reason) => reason.startsWith("Equipment mismatch:"))
    )
  ) {
    return "Some usual options were filtered out by your equipment limits today.";
  }

  if (
    trainingReadiness.avoidExercises.some((entry) =>
      entry.reasons.some((reason) => reason.startsWith("Hard constraint:"))
    ) ||
    selectedSubstitutes.some((entry) => entry.provenance?.painConstraintApplied)
  ) {
    return "Some usual options were filtered out by your current constraints today.";
  }

  return undefined;
}

function buildKaiConstraintLabel(
  trainingReadiness: TrainingReadinessReport,
  selectedSubstitutes: FrontendExerciseDecisionRationale[]
): string | undefined {
  if (
    trainingReadiness.avoidExercises.some((entry) =>
      entry.reasons.some((reason) => reason.startsWith("Equipment mismatch:"))
    )
  ) {
    return "constraint equipment";
  }

  if (
    trainingReadiness.avoidExercises.some((entry) =>
      entry.reasons.some((reason) => reason.startsWith("Hard constraint:"))
    ) ||
    selectedSubstitutes.some((entry) => entry.provenance?.painConstraintApplied)
  ) {
    return "constraint hard_limit";
  }

  return undefined;
}

function buildDebugDecisionExplanation(
  trainingReadiness: TrainingReadinessReport,
  dayOrigin: DayOrigin,
  plannedDayContext: PlannedDayReadinessContext | undefined,
  deprioritizedExercises: FrontendExerciseDecisionRationale[],
  selectedSubstitutes: FrontendExerciseDecisionRationale[],
  avoidMovementPatterns: MovementPattern[]
): FrontendReadinessDecisionAudit["debugExplanation"] {
  const topRecoveryLimiters = trainingReadiness.muscleLoadSummary
    .filter((entry) => entry.recoveryState !== "recovered")
    .slice(0, 3)
    .map((entry) => `${formatMuscleLabel(entry.muscle)} (${entry.recoveryState})`);
  const recommendationNotes = dedupeStrings([
    ...trainingReadiness.sessionDecision.notes,
    ...trainingReadiness.readinessModel.reasons,
    ...selectedSubstitutes.flatMap((entry) => entry.why.slice(0, 1)),
    ...deprioritizedExercises.flatMap((entry) => entry.why.slice(0, 1))
  ]).slice(0, 6);

  return {
    decisionSummary: `${trainingReadiness.sessionDecision.status} | ${trainingReadiness.sessionPlan.sessionStyle} | ${trainingReadiness.readinessModel.band} ${trainingReadiness.readinessModel.score.toFixed(0)}`,
    dayProvenance: buildDayProvenanceLabel(dayOrigin, plannedDayContext),
    ...(isLowConfidenceReadiness(trainingReadiness)
      ? {
          confidenceContext:
            "Low confidence: using sensible repeatable defaults while comparable history is still thin."
        }
      : {}),
    topRecoveryLimiters,
    topAvoidedPatterns: avoidMovementPatterns.map(formatMovementPatternLabel),
    recommendationNotes
  };
}

function resolveDayOrigin(
  plannedDayContext: PlannedDayReadinessContext | undefined
): DayOrigin {
  if (plannedDayContext?.dayOrigin) {
    return plannedDayContext.dayOrigin;
  }

  if (plannedDayContext?.isSuggestedDay) {
    return "suggested";
  }

  if (plannedDayContext?.isPlannedDay) {
    return "planned";
  }

  return "unplanned";
}

function buildDayProvenanceLabel(
  dayOrigin: DayOrigin,
  plannedDayContext: PlannedDayReadinessContext | undefined
): string {
  const originReasonLabel = plannedDayContext?.originReasonLabel;
  const originBias = plannedDayContext?.originBias ?? plannedDayContext?.suggestedDayBias;
  const biasLabel = originBias ? originBias.replaceAll("_", " ") : undefined;

  if (dayOrigin === "planned") {
    return "planned day";
  }

  if (dayOrigin === "suggested") {
    return [
      "suggested day",
      originReasonLabel ? `reason ${originReasonLabel.replaceAll("_", " ")}` : undefined,
      biasLabel ? `bias ${biasLabel}` : undefined
    ]
      .filter(Boolean)
      .join(" | ");
  }

  return "unplanned day";
}

function formatMuscleLabel(muscle: string): string {
  return muscle.replaceAll("_", " ");
}

function formatMovementPatternLabel(movementPattern: MovementPattern): string {
  return movementPattern.replaceAll("_", " ");
}

function formatLabelList(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const normalized = item.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function dedupeMovementPatterns(items: MovementPattern[]): MovementPattern[] {
  const seen = new Set<MovementPattern>();

  return items.filter((item) => {
    if (seen.has(item)) {
      return false;
    }

    seen.add(item);
    return true;
  });
}
