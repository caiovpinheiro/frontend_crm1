"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmProvider } from "@/hooks/use-confirm";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/lib/api";
import {
  isRateLimitError,
  queryRetry,
  queryRetryDelay,
  rateLimitMutationMessage,
} from "@/lib/rate-limit";

/**
 * Mutação que recebeu 429/503 com prazo e não tem `onError` próprio:
 * toast (uma vez por vez — `id` fixo). Nada de recarregar nem deslogar; o
 * formulário de quem chamou fica como estava.
 */
export function notifyRateLimitedMutation(
  error: unknown,
  hasOwnOnError: boolean,
  show: (message: string) => void = (message) =>
    toast.error(message, { id: "rate-limited-mutation" }),
): boolean {
  if (hasOwnOnError || !isRateLimitError(error)) return false;
  show(rateLimitMutationMessage(error));
  return true;
}

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            notifyRateLimitedMutation(error, !!mutation.options.onError);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            // Uma nova tentativa, como antes; num 429/503 com prazo, só
            // depois do prazo (+ jitter) — `lib/rate-limit.ts`.
            retry: queryRetry,
            retryDelay: queryRetryDelay,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
    >
      {/* Tema controlado exclusivamente por `useThemeV2` (toggle Sol/Lua no
          sidebar), que aplica `.v2-dark` + `.dark` no <html>. Persistência
          híbrida: localStorage (`crm-v2-theme`) como cache/anti-FOUC +
          preferência do usuário no servidor (`appearance.theme`) para
          paridade browser/APK. Um script inline em `layout.tsx` já aplica
          as classes a partir do localStorage antes do paint; a sync com o
          servidor hidrata e regrava o cache depois. Não usar
          `ThemeProvider` do next-themes aqui — ele teria sua própria fonte
          de verdade e entraria em conflito com `useThemeV2`. */}
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
