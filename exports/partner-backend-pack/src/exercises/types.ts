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
export type WeeklyState = "not_started" | "in_progress" | "completed" | "off_track";
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
  notes: string[];
}

export interface SessionPlanBlock {
  slot: "main" | "secondary" | "accessory";
  focus: string;
  blockTier?: FallbackTier;
  exampleExerciseIds: string[];
  exampleExercises?: SessionPlanExerciseExample[];
}

export interface SessionPlan {
  sessionStyle: "normal" | "modified" | "accessory_only";
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

export interface TrainingReadinessReport {
  userId: string;
  asOf: string;
  plannedWorkoutType?: string;
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

export interface FrontendTrainingReadinessResponse {
  userId: string;
  asOf: string;
  plannedWorkoutType?: string;
  frontendCopy: FrontendReadinessCopy;
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
