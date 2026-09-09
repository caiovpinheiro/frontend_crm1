"use client";

import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import { isPreviewMode } from "@/lib/preview-mode";
import { fetchSidebarPreferences } from "@/features/sidebar/api";
import { SIDEBAR_PREFS_KEY } from "@/features/sidebar/hooks";

export type ThemeV2 = "light" | "dark";

const STORAGE_KEY = "crm-v2-theme";
const DARK_CLASS = "v2-dark";

function readExplicitStored(): ThemeV2 | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* localStorage indisponível */
  }
  return null;
}

function readStored(): ThemeV2 {
  if (typeof window === "undefined") return "light";
  const explicit = readExplicitStored();
  if (explicit) return explicit;
  return "light";
}

function applyTheme(t: ThemeV2) {
  if (typeof document === "undefined") return;
  const isDark = t === "dark";
  const el = document.documentElement;
  // Classe `light` sempre presente: neutraliza @media (prefers-color-scheme: dark).
  el.classList.add("light");
  el.classList.toggle(DARK_CLASS, isDark);
  // Tokens shadcn (text-foreground, bg-muted, text-ink-*) vivem em globals.css sob `.dark`.
  el.classList.toggle("dark", isDark);
  el.style.colorScheme = "light";
}

/**
 * Fonte ÚNICA de verdade do tema v2, compartilhada por todas as instâncias
 * do hook (nav-rail, barra de seleção, etc.). Sem isso, cada componente tinha
 * seu próprio `useState` e o toggle de uma instância não refletia nas outras —
 * a classe `.v2-dark` mudava, mas os estados ficavam dessincronizados, dando a
 * impressão de "não troca sem refresh".
 *
 * Persistência híbrida: localStorage (cache + anti-FOUC) + preferência do
 * usuário no servidor (`appearance.theme`) para paridade browser/APK.
 */
let current: ThemeV2 | null = null;
const listeners = new Set<(t: ThemeV2) => void>();

/** Promise module-level evita fetch duplicado entre instâncias do hook. */
let serverSyncPromise: Promise<void> | null = null;

/**
 * Geração local: capturada no início do GET de sync e incrementada só no
 * toggle. Se o usuário trocar o tema enquanto o GET está em voo, a resposta
 * antiga não sobrescreve a escolha otimista (o PATCH do toggle vence).
 */
let themeGeneration = 0;

function setThemeGlobal(next: ThemeV2) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* localStorage indisponível — ignora */
  }
  applyTheme(next);
  listeners.forEach((l) => l(next));
}

function persistThemeToServer(theme: ThemeV2) {
  if (typeof window === "undefined" || isPreviewMode()) return;
  void fetch(apiUrl("/api/profile/preferences/appearance"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
  }).catch(() => {
    /* falha de rede: tema local permanece */
  });
}

/**
 * Hidrata o tema a partir do servidor uma única vez por sessão de página.
 * - Servidor com theme → vence e atualiza localStorage/classes/listeners
 *   (exceto se houve toggle após o início desta sync).
 * - Servidor null + valor explícito em localStorage → migra via PATCH.
 * Preview mode: só local (mock incompatível).
 *
 * P1-2: o GET /api/profile/preferences vai pelo cache do React Query
 * (`fetchQuery` na key canônica da sidebar) — antes era um fetch cru
 * fora do RQ e o endpoint baixava 2× por carga fria.
 */
function ensureServerSync(qc: QueryClient): Promise<void> {
  if (serverSyncPromise) return serverSyncPromise;
  if (typeof window === "undefined" || isPreviewMode()) {
    serverSyncPromise = Promise.resolve();
    return serverSyncPromise;
  }

  const generationAtStart = themeGeneration;

  serverSyncPromise = (async () => {
    try {
      const data = await qc.fetchQuery({
        queryKey: SIDEBAR_PREFS_KEY,
        queryFn: fetchSidebarPreferences,
        staleTime: 60_000,
        // Fail-fast como o fetch cru anterior (sem o retry padrão do RQ).
        retry: false,
      });
      // Toggle (ou outra interação local) durante o GET: não sobrescrever.
      if (themeGeneration !== generationAtStart) return;

      const serverTheme = data?.appearance?.theme;
      if (serverTheme === "light" || serverTheme === "dark") {
        setThemeGlobal(serverTheme);
        return;
      }
      const explicit = readExplicitStored();
      if (explicit) {
        persistThemeToServer(explicit);
      }
    } catch {
      /* rede / parse: mantém tema local */
    }
  })();

  return serverSyncPromise;
}

export function useThemeV2() {
  const qc = useQueryClient();
  // Começa em "light" no SSR e no 1º render client (evita hydration mismatch);
  // o valor real é resolvido no efeito de mount abaixo.
  const [theme, setTheme] = useState<ThemeV2>("light");

  useEffect(() => {
    if (current === null) current = readStored();
    setTheme(current);
    applyTheme(current);

    const onChange = (t: ThemeV2) => setTheme(t);
    listeners.add(onChange);

    // Sincroniza entre abas/janelas.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStored();
      current = next;
      applyTheme(next);
      listeners.forEach((l) => l(next));
    };
    window.addEventListener("storage", onStorage);

    void ensureServerSync(qc);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [qc]);

  function toggle() {
    themeGeneration += 1;
    const base = current ?? theme;
    const next: ThemeV2 = base === "light" ? "dark" : "light";
    setThemeGlobal(next);
    persistThemeToServer(next);
  }

  return { theme, toggle };
}
