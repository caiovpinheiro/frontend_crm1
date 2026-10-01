"use client";

/*
 * Preferencias efetivas da sidebar (papel + overlay pessoal).
 *
 * Edicao pessoal: `useSaveSidebarPreferences` / `useResetSidebarPreferences`
 * em /settings/profile. O teto do papel continua em /settings/permissions.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryFunctionContext,
} from "@tanstack/react-query";

import {
  fetchSidebarPreferences,
  resetSidebarPreferences,
  saveSidebarPreferences,
} from "./api";
import type { SidebarItemPreference, SidebarPreferencesResponse } from "./types";

import { isPreviewMode } from "@/lib/preview-mode";
import { fromShellBootstrap } from "@/lib/shell-bootstrap";

export const SIDEBAR_PREFS_KEY = ["sidebar-preferences"] as const;

/**
 * `queryFn` canônico da chave `sidebar-preferences` (usado aqui e pela
 * sync de tema em `use-theme-v2`): bloco `preferences` do bootstrap do
 * shell quando ele está em voo; senão `GET /api/profile/preferences`.
 */
export function sidebarPreferencesQueryFn(
  ctx: Pick<QueryFunctionContext, "client">,
): Promise<SidebarPreferencesResponse> {
  return fromShellBootstrap<SidebarPreferencesResponse>(
    ctx.client,
    (p) => p.preferences as SidebarPreferencesResponse | null,
    fetchSidebarPreferences,
  );
}

function resolveEnabled(enabled: boolean | undefined): boolean {
  return isPreviewMode() ? true : (enabled ?? true);
}

export function useSidebarPreferences(enabled?: boolean) {
  return useQuery<SidebarPreferencesResponse>({
    queryKey: SIDEBAR_PREFS_KEY,
    queryFn: sidebarPreferencesQueryFn,
    enabled: resolveEnabled(enabled),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

function writePrefsCache(
  queryClient: ReturnType<typeof useQueryClient>,
  data: SidebarPreferencesResponse,
) {
  queryClient.setQueryData<SidebarPreferencesResponse>(SIDEBAR_PREFS_KEY, (prev) => ({
    ...prev,
    ...data,
  }));
}

export function useSaveSidebarPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: SidebarItemPreference[]) => saveSidebarPreferences(items),
    onSuccess: (data) => writePrefsCache(queryClient, data),
  });
}

export function useResetSidebarPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetSidebarPreferences,
    onSuccess: (data) => writePrefsCache(queryClient, data),
  });
}
