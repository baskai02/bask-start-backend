import { buildBehaviorSignals, recordWorkoutCompleted, recordWorkoutMissed } from "../kai/tracker.js";
import { buildKaiCoachingMessage } from "../kai/coach.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";
export function createAppStore(options = {}) {
    const workoutsByUser = loadWorkoutsMap(options.storageFilePath);
    return {
        getWorkouts(userId) {
            return workoutsByUser.get(userId) ?? [];
        },
        recordCompletedWorkout(input) {
            const currentWorkouts = workoutsByUser.get(input.userId) ?? [];
            const nextWorkouts = recordWorkoutCompleted(currentWorkouts, input);
            workoutsByUser.set(input.userId, nextWorkouts);
            persistWorkoutsMap(workoutsByUser, options.storageFilePath);
            return nextWorkouts;
        },
        recordMissedWorkout(input) {
            const currentWorkouts = workoutsByUser.get(input.userId) ?? [];
            const nextWorkouts = recordWorkoutMissed(currentWorkouts, input);
            workoutsByUser.set(input.userId, nextWorkouts);
            persistWorkoutsMap(workoutsByUser, options.storageFilePath);
            return nextWorkouts;
        },
        clearWorkouts(userId) {
            workoutsByUser.delete(userId);
            persistWorkoutsMap(workoutsByUser, options.storageFilePath);
        },
        getRecentEvent(userId, asOf) {
            const workouts = workoutsByUser.get(userId) ?? [];
            const matchingWorkouts = workouts
                .filter((workout) => workout.date <= asOf)
                .sort(compareWorkoutsByTimeline);
            const latestWorkout = matchingWorkouts[matchingWorkouts.length - 1];
            if (!latestWorkout) {
                return { type: "none" };
            }
            return {
                type: latestWorkout.status === "missed"
                    ? "workout_missed"
                    : latestWorkout.status === "completed"
                        ? "workout_completed"
                        : "none",
                workoutType: latestWorkout.type,
                date: latestWorkout.date
            };
        },
        getBehaviorSignals(userId, asOf) {
            const workouts = workoutsByUser.get(userId) ?? [];
            return buildBehaviorSignals(workouts, asOf);
        },
        getKaiMessage(userId, asOf, profile, memory, planMatch, plannedWorkoutForDay, nextPlannedWorkout, trainingReadiness) {
            const signals = this.getBehaviorSignals(userId, asOf);
            const recentEvent = this.getRecentEvent(userId, asOf);
            return buildKaiCoachingMessage(signals, recentEvent, profile, memory, planMatch, plannedWorkoutForDay, nextPlannedWorkout, trainingReadiness);
        }
    };
}
function loadWorkoutsMap(storageFilePath) {
    const parsed = loadJsonFile(storageFilePath, {});
    const normalizedEntries = Object.entries(parsed).map(([userId, workouts]) => [
        userId,
        workouts.map((workout) => ({
            ...workout,
            recordedAt: workout.recordedAt ?? `${workout.date}T12:00:00.000Z`
        }))
    ]);
    return new Map(normalizedEntries);
}
function persistWorkoutsMap(workoutsByUser, storageFilePath) {
    if (!storageFilePath) {
        return;
    }
    const serializable = Object.fromEntries(workoutsByUser.entries());
    saveJsonFile(storageFilePath, serializable);
}
function getRecordedAt(workout) {
    return workout.recordedAt ?? `${workout.date}T12:00:00.000Z`;
}
function compareWorkoutsByTimeline(a, b) {
    const dateComparison = a.date.localeCompare(b.date);
    if (dateComparison !== 0) {
        return dateComparison;
    }
    return getRecordedAt(a).localeCompare(getRecordedAt(b));
}
