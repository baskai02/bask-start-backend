const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NO_ACTIVITY_DAYS = 999;
export function recordWorkoutCompleted(workouts, input) {
    const nextWorkout = {
        id: input.id,
        userId: input.userId,
        date: input.date,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        type: input.type,
        plannedDuration: input.plannedDuration,
        completedDuration: input.completedDuration,
        sessionExercises: input.sessionExercises,
        status: "completed"
    };
    return upsertWorkout(workouts, nextWorkout);
}
export function recordWorkoutMissed(workouts, input) {
    const nextWorkout = {
        id: input.id,
        userId: input.userId,
        date: input.date,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        type: input.type,
        plannedDuration: input.plannedDuration,
        status: "missed"
    };
    return upsertWorkout(workouts, nextWorkout);
}
export function buildBehaviorSignals(workouts, asOf) {
    const workoutsUpToAsOf = workouts.filter((workout) => workout.date <= asOf);
    const sortedWorkouts = [...workoutsUpToAsOf].sort((a, b) => a.date.localeCompare(b.date));
    const recentWorkouts = filterRecentWorkouts(sortedWorkouts, asOf);
    const completedWorkouts = sortedWorkouts.filter((workout) => workout.status === "completed");
    const dailyTimeline = buildDailyTimeline(sortedWorkouts);
    const recentCompletedCount = recentWorkouts.filter((workout) => workout.status === "completed").length;
    const recentMissedCount = recentWorkouts.filter((workout) => workout.status === "missed").length;
    const lastActivityAt = getLastActivityAt(sortedWorkouts);
    const lastCompletedWorkoutAt = getLastCompletedWorkoutAt(completedWorkouts);
    const inactiveDays = lastActivityAt
        ? diffInDays(asOf, lastActivityAt)
        : NO_ACTIVITY_DAYS;
    const currentStreak = calculateCurrentStreak(dailyTimeline, lastActivityAt);
    const longestStreak = calculateLongestStreak(dailyTimeline);
    const consistencyScore = calculateConsistencyScore(recentCompletedCount, recentMissedCount);
    return {
        lastActivityAt,
        lastCompletedWorkoutAt,
        inactiveDays,
        recentCompletedCount,
        recentMissedCount,
        currentStreak,
        longestStreak,
        consistencyScore,
        consistencyStatus: decideConsistencyStatus(recentCompletedCount, recentMissedCount, inactiveDays)
    };
}
function upsertWorkout(workouts, nextWorkout) {
    const existingIndex = workouts.findIndex((workout) => workout.id === nextWorkout.id);
    if (existingIndex === -1) {
        return [...workouts, nextWorkout];
    }
    const nextWorkouts = [...workouts];
    nextWorkouts[existingIndex] = nextWorkout;
    return nextWorkouts;
}
function filterRecentWorkouts(workouts, asOf) {
    return workouts.filter((workout) => {
        const daysAgo = diffInDays(asOf, workout.date);
        return daysAgo >= 0 && daysAgo <= 6;
    });
}
function getLastActivityAt(workouts) {
    if (workouts.length === 0) {
        return undefined;
    }
    return [...workouts]
        .sort(compareWorkoutsByTimeline)[workouts.length - 1].date;
}
function getLastCompletedWorkoutAt(completedWorkouts) {
    if (completedWorkouts.length === 0) {
        return undefined;
    }
    return [...completedWorkouts]
        .sort(compareWorkoutsByTimeline)[completedWorkouts.length - 1].date;
}
function calculateCurrentStreak(dailyTimeline, lastActivityAt) {
    if (dailyTimeline.length === 0) {
        return 0;
    }
    if (!lastActivityAt) {
        return 0;
    }
    const latestDay = dailyTimeline[dailyTimeline.length - 1];
    if (latestDay.date !== lastActivityAt || latestDay.status !== "completed") {
        return 0;
    }
    let streak = 1;
    for (let i = dailyTimeline.length - 1; i > 0; i -= 1) {
        const currentDay = dailyTimeline[i];
        const previousDay = dailyTimeline[i - 1];
        if (previousDay.status !== "completed") {
            break;
        }
        const gapInDays = diffInDays(currentDay.date, previousDay.date);
        if (gapInDays <= 2) {
            streak += 1;
            continue;
        }
        break;
    }
    return streak;
}
function calculateLongestStreak(dailyTimeline) {
    if (dailyTimeline.length === 0) {
        return 0;
    }
    let longestStreak = 0;
    let currentStreak = 0;
    for (let i = 0; i < dailyTimeline.length; i += 1) {
        const currentDay = dailyTimeline[i];
        if (currentDay.status !== "completed") {
            currentStreak = 0;
            continue;
        }
        if (i === 0) {
            currentStreak = 1;
            continue;
        }
        const previousDay = dailyTimeline[i - 1];
        const gapInDays = diffInDays(currentDay.date, previousDay.date);
        if (previousDay.status === "completed" && gapInDays <= 2) {
            currentStreak += 1;
        }
        else {
            currentStreak = 1;
        }
        longestStreak = Math.max(longestStreak, currentStreak);
    }
    return Math.max(longestStreak, currentStreak);
}
function calculateConsistencyScore(recentCompletedCount, recentMissedCount) {
    const rawScore = 40 + recentCompletedCount * 20 - recentMissedCount * 15;
    return clamp(rawScore, 0, 100);
}
function decideConsistencyStatus(recentCompletedCount, recentMissedCount, inactiveDays) {
    if (inactiveDays >= 7) {
        return "inactive";
    }
    if (recentCompletedCount >= 3 && recentMissedCount === 0) {
        return "consistent";
    }
    if (recentCompletedCount >= 2) {
        return "building";
    }
    return "starting";
}
function diffInDays(laterDate, earlierDate) {
    const later = new Date(laterDate);
    const earlier = new Date(earlierDate);
    return Math.floor((later.getTime() - earlier.getTime()) / DAY_IN_MS);
}
function buildDailyTimeline(workouts) {
    const latestWorkoutByDate = new Map();
    for (const workout of workouts) {
        const existingWorkout = latestWorkoutByDate.get(workout.date);
        if (!existingWorkout) {
            latestWorkoutByDate.set(workout.date, workout);
            continue;
        }
        if (compareWorkoutsByTimeline(existingWorkout, workout) <= 0) {
            latestWorkoutByDate.set(workout.date, workout);
        }
    }
    return [...latestWorkoutByDate.values()].sort(compareWorkoutsByTimeline);
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
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
