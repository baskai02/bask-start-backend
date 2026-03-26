export function buildKaiMemory(input) {
    return {
        userId: input.profile.userId,
        name: input.profile.name,
        goal: input.profile.goal,
        experienceLevel: input.profile.experienceLevel,
        motivationStyle: decideMotivationStyle(input.profile, input.signals),
        consistencyStatus: input.signals.consistencyStatus,
        consistencyScore: input.signals.consistencyScore,
        currentStreak: input.signals.currentStreak,
        recentCompletedCount: input.signals.recentCompletedCount,
        recentMissedCount: input.signals.recentMissedCount,
        lastActivityAt: input.signals.lastActivityAt,
        restartStyle: decideRestartStyle(input.profile, input.signals, input.previousMemory),
        consistencyRisk: decideConsistencyRisk(input.signals),
        coachingNote: buildCoachingNote(input.profile, input.signals),
        lastUpdated: input.asOf
    };
}
function decideMotivationStyle(profile, signals) {
    if (profile.experienceLevel === "beginner") {
        return "supportive";
    }
    if (signals.recentMissedCount >= 3) {
        return "supportive";
    }
    if (signals.currentStreak >= 3 || signals.consistencyStatus === "consistent") {
        return "direct";
    }
    return "balanced";
}
function decideRestartStyle(profile, signals, previousMemory) {
    if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 4) {
        return "small_sessions";
    }
    if (previousMemory?.restartStyle === "small_sessions" &&
        signals.currentStreak < 3 &&
        signals.consistencyStatus !== "consistent") {
        return "small_sessions";
    }
    return profile.experienceLevel === "beginner"
        ? "small_sessions"
        : "standard_sessions";
}
function decideConsistencyRisk(signals) {
    if (signals.recentMissedCount >= 3 || signals.inactiveDays >= 4) {
        return "high";
    }
    if (signals.recentMissedCount >= 1 || signals.consistencyStatus === "building") {
        return "medium";
    }
    return "low";
}
function buildCoachingNote(profile, signals) {
    if (signals.recentMissedCount >= 3) {
        return profile.goal === "build_consistency"
            ? "Needs low-friction resets after missed workouts."
            : "Needs a simpler rebuild step before pushing intensity.";
    }
    if (signals.currentStreak >= 3) {
        return "Responding well to rhythm and repeatable sessions.";
    }
    if (signals.recentCompletedCount >= 2) {
        return "Building consistency through recent follow-through.";
    }
    return "Needs clear, simple next steps to build rhythm.";
}
