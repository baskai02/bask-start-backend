import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
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
import { seedScenario } from "./dev/scenarios.js";
import { createAppStore, type AppStore } from "./store/app-store.js";
import { generateKaiAgentResponse } from "./kai/agent-client.js";
import { buildFrontendTrainingReadinessResponse } from "./exercises/frontend-response.js";
import { getExerciseLibrary } from "./exercises/library.js";
import { buildTrainingReadinessReport } from "./exercises/readiness.js";
import type {
  FrontendTrainingReadinessResponse
} from "./exercises/types.js";
import {
  KAI_SYSTEM_PROMPT,
  KAI_USER_PROMPT_TEMPLATE
} from "./kai/agent-prompt.js";
import { createKaiService } from "./kai/service.js";
import type {
  KaiPayload,
  KaiUserProfile,
  PlannedWorkoutInput,
  WorkoutCompletionInput,
  WorkoutMissedInput
} from "./kai/types.js";
import { createMemoryStore } from "./store/memory-store.js";
import { createPlannedWorkoutStore } from "./store/planned-workout-store.js";
import { createProfileStore } from "./store/profile-store.js";
import { renderHomePage } from "./ui/home-page.js";

const PORT = 3000;
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
const store = createAppStore({ storageFilePath });
const profileStore = createProfileStore({ storageFilePath: profileStorageFilePath });
const memoryStore = createMemoryStore({ storageFilePath: memoryStorageFilePath });
const plannedWorkoutStore = createPlannedWorkoutStore({
  storageFilePath: plannedWorkoutStorageFilePath
});
const corsAllowedOrigins = parseCorsAllowedOrigins(process.env.CORS_ALLOW_ORIGINS);
const kaiService = createKaiService({
  store,
  profileStore,
  memoryStore,
  plannedWorkoutStore
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
      sendJson(response, 200, { ok: true }, request);
      return;
    }

    if (request.method === "GET" && url.pathname === "/exercise-library") {
      sendJson(response, 200, {
        exercises: getExerciseLibrary()
      }, request);
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
      const profile = kaiService.getProfile(userId);
      const memory = kaiService.getFreshMemory(userId, todayAsDateString(), profile);

      sendJson(response, 200, {
        ...buildResetWriteResponse(userId, todayAsDateString(), profile, memory)
      }, request);
      return;
    }

    if (request.method === "POST" && url.pathname === "/profiles") {
      const body = await readJsonBody(request);
      const profile = profileStore.saveProfile(parseProfileInput(body));
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
          profile
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

      if (parts.length === 3 && parts[2] === "training-readiness") {
        const userId = parts[1];
        const asOf = parseAsOfDate(
          url.searchParams.get("asOf"),
          todayAsDateString()
        );
        const plannedWorkoutForDay = plannedWorkoutStore.findPlannedWorkout(
          userId,
          asOf
        );

        sendJson(
          response,
          200,
          buildTrainingReadinessReport(
            userId,
            store.getWorkouts(userId),
            asOf,
            plannedWorkoutForDay?.type
          ),
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
          | "upper_push_fatigued"
          | "posterior_chain_fatigued"
          | "push_day_fatigued"
          | "pull_day_fatigued"
          | "quad_dominant_fatigued";
        const seeded = seedScenario({
          userId,
          scenario,
          store,
          profileStore,
          plannedWorkoutStore
        });

        sendJson(response, 200, {
          message: "Scenario seeded.",
          userId,
          scenario: seeded.scenario,
          asOf: seeded.asOf,
          kaiPayload: kaiService.getKaiPayload(userId, seeded.asOf),
          kaiWeeklyPayload: kaiService.getKaiWeeklyPayload(userId, seeded.asOf),
          trainingReadiness: buildTrainingReadinessReport(
            userId,
            store.getWorkouts(userId),
            seeded.asOf,
            plannedWorkoutStore.findPlannedWorkout(userId, seeded.asOf)?.type
          )
        }, request);
        return;
      }

      if (parts.length === 3 && parts[2] === "profile") {
        const userId = parts[1];
        const body = await readJsonBody(request);
        const profile = parseProfileInput(body, userId);

        const savedProfile = profileStore.saveProfile(profile);
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

server.listen(PORT, () => {
  console.log(`Kai server running at http://localhost:${PORT}`);
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
    kaiPayload: buildKaiPayload(userId, asOf, profile, memory)
  };
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
  const plannedWorkoutForDay = plannedWorkoutStore.findPlannedWorkout(userId, asOf);
  const trainingReadiness = buildTrainingReadinessReport(
    userId,
    store.getWorkouts(userId),
    asOf,
    plannedWorkoutForDay?.type
  );

  return buildFrontendTrainingReadinessResponse(userId, asOf, trainingReadiness);
}
