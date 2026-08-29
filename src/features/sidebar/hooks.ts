"use client";

/*
 * Hook de leitura das preferencias efetivas de sidebar do usuario autenticado.
 *
 * 14/jul/26: `useSaveSidebarPreferences` foi removido. A edicao da sidebar
 * saiu de /settings/profile (per-user) e virou config de Papel em
 * /settings/permissions — usa `useUpdateRole` diretamente. Ver AGENT.md
 * "Sidebar por Papel". A rota antiga `PATCH /api/profile/preferences/sidebar`
 * agora retorna 410 Gone.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchSidebarPreferences } from "./api";
import type { SidebarPreferencesResponse } from "./types";

import { isPreviewMode } from "@/lib/preview-mode";

export const SIDEBAR_PREFS_KEY = ["sidebar-preferences"] as const;

function resolveEnabled(enabled: boolean | undefined): boolean {
  return isPreviewMode() ? true : (enabled ?? true);
}

export function useSidebarPreferences(enabled?: boolean) {
  return useQuery<SidebarPreferencesResponse>({
    queryKey: SIDEBAR_PREFS_KEY,
    queryFn: fetchSidebarPreferences,
    enabled: resolveEnabled(enabled),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
