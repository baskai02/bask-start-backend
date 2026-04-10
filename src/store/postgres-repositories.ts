import pg from "pg";
import { createPersistedRepositories } from "./database-repositories.js";
import type {
  BaskRepositories,
  BaskStateSnapshot
} from "./repositories.js";

const { Pool } = pg;

export interface PostgresRepositoryOptions {
  connectionString: string;
  tableName?: string;
  stateKey?: string;
  ssl?: boolean;
}

interface PostgresStateAdapter {
  readState(): Promise<BaskStateSnapshot>;
  writeState(snapshot: BaskStateSnapshot): Promise<void>;
}

export async function createPostgresRepositories(
  options: PostgresRepositoryOptions
): Promise<BaskRepositories> {
  const adapter = await createPostgresStateAdapter(options);
  const initialState = await adapter.readState();

  return createPersistedRepositories({
    initialState,
    persistSnapshot: (snapshot) => adapter.writeState(snapshot)
  });
}

async function createPostgresStateAdapter(
  options: PostgresRepositoryOptions
): Promise<PostgresStateAdapter> {
  const tableName = validateIdentifier(options.tableName ?? "bask_state_snapshots");
  const stateKey = options.stateKey ?? "default";
  const pool = new Pool({
    connectionString: options.connectionString,
    allowExitOnIdle: true,
    ssl:
      options.ssl === false
        ? undefined
        : {
            rejectUnauthorized: false
          }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      state_key TEXT PRIMARY KEY,
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let writeQueue = Promise.resolve();

  return {
    async readState() {
      const result = await pool.query<{ snapshot: BaskStateSnapshot }>(
        `SELECT snapshot FROM ${tableName} WHERE state_key = $1`,
        [stateKey]
      );
      const snapshot = result.rows[0]?.snapshot;

      return snapshot ? normalizeSnapshot(snapshot) : createEmptyStateSnapshot();
    },
    async writeState(snapshot) {
      const nextSnapshot = structuredClone(snapshot);
      writeQueue = writeQueue
        .then(async () => {
          await pool.query(
            `
              INSERT INTO ${tableName} (state_key, snapshot, updated_at)
              VALUES ($1, $2::jsonb, NOW())
              ON CONFLICT (state_key)
              DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
            `,
            [stateKey, JSON.stringify(nextSnapshot)]
          );
        })
        .catch((error: unknown) => {
          console.error("Failed to persist Bask state to Postgres.", error);
        });

      await writeQueue;
    }
  };
}

function validateIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(
      `Invalid Postgres table name "${value}". Use letters, numbers, and underscores only.`
    );
  }

  return value;
}

function createEmptyStateSnapshot(): BaskStateSnapshot {
  return {
    workouts: {},
    profiles: {},
    memory: {},
    plannedWorkouts: {},
    readinessHistory: {},
    weeklyChapterHistory: {}
  };
}

function normalizeSnapshot(snapshot: BaskStateSnapshot): BaskStateSnapshot {
  return {
    workouts: snapshot.workouts ?? {},
    profiles: snapshot.profiles ?? {},
    memory: snapshot.memory ?? {},
    plannedWorkouts: snapshot.plannedWorkouts ?? {},
    readinessHistory: snapshot.readinessHistory ?? {},
    weeklyChapterHistory: snapshot.weeklyChapterHistory ?? {}
  };
}
