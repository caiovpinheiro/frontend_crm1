"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { useState } from "react";

import { ConfirmProvider } from "@/hooks/use-confirm";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/lib/api";

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
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
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
