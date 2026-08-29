"use client";

import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { isNativePlatform } from "@/lib/native/capacitor";

import {
  BOTTOM_NAV_MAX,
  DEFAULT_BOTTOM_NAV,
  DEFAULT_ENABLED,
  type MobileLayoutConfigDto,
  sanitizeModuleIds,
} from "@/lib/mobile-layout";

/**
 * Hook que carrega a configuracao do app mobile.
 * Cache stale-while-revalidate de 30s — admin troca o layout, app
 * pega no maximo 30s depois automaticamente.
 *
 * Resilience: retorna defaults em qualquer falha (404 antes de
 * primeiro save, network down, etc) — o app NUNCA fica sem
 * navegacao.
 */
const QUERY_KEY = ["mobile-layout"] as const;

async function fetchMobileLayout(): Promise<MobileLayoutConfigDto> {
  const res = await fetch(apiUrl("/api/mobile-layout"), { cache: "no-store" });
  if (!res.ok) {
    return {
      bottomNav: DEFAULT_BOTTOM_NAV,
      enabled: DEFAULT_ENABLED,
      startRoute: "/dashboard",
      brandColor: null,
      version: 0,
    };
  }
  const json = (await res.json()) as MobileLayoutConfigDto;
  return {
    bottomNav: sanitizeModuleIds(json.bottomNav, {
      ensureRequired: true,
      maxItems: BOTTOM_NAV_MAX,
    }),
    enabled: sanitizeModuleIds(json.enabled, { ensureRequired: true }),
    startRoute: json.startRoute || "/dashboard",
    brandColor: json.brandColor ?? null,
    version: json.version ?? 0,
  };
}

function needsMobileLayout(): boolean {
  if (typeof window === "undefined") return false;
  return isNativePlatform() || window.matchMedia("(max-width: 767px)").matches;
}

export function useMobileLayout() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(needsMobileLayout());
  }, []);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchMobileLayout,
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    config: query.data ?? {
      bottomNav: DEFAULT_BOTTOM_NAV,
      enabled: DEFAULT_ENABLED,
      startRoute: "/dashboard",
      brandColor: null,
      version: 0,
    },
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export const MOBILE_LAYOUT_QUERY_KEY = QUERY_KEY;
