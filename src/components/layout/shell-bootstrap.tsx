"use client";

/**
 * Dispara o `GET /api/me/bootstrap` uma vez por carga (e de novo se a
 * identidade `userId|organizationId` da sessão mudar) e semeia os caches
 * do shell — ver `lib/shell-bootstrap.ts`.
 *
 * A chamada acontece DURANTE o render, de propósito (mesmo padrão do
 * `usePrefetchQuery` do TanStack): os `queryFn` dos hooks filhos rodam
 * nos effects, que vêm depois de todo o render da árvore — assim a
 * tentativa já existe quando eles perguntam por ela. É idempotente, não
 * toca estado React e não roda no servidor.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { installBootstrapShare } from "@/lib/bootstrap-share";
import {
  holdSeedingUntilCommit,
  releaseSeedingAfterCommit,
  startShellBootstrap,
} from "@/lib/shell-bootstrap";

// Aba nova reaproveita o bootstrap (< 60 s, mesmo usuário/org) de uma aba
// aberta, sem rede — ver `lib/bootstrap-share.ts`.
if (typeof window !== "undefined") installBootstrapShare();

export function ShellBootstrap() {
  const client = useQueryClient();
  const { data: session, status } = useSession();
  const user = session?.user as
    | { id?: string; organizationId?: string | null }
    | undefined;
  const userId = status === "authenticated" ? user?.id : undefined;

  // A rede sai já (render); a semeadura espera a página hidratar.
  useEffect(() => releaseSeedingAfterCommit(), []);
  if (typeof window !== "undefined" && userId) {
    holdSeedingUntilCommit();
    startShellBootstrap(client, {
      userId,
      organizationId: user?.organizationId ?? null,
    });
  }
  return null;
}
