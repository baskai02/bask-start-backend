import type {
  KaiCoachingMessage,
  KaiMemory,
  KaiWeeklyArc,
  KaiCurrentWeekReplan,
  KaiWeeklyChapter,
  KaiWeeklyChapterHistoryEntry,
  KaiWeeklyInsight,
  KaiWeeklyPayload,
  KaiWeeklyReview,
  KaiWeeklyReviewState,
  KaiUserProfile,
  KaiWeeklySummary,
  PlannedWorkout,
  WorkoutRecord
} from "./types.js";
import type { ReadinessHistoryEntry } from "../exercises/types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function buildKaiWeeklySummary(
  workouts: WorkoutRecord[],
  plannedWorkouts: PlannedWorkout[],
  asOf: string
): KaiWeeklySummary {
  const { weekStart, weekEnd } = getWeekRange(asOf);
  const weeklyWorkouts = workouts.filter(
    (workout) => workout.date >= weekStart && workout.date <= weekEnd
  );
  const weeklyPlanned = plannedWorkouts.filter(
    (plannedWorkout) =>
      plannedWorkout.date >= weekStart && plannedWorkout.date <= weekEnd
  );

  let plannedCompletedCount = 0;
  let plannedMissedCount = 0;

  for (const plannedWorkout of weeklyPlanned) {
    const matchedWorkout = weeklyWorkouts.find(
      (workout) =>
        workout.date === plannedWorkout.date &&
        workout.type === plannedWorkout.type
    );

    if (matchedWorkout?.status === "completed") {
      plannedCompletedCount += 1;
      continue;
    }

    if (matchedWorkout?.status === "missed") {
      plannedMissedCount += 1;
    }
  }

  const completedCount = weeklyWorkouts.filter(
    (workout) => workout.status === "completed"
  ).length;
  const completedWeeklyWorkouts = weeklyWorkouts.filter(
    (workout) => workout.status === "completed"
  );
  const missedCount = weeklyWorkouts.filter(
    (workout) => workout.status === "missed"
  ).length;
  const remainingPlannedCount = Math.max(
    weeklyPlanned.length - plannedCompletedCount - plannedMissedCount,
    0
  );
  const planAdherencePercent =
    weeklyPlanned.length === 0
      ? 0
      : Math.round((plannedCompletedCount / weeklyPlanned.length) * 100);
  const completedWithSummary = completedWeeklyWorkouts.filter(
    (workout) => workout.outcomeSummary
  );
  const mainCoveragePercent =
    completedWithSummary.length === 0
      ? 0
      : Math.round(
          (completedWithSummary.filter((workout) => workout.outcomeSummary?.mainCovered).length /
            completedWithSummary.length) *
            100
        );
  const supportCoveragePercent =
    completedWithSummary.length === 0
      ? 0
      : Math.round(
          (completedWithSummary.filter((workout) => workout.outcomeSummary?.supportCovered).length /
            completedWithSummary.length) *
            100
        );
  const thinSessionCount = completedWithSummary.filter(
    (workout) => workout.outcomeSummary?.sessionSize === "thin"
  ).length;
  const fullSessionCount = completedWithSummary.filter(
    (workout) => workout.outcomeSummary?.sessionSize === "full"
  ).length;
  const survivalSessionCount = completedWithSummary.filter(
    (workout) => workout.outcomeSummary?.executionQuality === "survival"
  ).length;
  const strongSessionCount = completedWithSummary.filter(
    (workout) => workout.outcomeSummary?.executionQuality === "strong"
  ).length;
  const explicitPlannedFollowThroughCount = completedWithSummary.filter(
    (workout) => workout.outcomeSummary?.followedPlannedWorkout
  ).length;
  const suggestedFollowThroughCount = completedWithSummary.filter(
    (workout) => workout.outcomeSummary?.followedSuggestedWorkoutType
  ).length;
  const substitutionCount = completedWithSummary.reduce(
    (sum, workout) => sum + (workout.outcomeSummary?.substitutionCount ?? 0),
    0
  );
  const setFatigueFlagCount = completedWithSummary.filter(
    (workout) =>
      workout.outcomeSummary?.setEffortTrend === "rising" ||
      workout.outcomeSummary?.setEffortTrend === "sharp_rise"
  ).length;
  const restInflationSessionCount = completedWithSummary.filter(
    (workout) => (workout.outcomeSummary?.restInflationRatio ?? 0) >= 1.2
  ).length;
  const repDropoffSessionCount = completedWithSummary.filter(
    (workout) => (workout.outcomeSummary?.repDropoffPercent ?? 0) >= 18
  ).length;

  return {
    weekStart,
    weekEnd,
    weekStatus: decideWeekStatus({
      plannedCount: weeklyPlanned.length,
      completedCount,
      missedCount,
      plannedCompletedCount,
      plannedMissedCount
    }),
    plannedCount: weeklyPlanned.length,
    completedCount,
    missedCount,
    plannedCompletedCount,
    plannedMissedCount,
    unplannedCompletedCount: Math.max(completedCount - plannedCompletedCount, 0),
    remainingPlannedCount,
    planAdherencePercent,
    mainCoveragePercent,
    supportCoveragePercent,
    thinSessionCount,
    fullSessionCount,
    survivalSessionCount,
    strongSessionCount,
    explicitPlannedFollowThroughCount,
    suggestedFollowThroughCount,
    substitutionCount,
    setFatigueFlagCount,
    restInflationSessionCount,
    repDropoffSessionCount
  };
}

export function buildKaiWeeklyCoachingMessage(
  summary: KaiWeeklySummary,
  profile?: KaiUserProfile,
  nextPlannedWorkout?: PlannedWorkout,
  review?: KaiWeeklyReview,
  weeklyInsights: KaiWeeklyInsight[] = []
): KaiCoachingMessage {
  const name = profile?.name ?? "there";
  const goal = profile?.goal ?? "build_consistency";
  const beginner = (profile?.experienceLevel ?? "beginner") === "beginner";
  const executionInsight = weeklyInsights.find((insight) => insight.kind === "execution");
  const progressionInsight = weeklyInsights.find((insight) => insight.kind === "progression");
  const trajectoryInsight = weeklyInsights.find(
    (insight) =>
      insight.kind === "momentum" &&
      insight.title.startsWith("Weekly momentum is ")
  );
  const performedWorkoutInsight = weeklyInsights.find(
    (insight) =>
      insight.kind === "workout_type" &&
      insight.title === "Logged day types and performed work are drifting apart"
  );
  const selectionInsight = weeklyInsights.find((insight) => insight.kind === "selection");
  const nextPlannedWorkoutStep = nextPlannedWorkout
    ? `Your next planned workout is ${formatPlannedWorkoutLabel(nextPlannedWorkout)}. Start there.`
    : undefined;

  if (summary.plannedCount > 0 && summary.plannedCompletedCount >= summary.plannedCount) {
    return {
      category: "celebrate",
      text: `${name}, you hit the full plan this week. That is exactly how real progress compounds.`,
      reason:
        progressionInsight
          ? progressionInsight.detail
          : "You completed every planned workout this week.",
      nextStep:
        progressionInsight
          ? "Keep the week moving forward, but repeat the guarded lift cleanly before asking it to progress again."
          : nextPlannedWorkoutStep ??
        "Keep next week's plan realistic and repeat the same standard."
    };
  }

  if (summary.completedCount >= 3 && summary.missedCount === 0) {
    return {
      category: "celebrate",
      text: `${name}, strong week. You kept showing up and the pattern looks solid.`,
      reason:
        progressionInsight
          ? progressionInsight.detail
          : executionInsight?.title === "Execution quality was solid"
          ? "You stacked multiple completed workouts this week and the work itself held up well."
          : "You stacked multiple completed workouts this week without misses.",
      nextStep:
        progressionInsight
          ? "Let the week keep moving forward, but repeat the guarded lift cleanly before asking it to progress again."
          : nextPlannedWorkoutStep ??
        "Protect the same rhythm next week instead of adding complexity."
    };
  }

  if (review?.state === "resetting" || summary.plannedMissedCount >= 2 || summary.missedCount >= 3) {
    return {
      category: "reset",
      text:
        goal === "build_consistency"
          ? `${name}, this week slipped. Reset by lowering the bar and making next week's plan easier to finish.`
          : `${name}, this week got away from you. Lower the bar and rebuild with a simpler plan next week.`,
      reason:
        summary.plannedMissedCount >= 2
          ? "You missed multiple planned workouts this week."
          : "Misses outweighed completed sessions this week.",
      nextStep:
        nextPlannedWorkoutStep ??
        "Set one or two very manageable planned workouts for next week and finish them."
    };
  }

  if (
    review?.state === "protecting" ||
    (summary.plannedCompletedCount >= 1 && summary.plannedMissedCount >= 1)
  ) {
    return {
      category: "encourage",
      text:
        executionInsight?.title === "Execution quality was solid"
          ? `${name}, the week still needs protecting, but the sessions you did complete were handled well. There is something solid to build from here.`
          : executionInsight?.title === "Too many sessions were survival-style"
            ? `${name}, parts of the week stayed alive, but too much of the work turned into survival mode. There is still something to build on here.`
            : `${name}, parts of the week were on plan, parts slipped. There is something to build on here.`,
      reason:
        progressionInsight
          ? progressionInsight.detail
          : trajectoryInsight
          ? trajectoryInsight.detail
          : performedWorkoutInsight
          ? performedWorkoutInsight.detail
          : selectionInsight
            ? selectionInsight.detail
          : executionInsight?.title === "Execution quality was solid"
          ? "The week still needs simplifying, but the work you did complete was handled well."
          : executionInsight?.title === "Too many sessions were survival-style"
          ? "You kept some sessions going, but too many of them were lighter than the week was asking for."
          : "You followed through on some planned workouts, but not all of them.",
      nextStep:
        progressionInsight
          ? "Keep the week moving, but let the guarded lift earn progression back through a cleaner repeat first."
          : buildTrajectoryNextStep(trajectoryInsight)
          ? buildTrajectoryNextStep(trajectoryInsight)!
          : nextPlannedWorkoutStep ??
        "Keep next week simple and try to finish the first planned session early."
    };
  }

  if (summary.completedCount >= 1) {
    return {
      category: "encourage",
      text: beginner
        ? `${name}, you got work done this week. Keep it simple and make next week repeatable.`
        : `${name}, you kept some momentum this week. Now turn that into a steadier pattern.`,
      reason:
        executionInsight?.title === "Execution quality was solid"
          ? "You got work done this week and the sessions that happened were handled well."
          : trajectoryInsight
          ? trajectoryInsight.detail
          : summary.unplannedCompletedCount > 0
          ? "You trained this week, even if it was not all driven by the plan."
          : "You got at least one workout done this week.",
      nextStep:
        buildTrajectoryNextStep(trajectoryInsight) ??
        nextPlannedWorkoutStep ??
        (summary.plannedCount > 0
          ? "Use the planned workouts next week to turn this into a steadier routine."
          : "Plan one or two workouts for next week and complete them.")
    };
  }

  return {
    category: "start",
    text: `${name}, this week is still at the start. That is okay, but it needs a cleaner opening move.`,
    reason: "You do not have enough completed sessions this week yet to call it a real pattern.",
    nextStep:
      nextPlannedWorkoutStep ?? "Plan one manageable workout for next week and finish it."
  };
}

function buildTrajectoryNextStep(
  trajectoryInsight?: KaiWeeklyInsight
): string | undefined {
  if (!trajectoryInsight) {
    return undefined;
  }

  const title = trajectoryInsight.title.toLowerCase();
  if (title.includes("oscillating")) {
    return "Hold one simpler structure for 1-2 weeks before asking the plan to progress again.";
  }

  if (title.includes("trending downward")) {
    return "Shrink next week slightly and rebuild from one cleaner baseline session.";
  }

  if (title.includes("climbing back up")) {
    return "Keep the same structure steady for another week, then add one small progression.";
  }

  if (title.includes("stable but flat")) {
    return "Keep one constraint lighter next week so momentum can move from steady toward building.";
  }

  return undefined;
}

export function buildKaiWeeklyInsights(
  summary: KaiWeeklySummary,
  review?: KaiWeeklyReview,
  workouts: WorkoutRecord[] = [],
  asOf?: string,
  recentExerciseHistory: KaiWeeklyPayload["recentExerciseHistory"] = [],
  sessionPatternMemory?: KaiMemory["sessionPatternMemory"],
  suggestedWorkoutMemory?: KaiMemory["suggestedWorkoutMemory"],
  weeklyExerciseInsights: KaiWeeklyPayload["weeklyExerciseInsights"] = [],
  weeklyProgressionHighlights: KaiWeeklyPayload["weeklyProgressionHighlights"] = [],
  weeklyReviewHistory: Array<{
    weekStart: string;
    state: KaiWeeklyReviewState;
    plannedCount: number;
    completedCount: number;
    missedCount: number;
  }> = [],
  weeklyReadinessHistory: ReadinessHistoryEntry[] = [],
  weeklyPerformanceSignals: KaiWeeklyPayload["weeklyPerformanceSignals"] = []
): KaiWeeklyInsight[] {
  const insights: KaiWeeklyInsight[] = [];

  if (summary.plannedCount > 0) {
    insights.push({
      kind: "adherence",
      title:
        summary.planAdherencePercent >= 85
          ? "Plan adherence held up"
          : "Plan adherence needs protection",
      detail: `${summary.plannedCompletedCount}/${summary.plannedCount} planned sessions were completed.`
    });
  }

  if (summary.mainCoveragePercent > 0) {
    insights.push({
      kind: "main_work",
      title:
        summary.mainCoveragePercent >= 80
          ? "Main work mostly held up"
          : "Main work kept thinning out",
      detail: `${summary.mainCoveragePercent}% of completed sessions covered the intended main work.`
    });
  }

  if (summary.supportCoveragePercent > 0) {
    insights.push({
      kind: "support_work",
      title:
        summary.supportCoveragePercent >= 70
          ? "Support work was mostly there"
          : "Support work dropped off often",
      detail: `${summary.supportCoveragePercent}% of completed sessions covered useful support work.`
    });
  }

  if (summary.completedCount > 0) {
    const strongSessionCount = summary.strongSessionCount ?? 0;
    const survivalSessionCount = summary.survivalSessionCount ?? 0;
    insights.push({
      kind: "execution",
      title:
        strongSessionCount >= Math.max(1, Math.floor(summary.completedCount / 2))
          ? "Execution quality was solid"
          : survivalSessionCount >= Math.ceil(summary.completedCount / 2)
            ? "Too many sessions were survival-style"
            : "Execution quality was mixed",
      detail: `${strongSessionCount} strong sessions, ${survivalSessionCount} survival-style sessions.`
    });
  }

  const readinessInsight = buildReadinessHistoryInsight(weeklyReadinessHistory);
  if (readinessInsight) {
    insights.push(readinessInsight);
  }

  const setFatigueInsight = buildSetFatigueInsight(summary);
  if (setFatigueInsight) {
    insights.push(setFatigueInsight);
  }

  if (
    summary.completedCount > 0 &&
    ((summary.explicitPlannedFollowThroughCount ?? 0) > 0 ||
      (summary.suggestedFollowThroughCount ?? 0) > 0 ||
      (summary.substitutionCount ?? 0) > 0)
  ) {
    const plannedFollowThrough = summary.explicitPlannedFollowThroughCount ?? 0;
    const suggestedFollowThrough = summary.suggestedFollowThroughCount ?? 0;
    const substitutionCount = summary.substitutionCount ?? 0;
    insights.push({
      kind: "execution_alignment",
      title:
        plannedFollowThrough + suggestedFollowThrough >= Math.max(1, Math.floor(summary.completedCount / 2))
          ? "Execution stayed fairly aligned"
          : substitutionCount >= summary.completedCount
            ? "Execution drifted away from the original plan"
            : "Execution alignment was mixed",
      detail: `${plannedFollowThrough} planned follow-through sessions, ${suggestedFollowThrough} suggested-day follow-through sessions, ${substitutionCount} logged substitutions.`
    });
  }

  if (review) {
    insights.push({
      kind: "momentum",
      title: `Weekly state: ${review.state}`,
      detail: review.nextWeekFocus
    });
  }

  const trajectoryInsight = buildWeeklyTrajectoryInsight(weeklyReviewHistory);
  if (trajectoryInsight) {
    insights.push(trajectoryInsight);
  }

  const workoutTypeInsight = buildWorkoutTypeInsight(workouts, asOf);
  if (workoutTypeInsight) {
    insights.push(workoutTypeInsight);
  }

  const performedWorkoutInsight = buildPerformedWorkoutInsight(workouts, asOf);
  if (performedWorkoutInsight) {
    insights.push(performedWorkoutInsight);
  }

  const exerciseHistoryInsight = buildExerciseHistoryInsight(recentExerciseHistory);
  if (exerciseHistoryInsight) {
    insights.push(exerciseHistoryInsight);
  }

  const performanceInsight = buildPerformanceVelocityInsight(weeklyPerformanceSignals);
  if (performanceInsight) {
    insights.push(performanceInsight);
  }

  const sessionPatternInsight = buildSessionPatternInsight(sessionPatternMemory);
  if (sessionPatternInsight) {
    insights.push(sessionPatternInsight);
  }

  const suggestedDriftInsight = buildSuggestedWorkoutDriftInsight(suggestedWorkoutMemory);
  if (suggestedDriftInsight) {
    insights.push(suggestedDriftInsight);
  }

  const selectionInsight = buildSelectionInsight(weeklyExerciseInsights);
  if (selectionInsight) {
    insights.push(selectionInsight);
  }

  const progressionInsight = buildProgressionGuardrailInsight(weeklyProgressionHighlights);
  if (progressionInsight) {
    insights.push(progressionInsight);
  }

  return insights;
}

export function buildKaiWeeklyChapter(
  summary: KaiWeeklySummary,
  review: KaiWeeklyReview,
  weeklyInsights: KaiWeeklyInsight[] = [],
  weeklyReadinessHistory: ReadinessHistoryEntry[] = [],
  weeklyArc?: KaiWeeklyArc,
  currentWeekReplan?: KaiCurrentWeekReplan,
  nextPlannedWorkout?: PlannedWorkout
): KaiWeeklyChapter {
  const readinessPattern = summarizeWeeklyReadinessPattern(weeklyReadinessHistory);
  const title = buildWeeklyChapterTitle(
    review,
    readinessPattern,
    weeklyArc,
    weeklyInsights
  );
  const summaryLine = buildWeeklyChapterSummary(
    summary,
    review,
    readinessPattern,
    weeklyArc,
    weeklyInsights
  );
  const storyBeats = buildWeeklyChapterStoryBeats(
    summary,
    weeklyInsights,
    readinessPattern,
    weeklyArc,
    currentWeekReplan
  );
  const wins = buildWeeklyChapterWins(summary, weeklyInsights, readinessPattern);
  const frictions = buildWeeklyChapterFrictions(review, weeklyInsights, readinessPattern);
  const nextChapterBase = buildWeeklyChapterNextStep(review, weeklyArc);
  const nextChapter = nextPlannedWorkout
    ? `${nextChapterBase} Next up: ${formatWeeklyChapterPlannedWorkoutLabel(nextPlannedWorkout)}.`
    : nextChapterBase;

  return {
    tone: review.state,
    title,
    summary: summaryLine,
    storyBeats,
    wins,
    frictions,
    nextChapter
  };
}

export function buildKaiWeeklyArc(
  weeklyChapterHistory: KaiWeeklyChapterHistoryEntry[],
  currentWeekChapter?: KaiWeeklyChapterHistoryEntry
): KaiWeeklyArc | undefined {
  const recentEntries = [
    ...weeklyChapterHistory.filter(
      (entry) => entry.weekStart !== currentWeekChapter?.weekStart
    ),
    ...(currentWeekChapter ? [currentWeekChapter] : [])
  ]
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
    .slice(-6);

  if (recentEntries.length < 2) {
    return undefined;
  }

  const states = recentEntries.map((entry) => entry.reviewState);
  const transitionCount = states.slice(1).reduce((count, state, index) => {
    return state === states[index] ? count : count + 1;
  }, 0);
  const stateDelta =
    weeklyReviewStateScore(states.at(-1)!) - weeklyReviewStateScore(states[0]);
  const latestState = states.at(-1)!;
  const fragileTailCount = states
    .slice(-3)
    .filter((state) => state === "protecting" || state === "resetting").length;
  const recentChapterTitles = recentEntries
    .slice(-3)
    .map((entry) => entry.chapter.title);

  if (transitionCount >= 3 && fragileTailCount >= 1 && latestState !== "building") {
    return {
      pattern: "oscillating",
      headline: "The last few weeks have been up and down",
      summary:
        "You have bounced between stronger weeks and more protective ones. Keep the structure simple until it feels steadier.",
      recentStates: states,
      recentChapterTitles
    };
  }

  if (
    stateDelta >= 2 &&
    states.some((state) => state === "protecting" || state === "resetting") &&
    (latestState === "steady" || latestState === "building")
  ) {
    return {
      pattern: "rebuilding",
      headline: "You are climbing back up",
      summary:
        "Recent weeks are moving from rougher territory toward steadier training. Keep building from that calmer base.",
      recentStates: states,
      recentChapterTitles
    };
  }

  if (fragileTailCount >= 2 || latestState === "protecting" || latestState === "resetting") {
    return {
      pattern: "protecting",
      headline: "Recent weeks have needed more protection",
      summary:
        "The recent pattern says recovery and follow-through need a little more breathing room before you push again.",
      recentStates: states,
      recentChapterTitles
    };
  }

  if (latestState === "building" || (stateDelta >= 1 && transitionCount <= 1)) {
    return {
      pattern: "building",
      headline: "The last few weeks are starting to stack",
      summary:
        "You are putting steadier weeks together and earning more room to progress without rushing it.",
      recentStates: states,
      recentChapterTitles
    };
  }

  if (transitionCount === 0 && states.length >= 3) {
    return {
      pattern: "steady",
      headline: "You are building a steadier base",
      summary:
        "Recent weeks have looked more predictable and easier to repeat. That is a good base for progress later.",
      recentStates: states,
      recentChapterTitles
    };
  }

  return {
    pattern: "starting",
    headline: "A longer pattern is starting to form",
    summary:
      "There is enough weekly history now to start reading a trend, but it still needs more weeks before it is fully settled.",
    recentStates: states,
    recentChapterTitles
  };
}

function buildWeeklyTrajectoryInsight(
  weeklyReviewHistory: Array<{
    weekStart: string;
    state: KaiWeeklyReviewState;
    plannedCount: number;
    completedCount: number;
    missedCount: number;
  }>
): KaiWeeklyInsight | undefined {
  const engagedWeeks = weeklyReviewHistory
    .filter(
      (entry) =>
        entry.plannedCount > 0 || entry.completedCount > 0 || entry.missedCount > 0
    )
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
    .slice(-6);

  if (engagedWeeks.length < 3) {
    return undefined;
  }

  const states = engagedWeeks.map((entry) => entry.state);
  const transitionCount = states.slice(1).reduce((count, state, index) => {
    return state === states[index] ? count : count + 1;
  }, 0);
  const stateDelta =
    weeklyReviewStateScore(states.at(-1)!) - weeklyReviewStateScore(states[0]);
  const latestState = states.at(-1)!;
  const recentTail = states.slice(-3);
  const fragileTailCount = recentTail.filter(
    (state) => state === "protecting" || state === "resetting"
  ).length;

  if (
    transitionCount >= 3 &&
    fragileTailCount >= 1 &&
    latestState !== "building"
  ) {
    return {
      kind: "momentum",
      title: "Weekly momentum is oscillating instead of stabilizing",
      detail: `Recent states are bouncing (${formatWeeklyStateSequence(states)}). Hold one simpler structure for 1-2 weeks before asking for more.`
    };
  }

  if (
    stateDelta <= -2 ||
    (fragileTailCount >= 2 && latestState !== "building")
  ) {
    return {
      kind: "momentum",
      title: "Weekly momentum is trending downward",
      detail: `Recent state sequence: ${formatWeeklyStateSequence(states)}. Shrink the next week slightly and rebuild from a cleaner baseline.`
    };
  }

  if (
    stateDelta >= 2 &&
    states.some((state) => state === "protecting" || state === "resetting") &&
    (latestState === "steady" || latestState === "building")
  ) {
    return {
      kind: "momentum",
      title: "Weekly momentum is climbing back up",
      detail: `Recent state sequence: ${formatWeeklyStateSequence(states)}. Keep the structure steady and let progression return gradually.`
    };
  }

  if (
    transitionCount === 0 &&
    states.length >= 4 &&
    (latestState === "steady" || latestState === "protecting")
  ) {
    return {
      kind: "momentum",
      title: "Weekly momentum is stable but flat",
      detail: `Recent state sequence: ${formatWeeklyStateSequence(states)}. Keep one constraint lighter so the next block can move from ${latestState} toward building.`
    };
  }

  return undefined;
}

function buildWeeklyChapterTitle(
  review: KaiWeeklyReview,
  readinessPattern: ReturnType<typeof summarizeWeeklyReadinessPattern>,
  weeklyArc?: KaiWeeklyArc,
  weeklyInsights: KaiWeeklyInsight[] = []
): string {
  const positiveProgressionInsight = getPositiveProgressionInsight(weeklyInsights);
  const negativeProgressionInsight = getNegativeProgressionInsight(weeklyInsights);

  if (
    weeklyArc?.pattern === "rebuilding" &&
    (review.state === "steady" || review.state === "building")
  ) {
    return "You are climbing back up";
  }

  if (weeklyArc?.pattern === "oscillating") {
    return "The last few weeks have been up and down";
  }

  if (
    weeklyArc?.pattern === "protecting" &&
    review.state !== "building"
  ) {
    return "Recent weeks still need protecting";
  }

  if (
    weeklyArc?.pattern === "building" &&
    (review.state === "steady" || review.state === "building")
  ) {
    return "You are starting to stack stronger weeks";
  }

  if (review.state === "building") {
    return "The week earned a build";
  }

  if (review.state === "resetting") {
    return "The week asked for a reset";
  }

  if (
    review.state === "protecting" &&
    readinessPattern.protectiveCount >= 2
  ) {
    return "The week needed trimming to stay on track";
  }

  if (
    review.state === "steady" &&
    readinessPattern.totalEntries >= 2 &&
    readinessPattern.scoreDelta >= 12
  ) {
    return "The week settled and recovered";
  }

  if (review.state === "protecting") {
    return "The week needed protecting";
  }

  if (review.state === "steady" && positiveProgressionInsight) {
    return "The week stayed quiet, but still moved forward";
  }

  if (review.state === "steady" && negativeProgressionInsight) {
    return "The week held together, but progress flattened out";
  }

  return "The week found steady ground";
}

function buildWeeklyChapterSummary(
  summary: KaiWeeklySummary,
  review: KaiWeeklyReview,
  readinessPattern: ReturnType<typeof summarizeWeeklyReadinessPattern>,
  weeklyArc?: KaiWeeklyArc,
  weeklyInsights: KaiWeeklyInsight[] = []
): string {
  const lead =
    summary.plannedCount > 0
      ? `${summary.plannedCompletedCount}/${summary.plannedCount} planned sessions landed this week.`
      : `${summary.completedCount} sessions were logged this week.`;
  const positiveProgressionInsight = getPositiveProgressionInsight(weeklyInsights);
  const negativeProgressionInsight = getNegativeProgressionInsight(weeklyInsights);

  if (readinessPattern.protectiveCount >= 2) {
    return `${lead} ${readinessPattern.protectiveCount}/${readinessPattern.totalEntries} readiness checks still had to tone the day down, so the week stayed in ${review.state} mode.`;
  }

  if (review.state === "steady" && positiveProgressionInsight) {
    return `${lead} Progress stayed quieter than a full build week, but it still moved in the right direction.`;
  }

  if (review.state === "steady" && negativeProgressionInsight) {
    return `${lead} The week stayed finishable, but the main lifts did not really move forward.`;
  }

  if (weeklyArc && weeklyArc.pattern !== "starting") {
    return `${lead} ${weeklyArc.summary}`;
  }

  return `${lead} ${review.headline}`;
}

function buildWeeklyChapterStoryBeats(
  summary: KaiWeeklySummary,
  weeklyInsights: KaiWeeklyInsight[],
  readinessPattern: ReturnType<typeof summarizeWeeklyReadinessPattern>,
  weeklyArc: KaiWeeklyArc | undefined,
  currentWeekReplan?: KaiCurrentWeekReplan
): string[] {
  const beats: string[] = [];

  if (summary.plannedCount > 0) {
    beats.push(
      `${summary.plannedCompletedCount}/${summary.plannedCount} planned sessions were completed, with ${summary.remainingPlannedCount} still left open.`
    );
  } else if (summary.completedCount > 0) {
    beats.push(
      `${summary.completedCount} sessions were completed without a rigid weekly plan driving them.`
    );
  } else {
    beats.push("The week is still too early to read as a real pattern.");
  }

  if (weeklyArc && weeklyArc.pattern !== "starting") {
    beats.push(weeklyArc.summary);
  }

  if (readinessPattern.protectiveCount >= 2) {
    beats.push(
      `${readinessPattern.protectiveCount}/${readinessPattern.totalEntries} readiness checks called for modified, conservative, or accessory-only work.`
    );
  } else if (
    readinessPattern.totalEntries >= 2 &&
    readinessPattern.scoreDelta >= 12
  ) {
    beats.push(
      `Readiness climbed from ${readinessPattern.firstScore} to ${readinessPattern.lastScore} as the week went on.`
    );
  } else if (
    readinessPattern.totalEntries >= 2 &&
    readinessPattern.scoreDelta <= -12
  ) {
    beats.push(
      `Readiness fell from ${readinessPattern.firstScore} to ${readinessPattern.lastScore}, so the week got softer as it went on.`
    );
  }

  const keyInsight = weeklyInsights.find((insight) =>
    ["momentum", "progression", "set_fatigue", "workout_type", "selection"].includes(
      insight.kind
    )
  );
  if (keyInsight) {
    beats.push(keyInsight.detail);
  }

  if (currentWeekReplan?.active) {
    beats.push(
      `The plan was reshaped mid-week so the remaining sessions stayed finishable.`
    );
  }

  return beats.slice(0, 4);
}

function buildWeeklyChapterNextStep(
  review: KaiWeeklyReview,
  weeklyArc?: KaiWeeklyArc
): string {
  if (weeklyArc?.pattern === "rebuilding") {
    return "Keep this rebuild moving with one more steady week.";
  }

  if (weeklyArc?.pattern === "oscillating") {
    return "Keep the next week simpler so the pattern can settle.";
  }

  if (weeklyArc?.pattern === "building") {
    return "Keep stacking clean weeks before you ask for a bigger jump.";
  }

  return review.nextWeekFocus;
}

function buildWeeklyChapterWins(
  summary: KaiWeeklySummary,
  weeklyInsights: KaiWeeklyInsight[],
  readinessPattern: ReturnType<typeof summarizeWeeklyReadinessPattern>
): string[] {
  const wins: string[] = [];
  const positiveProgressionInsight = getPositiveProgressionInsight(weeklyInsights);

  if ((summary.strongSessionCount ?? 0) >= Math.max(1, Math.floor(summary.completedCount / 2))) {
    wins.push("The sessions that happened were mostly handled with good execution.");
  }

  if (positiveProgressionInsight) {
    wins.push(positiveProgressionInsight.title);
  }

  if (summary.mainCoveragePercent >= 80 && summary.completedCount > 0) {
    wins.push("Main work mostly held up when sessions were completed.");
  }

  if (readinessPattern.totalEntries >= 2 && readinessPattern.scoreDelta >= 12) {
    wins.push("Readiness improved as the week went on instead of fading.");
  }

  const positiveInsight = weeklyInsights.find(
    (insight) =>
      insight !== positiveProgressionInsight && isPositiveWeeklyInsight(insight)
  );
  if (positiveInsight) {
    wins.push(positiveInsight.title);
  }

  return dedupeStrings(wins).slice(0, 3);
}

function buildWeeklyChapterFrictions(
  review: KaiWeeklyReview,
  weeklyInsights: KaiWeeklyInsight[],
  readinessPattern: ReturnType<typeof summarizeWeeklyReadinessPattern>
): string[] {
  const frictions: string[] = [];
  const negativeProgressionInsight = getNegativeProgressionInsight(weeklyInsights);

  if (readinessPattern.protectiveCount >= 2) {
    frictions.push(
      `${readinessPattern.protectiveCount}/${readinessPattern.totalEntries} readiness checks needed the day toned down.`
    );
  }

  frictions.push(...review.reasons);

  if (
    readinessPattern.totalEntries >= 2 &&
    readinessPattern.scoreDelta <= -12 &&
    readinessPattern.protectiveCount < 2
  ) {
    frictions.push("Readiness softened as the week went on, even when the week did not fully break.");
  }

  if (negativeProgressionInsight) {
    frictions.push(negativeProgressionInsight.detail);
  }

  const cautionInsight = weeklyInsights.find(isNegativeWeeklyInsight);
  if (cautionInsight) {
    frictions.push(cautionInsight.detail);
  }

  return dedupeStrings(frictions).slice(0, 3);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isPositiveWeeklyInsight(insight: KaiWeeklyInsight): boolean {
  if (
    [
      "selection",
      "exercise_history",
      "session_pattern"
    ].includes(insight.kind)
  ) {
    return true;
  }

  const text = `${insight.title} ${insight.detail}`.toLowerCase();

  return (
    text.includes("holding up well") ||
    text.includes("mostly held up") ||
    text.includes("mostly there") ||
    text.includes("solid") ||
    text.includes("fairly aligned") ||
    text.includes("recovered as the week went on") ||
    text.includes("climbing back up") ||
    text.includes("earned a build") ||
    text.includes("becoming the more reliable version") ||
    text.includes("a real pr landed") ||
    text.includes("moving up cleanly") ||
    text.includes("quiet progress still happened")
  );
}

function isNegativeWeeklyInsight(insight: KaiWeeklyInsight): boolean {
  if (insight.kind === "set_fatigue") {
    return true;
  }

  const text = `${insight.title} ${insight.detail}`.toLowerCase();

  return (
    text.includes("needs protection") ||
    text.includes("trimming the week") ||
    text.includes("softened as the week went on") ||
    text.includes("needs a steadier repeat") ||
    text.includes("below its recent baseline") ||
    text.includes("too many sessions were survival-style") ||
    text.includes("drifted away from the original plan") ||
    text.includes("drifting apart") ||
    text.includes("oscillating instead of stabilizing") ||
    text.includes("trending downward") ||
    text.includes("stable but flat") ||
    text.includes("dropped off often") ||
    text.includes("kept thinning out") ||
    text.includes("need more protection") ||
    text.includes("guardrails are outweighing progression")
  );
}

function formatWeeklyChapterPlannedWorkoutLabel(plannedWorkout: PlannedWorkout): string {
  return `${toTitleCase(plannedWorkout.type.replaceAll("_", " "))} on ${plannedWorkout.date}`;
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildSelectionInsight(
  weeklyExerciseInsights: KaiWeeklyPayload["weeklyExerciseInsights"]
): KaiWeeklyInsight | undefined {
  const learnedSelection = weeklyExerciseInsights.find(
    (insight) => (insight.selectionReasons?.length ?? 0) > 0
  );

  if (!learnedSelection || !learnedSelection.selectionReasons?.length) {
    return undefined;
  }

  return {
    kind: "selection",
    title: `${learnedSelection.name} is becoming the more reliable version of this movement`,
    detail: learnedSelection.selectionReasons[0]
  };
}

function buildReadinessHistoryInsight(
  weeklyReadinessHistory: ReadinessHistoryEntry[]
): KaiWeeklyInsight | undefined {
  const readinessPattern = summarizeWeeklyReadinessPattern(weeklyReadinessHistory);

  if (readinessPattern.totalEntries < 2) {
    return undefined;
  }

  if (readinessPattern.protectiveCount >= 2) {
    return {
      kind: "readiness",
      title: "Readiness kept trimming the week",
      detail: `${readinessPattern.protectiveCount}/${readinessPattern.totalEntries} readiness checks called for a modified, conservative, or accessory-only day.`
    };
  }

  if (readinessPattern.scoreDelta >= 12) {
    return {
      kind: "readiness",
      title: "Readiness recovered as the week went on",
      detail: `Readiness moved from ${readinessPattern.firstScore} to ${readinessPattern.lastScore} across the week.`
    };
  }

  if (readinessPattern.scoreDelta <= -12) {
    return {
      kind: "readiness",
      title: "Readiness softened as the week went on",
      detail: `Readiness moved from ${readinessPattern.firstScore} to ${readinessPattern.lastScore} across the week.`
    };
  }

  return undefined;
}

function summarizeWeeklyReadinessPattern(weeklyReadinessHistory: ReadinessHistoryEntry[]) {
  const sortedHistory = [...weeklyReadinessHistory].sort((left, right) =>
    left.asOf.localeCompare(right.asOf)
  );
  const modifiedCount = sortedHistory.filter(
    (entry) => entry.sessionStyle === "modified"
  ).length;
  const conservativeCount = sortedHistory.filter(
    (entry) => entry.sessionStyle === "conservative"
  ).length;
  const accessoryOnlyCount = sortedHistory.filter(
    (entry) => entry.sessionStyle === "accessory_only"
  ).length;

  return {
    totalEntries: sortedHistory.length,
    modifiedCount,
    conservativeCount,
    accessoryOnlyCount,
    protectiveCount: modifiedCount + conservativeCount + accessoryOnlyCount,
    firstScore: sortedHistory[0]?.readinessScore ?? 0,
    lastScore: sortedHistory.at(-1)?.readinessScore ?? 0,
    scoreDelta:
      (sortedHistory.at(-1)?.readinessScore ?? 0) -
      (sortedHistory[0]?.readinessScore ?? 0)
  };
}

function weeklyReviewStateScore(state: KaiWeeklyReviewState): number {
  if (state === "building") {
    return 3;
  }

  if (state === "steady") {
    return 2;
  }

  if (state === "protecting") {
    return 1;
  }

  return 0;
}

function formatWeeklyStateSequence(states: KaiWeeklyReviewState[]): string {
  return states.map((state) => state.replace("_", " ")).join(" -> ");
}

function buildProgressionGuardrailInsight(
  weeklyProgressionHighlights: KaiWeeklyPayload["weeklyProgressionHighlights"]
): KaiWeeklyInsight | undefined {
  const guardedHighlights = weeklyProgressionHighlights.filter(
    (highlight) =>
      highlight.action !== "progress" &&
      highlight.reason.toLowerCase().includes("set-level strain")
  );
  const guardedHighlight = guardedHighlights[0];

  if (!guardedHighlight) {
    return undefined;
  }

  const guardedCueCount = guardedHighlights.length;
  const progressCueCount = weeklyProgressionHighlights.filter(
    (highlight) => highlight.action === "progress"
  ).length;

  if (guardedCueCount >= Math.max(3, progressCueCount + 2)) {
    return {
      kind: "progression",
      title: "Guardrails are outweighing progression this week",
      detail: `${guardedCueCount} guarded progression cues vs ${progressCueCount} progress cues. Keep the week moving, but avoid stacking too many hold-backs in a row.`
    };
  }

  return {
    kind: "progression",
    title: "The week can still move forward, but one lift should repeat cleanly first",
    detail: `${guardedHighlight.label} is staying at repeat for now because recent comparable work showed rising set-level strain.`
  };
}

function buildPerformanceVelocityInsight(
  weeklyPerformanceSignals: KaiWeeklyPayload["weeklyPerformanceSignals"]
): KaiWeeklyInsight | undefined {
  const personalBestSignal = weeklyPerformanceSignals.find(
    (signal) => signal.latestWasPersonalBest
  );

  if (personalBestSignal) {
    const deltaSuffix =
      personalBestSignal.performanceDeltaPercent !== undefined
        ? `, up ${Math.abs(personalBestSignal.performanceDeltaPercent)}% against its recent baseline`
        : "";

    return {
      kind: "progression",
      title: "A real PR landed this week",
      detail: `${personalBestSignal.name} hit a new best this week${deltaSuffix}.`
    };
  }

  const risingSignal = weeklyPerformanceSignals.find(
    (signal) => signal.progressionVelocity === "rising"
  );
  if (risingSignal) {
    return {
      kind: "progression",
      title: "Quiet progress still happened this week",
      detail: `${risingSignal.name} is tracking ${Math.abs(
        risingSignal.performanceDeltaPercent ?? 0
      )}% above its recent baseline, even without needing a bigger weekly jump.`
    };
  }

  const slippingSignal = weeklyPerformanceSignals.find(
    (signal) => signal.progressionVelocity === "slipping"
  );
  if (slippingSignal) {
    return {
      kind: "progression",
      title: `${slippingSignal.name} needs a steadier repeat`,
      detail: `${slippingSignal.name} came in ${Math.abs(
        slippingSignal.performanceDeltaPercent ?? 0
      )}% below its recent baseline, so it should repeat cleanly before it asks for more.`
    };
  }

  return undefined;
}

function summarizeWeeklyPerformancePattern(
  recentExerciseHistory: KaiWeeklyPayload["recentExerciseHistory"],
  weeklyPerformanceSignals: KaiWeeklyPayload["weeklyPerformanceSignals"]
): {
  risingCount: number;
  slippingCount: number;
  personalBestCount: number;
} {
  const signalExerciseIds = new Set(
    weeklyPerformanceSignals.map((signal) => signal.exerciseId)
  );
  const relevantHistory = recentExerciseHistory.filter(
    (entry) =>
      signalExerciseIds.has(entry.exerciseId) ||
      entry.latestWasPersonalBest ||
      entry.progressionVelocity === "rising" ||
      entry.progressionVelocity === "slipping"
  );

  return {
    risingCount: relevantHistory.filter(
      (entry) => entry.progressionVelocity === "rising"
    ).length,
    slippingCount: relevantHistory.filter(
      (entry) => entry.progressionVelocity === "slipping"
    ).length,
    personalBestCount: relevantHistory.filter(
      (entry) => entry.latestWasPersonalBest
    ).length
  };
}

function getPositiveProgressionInsight(
  weeklyInsights: KaiWeeklyInsight[]
): KaiWeeklyInsight | undefined {
  return weeklyInsights.find(
    (insight) => insight.kind === "progression" && isPositiveWeeklyInsight(insight)
  );
}

function getNegativeProgressionInsight(
  weeklyInsights: KaiWeeklyInsight[]
): KaiWeeklyInsight | undefined {
  return weeklyInsights.find(
    (insight) => insight.kind === "progression" && isNegativeWeeklyInsight(insight)
  );
}

function buildSetFatigueInsight(
  summary: KaiWeeklySummary
): KaiWeeklyInsight | undefined {
  const setFatigueFlagCount = summary.setFatigueFlagCount ?? 0;
  const restInflationSessionCount = summary.restInflationSessionCount ?? 0;
  const repDropoffSessionCount = summary.repDropoffSessionCount ?? 0;

  if (
    setFatigueFlagCount === 0 &&
    restInflationSessionCount === 0 &&
    repDropoffSessionCount === 0
  ) {
    return undefined;
  }

  const leadingSignalCount = Math.max(
    setFatigueFlagCount,
    restInflationSessionCount,
    repDropoffSessionCount
  );

  return {
    kind: "set_fatigue",
    title:
      leadingSignalCount >= Math.ceil(Math.max(summary.completedCount, 1) / 2)
        ? "Set-level fatigue markers are rising"
        : "Some set-level fatigue markers are showing up",
    detail: `${setFatigueFlagCount} sessions with rising effort, ${restInflationSessionCount} with inflated rest, ${repDropoffSessionCount} with meaningful rep drop-off.`
  };
}

function buildExerciseHistoryInsight(
  recentExerciseHistory: KaiWeeklyPayload["recentExerciseHistory"]
): KaiWeeklyInsight | undefined {
  const topExercise = recentExerciseHistory[0];

  if (!topExercise || topExercise.appearances < 2) {
    return undefined;
  }

  if (topExercise.executionQuality === "strong") {
    return {
      kind: "exercise_history",
      title: `${topExercise.name} is repeating well`,
      detail: `${topExercise.name} showed up ${topExercise.appearances} times recently and has been handled strongly${formatExerciseAlignmentSuffix(topExercise)}.`
    };
  }

  if (topExercise.executionQuality === "survival") {
    return {
      kind: "exercise_history",
      title: `${topExercise.name} needs a steadier repeat`,
      detail: `${topExercise.name} keeps showing up, but recent executions have been survival-style${formatExerciseAlignmentSuffix(topExercise)}.`
    };
  }

  return {
    kind: "exercise_history",
    title: `${topExercise.name} is staying in the mix`,
    detail: `${topExercise.name} appeared ${topExercise.appearances} times recently with workable execution${formatExerciseAlignmentSuffix(topExercise)}.`
  };
}

function formatExerciseAlignmentSuffix(
  exercise: KaiWeeklyPayload["recentExerciseHistory"][number]
): string {
  if ((exercise.followedPlannedRate ?? 0) >= 0.5) {
    return " while staying close to the planned session";
  }

  if ((exercise.followedSuggestedRate ?? 0) >= 0.5) {
    return " while fitting the suggested day type well";
  }

  if ((exercise.averageSubstitutionCount ?? 0) >= 1) {
    return " but it has often required substitutions";
  }

  return "";
}

function buildSessionPatternInsight(
  sessionPatternMemory?: KaiMemory["sessionPatternMemory"]
): KaiWeeklyInsight | undefined {
  if (!sessionPatternMemory || sessionPatternMemory.structuredPatternConfidence < 0.5) {
    return undefined;
  }

  if (sessionPatternMemory.patternLabel === "stable_split") {
    return {
      kind: "session_pattern",
      title: "A stable split pattern is showing up",
      detail: `Recent training has repeated a stable sequence: ${sessionPatternMemory.commonTransitions.join(", ")}.`
    };
  }

  if (sessionPatternMemory.patternLabel === "alternating_mix") {
    return {
      kind: "session_pattern",
      title: "An alternating pattern is starting to hold",
      detail: `Recent sessions are alternating through ${sessionPatternMemory.dominantWorkoutTypes.join(" and ")}.`
    };
  }

  if (sessionPatternMemory.patternLabel === "repeat_day_by_day") {
    return {
      kind: "session_pattern",
      title: "A repeat-day pattern is emerging",
      detail: `Recent sessions keep revisiting ${sessionPatternMemory.dominantWorkoutTypes[0] ?? "the same training day"}.`
    };
  }

  return undefined;
}

function buildSuggestedWorkoutDriftInsight(
  suggestedWorkoutMemory?: KaiMemory["suggestedWorkoutMemory"]
): KaiWeeklyInsight | undefined {
  const dominantDrift = suggestedWorkoutMemory?.dominantDrift;
  if (
    !dominantDrift ||
    dominantDrift.occurrences < 2 ||
    dominantDrift.followThroughRate > 0.4
  ) {
    return undefined;
  }

  return {
    kind: "execution_alignment",
    title: `Suggested ${formatWorkoutTypeLabel(dominantDrift.suggestedWorkoutType)} keep drifting into ${formatWorkoutTypeLabel(dominantDrift.performedWorkoutType)}`,
    detail: `${dominantDrift.occurrences} recent suggested ${formatWorkoutTypeLabel(dominantDrift.suggestedWorkoutType)} were actually trained more like ${formatWorkoutTypeLabel(dominantDrift.performedWorkoutType)}.`
  };
}

export function buildKaiWeeklyReview(
  summary: KaiWeeklySummary,
  previousWeekSummary?: KaiWeeklySummary,
  workouts: WorkoutRecord[] = [],
  asOf?: string,
  recentExerciseHistory: KaiWeeklyPayload["recentExerciseHistory"] = [],
  weeklyReadinessHistory: ReadinessHistoryEntry[] = [],
  weeklyPerformanceSignals: KaiWeeklyPayload["weeklyPerformanceSignals"] = []
): KaiWeeklyReview {
  const reasons: string[] = [];
  const workoutTypePattern = summarizeWorkoutTypePattern(workouts, asOf);
  const performedWorkoutDrift = summarizePerformedWorkoutDrift(workouts, asOf);
  const topExercise = recentExerciseHistory[0];
  const progressionPattern = summarizeWeeklyPerformancePattern(
    recentExerciseHistory,
    weeklyPerformanceSignals
  );
  const weekStillOpen =
    summary.plannedCount > 0 && summary.remainingPlannedCount > 0;
  const noActualSlipYet =
    summary.plannedMissedCount === 0 && summary.missedCount === 0;
  const weakMainExecution =
    summary.completedCount >= 2 &&
    summary.mainCoveragePercent > 0 &&
    summary.mainCoveragePercent < 60;
  const thinWorkDominant =
    summary.completedCount >= 2 &&
    summary.thinSessionCount >= Math.ceil(summary.completedCount / 2);
  const survivalWorkDominant =
    summary.completedCount >= 2 &&
    (summary.survivalSessionCount ?? 0) >= Math.ceil(summary.completedCount / 2);
  const planDeviationHeavy =
    summary.completedCount >= 2 &&
    (summary.substitutionCount ?? 0) >= summary.completedCount;
  const leadingFatigueSignalsDominant =
    summary.completedCount >= 2 &&
    ((summary.setFatigueFlagCount ?? 0) >= Math.ceil(summary.completedCount / 2) ||
      (summary.restInflationSessionCount ?? 0) >= Math.ceil(summary.completedCount / 2) ||
      (summary.repDropoffSessionCount ?? 0) >= Math.ceil(summary.completedCount / 2));
  const readinessPattern = summarizeWeeklyReadinessPattern(weeklyReadinessHistory);
  const readinessNeedsProtection =
    readinessPattern.protectiveCount >= 2 ||
    readinessPattern.accessoryOnlyCount >= 1 ||
    readinessPattern.modifiedCount >= 3;
  const progressActuallyMoving =
    progressionPattern.personalBestCount > 0 || progressionPattern.risingCount > 0;
  const progressClearlySlipping =
    progressionPattern.slippingCount > progressionPattern.risingCount &&
    progressionPattern.slippingCount > 0;

  if (summary.plannedCount === 0 && summary.completedCount === 0) {
    return {
      state: "steady",
      adaptationAction: "hold_next_week",
      headline: "The week is still mostly unproven.",
      reasons: ["There is not enough training activity yet to call this week strong or weak."],
      nextWeekFocus: "Keep next week simple and establish one clear completed session early."
    };
  }

  if (
    summary.plannedMissedCount >= 2 ||
    (!weekStillOpen && summary.planAdherencePercent < 50) ||
    (summary.missedCount >= 3 && summary.completedCount <= 1)
  ) {
    if (summary.plannedMissedCount >= 2) {
      reasons.push("Multiple planned workouts were missed.");
    }
    if (summary.planAdherencePercent < 50 && summary.plannedCount > 0) {
      reasons.push("Less than half of the planned week was completed.");
    }
    if (summary.missedCount >= 3 && summary.completedCount <= 1) {
      reasons.push("Misses outweighed meaningful completed work.");
    }
    if (workoutTypePattern?.trend === "fragile") {
      reasons.push(`${workoutTypePattern.label} sessions were the main friction point.`);
    }
    if (performedWorkoutDrift) {
      reasons.push(
        `Recent sessions logged as ${performedWorkoutDrift.loggedLabel.toLowerCase()} have looked more like ${performedWorkoutDrift.performedLabel.toLowerCase()} in practice.`
      );
    }

    return {
      state: "resetting",
      adaptationAction: "reset_next_week",
      headline: "Next week should reset to something easier to finish.",
      reasons,
      nextWeekFocus: "Lower the bar, shrink the week, and make the first workout easy to complete."
    };
  }

  if (
    summary.weekStatus === "on_track" &&
    summary.plannedCount > 0 &&
    summary.planAdherencePercent >= 85 &&
    summary.remainingPlannedCount === 0 &&
    !weakMainExecution &&
    !thinWorkDominant &&
    !survivalWorkDominant &&
    !readinessNeedsProtection
  ) {
    reasons.push("The planned week was completed cleanly.");
    if (summary.completedCount >= 3) {
      reasons.push("Training volume across the week held up well.");
    }
    if (
      previousWeekSummary &&
      previousWeekSummary.planAdherencePercent >= 85 &&
      previousWeekSummary.remainingPlannedCount === 0
    ) {
      reasons.push("This follows another steady week, so a small build is earned.");
    }
    if (progressionPattern.personalBestCount > 0) {
      reasons.push(
        `${progressionPattern.personalBestCount} lift${progressionPattern.personalBestCount === 1 ? "" : "s"} hit a new best this week.`
      );
    } else if (progressionPattern.risingCount > 0) {
      reasons.push("At least one recurring lift is moving up cleanly instead of just repeating.");
    }
    if (progressClearlySlipping) {
      reasons.push("Performance held together enough to train, but the main lifts did not move up cleanly.");
    }
    if (
      topExercise &&
      topExercise.appearances >= 2 &&
      topExercise.executionQuality === "strong"
    ) {
      reasons.push(`${topExercise.name} has repeated strongly enough to support a small build.`);
    }
    if ((summary.suggestedFollowThroughCount ?? 0) >= 2 && summary.plannedCount === 0) {
      reasons.push("You are following a workable day-by-day rhythm closely enough to build from it.");
    }

    return {
      state:
        !progressClearlySlipping &&
        progressActuallyMoving &&
        previousWeekSummary &&
        previousWeekSummary.planAdherencePercent >= 85 &&
        previousWeekSummary.remainingPlannedCount === 0
          ? "building"
          : "steady",
      adaptationAction:
        !progressClearlySlipping &&
        progressActuallyMoving &&
        previousWeekSummary &&
        previousWeekSummary.planAdherencePercent >= 85 &&
        previousWeekSummary.remainingPlannedCount === 0
          ? "build_next_week"
          : "hold_next_week",
      headline:
        !progressClearlySlipping &&
        progressActuallyMoving &&
        previousWeekSummary &&
        previousWeekSummary.planAdherencePercent >= 85 &&
        previousWeekSummary.remainingPlannedCount === 0
          ? "The week is strong enough to build from."
          : !progressClearlySlipping && progressActuallyMoving
            ? "The week stayed steady and still moved forward."
          : progressClearlySlipping
            ? "The week stayed finishable, but the main lifts should settle before building."
          : "The week landed cleanly and should hold steady.",
      reasons,
      nextWeekFocus:
        !progressClearlySlipping &&
        progressActuallyMoving &&
        previousWeekSummary &&
        previousWeekSummary.planAdherencePercent >= 85 &&
        previousWeekSummary.remainingPlannedCount === 0
          ? "Let next week grow slightly, but keep the same structure."
          : !progressClearlySlipping && progressActuallyMoving
            ? "Repeat the structure once more and let the small progress keep stacking."
          : progressClearlySlipping
            ? "Repeat the structure once more and let the key lifts look cleaner before you ask for more."
          : "Repeat a similar week before asking for more."
    };
  }

  if (
    summary.plannedMissedCount >= 1 ||
    summary.remainingPlannedCount > 0 ||
    (summary.plannedCount > 0 && summary.planAdherencePercent < 85) ||
    weakMainExecution ||
    thinWorkDominant ||
    survivalWorkDominant ||
    planDeviationHeavy ||
    leadingFatigueSignalsDominant ||
    readinessNeedsProtection
  ) {
    if (weekStillOpen && noActualSlipYet && summary.completedCount === 0) {
      return {
        state: "steady",
        adaptationAction: "hold_next_week",
        headline: "The week is still early and should stay simple.",
        reasons: ["The week has open planned work, but nothing has actually slipped yet."],
        nextWeekFocus: "Get the first planned session done before judging the week."
      };
    }

    if (summary.plannedMissedCount >= 1) {
      reasons.push("At least one planned workout slipped.");
    }
    if (summary.remainingPlannedCount > 0) {
      reasons.push("The week still has unfinished planned work.");
    }
    if (summary.plannedCount > 0 && summary.planAdherencePercent < 85) {
      reasons.push("The week held together, but not strongly enough to add more.");
    }
    if (weakMainExecution) {
      reasons.push("The main work kept thinning out even when sessions were completed.");
    }
    if (thinWorkDominant) {
      reasons.push("Too many completed sessions were survival-style instead of full work.");
    }
    if (survivalWorkDominant && !thinWorkDominant) {
      reasons.push("Execution quality dropped too often even when workouts were logged.");
    }
    if (planDeviationHeavy) {
      reasons.push("Completed sessions needed enough substitutions or changes that the original plan is not holding cleanly.");
    }
    if (leadingFatigueSignalsDominant) {
      reasons.push("Set-level fatigue markers are rising before the week is fully breaking down.");
    }
    if (progressClearlySlipping) {
      reasons.push("Lift performance dipped enough that the week should protect clean repeats before it builds.");
    }
    if (readinessNeedsProtection) {
      reasons.push(
        `${readinessPattern.protectiveCount}/${readinessPattern.totalEntries} readiness checks needed the day toned down.`
      );
    }
    if (workoutTypePattern?.trend === "fragile") {
      reasons.push(`${workoutTypePattern.label} sessions are still the main area to protect.`);
    }
    if (performedWorkoutDrift) {
      reasons.push(
        `Recent sessions logged as ${performedWorkoutDrift.loggedLabel.toLowerCase()} have looked more like ${performedWorkoutDrift.performedLabel.toLowerCase()} in practice.`
      );
    }
    if (
      topExercise &&
      topExercise.appearances >= 2 &&
      topExercise.executionQuality === "survival"
    ) {
      reasons.push(`${topExercise.name} keeps showing up, but its recent executions have been survival-style.`);
    }
    if (
      summary.explicitPlannedFollowThroughCount !== undefined &&
      summary.explicitPlannedFollowThroughCount > 0 &&
      summary.explicitPlannedFollowThroughCount < summary.plannedCompletedCount
    ) {
      reasons.push("Some completed sessions got done, but not closely enough to the original planned version.");
    }

    return {
      state: "protecting",
      adaptationAction: "protect_next_week",
      headline: "Next week should stay finishable rather than expand.",
      reasons,
      nextWeekFocus: "Keep the next week modest and protect consistency before building again."
    };
  }

  reasons.push("The week held together without clear signs that it needs shrinking.");
  if (progressActuallyMoving) {
    reasons.push("There are still signs of progress, even if the week does not need to grow yet.");
  } else if (progressClearlySlipping) {
    reasons.push("The week stayed stable, but lift performance is asking for another steady repeat.");
  }

  return {
    state: "steady",
    adaptationAction: "hold_next_week",
    headline:
      progressActuallyMoving && !progressClearlySlipping
        ? "The week stayed quiet, but progress still showed up."
        : progressClearlySlipping
          ? "The week held together, but progress flattened out."
          : "The week is stable enough to repeat.",
    reasons,
    nextWeekFocus:
      progressActuallyMoving && !progressClearlySlipping
        ? "Hold a similar structure next week and let the quiet progress keep stacking."
        : progressClearlySlipping
          ? "Hold the same structure next week and make the key lifts look cleaner before asking for more."
          : "Hold a similar structure next week and look for cleaner follow-through."
  };
}

function buildWorkoutTypeInsight(
  workouts: WorkoutRecord[],
  asOf?: string
): KaiWeeklyInsight | undefined {
  const pattern = summarizeWorkoutTypePattern(workouts, asOf);
  if (!pattern) {
    return undefined;
  }

  if (pattern.trend === "fragile") {
    return {
      kind: "workout_type",
      title: `${pattern.label} days need more protection`,
      detail: `Recent ${pattern.label.toLowerCase()} sessions included ${pattern.missed} misses and ${pattern.survival} survival-style completions.`
    };
  }

  if (pattern.trend === "reliable") {
    return {
      kind: "workout_type",
      title: `${pattern.label} days are holding up well`,
      detail: `Recent ${pattern.label.toLowerCase()} sessions have stayed reliable without misses or survival-style drop-offs.`
    };
  }

  return undefined;
}

function buildPerformedWorkoutInsight(
  workouts: WorkoutRecord[],
  asOf?: string
): KaiWeeklyInsight | undefined {
  const drift = summarizePerformedWorkoutDrift(workouts, asOf);
  if (!drift) {
    return undefined;
  }

  return {
    kind: "workout_type",
    title: "Logged day types and performed work are drifting apart",
    detail: `Recent sessions logged as ${drift.loggedLabel.toLowerCase()} have looked more like ${drift.performedLabel.toLowerCase()} from the exercises that were actually performed.`
  };
}

function summarizePerformedWorkoutDrift(
  workouts: WorkoutRecord[],
  asOf?: string
):
  | {
      loggedLabel: string;
      performedLabel: string;
      count: number;
    }
  | undefined {
  if (!asOf) {
    return undefined;
  }

  const recentCompleted = workouts.filter(
    (workout) =>
      workout.status === "completed" &&
      workout.date < asOf &&
      daysBetween(workout.date, asOf) <= 21 &&
      workout.outcomeSummary?.performedWorkoutType &&
      workout.outcomeSummary.performedWorkoutType !== workout.type
  );

  if (recentCompleted.length < 2) {
    return undefined;
  }

  const mismatchCounts = recentCompleted.reduce<Record<string, number>>((counts, workout) => {
    const mismatchKey = `${formatWorkoutTypeLabel(workout.type)}->${formatWorkoutTypeLabel(
      workout.outcomeSummary!.performedWorkoutType!
    )}`;
    counts[mismatchKey] = (counts[mismatchKey] ?? 0) + 1;
    return counts;
  }, {});
  const topMismatch = Object.entries(mismatchCounts).sort(
    (left, right) => right[1] - left[1]
  )[0];

  if (!topMismatch || topMismatch[1] < 2) {
    return undefined;
  }

  const [loggedLabel, performedLabel] = topMismatch[0].split("->");
  return {
    loggedLabel,
    performedLabel,
    count: topMismatch[1]
  };
}

export function summarizeWorkoutTypePattern(
  workouts: WorkoutRecord[],
  asOf?: string
): {
  trend: "fragile" | "reliable";
  workoutType: string;
  label: string;
  missed: number;
  survival: number;
} | undefined {
  if (!asOf) {
    return undefined;
  }

  const recent = workouts
    .filter(
      (workout) =>
        workout.date < asOf &&
        daysBetween(workout.date, asOf) <= 21 &&
        (workout.status === "completed" || workout.status === "missed")
    )
    .sort((left, right) =>
      right.date.localeCompare(left.date) ||
      (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "")
    );

  if (!recent.length) {
    return undefined;
  }

  const byType = new Map<
    string,
    {
      total: number;
      completed: number;
      missed: number;
      survival: number;
    }
  >();

  for (const workout of recent) {
    const current = byType.get(workout.type) ?? {
      total: 0,
      completed: 0,
      missed: 0,
      survival: 0
    };
    current.total += 1;
    if (workout.status === "completed") {
      current.completed += 1;
      if (workout.outcomeSummary?.executionQuality === "survival") {
        current.survival += 1;
      }
    } else if (workout.status === "missed") {
      current.missed += 1;
    }
    byType.set(workout.type, current);
  }

  const fragile = [...byType.entries()]
    .filter(([, stats]) => stats.total >= 2 && (stats.missed >= 2 || stats.survival >= 1))
    .sort((left, right) => {
      const rightPenalty = right[1].missed * 2 + right[1].survival;
      const leftPenalty = left[1].missed * 2 + left[1].survival;
      return rightPenalty - leftPenalty;
    })[0];

  if (fragile) {
    return {
      trend: "fragile",
      workoutType: fragile[0],
      label: formatWorkoutTypeLabel(fragile[0]),
      missed: fragile[1].missed,
      survival: fragile[1].survival
    };
  }

  const reliable = [...byType.entries()]
    .filter(([, stats]) => stats.total >= 2 && stats.missed === 0 && stats.survival === 0)
    .sort((left, right) => right[1].completed - left[1].completed)[0];

  if (reliable) {
    return {
      trend: "reliable",
      workoutType: reliable[0],
      label: formatWorkoutTypeLabel(reliable[0]),
      missed: reliable[1].missed,
      survival: reliable[1].survival
    };
  }

  return undefined;
}

function formatWorkoutTypeLabel(workoutType: string): string {
  const label = workoutType.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T12:00:00.000Z`).getTime();
  return Math.round((end - start) / DAY_IN_MS);
}

export function getWeekRange(asOf: string): { weekStart: string; weekEnd: string } {
  const date = new Date(`${asOf}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  const start = new Date(date.getTime() - daysFromMonday * DAY_IN_MS);
  const end = new Date(start.getTime() + 6 * DAY_IN_MS);

  return {
    weekStart: toDateString(start),
    weekEnd: toDateString(end)
  };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatPlannedWorkoutLabel(plannedWorkout: PlannedWorkout): string {
  return `${plannedWorkout.type.replaceAll("_", " ")} on ${plannedWorkout.date}`;
}

function decideWeekStatus(input: {
  plannedCount: number;
  completedCount: number;
  missedCount: number;
  plannedCompletedCount: number;
  plannedMissedCount: number;
}): "not_started" | "mixed" | "on_track" | "off_track" {
  if (input.plannedCount === 0 && input.completedCount === 0 && input.missedCount === 0) {
    return "not_started";
  }

  if (input.plannedCount > 0 && input.plannedCompletedCount === input.plannedCount) {
    return "on_track";
  }

  if (input.plannedMissedCount >= 2 || input.missedCount >= 3) {
    return "off_track";
  }

  if (input.completedCount > 0 || input.missedCount > 0) {
    return "mixed";
  }

  return "not_started";
}
