import type { KaiUserProfile } from "../kai/types.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface ProfileStore {
  getProfile(userId: string): KaiUserProfile;
  saveProfile(profile: KaiUserProfile): KaiUserProfile;
}

interface ProfileStoreOptions {
  storageFilePath?: string;
}

const defaultProfiles: Record<string, KaiUserProfile> = {
  user_1: {
    userId: "user_1",
    name: "Oliver",
    goal: "build_consistency",
    experienceLevel: "beginner"
  }
};

export function createProfileStore(
  options: ProfileStoreOptions = {}
): ProfileStore {
  const profiles = loadJsonFile<Record<string, KaiUserProfile>>(
    options.storageFilePath,
    defaultProfiles
  );

  return {
    getProfile(userId) {
      return (
        profiles[userId] ?? {
          userId,
          name: "Friend",
          goal: "build_consistency",
          experienceLevel: "beginner"
        }
      );
    },
    saveProfile(profile) {
      profiles[profile.userId] = profile;
      saveJsonFile(options.storageFilePath, profiles);
      return profile;
    }
  };
}
