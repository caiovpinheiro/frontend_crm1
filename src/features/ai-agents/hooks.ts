"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchCockpitEmbedToken,
  fetchCockpitNav,
  type CockpitEmbedTokenResponse,
  type CockpitNavGroup,
} from "./cockpit-api";

/**
 * Abas do cockpit lidas do `nav.json` do serviço — permite montar a barra de
 * abas SEM carregar o iframe (lazy loading real). O `cockpit:ready` do iframe
 * continua sendo autoritativo e sobrescreve isto se divergir.
 */
export function useCockpitNav(cockpitUrl: string | null) {
  return useQuery<CockpitNavGroup[]>({
    queryKey: ["cockpit-nav", cockpitUrl],
    queryFn: () => fetchCockpitNav(cockpitUrl!),
    enabled: Boolean(cockpitUrl),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/**
 * Token de embed do cockpit. Mesmo padrão do `useWidgetSso`: TTL de 5 min no
 * backend, refresh a cada 4 min para o iframe nunca receber um token expirado.
 */
export function useCockpitEmbedToken(enabled: boolean) {
  return useQuery<CockpitEmbedTokenResponse>({
    queryKey: ["cockpit-embed-token"],
    queryFn: fetchCockpitEmbedToken,
    enabled,
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
