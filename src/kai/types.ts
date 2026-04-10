import type {
  HardConstraint,
  MuscleGroup,
  ReadinessHistoryEntry,
  TrainingEffect,
  WorkoutExerciseEntry
} from "../exercises/types.js";

export type UserGoal =
  | "lose_weight"
  | "build_muscle"
  | "get_fitter"
  | "build_consistency";

export type ExperienceLevel = "beginner" | "intermediate";
export type TonePreference = "supportive" | "direct" | "balanced";
export type TrainingStylePreference = "full_body" | "split_routine" | "balanced";
export type KaiEquipmentAccess =
  | "full_gym"
  | "dumbbells_only"
  | "bodyweight_only"
  | "machines_only"
  | "mixed";
export type WorkoutStatus = "planned" | "completed" | "missed" | "skipped";
export type MomentumState = "starting" | "steady" | "slipping" | "returning";
export type ConsistencyStatus = "inactive" | "starting" | "building" | "consistent";

export type WorkoutEventType =
  | "workout_completed"
  | "workout_missed"
  | "progress_logged"
  | "user_returned"
  | "weekly_check_in";

export type KaiMessageType =
  | "celebration"
  | "confidence"
  | "reinforcement"
  | "accountability"
  | "reset"
  | "reflection";

export interface UserProfile {
  userId: string;
  name: string;
  goal: UserGoal;
  experienceLevel: ExperienceLevel;
  preferredWorkoutDays: string[];
  targetSessionsPerWeek: number;
  preferredSessionLength: number;
  tonePreference: TonePreference;
}

export interface WorkoutRecord {
  id: string;
  userId: string;
  date: string;
  recordedAt: string;
  type: string;
  plannedDuration: number;
  completedDuration?: number;
  sessionExercises?: WorkoutExerciseEntry[];
  executionFeedback?: WorkoutExecutionFeedback;
  outcomeSummary?: WorkoutOutcomeSummary;
  status: WorkoutStatus;
}

export interface WorkoutOutcomeSummary {
  mainCovered: boolean;
  supportCovered: boolean;
  coveredSlots: number;
  sessionSize: "thin" | "partial" | "full";
  durationCompletionRatio: number;
  executionQuality: "strong" | "workable" | "survival";
  performedWorkoutType?: string;
  followedPlannedWorkout?: boolean;
  followedSuggestedWorkoutType?: boolean;
  substitutionCount?: number;
  totalLoggedSets?: number;
  averageRestSeconds?: number;
  restInflationRatio?: number;
  repDropoffPercent?: number;
  setEffortTrend?: "stable" | "rising" | "sharp_rise";
}

export interface WorkoutExecutionFeedback {
  followedPlannedWorkout?: boolean;
  followedSuggestedWorkoutType?: boolean;
  mainCovered?: boolean;
  supportCovered?: boolean;
  executionQuality?: WorkoutOutcomeSummary["executionQuality"];
  substitutedExerciseIds?: string[];
  substitutionPairs?: Array<{
    fromExerciseId: string;
    toExerciseId: string;
  }>;
}

export interface ProgressLog {
  id: string;
  userId: string;
  date: string;
  metric: string;
  value: number;
}

export interface WorkoutEvent {
  type: WorkoutEventType;
  userId: string;
  occurredAt: string;
}

export interface WorkoutCompletionInput {
  id: string;
  userId: string;
  date: string;
  recordedAt?: string;
  type: string;
  plannedDuration: number;
  completedDuration: number;
  sessionExercises?: WorkoutExerciseEntry[];
  executionFeedback?: WorkoutExecutionFeedback;
}

export interface WorkoutMissedInput {
  id: string;
  userId: string;
  date: string;
  recordedAt?: string;
  type: string;
  plannedDuration: number;
}

export interface PlannedWorkout {
  id: string;
  userId: string;
  date: string;
  type: string;
  plannedDuration: number;
  replan?: PlannedWorkoutReplanMetadata;
}

export interface PlannedWorkoutInput {
  id: string;
  userId: string;
  date: string;
  type: string;
  plannedDuration: number;
  replan?: PlannedWorkoutReplanMetadata;
}

export interface PlannedWorkoutReplanMetadata {
  source: "weekly_plan_generation" | "current_week_replan";
  appliedAt: string;
  adaptationAction?: KaiWeeklyAdaptationAction;
  reason: string;
}

export interface BehaviorSignals {
  lastActivityAt?: string;
  lastCompletedWorkoutAt?: string;
  inactiveDays: number;
  recentCompletedCount: number;
  recentMissedCount: number;
  currentStreak: number;
  longestStreak: number;
  consistencyScore: number;
  consistencyStatus: ConsistencyStatus;
}

export type KaiCoachingCategory =
  | "celebrate"
  | "encourage"
  | "accountability"
  | "reset"
  | "start";

export interface KaiCoachingMessage {
  category: KaiCoachingCategory;
  text: string;
  reason: string;
  nextStep: string;
}

export interface KaiPlanMatch {
  matchedPlanned: boolean;
  plannedWorkout?: PlannedWorkout;
}

export interface KaiWeeklySummary {
  weekStart: string;
  weekEnd: string;
  weekStatus: "not_started" | "mixed" | "on_track" | "off_track";
  plannedCount: number;
  completedCount: number;
  missedCount: number;
  plannedCompletedCount: number;
  plannedMissedCount: number;
  unplannedCompletedCount: number;
  remainingPlannedCount: number;
  planAdherencePercent: number;
  mainCoveragePercent: number;
  supportCoveragePercent: number;
  thinSessionCount: number;
  fullSessionCount: number;
  survivalSessionCount?: number;
  strongSessionCount?: number;
  explicitPlannedFollowThroughCount?: number;
  suggestedFollowThroughCount?: number;
  substitutionCount?: number;
  setFatigueFlagCount?: number;
  restInflationSessionCount?: number;
  repDropoffSessionCount?: number;
}

export type KaiWeeklyReviewState =
  | "building"
  | "steady"
  | "protecting"
  | "resetting";

export type KaiWeeklyAdaptationAction =
  | "build_next_week"
  | "hold_next_week"
  | "protect_next_week"
  | "reset_next_week";

export interface KaiWeeklyReview {
  state: KaiWeeklyReviewState;
  adaptationAction: KaiWeeklyAdaptationAction;
  headline: string;
  reasons: string[];
  nextWeekFocus: string;
}

export interface KaiCurrentWeekReplan {
  active: boolean;
  source?: PlannedWorkoutReplanMetadata["source"];
  adaptationAction?: KaiWeeklyAdaptationAction;
  appliedAt?: string;
  reason?: string;
  affectedPlannedCount: number;
}

export interface KaiWeeklyDecisionLogEntry {
  kind: "generated" | "reviewed" | "replanned";
  occurredAt: string;
  headline: string;
  details: string[];
}

export interface KaiWeeklyInsight {
  kind:
    | "execution"
    | "readiness"
    | "set_fatigue"
    | "progression"
    | "execution_alignment"
    | "adherence"
    | "main_work"
    | "support_work"
    | "momentum"
    | "workout_type"
    | "exercise_history"
    | "session_pattern"
    | "selection";
  title: string;
  detail: string;
}

export interface KaiWeeklyChapter {
  tone: KaiWeeklyReviewState;
  title: string;
  summary: string;
  storyBeats: string[];
  wins: string[];
  frictions: string[];
  nextChapter: string;
}

export interface KaiWeeklyChapterHistoryEntry {
  userId: string;
  asOf: string;
  weekStart: string;
  weekEnd: string;
  recordedAt: string;
  reviewState: KaiWeeklyReviewState;
  adaptationAction: KaiWeeklyAdaptationAction;
  chapter: KaiWeeklyChapter;
  insightTitles: string[];
  readinessEntryCount: number;
}

export interface KaiWeeklyArc {
  pattern:
    | "building"
    | "rebuilding"
    | "protecting"
    | "oscillating"
    | "steady"
    | "starting";
  headline: string;
  summary: string;
  recentStates: KaiWeeklyReviewState[];
  recentChapterTitles: string[];
}

export type KaiExercisePerformanceSignalSource = "weight_reps" | "reps_volume";
export type KaiExerciseProgressionVelocity =
  | "rising"
  | "steady"
  | "slipping"
  | "insufficient_data";

export interface KaiExercisePerformanceSummary {
  signalSource?: KaiExercisePerformanceSignalSource;
  latestPerformanceScore?: number;
  baselinePerformanceScore?: number;
  performanceDeltaPercent?: number;
  progressionVelocity?: KaiExerciseProgressionVelocity;
  latestWasPersonalBest?: boolean;
  personalBestCount?: number;
}

export interface KaiWeeklyPayload {
  userId: string;
  asOf: string;
  profile?: KaiUserProfile;
  weeklyState: KaiWeeklyState;
  weeklySummary: KaiWeeklySummary;
  weeklyReview: KaiWeeklyReview;
  weeklyInsights: KaiWeeklyInsight[];
  weeklyChapter: KaiWeeklyChapter;
  weeklyArc?: KaiWeeklyArc;
  weeklyReadinessHistory: ReadinessHistoryEntry[];
  recentExerciseHistory: Array<{
    exerciseId: string;
    name: string;
    appearances: number;
    lastPerformedAt: string;
    averageSets: number;
    averageReps: number;
    commonEffort?: WorkoutExerciseEntry["effort"];
    executionQuality: WorkoutOutcomeSummary["executionQuality"];
    followedPlannedRate?: number;
    followedSuggestedRate?: number;
    averageSubstitutionCount?: number;
  } & KaiExercisePerformanceSummary>;
  weeklyPerformanceSignals: Array<{
    exerciseId: string;
    name: string;
    lastPerformedAt: string;
    signalSource: KaiExercisePerformanceSignalSource;
    latestPerformanceScore: number;
    baselinePerformanceScore?: number;
    performanceDeltaPercent?: number;
    progressionVelocity: KaiExerciseProgressionVelocity;
    latestWasPersonalBest: boolean;
    personalBestCount: number;
  }>;
  weeklyProgressionHighlights: Array<{
    date: string;
    workoutType: string;
    slot: "main" | "secondary" | "accessory";
    label: string;
    action: "progress" | "repeat" | "hold_back";
    reason: string;
    selectionReason?: string;
  }>;
  weeklyExerciseInsights: Array<{
    exerciseId: string;
    name: string;
    action: "progress" | "repeat" | "hold_back";
    occurrences: number;
    workoutTypes: string[];
    reasons: string[];
    selectionReasons?: string[];
  }>;
  currentWeekReplan?: KaiCurrentWeekReplan;
  weeklyDecisionLog: KaiWeeklyDecisionLogEntry[];
  nextPlannedWorkout?: PlannedWorkout;
  kai: KaiCoachingMessage;
}

export interface KaiWeeklyPlanDay {
  date: string;
  dayName: string;
  workoutType?: string;
  plannedDuration?: number;
  status: "planned" | "rest";
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
  rationale: string;
}

export interface KaiWeeklyPlan {
  userId: string;
  asOf: string;
  weekStart: string;
  weekEnd: string;
  profile?: KaiUserProfile;
  recoveryStatus?: KaiRecoveryStatus;
  targetSessions: number;
  splitStyle:
    | "full_body"
    | "upper_lower"
    | "push_pull_legs"
    | "hybrid_upper_lower";
  rationale: string;
  days: KaiWeeklyPlanDay[];
}

export interface KaiPayload {
  userId: string;
  asOf: string;
  profile?: KaiUserProfile;
  dashboardState: KaiDashboardState;
  todayStatus: KaiTodayStatus;
  memory: KaiMemory;
  recentEvent: KaiRecentEvent;
  planMatch: KaiPlanMatch;
  plannedWorkoutForDay?: PlannedWorkout;
  nextPlannedWorkout?: PlannedWorkout;
  weeklyPlanContext?: KaiWeeklyPlanContext;
  signals: BehaviorSignals;
  kai: KaiCoachingMessage;
}

export interface KaiWeeklyPlanContext {
  weekStart: string;
  weekEnd: string;
  splitStyle: KaiWeeklyPlan["splitStyle"];
  targetSessions: number;
  plannedCount: number;
  completedCount: number;
  remainingPlannedCount: number;
  todayPlanned: boolean;
  weeklyReviewState?: KaiWeeklyReviewState;
  weeklyAdaptationAction?: KaiWeeklyAdaptationAction;
  currentWeekReplan?: KaiCurrentWeekReplan;
  weeklyArcPattern?: KaiWeeklyArc["pattern"];
  weeklyArcHeadline?: string;
  weeklyProgressPattern?: "quiet_progress" | "flattened_progress";
  weeklyProgressHeadline?: string;
  fragileWorkoutTypeLabel?: string;
  suggestedWorkoutTypeLabel?: string;
  suggestedWorkoutReasonLabel?: string;
  suggestedWorkoutTemplateNote?: string;
  suggestedWorkoutDriftLabel?: string;
}

export type KaiRecentEventType =
  | "workout_completed"
  | "workout_missed"
  | "none";

export interface KaiUserProfile {
  userId: string;
  name: string;
  goal: UserGoal;
  experienceLevel: ExperienceLevel;
  preferredWorkoutDays?: string[];
  targetSessionsPerWeek?: number;
  preferredSessionLength?: number;
  tonePreference?: TonePreference;
  equipmentAccess?: KaiEquipmentAccess;
  trainingStylePreference?: TrainingStylePreference;
  confidenceLevel?: KaiConfidenceLevel;
  focusMuscles?: MuscleGroup[];
  favoriteExerciseIds?: string[];
  dislikedExerciseIds?: string[];
  painFlags?: MuscleGroup[];
  constraints?: string[];
  hardConstraints?: HardConstraint[];
}

export interface KaiAppProfileSnapshot {
  userId: string;
  name?: string | null;
  goal?: UserGoal | "lose_fat" | "gain_muscle" | "get_stronger" | null;
  primaryGoal?: "hypertrophy" | "strength" | "both" | null;
  experienceLevel?: ExperienceLevel | "new" | "novice" | "experienced" | null;
  weeklyCommitment?: number | null;
  sessionLength?: number | null;
  preferredWorkoutDays?: string[] | null;
  tonePreference?: TonePreference | null;
  equipment?: KaiEquipmentAccess | "home" | "gym" | null;
  trainingStylePreference?: TrainingStylePreference | "full_body_bias" | "split_bias" | null;
  confidenceLevel?: KaiConfidenceLevel | "unsure" | "confident" | null;
  focusMuscles?: MuscleGroup[] | null;
  favoriteExerciseIds?: string[] | null;
  dislikedExerciseIds?: string[] | null;
  painFlags?: MuscleGroup[] | null;
  constraints?: string[] | null;
  hardConstraints?: HardConstraint[] | null;
}

export interface KaiRecentEvent {
  type: KaiRecentEventType;
  workoutType?: string;
  date?: string;
}

export type KaiDashboardState =
  | "planned_today"
  | "logged_today"
  | "recovering"
  | "momentum"
  | "idle";

export interface KaiTodayStatus {
  outcome: "completed" | "missed" | "none";
  hasLoggedToday: boolean;
  canLogCompleted: boolean;
  canLogMissed: boolean;
}

export type KaiWeeklyState =
  | "not_started"
  | "in_progress"
  | "completed"
  | "off_track";

export type KaiMotivationStyle = "supportive" | "direct" | "balanced";
export type KaiConfidenceLevel = "low" | "building" | "high";
export type KaiRestartStyle = "small_sessions" | "standard_sessions";
export type KaiConsistencyRisk = "low" | "medium" | "high";
export type KaiRecoveryStatus =
  | "on_track"
  | "slipping"
  | "restarting"
  | "recovered";
export type KaiRecoveryActionType =
  | "log_short_session"
  | "complete_check_in"
  | "resume_last_pattern"
  | "minimum_viable_plan";

export interface KaiRecommendationMemory {
  byExerciseId: Record<string, number>;
  byExerciseSlotKey: Record<string, number>;
  byReasonTag: Record<string, number>;
  bySubstitutedExerciseId?: Record<string, number>;
  bySubstitutedExerciseSlotKey?: Record<string, number>;
  bySubstitutedWorkoutTypeExerciseKey?: Record<string, number>;
  bySubstitutionPairKey?: Record<string, number>;
}

export interface KaiSessionPatternMemory {
  patternLabel: "stable_split" | "alternating_mix" | "repeat_day_by_day" | "unsettled";
  dominantWorkoutTypes: string[];
  recentSequence: string[];
  commonTransitions: string[];
  structuredPatternConfidence: number;
}

export interface KaiSuggestedWorkoutMemory {
  overallFollowThroughRate: number;
  dominantDrift?: {
    suggestedWorkoutType: string;
    performedWorkoutType: string;
    occurrences: number;
    followThroughRate: number;
  };
}

export interface KaiRecoveryAction {
  type: KaiRecoveryActionType;
  label: string;
  detail: string;
}

export interface KaiMemory {
  userId: string;
  name: string;
  goal: UserGoal;
  experienceLevel: ExperienceLevel;
  motivationStyle: KaiMotivationStyle;
  consistencyStatus: ConsistencyStatus;
  consistencyScore: number;
  currentStreak: number;
  recentCompletedCount: number;
  recentMissedCount: number;
  lastActivityAt?: string;
  restartStyle: KaiRestartStyle;
  consistencyRisk: KaiConsistencyRisk;
  recoveryStatus: KaiRecoveryStatus;
  recommendationTrustScore: number;
  recommendationMemory: KaiRecommendationMemory;
  sessionPatternMemory: KaiSessionPatternMemory;
  suggestedWorkoutMemory?: KaiSuggestedWorkoutMemory;
  nextRecoveryAction?: KaiRecoveryAction;
  coachingNote: string;
  lastUpdated: string;
}

export interface KaiState {
  consistencyScore: number;
  recentMissedCount: number;
  recentCompletedCount: number;
  currentStreak: number;
  longestStreak: number;
  inactiveDays: number;
  momentumState: MomentumState;
  lastKaiMessageType?: KaiMessageType;
  lastKaiMessageAt?: string;
}

export interface KaiMessage {
  type: KaiMessageType;
  tone: TonePreference;
  text: string;
}

export interface KaiContext {
  user: UserProfile;
  workouts: WorkoutRecord[];
  progressLogs: ProgressLog[];
  event: WorkoutEvent;
  state: KaiState;
}
