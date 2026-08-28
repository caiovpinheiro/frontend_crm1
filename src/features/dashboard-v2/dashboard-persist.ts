"use client";

import { useSession } from "next-auth/react";

import { apiUrl } from "@/lib/api";

/** Shared org:user suffix. Wait until session has a real user id. */
export function useDashboardStorageScope() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const orgId =
    (session?.user as { organizationId?: string | null } | undefined)
      ?.organizationId ?? null;
  const ready = status === "authenticated" && Boolean(userId);
  const keyPart = ready ? `${orgId ?? "org"}:${userId}` : null;
  return { ready, userId, orgId, keyPart };
}

export function scopedKey(prefix: string, keyPart: string): string {
  return `${prefix}:${keyPart}`;
}

export function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Read the scoped key, then classic wrong keys from before session/org
 * were ready (`org:anon`, `undefined:undefined`, …).
 */
export function readJsonWithFallback<T>(
  prefix: string,
  keyPart: string,
  userId: string,
): T | null {
  const primary = scopedKey(prefix, keyPart);
  const hit = readJson<T>(primary);
  if (hit != null) return hit;
  const org = keyPart.split(":")[0] ?? "org";
  const fallbacks = [
    `${prefix}:org:${userId}`,
    `${prefix}:${org}:anon`,
    `${prefix}:org:anon`,
    `${prefix}:undefined:${userId}`,
    `${prefix}:undefined:undefined`,
    `${prefix}:undefined:anon`,
  ];
  for (const key of fallbacks) {
    if (key === primary) continue;
    const value = readJson<T>(key);
    if (value != null) return value;
  }
  return null;
}

type RemoteLayoutResponse =
  | { layout: null }
  | {
      data?: {
        meta?: { v?: number; negocios?: unknown };
      };
    };

export async function fetchRemoteDashboardMeta<T>(): Promise<T | null> {
  try {
    const res = await fetch(apiUrl("/api/dashboard/layout"), { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as RemoteLayoutResponse;
    if (!json || !("data" in json) || !json.data?.meta) return null;
    return json.data.meta as T;
  } catch {
    return null;
  }
}

export const DASHBOARD_UI_KEY_PREFIX = "dashboard-ui";

export type DashboardUiState = {
  tab?: string;
  clock?: "business" | "elapsed";
  tabActorUserId?: string;
  tabDepartmentId?: string;
};

export function readDashboardUiState(
  keyPart: string,
  userId: string,
): DashboardUiState | null {
  const raw = readJsonWithFallback<DashboardUiState>(
    DASHBOARD_UI_KEY_PREFIX,
    keyPart,
    userId,
  );
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

export function writeDashboardUiState(keyPart: string, value: DashboardUiState): void {
  writeJson(scopedKey(DASHBOARD_UI_KEY_PREFIX, keyPart), value);
}

export async function putRemoteDashboardLayout(body: unknown): Promise<void> {
  try {
    await fetch(apiUrl("/api/dashboard/layout"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* offline / super-admin 400 */
  }
}
