import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
export function loadJsonFile(filePath, fallback) {
    if (!filePath || !existsSync(filePath)) {
        return fallback;
    }
    const rawFile = readFileSync(filePath, "utf8");
    if (!rawFile.trim()) {
        return fallback;
    }
    return JSON.parse(rawFile);
}
export function saveJsonFile(filePath, data) {
    if (!filePath) {
        return;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2));
}
