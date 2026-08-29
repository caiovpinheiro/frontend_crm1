/**
 * Permissões efetivas do usuário logado — Permissions v2 (Sprint 5).
 *
 * Usa o endpoint /api/users/[id]/effective-permissions criado no Sprint 2.
 * staleTime alinhado com TTL do cache Redis de authz no backend (60s).
 */
"use client";

import { useRef } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { apiUrl } from "@/lib/api";

export type MyPermissionsData = {
  permissions: string[];
  channelGrants: string[];
  stageGrants: string[];
  roles: { id: string; name: string; systemPreset: string | null }[];
  groups: { id: string; name: string }[];
};

export function useMyPermissions() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const stableIdRef = useRef(userId);
  if (userId) stableIdRef.current = userId;
  const id = userId ?? stableIdRef.current;

  return useQuery({
    queryKey: ["my-permissions", id],
    queryFn: async (): Promise<MyPermissionsData> => {
      const res = await fetch(apiUrl(`/api/users/${id}/effective-permissions`));
      if (!res.ok) {
        throw new Error("Falha ao carregar permissões.");
      }
      return res.json();
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Verifica se o usuário tem uma permission key específica.
 * Suporta wildcard "*" (ADMIN preset).
 *
 * Retorna `false` enquanto os dados ainda estão carregando.
 */
export function useCan(key: string): boolean {
  const { data } = useMyPermissions();
  if (!data) return false;
  const { permissions } = data;
  return permissions.includes("*") || permissions.includes(key);
}
