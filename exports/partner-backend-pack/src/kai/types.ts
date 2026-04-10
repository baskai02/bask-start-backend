import type { WorkoutExerciseEntry } from "../exercises/types.js";

export type UserGoal =
  | "lose_weight"
  | "build_muscle"
  | "get_fitter"
  | "build_consistency";

export type ExperienceLevel = "beginner" | "intermediate";
export type TonePreference = "supportive" | "direct" | "balanced";
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
  status: WorkoutStatus;
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
}

export interface PlannedWorkoutInput {
  id: string;
  userId: string;
  date: string;
  type: string;
  plannedDuration: number;
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
}

export interface KaiWeeklyPayload {
  userId: string;
  asOf: string;
  profile?: KaiUserProfile;
  weeklyState: KaiWeeklyState;
  weeklySummary: KaiWeeklySummary;
  nextPlannedWorkout?: PlannedWorkout;
  kai: KaiCoachingMessage;
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
  signals: BehaviorSignals;
  kai: KaiCoachingMessage;
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
