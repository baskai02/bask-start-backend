export function buildKaiAgentContext(input) {
    return {
        profile: input.profile,
        signals: input.signals,
        recentEvent: input.recentEvent,
        workoutHistory: input.workouts
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10)
            .map((workout) => ({
            date: workout.date,
            type: workout.type,
            status: workout.status,
            plannedDuration: workout.plannedDuration
        }))
    };
}
