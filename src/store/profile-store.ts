import { normalizeProfileInput } from "../kai/profile-adapter.js";
import type { KaiAppProfileSnapshot, KaiUserProfile } from "../kai/types.js";
import { loadJsonFile, saveJsonFile } from "./storage.js";

export interface ProfileStore {
  getProfile(userId: string): KaiUserProfile;
  exportProfilesState(): Record<string, KaiUserProfile>;
  replaceProfilesState(nextState: Record<string, KaiUserProfile>): void;
  saveProfile(profile: KaiUserProfile): KaiUserProfile;
  saveProfileSnapshot(profile: KaiAppProfileSnapshot): KaiUserProfile;
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
    exportProfilesState() {
      return { ...profiles };
    },
    replaceProfilesState(nextState) {
      for (const key of Object.keys(profiles)) {
        delete profiles[key];
      }

      for (const [userId, profile] of Object.entries(nextState)) {
        profiles[userId] = normalizeProfileInput(profile);
      }

      saveJsonFile(options.storageFilePath, profiles);
    },
    saveProfile(profile) {
      profiles[profile.userId] = normalizeProfileInput(profile);
      saveJsonFile(options.storageFilePath, profiles);
      return profiles[profile.userId];
    },
    saveProfileSnapshot(profile) {
      profiles[profile.userId] = normalizeProfileInput(profile);
      saveJsonFile(options.storageFilePath, profiles);
      return profiles[profile.userId];
    }
  };
}
