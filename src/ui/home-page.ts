export function renderHomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kai Phone Test</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe6;
        --panel: #fffaf3;
        --panel-strong: #fff;
        --ink: #1f1b17;
        --muted: #6c645b;
        --line: #ddd2c2;
        --accent: #cb5a1f;
        --accent-soft: #f4dfd1;
        --warn: #9b3d16;
        --good: #2f6b3d;
        --good-soft: #e8f2ea;
        --bad: #a43d31;
        --bad-soft: #f9e3df;
        --caution: #8b6a1d;
        --caution-soft: #f7edcc;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, #fff8ee 0, transparent 30%),
          linear-gradient(180deg, #f7f2ea 0%, var(--bg) 100%);
        color: var(--ink);
      }

      .page {
        max-width: 760px;
        margin: 0 auto;
        padding: 20px 14px 48px;
      }

      .hero {
        margin-bottom: 16px;
      }

      .eyebrow {
        margin: 0 0 6px;
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0 0 8px;
        font-size: clamp(28px, 8vw, 44px);
        line-height: 1;
      }

      .subcopy {
        margin: 0;
        color: var(--muted);
        line-height: 1.45;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .card {
        background: rgba(255, 250, 243, 0.95);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
        box-shadow: 0 10px 28px rgba(88, 64, 43, 0.08);
      }

      .card h2 {
        margin: 0 0 12px;
        font-size: 22px;
      }

      .field-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .field {
        margin-bottom: 10px;
      }

      .field label {
        display: block;
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 13px;
      }

      .field input,
      .field select {
        width: 100%;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: var(--panel-strong);
        color: var(--ink);
        font: inherit;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        cursor: pointer;
        background: var(--accent);
        color: #fff8f4;
      }

      button.secondary {
        background: #efe3d2;
        color: var(--ink);
      }

      .status {
        margin: 12px 0 0;
        min-height: 20px;
        color: var(--good);
        font-size: 14px;
      }

      .kai-label,
      .chip {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        line-height: 1;
      }

      .kai-label {
        margin-bottom: 10px;
        background: var(--accent-soft);
        color: var(--warn);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .kai-message {
        margin: 0 0 10px;
        font-size: 24px;
        line-height: 1.3;
      }

      .muted {
        color: var(--muted);
      }

      .signal-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-top: 12px;
      }

      .signal {
        padding: 10px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: var(--panel-strong);
      }

      .signal strong {
        display: block;
        font-size: 20px;
      }

      .signal span {
        font-size: 12px;
        color: var(--muted);
      }

      .chip-list,
      .exercise-list,
      .load-list,
      .session-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip.bad {
        background: var(--bad-soft);
        color: var(--bad);
      }

      .chip.caution {
        background: var(--caution-soft);
        color: var(--caution);
      }

      .chip.good {
        background: var(--good-soft);
        color: var(--good);
      }

      .exercise-list,
      .load-list,
      .session-list {
        flex-direction: column;
      }

      .exercise-item,
      .load-item,
      .session-item {
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: var(--panel-strong);
      }

      .exercise-item strong,
      .load-item strong,
      .session-item strong {
        display: block;
        margin-bottom: 4px;
      }

      .exercise-item small,
      .load-item small,
      .session-item small {
        display: block;
        color: var(--muted);
        line-height: 1.4;
      }

      .session-builder {
        display: grid;
        gap: 10px;
      }

      .session-row {
        display: grid;
        grid-template-columns: 1.3fr 0.8fr 0.8fr 0.9fr auto;
        gap: 8px;
        align-items: end;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: rgba(255,255,255,0.72);
      }

      .session-row button {
        padding: 10px 12px;
      }

      .section-title {
        margin: 0 0 10px;
        font-size: 16px;
      }

      .headline {
        margin: 0 0 8px;
        font-size: 24px;
        line-height: 1.25;
      }

      .support-copy {
        margin: 0 0 12px;
        color: var(--muted);
        line-height: 1.45;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }

      .section-header .section-title {
        margin: 0;
      }

      .two-up {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .empty {
        color: var(--muted);
        margin: 0;
      }

      @media (max-width: 640px) {
        .field-grid,
        .two-up,
        .signal-grid {
          grid-template-columns: 1fr 1fr;
        }

        .session-row {
          grid-template-columns: 1fr 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <p class="eyebrow">Kai Phone Test</p>
        <h1>Test the actual product flow today</h1>
        <p class="subcopy">
          This page gives you the full local test loop: fetch the exercise library,
          save a workout session, and see readiness and Kai update immediately.
        </p>
      </section>

      <section class="stack">
        <section class="card">
          <h2>Setup</h2>
          <div class="field-grid">
            <div class="field">
              <label for="userId">User ID</label>
              <input id="userId" value="user_1" />
            </div>
            <div class="field">
              <label for="date">Date</label>
              <input id="date" type="date" />
            </div>
            <div class="field">
              <label for="name">Name</label>
              <input id="name" value="Kabur" />
            </div>
            <div class="field">
              <label for="goal">Goal</label>
              <select id="goal">
                <option value="get_fitter">Get fitter</option>
                <option value="build_consistency">Build consistency</option>
                <option value="build_muscle">Build muscle</option>
                <option value="lose_weight">Lose weight</option>
              </select>
            </div>
          </div>
          <div class="actions">
            <button id="saveProfileButton" class="secondary">Save Profile</button>
            <button id="seedPosteriorButton" class="secondary">Seed Posterior Chain</button>
            <button id="seedPushButton" class="secondary">Seed Upper Push</button>
            <button id="seedPainLimitedUpperButton" class="secondary">Seed Pain-Limited Upper</button>
            <button id="seedEquipmentLimitedUpperButton" class="secondary">Seed Equipment-Limited Upper</button>
            <button id="refreshButton" class="secondary">Refresh</button>
            <button id="resetButton" class="secondary">Clear Workouts</button>
          </div>
          <p class="status" id="statusText"></p>
        </section>

        <section class="card">
          <h2>Kai Today</h2>
          <div class="kai-label" id="kaiCategory">start</div>
          <p class="kai-message" id="kaiMessage">Loading Kai...</p>
          <p id="kaiReason" class="muted"></p>
          <p id="kaiNextStep"><strong>Next step:</strong> <span class="muted" id="kaiNextStepText">-</span></p>
          <p id="plannedWorkout" class="muted"></p>

          <div class="signal-grid">
            <div class="signal"><strong id="streakValue">0</strong><span>Current streak</span></div>
            <div class="signal"><strong id="statusValue">-</strong><span>Status</span></div>
            <div class="signal"><strong id="scoreValue">0</strong><span>Score</span></div>
            <div class="signal"><strong id="activityValue">-</strong><span>Last activity</span></div>
          </div>
        </section>

        <section class="card">
          <h2>Log Workout Session</h2>
          <div class="field-grid">
            <div class="field">
              <label for="workoutType">Workout Type</label>
              <select id="workoutType">
                <option value="lower_body">Lower body</option>
                <option value="upper_body">Upper body</option>
                <option value="full_body">Full body</option>
                <option value="posterior_chain">Posterior chain</option>
                <option value="upper_push">Upper push</option>
              </select>
            </div>
            <div class="field">
              <label for="plannedDuration">Planned Duration</label>
              <input id="plannedDuration" type="number" min="1" value="45" />
            </div>
            <div class="field">
              <label for="completedDuration">Completed Duration</label>
              <input id="completedDuration" type="number" min="1" value="40" />
            </div>
          </div>

          <p class="section-title">Session Exercises</p>
          <div id="sessionBuilder" class="session-builder"></div>

          <div class="actions">
            <button id="addExerciseButton" class="secondary">Add Exercise</button>
            <button id="saveSessionButton">Save Workout Session</button>
          </div>
        </section>

        <section class="two-up">
          <section class="card">
            <h2>Readiness</h2>
            <p class="muted" id="readinessPlanLabel">Loading readiness...</p>
            <div class="section-header">
              <p class="section-title">Session</p>
              <span class="chip caution" id="readinessSessionLabel">Loading...</span>
            </div>
            <p class="headline" id="readinessHeadline">Loading readiness...</p>
            <p class="support-copy" id="readinessPrimaryAction"></p>
            <p class="support-copy" id="readinessFallbackNote"></p>

            <p class="section-title">Decision Audit</p>
            <p class="muted" id="readinessAuditSummary">Loading audit...</p>
            <p class="support-copy" id="readinessAuditUserExplanation"></p>
            <p class="support-copy" id="readinessAuditKaiExplanation"></p>

            <p class="section-title">Session Plan</p>
            <div class="session-list" id="sessionPlanList"></div>

            <p class="section-title">Swaps</p>
            <div class="session-list" id="substitutionList"></div>

            <p class="section-title">Overworked</p>
            <div class="chip-list" id="overworkedList"></div>

            <p class="section-title">Recovering</p>
            <div class="chip-list" id="recoveringList"></div>

            <p class="section-title">Avoid Today</p>
            <div class="chip-list" id="avoidMusclesList"></div>
          </section>

          <section class="card">
            <h2>Safer Alternatives</h2>
            <div class="exercise-list" id="saferAlternativesList"></div>

            <p class="section-title">Audit Picks</p>
            <div class="exercise-list" id="auditSelectedList"></div>

            <p class="section-title">Audit Near-Misses</p>
            <div class="exercise-list" id="auditDeprioritizedList"></div>

            <p class="section-title">Exercises To Avoid</p>
            <div class="exercise-list" id="avoidExercisesList"></div>
          </section>
        </section>

        <section class="two-up">
          <section class="card">
            <h2>Muscle Load</h2>
            <div class="load-list" id="muscleLoadList"></div>
          </section>

          <section class="card">
            <h2>Exercise Library</h2>
            <div class="field">
              <label for="exerciseSearch">Search exercises</label>
              <input id="exerciseSearch" placeholder="Search by name..." />
            </div>
            <div class="exercise-list" id="exerciseLibraryList"></div>
          </section>
        </section>
      </section>
    </main>

    <script>
      const state = {
        library: [],
        sessionExercises: []
      };

      const userIdInput = document.getElementById("userId");
      const dateInput = document.getElementById("date");
      const nameInput = document.getElementById("name");
      const goalInput = document.getElementById("goal");
      const workoutTypeInput = document.getElementById("workoutType");
      const plannedDurationInput = document.getElementById("plannedDuration");
      const completedDurationInput = document.getElementById("completedDuration");
      const exerciseSearchInput = document.getElementById("exerciseSearch");
      const saveProfileButton = document.getElementById("saveProfileButton");
      const seedPosteriorButton = document.getElementById("seedPosteriorButton");
      const seedPushButton = document.getElementById("seedPushButton");
      const seedPainLimitedUpperButton = document.getElementById("seedPainLimitedUpperButton");
      const seedEquipmentLimitedUpperButton = document.getElementById("seedEquipmentLimitedUpperButton");
      const refreshButton = document.getElementById("refreshButton");
      const resetButton = document.getElementById("resetButton");
      const addExerciseButton = document.getElementById("addExerciseButton");
      const saveSessionButton = document.getElementById("saveSessionButton");
      const statusText = document.getElementById("statusText");

      const kaiCategory = document.getElementById("kaiCategory");
      const kaiMessage = document.getElementById("kaiMessage");
      const kaiReason = document.getElementById("kaiReason");
      const kaiNextStepText = document.getElementById("kaiNextStepText");
      const plannedWorkout = document.getElementById("plannedWorkout");
      const streakValue = document.getElementById("streakValue");
      const statusValue = document.getElementById("statusValue");
      const scoreValue = document.getElementById("scoreValue");
      const activityValue = document.getElementById("activityValue");

      const readinessPlanLabel = document.getElementById("readinessPlanLabel");
      const readinessSessionLabel = document.getElementById("readinessSessionLabel");
      const readinessHeadline = document.getElementById("readinessHeadline");
      const readinessPrimaryAction = document.getElementById("readinessPrimaryAction");
      const readinessFallbackNote = document.getElementById("readinessFallbackNote");
      const readinessAuditSummary = document.getElementById("readinessAuditSummary");
      const readinessAuditUserExplanation = document.getElementById("readinessAuditUserExplanation");
      const readinessAuditKaiExplanation = document.getElementById("readinessAuditKaiExplanation");
      const sessionPlanList = document.getElementById("sessionPlanList");
      const substitutionList = document.getElementById("substitutionList");
      const overworkedList = document.getElementById("overworkedList");
      const recoveringList = document.getElementById("recoveringList");
      const avoidMusclesList = document.getElementById("avoidMusclesList");
      const saferAlternativesList = document.getElementById("saferAlternativesList");
      const auditSelectedList = document.getElementById("auditSelectedList");
      const auditDeprioritizedList = document.getElementById("auditDeprioritizedList");
      const avoidExercisesList = document.getElementById("avoidExercisesList");
      const muscleLoadList = document.getElementById("muscleLoadList");
      const exerciseLibraryList = document.getElementById("exerciseLibraryList");
      const sessionBuilder = document.getElementById("sessionBuilder");

      dateInput.value = new Date().toISOString().slice(0, 10);

      saveProfileButton.addEventListener("click", saveProfile);
      seedPosteriorButton.addEventListener("click", () => seedScenario("posterior_chain_fatigued"));
      seedPushButton.addEventListener("click", () => seedScenario("upper_push_fatigued"));
      seedPainLimitedUpperButton.addEventListener("click", () =>
        seedScenario("thin_history_pain_limited_upper")
      );
      seedEquipmentLimitedUpperButton.addEventListener("click", () =>
        seedScenario("thin_history_equipment_limited_upper")
      );
      refreshButton.addEventListener("click", refreshAll);
      resetButton.addEventListener("click", resetWorkouts);
      addExerciseButton.addEventListener("click", addSessionExercise);
      saveSessionButton.addEventListener("click", saveWorkoutSession);
      exerciseSearchInput.addEventListener("input", renderExerciseLibrary);

      addSessionExercise();
      refreshAll();

      async function refreshAll() {
        setStatus("Refreshing app state...");
        await Promise.all([loadLibrary(), loadAppState()]);
        setStatus("App is up to date.");
      }

      async function saveProfile() {
        setStatus("Saving profile...");
        const response = await fetch("/users/" + encodeURIComponent(userIdInput.value) + "/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nameInput.value,
            goal: goalInput.value,
            experienceLevel: "beginner"
          })
        });
        const data = await response.json();
        setStatus(data.message || "Profile saved.");
        await refreshAll();
      }

      async function seedScenario(name) {
        setStatus("Seeding " + name + "...");
        const response = await fetch(
          "/users/" + encodeURIComponent(userIdInput.value) + "/test-scenarios/" + encodeURIComponent(name),
          { method: "POST" }
        );
        const data = await response.json();
        if (data.asOf) {
          dateInput.value = data.asOf;
        }
        setStatus(data.message || "Scenario seeded.");
        await refreshAll();
      }

      async function resetWorkouts() {
        setStatus("Clearing workouts...");
        await fetch("/users/" + encodeURIComponent(userIdInput.value) + "/workouts/reset", {
          method: "POST"
        });
        await fetch("/users/" + encodeURIComponent(userIdInput.value) + "/planned-workouts/reset", {
          method: "POST"
        });
        setStatus("Workout and planned workout data cleared.");
        await refreshAll();
      }

      async function loadLibrary() {
        const response = await fetch("/exercise-library");
        const data = await response.json();
        state.library = data.exercises || [];
        renderExerciseLibrary();
        renderSessionBuilder();
      }

      async function loadAppState() {
        const response = await fetch(
          "/users/" + encodeURIComponent(userIdInput.value) + "/app-state?asOf=" + encodeURIComponent(dateInput.value)
        );
        const data = await response.json();

        if (data.profile) {
          nameInput.value = data.profile.name;
          goalInput.value = data.profile.goal;
        }

        const kaiPayload = data.kaiPayload || {};
        kaiCategory.textContent = kaiPayload.kai?.category || "start";
        kaiMessage.textContent = kaiPayload.kai?.text || "No Kai message yet.";
        kaiReason.textContent = kaiPayload.kai?.reason || "";
        kaiNextStepText.textContent = kaiPayload.kai?.nextStep || "-";
        plannedWorkout.textContent = kaiPayload.plannedWorkoutForDay
          ? "Planned today: " + formatWorkoutLabel(kaiPayload.plannedWorkoutForDay)
          : "No planned workout for today.";
        streakValue.textContent = String(kaiPayload.signals?.currentStreak ?? 0);
        statusValue.textContent = kaiPayload.signals?.consistencyStatus || "-";
        scoreValue.textContent = String(kaiPayload.signals?.consistencyScore ?? 0);
        activityValue.textContent = kaiPayload.signals?.lastActivityAt || "-";

        const readiness = data.todayReadiness || {};
        const frontendCopy = readiness.frontendCopy || {};
        readinessPlanLabel.textContent = readiness.plannedWorkoutType
          ? "Planned workout type: " + readiness.plannedWorkoutType.replaceAll("_", " ")
          : "No planned workout type for today.";
        readinessSessionLabel.textContent = frontendCopy.sessionLabel || "Session";
        readinessSessionLabel.className = "chip " + getTierTone(readiness.sessionPlan?.sessionStyle, readiness.sessionPlan?.blocks || []);
        readinessHeadline.textContent = frontendCopy.readinessHeadline || readiness.sessionDecision?.summary || "Readiness updated.";
        readinessPrimaryAction.textContent = frontendCopy.primaryAction || "";
        readinessFallbackNote.textContent = frontendCopy.fallbackNote || "";
        renderDecisionAudit(readiness.decisionAudit || {});
        renderChipList(overworkedList, readiness.overworkedMuscles || [], "bad");
        renderChipList(recoveringList, readiness.recoveringMuscles || [], "caution");
        renderChipList(avoidMusclesList, readiness.muscleGroupsToAvoidToday || [], "bad");
        renderSessionPlan(readiness.sessionPlan?.blocks || []);
        renderSubstitutions(readiness.substitutionOptions || []);
        renderExerciseRecommendations(saferAlternativesList, readiness.saferAlternatives || [], "No safer alternatives yet.");
        renderExerciseRecommendations(avoidExercisesList, readiness.exercisesToAvoidToday || [], "No avoid list yet.");
        renderMuscleLoad(readiness.muscleLoadSummary || []);
      }

      function renderDecisionAudit(audit) {
        const summaryParts = [];
        if (audit.dayOrigin) {
          summaryParts.push("Origin: " + audit.dayOrigin.replaceAll("_", " "));
        }
        if (audit.debugExplanation?.confidenceContext) {
          summaryParts.push(audit.debugExplanation.confidenceContext);
        }
        if (audit.debugExplanation?.dayProvenance && !audit.dayOrigin) {
          summaryParts.push(audit.debugExplanation.dayProvenance);
        }

        readinessAuditSummary.textContent = summaryParts.join(" • ") || "No audit details yet.";
        readinessAuditUserExplanation.textContent = audit.userExplanation || "";
        readinessAuditKaiExplanation.textContent = audit.kaiExplanation
          ? "Kai view: " + audit.kaiExplanation
          : "";

        renderAuditExerciseList(
          auditSelectedList,
          audit.selectedSubstitutes || [],
          "No audit picks yet."
        );
        renderAuditExerciseList(
          auditDeprioritizedList,
          audit.deprioritizedExercises || [],
          "No near-miss options yet."
        );
      }

      function addSessionExercise() {
        state.sessionExercises.push({
          exerciseId: state.library[0]?.exerciseId || "",
          sets: 3,
          reps: 10,
          effort: "moderate"
        });
        renderSessionBuilder();
      }

      function removeSessionExercise(index) {
        state.sessionExercises.splice(index, 1);
        renderSessionBuilder();
      }

      function renderSessionBuilder() {
        sessionBuilder.innerHTML = "";
        if (!state.sessionExercises.length) {
          sessionBuilder.innerHTML = '<p class="empty">No exercises selected yet.</p>';
          return;
        }

        state.sessionExercises.forEach((entry, index) => {
          const row = document.createElement("div");
          row.className = "session-row";
          row.innerHTML =
            '<div class="field">' +
            '<label>Exercise</label>' +
            buildExerciseSelect(entry.exerciseId, index) +
            "</div>" +
            '<div class="field"><label>Sets</label><input type="number" min="1" value="' + entry.sets + '" data-kind="sets" data-index="' + index + '" /></div>' +
            '<div class="field"><label>Reps</label><input type="number" min="1" value="' + entry.reps + '" data-kind="reps" data-index="' + index + '" /></div>' +
            '<div class="field"><label>Effort</label>' +
            '<select data-kind="effort" data-index="' + index + '">' +
            buildEffortOption("easy", entry.effort) +
            buildEffortOption("moderate", entry.effort) +
            buildEffortOption("hard", entry.effort) +
            "</select></div>" +
            '<button type="button" class="secondary" data-kind="remove" data-index="' + index + '">Remove</button>';
          sessionBuilder.appendChild(row);
        });

        sessionBuilder.querySelectorAll("input, select, button").forEach((element) => {
          element.addEventListener("change", handleSessionFieldChange);
          element.addEventListener("click", handleSessionFieldChange);
        });
      }

      function handleSessionFieldChange(event) {
        const target = event.target;
        const index = Number(target.dataset.index);
        const kind = target.dataset.kind;
        if (kind === "remove") {
          removeSessionExercise(index);
          return;
        }
        if (!state.sessionExercises[index]) {
          return;
        }
        if (kind === "sets" || kind === "reps") {
          state.sessionExercises[index][kind] = Number(target.value);
          return;
        }
        state.sessionExercises[index][kind] = target.value;
      }

      async function saveWorkoutSession() {
        setStatus("Saving workout session...");
        const body = {
          id: "session_" + Date.now(),
          date: dateInput.value,
          type: workoutTypeInput.value,
          plannedDuration: Number(plannedDurationInput.value),
          completedDuration: Number(completedDurationInput.value),
          sessionExercises: state.sessionExercises.filter((entry) => entry.exerciseId)
        };

        const response = await fetch(
          "/users/" + encodeURIComponent(userIdInput.value) + "/workout-sessions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );
        const data = await response.json();
        setStatus(data.message || "Workout session saved.");
        await refreshAll();
      }

      function renderExerciseLibrary() {
        const query = exerciseSearchInput.value.trim().toLowerCase();
        exerciseLibraryList.innerHTML = "";
        const visibleExercises = state.library
          .filter((exercise) =>
            !query || exercise.name.toLowerCase().includes(query)
          )
          .slice(0, 18);

        if (!visibleExercises.length) {
          exerciseLibraryList.innerHTML = '<p class="empty">No exercises match that search.</p>';
          return;
        }

        for (const exercise of visibleExercises) {
          const item = document.createElement("div");
          item.className = "exercise-item";
          item.innerHTML =
            "<strong>" + exercise.name + "</strong>" +
            "<small>" +
            exercise.movementPattern.replaceAll("_", " ") +
            " • " +
            (exercise.primaryMuscles || []).join(", ").replaceAll("_", " ") +
            " • " +
            exercise.equipmentType +
            "</small>";
          exerciseLibraryList.appendChild(item);
        }
      }

      function renderChipList(container, values, tone) {
        container.innerHTML = "";
        if (!values.length) {
          container.innerHTML = '<p class="empty">None right now.</p>';
          return;
        }
        values.forEach((value) => {
          const chip = document.createElement("span");
          chip.className = "chip " + tone;
          chip.textContent = value.replaceAll("_", " ");
          container.appendChild(chip);
        });
      }

      function renderExerciseRecommendations(container, items, emptyText) {
        container.innerHTML = "";
        if (!items.length) {
          container.innerHTML = '<p class="empty">' + emptyText + "</p>";
          return;
        }
        items.slice(0, 6).forEach((item) => {
          const card = document.createElement("div");
          card.className = "exercise-item";
          card.innerHTML =
            "<strong>" + item.name + "</strong>" +
            "<small>" + (item.reasons || []).join(" • ") + "</small>";
          container.appendChild(card);
        });
      }

      function renderAuditExerciseList(container, items, emptyText) {
        container.innerHTML = "";
        if (!items.length) {
          container.innerHTML = '<p class="empty">' + emptyText + "</p>";
          return;
        }

        items.slice(0, 4).forEach((item) => {
          const card = document.createElement("div");
          card.className = "exercise-item";
          const provenance = formatAuditProvenance(item);
          card.innerHTML =
            "<strong>" + item.name + "</strong>" +
            "<small>" + (item.why || []).join(" • ") + "</small>" +
            (provenance ? "<small>" + provenance + "</small>" : "");
          container.appendChild(card);
        });
      }

      function renderSessionPlan(blocks) {
        sessionPlanList.innerHTML = "";
        const visibleBlocks = blocks.filter((block) => (block.exampleExercises || block.exampleExerciseIds || []).length);
        if (!visibleBlocks.length) {
          sessionPlanList.innerHTML = '<p class="empty">No session plan details yet.</p>';
          return;
        }

        visibleBlocks.forEach((block) => {
          const card = document.createElement("div");
          card.className = "session-item";
          const tierLabel = block.blockTier === "best" ? "Best option" : block.blockTier === "acceptable" ? "Acceptable fallback" : "Session block";
          const tone = block.blockTier === "best" ? "good" : block.blockTier === "acceptable" ? "caution" : "caution";
          const exampleNames = (block.exampleExercises && block.exampleExercises.length
            ? block.exampleExercises.map((example) => formatExerciseId(example.exerciseId))
            : (block.exampleExerciseIds || []).map(formatExerciseId)
          ).join(", ");

          card.innerHTML =
            '<div class="section-header">' +
            '<p class="section-title">' + formatSlotLabel(block.slot) + "</p>" +
            '<span class="chip ' + tone + '">' + tierLabel + "</span>" +
            "</div>" +
            "<strong>" + block.focus + "</strong>" +
            "<small>" + (exampleNames || "No example exercises yet.") + "</small>";
          sessionPlanList.appendChild(card);
        });
      }

      function renderSubstitutions(items) {
        substitutionList.innerHTML = "";
        if (!items.length) {
          substitutionList.innerHTML = '<p class="empty">No swaps suggested right now.</p>';
          return;
        }

        items.slice(0, 4).forEach((item) => {
          const copy = item.frontendCopy || {};
          const card = document.createElement("div");
          card.className = "session-item";
          card.innerHTML =
            "<strong>" + (copy.title || ("Swap " + item.name)) + "</strong>" +
            "<small>" + (copy.actionLabel || item.reason) + "</small>" +
            "<small>" + (copy.explanation || item.reason) + "</small>";
          substitutionList.appendChild(card);
        });
      }

      function renderMuscleLoad(items) {
        muscleLoadList.innerHTML = "";
        if (!items.length) {
          muscleLoadList.innerHTML = '<p class="empty">No muscle load yet.</p>';
          return;
        }
        items.slice(0, 8).forEach((item) => {
          const card = document.createElement("div");
          card.className = "load-item";
          card.innerHTML =
            "<strong>" + item.muscle.replaceAll("_", " ") + "</strong>" +
            "<small>" +
            "state: " + item.recoveryState +
            " • unresolved: " + item.unresolvedLoad +
            " • total: " + item.totalLoad +
            "</small>";
          muscleLoadList.appendChild(card);
        });
      }

      function buildExerciseSelect(selectedExerciseId, index) {
        const options = state.library
          .map((exercise) =>
            '<option value="' + exercise.exerciseId + '"' +
            (exercise.exerciseId === selectedExerciseId ? " selected" : "") +
            ">" + exercise.name + "</option>"
          )
          .join("");

        return '<select data-kind="exerciseId" data-index="' + index + '">' + options + "</select>";
      }

      function buildEffortOption(value, selectedValue) {
        return '<option value="' + value + '"' + (value === selectedValue ? " selected" : "") + ">" + value + "</option>";
      }

      function formatWorkoutLabel(workout) {
        return workout.type.replaceAll("_", " ") + " on " + workout.date;
      }

      function formatSlotLabel(slot) {
        if (slot === "main") {
          return "Main";
        }
        if (slot === "secondary") {
          return "Secondary";
        }
        return "Accessory";
      }

      function formatExerciseId(exerciseId) {
        const exercise = state.library.find((item) => item.exerciseId === exerciseId);
        return exercise ? exercise.name : exerciseId.replaceAll("_", " ");
      }

      function getTierTone(sessionStyle, blocks) {
        if (sessionStyle === "accessory_only") {
          return "caution";
        }

        if (sessionStyle === "conservative") {
          return "caution";
        }

        if ((blocks || []).some((block) => block.blockTier === "best")) {
          return "good";
        }

        return "caution";
      }

      function formatAuditProvenance(item) {
        const parts = [];
        if (item.selectionTier) {
          parts.push("tier: " + item.selectionTier.replaceAll("_", " "));
        }
        if (item.provenance?.selectionSource) {
          parts.push("source: " + item.provenance.selectionSource.replaceAll("_", " "));
        }
        if (item.provenance?.templateFitApplied) {
          parts.push("template fit");
        }
        if (item.provenance?.recoveryPenaltyApplied) {
          parts.push("recovery adjusted");
        }
        if (item.provenance?.equipmentConstraintApplied) {
          parts.push("equipment limited");
        }
        if (item.provenance?.painConstraintApplied) {
          parts.push("pain limited");
        }
        if (item.provenance?.memoryNudgeApplied) {
          parts.push("memory nudged");
        }

        return parts.join(" • ");
      }

      function setStatus(text) {
        statusText.textContent = text;
      }
    </script>
  </body>
</html>`;
}
