import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppStore } from "../store/app-store.js";
import { createMemoryStore } from "../store/memory-store.js";
import { createPlannedWorkoutStore } from "../store/planned-workout-store.js";
import { createProfileStore } from "../store/profile-store.js";
import { createKaiService } from "../kai/service.js";
import { buildTrainingReadinessReport } from "../exercises/readiness.js";
import type {
  ExerciseSubstitutionOption,
  SessionPlan,
  WorkoutExerciseEntry
} from "../exercises/types.js";
import type { KaiUserProfile, PlannedWorkoutInput } from "../kai/types.js";

const USER_ID = "sim_intermediate_ppl";
const START_DATE = "2026-03-02";
const TOTAL_DAYS = 28;
const SPLIT_SEQUENCE = ["push_day", "pull_day", "lower_body"] as const;

const PUSH_TEMPLATE: WorkoutExerciseEntry[] = [
  { exerciseId: "barbell_bench_press", sets: 4, reps: 6, effort: "hard" },
  { exerciseId: "incline_dumbbell_press", sets: 3, reps: 8, effort: "moderate" },
  { exerciseId: "lateral_raise", sets: 3, reps: 15, effort: "moderate" },
  { exerciseId: "triceps_rope_pushdown", sets: 3, reps: 12, effort: "moderate" }
];

const PULL_TEMPLATE: WorkoutExerciseEntry[] = [
  { exerciseId: "lat_pulldown", sets: 4, reps: 8, effort: "hard" },
  { exerciseId: "chest_supported_machine_row", sets: 3, reps: 10, effort: "moderate" },
  { exerciseId: "hammer_curl", sets: 3, reps: 12, effort: "moderate" },
  { exerciseId: "shrug", sets: 3, reps: 12, effort: "moderate" }
];

const LOWER_TEMPLATE: WorkoutExerciseEntry[] = [
  { exerciseId: "leg_press", sets: 4, reps: 8, effort: "hard" },
  { exerciseId: "romanian_deadlift", sets: 3, reps: 8, effort: "hard" },
  { exerciseId: "leg_extension", sets: 3, reps: 12, effort: "moderate" },
  { exerciseId: "calf_raise", sets: 4, reps: 15, effort: "moderate" }
];

interface SimulationDay {
  date: string;
  dayName: string;
  plannedWorkoutType?: string;
  sessionStyle?: SessionPlan["sessionStyle"];
  completed: boolean;
  completedDuration?: number;
  exerciseIds?: string[];
  readinessHeadline?: string;
  sessionSummary?: string;
  kaiCategory?: string;
  kaiText?: string;
  topAvoidMuscles?: string[];
  substitutionTitles?: string[];
}

interface SimulationSummary {
  userId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  plannedTrainingDays: number;
  completedTrainingDays: number;
  restDays: number;
  sessionStyles: Record<string, number>;
  kaiCategories: Record<string, number>;
  latestConsistencyScore: number;
  latestConsistencyStatus: string;
  longestStreak: number;
}

interface SimulationReport {
  summary: SimulationSummary;
  days: SimulationDay[];
}

runSimulation();

function runSimulation(): void {
  const root = join(tmpdir(), `bask-month-sim-${Date.now()}`);
  const workoutsPath = join(root, "workouts.json");
  const profilesPath = join(root, "profiles.json");
  const memoryPath = join(root, "memory.json");
  const plannedPath = join(root, "planned.json");

  const store = createAppStore({ storageFilePath: workoutsPath });
  const profileStore = createProfileStore({ storageFilePath: profilesPath });
  const memoryStore = createMemoryStore({ storageFilePath: memoryPath });
  const plannedWorkoutStore = createPlannedWorkoutStore({ storageFilePath: plannedPath });
  const kaiService = createKaiService({
    store,
    profileStore,
    memoryStore,
    plannedWorkoutStore
  });

  const profile: KaiUserProfile = profileStore.saveProfile({
    userId: USER_ID,
    name: "Mika",
    goal: "build_muscle",
    experienceLevel: "intermediate"
  });

  const days: SimulationDay[] = [];

  for (let dayIndex = 0; dayIndex < TOTAL_DAYS; dayIndex += 1) {
    const date = addDays(START_DATE, dayIndex);
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
    const isRestDay = dayOfWeek === 0;

    if (isRestDay) {
      const kaiPayload = kaiService.getKaiPayload(USER_ID, date, profile);
      days.push({
        date,
        dayName: formatDayName(dayOfWeek),
        completed: false,
        kaiCategory: kaiPayload.kai.category,
        kaiText: kaiPayload.kai.text
      });
      continue;
    }

    const plannedWorkoutType = SPLIT_SEQUENCE[(dayIndex - Math.floor(dayIndex / 7)) % 3];
    const plannedWorkout = createPlannedWorkout(
      USER_ID,
      `planned_${dayIndex + 1}`,
      date,
      plannedWorkoutType,
      75
    );
    plannedWorkoutStore.savePlannedWorkout(plannedWorkout);

    const readiness = buildTrainingReadinessReport(
      USER_ID,
      store.getWorkouts(USER_ID),
      date,
      plannedWorkoutType,
      profile.experienceLevel
    );
    const simulatedSession = buildSimulatedSession(
      plannedWorkoutType,
      readiness.sessionPlan,
      readiness.substitutionOptions
    );

    store.recordCompletedWorkout({
      id: `workout_${dayIndex + 1}`,
      userId: USER_ID,
      date,
      recordedAt: `${date}T18:00:00.000Z`,
      type: plannedWorkoutType,
      plannedDuration: 75,
      completedDuration: simulatedSession.completedDuration,
      sessionExercises: simulatedSession.sessionExercises
    });

    const kaiPayload = kaiService.getKaiPayload(USER_ID, date, profile);

    days.push({
      date,
      dayName: formatDayName(dayOfWeek),
      plannedWorkoutType,
      sessionStyle: readiness.sessionPlan.sessionStyle,
      completed: true,
      completedDuration: simulatedSession.completedDuration,
      exerciseIds: simulatedSession.sessionExercises.map((entry) => entry.exerciseId),
      readinessHeadline: summarizeReadiness(readiness.sessionPlan),
      sessionSummary: readiness.sessionDecision.summary,
      kaiCategory: kaiPayload.kai.category,
      kaiText: kaiPayload.kai.text,
      topAvoidMuscles: readiness.overworkedMuscles.slice(0, 3),
      substitutionTitles: readiness.substitutionOptions
        .slice(0, 2)
        .map((option) => option.frontendCopy?.title ?? option.name)
    });
  }

  const lastDate = days[days.length - 1]?.date ?? START_DATE;
  const finalSignals = store.getBehaviorSignals(USER_ID, lastDate);
  const report: SimulationReport = {
    summary: buildSummary(days, finalSignals, START_DATE, lastDate),
    days
  };

  const reportDir = join(process.cwd(), "reports");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, "monthly-ppl-simulation.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Saved simulation report to ${reportPath}`);
  console.log("");
  console.log("Summary");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("");
  console.log("Last 5 training days");
  console.log(
    JSON.stringify(
      days.filter((day) => day.completed).slice(-5),
      null,
      2
    )
  );
}

function buildSummary(
  days: SimulationDay[],
  finalSignals: {
    consistencyScore: number;
    consistencyStatus: string;
    longestStreak: number;
  },
  startDate: string,
  endDate: string
): SimulationSummary {
  const sessionStyles = countBy(
    days.map((day) => day.sessionStyle).filter(Boolean) as string[]
  );
  const kaiCategories = countBy(
    days.map((day) => day.kaiCategory).filter(Boolean) as string[]
  );
  const plannedTrainingDays = days.filter((day) => Boolean(day.plannedWorkoutType)).length;
  const completedTrainingDays = days.filter((day) => day.completed).length;

  return {
    userId: USER_ID,
    startDate,
    endDate,
    totalDays: days.length,
    plannedTrainingDays,
    completedTrainingDays,
    restDays: days.length - plannedTrainingDays,
    sessionStyles,
    kaiCategories,
    latestConsistencyScore: finalSignals.consistencyScore,
    latestConsistencyStatus: finalSignals.consistencyStatus,
    longestStreak: finalSignals.longestStreak
  };
}

function buildSimulatedSession(
  plannedWorkoutType: string,
  sessionPlan: SessionPlan,
  substitutionOptions: ExerciseSubstitutionOption[]
): {
  completedDuration: number;
  sessionExercises: WorkoutExerciseEntry[];
} {
  if (sessionPlan.sessionStyle === "accessory_only") {
    const accessoryExercises = buildReducedSessionExerciseIds(
      plannedWorkoutType,
      sessionPlan,
      substitutionOptions,
      3
    );

    return {
      completedDuration: 25,
      sessionExercises: accessoryExercises.map((exerciseId) => ({
        exerciseId,
        sets: 3,
        reps: 12,
        effort: "moderate"
      }))
    };
  }

  if (sessionPlan.sessionStyle === "modified") {
    const modifiedExercises = buildReducedSessionExerciseIds(
      plannedWorkoutType,
      sessionPlan,
      substitutionOptions,
      3
    );

    return {
      completedDuration: 55,
      sessionExercises: modifiedExercises.map((exerciseId, index) => ({
        exerciseId,
        sets: index === 0 ? 4 : 3,
        reps: index === 0 ? 8 : 12,
        effort: "moderate"
      }))
    };
  }

  const substitutions = substitutionOptions.flatMap((option) => option.swapForExerciseIds);
  const templateExercises = getTemplateExercises(plannedWorkoutType);
  const plannedExercises = collectPlanExercises(sessionPlan);

  return {
    completedDuration: 70,
    sessionExercises: (plannedExercises.length >= 3
      ? plannedExercises.slice(0, 4).map((exerciseId, index) => ({
          exerciseId,
          sets: index === 0 ? 4 : 3,
          reps: index === 0 ? 8 : 10,
          effort: "moderate"
        }))
      : substitutions.length >= 2
        ? substitutions.slice(0, 3).map((exerciseId, index) => ({
            exerciseId,
            sets: index === 0 ? 4 : 3,
            reps: index === 0 ? 8 : 10,
            effort: "moderate"
          }))
      : templateExercises)
  };
}

function collectPlanExercises(sessionPlan: SessionPlan): string[] {
  const planned = sessionPlan.blocks.flatMap((block) =>
    (block.exampleExercises ?? []).map((exercise) => exercise.exerciseId)
  );

  if (planned.length) {
    return dedupe(planned);
  }

  return dedupe(
    sessionPlan.blocks.flatMap((block) => block.exampleExerciseIds)
  );
}

function buildReducedSessionExerciseIds(
  plannedWorkoutType: string,
  sessionPlan: SessionPlan,
  substitutionOptions: ExerciseSubstitutionOption[],
  targetCount: number
): string[] {
  const planExercises = collectPlanExercises(sessionPlan);
  const substitutionExercises = substitutionOptions.flatMap((option) =>
    option.swapForExerciseIds
  );
  const reducedTemplateExercises = getReducedTemplateExerciseIds(plannedWorkoutType);
  const fullTemplateExercises = getTemplateExercises(plannedWorkoutType).map(
    (entry) => entry.exerciseId
  );

  return dedupe([
    ...planExercises,
    ...substitutionExercises,
    ...reducedTemplateExercises,
    ...fullTemplateExercises
  ]).slice(0, targetCount);
}

function createPlannedWorkout(
  userId: string,
  id: string,
  date: string,
  type: string,
  plannedDuration: number
): PlannedWorkoutInput {
  return {
    id,
    userId,
    date,
    type,
    plannedDuration
  };
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDayName(dayOfWeek: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];
}

function summarizeReadiness(sessionPlan: SessionPlan): string {
  if (sessionPlan.sessionStyle === "accessory_only") {
    return sessionPlan.coachNote ?? sessionPlan.objective;
  }

  return sessionPlan.objective;
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function getReducedTemplateExerciseIds(plannedWorkoutType: string): string[] {
  if (plannedWorkoutType === "push_day") {
    return ["lateral_raise", "tricep_pushdown", "cable_chest_fly"];
  }

  if (plannedWorkoutType === "pull_day") {
    return ["shrug", "hammer_curl", "rear_delt_fly"];
  }

  if (plannedWorkoutType === "lower_body") {
    return ["leg_curl", "calf_raise", "leg_extension"];
  }

  return getTemplateExercises(plannedWorkoutType)
    .map((entry) => entry.exerciseId)
    .slice(0, 3);
}

function getTemplateExercises(plannedWorkoutType: string): WorkoutExerciseEntry[] {
  if (plannedWorkoutType === "push_day") {
    return PUSH_TEMPLATE;
  }

  if (plannedWorkoutType === "pull_day") {
    return PULL_TEMPLATE;
  }

  return LOWER_TEMPLATE;
}
