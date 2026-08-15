import { useSyncExternalStore } from "react";
import { MMKV } from "react-native-mmkv";

export interface ProfilePrompt {
  id: string;
  question: string;
  answer: string;
}

export interface LocalProfile {
  displayName: string;
  jobTitle: string;
  community: string;
  bio: string;
  interests: string[];
  intent: string[];
  photos: string[];
  /** Tối đa 3 câu trả lời ngắn dùng để tạo ngữ cảnh kết nối. */
  prompts: ProfilePrompt[];
}

const storage = new MMKV({ id: "datting-profile" });
const KEY = "profile.v2";
const LEGACY_KEY = "profile.v1";

let snapshot: LocalProfile | null = read();
const listeners = new Set<() => void>();

function normalize(value: Partial<LocalProfile>): LocalProfile {
  return {
    displayName: value.displayName ?? "",
    jobTitle: value.jobTitle ?? "",
    community: value.community ?? "",
    bio: value.bio ?? "",
    interests: Array.isArray(value.interests) ? value.interests.filter((x): x is string => typeof x === "string") : [],
    intent: Array.isArray(value.intent) ? value.intent.filter((x): x is string => typeof x === "string") : [],
    photos: Array.isArray(value.photos) ? value.photos.filter((x): x is string => typeof x === "string") : [],
    prompts: Array.isArray(value.prompts)
      ? value.prompts
          .filter((p): p is ProfilePrompt => Boolean(p) && typeof p.id === "string" && typeof p.question === "string" && typeof p.answer === "string")
          .slice(0, 3)
      : [],
  };
}

function read(): LocalProfile | null {
  const raw = storage.getString(KEY) ?? storage.getString(LEGACY_KEY);
  if (!raw) return null;
  try {
    const parsed = normalize(JSON.parse(raw) as Partial<LocalProfile>);
    // Tự migrate v1 → v2 mà không mất dữ liệu onboarding cũ.
    storage.set(KEY, JSON.stringify(parsed));
    storage.delete(LEGACY_KEY);
    return parsed;
  } catch {
    storage.delete(KEY);
    storage.delete(LEGACY_KEY);
    return null;
  }
}

function emit(next: LocalProfile | null): void {
  snapshot = next ? normalize(next) : null;
  if (snapshot) storage.set(KEY, JSON.stringify(snapshot));
  else storage.delete(KEY);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LocalProfile | null {
  return snapshot;
}

export function useLocalProfile(): LocalProfile | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const profileStore = {
  save(profile: LocalProfile): void {
    emit(profile);
  },
  clear(): void {
    emit(null);
  },
  current(): LocalProfile | null {
    return snapshot;
  },
};
