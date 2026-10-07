"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { setInboxViewerScope } from "@/features/inbox-v2/inbox-viewer-scope";
import { apiUrl } from "@/lib/api";
import { useMyPermissions } from "@/hooks/use-my-permissions";

type VisibilityMode = "all" | "own";
type VisibilitySettings = Partial<Record<string, VisibilityMode>>;

/** `GET /api/settings/visibility` — modo por papel (`{ ADMIN, MANAGER, MEMBER }`). */
async function fetchVisibilitySettings(): Promise<VisibilitySettings> {
  const res = await fetch(apiUrl("/api/settings/visibility"));
  if (!res.ok) throw new Error("Falha ao carregar a visibilidade.");
  return (await res.json()) as VisibilitySettings;
}

/**
 * Descobre se o usuário só enxerga o que é dele (modo "own" do papel) e
 * registra isso no QueryClient para os handlers de tempo real decidirem, sem
 * refetch, se uma conversa/negócio que mudou de dono continua visível.
 *
 * Admin (papel ou permissão `*`) nunca é "own". Para os demais, vale a
 * configuração da organização por papel (`visibility.MANAGER|MEMBER`), lida
 * UMA vez (cache de 10 min). Qualquer dúvida (sem sessão, permissões ou
 * configuração ainda sem resposta, erro) deixa `ownOnly: null` — nada é
 * removido por escopo e vale o comportamento anterior.
 */
export function useViewerScopeSync(enabled = true): void {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  const userId = user?.id ?? null;
  const role = user?.role ?? null;
  const { data: perms } = useMyPermissions();

  const isAdmin = role === "ADMIN" || Boolean(perms?.permissions.includes("*"));
  // Papel ADMIN dispensa a configuração; os demais precisam das permissões
  // (podem ser "*" por RBAC) antes de afirmar qualquer coisa.
  const needsSettings = enabled && !!userId && !!role && !isAdmin && !!perms;
  const { data: settings } = useQuery<VisibilitySettings>({
    queryKey: ["settings-visibility"],
    queryFn: fetchVisibilitySettings,
    enabled: needsSettings,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  let ownOnly: boolean | null = null;
  if (userId && role) {
    if (isAdmin) ownOnly = false;
    else if (perms && settings) {
      const mode = settings[role];
      ownOnly = mode === "own" ? true : mode === "all" ? false : null;
    }
  }

  useEffect(() => {
    if (!enabled) return;
    setInboxViewerScope(qc, { userId, ownOnly });
  }, [qc, enabled, userId, ownOnly]);
}
