import { useSyncExternalStore } from "react";
import { MMKV } from "react-native-mmkv";

export interface LocalProfile {
  displayName: string;
  jobTitle: string;
  community: string;
  bio: string;
  interests: string[];
  intent: string[];
  photos: string[];
}

const storage = new MMKV({ id: "datting-profile" });
const KEY = "profile.v1";

let snapshot: LocalProfile | null = read();
const listeners = new Set<() => void>();

function read(): LocalProfile | null {
  const raw = storage.getString(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalProfile;
  } catch {
    storage.delete(KEY);
    return null;
  }
}

function emit(next: LocalProfile | null): void {
  snapshot = next;
  if (next) storage.set(KEY, JSON.stringify(next));
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
