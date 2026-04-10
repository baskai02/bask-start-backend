import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createDatabaseRepositories,
  createFileDatabaseAdapter
} from "../store/database-repositories.js";
import {
  createJsonRepositories,
  type BaskRepositories
} from "../store/repositories.js";
import { createPostgresRepositories } from "../store/postgres-repositories.js";
import {
  migrationBundleToSnapshot,
  snapshotToMigrationBundle,
  userMigrationBundleToSnapshot,
  userSnapshotToMigrationBundle
} from "../store/migration.js";
import { saveJsonFile } from "../store/storage.js";

const workoutsStorageFilePath = fileURLToPath(
  new URL("../../data/workouts.json", import.meta.url)
);
const profilesStorageFilePath = fileURLToPath(
  new URL("../../data/profiles.json", import.meta.url)
);
const memoryStorageFilePath = fileURLToPath(
  new URL("../../data/kai-memory.json", import.meta.url)
);
const plannedWorkoutsStorageFilePath = fileURLToPath(
  new URL("../../data/planned-workouts.json", import.meta.url)
);
const readinessHistoryStorageFilePath = fileURLToPath(
  new URL("../../data/readiness-history.json", import.meta.url)
);
const weeklyChapterHistoryStorageFilePath = fileURLToPath(
  new URL("../../data/weekly-chapter-history.json", import.meta.url)
);
const databaseStateFilePath = fileURLToPath(
  new URL("../../data/backend-state.json", import.meta.url)
);

const repositories = await createSnapshotRepositories();

function main(): void {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "export": {
      const outputPath = requirePathArg(args[0], "output file path");
      saveJsonFile(resolve(outputPath), repositories.exportState());
      console.log(`Exported full backend state to ${resolve(outputPath)}`);
      return;
    }
    case "export-flat": {
      const outputPath = requirePathArg(args[0], "output file path");
      saveJsonFile(
        resolve(outputPath),
        snapshotToMigrationBundle(repositories.exportState())
      );
      console.log(`Exported flat migration bundle to ${resolve(outputPath)}`);
      return;
    }
    case "import": {
      const inputPath = requirePathArg(args[0], "input file path");
      const snapshot = readJson(resolve(inputPath));
      repositories.importState(snapshot);
      console.log(`Imported full backend state from ${resolve(inputPath)}`);
      return;
    }
    case "import-flat": {
      const inputPath = requirePathArg(args[0], "input file path");
      const bundle = readJson(resolve(inputPath));
      repositories.importState(migrationBundleToSnapshot(bundle));
      console.log(`Imported flat migration bundle from ${resolve(inputPath)}`);
      return;
    }
    case "export-user": {
      const userId = requirePathArg(args[0], "userId");
      const outputPath = requirePathArg(args[1], "output file path");
      saveJsonFile(resolve(outputPath), repositories.exportUserState(userId));
      console.log(`Exported user state for ${userId} to ${resolve(outputPath)}`);
      return;
    }
    case "export-user-flat": {
      const userId = requirePathArg(args[0], "userId");
      const outputPath = requirePathArg(args[1], "output file path");
      saveJsonFile(
        resolve(outputPath),
        userSnapshotToMigrationBundle(userId, repositories.exportUserState(userId))
      );
      console.log(`Exported flat user migration bundle for ${userId} to ${resolve(outputPath)}`);
      return;
    }
    case "import-user": {
      const userId = requirePathArg(args[0], "userId");
      const inputPath = requirePathArg(args[1], "input file path");
      const snapshot = readJson(resolve(inputPath));
      repositories.importUserState(userId, snapshot);
      console.log(`Imported user state for ${userId} from ${resolve(inputPath)}`);
      return;
    }
    case "import-user-flat": {
      const userId = requirePathArg(args[0], "userId");
      const inputPath = requirePathArg(args[1], "input file path");
      const bundle = readJson(resolve(inputPath));
      repositories.importUserState(userId, userMigrationBundleToSnapshot(bundle));
      console.log(`Imported flat user migration bundle for ${userId} from ${resolve(inputPath)}`);
      return;
    }
    default:
      printUsage();
  }
}

function requirePathArg(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function printUsage(): void {
  console.log(
    [
      "Usage:",
      "  npm run state:snapshot -- export <output-path>",
      "  npm run state:snapshot -- export-flat <output-path>",
      "  npm run state:snapshot -- import <input-path>",
      "  npm run state:snapshot -- import-flat <input-path>",
      "  npm run state:snapshot -- export-user <userId> <output-path>",
      "  npm run state:snapshot -- export-user-flat <userId> <output-path>",
      "  npm run state:snapshot -- import-user <userId> <input-path>",
      "  npm run state:snapshot -- import-user-flat <userId> <input-path>"
    ].join("\n")
  );
  process.exitCode = 1;
}

main();

function createSnapshotRepositories(): Promise<BaskRepositories> | BaskRepositories {
  const backendMode = normalizeBackendMode(process.env.BASK_REPOSITORY_BACKEND);

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
    return createDatabaseRepositories({
      adapter: createFileDatabaseAdapter({
        stateFilePath: process.env.BASK_DATABASE_STATE_FILE ?? databaseStateFilePath
      })
    });
  }

  return createJsonRepositories({
    workoutsStorageFilePath,
    profilesStorageFilePath,
    memoryStorageFilePath,
    plannedWorkoutsStorageFilePath,
    readinessHistoryStorageFilePath,
    weeklyChapterHistoryStorageFilePath
  });
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
