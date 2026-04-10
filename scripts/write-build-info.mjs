import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const packageJsonPath = resolve(rootDir, "package.json");
const outputPath = resolve(rootDir, "dist", "build-info.json");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const buildInfo = {
  name: packageJson.name,
  version: packageJson.version,
  builtAt: new Date().toISOString()
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");

