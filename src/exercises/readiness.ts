import { getExerciseById, getExerciseLibrary } from "./library.js";
import type {
  ExerciseSetEntry,
  ExerciseRecommendationProvenance,
  ExerciseSelectionSource,
  ExerciseTolerance,
  ExerciseLibraryEntry,
  ExerciseRecommendation,
  ExerciseSubstitutionOption,
  FallbackTier,
  MovementPattern,
  MovementPatternSummaryEntry,
  MuscleGroup,
  MuscleLoadSummaryEntry,
  ObjectiveReadinessModel,
  RecommendationBucket,
  RecommendationMemoryLike,
  ReadinessProfileContext,
  PlannedDayReadinessContext,
  RecoveryState,
  SessionDecision,
  SessionPlan,
  TrainingEffect,
  TrainingReadinessReport,
  WorkoutExerciseEntry
} from "./types.js";
import type { WorkoutRecord } from "../kai/types.js";
import type { ExperienceLevel } from "../kai/types.js";
import {
  describeCalmerDayRepeatCue,
  describeConservativeCoachNote,
  describeConservativeDayNote,
  describeConservativeSessionHeadline,
  describeConservativeSlotCue,
  describeConservativeStructureNote,
  describeConservativeTemplateCoachNote,
  describeLightDaySlotCue,
  describeModifiedSupportCue
} from "../kai/coaching-copy.js";

const DAY_IN_HOURS = 24;
const NO_HISTORY_HOURS = 9999;
const EXPERIENCE_PROFILES: Record<
  ExperienceLevel,
  {
    recoveryState: {
      overworkedUnresolvedLoad: number;
      overworkedRiskScore: number;
      longRecoveryUnresolvedLoad: number;
      longRecoveryRiskScore: number;
      recoveringUnresolvedLoad: number;
      recoveringRiskScore: number;
    };
    downgrade: {
      directOverlapBuffer: number;
      accessoryOnlyRequiresMultipleEmptyBlocks: boolean;
    };
  }
> = {
  beginner: {
    recoveryState: {
      overworkedUnresolvedLoad: 22,
      overworkedRiskScore: 34,
      longRecoveryUnresolvedLoad: 15,
      longRecoveryRiskScore: 24,
      recoveringUnresolvedLoad: 4,
      recoveringRiskScore: 8
    },
    downgrade: {
      directOverlapBuffer: 0,
      accessoryOnlyRequiresMultipleEmptyBlocks: false
    }
  },
  intermediate: {
    recoveryState: {
      overworkedUnresolvedLoad: 28,
      overworkedRiskScore: 42,
      longRecoveryUnresolvedLoad: 20,
      longRecoveryRiskScore: 30,
      recoveringUnresolvedLoad: 6,
      recoveringRiskScore: 12
    },
    downgrade: {
      directOverlapBuffer: 6,
      accessoryOnlyRequiresMultipleEmptyBlocks: true
    }
  }
};

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
    blockedBy: ["brachialis"],
    cautionBy: ["brachioradialis", "biceps"]
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
  plannedWorkoutType?: string,
  experienceLevel: ExperienceLevel = "beginner",
  recommendationMemory?: RecommendationMemoryLike,
  profileContext?: ReadinessProfileContext,
  plannedDayContext?: PlannedDayReadinessContext
): TrainingReadinessReport {
  const experienceProfile = EXPERIENCE_PROFILES[experienceLevel];
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

      const loadProfile = calculateExerciseLoadProfile(sessionExercise, exercise);
      const baseLoad = loadProfile.baseLoad;
      const unresolvedFactor = calculateUnresolvedFactor(
        hoursSinceSession,
        loadProfile.recoveryTimeHours
      );
      const unresolvedLoad = baseLoad * unresolvedFactor;

      applyMuscleContributions(
        muscleLoadMap,
        exercise.primaryMuscles,
        baseLoad * exercise.contributionWeights.primary,
        unresolvedLoad * exercise.contributionWeights.primary,
        hoursSinceSession,
        loadProfile.recoveryTimeHours
      );
      applyMuscleContributions(
        muscleLoadMap,
        exercise.secondaryMuscles,
        baseLoad * exercise.contributionWeights.secondary,
        unresolvedLoad * exercise.contributionWeights.secondary,
        hoursSinceSession,
        loadProfile.recoveryTimeHours
      );
      applyMuscleContributions(
        muscleLoadMap,
        exercise.stabilizers,
        baseLoad * exercise.contributionWeights.stabilizer,
        unresolvedLoad * exercise.contributionWeights.stabilizer,
        hoursSinceSession,
        loadProfile.recoveryTimeHours
      );

      applyPatternContribution(
        patternLoadMap,
        exercise.movementPattern,
        baseLoad,
        unresolvedLoad,
        hoursSinceSession,
        loadProfile.recoveryTimeHours
      );
    }
  }

  const muscleLoadSummary = [...muscleLoadMap.entries()]
    .map(([muscle, accumulator]) =>
      toMuscleSummary(muscle, accumulator, experienceProfile)
    )
    .sort((a, b) => b.riskScore - a.riskScore);
  const movementPatternSummary = [...patternLoadMap.entries()]
    .map(([movementPattern, accumulator]) =>
      toPatternSummary(movementPattern, accumulator, experienceProfile)
    )
    .sort((a, b) => b.unresolvedLoad - a.unresolvedLoad);
  const overworkedMuscles = muscleLoadSummary
    .filter((entry) => entry.recoveryState === "overworked")
    .map((entry) => entry.muscle);
  const overworkedPatterns = movementPatternSummary
    .filter((entry) => entry.recoveryState === "overworked")
    .map((entry) => entry.movementPattern);
  const progressionSignalMap = buildExerciseProgressionSignalMap(
    completedSessions,
    asOf
  );
  const comparableWorkoutReliability = summarizeComparableWorkoutReliability(
    completedSessions,
    plannedWorkoutType,
    asOf
  );
  const comparableWorkoutLeadingFatigue = summarizeComparableWorkoutLeadingFatigue(
    completedSessions,
    plannedWorkoutType,
    asOf
  );
  const recommendationConfidenceContext = {
    dataConfidenceScore: scoreReadinessDataConfidence({
      completedSessionCount: completedSessions.length,
      plannedWorkoutType,
      comparableWorkoutReliability,
      comparableWorkoutLeadingFatigue
    })
  };
  const recommendations = buildExerciseRecommendations(
    muscleLoadSummary,
    movementPatternSummary,
    plannedWorkoutType,
    recommendationMemory,
    profileContext,
    plannedDayContext,
    progressionSignalMap,
    recommendationConfidenceContext
  );
  const relevantConstraints = deriveRelevantConstraints(
    plannedWorkoutType,
    overworkedMuscles,
    overworkedPatterns
  );
  const sessionDecision = buildSessionDecision({
    plannedWorkoutType,
    overworkedMuscles: relevantConstraints.overworkedMuscles,
    overworkedPatterns: relevantConstraints.overworkedPatterns,
    recommendedExercises: recommendations.filter(
      (entry) => entry.bucket === "recommended"
    ),
    deprioritizedExercises: recommendations.filter(
      (entry) => entry.bucket === "deprioritize"
    ),
    experienceLevel,
    comparableWorkoutReliability,
    comparableWorkoutLeadingFatigue,
    plannedDayContext
  });
  const sessionPlan = buildSessionPlan({
    plannedWorkoutType,
    sessionDecision,
    overworkedMuscles: relevantConstraints.overworkedMuscles,
    overworkedPatterns: relevantConstraints.overworkedPatterns,
    recommendedExercises: recommendations.filter(
      (entry) => entry.bucket === "recommended"
    ),
    deprioritizedExercises: recommendations.filter(
      (entry) => entry.bucket === "deprioritize"
    ),
    experienceLevel,
    plannedDayContext
  });
  const readinessModel = buildObjectiveReadinessModel({
    muscleLoadSummary,
    movementPatternSummary,
    comparableWorkoutReliability,
    comparableWorkoutLeadingFatigue,
    completedSessionCount: completedSessions.length,
    plannedWorkoutType,
    sessionDecision,
    sessionPlan,
    plannedDayContext
  });
  const substitutionOptions = buildSubstitutionOptions({
    plannedWorkoutType,
    recommendedExercises: recommendations.filter(
      (entry) => entry.bucket === "recommended"
    ),
    candidateExercises: recommendations.filter(
      (entry) => entry.bucket === "deprioritize" || entry.bucket === "avoid"
    ),
    recommendationMemory,
    plannedDayContext,
    progressionSignalMap
  });

  return {
    userId,
    asOf,
    plannedWorkoutType,
    readinessModel,
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
  maxRecoveryTimeHours: number;
  minHoursSinceLastWorked: number;
}

interface ExerciseLoadProfile {
  baseLoad: number;
  recoveryTimeHours: number;
}

interface ExerciseProgressionSignalSummary {
  trend: "rising" | "steady" | "slipping" | "insufficient_data";
  deltaPercent?: number;
  latestWasPersonalBest?: boolean;
}

export function buildSubstitutionOptions(input: {
  plannedWorkoutType?: string;
  recommendedExercises: ExerciseRecommendation[];
  candidateExercises: ExerciseRecommendation[];
  recommendationMemory?: RecommendationMemoryLike;
  plannedDayContext?: PlannedDayReadinessContext;
  progressionSignalMap?: Map<string, ExerciseProgressionSignalSummary>;
}): ExerciseSubstitutionOption[] {
  type BuiltSubstitutionOption = ExerciseSubstitutionOption & {
    primaryEffect?: TrainingEffect;
    learnedSwapScore?: number;
    progressionSwapScore?: number;
  };
  const recommendedExerciseEntries = input.recommendedExercises
    .map((recommended) => getExerciseById(recommended.exerciseId))
    .filter((candidate): candidate is ExerciseLibraryEntry => Boolean(candidate));
  const usedPrimaryEffects = new Set<TrainingEffect>();
  const builtOptions = input.candidateExercises
    .filter((entry) => !isOffPlanRecommendation(entry))
    .filter((entry) => !entry.reasons.some((reason) => reason.startsWith("Hard constraint:")))
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
          scoreReplacementCandidate(
            exercise,
            right,
            input.recommendationMemory,
            input.plannedDayContext?.workoutType ?? input.plannedWorkoutType,
            input.progressionSignalMap
          ) -
            scoreReplacementCandidate(
              exercise,
              left,
              input.recommendationMemory,
              input.plannedDayContext?.workoutType ?? input.plannedWorkoutType,
              input.progressionSignalMap
            )
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
      const learnedSwapScore = primaryReplacement
        ? resolveLearnedSwapScore(
            exercise.exerciseId,
            primaryReplacement.exerciseId,
            input.recommendationMemory,
            input.plannedDayContext?.workoutType ?? input.plannedWorkoutType
          )
        : 0;
      const progressionSwapScore = primaryReplacement
        ? scoreReplacementProgressionSignal(
            primaryReplacement,
            input.progressionSignalMap
          )
        : 0;
      const preferredByHistory = learnedSwapScore >= 0.12;
      const preferredByMomentum = progressionSwapScore >= 0.65;

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        trainingEffects: exercise.trainingEffects ?? [],
        swapForExerciseIds,
        swapReasonTags,
        reason: buildSubstitutionReason(
          exercise,
          swapForExerciseIds,
          swapReasonTags,
          preferredByHistory,
          preferredByMomentum
        ),
        ...(preferredByHistory ? { preferredByHistory: true } : {}),
        frontendCopy: buildSubstitutionFrontendCopy(
          exercise,
          swapForExerciseIds,
          swapReasonTags,
          preferredByHistory,
          preferredByMomentum
        ),
        primaryEffect,
        learnedSwapScore,
        progressionSwapScore
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
    .sort((left, right) => {
      if ((right.learnedSwapScore ?? 0) !== (left.learnedSwapScore ?? 0)) {
        return (right.learnedSwapScore ?? 0) - (left.learnedSwapScore ?? 0);
      }

      if ((right.progressionSwapScore ?? 0) !== (left.progressionSwapScore ?? 0)) {
        return (right.progressionSwapScore ?? 0) - (left.progressionSwapScore ?? 0);
      }

      return right.swapForExerciseIds.length - left.swapForExerciseIds.length;
    })
    .map(
      ({
        primaryEffect: _primaryEffect,
        learnedSwapScore: _learnedSwapScore,
        progressionSwapScore: _progressionSwapScore,
        ...entry
      }) => entry
    )
    .slice(0, 5);
}

function scoreReplacementCandidate(
  originalExercise: ExerciseLibraryEntry,
  candidate: ExerciseLibraryEntry,
  recommendationMemory?: RecommendationMemoryLike,
  workoutType?: string,
  progressionSignalMap?: Map<string, ExerciseProgressionSignalSummary>
): number {
  return (
    scoreReplacementQuality(originalExercise, candidate) +
    resolveLearnedSwapScore(
      originalExercise.exerciseId,
      candidate.exerciseId,
      recommendationMemory,
      workoutType
    ) *
      4 +
    scoreReplacementProgressionSignal(candidate, progressionSignalMap)
  );
}

function scoreReplacementProgressionSignal(
  replacement: ExerciseLibraryEntry,
  progressionSignalMap?: Map<string, ExerciseProgressionSignalSummary>
): number {
  if (!progressionSignalMap) {
    return 0;
  }

  const signal = progressionSignalMap.get(replacement.exerciseId);

  if (!signal) {
    return 0;
  }

  if (signal.latestWasPersonalBest) {
    return 1;
  }

  if (signal.trend === "rising") {
    return 0.7;
  }

  if (signal.trend === "slipping") {
    return -0.8;
  }

  return 0;
}

function resolveLearnedSwapScore(
  originalExerciseId: string,
  candidateExerciseId: string,
  recommendationMemory?: RecommendationMemoryLike,
  workoutType?: string
): number {
  if (!recommendationMemory) {
    return 0;
  }

  const pairScore =
    recommendationMemory.bySubstitutionPairKey?.[
      `${originalExerciseId}->${candidateExerciseId}`
    ] ?? 0;
  const exerciseScore =
    recommendationMemory.bySubstitutedExerciseId?.[candidateExerciseId] ?? 0;
  const workoutTypeScore =
    workoutType
      ? recommendationMemory.bySubstitutedWorkoutTypeExerciseKey?.[
          `${workoutType}:${candidateExerciseId}`
        ] ?? 0
      : 0;

  return roundToTwoDecimals(pairScore * 0.55 + exerciseScore * 0.2 + workoutTypeScore * 0.25);
}

function buildSessionPlan(input: {
  plannedWorkoutType?: string;
  sessionDecision: SessionDecision;
  overworkedMuscles: MuscleGroup[];
  overworkedPatterns: MovementPattern[];
  recommendedExercises: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
  experienceLevel: ExperienceLevel;
  plannedDayContext?: PlannedDayReadinessContext;
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
    const isConservative = input.sessionDecision.progressionIntent === "conservative";
    const focusMuscles = pickMuscles(["quads", "calves", "glute_meds"], limitMuscles);
    const draftPlan = {
      sessionStyle:
        isConservative
          ? "conservative"
          : input.sessionDecision.status === "train_as_planned"
            ? "normal"
            : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the lower-body session, but shift the work toward lower-fatigue leg options."
          : isConservative
            ? "Run the lower-body day, but keep it easy to repeat."
            : "Run the lower-body session as planned.",
      coachNote: isConservative ? describeConservativeStructureNote() : undefined,
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
    } satisfies SessionPlan;
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(
        normalizedPlanType,
        applyPlannedTemplateToSessionPlan(
          backfillSparseSessionPlan(
            normalizedPlanType,
            draftPlan,
            input.recommendedExercises,
            input.deprioritizedExercises
          ),
          input.plannedDayContext,
          input.sessionDecision,
          allExerciseEntries
        ),
        input.experienceLevel
      ),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("push")) {
    const isConservative = input.sessionDecision.progressionIntent === "conservative";
    const focusMuscles = pickMuscles(["chest", "side_delts", "triceps"], limitMuscles);
    const draftPlan = {
      sessionStyle:
        isConservative
          ? "conservative"
          : input.sessionDecision.status === "train_as_planned"
            ? "normal"
            : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the push day, but use the least overlapping press and accessory options."
          : isConservative
            ? "Run the push day, but keep the work easy to recover from."
            : "Run the push day as planned.",
      coachNote: isConservative ? describeConservativeStructureNote() : undefined,
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
    } satisfies SessionPlan;
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(
        normalizedPlanType,
        applyPlannedTemplateToSessionPlan(
          backfillSparseSessionPlan(
            normalizedPlanType,
            draftPlan,
            input.recommendedExercises,
            input.deprioritizedExercises
          ),
          input.plannedDayContext,
          input.sessionDecision,
          allExerciseEntries
        ),
        input.experienceLevel
      ),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("posterior")) {
    const isConservative = input.sessionDecision.progressionIntent === "conservative";
    const focusMuscles = pickMuscles(
      ["glutes", "hamstrings", "spinal_erectors"],
      limitMuscles
    );
    const draftPlan = {
      sessionStyle:
        isConservative
          ? "conservative"
          : input.sessionDecision.status === "train_as_planned"
            ? "normal"
            : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the posterior-chain session, but bias it toward the least fatiguing hinge and accessory work."
          : isConservative
            ? "Run the posterior-chain day, but keep it easy to finish cleanly."
            : "Run the posterior-chain session as planned.",
      coachNote: isConservative ? describeConservativeStructureNote() : undefined,
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
    } satisfies SessionPlan;
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(
        normalizedPlanType,
        applyPlannedTemplateToSessionPlan(
          backfillSparseSessionPlan(
            normalizedPlanType,
            draftPlan,
            input.recommendedExercises,
            input.deprioritizedExercises
          ),
          input.plannedDayContext,
          input.sessionDecision,
          allExerciseEntries
        ),
        input.experienceLevel
      ),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("pull")) {
    const isConservative = input.sessionDecision.progressionIntent === "conservative";
    const focusMuscles = pickMuscles(["rear_delts", "biceps", "rhomboids"], limitMuscles);
    const draftPlan = {
      sessionStyle:
        isConservative
          ? "conservative"
          : input.sessionDecision.status === "train_as_planned"
            ? "normal"
            : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the pull day, but bias it toward the least fatiguing pulls and accessories."
          : isConservative
            ? "Run the pull day, but keep it easy to recover from."
            : "Run the pull day as planned.",
      coachNote: isConservative ? describeConservativeStructureNote() : undefined,
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
    } satisfies SessionPlan;
    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(
        normalizedPlanType,
        applyPlannedTemplateToSessionPlan(
          backfillSparseSessionPlan(
            normalizedPlanType,
            draftPlan,
            input.recommendedExercises,
            input.deprioritizedExercises
          ),
          input.plannedDayContext,
          input.sessionDecision,
          allExerciseEntries
        ),
        input.experienceLevel
      ),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("upper")) {
    const isConservative = input.sessionDecision.progressionIntent === "conservative";
    const mainUpperBodyAnchorIds = pickUpperBodyAnchorExerciseIds({
      recommendedExercises: input.recommendedExercises,
      deprioritizedExercises: input.deprioritizedExercises,
      overworkedMuscles: input.overworkedMuscles,
      plannedDayContext: input.plannedDayContext
    });
    const balancedUpperBodyAnchors =
      shouldBalanceGenericUpperBodyAnchors(input.plannedDayContext) &&
      hasMixedUpperBodyAnchors(mainUpperBodyAnchorIds);
    const focusMuscles = pickMuscles(["chest", "lats", "upper_back"], limitMuscles);
    const draftPlan = {
      sessionStyle:
        isConservative
          ? "conservative"
          : input.sessionDecision.status === "train_as_planned"
            ? "normal"
            : "modified",
      objective:
        input.sessionDecision.status === "train_modified"
          ? "Keep the upper-body day, but center it on the least overlapping push and pull anchors."
          : isConservative
            ? "Run the upper-body day, but keep it easy to repeat."
            : "Run the upper-body day as planned.",
      coachNote: isConservative ? describeConservativeStructureNote() : undefined,
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
          focus: "Start with one real upper-body anchor that still fits today",
          exampleExerciseIds: mainUpperBodyAnchorIds
        },
        {
          slot: "secondary",
          focus: "Add one complementary upper-body pattern if it stays low-cost",
          exampleExerciseIds: [
            ...(!balancedUpperBodyAnchors
              ? pickBlockExerciseIds(
                  input.recommendedExercises,
                  input.deprioritizedExercises,
                  ["horizontal_press", "vertical_pull", "horizontal_row"],
                  1,
                  input.overworkedMuscles
                )
              : []),
            ...pickBlockExerciseIds(
              input.recommendedExercises,
              input.deprioritizedExercises,
              [
                "lateral_delt_isolation",
                "rear_delt_isolation",
                "neutral_grip_curl",
                "biceps_isolation",
                "cable_pressdown",
                "triceps_isolation"
              ],
              1,
              input.overworkedMuscles
            )
          ]
        },
        {
          slot: "accessory",
          focus: "Only add small arm or delt work if the anchor work stayed clean",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.deprioritizedExercises,
            [
              "rear_delt_isolation",
              "lateral_delt_isolation",
              "neutral_grip_curl",
              "biceps_isolation",
              "cable_pressdown",
              "triceps_isolation"
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
    } satisfies SessionPlan;

    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(
        normalizedPlanType,
        applyPlannedTemplateToSessionPlan(
          backfillSparseSessionPlan(
            normalizedPlanType,
            draftPlan,
            input.recommendedExercises,
            input.deprioritizedExercises
          ),
          input.plannedDayContext,
          input.sessionDecision,
          allExerciseEntries
        ),
        input.experienceLevel
      ),
      allExerciseEntries
    );
  }

  if (normalizedPlanType.includes("full")) {
    const isConservative = input.sessionDecision.progressionIntent === "conservative";
    const focusMuscles = pickMuscles(
      isConservative ? ["quads", "chest", "lats"] : ["quads", "chest", "rear_delts"],
      limitMuscles
    );
    const draftPlan = {
      sessionStyle:
        input.sessionDecision.status === "train_as_planned" ? "normal" : "modified",
      objective:
        input.sessionDecision.status === "train_as_planned"
          ? isConservative
            ? "Run the full-body day, but keep it easy to repeat."
            : "Run the full-body day as planned."
          : isConservative
            ? "Keep the full-body day small and easy to finish."
            : "Train, but keep the full-body day selective and easy to recover from.",
      coachNote: isConservative
        ? describeConservativeCoachNote()
        : undefined,
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
          focus: isConservative
            ? "Start with one lower-body anchor that feels recoverable today"
            : "Start with the best-fitting lower-body anchor for today",
          exampleExerciseIds: pickBlockExerciseIds(
            input.recommendedExercises,
            input.deprioritizedExercises,
            isConservative
              ? ["quad_bias", "unilateral_leg", "calf_isolation", "hamstring_isolation"]
              : ["quad_bias", "squat_pattern", "unilateral_leg", "hinge_heavy"],
            1,
            input.overworkedMuscles
          )
        },
        {
          slot: "secondary",
          focus: isConservative
            ? "Add one press and one pull only if they stay clearly low-cost"
            : "Balance the day with one push and one pull that stay away from overlap",
          exampleExerciseIds: [
            ...pickBlockExerciseIds(
              input.recommendedExercises,
              input.deprioritizedExercises,
              isConservative
                ? [
                    "chest_isolation",
                    "horizontal_press",
                    "lateral_delt_isolation",
                    "side_delt_bias"
                  ]
                : ["horizontal_press", "chest_isolation", "vertical_press"],
              1,
              input.overworkedMuscles
            ),
            ...pickBlockExerciseIds(
              input.recommendedExercises,
              input.deprioritizedExercises,
              isConservative
                ? [
                    "vertical_pull",
                    "neutral_grip_curl",
                    "rear_delt_isolation",
                    "horizontal_row"
                  ]
                : ["vertical_pull", "horizontal_row", "neutral_grip_curl"],
              1,
              input.overworkedMuscles
            )
          ]
        },
        {
          slot: "accessory",
          focus: isConservative
            ? "Only add a small fourth piece if the first three felt easy"
            : "Only add a small fourth piece if the session still feels clean",
          exampleExerciseIds: pickRecommendationIdsByEffect(
            input.deprioritizedExercises,
            [
              "calf_isolation",
              "rear_delt_isolation",
              "neutral_grip_curl",
              "lateral_delt_isolation",
              "hamstring_isolation"
            ],
            1,
            {
              excludeDirectOverworkedOverlap: true,
              excludeOffPlan: true,
              allowFallback: false
            }
          )
        }
      ]
    } satisfies SessionPlan;

    return hydrateSessionPlanBlocks(
      finalizeSessionPlan(
        normalizedPlanType,
        applyPlannedTemplateToSessionPlan(
          backfillSparseSessionPlan(
            normalizedPlanType,
            draftPlan,
            input.recommendedExercises,
            input.deprioritizedExercises
          ),
          input.plannedDayContext,
          input.sessionDecision,
          allExerciseEntries
        ),
        input.experienceLevel
      ),
      allExerciseEntries
    );
  }

  const draftPlan = {
    sessionStyle:
      input.sessionDecision.progressionIntent === "conservative"
        ? "conservative"
        : input.sessionDecision.status === "train_as_planned"
          ? "normal"
          : "modified",
    objective:
      input.sessionDecision.status === "train_as_planned"
        ? input.sessionDecision.progressionIntent === "conservative"
          ? "Train, but keep the day easy to repeat."
          : "Train normally."
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
  } satisfies SessionPlan;

  return hydrateSessionPlanBlocks(
    finalizeSessionPlan(
      normalizedPlanType,
      applyPlannedTemplateToSessionPlan(
        backfillSparseSessionPlan(
          normalizedPlanType,
          draftPlan,
          input.recommendedExercises,
          input.deprioritizedExercises
        ),
        input.plannedDayContext,
        input.sessionDecision,
        allExerciseEntries
      ),
      input.experienceLevel
    ),
    allExerciseEntries
  );
}

function buildSessionDecision(input: {
  plannedWorkoutType?: string;
  overworkedMuscles: MuscleGroup[];
  overworkedPatterns: MovementPattern[];
  recommendedExercises: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
  experienceLevel: ExperienceLevel;
  comparableWorkoutReliability: ComparableWorkoutReliability;
  comparableWorkoutLeadingFatigue: ComparableWorkoutLeadingFatigue;
  plannedDayContext?: PlannedDayReadinessContext;
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
  const hasStrongAlternatives = topRecommended.length >= 2;
  const hasOverworkedSignal =
    input.overworkedMuscles.length > 0 || input.overworkedPatterns.length > 0;
  const profile = EXPERIENCE_PROFILES[input.experienceLevel];
  const progressionIntent = input.plannedDayContext?.progressionIntent;
  const plannedSessionStyle = input.plannedDayContext?.sessionTemplate?.sessionStyle;
  const mildFullBodyConstraintPressure =
    input.overworkedPatterns.length <= 1 && input.overworkedMuscles.length <= 2;
  const hasReliableComparableHistory =
    input.comparableWorkoutReliability.alignedSuccessCount >= 2 &&
    input.comparableWorkoutReliability.survivalCount === 0;
  const hasMildConstraintPressure =
    input.overworkedPatterns.length <= 1 && input.overworkedMuscles.length <= 2;
  const repeatedLeadingFatigueSignals =
    input.comparableWorkoutLeadingFatigue.flaggedSessionCount >= 2;
  const strainDominantComparableHistory =
    input.comparableWorkoutLeadingFatigue.strainedSessionCount >= 2;
  const hasStrongComparableBuffer =
    hasReliableComparableHistory &&
    (progressionIntent === "build" || plannedSessionStyle === "normal");
  const shouldApplyLeadingFatigueBrake =
    repeatedLeadingFatigueSignals &&
    !hasStrongComparableBuffer &&
    (
      strainDominantComparableHistory ||
      input.comparableWorkoutReliability.alignedSuccessCount === 0 ||
      plannedSessionStyle !== "normal"
    );

  if (!hasOverworkedSignal && shouldApplyLeadingFatigueBrake) {
    return applyProgressionIntentToDecision({
      status: "train_modified",
      summary: "Train, but keep the day cleaner than the recent fatigue trend.",
      sessionMode: `${loweredPlanType}_leading_fatigue`,
      volumeAdjustment: "reduce_10_percent",
      intensityAdjustment: "keep_submaximal",
      progressionIntent,
      notes: [
        "Recent comparable sessions showed rising set-level fatigue before full breakdown.",
        "Keep this day cleaner so the recent rest inflation and rep drop-off pattern does not keep stacking."
      ]
    });
  }

  if (!hasOverworkedSignal) {
    return applyProgressionIntentToDecision({
      status: "train_as_planned",
      summary: "Train as planned.",
      sessionMode: `${loweredPlanType}_normal`,
      volumeAdjustment: "normal",
      intensityAdjustment: "normal",
      progressionIntent,
      notes: ["No major recovery flags are standing out today."]
    });
  }

  if (
    (loweredPlanType.includes("full") || loweredPlanType.includes("upper")) &&
    input.overworkedPatterns.length === 0 &&
    hasStrongAlternatives &&
    !strainDominantComparableHistory
  ) {
    return applyProgressionIntentToDecision({
      status: "train_as_planned",
      summary: "Train as planned.",
      sessionMode: `${loweredPlanType}_normal`,
      volumeAdjustment: "normal",
      intensityAdjustment: "normal",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} still need some caution, but you have enough lower-overlap options to keep the day intact.`
      ]
    });
  }

  if (
    loweredPlanType.includes("full") &&
    mildFullBodyConstraintPressure &&
    !strainDominantComparableHistory &&
    (hasStrongAlternatives ||
      (input.experienceLevel === "beginner" && hasGoodAlternatives))
  ) {
    return applyProgressionIntentToDecision({
      status: "train_as_planned",
      summary: "Train as planned.",
      sessionMode: `${loweredPlanType}_normal`,
      volumeAdjustment: "normal",
      intensityAdjustment: "normal",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} still need some caution, but you have enough room to keep the full-body day intact.`
      ]
    });
  }

  if (
    input.experienceLevel === "intermediate" &&
    hasReliableComparableHistory &&
    !repeatedLeadingFatigueSignals &&
    hasMildConstraintPressure &&
    hasGoodAlternatives &&
    topPattern !== "hinge"
  ) {
    return applyProgressionIntentToDecision({
      status: "train_as_planned",
      summary: "Train as planned.",
      sessionMode: `${loweredPlanType}_normal`,
      volumeAdjustment: "normal",
      intensityAdjustment: "normal",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} still need some caution, but recent comparable sessions have been holding up cleanly.`,
        "Keep the day intact and let the cleaner recent pattern earn the extra tolerance."
      ]
    });
  }

  if (
    input.experienceLevel === "intermediate" &&
    (loweredPlanType.includes("push") || loweredPlanType.includes("pull")) &&
    input.overworkedPatterns.length === 0 &&
    hasStrongAlternatives &&
    !strainDominantComparableHistory
  ) {
    return applyProgressionIntentToDecision({
      status: "train_as_planned",
      summary: "Train as planned.",
      sessionMode: `${loweredPlanType}_normal`,
      volumeAdjustment: "normal",
      intensityAdjustment: "normal",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} still need some caution, but the day still has enough clean anchor work to stay intact.`
      ]
    });
  }

  if (topPattern === "hinge" && loweredPlanType.includes("lower")) {
    return applyProgressionIntentToDecision({
      status: "train_modified",
      summary: "Keep the session, but bias away from hinge-heavy work.",
      sessionMode: "lower_body_quad_bias",
      volumeAdjustment: "reduce_20_percent",
      intensityAdjustment: "keep_submaximal",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still carrying the most fatigue.`,
        "Avoid your heaviest hinge or posterior-chain movements today.",
        hasGoodAlternatives
          ? `Bias the session toward ${formatExerciseNames(topRecommended)} instead.`
          : "Bias the session toward lower-overlap exercise choices."
      ]
    });
  }

  if (loweredPlanType.includes("push") || loweredPlanType.includes("upper")) {
    return applyProgressionIntentToDecision({
      status: "train_modified",
      summary: "Keep the session, but reduce overlap with fatigued upper-body work.",
      sessionMode: loweredPlanType.includes("push")
        ? "push_reduced_overlap"
        : "upper_body_reduced_overlap",
      volumeAdjustment: "reduce_10_percent",
      intensityAdjustment: "keep_submaximal",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still the most loaded.`,
        input.experienceLevel === "intermediate"
          ? "You can usually keep the day, but trim the highest-overlap pressing and keep it submaximal."
          : "Keep pressing and direct arm work a little lighter if they are the overlap point.",
        hasGoodAlternatives
          ? `Safer options today are ${formatExerciseNames(topRecommended)}.`
          : topPushFallbacks.length > 0
            ? `Treat this as a small accessory-only push session built around ${formatExerciseNames(topPushFallbacks)}.`
            : "Lean toward lower-overlap variations today."
      ]
    });
  }

  if (loweredPlanType.includes("pull")) {
    return applyProgressionIntentToDecision({
      status: "train_modified",
      summary: "Keep the session, but reduce overlap with the most fatigued pull work.",
      sessionMode: "pull_reduced_overlap",
      volumeAdjustment: "reduce_10_percent",
      intensityAdjustment: "keep_submaximal",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still carrying fatigue.`,
        input.experienceLevel === "intermediate"
          ? "You can usually keep the day, but trim the heaviest rows or pulls and stay a little shy of failure."
          : "Keep the heaviest rows or pulls lighter if they hit the same pattern hard.",
        hasGoodAlternatives
          ? `Safer options today are ${formatExerciseNames(topRecommended)}.`
          : topPullFallbacks.length > 0
            ? `Treat this as a small accessory-only pull session built around ${formatExerciseNames(topPullFallbacks)}.`
            : "Lean toward lighter pull variations today."
      ]
    });
  }

  if (
    !hasGoodAlternatives &&
    input.deprioritizedExercises.length === 0 &&
    input.experienceLevel !== "intermediate"
  ) {
    return applyProgressionIntentToDecision({
      status: "train_light",
      summary: "Train lightly and keep the session simple.",
      sessionMode: `${loweredPlanType}_light`,
      volumeAdjustment: "reduce_30_percent",
      intensityAdjustment: "reduce_intensity",
      progressionIntent,
      notes: [
        `${formatMuscleNames(topOverworkedMuscles)} are still carrying meaningful fatigue.`,
        "Keep the session short, simple, and well away from failure."
      ]
    });
  }

  return applyProgressionIntentToDecision({
    status: "train_modified",
    summary: "Train, but make the session slightly easier to recover from.",
    sessionMode: `${loweredPlanType}_modified`,
    volumeAdjustment: input.experienceLevel === "intermediate" ? "normal" : "reduce_10_percent",
    intensityAdjustment: "keep_submaximal",
    progressionIntent,
    notes: [
      `${formatMuscleNames(topOverworkedMuscles)} are still the main recovery watch-points.`,
      hasGoodAlternatives
        ? `Safer options today are ${formatExerciseNames(topRecommended)}.`
        : "Use lower-overlap exercise choices today."
    ]
  });
}

interface ComparableWorkoutReliability {
  comparableCount: number;
  alignedSuccessCount: number;
  survivalCount: number;
}

interface ComparableWorkoutLeadingFatigue {
  comparableCount: number;
  setLevelDataCount: number;
  flaggedSessionCount: number;
  strainedSessionCount: number;
}

function summarizeComparableWorkoutReliability(
  workouts: WorkoutRecord[],
  plannedWorkoutType: string | undefined,
  asOf: string
): ComparableWorkoutReliability {
  if (!plannedWorkoutType) {
    return {
      comparableCount: 0,
      alignedSuccessCount: 0,
      survivalCount: 0
    };
  }

  const comparableWorkouts = workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        workout.type === plannedWorkoutType &&
        workout.date < asOf &&
        diffInHours(asOf, workout.date) <= DAY_IN_HOURS * 21
    )
    .slice(-3);

  const summary = comparableWorkouts.reduce<Omit<ComparableWorkoutReliability, "comparableCount">>(
    (summary, workout) => {
      const outcomeSummary = workout.outcomeSummary;

      if (!outcomeSummary) {
        return summary;
      }

      if (
        (outcomeSummary.followedPlannedWorkout ||
          outcomeSummary.followedSuggestedWorkoutType) &&
        outcomeSummary.executionQuality !== "survival"
      ) {
        summary.alignedSuccessCount += 1;
      }

      if (outcomeSummary.executionQuality === "survival") {
        summary.survivalCount += 1;
      }

      return summary;
    },
    {
      alignedSuccessCount: 0,
      survivalCount: 0
    }
  );

  return {
    comparableCount: comparableWorkouts.length,
    ...summary
  };
}

function summarizeComparableWorkoutLeadingFatigue(
  workouts: WorkoutRecord[],
  plannedWorkoutType: string | undefined,
  asOf: string
): ComparableWorkoutLeadingFatigue {
  if (!plannedWorkoutType) {
    return {
      comparableCount: 0,
      setLevelDataCount: 0,
      flaggedSessionCount: 0,
      strainedSessionCount: 0
    };
  }

  const comparableWorkouts = workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        workout.type === plannedWorkoutType &&
        workout.date < asOf &&
        diffInHours(asOf, workout.date) <= DAY_IN_HOURS * 21
    )
    .slice(-3);

  const summary = comparableWorkouts.reduce<
    Omit<ComparableWorkoutLeadingFatigue, "comparableCount" | "setLevelDataCount">
  >(
    (summary, workout) => {
      const outcomeSummary = workout.outcomeSummary;

      if (!outcomeSummary) {
        return summary;
      }

      const hasEffortRise =
        outcomeSummary.setEffortTrend === "rising" ||
        outcomeSummary.setEffortTrend === "sharp_rise";
      const hasRestInflation = (outcomeSummary.restInflationRatio ?? 0) >= 1.18;
      const hasRepDropoff = (outcomeSummary.repDropoffPercent ?? 0) >= 16;
      const markerCount =
        Number(hasEffortRise) + Number(hasRestInflation) + Number(hasRepDropoff);

      if (markerCount > 0) {
        summary.flaggedSessionCount += 1;
      }

      if (
        markerCount >= 2 ||
        outcomeSummary.setEffortTrend === "sharp_rise" ||
        ((outcomeSummary.restInflationRatio ?? 0) >= 1.25 &&
          (outcomeSummary.repDropoffPercent ?? 0) >= 18)
      ) {
        summary.strainedSessionCount += 1;
      }

      return summary;
    },
    {
      flaggedSessionCount: 0,
      strainedSessionCount: 0
    }
  );

  return {
    comparableCount: comparableWorkouts.length,
    setLevelDataCount: comparableWorkouts.filter(hasSetLevelComparableData).length,
    ...summary
  };
}

function hasSetLevelComparableData(workout: WorkoutRecord): boolean {
  const outcomeSummary = workout.outcomeSummary;

  if (!outcomeSummary) {
    return false;
  }

  return Boolean(
    (outcomeSummary.totalLoggedSets ?? 0) > 0 ||
      outcomeSummary.averageRestSeconds !== undefined ||
      outcomeSummary.restInflationRatio !== undefined ||
      outcomeSummary.repDropoffPercent !== undefined ||
      outcomeSummary.setEffortTrend !== undefined
  );
}

function buildObjectiveReadinessModel(input: {
  muscleLoadSummary: MuscleLoadSummaryEntry[];
  movementPatternSummary: MovementPatternSummaryEntry[];
  comparableWorkoutReliability: ComparableWorkoutReliability;
  comparableWorkoutLeadingFatigue: ComparableWorkoutLeadingFatigue;
  completedSessionCount: number;
  plannedWorkoutType?: string;
  sessionDecision: SessionDecision;
  sessionPlan: SessionPlan;
  plannedDayContext?: PlannedDayReadinessContext;
}): ObjectiveReadinessModel {
  const recovery = scoreRecoveryReadiness(
    input.muscleLoadSummary,
    input.movementPatternSummary
  );
  const comparableHistory = scoreComparableHistoryReadiness(
    input.comparableWorkoutReliability
  );
  const leadingFatigue = scoreLeadingFatigueReadiness(
    input.comparableWorkoutLeadingFatigue
  );
  const sessionDemand = scoreSessionDemandReadiness(input.plannedDayContext);
  const weightedScore = roundToTwoDecimals(
    recovery * 0.5 +
      comparableHistory * 0.15 +
      leadingFatigue * 0.25 +
      sessionDemand * 0.1
  );
  const score = applySessionDecisionReadinessCap(
    weightedScore,
    input.sessionDecision,
    input.sessionPlan
  );
  const dataConfidenceScore = scoreReadinessDataConfidence({
    completedSessionCount: input.completedSessionCount,
    plannedWorkoutType: input.plannedWorkoutType,
    comparableWorkoutReliability: input.comparableWorkoutReliability,
    comparableWorkoutLeadingFatigue: input.comparableWorkoutLeadingFatigue
  });

  return {
    source: "objective_signals_only",
    score,
    band: toReadinessBand(score),
    dataConfidence: toReadinessDataConfidence(dataConfidenceScore),
    dataConfidenceScore,
    summary: buildReadinessSummary(score, input.sessionDecision, input.sessionPlan),
    signalScores: {
      recovery,
      comparableHistory,
      leadingFatigue,
      sessionDemand
    },
    reasons: buildReadinessReasons({
      muscleLoadSummary: input.muscleLoadSummary,
      movementPatternSummary: input.movementPatternSummary,
      comparableWorkoutReliability: input.comparableWorkoutReliability,
      comparableWorkoutLeadingFatigue: input.comparableWorkoutLeadingFatigue,
      sessionDecision: input.sessionDecision,
      plannedDayContext: input.plannedDayContext,
      dataConfidenceScore
    })
  };
}

function scoreRecoveryReadiness(
  muscleLoadSummary: MuscleLoadSummaryEntry[],
  movementPatternSummary: MovementPatternSummaryEntry[]
): number {
  const topMuscles = muscleLoadSummary.slice(0, 4);
  const topPatterns = movementPatternSummary.slice(0, 2);
  const musclePenalty = topMuscles.reduce((sum, entry) => {
    const stateMultiplier =
      entry.recoveryState === "overworked"
        ? 1.1
        : entry.recoveryState === "recovering"
          ? 0.45
          : 0.12;
    return sum + entry.unresolvedLoad * stateMultiplier + entry.riskScore * 0.18;
  }, 0);
  const patternPenalty = topPatterns.reduce((sum, entry) => {
    const stateMultiplier =
      entry.recoveryState === "overworked"
        ? 1.1
        : entry.recoveryState === "recovering"
          ? 0.45
          : 0.12;
    return sum + entry.unresolvedLoad * stateMultiplier;
  }, 0);
  const overworkedMuscleCount = topMuscles.filter(
    (entry) => entry.recoveryState === "overworked"
  ).length;
  const recoveringMuscleCount = topMuscles.filter(
    (entry) => entry.recoveryState === "recovering"
  ).length;
  const overworkedPatternCount = topPatterns.filter(
    (entry) => entry.recoveryState === "overworked"
  ).length;

  return roundToTwoDecimals(
    clamp(
      100 -
        musclePenalty * 1.55 -
        patternPenalty * 1.35 -
        overworkedMuscleCount * 12 -
        recoveringMuscleCount * 4 -
        overworkedPatternCount * 10,
      18,
      100
    )
  );
}

function scoreComparableHistoryReadiness(
  comparableWorkoutReliability: ComparableWorkoutReliability
): number {
  if (comparableWorkoutReliability.comparableCount === 0) {
    return 62;
  }

  return roundToTwoDecimals(
    clamp(
      55 +
        comparableWorkoutReliability.alignedSuccessCount * 18 -
        comparableWorkoutReliability.survivalCount * 20,
      20,
      100
    )
  );
}

function scoreLeadingFatigueReadiness(
  comparableWorkoutLeadingFatigue: ComparableWorkoutLeadingFatigue
): number {
  if (comparableWorkoutLeadingFatigue.comparableCount === 0) {
    return 68;
  }

  const missingSetLevelDataCount =
    comparableWorkoutLeadingFatigue.comparableCount -
    comparableWorkoutLeadingFatigue.setLevelDataCount;

  return roundToTwoDecimals(
    clamp(
      92 -
        comparableWorkoutLeadingFatigue.flaggedSessionCount * 18 -
        comparableWorkoutLeadingFatigue.strainedSessionCount * 24 -
        Math.max(missingSetLevelDataCount, 0) * 4,
      18,
      100
    )
  );
}

function scoreSessionDemandReadiness(
  plannedDayContext: PlannedDayReadinessContext | undefined
): number {
  let score = isTemplateBackedDay(plannedDayContext) ? 74 : 70;

  if (plannedDayContext?.progressionIntent === "build") {
    score -= 18;
  } else if (plannedDayContext?.progressionIntent === "repeat") {
    score -= 4;
  } else if (plannedDayContext?.progressionIntent === "conservative") {
    score += 8;
  }

  if (plannedDayContext?.sessionTemplate?.sessionStyle === "build") {
    score -= 6;
  } else if (plannedDayContext?.sessionTemplate?.sessionStyle === "conservative") {
    score += 6;
  }

  return roundToTwoDecimals(clamp(score, 42, 90));
}

function isTemplateBackedDay(
  plannedDayContext: PlannedDayReadinessContext | undefined
): boolean {
  if (plannedDayContext?.dayOrigin) {
    return plannedDayContext.dayOrigin !== "unplanned";
  }

  return Boolean(plannedDayContext?.isPlannedDay);
}

function isSuggestedDay(
  plannedDayContext: PlannedDayReadinessContext | undefined
): boolean {
  if (plannedDayContext?.dayOrigin) {
    return plannedDayContext.dayOrigin === "suggested";
  }

  return Boolean(plannedDayContext?.isSuggestedDay);
}

function applySessionDecisionReadinessCap(
  score: number,
  sessionDecision: SessionDecision,
  sessionPlan: SessionPlan
): number {
  let cappedScore = score;

  if (sessionPlan.sessionStyle === "accessory_only") {
    cappedScore = Math.min(cappedScore, 32);
  } else if (sessionDecision.status === "train_light") {
    cappedScore = Math.min(cappedScore, 45);
  } else if (
    sessionDecision.status === "train_modified" ||
    sessionPlan.sessionStyle === "modified"
  ) {
    cappedScore = Math.min(cappedScore, 68);
  } else if (sessionPlan.sessionStyle === "conservative") {
    cappedScore = Math.min(cappedScore, 80);
  }

  return roundToTwoDecimals(clamp(cappedScore, 18, 100));
}

function scoreReadinessDataConfidence(input: {
  completedSessionCount: number;
  plannedWorkoutType?: string;
  comparableWorkoutReliability: ComparableWorkoutReliability;
  comparableWorkoutLeadingFatigue: ComparableWorkoutLeadingFatigue;
}): number {
  const score =
    22 +
    Math.min(input.completedSessionCount, 6) * 6 +
    Math.min(input.comparableWorkoutReliability.comparableCount, 3) * 11 +
    Math.min(input.comparableWorkoutLeadingFatigue.setLevelDataCount, 3) * 9 +
    (input.plannedWorkoutType ? 6 : 0);

  return roundToTwoDecimals(clamp(score, 18, 95));
}

function toReadinessBand(score: number): ObjectiveReadinessModel["band"] {
  if (score >= 75) {
    return "high";
  }

  if (score >= 50) {
    return "moderate";
  }

  return "low";
}

function toReadinessDataConfidence(
  score: number
): ObjectiveReadinessModel["dataConfidence"] {
  if (score >= 70) {
    return "high";
  }

  if (score >= 45) {
    return "medium";
  }

  return "low";
}

function buildReadinessSummary(
  score: number,
  sessionDecision: SessionDecision,
  sessionPlan: SessionPlan
): string {
  if (score >= 75 && sessionDecision.status === "train_as_planned") {
    return "Objective signals support the planned session today.";
  }

  if (score >= 50) {
    if (sessionPlan.sessionStyle === "conservative") {
      return "Objective signals support training, but the day should stay conservative.";
    }

    return "Objective signals support training, but not the highest-pressure version of the day.";
  }

  return "Objective signals say keep today limited and easy to recover from.";
}

function buildReadinessReasons(input: {
  muscleLoadSummary: MuscleLoadSummaryEntry[];
  movementPatternSummary: MovementPatternSummaryEntry[];
  comparableWorkoutReliability: ComparableWorkoutReliability;
  comparableWorkoutLeadingFatigue: ComparableWorkoutLeadingFatigue;
  sessionDecision: SessionDecision;
  plannedDayContext?: PlannedDayReadinessContext;
  dataConfidenceScore: number;
}): string[] {
  const reasons: string[] = [];
  const topMuscle = input.muscleLoadSummary[0];
  const topPattern = input.movementPatternSummary[0];

  if (
    topMuscle &&
    topMuscle.recoveryState !== "recovered" &&
    (topMuscle.recoveryState === "overworked" || topMuscle.riskScore >= 10)
  ) {
    reasons.push(
      `${topMuscle.muscle.replaceAll("_", " ")} is still the biggest recovery limiter today.`
    );
  } else if (topPattern?.recoveryState === "overworked") {
    reasons.push(
      `${topPattern.movementPattern.replaceAll("_", " ")} is still the heaviest overlap pattern today.`
    );
  }

  if (
    input.comparableWorkoutReliability.comparableCount >= 2 &&
    input.comparableWorkoutReliability.alignedSuccessCount >= 2 &&
    input.comparableWorkoutReliability.survivalCount === 0
  ) {
    reasons.push("Recent comparable sessions have been holding up cleanly.");
  } else if (input.comparableWorkoutReliability.survivalCount >= 1) {
    reasons.push("Recent comparable sessions have been trending too close to survival mode.");
  }

  if (input.comparableWorkoutLeadingFatigue.strainedSessionCount >= 1) {
    reasons.push("Recent comparable sessions showed repeated set-level fatigue before breakdown.");
  } else if (input.comparableWorkoutLeadingFatigue.flaggedSessionCount >= 2) {
    reasons.push("Recent comparable sessions showed early fatigue markers that are worth respecting.");
  }

  if (input.plannedDayContext?.progressionIntent === "build") {
    reasons.push("Today is one of the higher-pressure progression days in the week.");
  }

  if (input.dataConfidenceScore < 45) {
    reasons.push("This score is leaning more on current recovery than on deep comparable history.");
  }

  if (!reasons.length) {
    reasons.push(input.sessionDecision.notes[0] ?? "No major recovery flags are standing out today.");
  }

  return reasons.slice(0, 3).map(capitalize);
}

function calculateExerciseLoadProfile(
  sessionExercise: WorkoutExerciseEntry,
  exercise: ExerciseLibraryEntry
): ExerciseLoadProfile {
  const setAwareProfile = calculatePerformedSetLoadProfile(sessionExercise, exercise);

  if (setAwareProfile) {
    return setAwareProfile;
  }

  return {
    baseLoad: calculateEstimatedExerciseLoad(sessionExercise, exercise),
    recoveryTimeHours: exercise.recoveryTimeHours
  };
}

function calculateEstimatedExerciseLoad(
  sessionExercise: WorkoutExerciseEntry,
  exercise: ExerciseLibraryEntry
): number {
  const effortMultiplier = resolveEffortMultiplier(sessionExercise.effort);
  const repFactor = sessionExercise.reps / 10;
  return roundToTwoDecimals(
    sessionExercise.sets * repFactor * exercise.fatigueScore * effortMultiplier
  );
}

function calculatePerformedSetLoadProfile(
  sessionExercise: WorkoutExerciseEntry,
  exercise: ExerciseLibraryEntry
): ExerciseLoadProfile | undefined {
  const performedSets = sessionExercise.performedSets ?? [];

  if (!performedSets.length) {
    return undefined;
  }

  const targetReps = Math.max(sessionExercise.reps, 1);
  const plannedSetCount = Math.max(sessionExercise.sets, 1);
  const defaultRestMidpoint = getDefaultRestMidpoint(exercise);
  const completedSetReps: number[] = [];
  let setLoadTotal = 0;
  let completedSetCount = 0;
  let hardSetCount = 0;
  let restInflationTotal = 0;
  let restInflationCount = 0;

  for (const set of performedSets) {
    const setLoad = calculatePerformedSetLoad(
      set,
      exercise,
      targetReps,
      sessionExercise.effort
    );
    setLoadTotal += setLoad;

    const resolvedEffort = set.effort ?? sessionExercise.effort;
    if (resolvedEffort === "hard") {
      hardSetCount += 1;
    }

    if (set.completed !== false) {
      completedSetCount += 1;
      completedSetReps.push(Math.max(set.reps, 0));

      if (typeof set.restSeconds === "number" && defaultRestMidpoint > 0) {
        restInflationTotal += set.restSeconds / defaultRestMidpoint;
        restInflationCount += 1;
      }
    }
  }

  if (setLoadTotal <= 0) {
    return undefined;
  }

  const repDropoffPercent =
    completedSetReps.length >= 2 && completedSetReps[0] > 0
      ? Math.max(
          0,
          ((completedSetReps[0] - completedSetReps[completedSetReps.length - 1]) /
            completedSetReps[0]) *
            100
        )
      : 0;
  const averageRestInflation =
    restInflationCount > 0 ? restInflationTotal / restInflationCount : 1;
  const completedSetRatio = completedSetCount / plannedSetCount;
  const hardSetShare = hardSetCount / Math.max(performedSets.length, 1);
  const recoveryTimeMultiplier = clamp(
    1 +
      Math.max(0, completedSetRatio - 1) * 0.12 -
      Math.max(0, 1 - completedSetRatio) * 0.18 +
      Math.max(0, repDropoffPercent - 10) / 100 * 0.45 +
      Math.max(0, averageRestInflation - 1) * 0.35 +
      hardSetShare * 0.08,
    0.78,
    1.35
  );

  return {
    baseLoad: roundToTwoDecimals(setLoadTotal * exercise.fatigueScore),
    recoveryTimeHours: Math.max(
      12,
      Math.round(exercise.recoveryTimeHours * recoveryTimeMultiplier)
    )
  };
}

function calculatePerformedSetLoad(
  set: ExerciseSetEntry,
  exercise: ExerciseLibraryEntry,
  targetReps: number,
  fallbackEffort: WorkoutExerciseEntry["effort"]
): number {
  const completed = set.completed !== false;
  const resolvedReps = Math.max(
    typeof set.reps === "number" ? set.reps : targetReps,
    completed ? 1 : Math.round(targetReps * 0.5)
  );
  const repFactor = clamp(resolvedReps / targetReps, 0.35, 1.35);
  const completionMultiplier = completed ? 1 : 0.45;
  const weightMultiplier = resolveSetWeightMultiplier(set, exercise);

  return (
    repFactor *
    resolveEffortMultiplier(set.effort ?? fallbackEffort) *
    completionMultiplier *
    weightMultiplier
  );
}

function resolveSetWeightMultiplier(
  set: ExerciseSetEntry,
  exercise: ExerciseLibraryEntry
): number {
  if (typeof set.weightKg !== "number" || set.weightKg <= 0) {
    return 1;
  }

  const referenceWeightKg = getReferenceSetWeightKg(exercise);
  if (!referenceWeightKg || referenceWeightKg <= 0) {
    return 1;
  }

  const ratio = Math.max(set.weightKg / referenceWeightKg, 0.1);
  return clamp(0.6 + Math.sqrt(ratio) * 0.4, 0.78, 1.3);
}

function getReferenceSetWeightKg(exercise: ExerciseLibraryEntry): number | undefined {
  if (exercise.equipmentType === "bodyweight") {
    return undefined;
  }

  if (exercise.liftType === "compound") {
    switch (exercise.equipmentType) {
      case "barbell":
        return 60;
      case "machine":
        return 50;
      case "dumbbell":
        return 24;
      case "cable":
        return 18;
      default:
        return undefined;
    }
  }

  switch (exercise.equipmentType) {
    case "barbell":
      return 30;
    case "machine":
      return 25;
    case "dumbbell":
      return 12;
    case "cable":
      return 10;
    default:
      return undefined;
  }
}

function resolveEffortMultiplier(effort?: WorkoutExerciseEntry["effort"]): number {
  if (effort === "hard") {
    return 1.15;
  }

  if (effort === "easy") {
    return 0.85;
  }

  return 1;
}

function getDefaultRestMidpoint(exercise: ExerciseLibraryEntry): number {
  return (
    exercise.prescriptionDefaults.restSeconds[0] +
    exercise.prescriptionDefaults.restSeconds[1]
  ) / 2;
}

function applyProgressionIntentToDecision(input: SessionDecision): SessionDecision {
  if (!input.progressionIntent || input.progressionIntent === "repeat") {
    return input;
  }

  if (input.progressionIntent === "build") {
    if (input.status !== "train_as_planned") {
      return {
        ...input,
        notes: [...input.notes, "If the day feels better than expected, build only through exercise quality, not extra fatigue."]
      };
    }

    return {
      ...input,
      sessionMode: input.sessionMode.replace(/_normal$/, "_build"),
      notes: [...input.notes, "This is the best day in the week to push a little if readiness stays clean."]
    };
  }

  if (input.status === "train_as_planned") {
    return {
      ...input,
      summary: describeConservativeSessionHeadline(),
      sessionMode: input.sessionMode.replace(/_normal$/, "_conservative"),
      volumeAdjustment:
        input.volumeAdjustment === "normal" ? "reduce_10_percent" : input.volumeAdjustment,
      intensityAdjustment:
        input.intensityAdjustment === "normal"
          ? "keep_submaximal"
          : input.intensityAdjustment,
      notes: [describeConservativeDayNote(), ...input.notes]
    };
  }

  return {
    ...input,
    volumeAdjustment:
      input.volumeAdjustment === "normal"
        ? "reduce_10_percent"
        : input.volumeAdjustment === "reduce_10_percent"
          ? "reduce_20_percent"
          : input.volumeAdjustment,
    intensityAdjustment:
      input.intensityAdjustment === "normal"
        ? "keep_submaximal"
        : input.intensityAdjustment,
    notes: [describeConservativeDayNote(), ...input.notes]
  };
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
  unresolvedLoad: number,
  hoursSinceSession: number,
  recoveryTimeHours: number
): void {
  const current = map.get(movementPattern) ?? {
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
  map.set(movementPattern, current);
}

function toMuscleSummary(
  muscle: MuscleGroup,
  accumulator: MuscleAccumulator,
  experienceProfile: (typeof EXPERIENCE_PROFILES)[ExperienceLevel]
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
      hoursUntilRecovered,
      accumulator.maxRecoveryTimeHours,
      accumulator.totalLoad,
      experienceProfile
    ),
    riskScore
  };
}

function toPatternSummary(
  movementPattern: MovementPattern,
  accumulator: PatternAccumulator,
  experienceProfile: (typeof EXPERIENCE_PROFILES)[ExperienceLevel]
): MovementPatternSummaryEntry {
  const hoursSinceLastWorked =
    accumulator.minHoursSinceLastWorked === NO_HISTORY_HOURS
      ? undefined
      : accumulator.minHoursSinceLastWorked;
  const hoursUntilRecovered = Math.max(
    accumulator.maxRecoveryTimeHours - (hoursSinceLastWorked ?? 0),
    0
  );
  const riskScore = accumulator.unresolvedLoad * 0.9 + accumulator.totalLoad * 0.2;
  return {
    movementPattern,
    totalLoad: roundToTwoDecimals(accumulator.totalLoad),
    unresolvedLoad: roundToTwoDecimals(accumulator.unresolvedLoad),
    recoveryState: determineRecoveryState(
      accumulator.unresolvedLoad,
      riskScore,
      hoursUntilRecovered,
      accumulator.maxRecoveryTimeHours,
      accumulator.totalLoad,
      experienceProfile
    )
  };
}

function determineRecoveryState(
  unresolvedLoad: number,
  riskScore: number,
  hoursUntilRecovered: number,
  recoveryTimeHours: number,
  totalLoad: number,
  experienceProfile: (typeof EXPERIENCE_PROFILES)[ExperienceLevel]
): RecoveryState {
  if (unresolvedLoad <= 0.05 || hoursUntilRecovered <= 0) {
    return "recovered";
  }

  const unresolvedRatio = totalLoad > 0 ? unresolvedLoad / totalLoad : 0;
  const recoveryWindowRatio =
    recoveryTimeHours > 0 ? hoursUntilRecovered / recoveryTimeHours : 0;
  const clearlyRecovered =
    unresolvedLoad <= experienceProfile.recoveryState.recoveringUnresolvedLoad * 0.45 &&
    riskScore <= experienceProfile.recoveryState.recoveringRiskScore * 0.55 &&
    (hoursUntilRecovered <= 12 ||
      recoveryWindowRatio <= 0.35 ||
      unresolvedRatio <= 0.18);
  const meaningfulResidualFatigue =
    unresolvedLoad >= experienceProfile.recoveryState.recoveringUnresolvedLoad * 0.7 ||
    riskScore >= experienceProfile.recoveryState.recoveringRiskScore * 0.8 ||
    (hoursUntilRecovered >= 24 && unresolvedRatio >= 0.24) ||
    (recoveryWindowRatio >= 0.45 && unresolvedRatio >= 0.2);
  const sustainedHighRecoveryDemand =
    hoursUntilRecovered >= 36 &&
    ((unresolvedLoad >= experienceProfile.recoveryState.longRecoveryUnresolvedLoad &&
      recoveryWindowRatio >= 0.5) ||
      (riskScore >= experienceProfile.recoveryState.longRecoveryRiskScore &&
        unresolvedRatio >= 0.45) ||
      (unresolvedLoad >=
        experienceProfile.recoveryState.recoveringUnresolvedLoad * 2 &&
        unresolvedRatio >= 0.68 &&
        recoveryWindowRatio >= 0.65));

  if (
    unresolvedLoad >= experienceProfile.recoveryState.overworkedUnresolvedLoad ||
    riskScore >= experienceProfile.recoveryState.overworkedRiskScore
  ) {
    return "overworked";
  }

  if (sustainedHighRecoveryDemand) {
    return "overworked";
  }

  if (clearlyRecovered) {
    return "recovered";
  }

  if (
    unresolvedLoad >= experienceProfile.recoveryState.recoveringUnresolvedLoad ||
    riskScore >= experienceProfile.recoveryState.recoveringRiskScore ||
    meaningfulResidualFatigue
  ) {
    return "recovering";
  }

  return "recovered";
}

function buildExerciseRecommendations(
  muscleLoadSummary: MuscleLoadSummaryEntry[],
  movementPatternSummary: MovementPatternSummaryEntry[],
  plannedWorkoutType?: string,
  recommendationMemory?: RecommendationMemoryLike,
  profileContext?: ReadinessProfileContext,
  plannedDayContext?: PlannedDayReadinessContext,
  progressionSignalMap?: Map<string, ExerciseProgressionSignalSummary>,
  confidenceContext?: {
    dataConfidenceScore: number;
  }
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
      let recoveryPenaltyApplied = false;
      const hardConstraintReason = resolveHardConstraintReason(
        exercise,
        plannedWorkoutType,
        profileContext
      );

      if (hardConstraintReason) {
        return {
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          bucket: "avoid",
          tolerance: "red",
          score: 999,
          reasons: [hardConstraintReason]
        } satisfies ExerciseRecommendation;
      }

      for (const muscle of exercise.primaryMuscles) {
        const summary = muscleMap.get(muscle);
        if (!summary) continue;
        const penalty = getMusclePenalty(summary, "primary");
        score += penalty;
        recoveryPenaltyApplied ||= penalty > 0;
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
        const penalty = getMusclePenalty(summary, "secondary");
        score += penalty;
        recoveryPenaltyApplied ||= penalty > 0;
      }

      for (const muscle of exercise.stabilizers) {
        const summary = muscleMap.get(muscle);
        if (!summary) continue;
        const penalty = getMusclePenalty(summary, "stabilizer");
        score += penalty;
        recoveryPenaltyApplied ||= penalty > 0;
      }

      const patternSummary = patternMap.get(exercise.movementPattern);
      if (patternSummary?.recoveryState === "overworked") {
        score += 4;
        recoveryPenaltyApplied = true;
        reasons.push(`${exercise.movementPattern} pattern is still overworked`);
      } else if (patternSummary?.recoveryState === "recovering") {
        score += 0.75;
        recoveryPenaltyApplied = true;
      }

      const planFit = scoreExercisePlanFit(exercise, plannedWorkoutType);
      score += planFit.scoreAdjustment;
      reasons.push(...planFit.reasons);
      const templateFitScore = scoreSuggestedDayTemplateFit(
        exercise,
        plannedDayContext,
        reasons
      );
      score -= templateFitScore;

      const memoryNudge = scoreRecommendationMemory(
        recommendationMemory,
        exercise.exerciseId,
        reasons,
        plannedDayContext
      );
      score -= memoryNudge;
      const profilePreferenceScore = scoreProfilePreference(exercise, profileContext);
      score -= profilePreferenceScore;
      score -= scoreExerciseProgressionSignal(
        exercise,
        progressionSignalMap,
        reasons,
        plannedDayContext
      );
      const lowConfidenceDefaultScore = scoreLowConfidenceRepeatableDefault(
        exercise,
        plannedWorkoutType,
        profileContext,
        plannedDayContext,
        confidenceContext
      );
      score -= lowConfidenceDefaultScore;
      if (lowConfidenceDefaultScore >= 0.6) {
        reasons.push("Matches a sensible repeatable default while history is still thin.");
      }

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
      const provenance = buildExerciseRecommendationProvenance(
        exercise,
        plannedDayContext,
        {
          templateFitApplied: templateFitScore > 0,
          recoveryPenaltyApplied,
          memoryNudgeApplied: Math.abs(memoryNudge) > 0,
          painConstraintApplied: didPainConstraintAffectExercise(exercise, profileContext),
          equipmentConstraintApplied: didEquipmentConstraintAffectExercise(
            exercise,
            profileContext
          )
        }
      );

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        bucket,
        tolerance,
        fallbackTier,
        score: roundToTwoDecimals(score),
        reasons,
        provenance
      } satisfies ExerciseRecommendation;
    })
    .sort((a, b) => a.score - b.score);
}

function buildExerciseRecommendationProvenance(
  exercise: ExerciseLibraryEntry,
  plannedDayContext: PlannedDayReadinessContext | undefined,
  flags: {
    templateFitApplied: boolean;
    recoveryPenaltyApplied: boolean;
    equipmentConstraintApplied: boolean;
    painConstraintApplied: boolean;
    memoryNudgeApplied: boolean;
  }
): ExerciseRecommendationProvenance {
  return {
    selectionSource: resolveExerciseSelectionSource(exercise.exerciseId, plannedDayContext),
    templateFitApplied: flags.templateFitApplied,
    recoveryPenaltyApplied: flags.recoveryPenaltyApplied,
    equipmentConstraintApplied: flags.equipmentConstraintApplied,
    painConstraintApplied: flags.painConstraintApplied,
    memoryNudgeApplied: flags.memoryNudgeApplied
  };
}

function resolveExerciseSelectionSource(
  exerciseId: string,
  plannedDayContext: PlannedDayReadinessContext | undefined
): ExerciseSelectionSource {
  const matchingSlot = plannedDayContext?.sessionTemplate?.slots.find((slot) =>
    slot.candidateExerciseIds.includes(exerciseId)
  );

  if (!matchingSlot) {
    return "generic_fallback";
  }

  return matchingSlot.candidateExerciseIds[0] === exerciseId
    ? "template_primary"
    : "template_candidate";
}

function didEquipmentConstraintAffectExercise(
  exercise: ExerciseLibraryEntry,
  profileContext: ReadinessProfileContext | undefined
): boolean {
  return Boolean(resolveEquipmentConstraintReason(exercise, profileContext));
}

function didPainConstraintAffectExercise(
  exercise: ExerciseLibraryEntry,
  profileContext: ReadinessProfileContext | undefined
): boolean {
  const painFlags = new Set(profileContext?.painFlags ?? []);
  const painFlagOverlap = [
    ...exercise.primaryMuscles,
    ...exercise.secondaryMuscles,
    ...exercise.stabilizers
  ].some((muscle) => painFlags.has(muscle));
  const painHardConstraint = profileContext?.hardConstraints?.some((constraint) => {
    if (constraint.source !== "pain") {
      return false;
    }

    if (constraint.kind === "avoid_exercise") {
      return constraint.value === exercise.exerciseId;
    }

    if (constraint.kind === "avoid_muscle") {
      return [
        ...exercise.primaryMuscles,
        ...exercise.secondaryMuscles,
        ...exercise.stabilizers
      ].includes(constraint.value as MuscleGroup);
    }

    return false;
  });

  return painFlagOverlap || Boolean(painHardConstraint);
}

function scoreLowConfidenceRepeatableDefault(
  exercise: ExerciseLibraryEntry,
  plannedWorkoutType: string | undefined,
  profileContext: ReadinessProfileContext | undefined,
  plannedDayContext: PlannedDayReadinessContext | undefined,
  confidenceContext: {
    dataConfidenceScore: number;
  } | undefined
): number {
  if (!confidenceContext || confidenceContext.dataConfidenceScore >= 45) {
    return 0;
  }

  let score = 0;
  const normalizedPlanType = plannedWorkoutType?.toLowerCase() ?? "";
  const isTemplateLightUpperBodyDay =
    normalizedPlanType.includes("upper") &&
    !plannedDayContext?.sessionTemplate &&
    !isSuggestedDay(plannedDayContext);
  const isUpperConstraintSofteningDay =
    isTemplateLightUpperBodyDay ||
    normalizedPlanType.includes("push") ||
    normalizedPlanType.includes("pull");
  const hasConstraintPressure =
    Boolean(
      profileContext?.equipmentAccess &&
        profileContext.equipmentAccess !== "full_gym"
    ) ||
    Boolean(profileContext?.painFlags?.length) ||
    Boolean(profileContext?.hardConstraints?.length);

  if (isTemplateLightUpperBodyDay) {
    if (
      exercise.movementPattern === "vertical_pull" ||
      exercise.movementPattern === "horizontal_pull"
    ) {
      score += 1.15;
    } else if (
      exercise.movementPattern === "horizontal_push" ||
      exercise.movementPattern === "vertical_push"
    ) {
      score += 0.7;
    } else if (exercise.movementPattern === "horizontal_abduction") {
      score -= 0.15;
    } else if (
      exercise.movementPattern === "elbow_flexion" ||
      exercise.movementPattern === "elbow_extension"
    ) {
      score -= 0.25;
    }

    if (exercise.liftType === "compound") {
      score += 0.3;
    }
  }

  if (hasConstraintPressure && isUpperConstraintSofteningDay) {
    if (exercise.systemicFatigue === "low") {
      score += 0.3;
    } else if (exercise.systemicFatigue === "high") {
      score -= 0.15;
    }

    if (exercise.stability === "medium") {
      score += 0.2;
    }

    const setupFriction = getSetupFrictionScore(exercise);
    if (setupFriction <= 2) {
      score += 0.2;
    } else if (setupFriction >= 4) {
      score -= 0.1;
    }
  }

  return roundToTwoDecimals(Math.max(score, 0));
}

function scoreProfilePreference(
  exercise: ExerciseLibraryEntry,
  profileContext: ReadinessProfileContext | undefined
): number {
  if (!profileContext) {
    return 0;
  }

  let score = 0;
  const focusMuscles = new Set(profileContext.focusMuscles ?? []);
  const primaryFocusHits = exercise.primaryMuscles.filter((muscle) =>
    focusMuscles.has(muscle)
  ).length;
  const secondaryFocusHits = exercise.secondaryMuscles.filter((muscle) =>
    focusMuscles.has(muscle)
  ).length;

  score += Math.min(primaryFocusHits * 0.8 + secondaryFocusHits * 0.35, 1.6);

  if (profileContext.goal === "build_consistency") {
    score +=
      (exercise.systemicFatigue === "low" ? 0.5 : exercise.systemicFatigue === "medium" ? 0.2 : 0) +
      (exercise.liftType === "isolation" ? 0.25 : 0);
  }

  if (profileContext.goal === "lose_weight" || profileContext.goal === "get_fitter") {
    score += exercise.liftType === "compound" ? 0.35 : 0.1;
    score += exercise.systemicFatigue === "medium" ? 0.1 : 0;
  }

  if (profileContext.goal === "build_muscle") {
    score += exercise.liftType === "isolation" ? 0.2 : 0.35;
    score += exercise.systemicFatigue === "low" ? 0.15 : 0;
  }

  if (profileContext.favoriteExerciseIds?.includes(exercise.exerciseId)) {
    score += 0.7;
  }

  if (profileContext.plannedPreferredExerciseIds?.includes(exercise.exerciseId)) {
    score += 1;
  }

  if (profileContext.dislikedExerciseIds?.includes(exercise.exerciseId)) {
    score -= 1.1;
  }

  if (profileContext.plannedFocusMuscles?.length) {
    const plannedFocusSet = new Set(profileContext.plannedFocusMuscles);
    const primaryPlannedHits = exercise.primaryMuscles.filter((muscle) =>
      plannedFocusSet.has(muscle)
    ).length;
    const secondaryPlannedHits = exercise.secondaryMuscles.filter((muscle) =>
      plannedFocusSet.has(muscle)
    ).length;
    score += Math.min(primaryPlannedHits * 1 + secondaryPlannedHits * 0.45, 2);
  }

  if (profileContext.painFlags?.length) {
    const painSet = new Set(profileContext.painFlags);
    const primaryPainHits = exercise.primaryMuscles.filter((muscle) => painSet.has(muscle)).length;
    const secondaryPainHits = exercise.secondaryMuscles.filter((muscle) =>
      painSet.has(muscle)
    ).length;
    const stabilizerPainHits = exercise.stabilizers.filter((muscle) =>
      painSet.has(muscle)
    ).length;
    score -= Math.min(primaryPainHits * 1.2 + secondaryPainHits * 0.5 + stabilizerPainHits * 0.2, 2);
  }

  if (profileContext.plannedAvoidMuscles?.length) {
    const avoidSet = new Set(profileContext.plannedAvoidMuscles);
    const primaryAvoidHits = exercise.primaryMuscles.filter((muscle) => avoidSet.has(muscle)).length;
    const secondaryAvoidHits = exercise.secondaryMuscles.filter((muscle) =>
      avoidSet.has(muscle)
    ).length;
    score -= Math.min(primaryAvoidHits * 1 + secondaryAvoidHits * 0.4, 1.8);
  }

  return roundToTwoDecimals(score);
}

function buildExerciseProgressionSignalMap(
  completedSessions: WorkoutRecord[],
  asOf: string
): Map<string, ExerciseProgressionSignalSummary> {
  const windowStart = shiftDate(asOf, -42);
  const snapshotsByExercise = new Map<
    string,
    Array<{
      date: string;
      recordedAt: string;
      source: "weight_reps" | "reps_volume";
      score: number;
    }>
  >();

  for (const session of completedSessions) {
    if (session.date < windowStart || session.date > asOf) {
      continue;
    }

    for (const sessionExercise of session.sessionExercises ?? []) {
      const snapshot = buildExercisePerformanceSnapshot(session, sessionExercise);
      if (!snapshot) {
        continue;
      }

      const existing = snapshotsByExercise.get(sessionExercise.exerciseId) ?? [];
      existing.push(snapshot);
      snapshotsByExercise.set(sessionExercise.exerciseId, existing);
    }
  }

  return new Map(
    [...snapshotsByExercise.entries()].map(([exerciseId, snapshots]) => [
      exerciseId,
      summarizeExerciseProgressionSignal(snapshots)
    ])
  );
}

function buildExercisePerformanceSnapshot(
  workout: WorkoutRecord,
  sessionExercise: WorkoutExerciseEntry
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
        score: roundToTwoDecimals(weightedScore)
      };
    }

    const repVolumeScore = performedSets.reduce(
      (sum, setEntry) =>
        sum +
        Math.max(setEntry.reps, 0) *
          getEffortProgressionMultiplier(setEntry.effort ?? sessionExercise.effort),
      0
    );

    if (repVolumeScore > 0) {
      return {
        date: workout.date,
        recordedAt: workout.recordedAt,
        source: "reps_volume",
        score: roundToTwoDecimals(repVolumeScore)
      };
    }
  }

  const fallbackScore =
    Math.max(sessionExercise.sets, 0) *
    Math.max(sessionExercise.reps, 0) *
    getEffortProgressionMultiplier(sessionExercise.effort);

  if (fallbackScore <= 0) {
    return undefined;
  }

  return {
    date: workout.date,
    recordedAt: workout.recordedAt,
    source: "reps_volume",
    score: roundToTwoDecimals(fallbackScore)
  };
}

function summarizeExerciseProgressionSignal(
  snapshots: Array<{
    date: string;
    recordedAt: string;
    source: "weight_reps" | "reps_volume";
    score: number;
  }>
): ExerciseProgressionSignalSummary {
  if (!snapshots.length) {
    return { trend: "insufficient_data" };
  }

  const weightedCount = snapshots.filter((snapshot) => snapshot.source === "weight_reps").length;
  const preferredSource = weightedCount >= 2 ? "weight_reps" : "reps_volume";
  const comparableSnapshots = snapshots
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
    return { trend: "insufficient_data" };
  }

  const previousSnapshots = comparableSnapshots.slice(0, -1);
  const baselineSnapshots = previousSnapshots.slice(-Math.min(previousSnapshots.length, 2));
  const baselineScore = baselineSnapshots.length
    ? roundToTwoDecimals(
        baselineSnapshots.reduce((sum, snapshot) => sum + snapshot.score, 0) /
          baselineSnapshots.length
      )
    : undefined;
  const deltaPercent =
    baselineScore && baselineScore > 0
      ? roundToTwoDecimals(((latestSnapshot.score - baselineScore) / baselineScore) * 100)
      : undefined;
  const previousBest = previousSnapshots.reduce(
    (best, snapshot) => Math.max(best, snapshot.score),
    0
  );

  return {
    trend:
      deltaPercent === undefined
        ? "insufficient_data"
        : deltaPercent >= 5
        ? "rising"
        : deltaPercent <= -5
        ? "slipping"
        : "steady",
    deltaPercent,
    latestWasPersonalBest:
      previousSnapshots.length > 0 && latestSnapshot.score > previousBest * 1.005
  };
}

function getEffortProgressionMultiplier(
  effort?: WorkoutExerciseEntry["effort"]
): number {
  if (effort === "easy") {
    return 0.95;
  }

  if (effort === "hard") {
    return 1.08;
  }

  return 1;
}

function scoreExerciseProgressionSignal(
  exercise: ExerciseLibraryEntry,
  progressionSignalMap: Map<string, ExerciseProgressionSignalSummary> | undefined,
  reasons: string[],
  plannedDayContext?: PlannedDayReadinessContext
): number {
  const signal = progressionSignalMap?.get(exercise.exerciseId);
  if (!signal || signal.trend === "insufficient_data") {
    return 0;
  }

  const isPlannedCandidate = Boolean(
    plannedDayContext?.sessionTemplate?.slots.some((slot) =>
      slot.candidateExerciseIds.includes(exercise.exerciseId)
    )
  );
  const relevanceMultiplier = isPlannedCandidate ? 1 : 0.7;

  if (signal.latestWasPersonalBest) {
    reasons.push("Recent performance has been moving up cleanly.");
    return roundToTwoDecimals(1.2 * relevanceMultiplier);
  }

  if (signal.trend === "rising") {
    reasons.push("Recent performance has been moving up cleanly.");
    return roundToTwoDecimals(0.8 * relevanceMultiplier);
  }

  if (signal.trend === "slipping") {
    reasons.push("Recent performance has been slipping.");
    return roundToTwoDecimals(-0.9 * relevanceMultiplier);
  }

  return 0;
}

function scoreSuggestedDayTemplateFit(
  exercise: ExerciseLibraryEntry,
  plannedDayContext: PlannedDayReadinessContext | undefined,
  reasons: string[]
): number {
  if (!isSuggestedDay(plannedDayContext) || !plannedDayContext?.sessionTemplate?.slots.length) {
    return 0;
  }

  const matchingTemplateFit = plannedDayContext.sessionTemplate.slots.reduce<{
    score: number;
    reason?: string;
  }>(
    (best, slot) => {
      const candidateIndex = slot.candidateExerciseIds.indexOf(exercise.exerciseId);
      const effectOverlap = exercise.trainingEffects?.filter((effect) =>
        slot.targetEffects.includes(effect)
      ).length ?? 0;

      if (candidateIndex < 0 && effectOverlap === 0) {
        return best;
      }

      const slotBonus = slot.slot === "main" ? 0.65 : slot.slot === "secondary" ? 0.45 : 0.25;
      const candidateBonus =
        candidateIndex === 0 ? 0.55 : candidateIndex === 1 ? 0.35 : candidateIndex >= 2 ? 0.2 : 0;
      const effectBonus =
        candidateIndex >= 0 ? 0 : Math.min(effectOverlap * 0.12, slot.slot === "main" ? 0.24 : 0.18);
      const selectionBonus =
        candidateIndex === 0 && slot.selectionReason ? 0.12 : candidateIndex >= 0 ? 0.05 : 0;
      const fitScore = roundToTwoDecimals(slotBonus + candidateBonus + effectBonus + selectionBonus);

      if (fitScore <= best.score) {
        return best;
      }

      return {
        score: fitScore,
        reason:
          candidateIndex === 0
            ? "Matches the version of this suggested day that has been landing best lately."
            : candidateIndex >= 0
              ? "Fits the shape of this suggested day well."
              : "Fits the shape of this suggested day."
      };
    },
    { score: 0 }
  );

  if (matchingTemplateFit.reason) {
    reasons.push(matchingTemplateFit.reason);
  }

  const biasBonus = calculateSuggestedDayBiasBonus(exercise, plannedDayContext);
  if (biasBonus > 0) {
    reasons.push("Matches the recent bias this suggested day is protecting.");
  }

  return roundToTwoDecimals(matchingTemplateFit.score + biasBonus);
}

function calculateSuggestedDayBiasBonus(
  exercise: ExerciseLibraryEntry,
  plannedDayContext: PlannedDayReadinessContext | undefined
): number {
  const bias = plannedDayContext?.originBias ?? plannedDayContext?.suggestedDayBias;
  if (!isSuggestedDay(plannedDayContext) || !bias) {
    return 0;
  }

  const effects = new Set(exercise.trainingEffects ?? []);

  if (
    bias === "pull_bias" &&
    (effects.has("vertical_pull") ||
      effects.has("horizontal_row") ||
      effects.has("rear_delt_isolation"))
  ) {
    return 0.18;
  }

  if (
    bias === "push_bias" &&
    (effects.has("horizontal_press") ||
      effects.has("vertical_press") ||
      effects.has("chest_isolation"))
  ) {
    return 0.18;
  }

  if (
    bias === "quad_bias" &&
    (effects.has("quad_bias") ||
      effects.has("squat_pattern") ||
      effects.has("unilateral_leg"))
  ) {
    return 0.18;
  }

  if (
    bias === "hinge_bias" &&
    (effects.has("hinge_heavy") ||
      effects.has("hamstring_isolation") ||
      effects.has("glute_bias"))
  ) {
    return 0.18;
  }

  return 0;
}

function resolveHardConstraintReason(
  exercise: ExerciseLibraryEntry,
  plannedWorkoutType: string | undefined,
  profileContext: ReadinessProfileContext | undefined
): string | undefined {
  const equipmentConstraintReason = resolveEquipmentConstraintReason(exercise, profileContext);

  if (equipmentConstraintReason) {
    return equipmentConstraintReason;
  }

  const matchingConstraint = profileContext?.hardConstraints?.find((constraint) => {
    if (constraint.kind === "avoid_exercise") {
      return constraint.value === exercise.exerciseId;
    }

    if (constraint.kind === "avoid_muscle") {
      return [
        ...exercise.primaryMuscles,
        ...exercise.secondaryMuscles,
        ...exercise.stabilizers
      ].includes(constraint.value as MuscleGroup);
    }

    if (constraint.kind === "avoid_workout_type") {
      return Boolean(plannedWorkoutType && constraint.value === plannedWorkoutType);
    }

    return false;
  });

  if (!matchingConstraint) {
    return undefined;
  }

  if (matchingConstraint.kind === "avoid_exercise") {
    return `Hard constraint: avoid ${exercise.name} for now.`;
  }

  if (matchingConstraint.kind === "avoid_muscle") {
    return `Hard constraint: avoid loading ${matchingConstraint.value.replaceAll("_", " ")} right now.`;
  }

  return `Hard constraint: avoid ${matchingConstraint.value.replaceAll("_", " ")} days for now.`;
}

function resolveEquipmentConstraintReason(
  exercise: ExerciseLibraryEntry,
  profileContext: ReadinessProfileContext | undefined
): string | undefined {
  const access = profileContext?.equipmentAccess;

  if (!access || access === "full_gym") {
    return undefined;
  }

  if (isExerciseSupportedByEquipmentAccess(exercise, access)) {
    return undefined;
  }

  return `Equipment mismatch: ${exercise.name} needs ${formatEquipmentRequirement(exercise.equipmentType)} access.`;
}

function isExerciseSupportedByEquipmentAccess(
  exercise: ExerciseLibraryEntry,
  access: NonNullable<ReadinessProfileContext["equipmentAccess"]>
): boolean {
  if (access === "full_gym") {
    return true;
  }

  if (access === "dumbbells_only") {
    return exercise.equipmentType === "dumbbell" || exercise.equipmentType === "bodyweight";
  }

  if (access === "bodyweight_only") {
    return exercise.equipmentType === "bodyweight";
  }

  if (access === "machines_only") {
    return exercise.equipmentType === "machine" || exercise.equipmentType === "bodyweight";
  }

  return (
    exercise.equipmentType === "dumbbell" ||
    exercise.equipmentType === "bodyweight" ||
    exercise.equipmentType === "cable"
  );
}

function formatEquipmentRequirement(equipmentType: ExerciseLibraryEntry["equipmentType"]): string {
  if (equipmentType === "bodyweight") {
    return "bodyweight";
  }

  if (equipmentType === "dumbbell") {
    return "dumbbell";
  }

  if (equipmentType === "machine") {
    return "machine";
  }

  if (equipmentType === "cable") {
    return "cable";
  }

  return "barbell";
}

function scoreRecommendationMemory(
  memory: RecommendationMemoryLike | undefined,
  exerciseId: string,
  reasons: string[],
  plannedDayContext?: PlannedDayReadinessContext
): number {
  if (!memory) {
    return 0;
  }

  const exerciseDelta = memory.byExerciseId[exerciseId] ?? 0;
  const slotKey = resolvePlannedSlotKey(plannedDayContext, exerciseId);
  const slotDelta = slotKey ? memory.byExerciseSlotKey[slotKey] ?? 0 : 0;
  const substitutionDelta = memory.bySubstitutedExerciseId?.[exerciseId] ?? 0;
  const substitutionSlotDelta = slotKey
    ? memory.bySubstitutedExerciseSlotKey?.[slotKey] ?? 0
    : 0;
  const substitutionWorkoutTypeDelta = plannedDayContext?.workoutType
    ? memory.bySubstitutedWorkoutTypeExerciseKey?.[
        `${plannedDayContext.workoutType}:${exerciseId}`
      ] ?? 0
    : 0;
  const substitutionPairDelta = resolveSubstitutionPairDelta(
    memory,
    plannedDayContext,
    exerciseId
  );
  const reasonTags = [...new Set(reasons.map(normalizeReasonTag).filter(Boolean))];
  const tagDelta =
    reasonTags.length > 0
      ? reasonTags.reduce((sum, tag) => sum + (memory.byReasonTag[tag] ?? 0), 0) /
        reasonTags.length
      : 0;

  return roundToTwoDecimals(
    clamp(
      exerciseDelta * 0.4 +
        slotDelta * 0.2 +
        substitutionDelta * 0.15 +
        substitutionSlotDelta * 0.15 +
        substitutionWorkoutTypeDelta * 0.08 +
        substitutionPairDelta * 0.12 +
        tagDelta * 0.1,
      -0.4,
      0.4
    )
  );
}

function resolvePlannedSlotKey(
  plannedDayContext: PlannedDayReadinessContext | undefined,
  exerciseId: string
): string | undefined {
  const slot = plannedDayContext?.sessionTemplate?.slots.find((entry) =>
    entry.candidateExerciseIds.includes(exerciseId)
  )?.slot;

  return slot ? `${slot}:${exerciseId}` : undefined;
}

function normalizeReasonTag(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveSubstitutionPairDelta(
  memory: RecommendationMemoryLike,
  plannedDayContext: PlannedDayReadinessContext | undefined,
  exerciseId: string
): number {
  const pairMemory = memory.bySubstitutionPairKey;
  const slot = plannedDayContext?.sessionTemplate?.slots.find((entry) =>
    entry.candidateExerciseIds.includes(exerciseId)
  );

  if (!pairMemory || !slot) {
    return 0;
  }

  const sourceCandidates = slot.candidateExerciseIds.filter(
    (candidateExerciseId) => candidateExerciseId !== exerciseId
  );

  return sourceCandidates.reduce((best, sourceExerciseId) => {
    const pairDelta =
      pairMemory[`${sourceExerciseId}->${exerciseId}`] ?? 0;
    return Math.max(best, pairDelta);
  }, 0);
}

function diffInHours(laterDate: string, earlierDate: string): number {
  const later = new Date(`${laterDate}T12:00:00.000Z`);
  const earlier = new Date(`${earlierDate}T12:00:00.000Z`);
  return Math.max(
    0,
    Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60))
  );
}

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  swapReasonTags: string[],
  preferredByHistory = false,
  preferredByMomentum = false
): string {
  const effectLabel = formatTrainingEffect(exercise.trainingEffects?.[0]);
  const reasons = swapReasonTags
    .map((tag) => formatSwapReasonTag(tag))
    .filter((value, index, values) => values.indexOf(value) === index);
  const learnedNote = preferredByHistory
    ? " This swap has worked well for this user recently."
    : "";
  const momentumNote = preferredByMomentum
    ? " It is also the option that has been moving better lately."
    : "";

  if (swapForExerciseIds.length === 1 && reasons.length === 1) {
    return `Preserves the ${effectLabel} training effect with ${reasons[0]} today.${learnedNote}${momentumNote}`;
  }

  if (reasons.length === 1) {
    return `Preserves the ${effectLabel} training effect while giving you ${reasons[0]} today.${learnedNote}${momentumNote}`;
  }

  if (reasons.length >= 2) {
    return `Preserves the ${effectLabel} training effect while giving you ${reasons[0]} and ${reasons[1]} today.${learnedNote}${momentumNote}`;
  }

  return `Preserves the ${effectLabel} training effect while giving you a lower-fatigue way to keep the day on track.${learnedNote}${momentumNote}`;
}

function buildSubstitutionFrontendCopy(
  exercise: ExerciseLibraryEntry,
  swapForExerciseIds: string[],
  swapReasonTags: string[],
  preferredByHistory = false,
  preferredByMomentum = false
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
  const learnedNote = preferredByHistory
    ? " It has also been a reliable repeat swap for this user."
    : "";
  const momentumNote = preferredByMomentum
    ? " It is also moving better lately."
    : "";

  return {
    title: `Swap ${exercise.name} today`,
    actionLabel: `Try ${formattedSwapNames}`,
    explanation:
      swapNames.length > 1
        ? `${primarySwapName} is the cleanest swap today. ${explanation}${learnedNote}${momentumNote}`
        : `${primarySwapName} is the cleanest swap today. ${explanation}${learnedNote}${momentumNote}`
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

function pickUpperBodyAnchorExerciseIds(input: {
  recommendedExercises: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
  overworkedMuscles: MuscleGroup[];
  plannedDayContext?: PlannedDayReadinessContext;
}): string[] {
  if (!shouldBalanceGenericUpperBodyAnchors(input.plannedDayContext)) {
    return pickBlockExerciseIds(
      input.recommendedExercises,
      input.deprioritizedExercises,
      ["horizontal_press", "vertical_pull", "horizontal_row"],
      2,
      input.overworkedMuscles
    );
  }

  const pressAnchorIds = pickBlockExerciseIds(
    input.recommendedExercises,
    input.deprioritizedExercises,
    ["horizontal_press"],
    1,
    input.overworkedMuscles
  );
  const pullAnchorIds = pickBlockExerciseIds(
    input.recommendedExercises,
    input.deprioritizedExercises,
    ["vertical_pull", "horizontal_row"],
    1,
    input.overworkedMuscles
  );
  const balancedIds = dedupeExerciseIds([...pressAnchorIds, ...pullAnchorIds]);

  if (balancedIds.length >= 2) {
    return balancedIds;
  }

  return pickBlockExerciseIds(
    input.recommendedExercises,
    input.deprioritizedExercises,
    ["horizontal_press", "vertical_pull", "horizontal_row"],
    2,
    input.overworkedMuscles
  );
}

function shouldBalanceGenericUpperBodyAnchors(
  plannedDayContext: PlannedDayReadinessContext | undefined
): boolean {
  return !isTemplateBackedDay(plannedDayContext) && !isSuggestedDay(plannedDayContext);
}

function hasMixedUpperBodyAnchors(exerciseIds: string[]): boolean {
  let hasPressAnchor = false;
  let hasPullAnchor = false;

  for (const exerciseId of exerciseIds) {
    const exercise = getExerciseById(exerciseId);
    const effects = exercise?.trainingEffects ?? [];

    if (effects.includes("horizontal_press")) {
      hasPressAnchor = true;
    }

    if (effects.includes("vertical_pull") || effects.includes("horizontal_row")) {
      hasPullAnchor = true;
    }
  }

  return hasPressAnchor && hasPullAnchor;
}

function dedupeExerciseIds(exerciseIds: string[]): string[] {
  const seen = new Set<string>();

  return exerciseIds.filter((exerciseId) => {
    if (seen.has(exerciseId)) {
      return false;
    }

    seen.add(exerciseId);
    return true;
  });
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
  plan: SessionPlan,
  experienceLevel: ExperienceLevel
): SessionPlan {
  const normalizedBlocks = dedupeSessionPlanBlocks(
    salvageModifiedMainBlock(normalizedPlanType, plan)
  );
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

  const experienceProfile = EXPERIENCE_PROFILES[experienceLevel];
  if (
    experienceProfile.downgrade.accessoryOnlyRequiresMultipleEmptyBlocks &&
    hasSecondaryWork
  ) {
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

function salvageModifiedMainBlock(
  normalizedPlanType: string,
  plan: SessionPlan
): SessionPlan["blocks"] {
  if (plan.sessionStyle !== "modified") {
    return plan.blocks;
  }

  const mainBlock = plan.blocks.find((block) => block.slot === "main");
  const secondaryBlock = plan.blocks.find((block) => block.slot === "secondary");

  if (!mainBlock || mainBlock.exampleExerciseIds.length > 0 || !secondaryBlock) {
    return plan.blocks;
  }

  const promotedMainIds = secondaryBlock.exampleExerciseIds
    .filter((exerciseId) => {
      const exercise = getExerciseById(exerciseId);
      if (!exercise) {
        return false;
      }

      const effects = exercise.trainingEffects ?? [];

      if (normalizedPlanType.includes("push")) {
        return effects.includes("horizontal_press") || effects.includes("chest_isolation");
      }

      if (normalizedPlanType.includes("pull")) {
        return effects.includes("horizontal_row") || effects.includes("vertical_pull");
      }

      if (normalizedPlanType.includes("lower") || normalizedPlanType.includes("posterior")) {
        return (
          effects.includes("quad_bias") ||
          effects.includes("squat_pattern") ||
          effects.includes("hinge_heavy") ||
          effects.includes("glute_bias")
        );
      }

      if (normalizedPlanType.includes("upper")) {
        return (
          effects.includes("horizontal_press") ||
          effects.includes("vertical_pull") ||
          effects.includes("horizontal_row")
        );
      }

      return false;
    })
    .slice(0, 1);

  if (!promotedMainIds.length) {
    return plan.blocks;
  }

  return plan.blocks.map((block) => {
    if (block.slot === "main") {
      return {
        ...block,
        exampleExerciseIds: promotedMainIds
      };
    }

    if (block.slot === "secondary") {
      return {
        ...block,
        exampleExerciseIds: block.exampleExerciseIds.filter(
          (exerciseId) => !promotedMainIds.includes(exerciseId)
        )
      };
    }

    return block;
  });
}

function applyPlannedTemplateToSessionPlan(
  plan: SessionPlan,
  plannedDayContext?: PlannedDayReadinessContext,
  sessionDecision?: SessionDecision,
  recommendationEntries: ExerciseRecommendation[] = []
): SessionPlan {
  const template = plannedDayContext?.sessionTemplate;
  if (!template?.slots?.length) {
    return plan;
  }

  const recommendationEntriesById = new Map(
    recommendationEntries.map((entry, index) => [entry.exerciseId, { entry, index }] as const)
  );
  const templateSlots = new Map(template.slots.map((slot) => [slot.slot, slot]));
  const templateOrder = template.slots.map((slot) => slot.slot);

  const mergedBlocks = plan.blocks
    .filter((block) => templateSlots.has(block.slot) || !templateOrder.length)
    .map((block) => {
      const templateSlot = templateSlots.get(block.slot);
      if (!templateSlot) {
        return block;
      }

        return {
        ...block,
        focus: templateSlot.label || block.focus,
        exampleExerciseIds: mergeTemplateExerciseIds(
          templateSlot.candidateExerciseIds,
          block.exampleExerciseIds,
          recommendationEntriesById,
          isSuggestedDay(plannedDayContext) &&
            Boolean(plannedDayContext?.originBias ?? plannedDayContext?.suggestedDayBias)
        ),
        prescriptionIntent: adjustTemplatePrescriptionIntent(
          templateSlot.prescriptionIntent,
          block.slot,
          sessionDecision
        ),
        progressionCue: adjustTemplateProgressionCue(
          templateSlot.progressionCue ??
            inferTemplateProgressionCue(templateSlot, plannedDayContext?.progressionIntent),
          block.slot,
          sessionDecision
        )
      };
    })
    .sort((left, right) => templateOrder.indexOf(left.slot) - templateOrder.indexOf(right.slot));

  return {
    ...plan,
    sessionStyle:
      template.sessionStyle === "conservative" && plan.sessionStyle === "normal"
        ? "conservative"
        : plan.sessionStyle,
    coachNote:
      template.sessionStyle === "conservative" && !plan.coachNote
        ? describeConservativeTemplateCoachNote()
        : plan.coachNote,
    blocks: mergedBlocks
  };
}

function inferTemplateProgressionCue(
  templateSlot: {
    slot: "main" | "secondary" | "accessory";
    prescriptionIntent: {
      sets: "low" | "moderate" | "high";
      reps: "strength_bias" | "hypertrophy_bias" | "pump_bias";
      effort: "submaximal" | "working" | "push";
    };
  },
  progressionIntent?: "build" | "repeat" | "conservative"
):
  | {
      action: "progress" | "repeat" | "hold_back";
      reason: string;
    }
  | undefined {
  if (progressionIntent === "conservative") {
    return {
      action: "hold_back",
      reason: describeConservativeSlotCue(templateSlot.slot)
    };
  }

  if (templateSlot.slot !== "main" && templateSlot.prescriptionIntent.effort === "submaximal") {
    return {
      action: "hold_back",
      reason: describeModifiedSupportCue()
    };
  }

  if (
    templateSlot.slot === "main" &&
    progressionIntent === "build" &&
    templateSlot.prescriptionIntent.effort === "push"
  ) {
    return {
      action: "progress",
      reason: "This slot is the best place to progress if the day feels good."
    };
  }

  return {
    action: "repeat",
    reason:
      templateSlot.slot === "main"
        ? "Keep this slot steady and look for a clean repeat."
        : "Use this slot to reinforce the day, not to force progression."
  };
}

function adjustTemplateProgressionCue(
  progressionCue:
    | {
        action: "progress" | "repeat" | "hold_back";
        reason: string;
      }
    | undefined,
  slot: "main" | "secondary" | "accessory",
  sessionDecision?: SessionDecision
):
  | {
      action: "progress" | "repeat" | "hold_back";
      reason: string;
    }
  | undefined {
  if (!progressionCue || !sessionDecision) {
    return progressionCue;
  }

  if (sessionDecision.status === "train_as_planned") {
    return progressionCue;
  }

  const heavyReduction =
    sessionDecision.status === "train_light" ||
    sessionDecision.volumeAdjustment === "reduce_30_percent" ||
    sessionDecision.intensityAdjustment === "reduce_intensity";
  const conservativeReduction =
    sessionDecision.volumeAdjustment === "reduce_20_percent" ||
    sessionDecision.progressionIntent === "conservative";

  if (heavyReduction) {
    return {
      action: "hold_back",
      reason: describeLightDaySlotCue(slot)
    };
  }

  if (
    (conservativeReduction || sessionDecision.status === "train_modified") &&
    progressionCue.action === "progress"
  ) {
    return {
      action: "repeat",
      reason: describeCalmerDayRepeatCue()
    };
  }

  if (slot !== "main" && progressionCue.action !== "hold_back") {
    return {
      action: "hold_back",
      reason: describeModifiedSupportCue()
    };
  }

  return progressionCue;
}

function adjustTemplatePrescriptionIntent(
  prescriptionIntent:
    | {
        sets: "low" | "moderate" | "high";
        reps: "strength_bias" | "hypertrophy_bias" | "pump_bias";
        effort: "submaximal" | "working" | "push";
      }
    | undefined,
  slot: "main" | "secondary" | "accessory",
  sessionDecision?: SessionDecision
):
  | {
      sets: "low" | "moderate" | "high";
      reps: "strength_bias" | "hypertrophy_bias" | "pump_bias";
      effort: "submaximal" | "working" | "push";
    }
  | undefined {
  if (!prescriptionIntent || !sessionDecision) {
    return prescriptionIntent;
  }

  if (sessionDecision.status === "train_as_planned") {
    return prescriptionIntent;
  }

  const heavyReduction =
    sessionDecision.status === "train_light" ||
    sessionDecision.volumeAdjustment === "reduce_30_percent" ||
    sessionDecision.intensityAdjustment === "reduce_intensity";
  const conservativeReduction =
    sessionDecision.volumeAdjustment === "reduce_20_percent" ||
    sessionDecision.progressionIntent === "conservative";

  if (heavyReduction) {
    return {
      sets: "low",
      reps: slot === "main" ? "hypertrophy_bias" : "pump_bias",
      effort: "submaximal"
    };
  }

  const sets = downgradePrescriptionSets(
    prescriptionIntent.sets,
    slot === "main" && !conservativeReduction ? 1 : 2
  );
  const effort = downgradePrescriptionEffort(
    prescriptionIntent.effort,
    slot === "main" && !conservativeReduction ? 1 : 2
  );

  return {
    sets,
    reps: adjustPrescriptionRepBias(prescriptionIntent.reps, slot, sets),
    effort
  };
}

function downgradePrescriptionSets(
  sets: "low" | "moderate" | "high",
  steps: number
): "low" | "moderate" | "high" {
  const scale = ["low", "moderate", "high"] as const;
  return scale[Math.max(0, scale.indexOf(sets) - steps)];
}

function downgradePrescriptionEffort(
  effort: "submaximal" | "working" | "push",
  steps: number
): "submaximal" | "working" | "push" {
  const scale = ["submaximal", "working", "push"] as const;
  return scale[Math.max(0, scale.indexOf(effort) - steps)];
}

function adjustPrescriptionRepBias(
  reps: "strength_bias" | "hypertrophy_bias" | "pump_bias",
  slot: "main" | "secondary" | "accessory",
  sets: "low" | "moderate" | "high"
): "strength_bias" | "hypertrophy_bias" | "pump_bias" {
  if (slot === "main") {
    return sets === "low" && reps === "strength_bias" ? "hypertrophy_bias" : reps;
  }

  if (sets === "low") {
    return "pump_bias";
  }

  return reps === "strength_bias" ? "hypertrophy_bias" : reps;
}

function mergeTemplateExerciseIds(
  templateIds: string[],
  blockIds: string[],
  recommendationEntriesById?: Map<
    string,
    {
      entry: ExerciseRecommendation;
      index: number;
    }
  >,
  preserveTemplatePriority = false
): string[] {
  const merged = [...templateIds, ...blockIds].filter(
    (exerciseId, index, values) => values.indexOf(exerciseId) === index
  );

  const templateRank = new Map(templateIds.map((exerciseId, index) => [exerciseId, index] as const));
  const blockRank = new Map(blockIds.map((exerciseId, index) => [exerciseId, index] as const));
  const compareRecommendationOrder = (left: string, right: string): number => {
    const leftRecommendation = recommendationEntriesById?.get(left);
    const rightRecommendation = recommendationEntriesById?.get(right);

    if (leftRecommendation && rightRecommendation) {
      return (
        getToleranceRank(leftRecommendation.entry.tolerance) -
          getToleranceRank(rightRecommendation.entry.tolerance) ||
        leftRecommendation.entry.score - rightRecommendation.entry.score ||
        leftRecommendation.index - rightRecommendation.index
      );
    }

    if (leftRecommendation) {
      return -1;
    }

    if (rightRecommendation) {
      return 1;
    }

    return 0;
  };

  if (preserveTemplatePriority) {
    // Suggested-day templates carry intent that generic recommendation sorting does not:
    // a pull-biased or push-biased template is already the result of a higher-level planning
    // decision. Preserve that ordering first, then append generic block fallbacks afterward.
    // Otherwise we risk a priority inversion where "safe" generic options silently override
    // the planned template shape and the main block stops matching the day we meant to protect.
    const rankedTemplateIds = [...templateIds].sort(
      (left, right) =>
        compareRecommendationOrder(left, right) ||
        (templateRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (templateRank.get(right) ?? Number.MAX_SAFE_INTEGER)
    );
    const rankedBlockOnlyIds = blockIds
      .filter((exerciseId) => !templateRank.has(exerciseId))
      .sort(
        (left, right) =>
          compareRecommendationOrder(left, right) ||
          (blockRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
            (blockRank.get(right) ?? Number.MAX_SAFE_INTEGER)
      );

    return [...rankedTemplateIds, ...rankedBlockOnlyIds].slice(
      0,
      Math.max(blockIds.length, Math.min(templateIds.length, 3))
    );
  }

  return merged
    .sort((left, right) => {
      return (
        compareRecommendationOrder(left, right) ||
        (blockRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (blockRank.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        (templateRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (templateRank.get(right) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, Math.max(blockIds.length, Math.min(templateIds.length, 3)));
}

function backfillSparseSessionPlan(
  normalizedPlanType: string,
  plan: SessionPlan,
  recommendedEntries: ExerciseRecommendation[],
  deprioritizedEntries: ExerciseRecommendation[]
): SessionPlan {
  const backfillEffects = getBackfillEffects(normalizedPlanType);
  if (!backfillEffects.length) {
    return plan;
  }

  const usedExerciseIds = new Set(
    plan.blocks.flatMap((block) => block.exampleExerciseIds)
  );
  const currentExerciseCount = usedExerciseIds.size;
  const mainBlock = plan.blocks.find((block) => block.slot === "main");
  const minimumExerciseCount =
    !mainBlock?.exampleExerciseIds.length || plan.sessionStyle === "modified" ? 3 : 2;

  if (currentExerciseCount >= minimumExerciseCount) {
    return plan;
  }

  const backfillCandidates = [...recommendedEntries, ...deprioritizedEntries]
    .filter((entry) => isOnPlanRecommendation(entry))
    .filter((entry) => entry.tolerance !== "red")
    .filter((entry) => !hasDirectOverworkedOverlap(entry))
    .filter((entry) => !usedExerciseIds.has(entry.exerciseId))
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
    .sort(
      (left, right) =>
        getPreferredEffectRank(left.exercise, backfillEffects) -
          getPreferredEffectRank(right.exercise, backfillEffects) ||
        getToleranceRank(left.entry.tolerance) - getToleranceRank(right.entry.tolerance) ||
        left.entry.score - right.entry.score
    )
    .map((candidate) => candidate.entry.exerciseId);

  if (!backfillCandidates.length) {
    return plan;
  }

  const nextBlocks = plan.blocks.map((block) => ({
    ...block,
    exampleExerciseIds: [...block.exampleExerciseIds]
  }));
  const fillOrder =
    nextBlocks.find((block) => block.slot === "main")?.exampleExerciseIds.length
      ? ["secondary", "accessory"]
      : ["main", "secondary", "accessory"];
  let candidateIndex = 0;
  let nextExerciseCount = currentExerciseCount;

  for (const slot of fillOrder) {
    const block = nextBlocks.find((candidate) => candidate.slot === slot);
    if (!block) {
      continue;
    }

    while (
      block.exampleExerciseIds.length < 2 &&
      nextExerciseCount < minimumExerciseCount &&
      candidateIndex < backfillCandidates.length
    ) {
      const exerciseId = backfillCandidates[candidateIndex];
      candidateIndex += 1;

      if (usedExerciseIds.has(exerciseId)) {
        continue;
      }

      block.exampleExerciseIds.push(exerciseId);
      usedExerciseIds.add(exerciseId);
      nextExerciseCount += 1;
    }
  }

  return {
    ...plan,
    blocks: nextBlocks
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

function getBackfillEffects(normalizedPlanType: string): TrainingEffect[] {
  if (normalizedPlanType.includes("push")) {
    return [
      "horizontal_press",
      "vertical_press",
      "chest_isolation",
      "lateral_delt_isolation",
      "side_delt_bias",
      "cable_pressdown",
      "triceps_isolation",
      "vertical_press"
    ];
  }

  if (normalizedPlanType.includes("pull")) {
    return [
      "horizontal_row",
      "vertical_pull",
      "upper_trap_isolation",
      "trap_isolation",
      "neutral_grip_curl",
      "biceps_isolation",
      "rear_delt_isolation",
      "vertical_pull",
      "supinated_curl"
    ];
  }

  if (normalizedPlanType.includes("lower")) {
    return [
      "quad_bias",
      "squat_pattern",
      "hinge_heavy",
      "glute_bias",
      "hamstring_isolation",
      "unilateral_leg",
      "calf_isolation"
    ];
  }

  if (normalizedPlanType.includes("posterior")) {
    return ["hamstring_isolation", "glute_bias", "hinge_heavy", "unilateral_leg"];
  }

  if (normalizedPlanType.includes("upper")) {
    return [
      "horizontal_press",
      "vertical_pull",
      "horizontal_row",
      "rear_delt_isolation",
      "lateral_delt_isolation",
      "neutral_grip_curl",
      "biceps_isolation",
      "cable_pressdown",
      "triceps_isolation"
    ];
  }

  return [];
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

function deriveRelevantConstraints(
  plannedWorkoutType: string | undefined,
  overworkedMuscles: MuscleGroup[],
  overworkedPatterns: MovementPattern[]
): {
  overworkedMuscles: MuscleGroup[];
  overworkedPatterns: MovementPattern[];
} {
  if (!plannedWorkoutType) {
    return { overworkedMuscles, overworkedPatterns };
  }

  const normalizedType = plannedWorkoutType.toLowerCase();
  const muscleFilters: Record<string, MuscleGroup[]> = {
    push: ["chest", "front_delts", "side_delts", "triceps"],
    pull: [
      "lats",
      "rhomboids",
      "mid_traps",
      "rear_delts",
      "biceps",
      "brachialis",
      "brachioradialis",
      "upper_traps",
      "lower_traps"
    ],
    upper: [
      "chest",
      "front_delts",
      "side_delts",
      "rear_delts",
      "triceps",
      "biceps",
      "brachialis",
      "brachioradialis",
      "lats",
      "upper_back",
      "rhomboids",
      "mid_traps",
      "upper_traps",
      "lower_traps"
    ],
    lower: ["quads", "glutes", "hamstrings", "adductors", "calves", "glute_meds", "spinal_erectors"],
    full: [
      "quads",
      "glutes",
      "hamstrings",
      "calves",
      "chest",
      "front_delts",
      "side_delts",
      "rear_delts",
      "triceps",
      "biceps",
      "lats",
      "upper_back",
      "rhomboids"
    ],
    posterior: ["glutes", "hamstrings", "spinal_erectors", "lats", "upper_back"]
  };
  const patternFilters: Record<string, MovementPattern[]> = {
    push: ["horizontal_push", "vertical_push", "elbow_extension"],
    pull: ["vertical_pull", "horizontal_pull", "horizontal_abduction", "elbow_flexion"],
    upper: [
      "horizontal_push",
      "vertical_push",
      "vertical_pull",
      "horizontal_pull",
      "horizontal_abduction",
      "elbow_flexion",
      "elbow_extension"
    ],
    lower: ["squat", "lunge", "hinge", "knee_flexion", "knee_extension", "plantar_flexion"],
    full: [
      "squat",
      "lunge",
      "hinge",
      "knee_flexion",
      "knee_extension",
      "plantar_flexion",
      "horizontal_push",
      "vertical_push",
      "vertical_pull",
      "horizontal_pull",
      "horizontal_abduction",
      "elbow_flexion",
      "elbow_extension"
    ],
    posterior: ["hinge", "knee_flexion", "horizontal_pull", "vertical_pull"]
  };

  const matchingKey = normalizedType.includes("push")
    ? "push"
    : normalizedType.includes("pull")
      ? "pull"
      : normalizedType.includes("upper")
        ? "upper"
      : normalizedType.includes("posterior")
        ? "posterior"
        : normalizedType.includes("lower") || normalizedType.includes("legs")
          ? "lower"
          : normalizedType.includes("full")
            ? "full"
          : undefined;

  if (!matchingKey) {
    return { overworkedMuscles, overworkedPatterns };
  }

  const relevantMuscles = overworkedMuscles.filter((muscle) =>
    muscleFilters[matchingKey].includes(muscle)
  );
  const relevantPatterns = overworkedPatterns.filter((pattern) =>
    patternFilters[matchingKey].includes(pattern)
  );

  return {
    overworkedMuscles: relevantMuscles,
    overworkedPatterns: relevantPatterns
  };
}
