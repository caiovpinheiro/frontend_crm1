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

import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { startShellBootstrap } from "@/lib/shell-bootstrap";

export function ShellBootstrap() {
  const client = useQueryClient();
  const { data: session, status } = useSession();
  const user = session?.user as
    | { id?: string; organizationId?: string | null }
    | undefined;
  const userId = status === "authenticated" ? user?.id : undefined;

  if (typeof window !== "undefined" && userId) {
    startShellBootstrap(client, {
      userId,
      organizationId: user?.organizationId ?? null,
    });
  }
  return null;
}
