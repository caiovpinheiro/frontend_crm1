"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchWidgetSso,
  fetchWidgets,
  installWidget,
  uninstallWidget,
  type WidgetSsoResponse,
} from "./api";
import type { WidgetsResponse } from "./types";

import { isPreviewMode } from "@/lib/preview-mode";
import { isPageMockMode } from "@/lib/page-mock-mode";
import {
  CALLS_WIDGET_SLUG,
  writeCachedCallsInstalled,
} from "@/features/widgets/calls-installed-cache";

const WIDGETS_KEY = ["widgets"] as const;

/** Em preview/mock mode, ignora o guard de sessao e sempre dispara a query. */
function resolveEnabled(enabled: boolean | undefined): boolean {
  return isPreviewMode() || isPageMockMode() ? true : (enabled ?? true);
}

export function useWidgets(enabled?: boolean) {
  return useQuery<WidgetsResponse>({
    queryKey: WIDGETS_KEY,
    queryFn: fetchWidgets,
    enabled: resolveEnabled(enabled),
    staleTime: 30_000,
  });
}

export function useInstallWidget() {
  const qc = useQueryClient();
  return useMutation<{ slug: string; installed: boolean }, Error, string>({
    mutationFn: installWidget,
    onSuccess: (_data, slug) => {
      if (slug === CALLS_WIDGET_SLUG) writeCachedCallsInstalled(true);
      qc.invalidateQueries({ queryKey: WIDGETS_KEY });
    },
  });
}

export function useUninstallWidget() {
  const qc = useQueryClient();
  return useMutation<{ slug: string; installed: boolean }, Error, string>({
    mutationFn: uninstallWidget,
    onSuccess: (_data, slug) => {
      if (slug === CALLS_WIDGET_SLUG) writeCachedCallsInstalled(false);
      qc.invalidateQueries({ queryKey: WIDGETS_KEY });
    },
  });
}

/** Busca um token SSO para abrir o iframe de um widget PARTNER. */
export function useWidgetSso(slug: string | null | undefined, enabled = true) {
  return useQuery<WidgetSsoResponse>({
    queryKey: ["widget-sso", slug],
    queryFn: () => fetchWidgetSso(slug!),
    enabled: Boolean(slug) && resolveEnabled(enabled),
    // Token vive 5min — re-fetch automatico antes de expirar (4min).
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
