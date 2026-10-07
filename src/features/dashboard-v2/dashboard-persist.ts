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

export const DASHBOARD_META_V = 2;

export type RemoteDashboardLoad =
  | { ok: true; meta: Record<string, unknown> }
  | { ok: false };

export type SliceResolution<T> = {
  value: T | null;
  source: "remote" | "local" | "none";
  /** Backend sem este slice e há estado local antigo para subir. */
  migrate: boolean;
};

type RemoteLayoutResponse =
  | { layout: null }
  | {
      data?: {
        meta?: unknown;
      };
    };

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

let cachedRemote: RemoteDashboardLoad | null = null;
let inflightRemote: Promise<RemoteDashboardLoad> | null = null;

export function resetDashboardRemoteForTests(): void {
  cachedRemote = null;
  inflightRemote = null;
}

export function sliceIsPresent(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  if (!meta) return false;
  return Object.prototype.hasOwnProperty.call(meta, key) && meta[key] != null;
}

/**
 * Backend primeiro. Slice remoto presente vence o local.
 * Backend vazio nesse slice + local antigo → migrar.
 * Erro de rede não é “vazio”: não migra por cima de um remoto desconhecido.
 */
export function resolveDashboardSlice<T>(
  remote: RemoteDashboardLoad,
  key: string,
  local: T | null,
): SliceResolution<T> {
  if (!remote.ok) {
    return {
      value: local,
      source: local != null ? "local" : "none",
      migrate: false,
    };
  }
  if (sliceIsPresent(remote.meta, key)) {
    return { value: remote.meta[key] as T, source: "remote", migrate: false };
  }
  if (local != null) {
    return { value: local, source: "local", migrate: true };
  }
  return { value: null, source: "none", migrate: false };
}

async function fetchRemoteDashboard(): Promise<RemoteDashboardLoad> {
  try {
    const res = await fetch(apiUrl("/api/dashboard/layout"), { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as RemoteLayoutResponse;
    if (!json || !("data" in json) || json.data == null) {
      return { ok: true, meta: {} };
    }
    const meta = isPlain(json.data.meta) ? json.data.meta : {};
    return { ok: true, meta };
  } catch {
    return { ok: false };
  }
}

/** Uma leitura compartilhada por abertura. Erro não fica em cache. */
export function loadRemoteDashboard(): Promise<RemoteDashboardLoad> {
  if (cachedRemote?.ok) return Promise.resolve(cachedRemote);
  if (inflightRemote) return inflightRemote;
  inflightRemote = fetchRemoteDashboard().then((result) => {
    inflightRemote = null;
    if (result.ok) cachedRemote = result;
    return result;
  });
  return inflightRemote;
}

function rememberRemoteMeta(patch: Record<string, unknown>): void {
  const prev = cachedRemote?.ok ? cachedRemote.meta : {};
  cachedRemote = { ok: true, meta: { ...prev, ...patch } };
}

export type DashboardPatchExtra = {
  visibleWidgets?: string[];
  layout?: Record<
    string,
    {
      i: string;
      x: number;
      y: number;
      w: number;
      h: number;
      minW?: number;
      minH?: number;
    }
  >;
};

export function buildDashboardPatchBody(
  meta: Record<string, unknown>,
  extra?: DashboardPatchExtra,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    meta: { v: DASHBOARD_META_V, ...meta },
  };
  if (extra?.visibleWidgets) body.visibleWidgets = extra.visibleWidgets;
  if (extra?.layout) body.layout = extra.layout;
  return body;
}

export async function fetchRemoteDashboardMeta<T>(): Promise<T | null> {
  const loaded = await loadRemoteDashboard();
  if (!loaded.ok) return null;
  return loaded.meta as T;
}

/** O backend já tem exatamente estes slices (última leitura/gravação desta sessão). */
function isAlreadyRemote(meta: Record<string, unknown>): boolean {
  if (!cachedRemote?.ok) return false;
  const known = cachedRemote.meta;
  return Object.entries(meta).every(
    ([key, value]) => JSON.stringify(known[key]) === JSON.stringify(value),
  );
}

/**
 * PATCH parcial. `false` em 4xx/5xx ou rede — o caller não trata isso como salvo.
 * Não envia organizationId nem userId. Slice igual ao que o backend já tem (ex.:
 * filtros da URL iguais aos salvos) não gera chamada.
 */
export async function patchRemoteDashboardMeta(
  meta: Record<string, unknown>,
  extra?: DashboardPatchExtra,
  opts?: { keepalive?: boolean },
): Promise<boolean> {
  if (!extra && isAlreadyRemote(meta)) return true;
  const body = buildDashboardPatchBody(meta, extra);
  try {
    const res = await fetch(apiUrl("/api/dashboard/layout"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: opts?.keepalive ?? false,
    });
    if (!res.ok) return false;
    const sent = body.meta;
    if (isPlain(sent)) rememberRemoteMeta(sent);
    return true;
  } catch {
    return false;
  }
}

/**
 * Grava o cache local e só então tenta o backend.
 * Falha remota não apaga o local.
 */
export async function saveDashboardSlice(options: {
  storageKey: string;
  metaKey: string;
  value: unknown;
  extra?: DashboardPatchExtra;
  keepalive?: boolean;
}): Promise<boolean> {
  writeJson(options.storageKey, options.value);
  return patchRemoteDashboardMeta(
    { [options.metaKey]: options.value },
    options.extra,
    { keepalive: options.keepalive },
  );
}

export type RemoteSliceJob = {
  storageKey: string;
  value: unknown;
  extra?: DashboardPatchExtra;
};

export function createRemoteSliceSaver(metaKey: string, delay = 800) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: RemoteSliceJob | null = null;

  const run = (keepalive: boolean) => {
    const job = pending;
    pending = null;
    timer = null;
    if (!job) return;
    void saveDashboardSlice({ ...job, metaKey, keepalive });
  };

  return {
    schedule(job: RemoteSliceJob) {
      pending = job;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => run(false), delay);
    },
    flush() {
      if (!timer && !pending) return;
      if (timer) clearTimeout(timer);
      run(true);
    },
  };
}

export const DASHBOARD_UI_KEY_PREFIX = "dashboard-ui";

export type DashboardUiState = {
  tab?: string;
  clock?: "business" | "elapsed";
  /** Legado (um id). Preferir `tabActorUserIds`. */
  tabActorUserId?: string;
  tabDepartmentId?: string;
  tabActorUserIds?: string[];
  tabDepartmentIds?: string[];
  /** Negócios › "Ganhos por agente": ocultar agentes sem atividade. */
  hideInactiveAgents?: boolean;
};

export function readHideInactiveAgents(saved: DashboardUiState): boolean {
  return saved.hideInactiveAgents === true;
}

function asSavedIds(list: unknown, legacy?: unknown): string[] {
  if (Array.isArray(list)) {
    return list.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  if (typeof legacy === "string" && legacy) return [legacy];
  return [];
}

export function readSavedActorUserIds(saved: DashboardUiState): string[] {
  return asSavedIds(saved.tabActorUserIds, saved.tabActorUserId);
}

export function readSavedDepartmentIds(saved: DashboardUiState): string[] {
  return asSavedIds(saved.tabDepartmentIds, saved.tabDepartmentId);
}

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

export async function putRemoteDashboardLayout(body: unknown): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/api/dashboard/layout"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
