import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

export function loadJsonFile<T>(filePath?: string, fallback?: T): T {
  if (!filePath || !existsSync(filePath)) {
    return fallback as T;
  }

  const rawFile = readFileSync(filePath, "utf8");

  if (!rawFile.trim()) {
    return fallback as T;
  }

  return JSON.parse(rawFile) as T;
}

export function saveJsonFile(filePath: string | undefined, data: unknown): void {
  if (!filePath) {
    return;
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}
