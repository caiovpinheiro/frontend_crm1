"use client";

import { useEffect, useMemo, type SetStateAction } from "react";

import type { useMyPermissions } from "@/hooks/use-my-permissions";
import { listAllowedInboxTabsForUser } from "@/lib/authz/scope-grants-shared";

import type { InboxTab } from "../api";
import { INBOX_QUEUE_ITEMS } from "../inbox-queue-catalog";
import { DEFAULT_INBOX_TAB } from "./use-inbox-filters-url-sync";

// Ordem das tabs alinhada ao legado (`conversation-list.tsx`
// TAB_ORDER). "Agente IA" lista conversas cujo responsável é um usuário
// `type: AI` — sai daqui no handoff (vira Entrada, com ou sem consultor).
// "Automação" lista conversas cujo contato tem automação RUNNING (fila de
// automação). "Erro" = OPEN + hasError (falha de envio); encerradas não
// entram — hasError sticky em RESOLVED poluía a aba.
const TABS = INBOX_QUEUE_ITEMS;

type MyPermissions = ReturnType<typeof useMyPermissions>["data"];

/**
 * Filas visíveis para o papel/permissões do operador e guarda que tira da
 * seleção as filas não permitidas.
 */
export function useInboxVisibleTabs(params: {
  sessionRole: string | undefined;
  myPermissions: MyPermissions;
  tab: InboxTab[];
  setTab: (next: SetStateAction<InboxTab[]>) => void;
  tabHydrated: boolean;
}) {
  const { sessionRole, myPermissions, tab, setTab, tabHydrated } = params;

  const visibleTabs = useMemo(() => {
    const role = sessionRole ?? null;
    if (role === "ADMIN" || role === "MANAGER") return TABS;
    // Enquanto carrega permissions: default operacional (evita flash de Automação/Entrada).
    if (!myPermissions) {
      return TABS.filter(
        (t) =>
          t.id === "todos" ||
          t.id === "esperando" ||
          t.id === "respondidas" ||
          t.id === "ligar",
      );
    }
    const allowed = new Set<string>(
      listAllowedInboxTabsForUser({
        grants: {},
        role,
        permissions: myPermissions.permissions,
      }),
    );
    return TABS.filter((t) => allowed.has(t.id));
  }, [sessionRole, myPermissions]);

  // Se a aba da URL/localStorage não for permitida para o papel, cai na
  // primeira visível.
  useEffect(() => {
    if (!tabHydrated || visibleTabs.length === 0) return;
    // Enquanto o RBAC não chegou, `visibleTabs` é um subset — não
    // reescrever a aba da URL (deep-link `tab=entrada` da fila de espera).
    if (sessionRole !== "ADMIN" && sessionRole !== "MANAGER" && !myPermissions) {
      return;
    }
    const allowed = new Set(visibleTabs.map((t) => t.id));
    const next = tab.filter((t) => allowed.has(t));
    // Seleção vazia é válida (empty state). Só força default quando havia
    // filas selecionadas e todas ficaram inválidas para o papel.
    if (next.length === 0) {
      if (tab.length > 0) {
        setTab([visibleTabs[0]?.id ?? DEFAULT_INBOX_TAB]);
      }
    } else if (next.length !== tab.length) {
      setTab(next);
    }
  }, [tabHydrated, visibleTabs, tab, setTab, sessionRole, myPermissions]);

  return visibleTabs;
}
