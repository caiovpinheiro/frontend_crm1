/*
 * Camada de API da sidebar efetiva do usuario.
 *
 * Leitura: GET /api/profile/preferences (papel + overlay pessoal).
 * Gravacao pessoal: PATCH /api/profile/preferences/sidebar
 * Gravacao do teto do papel: admin em /settings/permissions (useUpdateRole).
 */

import { apiUrl } from "@/lib/api";

import type { SidebarItemPreference, SidebarPreferencesResponse } from "./types";

async function requestJson<T>(
  path: string,
  errLabel: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  const text = await res.text();
  if (!res.ok) {
    let message = errLabel;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      /* corpo nao-JSON */
    }
    throw new Error(message);
  }
  if (!text.trim()) {
    throw new Error("Sessão expirada ou backend indisponível. Recarregue e faça login.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Sessão não reconhecida pelo backend. Recarregue e faça login.");
  }
}

export function fetchSidebarPreferences(): Promise<SidebarPreferencesResponse> {
  return requestJson<SidebarPreferencesResponse>(
    "/api/profile/preferences",
    "Erro ao carregar preferências.",
  );
}

export function saveSidebarPreferences(
  items: SidebarItemPreference[],
): Promise<SidebarPreferencesResponse> {
  return requestJson<SidebarPreferencesResponse>(
    "/api/profile/preferences/sidebar",
    "Erro ao salvar o menu.",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
  );
}

export function resetSidebarPreferences(): Promise<SidebarPreferencesResponse> {
  return requestJson<SidebarPreferencesResponse>(
    "/api/profile/preferences/sidebar",
    "Erro ao restaurar o menu.",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    },
  );
}
