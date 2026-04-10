export type ExerciseCategory = "strength_hypertrophy";
export type LiftType = "compound" | "isolation";
export type SkillLevel = "beginner_to_advanced";
export type MovementPattern =
  | "horizontal_push"
  | "vertical_push"
  | "vertical_pull"
  | "horizontal_pull"
  | "horizontal_abduction"
  | "elbow_flexion"
  | "elbow_extension"
  | "squat"
  | "lunge"
  | "hinge"
  | "carry"
  | "knee_flexion"
  | "knee_extension"
  | "plantar_flexion";
export type MovementPlane = "sagittal" | "frontal" | "transverse";
export type StabilityLevel = "medium" | "high";
export type FatigueLevel = "low" | "medium" | "high";
export type MuscleGroup =
  | "chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "triceps"
  | "anconeus"
  | "biceps"
  | "brachialis"
  | "brachioradialis"
  | "lats"
  | "teres_major"
  | "upper_traps"
  | "lower_traps"
  | "mid_traps"
  | "rhomboids"
  | "forearm_flexors"
  | "rotator_cuff"
  | "serratus_anterior"
  | "adductors"
  | "glute_meds"
  | "quads"
  | "glutes"
  | "hamstrings"
  | "calves"
  | "spinal_erectors"
  | "core"
  | "upper_back";
export type EquipmentType =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight";
export type SessionEffort = "easy" | "moderate" | "hard";
export type RecoveryState = "recovered" | "recovering" | "overworked";
export type RecommendationBucket = "recommended" | "deprioritize" | "avoid";
export type ExerciseTolerance = "green" | "yellow" | "red";
export type FallbackTier = "best" | "acceptable";
export type ExerciseSelectionSource =
  | "template_primary"
  | "template_candidate"
  | "generic_fallback";
export type WeeklyState = "not_started" | "in_progress" | "completed" | "off_track";
export type ReadinessBand = "high" | "moderate" | "low";
export type ReadinessDataConfidence = "high" | "medium" | "low";
export type HardConstraintKind =
  | "avoid_exercise"
  | "avoid_muscle"
  | "avoid_workout_type";
export type HardConstraintSource =
  | "pain"
  | "injury"
  | "preference"
  | "equipment"
  | "other";
export type SessionDecisionStatus =
  | "train_as_planned"
  | "train_modified"
  | "train_light"
  | "avoid_overlap";
export type SessionIntensityAdjustment =
  | "normal"
  | "keep_submaximal"
  | "reduce_intensity";
export type SessionVolumeAdjustment =
  | "normal"
  | "reduce_10_percent"
  | "reduce_20_percent"
  | "reduce_30_percent";
export type SuggestedDayBias =
  | "push_bias"
  | "pull_bias"
  | "quad_bias"
  | "hinge_bias";
export type DayOrigin = "planned" | "suggested" | "unplanned";
export type TrainingEffect =
  | "quad_bias"
  | "calf_isolation"
  | "hamstring_isolation"
  | "glute_bias"
  | "trap_isolation"
  | "upper_trap_isolation"
  | "hinge_heavy"
  | "squat_pattern"
  | "unilateral_leg"
  | "horizontal_press"
  | "chest_isolation"
  | "vertical_press"
  | "front_delt_press"
  | "triceps_isolation"
  | "cable_pressdown"
  | "overhead_triceps"
  | "lateral_delt_isolation"
  | "side_delt_bias"
  | "rear_delt_isolation"
  | "vertical_pull"
  | "horizontal_row"
  | "biceps_isolation"
  | "neutral_grip_curl"
  | "supinated_curl";

export interface ExerciseContributionWeights {
  primary: number;
  secondary: number;
  stabilizer: number;
}

export interface ExercisePrescriptionDefaults {
  strengthReps: [number, number];
  hypertrophyReps: [number, number];
  enduranceReps: [number, number];
  sets: [number, number];
  restSeconds: [number, number];
}

export interface ExerciseLibraryEntry {
  exerciseId: string;
  name: string;
  category: ExerciseCategory;
  liftType: LiftType;
  skillLevel: SkillLevel;
  movementPattern: MovementPattern;
  plane: MovementPlane;
  stability: StabilityLevel;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  stabilizers: MuscleGroup[];
  contributionWeights: ExerciseContributionWeights;
  equipment: string[];
  alternatives: string[];
  equipmentType: EquipmentType;
  prescriptionDefaults: ExercisePrescriptionDefaults;
  systemicFatigue: FatigueLevel;
  localFatigue: FatigueLevel;
  fatigueScore: number;
  recoveryTimeHours: number;
  trainingEffects?: TrainingEffect[];
  tags: string[];
}

export interface WorkoutExerciseEntry {
  exerciseId: string;
  sets: number;
  reps: number;
  effort?: SessionEffort;
  performedSets?: ExerciseSetEntry[];
}

export interface ExerciseSetEntry {
  reps: number;
  weightKg?: number;
  effort?: SessionEffort;
  restSeconds?: number;
  completed?: boolean;
}

export interface MuscleLoadSummaryEntry {
  muscle: MuscleGroup;
  totalLoad: number;
  unresolvedLoad: number;
  recoveryTimeHours: number;
  hoursSinceLastWorked?: number;
  hoursUntilRecovered: number;
  recoveryState: RecoveryState;
  riskScore: number;
}

export interface MovementPatternSummaryEntry {
  movementPattern: MovementPattern;
  totalLoad: number;
  unresolvedLoad: number;
  recoveryState: RecoveryState;
}

export interface ExerciseRecommendation {
  exerciseId: string;
  name: string;
  bucket: RecommendationBucket;
  tolerance: ExerciseTolerance;
  fallbackTier?: FallbackTier;
  score: number;
  reasons: string[];
  provenance?: ExerciseRecommendationProvenance;
}

export interface ExerciseRecommendationProvenance {
  selectionSource: ExerciseSelectionSource;
  templateFitApplied: boolean;
  recoveryPenaltyApplied: boolean;
  equipmentConstraintApplied: boolean;
  painConstraintApplied: boolean;
  memoryNudgeApplied: boolean;
}

export interface SessionPlanExerciseExample {
  exerciseId: string;
  tolerance?: ExerciseTolerance;
  fallbackTier?: FallbackTier;
}

export interface SessionDecision {
  status: SessionDecisionStatus;
  summary: string;
  sessionMode: string;
  volumeAdjustment: SessionVolumeAdjustment;
  intensityAdjustment: SessionIntensityAdjustment;
  progressionIntent?: "build" | "repeat" | "conservative";
  notes: string[];
}

export interface SessionPlanBlock {
  slot: "main" | "secondary" | "accessory";
  focus: string;
  blockTier?: FallbackTier;
  exampleExerciseIds: string[];
  exampleExercises?: SessionPlanExerciseExample[];
  prescriptionIntent?: {
    sets: "low" | "moderate" | "high";
    reps: "strength_bias" | "hypertrophy_bias" | "pump_bias";
    effort: "submaximal" | "working" | "push";
  };
  progressionCue?: {
    action: "progress" | "repeat" | "hold_back";
    reason: string;
  };
}

export interface SessionPlan {
  sessionStyle: "normal" | "conservative" | "modified" | "accessory_only";
  objective: string;
  coachNote?: string;
  focusMuscles: MuscleGroup[];
  limitMuscles: MuscleGroup[];
  limitPatterns: MovementPattern[];
  volumeGuidance: string;
  intensityGuidance: string;
  blocks: SessionPlanBlock[];
}

export interface ExerciseSubstitutionOption {
  exerciseId: string;
  name: string;
  trainingEffects: TrainingEffect[];
  swapForExerciseIds: string[];
  swapReasonTags: string[];
  reason: string;
  preferredByHistory?: boolean;
  frontendCopy?: {
    title: string;
    actionLabel: string;
    explanation: string;
  };
}

export interface FrontendReadinessCopy {
  sessionLabel: string;
  readinessHeadline: string;
  primaryAction: string;
  fallbackNote?: string;
}

export interface FrontendReadinessExplanation {
  planWhy: string;
  whatChangedToday?: string;
  weekContext?: string;
  whyTodayLooksThisWay: string[];
  focusAreas: string[];
  cautionAreas: string[];
  startingExercises: string[];
}

export interface FrontendExerciseDecisionRationale {
  exerciseId: string;
  name: string;
  why: string[];
  selectionTier?: "best_fit" | "acceptable_fallback";
  provenance?: ExerciseRecommendationProvenance;
}

export interface FrontendReadinessDebugExplanation {
  decisionSummary: string;
  dayProvenance: string;
  confidenceContext?: string;
  topRecoveryLimiters: string[];
  topAvoidedPatterns: string[];
  recommendationNotes: string[];
}

export interface FrontendReadinessDecisionAudit {
  dayOrigin: DayOrigin;
  originReasonLabel?: string;
  originBias?: SuggestedDayBias;
  recommendedTrainingDirection: string;
  recoveredMuscles: MuscleGroup[];
  recoveringMuscles: MuscleGroup[];
  avoidMuscles: MuscleGroup[];
  avoidMovementPatterns: MovementPattern[];
  deprioritizedExercises: FrontendExerciseDecisionRationale[];
  selectedSubstitutes: FrontendExerciseDecisionRationale[];
  userExplanation: string;
  kaiExplanation: string;
  debugExplanation?: FrontendReadinessDebugExplanation;
}

export interface ReadinessDecisionSnapshot {
  dayOrigin: DayOrigin;
  decisionSummary: string;
  recommendedTrainingDirection: string;
  topRecoveryLimiters: string[];
  musclesToAvoid: MuscleGroup[];
  movementPatternsToAvoid: MovementPattern[];
  primaryExerciseIds: string[];
  selectedSubstituteIds?: string[];
}

export interface FrontendWeeklyPlanContext {
  weekStart: string;
  weekEnd: string;
  splitStyle: "full_body" | "upper_lower" | "push_pull_legs" | "hybrid_upper_lower";
  targetSessions: number;
  plannedCount: number;
  completedCount: number;
  remainingPlannedCount: number;
  todayPlanned: boolean;
  weeklyArcPattern?:
    | "building"
    | "rebuilding"
    | "protecting"
    | "oscillating"
    | "steady"
    | "starting";
  weeklyArcHeadline?: string;
  fragileWorkoutTypeLabel?: string;
  suggestedWorkoutTypeLabel?: string;
  suggestedWorkoutTemplateNote?: string;
  suggestedWorkoutDriftLabel?: string;
}

export interface ObjectiveReadinessModel {
  source: "objective_signals_only";
  score: number;
  band: ReadinessBand;
  dataConfidence: ReadinessDataConfidence;
  dataConfidenceScore: number;
  summary: string;
  signalScores: {
    recovery: number;
    comparableHistory: number;
    leadingFatigue: number;
    sessionDemand: number;
  };
  reasons: string[];
}

export interface TrainingReadinessReport {
  userId: string;
  asOf: string;
  plannedWorkoutType?: string;
  readinessModel: ObjectiveReadinessModel;
  sessionDecision: SessionDecision;
  sessionPlan: SessionPlan;
  substitutionOptions: ExerciseSubstitutionOption[];
  muscleLoadSummary: MuscleLoadSummaryEntry[];
  movementPatternSummary: MovementPatternSummaryEntry[];
  overworkedMuscles: MuscleGroup[];
  overworkedPatterns: MovementPattern[];
  recommendedExercises: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
  avoidExercises: ExerciseRecommendation[];
  recommendedMusclesToAvoid: MuscleGroup[];
}

export interface RecommendationMemoryLike {
  byExerciseId: Record<string, number>;
  byExerciseSlotKey: Record<string, number>;
  byReasonTag: Record<string, number>;
  bySubstitutedExerciseId?: Record<string, number>;
  bySubstitutedExerciseSlotKey?: Record<string, number>;
  bySubstitutedWorkoutTypeExerciseKey?: Record<string, number>;
  bySubstitutionPairKey?: Record<string, number>;
}

export interface HardConstraint {
  kind: HardConstraintKind;
  value: string;
  note?: string;
  source?: HardConstraintSource;
}

export interface ReadinessProfileContext {
  goal?: "lose_weight" | "build_muscle" | "get_fitter" | "build_consistency";
  equipmentAccess?:
    | "full_gym"
    | "dumbbells_only"
    | "bodyweight_only"
    | "machines_only"
    | "mixed";
  focusMuscles?: MuscleGroup[];
  favoriteExerciseIds?: string[];
  dislikedExerciseIds?: string[];
  painFlags?: MuscleGroup[];
  hardConstraints?: HardConstraint[];
  plannedFocusMuscles?: MuscleGroup[];
  plannedAvoidMuscles?: MuscleGroup[];
  plannedPreferredExerciseIds?: string[];
}

export interface PlannedDayReadinessContext {
  dayOrigin?: DayOrigin;
  originReasonLabel?: string;
  originBias?: SuggestedDayBias;
  isPlannedDay?: boolean;
  isSuggestedDay?: boolean;
  suggestedDayBias?: SuggestedDayBias;
  workoutType?: string;
  progressionIntent?: "build" | "repeat" | "conservative";
  exerciseIntent?: {
    focusMuscles: MuscleGroup[];
    avoidMuscles: MuscleGroup[];
    preferredExerciseIds: string[];
  };
  sessionTemplate?: {
    sessionStyle: "normal" | "conservative" | "build";
    slots: Array<{
      slot: "main" | "secondary" | "accessory";
      label: string;
      targetEffects: TrainingEffect[];
      candidateExerciseIds: string[];
      selectionReason?: string;
      prescriptionIntent: {
        sets: "low" | "moderate" | "high";
        reps: "strength_bias" | "hypertrophy_bias" | "pump_bias";
        effort: "submaximal" | "working" | "push";
      };
      progressionCue?: {
        action: "progress" | "repeat" | "hold_back";
        reason: string;
      };
    }>;
  };
}

export interface FrontendTrainingReadinessResponse {
  userId: string;
  asOf: string;
  plannedWorkoutType?: string;
  frontendCopy: FrontendReadinessCopy;
  frontendExplanation: FrontendReadinessExplanation;
  decisionAudit: FrontendReadinessDecisionAudit;
  weeklyPlanContext?: FrontendWeeklyPlanContext;
  readinessModel: ObjectiveReadinessModel;
  sessionDecision: SessionDecision;
  sessionPlan: SessionPlan;
  substitutionOptions: ExerciseSubstitutionOption[];
  muscleLoadSummary: MuscleLoadSummaryEntry[];
  overworkedMuscles: MuscleGroup[];
  recoveringMuscles: MuscleGroup[];
  muscleGroupsToAvoidToday: MuscleGroup[];
  exercisesToAvoidToday: ExerciseRecommendation[];
  saferAlternatives: ExerciseRecommendation[];
  deprioritizedExercises: ExerciseRecommendation[];
}

export interface ReadinessHistoryEntry {
  userId: string;
  asOf: string;
  recordedAt: string;
  plannedWorkoutType?: string;
  sessionStyle: SessionPlan["sessionStyle"];
  sessionDecisionStatus: SessionDecisionStatus;
  readinessScore: number;
  readinessBand: ReadinessBand;
  dataConfidence: ReadinessDataConfidence;
  frontendCopy: FrontendReadinessCopy;
  frontendExplanation: FrontendReadinessExplanation;
  focusMuscles: MuscleGroup[];
  limitMuscles: MuscleGroup[];
  overworkedMuscles: MuscleGroup[];
  recoveringMuscles: MuscleGroup[];
  muscleGroupsToAvoidToday: MuscleGroup[];
  primaryExerciseIds: string[];
  decisionSnapshot?: ReadinessDecisionSnapshot;
}
