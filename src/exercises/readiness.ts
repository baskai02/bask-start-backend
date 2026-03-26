import { getExerciseById, getExerciseLibrary } from "./library.js";
import type {
  ExerciseTolerance,
  ExerciseLibraryEntry,
  ExerciseRecommendation,
  ExerciseSubstitutionOption,
  FallbackTier,
  MovementPattern,
  MovementPatternSummaryEntry,
  MuscleGroup,
  MuscleLoadSummaryEntry,
  RecommendationBucket,
  RecoveryState,
  SessionDecision,
  SessionPlan,
  TrainingEffect,
  TrainingReadinessReport,
  WorkoutExerciseEntry
} from "./types.js";
import type { WorkoutRecord } from "../kai/types.js";

const DAY_IN_HOURS = 24;
const NO_HISTORY_HOURS = 9999;

const TRAINING_EFFECT_GUARDRAILS: Partial<
  Record<
    TrainingEffect,
    {
      blockedBy: MuscleGroup[];
      cautionBy?: MuscleGroup[];
    }
  >
> = {
  horizontal_press: {
    blockedBy: ["chest", "front_delts", "triceps"]
  },
  chest_isolation: {
    blockedBy: ["chest"],
    cautionBy: ["front_delts"]
  },
  vertical_press: {
    blockedBy: ["front_delts", "triceps"],
    cautionBy: ["side_delts"]
  },
  front_delt_press: {
    blockedBy: ["front_delts"],
    cautionBy: ["triceps", "chest"]
  },
  triceps_isolation: {
    blockedBy: ["triceps"],
    cautionBy: ["front_delts"]
  },
  cable_pressdown: {
    blockedBy: ["triceps"],
    cautionBy: ["front_delts"]
  },
  overhead_triceps: {
    blockedBy: ["triceps", "front_delts"]
  },
  lateral_delt_isolation: {
    blockedBy: ["side_delts"],
    cautionBy: ["front_delts"]
  },
  side_delt_bias: {
    blockedBy: ["side_delts"],
    cautionBy: ["front_delts"]
  },
  rear_delt_isolation: {
    blockedBy: ["rear_delts"],
    cautionBy: ["rhomboids", "mid_traps"]
  },
  horizontal_row: {
    blockedBy: ["lats", "rhomboids", "mid_traps"],
    cautionBy: ["rear_delts", "biceps"]
  },
  vertical_pull: {
    blockedBy: ["lats", "biceps"],
    cautionBy: ["teres_major", "rear_delts"]
  },
  biceps_isolation: {
    blockedBy: ["biceps"],
    cautionBy: ["brachialis", "brachioradialis"]
  },
  neutral_grip_curl: {
    blockedBy: ["brachialis", "brachioradialis"],
    cautionBy: ["biceps"]
  },
  supinated_curl: {
    blockedBy: ["biceps"],
    cautionBy: ["brachialis"]
  },
  trap_isolation: {
    blockedBy: ["upper_traps"],
    cautionBy: ["mid_traps", "rhomboids"]
  },
  upper_trap_isolation: {
    blockedBy: ["upper_traps"],
    cautionBy: ["mid_traps", "rhomboids"]
  }
};

export function buildTrainingReadinessReport(
  userId: string,
  workouts: WorkoutRecord[],
  asOf: string,
  plannedWorkoutType?: string
): TrainingReadinessReport {
  const completedSessions = workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        workout.date <= asOf &&
        Array.isArray(workout.sessionExercises) &&
        workout.sessionExercises.length > 0
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const muscleLoadMap = new Map<MuscleGroup, MuscleAccumulator>();
  const patternLoadMap = new Map<MovementPattern, PatternAccumulator>();

  for (const session of completedSessions) {
    const hoursSinceSession = diffInHours(asOf, session.date);

    for (const sessionExercise of session.sessionExercises ?? []) {
      const exercise = getExerciseById(sessionExercise.exerciseId);

      if (!exercise) {
        continue;
      }

      const baseLoad = calculateExerciseLoad(sessionExercise, exercise);
      const unresolvedFactor = calculateUnresolvedFactor(
        hoursSinceSession,
        exercise.recoveryTimeHours
      );
      const unresolvedLoad = baseLoad * unresolvedFactor;

      applyMuscleContributions(
        muscleLoadMap,
        exercise.primaryMuscles,
        baseLoad * exercise.contributionWeights.primary,
        unresolvedLoad * exercise.contributionWeights.primary,
        hoursSinceSession,
        exercise.recoveryTimeHours
      );
      applyMuscleContributions(
        muscleLoadMap,
        exercise.secondaryMuscles,
        baseLoad * exercise.contributionWeights.secondary,
        unresolvedLoad * exercise.contributionWeights.secondary,
        hoursSinceSession,
        exercise.recoveryTimeHours
      );
      applyMuscleContributions(
        muscleLoadMap,
        exercise.stabilizers,
        baseLoad * exercise.contributionWeights.stabilizer,
        unresolvedLoad * exercise.contributionWeights.stabilizer,
        hoursSinceSession,
        exercise.recoveryTimeHours
      );

      applyPatternContribution(
        patternLoadMap,
        exercise.movementPattern,
        baseLoad,
        unresolvedLoad
      );
    }
  }

  const muscleLoadSummary = [...muscleLoadMap.entries()]
    .map(([muscle, accumulator]) => toMuscleSummary(muscle, accumulator))
    .sort((a, b) => b.riskScore - a.riskScore);
  const movementPatternSummary = [...patternLoadMap.entries()]
    .map(([movementPattern, accumulator]) =>
      toPatternSummary(movementPattern, accumulator)
    )
    .sort((a, b) => b.unresolvedLoad - a.unresolvedLoad);
  const overworkedMuscles = muscleLoadSummary
    .filter((entry) => entry.recoveryState === "overworked")
    .map((entry) => entry.muscle);
  const overworkedPatterns = movementPatternSummary
    .filter((entry) => entry.recoveryState === "overworked")
    .map((entry) => entry.movementPattern);
  const recommendations = buildExerciseRecommendations(
    muscleLoadSummary,
    movementPatternSummary,
    plannedWorkoutType
  );
  const sessionDecision = buildSessionDecision({
    plannedWorkoutType,
    overworkedMuscles,
    overworkedPatterns,
    recommendedExercises: recommendations.filter(
      (entry) => entry.bucket === "recommended"
    ),
    deprioritizedExercises: recommendations.filter(
      (entry) => entry.bucket === "deprioritize"
    )
  });
  const sessionPlan = buildSessionPlan({
    plannedWorkoutType,
    sessionDecision,
    overworkedMuscles,
    overworkedPatterns,
    recommendedExercises: recommendations.filter(
      (entry) => entry.bucket === "recommended"
    ),
    deprioritizedExercises: recommendations.filter(
      (entry) => entry.bucket === "deprioritize"
    )
  });
  const substitutionOptions = buildSubstitutionOptions({
    plannedWorkoutType,
    recommendedExercises: recommendations.filter(
      (entry) => entry.bucket === "recommended"
    ),
    candidateExercises: recommendations.filter(
      (entry) => entry.bucket === "deprioritize" || entry.bucket === "avoid"
    )
  });

  return {
    userId,
    asOf,
    plannedWorkoutType,
    sessionDecision,
    sessionPlan,
    substitutionOptions,
    muscleLoadSummary,
    movementPatternSummary,
    overworkedMuscles,
    overworkedPatterns,
    recommendedExercises: recommendations.filter(
      (entry) => entry.bucket === "recommended"
    ),
    deprioritizedExercises: recommendations.filter(
      (entry) => entry.bucket === "deprioritize"
    ),
    avoidExercises: recommendations.filter((entry) => entry.bucket === "avoid"),
    recommendedMusclesToAvoid: muscleLoadSummary
      .filter((entry) => entry.recoveryState !== "recovered")
      .map((entry) => entry.muscle)
  };
}

interface MuscleAccumulator {
  totalLoad: number;
  unresolvedLoad: number;
  maxRecoveryTimeHours: number;
  minHoursSinceLastWorked: number;
}

interface PatternAccumulator {
  totalLoad: number;
  unresolvedLoad: number;
}

function buildSubstitutionOptions(input: {
  plannedWorkoutType?: string;
  recommendedExercises: ExerciseRecommendation[];
  candidateExercises: ExerciseRecommendation[];
}): ExerciseSubstitutionOption[] {
  type BuiltSubstitutionOption = ExerciseSubstitutionOption & {
    primaryEffect?: TrainingEffect;
  };
  const recommendedExerciseEntries = input.recommendedExercises
    .map((recommended) => getExerciseById(recommended.exerciseId))
    .filter((candidate): candidate is ExerciseLibraryEntry => Boolean(candidate));
  const usedPrimaryEffects = new Set<TrainingEffect>();
  const builtOptions = input.candidateExercises
    .filter((entry) => !isOffPlanRecommendation(entry))
    .map((entry): BuiltSubstitutionOption | undefined => {
      const exercise = getExerciseById(entry.exerciseId);

      if (!exercise || !(exercise.trainingEffects ?? []).length) {
        return undefined;
      }

      const matchingReplacements = recommendedExerciseEntries
        .filter((candidate) =>
          (candidate.trainingEffects ?? []).some((effect) =>
            (exercise.trainingEffects ?? []).includes(effect)
          )
        )
        .sort((left, right) =>
          scoreReplacementQuality(exercise, right) - scoreReplacementQuality(exercise, left)
        );

      const swapForExerciseIds = matchingReplacements
        .map((candidate) => candidate.exerciseId)
        .slice(0, 3);

      if (!swapForExerciseIds.length) {
        return undefined;
      }

      const primaryReplacement = matchingReplacements[0];
      const swapReasonTags = primaryReplacement
        ? buildSwapReasonTags(exercise, primaryReplacement)
        : ["lower_fatigue"];
      const primaryEffect = exercise.trainingEffects?.[0];

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        trainingEffects: exercise.trainingEffects ?? [],
        swapForExerciseIds,
        swapReasonTags,
        reason: buildSubstitutionReason(exercise, swapForExerciseIds, swapReasonTags),
        frontendCopy: buildSubstitutionFrontendCopy(exercise, swapForExerciseIds, swapReasonTags),
        primaryEffect
      };
    })
    .filter((entry): entry is BuiltSubstitutionOption => Boolean(entry));

  return builtOptions
    .filter((entry) => {
      if (!entry.primaryEffect) {
        return true;
      }

      if (usedPrimaryEffects.has(entry.primaryEffect)) {
        return false;
      }

      usedPrimaryEffects.add(entry.primaryEffect);
      return true;
    })
    .map(({ primaryEffect: _primaryEffect, ...entry }) => entry)
    .slice(0, 5);
}

function buildSessionPlan(input: {
  plannedWorkoutType?: string;
  sessionDecision: SessionDecision;
  overworkedMuscles: MuscleGroup[];
  overworkedPatterns: MovementPattern[];
  recommendedExercises: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
}): SessionPlan {
  const planType = input.plannedWorkoutType ?? "general";
  const normalizedPlanType = planType.toLowerCase();
  const limitMuscles = input.overworkedMuscles.slice(0, 4);
  const limitPatterns = input.overworkedPatterns.slice(0, 2);
  const allExerciseEntries = [
    ...input.recommendedExercises,
    ...input.deprioritizedExercises
  ];

  if (normalizedPlanType.includes("lower")) {
    const focusMuscles = pickMuscles(["quads", "calves", "glute_meds"], limitMuscles);
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(normalizedPlanType, {
      sessionStyle:
        input.sessionDecision.status === "train_as_planned" ? "normal" : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the lower-body session, but shift the work toward lower-fatigue leg options."
          : "Run the lower-body session as planned.",
      focusMuscles,
      limitMuscles,
      limitPatterns,
      volumeGuidance: toVolumeGuidance(input.sessionDecision.volumeAdjustment),
      intensityGuidance: toIntensityGuidance(
        input.sessionDecision.intensityAdjustment
      ),
      blocks: [
        {
          slot: "main",
          focus: "Quad-dominant lower-body work",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.recommendedExercises,
            ["quad_bias", "squat_pattern"],
            2
          )
        },
        {
          slot: "secondary",
          focus: "Stable lower-body accessory work",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.recommendedExercises,
            ["calf_isolation", "quad_bias"],
            2
          )
        },
        {
          slot: "accessory",
          focus: "Only add a third leg movement if it stays clearly away from posterior-chain fatigue",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.deprioritizedExercises,
            ["quad_bias", "unilateral_leg", "squat_pattern"],
            2,
            {
              excludeDirectOverworkedOverlap: true,
              excludeOffPlan: true,
              allowFallback: false
            }
          )
        }
      ]
      }),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("push")) {
    const focusMuscles = pickMuscles(["chest", "side_delts", "triceps"], limitMuscles);
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(normalizedPlanType, {
      sessionStyle:
        input.sessionDecision.status === "train_as_planned" ? "normal" : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the push day, but use the least overlapping press and accessory options."
          : "Run the push day as planned.",
      focusMuscles,
      limitMuscles,
      limitPatterns,
      volumeGuidance: toVolumeGuidance(input.sessionDecision.volumeAdjustment),
      intensityGuidance: toIntensityGuidance(
        input.sessionDecision.intensityAdjustment
      ),
      blocks: [
        {
          slot: "main",
          focus: "Pressing that stays away from your most fatigued overlap",
          exampleExerciseIds: pickBlockExerciseIds(
            input.recommendedExercises,
            input.deprioritizedExercises,
            ["horizontal_press", "chest_isolation"],
            2,
            input.overworkedMuscles
          )
        },
        {
          slot: "secondary",
          focus: "Lower-cost push accessories",
          exampleExerciseIds: pickBlockExerciseIds(
            input.recommendedExercises,
            input.deprioritizedExercises,
            [
              "lateral_delt_isolation",
              "side_delt_bias",
              "cable_pressdown",
              "triceps_isolation",
              "chest_isolation",
              "vertical_press"
            ],
            2,
            input.overworkedMuscles
          )
        },
        {
          slot: "accessory",
          focus: "Hold back on the highest-overlap pressing if fatigue builds",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.deprioritizedExercises,
            ["cable_pressdown", "chest_isolation", "vertical_press", "horizontal_press"],
            2,
            {
              excludeDirectOverworkedOverlap: true,
              excludeOffPlan: true,
              allowFallback: false
            }
          )
        }
      ]
      }),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("posterior")) {
    const focusMuscles = pickMuscles(
      ["glutes", "hamstrings", "spinal_erectors"],
      limitMuscles
    );
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(normalizedPlanType, {
      sessionStyle:
        input.sessionDecision.status === "train_as_planned" ? "normal" : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the posterior-chain session, but bias it toward the least fatiguing hinge and accessory work."
          : "Run the posterior-chain session as planned.",
      focusMuscles,
      limitMuscles,
      limitPatterns,
      volumeGuidance: toVolumeGuidance(input.sessionDecision.volumeAdjustment),
      intensityGuidance: toIntensityGuidance(
        input.sessionDecision.intensityAdjustment
      ),
      blocks: [
        {
          slot: "main",
          focus: "Your most tolerable posterior-chain variation for today",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.recommendedExercises,
            ["hinge_heavy", "glute_bias", "hamstring_isolation"],
            2
          )
        },
        {
          slot: "secondary",
          focus: "Lower-cost posterior-chain accessory work",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.recommendedExercises,
            ["hamstring_isolation", "glute_bias"],
            2
          )
        },
        {
          slot: "accessory",
          focus: "Skip the heaviest posterior-chain work if overlap stays high",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.deprioritizedExercises,
            ["hinge_heavy", "hamstring_isolation", "glute_bias"],
            2,
            {
              excludeDirectOverworkedOverlap: true,
              excludeOffPlan: true,
              allowFallback: false
            }
          )
        }
      ]
      }),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("pull")) {
    const focusMuscles = pickMuscles(["rear_delts", "biceps", "rhomboids"], limitMuscles);
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(normalizedPlanType, {
      sessionStyle:
        input.sessionDecision.status === "train_as_planned" ? "normal" : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the pull day, but bias it toward the least fatiguing pulls and accessories."
          : "Run the pull day as planned.",
      focusMuscles,
      limitMuscles,
      limitPatterns,
      volumeGuidance: toVolumeGuidance(input.sessionDecision.volumeAdjustment),
      intensityGuidance: toIntensityGuidance(
        input.sessionDecision.intensityAdjustment
      ),
      blocks: [
        {
          slot: "main",
          focus: "Your most tolerable pull variation for today",
          exampleExerciseIds: pickBlockExerciseIds(
            input.recommendedExercises,
            input.deprioritizedExercises,
            ["horizontal_row", "vertical_pull"],
            2,
            input.overworkedMuscles
          )
        },
        {
          slot: "secondary",
          focus: "Lighter upper-back or arm work",
          exampleExerciseIds: pickBlockExerciseIds(
            input.recommendedExercises,
            input.deprioritizedExercises,
            [
              "upper_trap_isolation",
              "neutral_grip_curl",
              "rear_delt_isolation",
              "trap_isolation",
              "biceps_isolation"
            ],
            2,
            input.overworkedMuscles
          )
        },
        {
          slot: "accessory",
          focus: "Leave the heaviest rows and pulls for a fresher day",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.deprioritizedExercises,
            [
              "upper_trap_isolation",
              "neutral_grip_curl",
              "rear_delt_isolation",
              "trap_isolation",
              "biceps_isolation",
              "horizontal_row",
              "vertical_pull"
            ],
            2,
            {
              excludeDirectOverworkedOverlap: true,
              excludeOffPlan: true,
              allowFallback: false
            }
          )
        }
      ]
      }),
      allExerciseEntries
    );
  }

  return hydrateSessionPlanBlocks(
    finalizeSessionPlan(normalizedPlanType, {
    sessionStyle:
      input.sessionDecision.status === "train_as_planned" ? "normal" : "modified",
    objective:
      input.sessionDecision.status === "train_as_planned"
        ? "Train normally."
        : "Train, but keep the session selective and easy to recover from.",
    focusMuscles: pickMuscles(["quads", "chest", "rear_delts"], limitMuscles),
    limitMuscles,
    limitPatterns,
    volumeGuidance: toVolumeGuidance(input.sessionDecision.volumeAdjustment),
    intensityGuidance: toIntensityGuidance(
      input.sessionDecision.intensityAdjustment
    ),
    blocks: [
      {
        slot: "main",
        focus: "Use the best-fitting lower-overlap work first",
        exampleExerciseIds: pickRecommendationIds(
          input.recommendedExercises,
          input.recommendedExercises.map((entry) => entry.exerciseId),
          2
        )
      },
      {
        slot: "secondary",
        focus: "Only add more work if the first block feels good",
        exampleExerciseIds: pickRecommendationIds(
          input.recommendedExercises.slice(2),
          input.recommendedExercises.slice(2).map((entry) => entry.exerciseId),
          2
        )
      },
      {
        slot: "accessory",
        focus: "Skip the high-overlap work if fatigue rises quickly",
        exampleExerciseIds: pickRecommendationIds(
          input.deprioritizedExercises,
          input.deprioritizedExercises.map((entry) => entry.exerciseId),
          2,
          {
            excludeDirectOverworkedOverlap: true,
            excludeOffPlan: true,
            allowFallback: false
          }
        )
      }
    ]
    }),
    allExerciseEntries
  );
}

function buildSessionDecision(input: {
  plannedWorkoutType?: string;
  overworkedMuscles: MuscleGroup[];
  overworkedPatterns: MovementPattern[];
  recommendedExercises: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
}): SessionDecision {
  const planType = input.plannedWorkoutType ?? "general";
  const loweredPlanType = planType.toLowerCase();
  const topRecommended = input.recommendedExercises.slice(0, 2);
  const topPullFallbacks = pickConstrainedOnPlanFallbackEntries(
    input.deprioritizedExercises,
    [
      "upper_trap_isolation",
      "neutral_grip_curl",
      "rear_delt_isolation",
      "trap_isolation",
      "biceps_isolation"
    ],
    2,
    input.overworkedMuscles
  );
  const topPushFallbacks = pickConstrainedOnPlanFallbackEntries(
    input.deprioritizedExercises,
    [
      "lateral_delt_isolation",
      "side_delt_bias",
      "cable_pressdown",
      "triceps_isolation",
      "chest_isolation",
      "vertical_press"
    ],
    2,
    input.overworkedMuscles
  );
  const topOverworkedMuscles = input.overworkedMuscles.slice(0, 3);
  const topPattern = input.overworkedPatterns[0];
  const hasGoodAlternatives = topRecommended.length > 0;
  const hasOverworkedSignal =
    input.overworkedMuscles.length > 0 || input.overworkedPatterns.length > 0;

  if (!hasOverworkedSignal) {
    return {
      status: "train_as_planned",
      summary: "Train as planned.",
      sessionMode: `${loweredPlanType}_normal`,
      volumeAdjustment: "normal",
      intensityAdjustment: "normal",
      notes: ["No major recovery flags are standing out today."]
    };
  }

  if (topPattern === "hinge" && loweredPlanType.includes("lower")) {
    return {
      status: "train_modified",
      summary: "Keep the session, but bias away from hinge-heavy work.",
      sessionMode: "lower_body_quad_bias",
      volumeAdjustment: "reduce_20_percent",
      intensityAdjustment: "keep_submaximal",
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still carrying the most fatigue.`,
        "Avoid your heaviest hinge or posterior-chain movements today.",
        hasGoodAlternatives
          ? `Bias the session toward ${formatExerciseNames(topRecommended)} instead.`
          : "Bias the session toward lower-overlap exercise choices."
      ]
    };
  }

  if (loweredPlanType.includes("push") || loweredPlanType.includes("upper")) {
    return {
      status: "train_modified",
      summary: "Keep the session, but reduce overlap with fatigued upper-body work.",
      sessionMode: loweredPlanType.includes("push")
        ? "push_reduced_overlap"
        : "upper_body_reduced_overlap",
      volumeAdjustment: "reduce_10_percent",
      intensityAdjustment: "keep_submaximal",
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still the most loaded.`,
        "Keep pressing and direct arm work a little lighter if they are the overlap point.",
        hasGoodAlternatives
          ? `Safer options today are ${formatExerciseNames(topRecommended)}.`
          : topPushFallbacks.length > 0
            ? `Treat this as a small accessory-only push session built around ${formatExerciseNames(topPushFallbacks)}.`
            : "Lean toward lower-overlap variations today."
      ]
    };
  }

  if (loweredPlanType.includes("pull")) {
    return {
      status: "train_modified",
      summary: "Keep the session, but reduce overlap with the most fatigued pull work.",
      sessionMode: "pull_reduced_overlap",
      volumeAdjustment: "reduce_10_percent",
      intensityAdjustment: "keep_submaximal",
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still carrying fatigue.`,
        "Keep the heaviest rows or pulls lighter if they hit the same pattern hard.",
        hasGoodAlternatives
          ? `Safer options today are ${formatExerciseNames(topRecommended)}.`
          : topPullFallbacks.length > 0
            ? `Treat this as a small accessory-only pull session built around ${formatExerciseNames(topPullFallbacks)}.`
            : "Lean toward lighter pull variations today."
      ]
    };
  }

  if (!hasGoodAlternatives && input.deprioritizedExercises.length === 0) {
    return {
      status: "train_light",
      summary: "Train lightly and keep the session simple.",
      sessionMode: `${loweredPlanType}_light`,
      volumeAdjustment: "reduce_30_percent",
      intensityAdjustment: "reduce_intensity",
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still carrying meaningful fatigue.`,
        "Keep the session short, simple, and well away from failure."
      ]
    };
  }

  return {
    status: "train_modified",
    summary: "Train, but make the session slightly easier to recover from.",
    sessionMode: `${loweredPlanType}_modified`,
    volumeAdjustment: "reduce_10_percent",
    intensityAdjustment: "keep_submaximal",
    notes: [
      `${formatMuscleNames(topOverworkedMuscles)} are still the main recovery watch-points.`,
      hasGoodAlternatives
        ? `Safer options today are ${formatExerciseNames(topRecommended)}.`
        : "Use lower-overlap exercise choices today."
    ]
  };
}

function calculateExerciseLoad(
  sessionExercise: WorkoutExerciseEntry,
  exercise: ExerciseLibraryEntry
): number {
  const effortMultiplier =
    sessionExercise.effort === "hard"
      ? 1.15
      : sessionExercise.effort === "easy"
        ? 0.85
        : 1;
  const repFactor = sessionExercise.reps / 10;
  return roundToTwoDecimals(
    sessionExercise.sets * repFactor * exercise.fatigueScore * effortMultiplier
  );
}

function calculateUnresolvedFactor(
  hoursSinceSession: number,
  recoveryTimeHours: number
): number {
  if (hoursSinceSession >= recoveryTimeHours) {
    return 0;
  }

  return roundToTwoDecimals(1 - hoursSinceSession / recoveryTimeHours);
}

function applyMuscleContributions(
  map: Map<MuscleGroup, MuscleAccumulator>,
  muscles: MuscleGroup[],
  totalLoad: number,
  unresolvedLoad: number,
  hoursSinceSession: number,
  recoveryTimeHours: number
): void {
  for (const muscle of muscles) {
    const current = map.get(muscle) ?? {
      totalLoad: 0,
      unresolvedLoad: 0,
      maxRecoveryTimeHours: 0,
      minHoursSinceLastWorked: NO_HISTORY_HOURS
    };

    current.totalLoad += totalLoad;
    current.unresolvedLoad += unresolvedLoad;
    current.maxRecoveryTimeHours = Math.max(
      current.maxRecoveryTimeHours,
      recoveryTimeHours
    );
    current.minHoursSinceLastWorked = Math.min(
      current.minHoursSinceLastWorked,
      hoursSinceSession
    );
    map.set(muscle, current);
  }
}

function applyPatternContribution(
  map: Map<MovementPattern, PatternAccumulator>,
  movementPattern: MovementPattern,
  totalLoad: number,
  unresolvedLoad: number
): void {
  const current = map.get(movementPattern) ?? { totalLoad: 0, unresolvedLoad: 0 };
  current.totalLoad += totalLoad;
  current.unresolvedLoad += unresolvedLoad;
  map.set(movementPattern, current);
}

function toMuscleSummary(
  muscle: MuscleGroup,
  accumulator: MuscleAccumulator
): MuscleLoadSummaryEntry {
  const hoursSinceLastWorked =
    accumulator.minHoursSinceLastWorked === NO_HISTORY_HOURS
      ? undefined
      : accumulator.minHoursSinceLastWorked;
  const hoursUntilRecovered = Math.max(
    accumulator.maxRecoveryTimeHours - (hoursSinceLastWorked ?? 0),
    0
  );
  const riskScore = roundToTwoDecimals(
    accumulator.unresolvedLoad * 1 + accumulator.totalLoad * 0.2
  );

  return {
    muscle,
    totalLoad: roundToTwoDecimals(accumulator.totalLoad),
    unresolvedLoad: roundToTwoDecimals(accumulator.unresolvedLoad),
    recoveryTimeHours: accumulator.maxRecoveryTimeHours,
    hoursSinceLastWorked,
    hoursUntilRecovered,
    recoveryState: determineRecoveryState(
      accumulator.unresolvedLoad,
      riskScore,
      hoursUntilRecovered
    ),
    riskScore
  };
}

function toPatternSummary(
  movementPattern: MovementPattern,
  accumulator: PatternAccumulator
): MovementPatternSummaryEntry {
  const riskScore = accumulator.unresolvedLoad * 0.9 + accumulator.totalLoad * 0.2;
  return {
    movementPattern,
    totalLoad: roundToTwoDecimals(accumulator.totalLoad),
    unresolvedLoad: roundToTwoDecimals(accumulator.unresolvedLoad),
    recoveryState: determineRecoveryState(
      accumulator.unresolvedLoad,
      riskScore,
      accumulator.unresolvedLoad
    )
  };
}

function determineRecoveryState(
  unresolvedLoad: number,
  riskScore: number,
  hoursUntilRecovered: number
): RecoveryState {
  if (unresolvedLoad >= 22 || riskScore >= 34) {
    return "overworked";
  }

  if (
    hoursUntilRecovered >= 48 &&
    (unresolvedLoad >= 15 || riskScore >= 24)
  ) {
    return "overworked";
  }

  if (unresolvedLoad >= 4 || riskScore >= 8 || hoursUntilRecovered > 0) {
    return "recovering";
  }

  return "recovered";
}

function buildExerciseRecommendations(
  muscleLoadSummary: MuscleLoadSummaryEntry[],
  movementPatternSummary: MovementPatternSummaryEntry[],
  plannedWorkoutType?: string
): ExerciseRecommendation[] {
  const muscleMap = new Map(muscleLoadSummary.map((entry) => [entry.muscle, entry]));
  const patternMap = new Map(
    movementPatternSummary.map((entry) => [entry.movementPattern, entry])
  );

  return getExerciseLibrary()
    .map((exercise) => {
      const reasons: string[] = [];
      let score = 0;
      let hasOverworkedPrimary = false;

      for (const muscle of exercise.primaryMuscles) {
        const summary = muscleMap.get(muscle);
        if (!summary) continue;
        score += getMusclePenalty(summary, "primary");
        if (summary.recoveryState === "overworked") {
          hasOverworkedPrimary = true;
        }
        if (
          summary.recoveryState === "overworked" ||
          (summary.recoveryState === "recovering" && summary.riskScore >= 10)
        ) {
          reasons.push(`${muscle} is still ${summary.recoveryState}`);
        }
      }

      for (const muscle of exercise.secondaryMuscles) {
        const summary = muscleMap.get(muscle);
        if (!summary) continue;
        score += getMusclePenalty(summary, "secondary");
      }

      for (const muscle of exercise.stabilizers) {
        const summary = muscleMap.get(muscle);
        if (!summary) continue;
        score += getMusclePenalty(summary, "stabilizer");
      }

      const patternSummary = patternMap.get(exercise.movementPattern);
      if (patternSummary?.recoveryState === "overworked") {
        score += 4;
        reasons.push(`${exercise.movementPattern} pattern is still overworked`);
      } else if (patternSummary?.recoveryState === "recovering") {
        score += 0.75;
      }

      const planFit = scoreExercisePlanFit(exercise, plannedWorkoutType);
      score += planFit.scoreAdjustment;
      reasons.push(...planFit.reasons);

      const tolerance = getExerciseTolerance(exercise, muscleMap);

      let bucket: RecommendationBucket =
        score >= 40
          ? "avoid"
          : score >= 18
            ? "deprioritize"
            : "recommended";

      if (hasOverworkedPrimary && bucket === "recommended") {
        bucket = "deprioritize";
      }

      if (planFit.relevance === "off_plan" && bucket === "recommended") {
        bucket = "deprioritize";
      }

      if (
        bucket === "recommended" &&
        (plannedWorkoutType?.toLowerCase().includes("push") ||
          plannedWorkoutType?.toLowerCase().includes("pull")) &&
        planFit.relevance !== "on_plan"
      ) {
        bucket = "deprioritize";
      }

      if (
        bucket === "recommended" &&
        reasons.some((reason) => reason.startsWith("Less relevant to today's"))
      ) {
        bucket = "deprioritize";
      }

      if (bucket === "recommended") {
        reasons.push("Lower overlap with unrecovered muscles");
      }

      const fallbackTier =
        bucket !== "avoid" && planFit.relevance === "on_plan"
          ? toFallbackTier(tolerance)
          : undefined;

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        bucket,
        tolerance,
        fallbackTier,
        score: roundToTwoDecimals(score),
        reasons
      } satisfies ExerciseRecommendation;
    })
    .sort((a, b) => a.score - b.score);
}

function diffInHours(laterDate: string, earlierDate: string): number {
  const later = new Date(`${laterDate}T12:00:00.000Z`);
  const earlier = new Date(`${earlierDate}T12:00:00.000Z`);
  return Math.max(
    0,
    Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60))
  );
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function getMusclePenalty(
  summary: MuscleLoadSummaryEntry,
  role: "primary" | "secondary" | "stabilizer"
): number {
  const roleMultiplier =
    role === "primary" ? 1 : role === "secondary" ? 0.5 : 0.25;

  if (summary.recoveryState === "overworked") {
    return summary.riskScore * roleMultiplier * 0.7;
  }

  if (summary.recoveryState === "recovering") {
    return summary.riskScore * roleMultiplier * 0.2;
  }

  return 0;
}

function formatMuscleNames(muscles: MuscleGroup[]): string {
  const labels = muscles.map((muscle) => muscle.replaceAll("_", " "));

  if (!labels.length) {
    return "Your highest-fatigue muscles";
  }

  if (labels.length === 1) {
    return capitalize(labels[0]);
  }

  if (labels.length === 2) {
    return `${capitalize(labels[0])} and ${labels[1]}`;
  }

  return `${capitalize(labels[0])}, ${labels[1]}, and ${labels[2]}`;
}

function formatExerciseNames(exercises: ExerciseRecommendation[]): string {
  const labels = exercises.map((exercise) => exercise.name.toLowerCase());

  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels[0]} or ${labels[1]}`;
}

function toFallbackTier(
  tolerance: ExerciseTolerance
): FallbackTier | undefined {
  if (tolerance === "green") {
    return "best";
  }

  if (tolerance === "yellow") {
    return "acceptable";
  }

  return undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toVolumeGuidance(adjustment: SessionDecision["volumeAdjustment"]): string {
  if (adjustment === "reduce_30_percent") {
    return "Cut total working sets by about 30 percent.";
  }

  if (adjustment === "reduce_20_percent") {
    return "Trim total working sets by about 20 percent.";
  }

  if (adjustment === "reduce_10_percent") {
    return "Trim total working sets by about 10 percent.";
  }

  return "Keep normal session volume.";
}

function toIntensityGuidance(
  adjustment: SessionDecision["intensityAdjustment"]
): string {
  if (adjustment === "reduce_intensity") {
    return "Keep loads clearly below your hardest effort today.";
  }

  if (adjustment === "keep_submaximal") {
    return "Keep most working sets around 2-3 reps in reserve.";
  }

  return "Use normal training intensity.";
}

function buildSubstitutionReason(
  exercise: ExerciseLibraryEntry,
  swapForExerciseIds: string[],
  swapReasonTags: string[]
): string {
  const effectLabel = formatTrainingEffect(exercise.trainingEffects?.[0]);
  const reasons = swapReasonTags
    .map((tag) => formatSwapReasonTag(tag))
    .filter((value, index, values) => values.indexOf(value) === index);

  if (swapForExerciseIds.length === 1 && reasons.length === 1) {
    return `Preserves the ${effectLabel} training effect with ${reasons[0]} today.`;
  }

  if (reasons.length === 1) {
    return `Preserves the ${effectLabel} training effect while giving you ${reasons[0]} today.`;
  }

  if (reasons.length >= 2) {
    return `Preserves the ${effectLabel} training effect while giving you ${reasons[0]} and ${reasons[1]} today.`;
  }

  return `Preserves the ${effectLabel} training effect while giving you a lower-fatigue way to keep the day on track.`;
}

function buildSubstitutionFrontendCopy(
  exercise: ExerciseLibraryEntry,
  swapForExerciseIds: string[],
  swapReasonTags: string[]
): {
  title: string;
  actionLabel: string;
  explanation: string;
} {
  const swapNames = swapForExerciseIds
    .map((exerciseId) => getExerciseById(exerciseId)?.name)
    .filter((name): name is string => Boolean(name));
  const primarySwapName = swapNames[0] ?? "a safer option";
  const formattedSwapNames = formatExerciseNameList(swapNames);
  const explanation =
    swapReasonTags.length >= 2
      ? `You keep a similar training effect with ${formatSwapReasonTag(swapReasonTags[0])} and ${formatSwapReasonTag(swapReasonTags[1])}.`
      : `You keep a similar training effect with ${formatSwapReasonTag(swapReasonTags[0] ?? "lower_fatigue")}.`;

  return {
    title: `Swap ${exercise.name} today`,
    actionLabel: `Try ${formattedSwapNames}`,
    explanation:
      swapNames.length > 1
        ? `${primarySwapName} is the cleanest swap today. ${explanation}`
        : `${primarySwapName} is the cleanest swap today. ${explanation}`
  };
}

function formatExerciseNameList(names: string[]): string {
  if (names.length === 0) {
    return "a safer option";
  }

  if (names.length === 1) {
    return names[0].toLowerCase();
  }

  return `${names[0].toLowerCase()} or ${names[1].toLowerCase()}`;
}

function formatTrainingEffect(effect?: TrainingEffect): string {
  if (!effect) {
    return "same-session";
  }

  return effect.replaceAll("_", " ");
}

function scoreReplacementQuality(
  original: ExerciseLibraryEntry,
  replacement: ExerciseLibraryEntry
): number {
  const sharedEffects = (replacement.trainingEffects ?? []).filter((effect) =>
    (original.trainingEffects ?? []).includes(effect)
  ).length;
  const fatigueAdvantage = Math.max(original.fatigueScore - replacement.fatigueScore, 0);
  const axialLoadAdvantage = Math.max(
    getAxialLoadScore(original) - getAxialLoadScore(replacement),
    0
  );
  const setupAdvantage = Math.max(
    getSetupFrictionScore(original) - getSetupFrictionScore(replacement),
    0
  );

  return sharedEffects * 10 + fatigueAdvantage * 3 + axialLoadAdvantage * 2 + setupAdvantage;
}

function buildSwapReasonTags(
  original: ExerciseLibraryEntry,
  replacement: ExerciseLibraryEntry
): string[] {
  const tags: string[] = [];

  if (replacement.fatigueScore < original.fatigueScore) {
    tags.push("lower_fatigue");
  }

  if (getAxialLoadScore(replacement) < getAxialLoadScore(original)) {
    tags.push("lower_axial_load");
  }

  if (getSetupFrictionScore(replacement) < getSetupFrictionScore(original)) {
    tags.push("lower_setup_friction");
  }

  if (!tags.length) {
    tags.push("lower_fatigue");
  }

  return tags;
}

function formatSwapReasonTag(tag: string): string {
  if (tag === "lower_axial_load") {
    return "lower axial load";
  }

  if (tag === "lower_setup_friction") {
    return "lower setup friction";
  }

  return "a lower-fatigue option";
}

function getAxialLoadScore(exercise: ExerciseLibraryEntry): number {
  let score = 0;

  if (
    exercise.movementPattern === "hinge" ||
    exercise.movementPattern === "squat" ||
    exercise.movementPattern === "carry"
  ) {
    score += 2;
  }

  if (
    exercise.primaryMuscles.includes("spinal_erectors") ||
    exercise.secondaryMuscles.includes("spinal_erectors") ||
    exercise.stabilizers.includes("spinal_erectors")
  ) {
    score += 2;
  }

  if (exercise.equipmentType === "barbell") {
    score += 2;
  } else if (exercise.equipmentType === "bodyweight" || exercise.equipmentType === "dumbbell") {
    score += 1;
  }

  if (exercise.stability === "high") {
    score += 1;
  }

  return score;
}

function getSetupFrictionScore(exercise: ExerciseLibraryEntry): number {
  let score = 0;

  if (exercise.equipmentType === "barbell") {
    score += 3;
  } else if (exercise.equipmentType === "dumbbell") {
    score += 2;
  } else if (exercise.equipmentType === "bodyweight") {
    score += 1;
  }

  if (exercise.liftType === "compound") {
    score += 1;
  }

  if (exercise.stability === "high") {
    score += 1;
  }

  return score;
}

function pickMuscles(
  preferred: MuscleGroup[],
  limitMuscles: MuscleGroup[]
): MuscleGroup[] {
  const limited = new Set(limitMuscles);
  const picked = preferred.filter((muscle) => !limited.has(muscle));
  return picked.slice(0, 3);
}

function pickRecommendationIds(
  entries: ExerciseRecommendation[],
  preferredIds: string[],
  maxCount: number,
  options?: {
    excludeDirectOverworkedOverlap?: boolean;
    excludeOffPlan?: boolean;
    allowFallback?: boolean;
  }
): string[] {
  const eligibleEntries = entries.filter((entry) => {
    if (options?.excludeDirectOverworkedOverlap && hasDirectOverworkedOverlap(entry)) {
      return false;
    }

    if (options?.excludeOffPlan && isOffPlanRecommendation(entry)) {
      return false;
    }

    return true;
  });

  return pickExerciseIds(
    eligibleEntries.map((entry) => entry.exerciseId),
    preferredIds,
    maxCount,
    options?.allowFallback ?? true
  );
}

function pickRecommendationIdsByEffect(
  entries: ExerciseRecommendation[],
  preferredEffects: TrainingEffect[],
  maxCount: number,
  options?: {
    excludeDirectOverworkedOverlap?: boolean;
    excludeOffPlan?: boolean;
    allowFallback?: boolean;
  }
): string[] {
  const eligibleEntries = entries.filter((entry) => {
    if (options?.excludeDirectOverworkedOverlap && hasDirectOverworkedOverlap(entry)) {
      return false;
    }

    if (options?.excludeOffPlan && isOffPlanRecommendation(entry)) {
      return false;
    }

    return true;
  });
  const preferredIds = eligibleEntries
    .map((entry) => ({
      entry,
      exercise: getExerciseById(entry.exerciseId)
    }))
    .filter(
      (
        candidate
      ): candidate is {
        entry: ExerciseRecommendation;
        exercise: ExerciseLibraryEntry;
      } => Boolean(candidate.exercise)
    )
    .filter((candidate) =>
      (candidate.exercise.trainingEffects ?? []).some((effect) =>
        preferredEffects.includes(effect)
      )
    )
    .sort(
      (left, right) =>
        getPreferredEffectRank(left.exercise, preferredEffects) -
          getPreferredEffectRank(right.exercise, preferredEffects) ||
        getToleranceRank(left.entry.tolerance) - getToleranceRank(right.entry.tolerance) ||
        left.entry.score - right.entry.score
    )
    .map((candidate) => candidate.exercise.exerciseId);

  return pickExerciseIds(
    eligibleEntries.map((entry) => entry.exerciseId),
    preferredIds,
    maxCount,
    options?.allowFallback ?? true
  );
}

function pickBlockExerciseIds(
  recommendedEntries: ExerciseRecommendation[],
  deprioritizedEntries: ExerciseRecommendation[],
  preferredEffects: TrainingEffect[],
  maxCount: number,
  overworkedMuscles: MuscleGroup[]
): string[] {
  const recommendedIds = pickRecommendationIdsByEffect(
    recommendedEntries,
    preferredEffects,
    maxCount,
    { allowFallback: false }
  );

  if (recommendedIds.length > 0) {
    return recommendedIds;
  }

  return pickConstrainedOnPlanFallbackEntries(
    deprioritizedEntries,
    preferredEffects,
    maxCount,
    overworkedMuscles
  ).map((entry) => entry.exerciseId);
}

function pickConstrainedOnPlanFallbackEntries(
  entries: ExerciseRecommendation[],
  preferredEffects: TrainingEffect[],
  maxCount: number,
  overworkedMuscles: MuscleGroup[]
): ExerciseRecommendation[] {
  const eligibleEntries = entries
    .filter((entry) => isOnPlanRecommendation(entry))
    .filter((entry) => !hasDirectOverworkedOverlap(entry))
    .filter((entry) => entry.score <= 35)
    .map((entry) => ({
      entry,
      exercise: getExerciseById(entry.exerciseId)
    }))
    .filter(
      (
        candidate
      ): candidate is {
        entry: ExerciseRecommendation;
        exercise: ExerciseLibraryEntry;
      } => Boolean(candidate.exercise)
    )
    .filter((candidate) =>
      Boolean(
        getBestMatchingEffect(
          candidate.exercise,
          preferredEffects,
          overworkedMuscles
        )
      )
    );

  const preferredIds = eligibleEntries
    .sort((left, right) => {
      const leftMatch = getBestMatchingEffect(
        left.exercise,
        preferredEffects,
        overworkedMuscles
      );
      const rightMatch = getBestMatchingEffect(
        right.exercise,
        preferredEffects,
        overworkedMuscles
      );

      return (
        getToleranceRank(left.entry.tolerance) - getToleranceRank(right.entry.tolerance) ||
        (leftMatch?.rank ?? Number.MAX_SAFE_INTEGER) -
          (rightMatch?.rank ?? Number.MAX_SAFE_INTEGER) ||
        (leftMatch?.cautionCount ?? Number.MAX_SAFE_INTEGER) -
          (rightMatch?.cautionCount ?? Number.MAX_SAFE_INTEGER) ||
        left.entry.score - right.entry.score
      );
    })
    .map((candidate) => candidate.exercise.exerciseId);

  const pickedIds = pickExerciseIds(
    eligibleEntries.map((candidate) => candidate.entry.exerciseId),
    preferredIds,
    maxCount,
    false
  );

  return pickedIds
    .map((exerciseId) =>
      eligibleEntries.find((candidate) => candidate.entry.exerciseId === exerciseId)
    )
    .map((candidate) => candidate?.entry)
    .filter((entry): entry is ExerciseRecommendation => Boolean(entry));
}

function getToleranceRank(tolerance: ExerciseTolerance): number {
  if (tolerance === "green") {
    return 0;
  }

  if (tolerance === "yellow") {
    return 1;
  }

  return 2;
}

function getExerciseTolerance(
  exercise: ExerciseLibraryEntry,
  muscleMap: Map<MuscleGroup, MuscleLoadSummaryEntry>
): ExerciseTolerance {
  const effects = exercise.trainingEffects ?? [];

  if (!effects.length) {
    return getMuscleDrivenTolerance(exercise, muscleMap);
  }

  const bestEffectSeverity = effects
    .map((effect) => getEffectToleranceSeverity(effect, muscleMap))
    .sort((left, right) => left - right)[0];

  return severityToTolerance(bestEffectSeverity ?? 2);
}

function getMuscleDrivenTolerance(
  exercise: ExerciseLibraryEntry,
  muscleMap: Map<MuscleGroup, MuscleLoadSummaryEntry>
): ExerciseTolerance {
  if (
    exercise.primaryMuscles.some(
      (muscle) => muscleMap.get(muscle)?.recoveryState === "overworked"
    )
  ) {
    return "red";
  }

  if (
    exercise.primaryMuscles.some(
      (muscle) => muscleMap.get(muscle)?.recoveryState === "recovering"
    ) ||
    exercise.secondaryMuscles.some(
      (muscle) => muscleMap.get(muscle)?.recoveryState === "recovering"
    )
  ) {
    return "yellow";
  }

  return "green";
}

function getEffectToleranceSeverity(
  effect: TrainingEffect,
  muscleMap: Map<MuscleGroup, MuscleLoadSummaryEntry>
): number {
  const guardrail = TRAINING_EFFECT_GUARDRAILS[effect];

  if (!guardrail) {
    return 0;
  }

  const hasBlockedOverlap = guardrail.blockedBy.some(
    (muscle) => muscleMap.get(muscle)?.recoveryState === "overworked"
  );

  if (hasBlockedOverlap) {
    return 2;
  }

  const hasCautionOverlap = [
    ...guardrail.blockedBy,
    ...(guardrail.cautionBy ?? [])
  ].some((muscle) => {
    const state = muscleMap.get(muscle)?.recoveryState;
    return state === "recovering" || state === "overworked";
  });

  return hasCautionOverlap ? 1 : 0;
}

function severityToTolerance(severity: number): ExerciseTolerance {
  if (severity <= 0) {
    return "green";
  }

  if (severity === 1) {
    return "yellow";
  }

  return "red";
}

function getPreferredEffectRank(
  exercise: ExerciseLibraryEntry,
  preferredEffects: TrainingEffect[]
): number {
  const matchedRanks = (exercise.trainingEffects ?? [])
    .map((effect) => preferredEffects.indexOf(effect))
    .filter((rank) => rank >= 0);

  return matchedRanks.length ? Math.min(...matchedRanks) : Number.MAX_SAFE_INTEGER;
}

function getBestMatchingEffect(
  exercise: ExerciseLibraryEntry,
  preferredEffects: TrainingEffect[],
  overworkedMuscles: MuscleGroup[]
):
  | {
      effect: TrainingEffect;
      rank: number;
      cautionCount: number;
    }
  | undefined {
  const overworkedSet = new Set(overworkedMuscles);

  return (exercise.trainingEffects ?? [])
    .filter((effect) => preferredEffects.includes(effect))
    .map((effect) => {
      const guardrail = TRAINING_EFFECT_GUARDRAILS[effect];
      const blocked = (guardrail?.blockedBy ?? []).some((muscle) =>
        overworkedSet.has(muscle)
      );

      if (blocked) {
        return undefined;
      }

      return {
        effect,
        rank: preferredEffects.indexOf(effect),
        cautionCount: (guardrail?.cautionBy ?? []).filter((muscle) =>
          overworkedSet.has(muscle)
        ).length
      };
    })
    .filter(
      (
        match
      ): match is {
        effect: TrainingEffect;
        rank: number;
        cautionCount: number;
      } => Boolean(match)
    )
    .sort(
      (left, right) =>
        left.rank - right.rank || left.cautionCount - right.cautionCount
    )[0];
}

function finalizeSessionPlan(
  normalizedPlanType: string,
  plan: SessionPlan
): SessionPlan {
  const normalizedBlocks = dedupeSessionPlanBlocks(plan.blocks);
  const normalizedPlan = {
    ...plan,
    blocks: normalizedBlocks
  };
  const mainBlock = normalizedBlocks.find((block) => block.slot === "main");
  const secondaryBlock = normalizedBlocks.find((block) => block.slot === "secondary");
  const accessoryBlock = normalizedBlocks.find((block) => block.slot === "accessory");
  const hasMainWork = Boolean(mainBlock?.exampleExerciseIds.length);
  const hasSecondaryWork = Boolean(secondaryBlock?.exampleExerciseIds.length);
  const hasAccessoryWork = Boolean(accessoryBlock?.exampleExerciseIds.length);

  if (hasMainWork || (!hasSecondaryWork && !hasAccessoryWork)) {
    return normalizedPlan;
  }

  if (normalizedPlanType.includes("push")) {
    return {
      ...normalizedPlan,
      sessionStyle: "accessory_only",
      objective: "Keep the push day, but run it as a small accessory-only session today.",
      coachNote:
        "Skip your main pressing work today. Keep only the small push accessories that stay clearly away from the most fatigued overlap."
    };
  }

  if (normalizedPlanType.includes("pull")) {
    return {
      ...normalizedPlan,
      sessionStyle: "accessory_only",
      objective: "Keep the pull day, but run it as a small accessory-only session today.",
      coachNote:
        "Skip your main pulling work today. Keep only the lightest pull accessories that still feel clearly recoverable."
    };
  }

  if (normalizedPlanType.includes("lower") || normalizedPlanType.includes("posterior")) {
    return {
      ...normalizedPlan,
      sessionStyle: "accessory_only",
      objective: "Keep the day, but run it as a very small accessory-only session today.",
      coachNote:
        "Skip the main work today and keep only the lowest-fatigue accessory pieces that stay away from the biggest recovery flags."
    };
  }

  return {
    ...normalizedPlan,
    sessionStyle: "accessory_only",
    coachNote:
      "Skip the main work today and keep only the small accessory pieces that are easiest to recover from."
  };
}

function dedupeSessionPlanBlocks(blocks: SessionPlan["blocks"]): SessionPlan["blocks"] {
  const usedExerciseIds = new Set<string>();

  return blocks.map((block) => {
    const exampleExerciseIds = block.exampleExerciseIds.filter((exerciseId) => {
      if (usedExerciseIds.has(exerciseId)) {
        return false;
      }

      usedExerciseIds.add(exerciseId);
      return true;
    });

    return {
      ...block,
      exampleExerciseIds
    };
  });
}

function hydrateSessionPlanBlocks(
  plan: SessionPlan,
  entries: ExerciseRecommendation[]
): SessionPlan {
  const entryByExerciseId = new Map(
    entries.map((entry) => [entry.exerciseId, entry] as const)
  );

  return {
    ...plan,
    blocks: plan.blocks.map((block) => {
      const exampleExercises = block.exampleExerciseIds.map((exerciseId) => {
        const entry = entryByExerciseId.get(exerciseId);

        return {
          exerciseId,
          tolerance: entry?.tolerance,
          fallbackTier: entry?.fallbackTier
        };
      });

      return {
        ...block,
        blockTier: exampleExercises[0]?.fallbackTier,
        exampleExercises
      };
    })
  };
}

function hasDirectOverworkedOverlap(entry: ExerciseRecommendation): boolean {
  return entry.reasons.some(
    (reason) =>
      reason.includes("still overworked") ||
      reason.includes("pattern is still overworked")
  );
}

function isOffPlanRecommendation(entry: ExerciseRecommendation): boolean {
  return entry.reasons.some((reason) =>
    reason.startsWith("Less relevant to today's")
  );
}

function isOnPlanRecommendation(entry: ExerciseRecommendation): boolean {
  return entry.reasons.some(
    (reason) =>
      reason.startsWith("Fits today's") ||
      reason.startsWith("Still relevant to today's")
  );
}

function pickExerciseIds(
  sourceIds: string[],
  preferredIds: string[],
  maxCount: number,
  allowFallback = true
): string[] {
  const picked = preferredIds.filter((exerciseId) => sourceIds.includes(exerciseId));

  if (picked.length >= maxCount) {
    return picked.slice(0, maxCount);
  }

  if (!allowFallback) {
    return picked.slice(0, maxCount);
  }

  for (const exerciseId of sourceIds) {
    if (!picked.includes(exerciseId)) {
      picked.push(exerciseId);
    }

    if (picked.length >= maxCount) {
      break;
    }
  }

  return picked.slice(0, maxCount);
}

function scoreExercisePlanFit(
  exercise: ExerciseLibraryEntry,
  plannedWorkoutType?: string
): {
  scoreAdjustment: number;
  reasons: string[];
  relevance: "on_plan" | "adjacent" | "off_plan";
} {
  if (!plannedWorkoutType) {
    return { scoreAdjustment: 0, reasons: [], relevance: "adjacent" };
  }

  const normalizedType = plannedWorkoutType.toLowerCase();
  const isLowerBodyPlan =
    normalizedType.includes("lower") || normalizedType.includes("legs");
  const isUpperBodyPlan = normalizedType.includes("upper");
  const isFullBodyPlan = normalizedType.includes("full");
  const isPushPlan = normalizedType.includes("push");
  const isPullPlan = normalizedType.includes("pull");
  const isPosteriorPlan = normalizedType.includes("posterior");

  if (isFullBodyPlan) {
    return { scoreAdjustment: 0, reasons: [], relevance: "adjacent" };
  }

  const lowerBodyPatterns: MovementPattern[] = [
    "squat",
    "lunge",
    "hinge",
    "knee_flexion",
    "knee_extension",
    "plantar_flexion"
  ];
  const upperBodyPatterns: MovementPattern[] = [
    "horizontal_push",
    "vertical_push",
    "vertical_pull",
    "horizontal_pull",
    "horizontal_abduction",
    "elbow_flexion",
    "elbow_extension",
    "carry"
  ];
  const pushPatterns: MovementPattern[] = [
    "horizontal_push",
    "vertical_push",
    "elbow_extension"
  ];
  const pullPatterns: MovementPattern[] = [
    "vertical_pull",
    "horizontal_pull",
    "horizontal_abduction",
    "elbow_flexion",
    "carry"
  ];
  const posteriorPatterns: MovementPattern[] = [
    "hinge",
    "knee_flexion",
    "carry"
  ];

  if (isLowerBodyPlan) {
    return exercise.movementPattern === "hinge"
      ? {
          scoreAdjustment: -2,
          reasons: ["Still relevant to today's lower-body plan"],
          relevance: "on_plan"
        }
      : lowerBodyPatterns.includes(exercise.movementPattern)
        ? {
            scoreAdjustment: -10,
            reasons: ["Fits today's lower-body plan better"],
            relevance: "on_plan"
          }
        : {
            scoreAdjustment: 10,
            reasons: ["Less relevant to today's lower-body plan"],
            relevance: "off_plan"
          };
  }

  if (isUpperBodyPlan) {
    return upperBodyPatterns.includes(exercise.movementPattern)
      ? {
          scoreAdjustment: -8,
          reasons: ["Fits today's upper-body plan better"],
          relevance: "on_plan"
        }
      : {
          scoreAdjustment: 8,
          reasons: ["Less relevant to today's upper-body plan"],
          relevance: "off_plan"
        };
  }

  if (isPushPlan) {
    if (pushPatterns.includes(exercise.movementPattern)) {
      return {
        scoreAdjustment: -10,
        reasons: ["Fits today's push plan better"],
        relevance: "on_plan"
      };
    }

    if (lowerBodyPatterns.includes(exercise.movementPattern)) {
      return {
        scoreAdjustment: 10,
        reasons: ["Less relevant to today's push plan"],
        relevance: "off_plan"
      };
    }

    return {
      scoreAdjustment: 4,
      reasons: ["Not the best fit for today's push plan"],
      relevance: "adjacent"
    };
  }

  if (isPosteriorPlan) {
    if (posteriorPatterns.includes(exercise.movementPattern)) {
      return {
        scoreAdjustment: -10,
        reasons: ["Fits today's posterior-chain plan better"],
        relevance: "on_plan"
      };
    }

    if (lowerBodyPatterns.includes(exercise.movementPattern)) {
      return {
        scoreAdjustment: -2,
        reasons: ["Still relevant to today's posterior-chain plan"],
        relevance: "adjacent"
      };
    }

    return {
      scoreAdjustment: 10,
      reasons: ["Less relevant to today's posterior-chain plan"],
      relevance: "off_plan"
    };
  }

  if (isPullPlan) {
    if (pullPatterns.includes(exercise.movementPattern)) {
      return {
        scoreAdjustment: -10,
        reasons: ["Fits today's pull plan better"],
        relevance: "on_plan"
      };
    }

    if (lowerBodyPatterns.includes(exercise.movementPattern)) {
      return {
        scoreAdjustment: 10,
        reasons: ["Less relevant to today's pull plan"],
        relevance: "off_plan"
      };
    }

    return {
      scoreAdjustment: 4,
      reasons: ["Not the best fit for today's pull plan"],
      relevance: "adjacent"
    };
  }

  return { scoreAdjustment: 0, reasons: [], relevance: "adjacent" };
}
