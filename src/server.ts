import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseAsOfDate,
  parsePlannedWorkoutInput,
  parseProfileInput,
  parseUserIdBody,
  parseWorkoutCompletionInput,
  parseWorkoutMissedInput,
  ValidationError
} from "./api/validation.js";
import { buildFrontendAppStateResponse } from "./api/frontend-app-state.js";
import { seedScenario } from "./dev/scenarios.js";
import type { AppStore } from "./store/app-store.js";
import { generateKaiAgentResponse } from "./kai/agent-client.js";
import { getExerciseLibrary } from "./exercises/library.js";
import type {
  FrontendTrainingReadinessResponse
} from "./exercises/types.js";
import {
  KAI_SYSTEM_PROMPT,
  KAI_USER_PROMPT_TEMPLATE
} from "./kai/agent-prompt.js";
import { toPlannedWorkouts } from "./kai/planner.js";
import {
  buildResolvedTrainingReadinessReport,
  createKaiService
} from "./kai/service.js";
import type {
  KaiPayload,
  KaiUserProfile,
  PlannedWorkoutInput,
  WorkoutCompletionInput,
  WorkoutMissedInput
} from "./kai/types.js";
import {
  createDatabaseRepositories,
  createFileDatabaseAdapter
} from "./store/database-repositories.js";
import {
  createJsonRepositories,
  type BaskRepositories
} from "./store/repositories.js";
import { createPostgresRepositories } from "./store/postgres-repositories.js";
import { renderHomePage } from "./ui/home-page.js";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const storageFilePath = fileURLToPath(new URL("../data/workouts.json", import.meta.url));
const profileStorageFilePath = fileURLToPath(
  new URL("../data/profiles.json", import.meta.url)
);
const memoryStorageFilePath = fileURLToPath(
  new URL("../data/kai-memory.json", import.meta.url)
);
const plannedWorkoutStorageFilePath = fileURLToPath(
  new URL("../data/planned-workouts.json", import.meta.url)
);
const readinessHistoryStorageFilePath = fileURLToPath(
  new URL("../data/readiness-history.json", import.meta.url)
);
const weeklyChapterHistoryStorageFilePath = fileURLToPath(
  new URL("../data/weekly-chapter-history.json", import.meta.url)
);
const databaseStateFilePath = fileURLToPath(
  new URL("../data/backend-state.json", import.meta.url)
);
const buildInfoFilePath = fileURLToPath(new URL("./build-info.json", import.meta.url));
const repositoryBackendMode = normalizeBackendMode(
  process.env.BASK_REPOSITORY_BACKEND
);
const serverStartedAt = new Date().toISOString();
const buildInfo = loadBuildInfo(buildInfoFilePath);
const repositories = await createServerRepositories(repositoryBackendMode);
const store = repositories.workouts;
const profileStore = repositories.profiles;
const memoryStore = repositories.memory;
const plannedWorkoutStore = repositories.plannedWorkouts;
const readinessHistoryStore = repositories.readinessHistory;
const weeklyChapterHistoryStore = repositories.weeklyChapterHistory;
const corsAllowedOrigins = parseCorsAllowedOrigins(process.env.CORS_ALLOW_ORIGINS);
const kaiService = createKaiService({
  repositories
});

const server = createServer(async (request, response) => {
  try {
    if (!request.url || !request.method) {
      sendJson(response, 400, { error: "Invalid request." }, request);
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "OPTIONS") {
      sendEmpty(response, 204, request);
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      sendHtml(response, 200, renderHomePage(), request);
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(
        response,
        200,
        {
          ok: true,
          serverStartedAt,
          repositoryBackendMode,
          build: buildInfo
        },
        request
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/exercise-library") {
      sendJson(response, 200, {
        exercises: getExerciseLibrary()
      }, request);
      return;
    }

    if (request.method === "GET" && url.pathname === "/profile-options") {
      sendJson(response, 200, buildProfileOptionsResponse(), request);
      return;
    }

    if (request.method === "POST" && url.pathname === "/workouts/completed") {
      const body = await readJsonBody(request);
      const parsedBody = parseWorkoutCompletionInput(body);
      const input: WorkoutCompletionInput = {
        ...parsedBody,
        recordedAt: parsedBody.recordedAt ?? new Date().toISOString()
      };
      const workouts = store.recordCompletedWorkout(input);
      const signals = store.getBehaviorSignals(input.userId, input.date);
      const profile = kaiService.getProfile(input.userId);
      const memory = kaiService.getFreshMemory(input.userId, input.date, profile);
      const matchedPlannedWorkout = plannedWorkoutStore.findPlannedWorkout(
        input.userId,
        input.date,
        input.type
      );

      sendJson(response, 200, {
        ...buildWorkoutWriteResponse({
          actionMessage: "Completed workout recorded.",
          userId: input.userId,
          asOf: input.date,
          workouts,
          profile,
          memory,
          matchedPlannedWorkout
        })
      }, request);
      return;
    }

    if (request.method === "POST" && url.pathname === "/workouts/missed") {
      const body = await readJsonBody(request);
      const parsedBody = parseWorkoutMissedInput(body);
      const input: WorkoutMissedInput = {
        ...parsedBody,
        recordedAt: parsedBody.recordedAt ?? new Date().toISOString()
      };
      const workouts = store.recordMissedWorkout(input);
      const signals = store.getBehaviorSignals(input.userId, input.date);
      const profile = kaiService.getProfile(input.userId);
      const memory = kaiService.getFreshMemory(input.userId, input.date, profile);
      const matchedPlannedWorkout = plannedWorkoutStore.findPlannedWorkout(
        input.userId,
        input.date,
        input.type
      );

      sendJson(response, 200, {
        ...buildWorkoutWriteResponse({
          actionMessage: "Missed workout recorded.",
          userId: input.userId,
          asOf: input.date,
          workouts,
          profile,
          memory,
          matchedPlannedWorkout
        })
      }, request);
      return;
    }

    if (request.method === "POST" && url.pathname === "/workouts/reset") {
      const body = await readJsonBody(request);
      const { userId } = parseUserIdBody(body);

      store.clearWorkouts(userId);
      readinessHistoryStore.clearReadinessHistory(userId);
      weeklyChapterHistoryStore.clearWeeklyChapterHistory(userId);
      const profile = kaiService.getProfile(userId);
      const memory = kaiService.getFreshMemory(userId, todayAsDateString(), profile);

      sendJson(response, 200, {
        ...buildResetWriteResponse(userId, todayAsDateString(), profile, memory)
      }, request);
      return;
    }

    if (request.method === "POST" && url.pathname === "/profiles") {
      const body = await readJsonBody(request);
      const profile = profileStore.saveProfileSnapshot(parseProfileInput(body));
      const memory = kaiService.getFreshMemory(
        profile.userId,
        todayAsDateString(),
        profile
      );

      sendJson(response, 200, {
        ...buildProfileWriteResponse(
          profile.userId,
          todayAsDateString(),
          profile,
          memory
        )
      }, request);
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/users/")) {
      const parts = url.pathname.split("/").filter(Boolean);

      if (parts.length === 3 && parts[2] === "workouts") {
        const userId = parts[1];
        const workouts = store.getWorkouts(userId);

        sendJson(response, 200, {
          userId,
          workouts
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "planned-workouts") {
        const userId = parts[1];
        const plannedWorkouts = plannedWorkoutStore.getPlannedWorkouts(userId);

        sendJson(response, 200, {
          userId,
          plannedWorkouts
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "readiness-history") {
        const userId = parts[1];

        sendJson(response, 200, {
          userId,
          readinessHistory: readinessHistoryStore.getReadinessHistory(userId)
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "weekly-chapter-history") {
        const userId = parts[1];

        sendJson(response, 200, {
          userId,
          weeklyChapterHistory:
            weeklyChapterHistoryStore.getWeeklyChapterHistory(userId)
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "signals") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const signals = store.getBehaviorSignals(userId, asOf);

        sendJson(response, 200, {
          userId,
          asOf,
          signals
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "profile") {
        const userId = parts[1];
        const profile = kaiService.getProfile(userId);

        sendJson(response, 200, {
          userId,
          profile,
          onboardingOptions: buildProfileOptionsResponse()
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "memory") {
        const userId = parts[1];
        const profile = kaiService.getProfile(userId);
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const memory = kaiService.getFreshMemory(userId, asOf, profile);

        sendJson(response, 200, {
          userId,
          asOf,
          memory
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "kai") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        sendJson(response, 200, kaiService.getKaiPayload(userId, asOf), request);
        return;
      }

      if (parts.length === 3 && parts[2] === "kai-weekly") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        sendJson(response, 200, kaiService.getKaiWeeklyPayload(userId, asOf), request);
        return;
      }

      if (parts.length === 3 && parts[2] === "weekly-plan") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );

        sendJson(response, 200, kaiService.getKaiWeeklyPlan(userId, asOf), request);
        return;
      }

      if (parts.length === 3 && parts[2] === "training-readiness") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const profile = profileStore.getProfile(userId);
        const weeklyPlan = kaiService.getKaiWeeklyPlan(userId, asOf, profile);

        sendJson(
          response,
          200,
          buildResolvedTrainingReadinessReport({
            repositories,
            userId,
            asOf,
            profile,
            weeklyPlan,
            memory: memoryStore.getMemory(userId)
          }),
          request
        );
        return;
      }

      if (parts.length === 3 && parts[2] === "today-readiness") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );

        sendJson(response, 200, buildFrontendReadinessResponse(userId, asOf), request);
        return;
      }

      if (parts.length === 3 && parts[2] === "app-state") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );

        sendJson(
          response,
          200,
          buildFrontendAppStateResponse({
            repositories,
            kaiService,
            userId,
            asOf
          }),
          request
        );
        return;
      }

      if (parts.length === 3 && parts[2] === "kai-message") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const kaiPayload = kaiService.getKaiPayload(userId, asOf);

        sendJson(response, 200, {
          ...kaiPayload,
          kaiMessage: kaiPayload.kai
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "kai-agent-input") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const context = kaiService.getAgentContext(userId, asOf);

        sendJson(response, 200, {
          userId,
          asOf,
          systemPrompt: KAI_SYSTEM_PROMPT,
          userPrompt: KAI_USER_PROMPT_TEMPLATE,
          context
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "kai-agent-response") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const context = kaiService.getAgentContext(userId, asOf);
        const agentResponse = await generateKaiAgentResponse(context);

        sendJson(response, 200, {
          userId,
          asOf,
          context,
          agentResponse
        }, request);
        return;
      }
    }

    if (request.method === "POST" && url.pathname.startsWith("/users/")) {
      const parts = url.pathname.split("/").filter(Boolean);

      if (parts.length === 4 && parts[2] === "test-scenarios") {
        const userId = parts[1];
        const scenario = parts[3] as
          | "planned_today"
          | "mixed_week"
          | "momentum_week"
          | "missed_plan_reset"
          | "suggested_upper_pull_bias"
          | "thin_history_pain_limited_upper"
          | "thin_history_equipment_limited_upper"
          | "upper_push_fatigued"
          | "posterior_chain_fatigued"
          | "push_day_fatigued"
          | "pull_day_fatigued"
          | "quad_dominant_fatigued";
        const seeded = seedScenario({
          userId,
          scenario,
          repositories
        });
        const profile = kaiService.getProfile(userId);
        const weeklyPlan = kaiService.getKaiWeeklyPlan(userId, seeded.asOf, profile);

        sendJson(response, 200, {
          message: "Scenario seeded.",
          userId,
          scenario: seeded.scenario,
          asOf: seeded.asOf,
          kaiPayload: kaiService.getKaiPayload(userId, seeded.asOf),
          kaiWeeklyPayload: kaiService.getKaiWeeklyPayload(userId, seeded.asOf),
          trainingReadiness: buildResolvedTrainingReadinessReport({
            repositories,
            userId,
            asOf: seeded.asOf,
            profile,
            weeklyPlan,
            memory: memoryStore.getMemory(userId)
          })
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "profile") {
        const userId = parts[1];
        const body = await readJsonBody(request);
        const profile = parseProfileInput(body, userId);

        const savedProfile = profileStore.saveProfileSnapshot(profile);
        const memory = kaiService.getFreshMemory(
          userId,
          todayAsDateString(),
          savedProfile
        );

        sendJson(response, 200, {
          ...buildProfileWriteResponse(
            userId,
            todayAsDateString(),
            savedProfile,
            memory
          )
        }, request);
        return;
      }

      if (
        parts.length === 4 &&
        parts[2] === "workouts" &&
        parts[3] === "completed"
      ) {
        const userId = parts[1];
        const body = await readJsonBody(request);
        const parsedBody = parseWorkoutCompletionInput(body, userId);
        const input: WorkoutCompletionInput = {
          ...parsedBody,
          userId,
          recordedAt: parsedBody.recordedAt ?? new Date().toISOString()
        };
        const workouts = store.recordCompletedWorkout(input);
        const profile = kaiService.getProfile(userId);
        const memory = kaiService.getFreshMemory(userId, input.date, profile);
        const matchedPlannedWorkout = plannedWorkoutStore.findPlannedWorkout(
          userId,
          input.date,
          input.type
        );

        sendJson(response, 200, {
          ...buildWorkoutWriteResponse({
            actionMessage: "Completed workout recorded.",
            userId,
            asOf: input.date,
            workouts,
            profile,
            memory,
            matchedPlannedWorkout
          })
        }, request);
        return;
      }

      if (
        parts.length === 3 &&
        parts[2] === "workout-sessions"
      ) {
        const userId = parts[1];
        const body = await readJsonBody(request);
        const parsedBody = parseWorkoutCompletionInput(body, userId);
        const input: WorkoutCompletionInput = {
          ...parsedBody,
          userId,
          recordedAt: parsedBody.recordedAt ?? new Date().toISOString()
        };
        const workouts = store.recordCompletedWorkout(input);
        const profile = kaiService.getProfile(userId);
        const memory = kaiService.getFreshMemory(userId, input.date, profile);
        const matchedPlannedWorkout = plannedWorkoutStore.findPlannedWorkout(
          userId,
          input.date,
          input.type
        );

        sendJson(response, 200, {
          message: "Workout session saved.",
          userId,
          asOf: input.date,
          session: workouts[workouts.length - 1],
          matchedPlannedWorkout,
          matchedPlanned: Boolean(matchedPlannedWorkout),
          trainingReadiness: buildFrontendReadinessResponse(userId, input.date),
          kaiPayload: buildKaiPayload(userId, input.date, profile, memory)
        }, request);
        return;
      }

      if (parts.length === 4 && parts[2] === "workouts" && parts[3] === "missed") {
        const userId = parts[1];
        const body = await readJsonBody(request);
        const parsedBody = parseWorkoutMissedInput(body, userId);
        const input: WorkoutMissedInput = {
          ...parsedBody,
          userId,
          recordedAt: parsedBody.recordedAt ?? new Date().toISOString()
        };
        const workouts = store.recordMissedWorkout(input);
        const profile = kaiService.getProfile(userId);
        const memory = kaiService.getFreshMemory(userId, input.date, profile);
        const matchedPlannedWorkout = plannedWorkoutStore.findPlannedWorkout(
          userId,
          input.date,
          input.type
        );

        sendJson(response, 200, {
          ...buildWorkoutWriteResponse({
            actionMessage: "Missed workout recorded.",
            userId,
            asOf: input.date,
            workouts,
            profile,
            memory,
            matchedPlannedWorkout
          })
        }, request);
        return;
      }

      if (parts.length === 4 && parts[2] === "workouts" && parts[3] === "reset") {
        const userId = parts[1];
        store.clearWorkouts(userId);
        const profile = kaiService.getProfile(userId);
        const memory = kaiService.getFreshMemory(userId, todayAsDateString(), profile);

        sendJson(response, 200, {
          ...buildResetWriteResponse(userId, todayAsDateString(), profile, memory)
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "planned-workouts") {
        const userId = parts[1];
        const body = await readJsonBody(request);
        const input: PlannedWorkoutInput = parsePlannedWorkoutInput(body, userId);
        const plannedWorkouts = plannedWorkoutStore.savePlannedWorkout(input);

        sendJson(response, 200, {
          message: "Planned workout saved.",
          userId,
          plannedWorkout: input,
          plannedWorkouts
        }, request);
        return;
      }

      if (
        parts.length === 4 &&
        parts[2] === "weekly-plan" &&
        parts[3] === "generate"
      ) {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const plan = kaiService.getKaiWeeklyPlan(userId, asOf);
        const generatedPlannedWorkouts = toPlannedWorkouts(plan, {
          replan: {
            source: "weekly_plan_generation",
            appliedAt: new Date().toISOString(),
            reason: "Generated from the current weekly plan."
          }
        });
        const plannedWorkouts = plannedWorkoutStore.replacePlannedWorkoutsInRange(
          userId,
          plan.weekStart,
          plan.weekEnd,
          generatedPlannedWorkouts
        );

        sendJson(response, 200, {
          message: "Weekly plan generated.",
          userId,
          asOf,
          weeklyPlan: plan,
          plannedWorkouts
        }, request);
        return;
      }

      if (
        parts.length === 4 &&
        parts[2] === "weekly-plan" &&
        parts[3] === "replan"
      ) {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const replanned = kaiService.persistCurrentWeekReplan(userId, asOf);

        sendJson(response, 200, {
          message: "Current week replanned.",
          userId,
          asOf,
          weeklyPlan: replanned.weeklyPlan,
          plannedWorkouts: replanned.plannedWorkouts
        }, request);
        return;
      }

      if (
        parts.length === 4 &&
        parts[2] === "planned-workouts" &&
        parts[3] === "reset"
      ) {
        const userId = parts[1];
        plannedWorkoutStore.clearPlannedWorkouts(userId);

        sendJson(response, 200, {
          message: "Planned workouts cleared.",
          userId,
          plannedWorkouts: plannedWorkoutStore.getPlannedWorkouts(userId)
        }, request);
        return;
      }
    }

    sendJson(response, 404, { error: "Route not found." }, request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong in the server.";
    const statusCode =
      error instanceof ValidationError ? error.statusCode : 400;
    sendJson(response, statusCode, { error: message }, request);
  }
});

function createServerRepositories(
  backendMode: "json_files" | "database_adapter" | "postgres"
): Promise<BaskRepositories> {
  if (backendMode === "postgres") {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required when BASK_REPOSITORY_BACKEND=postgres."
      );
    }

    return createPostgresRepositories({
      connectionString,
      tableName: process.env.BASK_POSTGRES_STATE_TABLE,
      stateKey: process.env.BASK_POSTGRES_STATE_KEY,
      ssl: process.env.BASK_POSTGRES_SSL === "false" ? false : true
    });
  }

  if (backendMode === "database_adapter") {
    return Promise.resolve(createDatabaseRepositories({
      adapter: createFileDatabaseAdapter({
        stateFilePath: process.env.BASK_DATABASE_STATE_FILE ?? databaseStateFilePath
      })
    }));
  }

  return Promise.resolve(createJsonRepositories({
    workoutsStorageFilePath: storageFilePath,
    profilesStorageFilePath: profileStorageFilePath,
    memoryStorageFilePath: memoryStorageFilePath,
    plannedWorkoutsStorageFilePath: plannedWorkoutStorageFilePath,
    readinessHistoryStorageFilePath,
    weeklyChapterHistoryStorageFilePath
  }));
}

function normalizeBackendMode(
  value: string | undefined
): "json_files" | "database_adapter" | "postgres" {
  const normalized = (value ?? "json_files").trim().toLowerCase();

  if (!normalized || normalized === "json" || normalized === "json_files") {
    return "json_files";
  }

  if (
    normalized === "database" ||
    normalized === "database_adapter" ||
    normalized === "db"
  ) {
    return "database_adapter";
  }

  if (
    normalized === "postgres" ||
    normalized === "postgresql" ||
    normalized === "pg"
  ) {
    return "postgres";
  }

  throw new Error(
    `Unsupported BASK_REPOSITORY_BACKEND "${value}". Use "json_files", "database_adapter", or "postgres".`
  );
}

function loadBuildInfo(filePath: string): {
  name?: string;
  version?: string;
  builtAt?: string;
} | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

server.listen(PORT, () => {
  console.log(`Kai server running at http://localhost:${PORT}`);
  console.log(`Repository backend mode: ${repositoryBackendMode}`);
  if (buildInfo?.builtAt) {
    console.log(`Build timestamp: ${buildInfo.builtAt}`);
  }
  if (repositoryBackendMode === "database_adapter") {
    console.log(
      `Backend state file: ${process.env.BASK_DATABASE_STATE_FILE ?? databaseStateFilePath}`
    );
    return;
  }

  if (repositoryBackendMode === "postgres") {
    console.log(
      `Postgres state table: ${process.env.BASK_POSTGRES_STATE_TABLE ?? "bask_state_snapshots"}`
    );
    console.log(
      `Postgres state key: ${process.env.BASK_POSTGRES_STATE_KEY ?? "default"}`
    );
    return;
  }

  console.log(`Workout data file: ${storageFilePath}`);
  console.log(`Profile data file: ${profileStorageFilePath}`);
  console.log(`Kai memory file: ${memoryStorageFilePath}`);
  console.log(`Planned workouts file: ${plannedWorkoutStorageFilePath}`);
});

function sendJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  data: unknown,
  request?: IncomingMessage
): void {
  response.writeHead(statusCode, {
    ...buildCorsHeaders(request),
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(data, null, 2));
}

function sendHtml(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  html: string,
  request?: IncomingMessage
): void {
  response.writeHead(statusCode, {
    ...buildCorsHeaders(request),
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function sendEmpty(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  request?: IncomingMessage
): void {
  response.writeHead(statusCode, buildCorsHeaders(request));
  response.end();
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(rawBody);
}

function todayAsDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseCorsAllowedOrigins(
  rawValue: string | undefined
): string[] | "*" {
  if (!rawValue || rawValue.trim() === "*") {
    return "*";
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildCorsHeaders(
  request?: IncomingMessage
): Record<string, string> {
  const requestOrigin = request?.headers.origin;
  const allowOrigin =
    corsAllowedOrigins === "*"
      ? "*"
      : requestOrigin && corsAllowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : corsAllowedOrigins[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function buildKaiPayload(
  userId: string,
  asOf: string,
  profile = kaiService.getProfile(userId),
  _memory?: ReturnType<typeof memoryStore.getMemory>
): KaiPayload {
  return kaiService.getKaiPayload(userId, asOf, profile);
}

function buildWorkoutWriteResponse(input: {
  actionMessage: string;
  userId: string;
  asOf: string;
  workouts: ReturnType<AppStore["getWorkouts"]>;
  profile?: KaiUserProfile;
  memory: ReturnType<typeof memoryStore.getMemory>;
  matchedPlannedWorkout?: ReturnType<typeof plannedWorkoutStore.findPlannedWorkout>;
}) {
  return {
    message: input.actionMessage,
    userId: input.userId,
    asOf: input.asOf,
    workout: input.workouts[input.workouts.length - 1],
    workouts: input.workouts,
    matchedPlannedWorkout: input.matchedPlannedWorkout,
    matchedPlanned: Boolean(input.matchedPlannedWorkout),
    kaiPayload: buildKaiPayload(input.userId, input.asOf, input.profile, input.memory)
  };
}

function buildProfileWriteResponse(
  userId: string,
  asOf: string,
  profile: KaiUserProfile,
  memory: ReturnType<typeof memoryStore.getMemory>
) {
  return {
    message: "Profile saved.",
    userId,
    asOf,
    profile,
    onboardingOptions: buildProfileOptionsResponse(),
    kaiPayload: buildKaiPayload(userId, asOf, profile, memory)
  };
}

function buildProfileOptionsResponse() {
  return {
    version: 1,
    fields: [
      {
        key: "goal",
        label: "Goal",
        required: false,
        type: "single_select",
        options: [
          { value: "build_consistency", label: "Build consistency" },
          { value: "build_muscle", label: "Build muscle" },
          { value: "get_fitter", label: "Get fitter" },
          { value: "lose_weight", label: "Lose weight" }
        ]
      },
      {
        key: "experienceLevel",
        label: "Experience level",
        required: false,
        type: "single_select",
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" }
        ]
      },
      {
        key: "trainingStylePreference",
        label: "Preferred training style",
        required: false,
        type: "single_select",
        options: [
          { value: "balanced", label: "Balanced" },
          { value: "full_body", label: "Full body" },
          { value: "split_routine", label: "Split routine" }
        ]
      },
      {
        key: "confidenceLevel",
        label: "Training confidence",
        required: false,
        type: "single_select",
        options: [
          { value: "low", label: "Low" },
          { value: "building", label: "Building" },
          { value: "high", label: "High" }
        ]
      },
      {
        key: "targetSessionsPerWeek",
        label: "Target sessions per week",
        required: false,
        type: "number",
        min: 1,
        max: 7
      },
      {
        key: "preferredSessionLength",
        label: "Preferred session length (minutes)",
        required: false,
        type: "number",
        min: 15,
        max: 180
      },
      {
        key: "preferredWorkoutDays",
        label: "Preferred workout days",
        required: false,
        type: "multi_select",
        options: [
          { value: "monday", label: "Monday" },
          { value: "tuesday", label: "Tuesday" },
          { value: "wednesday", label: "Wednesday" },
          { value: "thursday", label: "Thursday" },
          { value: "friday", label: "Friday" },
          { value: "saturday", label: "Saturday" },
          { value: "sunday", label: "Sunday" }
        ]
      },
      {
        key: "equipmentAccess",
        label: "Equipment access",
        required: false,
        type: "single_select",
        options: [
          { value: "full_gym", label: "Full gym" },
          { value: "mixed", label: "Mixed" },
          { value: "dumbbells_only", label: "Dumbbells only" },
          { value: "machines_only", label: "Machines only" },
          { value: "bodyweight_only", label: "Bodyweight only" }
        ]
      },
      {
        key: "tonePreference",
        label: "Coaching tone",
        required: false,
        type: "single_select",
        options: [
          { value: "supportive", label: "Supportive" },
          { value: "balanced", label: "Balanced" },
          { value: "direct", label: "Direct" }
        ]
      },
      {
        key: "focusMuscles",
        label: "Focus muscles",
        required: false,
        type: "multi_select",
        options: muscleGroupOptions()
      },
      {
        key: "painFlags",
        label: "Pain or sensitive areas",
        required: false,
        type: "multi_select",
        options: muscleGroupOptions()
      },
      {
        key: "favoriteExerciseIds",
        label: "Favorite exercises",
        required: false,
        type: "multi_select",
        source: "exercise-library"
      },
      {
        key: "dislikedExerciseIds",
        label: "Disliked exercises",
        required: false,
        type: "multi_select",
        source: "exercise-library"
      },
      {
        key: "constraints",
        label: "Constraints",
        required: false,
        type: "string_array",
        examples: ["short_on_time", "traveling", "low_energy_after_work"]
      }
    ]
  };
}

function muscleGroupOptions() {
  return [
    "chest",
    "front_delts",
    "side_delts",
    "rear_delts",
    "triceps",
    "biceps",
    "lats",
    "upper_traps",
    "mid_traps",
    "rhomboids",
    "quads",
    "glutes",
    "hamstrings",
    "calves",
    "core",
    "upper_back"
  ].map((value) => ({
    value,
    label: value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase())
  }));
}

function buildResetWriteResponse(
  userId: string,
  asOf: string,
  profile = profileStore.getProfile(userId),
  memory = kaiService.getFreshMemory(userId, asOf, profile)
) {
  return {
    message: "Workout history cleared.",
    userId,
    asOf,
    workout: undefined,
    workouts: store.getWorkouts(userId),
    kaiPayload: buildKaiPayload(userId, asOf, profile, memory)
  };
}

function buildFrontendReadinessResponse(
  userId: string,
  asOf: string
): FrontendTrainingReadinessResponse {
  return buildFrontendAppStateResponse({
    repositories,
    userId,
    asOf,
    kaiService
  }).todayReadiness;
}
