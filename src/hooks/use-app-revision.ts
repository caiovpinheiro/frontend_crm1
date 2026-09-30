"use client";

import { useQuery } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";
import { fetchAppRevision } from "@/lib/hard-reload";
import { APP_REVISION_POLL_MS, pollWhileVisible } from "@/lib/shell-polling";

/** Fingerprint do build atual, embutido em build time. Vazio em builds sem CI/local sem prebuild. */
export const CLIENT_REVISION = (process.env.NEXT_PUBLIC_BUILD_ID ?? "").trim();

/** `true` se o cliente tem um BUILD_ID comparável com `/api/app-revision`. */
export function hasComparableClientRevision(clientRevision = CLIENT_REVISION): boolean {
  return clientRevision !== "" && clientRevision !== "dev";
}

/**
 * Opções da query `["app-revision"]` — uma só para o banner desktop e o
 * popup mobile (antes eram dois detectores: 3 min + 30 s).
 *
 * `staleTime` = intervalo: a volta do foco só refaz se o poll já estaria
 * atrasado (aba oculta por horas descobre o deploy sem esperar o próximo
 * tick), nunca a cada alternância de aba.
 */
export function appRevisionQueryOptions(opts: {
  enabled: boolean;
  visible: boolean;
  clientRevision?: string;
}) {
  return {
    queryKey: ["app-revision"] as const,
    queryFn: fetchAppRevision,
    enabled: opts.enabled && hasComparableClientRevision(opts.clientRevision),
    staleTime: APP_REVISION_POLL_MS,
    ...pollWhileVisible(opts.visible, APP_REVISION_POLL_MS),
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  } as const;
}

/** Revisão do build servido agora (`null` sem resposta / sem BUILD_ID). */
export function useAppRevision(enabled: boolean) {
  const visible = useDocumentVisible();
  return useQuery(appRevisionQueryOptions({ enabled, visible }));
}
