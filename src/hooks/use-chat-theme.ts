"use client";

import { apiUrl } from "@/lib/api";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { DEFAULT_CHAT_THEME, isChatThemeKey } from "@/lib/chat-theme";

/**
 * Aplica `data-chat-theme` no `<html>` conforme preferência do usuário
 * (`GET /api/profile` → `chatTheme`). Default até a query hidratar: `azul`.
 */
export function useChatTheme() {
  const { status } = useSession();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/profile"));
      if (!res.ok) throw new Error("profile");
      return res.json() as { chatTheme?: string | null };
    },
    enabled: status !== "unauthenticated",
    staleTime: 60_000,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (status === "unauthenticated") {
      document.documentElement.setAttribute("data-chat-theme", DEFAULT_CHAT_THEME);
      return;
    }
    const raw = profile?.chatTheme;
    const theme = isChatThemeKey(raw) ? raw : DEFAULT_CHAT_THEME;
    document.documentElement.setAttribute("data-chat-theme", theme);
  }, [status, profile?.chatTheme]);
}
