import type {
  BehaviorSignals,
  KaiCoachingCategory,
  KaiCoachingMessage,
  KaiMemory,
  KaiPlanMatch,
  KaiRecentEvent,
  KaiUserProfile,
  KaiWeeklyPlanContext,
  PlannedWorkout
} from "./types.js";
import type { TrainingReadinessReport } from "../exercises/types.js";

export function buildKaiCoachingMessage(
  signals: BehaviorSignals,
  recentEvent?: KaiRecentEvent,
  profile?: KaiUserProfile,
  memory?: KaiMemory,
  planMatch?: KaiPlanMatch,
  plannedWorkoutForDay?: PlannedWorkout,
  nextPlannedWorkout?: PlannedWorkout,
  trainingReadiness?: TrainingReadinessReport,
  weeklyPlanContext?: KaiWeeklyPlanContext
): KaiCoachingMessage {
  const name = profile?.name ?? "there";
  const goal = profile?.goal ?? "build_consistency";
  const experienceLevel = profile?.experienceLevel ?? "beginner";
  const workoutType = recentEvent?.workoutType?.replaceAll("_", " ") ?? "workout";
  const motivationStyle = memory?.motivationStyle ?? "balanced";
  const supportiveTone =
    motivationStyle === "supportive" || experienceLevel === "beginner";
  const restartStep =
    memory?.restartStyle === "small_sessions"
      ? "Keep the next workout small enough that you are likely to complete it."
      : "Follow it up with a normal session before the rhythm cools off.";
  const repeatableStep =
    memory?.restartStyle === "small_sessions"
      ? "Keep the next workout simple enough that you can repeat it."
      : "Use the next workout to reinforce the routine.";
  const riskReasonSuffix =
    memory?.consistencyRisk === "high"
      ? " Your consistency risk is high right now, so the next step should stay very manageable."
      : memory?.consistencyRisk === "medium"
        ? " It still needs one more clean rep."
        : "";
  const recoveryActionStep = memory?.nextRecoveryAction?.detail;
  const missesOutweighCompletions =
    signals.recentMissedCount > signals.recentCompletedCount;
  const heavyMissPattern = signals.recentMissedCount >= 3;
  const mixedPattern =
    signals.recentCompletedCount >= 1 && signals.recentMissedCount >= 1;
  const lightMixedPattern =
    mixedPattern &&
    signals.recentMissedCount === 1 &&
    signals.recentCompletedCount >= 2;
  const mediumMixedPattern =
    mixedPattern &&
    !lightMixedPattern &&
    !heavyMissPattern;
  const completedButStillRecovering =
    recentEvent?.type === "workout_completed" &&
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
  const hasLoggedWorkoutForDay =
    recentEvent?.type !== "none" && recentEvent?.date === plannedWorkoutForDay?.date;
  const plannedWorkoutReadinessGuidance = plannedWorkoutForDay
    ? buildPlannedWorkoutReadinessGuidance(trainingReadiness, plannedWorkoutForDay)
    : undefined;
  const weeklyReasonContext = buildWeeklyReasonContext(weeklyPlanContext);
  const sessionPatternReasonContext = buildSessionPatternReasonContext(memory);
  const weeklyProgressStep = buildWeeklyProgressStep(weeklyPlanContext);
  const weeklyResetStep = buildWeeklyResetStep(weeklyPlanContext);
  const weeklyReplanPrefix = buildWeeklyReplanPrefix(weeklyPlanContext);

  if (plannedWorkoutForDayLabel && !hasLoggedWorkoutForDay) {
    if (plannedWorkoutReadinessGuidance) {
      return createMessage(
        "start",
        appendSentence(
          supportiveTone
          ? `${name}, your planned workout today is ${plannedWorkoutForDayLabel}. Keep it, but ${plannedWorkoutReadinessGuidance.text}`
          : `${name}, today's planned workout is ${plannedWorkoutForDayLabel}. Keep it, but ${plannedWorkoutReadinessGuidance.text}`,
          weeklyReplanPrefix
        ),
        appendSentence(
          plannedWorkoutReadinessGuidance.reason,
          mergeReasonContexts(weeklyReasonContext, sessionPatternReasonContext)
        ),
        appendSentence(plannedWorkoutReadinessGuidance.nextStep, weeklyProgressStep)
      );
    }

    return createMessage(
      "start",
      appendSentence(
        supportiveTone
        ? `${name}, your planned workout today is ${plannedWorkoutForDayLabel}. Use this one as the reset point and get it done.`
        : `${name}, today's planned workout is ${plannedWorkoutForDayLabel}. Show up for it and get the pattern moving again.`,
        weeklyReplanPrefix
      ),
      appendSentence(
        "You have a planned workout today and no result logged for it yet.",
        mergeReasonContexts(weeklyReasonContext, sessionPatternReasonContext)
      ),
      appendSentence(
        `Start with ${plannedWorkoutForDayLabel} and focus on finishing it, not perfecting it.`,
        weeklyProgressStep
      )
    );
  }

  if (recentEvent?.type === "workout_completed") {
    if ([3, 5].includes(signals.currentStreak)) {
      return createMessage(
        "celebrate",
        signals.currentStreak === 3
          ? `${name}, that is three in a row. This is how consistency starts feeling real.`
          : `${name}, five in a row is real momentum. Protect the rhythm.`,
        signals.currentStreak === 3
          ? "You have turned recent workouts into a real streak."
          : "You have stacked enough sessions to create real momentum.",
        appendSentence(
          signals.currentStreak === 3
            ? nextPlannedWorkoutStep ?? "Treat the next workout like a normal rep and make it four."
            : "Treat the next workout like a normal rep and keep the streak alive.",
          weeklyProgressStep
        )
      );
    }

    if (completedButStillRecovering) {
      return createMessage(
        "encourage",
        matchedPlanned
          ? supportiveTone
            ? `${name}, you followed the plan and got that ${workoutType} workout done. That matters. The pattern still needs work, so keep the next session small and doable.`
            : `${name}, you got the planned ${workoutType} session done. That counts. The pattern still needs work, so back it up with another solid one.`
          : supportiveTone
            ? `${name}, good job getting that ${workoutType} workout done. That matters. The pattern still needs work, so keep the next session small and doable.`
            : `${name}, good bounce-back with that ${workoutType} workout. That counts. The pattern still needs work, so back it up with another solid session.`,
        matchedPlanned
          ? `You followed the plan today, but recent misses still outweigh the wins.${riskReasonSuffix}`
          : `You completed the latest workout, but recent misses still outweigh the wins.${riskReasonSuffix}`,
        appendSentence(recoveryActionStep ?? restartStep, weeklyResetStep)
      );
    }

    if (mixedPattern && signals.currentStreak <= 1) {
      return createMessage(
        "encourage",
        lightMixedPattern
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
              : `${name}, good bounce-back with that ${workoutType} session. Now back it up before the rhythm slips again.`,
        lightMixedPattern
          ? matchedPlanned
            ? appendSentence(
                "You followed the plan and are moving in the right direction, but the pattern is not stable yet.",
                sessionPatternReasonContext
              )
            : appendSentence(
                "You are moving in the right direction, but the pattern is not stable yet.",
                sessionPatternReasonContext
              )
          : matchedPlanned
            ? appendSentence(
                "You got the planned session done, but the recent pattern is still mixed.",
                sessionPatternReasonContext
              )
            : appendSentence(
                "You got a workout done, but the recent pattern is still mixed.",
                sessionPatternReasonContext
              ),
        lightMixedPattern
          ? "Try to complete the next scheduled workout so this turns into momentum."
          : appendSentence(repeatableStep, weeklyProgressStep)
      );
    }

    if (supportiveTone) {
      return createMessage(
        "encourage",
        matchedPlanned
          ? `${name}, you followed the plan with that ${workoutType} session. Keep the next one simple and repeatable.`
          : `${name}, that ${workoutType} session counts. Keep the next one simple and repeatable.`,
        matchedPlanned
          ? "You completed the workout you intended to do today."
          : appendSentence(
              "You completed your latest workout and are moving in the right direction.",
              sessionPatternReasonContext
            ),
        appendSentence(nextPlannedWorkoutStep ?? repeatableStep, weeklyProgressStep)
      );
    }

    return createMessage(
      "encourage",
      matchedPlanned
        ? `${name}, solid work. You got the planned ${workoutType} session done. Stay in rhythm and stack the next one.`
        : `${name}, solid ${workoutType} session. Stay in rhythm and stack the next one.`,
      matchedPlanned
        ? "You completed the session you planned, which keeps the routine honest."
        : appendSentence(
            "You completed your latest workout and kept the routine moving.",
            sessionPatternReasonContext
          ),
      appendSentence(nextPlannedWorkoutStep ?? repeatableStep, weeklyProgressStep)
    );
  }

  if (recentEvent?.type === "workout_missed") {
    if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 4) {
      return createMessage(
        "reset",
        matchedPlanned
          ? `${name}, the plan slipped this week. ${nextPlannedWorkoutResetText}`
          : goal === "build_consistency"
            ? `${name}, this week needs a reset. Lower the bar and make the next session easy to finish.`
            : `${name}, this week needs a reset. Lower the bar and get the next workout done.`,
        matchedPlanned
          ? appendSentence(
              `You missed planned sessions recently, so the restart needs to stay simple and manageable.${riskReasonSuffix}`,
              mergeReasonContexts(weeklyReasonContext, sessionPatternReasonContext)
            )
          : appendSentence(
              `Recent misses have broken the rhythm and you need a simpler restart.${riskReasonSuffix}`,
              mergeReasonContexts(weeklyReasonContext, sessionPatternReasonContext)
            ),
        matchedPlanned
          ? appendSentence(
              nextPlannedWorkoutResetStep ??
                "Shrink the next planned workout if needed, then finish it.",
              weeklyResetStep
            )
          : appendSentence(
              recoveryActionStep ?? "Pick one short workout and focus only on finishing it.",
              weeklyResetStep
            )
      );
    }

    return createMessage(
      "accountability",
      matchedPlanned
        ? supportiveTone
          ? `${name}, you missed the planned ${workoutType} session. No spiral. ${nextPlannedWorkoutRecoveryText}`
          : `${name}, the planned ${workoutType} session slipped. ${nextPlannedWorkoutLabel ? "Get the next planned one done and get back on the plan." : "Get the next session done and get back on the plan."}`
        : supportiveTone
          ? `${name}, one ${workoutType} workout slipped. That happens. Respond with the next session.`
          : `${name}, that ${workoutType} workout slipped. Respond by hitting the next session.`,
      matchedPlanned
        ? "You missed a planned workout, but the pattern can still recover quickly."
        : "One workout was missed, but the pattern can still recover quickly.",
      matchedPlanned
        ? appendSentence(
            nextPlannedWorkoutResetStep ??
              "Use the next workout as the reset point and complete it.",
            weeklyResetStep
          )
        : appendSentence(
            recoveryActionStep ?? "Treat the next workout as the response and get it done.",
            weeklyResetStep
          )
    );
  }

  if (completedButStillRecovering) {
    return createMessage(
      "encourage",
      `${name}, you got one done, and that matters. Now the job is rebuilding consistency with the next few workouts.`,
      `You have a win on the board, but the broader pattern is still in recovery.${riskReasonSuffix}`,
      appendSentence(recoveryActionStep ?? repeatableStep, weeklyResetStep)
    );
  }

  if (signals.currentStreak >= 3 || signals.consistencyStatus === "consistent") {
    if (missesOutweighCompletions) {
      return createMessage(
        "reset",
        `${name}, the pattern still needs work. Keep the next few workouts simple and repeatable.`,
        "Your current state still has more misses than wins, even if there is some momentum.",
        appendSentence(repeatableStep, weeklyResetStep)
      );
    }

    return createMessage(
      "celebrate",
      experienceLevel === "beginner"
        ? `${name}, this is real progress. You are proving you can stay with it.`
        : `${name}, you are building real momentum. Keep the rhythm going.`,
      appendSentence("Your recent workouts show consistent follow-through.", weeklyReasonContext),
      appendSentence("Stay on the same rhythm and protect the routine you have built.", weeklyProgressStep)
    );
  }

  if (signals.recentMissedCount >= 2 || signals.inactiveDays >= 4) {
    return createMessage(
      "reset",
      mediumMixedPattern
        ? `${name}, the pattern is still unstable. Lower the bar and settle it with the next workout.`
        : goal === "build_consistency"
          ? `${name}, no spiral. Reset with one small session and rebuild from there.`
          : `${name}, no spiral. Start with one small workout and rebuild from there.`,
      mediumMixedPattern
        ? "You have some wins, but the recent pattern is still unstable."
        : appendSentence(
            "You have lost rhythm recently and need a cleaner restart.",
            mergeReasonContexts(weeklyReasonContext, sessionPatternReasonContext)
          ),
      appendSentence(
        "Choose one very manageable workout and complete it before thinking bigger.",
        weeklyResetStep
      )
    );
  }

  if (signals.recentMissedCount >= 1) {
    return createMessage(
      "accountability",
      supportiveTone
        ? `${name}, one workout slipped. That happens. The win now is showing up next time.`
        : `${name}, one workout slipped. The move now is getting the next one done.`,
      appendSentence(
        "A missed workout has interrupted the pattern, but it is still recoverable.",
        weeklyReasonContext
      ),
      appendSentence("Make the next workout your response.", weeklyResetStep)
    );
  }

  if (signals.recentCompletedCount >= 2 || signals.consistencyStatus === "building") {
    if (mixedPattern) {
      return createMessage(
        "encourage",
        lightMixedPattern
          ? motivationStyle === "supportive"
            ? `${name}, there is progress here. Keep the next workouts simple and repeatable.`
            : `${name}, better. Now settle the pattern by backing this up with another session.`
          : motivationStyle === "supportive"
            ? `${name}, there is some progress here, but the pattern is still uneven. Keep the next few workouts simple and repeatable.`
            : `${name}, the pattern is mixed. Settle it by backing this up with another session.`,
        lightMixedPattern
          ? `You are improving, but the routine still needs another clean rep.${riskReasonSuffix}`
          : `You have some progress, but the pattern is still uneven.${riskReasonSuffix}`,
        appendSentence(repeatableStep, weeklyProgressStep)
      );
    }

    if (missesOutweighCompletions) {
      return createMessage(
        "encourage",
        `${name}, you are still rebuilding. Keep the next workouts small and repeatable.`,
        "You are not fully stable yet, but you are still in a rebuild phase.",
        appendSentence(repeatableStep, weeklyResetStep)
      );
    }

    return createMessage(
      "encourage",
      goal === "build_consistency"
        ? `${name}, you are building consistency. Keep the routine simple and repeatable.`
        : `${name}, you are building momentum. Stay steady and keep stacking sessions.`,
      appendSentence("Your recent workouts show a positive direction.", weeklyReasonContext),
      appendSentence(
        goal === "build_consistency"
          ? "Stick to the same routine and keep it easy to repeat."
          : "Stay on this pace and get the next session done.",
        weeklyProgressStep
      )
    );
  }

  return createMessage(
    "start",
    supportiveTone
      ? `${name}, start with one workout this week. Small wins are enough right now.`
      : `${name}, get the first session done this week and build from there.`,
    appendSentence(
      "There is not enough recent momentum yet, so the focus should be on starting.",
      weeklyReasonContext
    ),
    appendSentence("Choose one workout this week and finish it.", weeklyResetStep)
  );
}

function createMessage(
  category: KaiCoachingCategory,
  text: string,
  reason: string,
  nextStep: string
): KaiCoachingMessage {
  return {
    category,
    text,
    reason,
    nextStep
  };
}

function formatPlannedWorkoutLabel(plannedWorkout: PlannedWorkout): string {
  return `${plannedWorkout.type.replaceAll("_", " ")} on ${plannedWorkout.date}`;
}

function buildPlannedWorkoutReadinessGuidance(
  trainingReadiness: TrainingReadinessReport | undefined,
  plannedWorkoutForDay: PlannedWorkout
): { text: string; reason: string; nextStep: string } | undefined {
  if (!trainingReadiness) {
    return undefined;
  }

  const sessionDecision = trainingReadiness.sessionDecision;
  const sessionPlan = trainingReadiness.sessionPlan;
  const topRecommended = trainingReadiness.recommendedExercises.slice(0, 2);
  const topPlanBlock = sessionPlan?.blocks.find(
    (block) => (block.exampleExercises?.length ?? block.exampleExerciseIds.length) > 0
  );
  const topBlockTier = topPlanBlock?.blockTier;
  const topBlockExamples = topPlanBlock?.exampleExercises?.length
    ? topPlanBlock.exampleExercises
        .map((example) =>
          trainingReadiness.recommendedExercises.find(
            (exercise) => exercise.exerciseId === example.exerciseId
          ) ??
          trainingReadiness.deprioritizedExercises.find(
            (exercise) => exercise.exerciseId === example.exerciseId
          )
        )
        .filter(
          (exercise): exercise is TrainingReadinessReport["recommendedExercises"][number] =>
            Boolean(exercise)
        )
    : [];

  if (!sessionDecision || sessionDecision.status === "train_as_planned") {
    return undefined;
  }

  const summaryText = toPlannedWorkoutText(sessionDecision.summary);
  const defaultReason =
    sessionDecision.notes[0] ??
    "Recent training is still carrying enough fatigue that today's session should stay a little more selective.";
  const reason =
    sessionPlan?.sessionStyle === "accessory_only"
      ? buildAccessoryOnlyReason(
          sessionPlan?.coachNote,
          topBlockTier,
          topBlockExamples,
          defaultReason
        )
      : sessionPlan?.coachNote ?? defaultReason;
  const nextStep =
    sessionPlan?.sessionStyle === "accessory_only"
      ? buildAccessoryOnlyNextStep(
          plannedWorkoutForDay,
          sessionPlan?.coachNote,
          topBlockTier,
          topBlockExamples
        )
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

function toPlannedWorkoutText(summary: string): string {
  const normalizedSummary = summary.replace(/\.$/, "");

  if (normalizedSummary.startsWith("Train, but ")) {
    return normalizedSummary.replace("Train, but ", "").toLowerCase();
  }

  if (normalizedSummary.startsWith("Keep the session, but ")) {
    return normalizedSummary.replace("Keep the session, but ", "").toLowerCase();
  }

  return normalizedSummary.toLowerCase();
}

function formatExerciseList(
  exercises: TrainingReadinessReport["recommendedExercises"]
): string {
  const labels = exercises.map((exercise) => exercise.name.toLowerCase());

  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels[0]} or ${labels[1]}`;
}

function buildAccessoryOnlyReason(
  coachNote: string | undefined,
  blockTier: "best" | "acceptable" | undefined,
  exercises: TrainingReadinessReport["recommendedExercises"],
  defaultReason: string
): string {
  if (blockTier === "best" && exercises.length > 0) {
    return `The session should stay accessory-only, but ${formatExerciseList(exercises)} still looks like the best fit for today.`;
  }

  if (blockTier === "acceptable" && exercises.length > 0) {
    return `The session should stay accessory-only, and ${formatExerciseList(exercises)} is acceptable today even if it is not a perfect option.`;
  }

  return coachNote ?? defaultReason;
}

function buildAccessoryOnlyNextStep(
  plannedWorkoutForDay: PlannedWorkout,
  coachNote: string | undefined,
  blockTier: "best" | "acceptable" | undefined,
  exercises: TrainingReadinessReport["recommendedExercises"]
): string {
  if (blockTier === "best" && exercises.length > 0) {
    return `Keep today's ${plannedWorkoutForDay.type.replaceAll("_", " ")} work small and center it on ${formatExerciseList(exercises)} first.`;
  }

  if (blockTier === "acceptable" && exercises.length > 0) {
    return `Treat ${formatExerciseList(exercises)} as an acceptable fallback today, and stop once the session stops feeling clearly recoverable.`;
  }

  return (
    coachNote ??
    `Treat today's ${plannedWorkoutForDay.type.replaceAll("_", " ")} session like a small accessory-only day.`
  );
}

function buildWeeklyReasonContext(
  weeklyPlanContext: KaiWeeklyPlanContext | undefined
): string | undefined {
  if (!weeklyPlanContext) {
    return undefined;
  }

  const base = `This week is set up as a ${weeklyPlanContext.targetSessions}-session ${weeklyPlanContext.splitStyle.replaceAll("_", " ")} plan.`;
  const arcContext = buildWeeklyArcReasonContext(weeklyPlanContext);
  const progressContext = buildWeeklyProgressReasonContext(weeklyPlanContext);
  const workoutTypeContext = weeklyPlanContext.fragileWorkoutTypeLabel
    ? `${weeklyPlanContext.fragileWorkoutTypeLabel} work has been the least stable part of the week.`
    : undefined;
  const suggestedWorkoutTypeContext =
    !weeklyPlanContext.todayPlanned && weeklyPlanContext.suggestedWorkoutTypeLabel
      ? describeSuggestedWorkoutTypeContext(weeklyPlanContext)
      : undefined;

  if (weeklyPlanContext.currentWeekReplan?.active) {
    return [
      base,
      arcContext,
      progressContext,
      "The remaining week was already reshaped to stay finishable.",
      workoutTypeContext,
      suggestedWorkoutTypeContext
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [base, arcContext, progressContext, workoutTypeContext, suggestedWorkoutTypeContext]
    .filter(Boolean)
    .join(" ");
}

function buildWeeklyProgressStep(
  weeklyPlanContext: KaiWeeklyPlanContext | undefined
): string | undefined {
  if (!weeklyPlanContext) {
    return undefined;
  }

  if (weeklyPlanContext.todayPlanned && weeklyPlanContext.remainingPlannedCount <= 1) {
    return (
      buildWeeklyProgressSignalStep(weeklyPlanContext) ??
      buildWeeklyArcProgressStep(weeklyPlanContext) ??
      "That keeps the week moving cleanly."
    );
  }

  if (weeklyPlanContext.currentWeekReplan?.active) {
    return (
      buildWeeklyProgressSignalStep(weeklyPlanContext) ??
      buildWeeklyArcProgressStep(weeklyPlanContext) ??
      `That fits the calmer version of this week and keeps ${weeklyPlanContext.currentWeekReplan.affectedPlannedCount} planned workout${weeklyPlanContext.currentWeekReplan.affectedPlannedCount === 1 ? "" : "s"} in play.`
    );
  }

  if (weeklyPlanContext.remainingPlannedCount > 1) {
    const remainingAfterToday = Math.max(weeklyPlanContext.remainingPlannedCount - 1, 0);
    return (
      buildWeeklyProgressSignalStep(weeklyPlanContext) ??
      buildWeeklyArcProgressStep(weeklyPlanContext) ??
      `That keeps ${remainingAfterToday} more planned workout${remainingAfterToday === 1 ? "" : "s"} available this week.`
    );
  }

  return (
    buildWeeklyProgressSignalStep(weeklyPlanContext) ??
    buildWeeklyArcProgressStep(weeklyPlanContext)
  );
}

function buildWeeklyResetStep(
  weeklyPlanContext: KaiWeeklyPlanContext | undefined
): string | undefined {
  if (!weeklyPlanContext) {
    return undefined;
  }

  const workoutTypeStep = weeklyPlanContext.fragileWorkoutTypeLabel
    ? `Keep ${weeklyPlanContext.fragileWorkoutTypeLabel.toLowerCase()} work especially manageable.`
    : undefined;
  const suggestedWorkoutTypeStep =
    !weeklyPlanContext.todayPlanned && weeklyPlanContext.suggestedWorkoutTypeLabel
      ? describeSuggestedWorkoutTypeStep(weeklyPlanContext)
      : undefined;
  const arcResetStep = buildWeeklyArcResetStep(weeklyPlanContext);
  const progressResetStep =
    weeklyPlanContext.weeklyProgressPattern === "flattened_progress"
      ? "Keep the work simple enough that the key lifts can look cleaner again."
      : undefined;

  if (weeklyPlanContext.currentWeekReplan?.active) {
    return [
      `Follow the reshaped week and keep the remaining ${weeklyPlanContext.remainingPlannedCount} planned workout${weeklyPlanContext.remainingPlannedCount === 1 ? "" : "s"} manageable.`,
      progressResetStep,
      arcResetStep,
      workoutTypeStep,
      suggestedWorkoutTypeStep
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Keep the remaining ${weeklyPlanContext.remainingPlannedCount} planned workout${weeklyPlanContext.remainingPlannedCount === 1 ? "" : "s"} manageable so the week stays finishable.`,
    progressResetStep,
    arcResetStep,
    workoutTypeStep,
    suggestedWorkoutTypeStep
  ]
    .filter(Boolean)
    .join(" ");
}

function buildWeeklyReplanPrefix(
  weeklyPlanContext: KaiWeeklyPlanContext | undefined
): string | undefined {
  if (!weeklyPlanContext?.currentWeekReplan?.active) {
    return undefined;
  }

  return "This week was already reshaped after earlier friction.";
}

function buildSessionPatternReasonContext(memory: KaiMemory | undefined): string | undefined {
  const pattern = memory?.sessionPatternMemory;
  const suggestedDrift = memory?.suggestedWorkoutMemory?.dominantDrift;
  const suggestedDriftContext =
    suggestedDrift &&
    suggestedDrift.occurrences >= 2 &&
    suggestedDrift.followThroughRate <= 0.4
      ? `Recent suggested ${suggestedDrift.suggestedWorkoutType.replaceAll("_", " ")} sessions have often turned into ${suggestedDrift.performedWorkoutType.replaceAll("_", " ")} work instead.`
      : undefined;

  if (!pattern || pattern.structuredPatternConfidence < 0.5) {
    return suggestedDriftContext;
  }

  if (pattern.patternLabel === "stable_split" && pattern.commonTransitions.length > 0) {
    return [
      `Your recent training has repeated a stable pattern: ${pattern.commonTransitions.join(", ")}.`,
      suggestedDriftContext
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (pattern.patternLabel === "alternating_mix" && pattern.dominantWorkoutTypes.length > 0) {
    return [
      `Your recent training has been alternating between ${pattern.dominantWorkoutTypes.join(" and ")}.`,
      suggestedDriftContext
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (pattern.patternLabel === "repeat_day_by_day") {
    return [
      `Your recent training has kept revisiting ${pattern.dominantWorkoutTypes[0] ?? "the same day type"}.`,
      suggestedDriftContext
    ]
      .filter(Boolean)
      .join(" ");
  }

  return suggestedDriftContext;
}

function mergeReasonContexts(
  ...contexts: Array<string | undefined>
): string | undefined {
  const filtered = contexts.filter(Boolean);
  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.join(" ");
}

function appendSentence(base: string, addition: string | undefined): string {
  if (!addition) {
    return base;
  }

  return `${base} ${addition}`;
}

function buildWeeklyArcReasonContext(
  weeklyPlanContext: KaiWeeklyPlanContext
): string | undefined {
  const headline = weeklyPlanContext.weeklyArcHeadline;

  switch (weeklyPlanContext.weeklyArcPattern) {
    case "rebuilding":
      return headline
        ? `${headline}. Recent weeks have been settling after a rough patch.`
        : "Recent weeks have been settling after a rough patch.";
    case "building":
      return headline
        ? `${headline}. Recent weeks have been stacking more cleanly.`
        : "Recent weeks have been stacking more cleanly.";
    case "protecting":
      return headline
        ? `${headline}. Recent weeks have needed lighter work to stay on track.`
        : "Recent weeks have needed lighter work to stay on track.";
    case "oscillating":
      return headline
        ? `${headline}. Recent weeks have been up and down, so today should help the pattern settle.`
        : "Recent weeks have been up and down, so today should help the pattern settle.";
    case "steady":
      return headline
        ? `${headline}. Recent weeks have been fairly even.`
        : "Recent weeks have been fairly even.";
    case "starting":
      return headline
        ? `${headline}. The bigger pattern is still just getting started.`
        : "The bigger pattern is still just getting started.";
    default:
      return undefined;
  }
}

function buildWeeklyArcProgressStep(
  weeklyPlanContext: KaiWeeklyPlanContext
): string | undefined {
  switch (weeklyPlanContext.weeklyArcPattern) {
    case "rebuilding":
      return "That helps the rebuild keep moving in the right direction.";
    case "building":
      return "That helps keep the stronger run going.";
    case "steady":
      return "That helps keep the steady run intact.";
    case "protecting":
      return "That helps keep the week manageable while recovery settles.";
    case "oscillating":
      return "That helps the pattern settle instead of swinging again.";
    case "starting":
      return "That helps turn this into a real pattern.";
    default:
      return undefined;
  }
}

function buildWeeklyProgressReasonContext(
  weeklyPlanContext: KaiWeeklyPlanContext
): string | undefined {
  switch (weeklyPlanContext.weeklyProgressPattern) {
    case "quiet_progress":
      return weeklyPlanContext.weeklyProgressHeadline
        ? `${weeklyPlanContext.weeklyProgressHeadline}. Even steady weeks can still move forward.`
        : "This week is still moving in the right direction, even without needing a bigger jump.";
    case "flattened_progress":
      return weeklyPlanContext.weeklyProgressHeadline
        ? `${weeklyPlanContext.weeklyProgressHeadline}. The next clean repeat matters more than adding more.`
        : "This week needs one cleaner repeat before it builds again.";
    default:
      return undefined;
  }
}

function describeSuggestedWorkoutTypeContext(
  weeklyPlanContext: KaiWeeklyPlanContext
): string {
  const workoutTypeLabel = weeklyPlanContext.suggestedWorkoutTypeLabel;
  if (!workoutTypeLabel) {
    return "";
  }

  const baseContext = (() => {
    switch (weeklyPlanContext.suggestedWorkoutReasonLabel) {
      case "recent_follow_through":
        return `${workoutTypeLabel} is the cleaner fit from what you have actually been following through on lately.`;
      case "recent_handling":
        return `${workoutTypeLabel} is the cleaner fit from what you have been handling best lately.`;
      default:
        return `${workoutTypeLabel} is the most natural fit from your recent pattern today.`;
    }
  })();

  if (weeklyPlanContext.suggestedWorkoutTemplateNote) {
    return `${baseContext} ${weeklyPlanContext.suggestedWorkoutTemplateNote}`;
  }

  return baseContext;
}

function describeSuggestedWorkoutTypeStep(
  weeklyPlanContext: KaiWeeklyPlanContext
): string {
  const workoutTypeLabel = weeklyPlanContext.suggestedWorkoutTypeLabel?.toLowerCase();
  if (!workoutTypeLabel) {
    return "";
  }

  const baseStep = (() => {
    switch (weeklyPlanContext.suggestedWorkoutReasonLabel) {
      case "recent_follow_through":
        return `If you train today, let it be a manageable ${workoutTypeLabel} session that matches what you have actually been following through on.`;
      case "recent_handling":
        return `If you train today, let it be a manageable ${workoutTypeLabel} session that matches what has been landing best lately.`;
      default:
        return `If you train today, let it be a manageable ${workoutTypeLabel} session.`;
    }
  })();

  const templateStep = describeSuggestedWorkoutTemplateStep(
    weeklyPlanContext.suggestedWorkoutTemplateNote
  );

  return templateStep ? `${baseStep} ${templateStep}` : baseStep;
}

function describeSuggestedWorkoutTemplateStep(
  templateNote: string | undefined
): string | undefined {
  if (!templateNote) {
    return undefined;
  }

  const normalized = templateNote.toLowerCase();
  if (normalized.includes("pull work")) {
    return "Let the session lean pull-first, since that is the upper-body work you have actually been landing best lately.";
  }

  if (normalized.includes("press work")) {
    return "Let the session lean press-first, since that is the upper-body work you have actually been landing best lately.";
  }

  if (normalized.includes("posterior-chain")) {
    return "Let the session lean more posterior-chain, since that is the lower-body work you have actually been landing best lately.";
  }

  if (normalized.includes("quad-focused")) {
    return "Let the session lean more quad-focused, since that is the lower-body work you have actually been landing best lately.";
  }

  return undefined;
}

function buildWeeklyProgressSignalStep(
  weeklyPlanContext: KaiWeeklyPlanContext
): string | undefined {
  switch (weeklyPlanContext.weeklyProgressPattern) {
    case "quiet_progress":
      return "That adds to the quiet progress without forcing the week to get bigger.";
    case "flattened_progress":
      return "That gives the key lifts another cleaner repeat before you ask for more.";
    default:
      return undefined;
  }
}

function buildWeeklyArcResetStep(
  weeklyPlanContext: KaiWeeklyPlanContext
): string | undefined {
  switch (weeklyPlanContext.weeklyArcPattern) {
    case "rebuilding":
      return "Keep this light enough that the rebuild keeps feeling doable.";
    case "protecting":
      return "Keep this light enough that the recent fragile stretch does not flare up again.";
    case "oscillating":
      return "Keep this simple enough that the pattern stops swinging around.";
    case "starting":
      return "Keep this simple enough that it becomes a repeatable start.";
    default:
      return undefined;
  }
}
