import { loadJsonFile, saveJsonFile } from "./storage.js";
const defaultProfiles = {
    user_1: {
        userId: "user_1",
        name: "Oliver",
        goal: "build_consistency",
        experienceLevel: "beginner"
    }
};
export function createProfileStore(options = {}) {
    const profiles = loadJsonFile(options.storageFilePath, defaultProfiles);
    return {
        getProfile(userId) {
            return (profiles[userId] ?? {
                userId,
                name: "Friend",
                goal: "build_consistency",
                experienceLevel: "beginner"
            });
        },
        saveProfile(profile) {
            profiles[profile.userId] = profile;
            saveJsonFile(options.storageFilePath, profiles);
            return profile;
        }
    };
}
