export function buildKaiCoachingMessage(signals, recentEvent, profile, memory, planMatch, plannedWorkoutForDay, nextPlannedWorkout, trainingReadiness) {
    const name = profile?.name ?? "there";
    const goal = profile?.goal ?? "build_consistency";
    const experienceLevel = profile?.experienceLevel ?? "beginner";
    const workoutType = recentEvent?.workoutType?.replaceAll("_", " ") ?? "workout";
    const motivationStyle = memory?.motivationStyle ?? "balanced";
    const supportiveTone = motivationStyle === "supportive" || experienceLevel === "beginner";
    const restartStep = memory?.restartStyle === "small_sessions"
        ? "Keep the next workout small enough that you are likely to complete it."
        : "Follow it up with a normal session before the rhythm cools off.";
    const repeatableStep = memory?.restartStyle === "small_sessions"
        ? "Keep the next workout simple enough that you can repeat it."
        : "Use the next workout to reinforce the routine.";
    const riskReasonSuffix = memory?.consistencyRisk === "high"
        ? " Your consistency risk is high right now, so the next step should stay very manageable."
        : memory?.consistencyRisk === "medium"
            ? " It still needs one more clean rep."
            : "";
    const missesOutweighCompletions = signals.recentMissedCount > signals.recentCompletedCount;
    const heavyMissPattern = signals.recentMissedCount >= 3;
    const mixedPattern = signals.recentCompletedCount >= 1 && signals.recentMissedCount >= 1;
    const lightMixedPattern = mixedPattern &&
        signals.recentMissedCount === 1 &&
        signals.recentCompletedCount >= 2;
    const mediumMixedPattern = mixedPattern &&
        !lightMixedPattern &&
        !heavyMissPattern;
    const completedButStillRecovering = recentEvent?.type === "workout_completed" &&
        (heavyMissPattern || missesOutweighCompletions);
    const matchedPlanned = planMatch?.matchedPlanned ?? false;
    const nextPlannedWorkoutLabel = nextPlannedWorkout
        ? formatPlannedWorkoutLabel(nextPlannedWorkout)
        : undefined;
    const nextPlannedWorkoutStep = nextPlannedWorkoutLabel
        ? `Your next planned workout is ${nextPlannedWorkoutLabel}. Show up for that one and keep the pattern moving.`
        : undefined;
    const nextPlannedWorkoutResetStep = nextPlannedWorkoutLabel
        ? `Use ${nextPlannedWorkoutLabel} as the reset point and complete it.`
        : undefined;
    const nextPlannedWorkoutRecoveryText = nextPlannedWorkoutLabel
        ? "Respond by getting the next planned one done."
        : "Respond by getting the next session done.";
    const nextPlannedWorkoutResetText = nextPlannedWorkoutLabel
        ? goal === "build_consistency"
            ? "Lower the bar and make the next planned session easy to finish."
            : "Lower the bar and get the next planned workout done."
        : goal === "build_consistency"
            ? "Lower the bar and make the next session easy to finish."
            : "Lower the bar and get the next workout done.";
    const plannedWorkoutForDayLabel = plannedWorkoutForDay
        ? formatPlannedWorkoutLabel(plannedWorkoutForDay)
        : undefined;
    const hasLoggedWorkoutForDay = recentEvent?.type !== "none" && recentEvent?.date === plannedWorkoutForDay?.date;
    const plannedWorkoutReadinessGuidance = plannedWorkoutForDay
        ? buildPlannedWorkoutReadinessGuidance(trainingReadiness, plannedWorkoutForDay)
        : undefined;
    if (plannedWorkoutForDayLabel && !hasLoggedWorkoutForDay) {
        if (plannedWorkoutReadinessGuidance) {
            return createMessage("start", supportiveTone
                ? `${name}, your planned workout today is ${plannedWorkoutForDayLabel}. Keep it, but ${plannedWorkoutReadinessGuidance.text}`
                : `${name}, today's planned workout is ${plannedWorkoutForDayLabel}. Keep it, but ${plannedWorkoutReadinessGuidance.text}`, plannedWorkoutReadinessGuidance.reason, plannedWorkoutReadinessGuidance.nextStep);
        }
        return createMessage("start", supportiveTone
            ? `${name}, your planned workout today is ${plannedWorkoutForDayLabel}. Use this one as the reset point and get it done.`
            : `${name}, today's planned workout is ${plannedWorkoutForDayLabel}. Show up for it and get the pattern moving again.`, "You have a planned workout today and no result logged for it yet.", `Start with ${plannedWorkoutForDayLabel} and focus on finishing it, not perfecting it.`);
    }
    if (recentEvent?.type === "workout_completed") {
        if ([3, 5].includes(signals.currentStreak)) {
            return createMessage("celebrate", signals.currentStreak === 3
                ? `${name}, that is three in a row. This is how consistency starts feeling real.`
                : `${name}, five in a row is real momentum. Protect the rhythm.`, signals.currentStreak === 3
                ? "You have turned recent workouts into a real streak."
                : "You have stacked enough sessions to create real momentum.", signals.currentStreak === 3
                ? nextPlannedWorkoutStep ?? "Treat the next workout like a normal rep and make it four."
                : "Treat the next workout like a normal rep and keep the streak alive.");
        }
        if (completedButStillRecovering) {
            return createMessage("encourage", matchedPlanned
                ? supportiveTone
                    ? `${name}, you followed the plan and got that ${workoutType} workout done. That matters. The pattern still needs work, so keep the next session small and doable.`
                    : `${name}, you got the planned ${workoutType} session done. That counts. The pattern still needs work, so back it up with another solid one.`
                : supportiveTone
                    ? `${name}, good job getting that ${workoutType} workout done. That matters. The pattern still needs work, so keep the next session small and doable.`
                    : `${name}, good bounce-back with that ${workoutType} workout. That counts. The pattern still needs work, so back it up with another solid session.`, matchedPlanned
                ? `You followed the plan today, but recent misses still outweigh the wins.${riskReasonSuffix}`
                : `You completed the latest workout, but recent misses still outweigh the wins.${riskReasonSuffix}`, restartStep);
        }
        if (mixedPattern && signals.currentStreak <= 1) {
            return createMessage("encourage", lightMixedPattern
                ? supportiveTone
                    ? matchedPlanned
                        ? `${name}, you followed the plan with that ${workoutType} session. This is a better direction. Keep the next one simple and repeatable.`
                        : `${name}, that ${workoutType} session counts. This is a better direction. Keep the next one simple and repeatable.`
                    : matchedPlanned
                        ? `${name}, you stuck to the plan with that ${workoutType} session. Better. Now back it up.`
                        : `${name}, good bounce-back with that ${workoutType} session. Better. Now back it up.`
                : supportiveTone
                    ? matchedPlanned
                        ? `${name}, you followed the plan with that ${workoutType} session. The pattern is still settling, so keep the next one simple and repeatable.`
                        : `${name}, that ${workoutType} session counts. The pattern is still settling, so keep the next one simple and repeatable.`
                    : matchedPlanned
                        ? `${name}, you got the planned ${workoutType} session done. Now back it up before the rhythm slips again.`
                        : `${name}, good bounce-back with that ${workoutType} session. Now back it up before the rhythm slips again.`, lightMixedPattern
                ? matchedPlanned
                    ? "You followed the plan and are moving in the right direction, but the pattern is not stable yet."
                    : "You are moving in the right direction, but the pattern is not stable yet."
                : matchedPlanned
                    ? "You got the planned session done, but the recent pattern is still mixed."
                    : "You got a workout done, but the recent pattern is still mixed.", lightMixedPattern
                ? "Try to complete the next scheduled workout so this turns into momentum."
                : repeatableStep);
        }
        if (supportiveTone) {
            return createMessage("encourage", matchedPlanned
                ? `${name}, you followed the plan with that ${workoutType} session. Keep the next one simple and repeatable.`
                : `${name}, that ${workoutType} session counts. Keep the next one simple and repeatable.`, matchedPlanned
                ? "You completed the workout you intended to do today."
                : "You completed your latest workout and are moving in the right direction.", nextPlannedWorkoutStep ?? repeatableStep);
        }
        return createMessage("encourage", matchedPlanned
            ? `${name}, solid work. You got the planned ${workoutType} session done. Stay in rhythm and stack the next one.`
            : `${name}, solid ${workoutType} session. Stay in rhythm and stack the next one.`, matchedPlanned
            ? "You completed the session you planned, which keeps the routine honest."
            : "You completed your latest workout and kept the routine moving.", nextPlannedWorkoutStep ?? repeatableStep);
    }
    if (recentEvent?.type === "workout_missed") {
        if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 4) {
            return createMessage("reset", matchedPlanned
                ? `${name}, the plan slipped this week. ${nextPlannedWorkoutResetText}`
                : goal === "build_consistency"
                    ? `${name}, this week needs a reset. Lower the bar and make the next session easy to finish.`
                    : `${name}, this week needs a reset. Lower the bar and get the next workout done.`, matchedPlanned
                ? `You missed planned sessions recently, so the restart needs to stay simple and manageable.${riskReasonSuffix}`
                : `Recent misses have broken the rhythm and you need a simpler restart.${riskReasonSuffix}`, matchedPlanned
                ? nextPlannedWorkoutResetStep ??
                    "Shrink the next planned workout if needed, then finish it."
                : "Pick one short workout and focus only on finishing it.");
        }
        return createMessage("accountability", matchedPlanned
            ? supportiveTone
                ? `${name}, you missed the planned ${workoutType} session. No spiral. ${nextPlannedWorkoutRecoveryText}`
                : `${name}, the planned ${workoutType} session slipped. ${nextPlannedWorkoutLabel ? "Get the next planned one done and get back on the plan." : "Get the next session done and get back on the plan."}`
            : supportiveTone
                ? `${name}, one ${workoutType} workout slipped. That happens. Respond with the next session.`
                : `${name}, that ${workoutType} workout slipped. Respond by hitting the next session.`, matchedPlanned
            ? "You missed a planned workout, but the pattern can still recover quickly."
            : "One workout was missed, but the pattern can still recover quickly.", matchedPlanned
            ? nextPlannedWorkoutResetStep ??
                "Use the next workout as the reset point and complete it."
            : "Treat the next workout as the response and get it done.");
    }
    if (completedButStillRecovering) {
        return createMessage("encourage", `${name}, you got one done, and that matters. Now the job is rebuilding consistency with the next few workouts.`, `You have a win on the board, but the broader pattern is still in recovery.${riskReasonSuffix}`, repeatableStep);
    }
    if (signals.currentStreak >= 3 || signals.consistencyStatus === "consistent") {
        if (missesOutweighCompletions) {
            return createMessage("reset", `${name}, the pattern still needs work. Keep the next few workouts simple and repeatable.`, "Your current state still has more misses than wins, even if there is some momentum.", repeatableStep);
        }
        return createMessage("celebrate", experienceLevel === "beginner"
            ? `${name}, this is real progress. You are proving you can stay with it.`
            : `${name}, you are building real momentum. Keep the rhythm going.`, "Your recent workouts show consistent follow-through.", "Stay on the same rhythm and protect the routine you have built.");
    }
    if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 4) {
        return createMessage("reset", mediumMixedPattern
            ? `${name}, the pattern is still unstable. Lower the bar and settle it with the next workout.`
            : goal === "build_consistency"
                ? `${name}, no spiral. Reset with one small session and rebuild from there.`
                : `${name}, no spiral. Start with one small workout and rebuild from there.`, mediumMixedPattern
            ? "You have some wins, but the recent pattern is still unstable."
            : "You have lost rhythm recently and need a cleaner restart.", "Choose one very manageable workout and complete it before thinking bigger.");
    }
    if (signals.recentMissedCount >= 1) {
        return createMessage("accountability", supportiveTone
            ? `${name}, one workout slipped. That happens. The win now is showing up next time.`
            : `${name}, one workout slipped. The move now is getting the next one done.`, "A missed workout has interrupted the pattern, but it is still recoverable.", "Make the next workout your response.");
    }
    if (signals.recentCompletedCount >= 2 || signals.consistencyStatus === "building") {
        if (mixedPattern) {
            return createMessage("encourage", lightMixedPattern
                ? motivationStyle === "supportive"
                    ? `${name}, there is progress here. Keep the next workouts simple and repeatable.`
                    : `${name}, better. Now settle the pattern by backing this up with another session.`
                : motivationStyle === "supportive"
                    ? `${name}, there is some progress here, but the pattern is still uneven. Keep the next few workouts simple and repeatable.`
                    : `${name}, the pattern is mixed. Settle it by backing this up with another session.`, lightMixedPattern
                ? `You are improving, but the routine still needs another clean rep.${riskReasonSuffix}`
                : `You have some progress, but the pattern is still uneven.${riskReasonSuffix}`, repeatableStep);
        }
        if (missesOutweighCompletions) {
            return createMessage("encourage", `${name}, you are still rebuilding. Keep the next workouts small and repeatable.`, "You are not fully stable yet, but you are still in a rebuild phase.", repeatableStep);
        }
        return createMessage("encourage", goal === "build_consistency"
            ? `${name}, you are building consistency. Keep the routine simple and repeatable.`
            : `${name}, you are building momentum. Stay steady and keep stacking sessions.`, "Your recent workouts show a positive direction.", goal === "build_consistency"
            ? "Stick to the same routine and keep it easy to repeat."
            : "Stay on this pace and get the next session done.");
    }
    return createMessage("start", supportiveTone
        ? `${name}, start with one workout this week. Small wins are enough right now.`
        : `${name}, get the first session done this week and build from there.`, "There is not enough recent momentum yet, so the focus should be on starting.", "Choose one workout this week and finish it.");
}
function createMessage(category, text, reason, nextStep) {
    return {
        category,
        text,
        reason,
        nextStep
    };
}
function formatPlannedWorkoutLabel(plannedWorkout) {
    return `${plannedWorkout.type.replaceAll("_", " ")} on ${plannedWorkout.date}`;
}
function buildPlannedWorkoutReadinessGuidance(trainingReadiness, plannedWorkoutForDay) {
    if (!trainingReadiness) {
        return undefined;
    }
    const sessionDecision = trainingReadiness.sessionDecision;
    const sessionPlan = trainingReadiness.sessionPlan;
    const topRecommended = trainingReadiness.recommendedExercises.slice(0, 2);
    const topPlanBlock = sessionPlan?.blocks.find((block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0);
    const topBlockTier = topPlanBlock?.blockTier;
    const topBlockExamples = topPlanBlock?.exampleExercises?.length
        ? topPlanBlock.exampleExercises
            .map((example) => trainingReadiness.recommendedExercises.find((exercise) => exercise.exerciseId === example.exerciseId) ??
            trainingReadiness.deprioritizedExercises.find((exercise) => exercise.exerciseId === example.exerciseId))
            .filter((exercise) => Boolean(exercise))
        : [];
    if (!sessionDecision || sessionDecision.status === "train_as_planned") {
        return undefined;
    }
    const summaryText = toPlannedWorkoutText(sessionDecision.summary);
    const defaultReason = sessionDecision.notes[0] ??
        "Recent training is still carrying enough fatigue that today's session should stay a little more selective.";
    const reason = sessionPlan?.sessionStyle === "accessory_only"
        ? buildAccessoryOnlyReason(sessionPlan?.coachNote, topBlockTier, topBlockExamples, defaultReason)
        : sessionPlan?.coachNote ?? defaultReason;
    const nextStep = sessionPlan?.sessionStyle === "accessory_only"
        ? buildAccessoryOnlyNextStep(plannedWorkoutForDay, sessionPlan?.coachNote, topBlockTier, topBlockExamples)
        : sessionDecision.notes[2] ??
            sessionDecision.notes[1] ??
            (topRecommended.length > 0
                ? `Bias the session toward ${formatExerciseList(topRecommended)}.`
                : `Keep today's ${plannedWorkoutForDay.type.replaceAll("_", " ")} session a little lighter and more selective.`);
    if (sessionPlan?.sessionStyle === "accessory_only") {
        return {
            text: `run it as a small accessory-only version today`,
            reason,
            nextStep
        };
    }
    if (plannedWorkoutForDay.type === "lower_body") {
        return {
            text: summaryText,
            reason,
            nextStep
        };
    }
    if (plannedWorkoutForDay.type === "upper_body") {
        return {
            text: summaryText,
            reason,
            nextStep
        };
    }
    return {
        text: summaryText,
        reason,
        nextStep
    };
}
function toPlannedWorkoutText(summary) {
    const normalizedSummary = summary.replace(/\.$/, "");
    if (normalizedSummary.startsWith("Train, but ")) {
        return normalizedSummary.replace("Train, but ", "").toLowerCase();
    }
    if (normalizedSummary.startsWith("Keep the session, but ")) {
        return normalizedSummary.replace("Keep the session, but ", "").toLowerCase();
    }
    return normalizedSummary.toLowerCase();
}
function formatExerciseList(exercises) {
    const labels = exercises.map((exercise) => exercise.name.toLowerCase());
    if (labels.length === 1) {
        return labels[0];
    }
    return `${labels[0]} or ${labels[1]}`;
}
function buildAccessoryOnlyReason(coachNote, blockTier, exercises, defaultReason) {
    if (blockTier === "best" && exercises.length > 0) {
        return `The session should stay accessory-only, but ${formatExerciseList(exercises)} still looks like the best fit for today.`;
    }
    if (blockTier === "acceptable" && exercises.length > 0) {
        return `The session should stay accessory-only, and ${formatExerciseList(exercises)} is acceptable today even if it is not a perfect option.`;
    }
    return coachNote ?? defaultReason;
}
function buildAccessoryOnlyNextStep(plannedWorkoutForDay, coachNote, blockTier, exercises) {
    if (blockTier === "best" && exercises.length > 0) {
        return `Keep today's ${plannedWorkoutForDay.type.replaceAll("_", " ")} work small and center it on ${formatExerciseList(exercises)} first.`;
    }
    if (blockTier === "acceptable" && exercises.length > 0) {
        return `Treat ${formatExerciseList(exercises)} as an acceptable fallback today, and stop once the session stops feeling clearly recoverable.`;
    }
    return (coachNote ??
        `Treat today's ${plannedWorkoutForDay.type.replaceAll("_", " ")} session like a small accessory-only day.`);
}
