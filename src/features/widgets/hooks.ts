"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";

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
import { fromShellBootstrap } from "@/lib/shell-bootstrap";
import {
  CALLS_WIDGET_SLUG,
  writeCachedCallsInstalled,
} from "@/features/widgets/calls-installed-cache";

const WIDGETS_KEY = ["widgets"] as const;
const WIDGETS_STALE_MS = 30_000;

/**
 * Slugs ATIVOS na org — o que o shell precisa (gate da telefonia) sem o
 * catálogo inteiro. Fica sob o prefixo `["widgets"]` de propósito: as
 * mutações de instalar/desinstalar invalidam por prefixo e alcançam as
 * duas chaves.
 */
export const ACTIVE_WIDGET_SLUGS_KEY = ["widgets", "active-slugs"] as const;

export type ActiveWidgetSlugs = { activeSlugs: string[] };

/** Em preview/mock mode, ignora o guard de sessao e sempre dispara a query. */
function resolveEnabled(enabled: boolean | undefined): boolean {
  return isPreviewMode() || isPageMockMode() ? true : (enabled ?? true);
}

export function useWidgets(enabled?: boolean) {
  return useQuery<WidgetsResponse>({
    queryKey: WIDGETS_KEY,
    queryFn: fetchWidgets,
    enabled: resolveEnabled(enabled),
    staleTime: WIDGETS_STALE_MS,
  });
}

/**
 * Slugs ativos: bloco `widgets` do bootstrap do shell em voo; senão deriva
 * do catálogo (`fetchQuery` na chave `["widgets"]`, deduplicado com a
 * página /widgets quando ela está aberta — continua 1 GET).
 */
export function useActiveWidgetSlugs(enabled?: boolean) {
  return useQuery<ActiveWidgetSlugs>({
    queryKey: ACTIVE_WIDGET_SLUGS_KEY,
    queryFn: (ctx) =>
      fromShellBootstrap<ActiveWidgetSlugs>(
        ctx.client,
        (p) => p.widgets,
        async () => {
          const catalog = await ctx.client.fetchQuery<WidgetsResponse>({
            queryKey: WIDGETS_KEY,
            queryFn: fetchWidgets,
            staleTime: WIDGETS_STALE_MS,
          });
          return {
            activeSlugs: (catalog?.items ?? [])
              .filter((w) => w.installed)
              .map((w) => w.slug)
              .sort(),
          };
        },
      ),
    enabled: resolveEnabled(enabled),
    staleTime: WIDGETS_STALE_MS,
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
  const visible = useDocumentVisible();
  return useQuery<WidgetSsoResponse>({
    queryKey: ["widget-sso", slug],
    queryFn: () => fetchWidgetSso(slug!),
    enabled: Boolean(slug) && resolveEnabled(enabled),
    // Token vive 5min — re-fetch automatico antes de expirar (4min).
    staleTime: 4 * 60 * 1000,
    refetchInterval: visible ? 4 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}
