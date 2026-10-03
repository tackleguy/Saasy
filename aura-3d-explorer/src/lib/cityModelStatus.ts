"use client";
import { useSyncExternalStore } from "react";

import type { DistrictLoadStatus } from "./districtLoadController";

type Status = DistrictLoadStatus;
const states = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach((listener) => listener());
export function setCityModelStatus(uid: string, status: Status) {
  const attempt = (states.get(uid) ?? "idle:0").split(":")[1];
  states.set(uid, `${status}:${attempt}`);
  emit();
}
export function retryCityModel(uid: string) {
  const attempt = Number((states.get(uid) ?? "idle:0").split(":")[1]);
  states.set(uid, `loading:${attempt + 1}`);
  emit();
}
export function useCityModelStatus(uid: string) {
  const state = useSyncExternalStore(subscribe, () => states.get(uid) ?? "idle:0", () => "idle:0");
  const [status, attempt] = state.split(":");
  return { status: status as Status, attempt: Number(attempt) };
}
