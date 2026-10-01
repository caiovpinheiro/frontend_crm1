"use client";

/**
 * use-calls-widget — gate centralizado da feature de Telefonia.
 *
 * Toda a telefonia (SoftphoneWidget global, DealCallButton, página
 * /widgets/calls) só renderiza quando o widget `calls_history` está ATIVO
 * na org. Quem desinstala em /widgets desliga TUDO de uma vez — espelha
 * o modelo da Distribuição Inteligente.
 *
 * Cache em localStorage: org sem telefonia não refaz GET /widgets em
 * toda rota depois da primeira resposta.
 *
 * Lê só os slugs ativos (`useActiveWidgetSlugs`): no shell eles vêm do
 * bootstrap (`/api/me/bootstrap`, bloco `widgets`) sem baixar o catálogo.
 */

import { useEffect, useLayoutEffect, useState } from "react";

import { useActiveWidgetSlugs } from "@/features/widgets/hooks";
import {
  CALLS_WIDGET_SLUG,
  readCachedCallsInstalled,
  writeCachedCallsInstalled,
} from "@/features/widgets/calls-installed-cache";

export { CALLS_WIDGET_SLUG };

export interface CallsWidgetState {
  /** True quando o widget está ATIVO; false quando não instalado; null
   *  enquanto a query carrega. */
  enabled: boolean | null;
  isLoading: boolean;
}

export function useCallsWidget(authEnabled = true): CallsWidgetState {
  const [cached, setCached] = useState<boolean | null>(readCachedCallsInstalled);

  useLayoutEffect(() => {
    const next = readCachedCallsInstalled();
    setCached((cur) => (cur === next ? cur : next));
  }, []);

  const fetchWidgets = authEnabled && cached !== false;
  const { data, isLoading } = useActiveWidgetSlugs(fetchWidgets);

  useEffect(() => {
    if (!data) return;
    const installed = data.activeSlugs.includes(CALLS_WIDGET_SLUG);
    writeCachedCallsInstalled(installed);
    setCached(installed);
  }, [data]);

  if (cached === false && !data) {
    return { enabled: false, isLoading: false };
  }

  if (isLoading || !data) {
    if (cached === true) return { enabled: true, isLoading: false };
    return { enabled: null, isLoading: true };
  }

  const enabled = data.activeSlugs.includes(CALLS_WIDGET_SLUG);

  return { enabled, isLoading: false };
}
