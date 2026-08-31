"use client";

/**
 * Banner flutuante de "atualizações disponíveis" — estilo n8n.
 *
 * Dois estados:
 *  1. Servidor à frente do JS da aba (changelog semver maior **ou**
 *     `/api/app-revision` diferente do BUILD_ID embutido) → "Nova versão —
 *     atualizar" chama `clearWebCachesAndReload` (SW + Cache Storage + reload).
 *  2. JS já é o do deploy, changelog ainda não lido → "Novidades" + Entendi
 *     (persiste `localStorage.crm_last_seen_version`).
 *
 * Polling curto + refetch no foco: aba aberta o dia inteiro ainda descobre
 * o deploy. `/changelog.json` pode ficar no runtime cache do SW; o revision
 * é a fonte confiável de "bundle velho".
 *
 * Não exibe nada para:
 *  - usuário não autenticado
 *  - sem versão de app e sem sinal de bundle velho
 *  - changelog vazio **e** JS já atual
 *  - versão atual já marcada como vista **e** JS já atual
 */

import { useQuery } from "@tanstack/react-query";
import { IconSparkles, IconX, IconChevronUp, IconRefresh } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import * as React from "react";

import { clearWebCachesAndReload, fetchAppRevision } from "@/lib/hard-reload";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "crm_last_seen_version";
const APP_VERSION = (process.env.NEXT_PUBLIC_APP_VERSION ?? "").trim();
const CLIENT_REVISION = (process.env.NEXT_PUBLIC_BUILD_ID ?? "").trim();
const POLL_INTERVAL_MS = 3 * 60 * 1_000;

type Section = Record<string, string[]>;
type Release = {
  version: string;
  date: string | null;
  label?: string | null;
  sections: Section;
};
type ChangelogPayload = {
  releases: Release[];
  generatedAt?: string;
};

/**
 * Compara duas versões semver simples (a > b → 1, a < b → -1, igual → 0).
 * "unreleased" é sempre tratada como menor que qualquer release nomeada
 * (não queremos disparar o banner por mudanças não publicadas).
 */
function cmpVersion(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "unreleased") return -1;
  if (b === "unreleased") return 1;
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

async function fetchChangelog(): Promise<ChangelogPayload | null> {
  try {
    const res = await fetch(`/changelog.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ChangelogPayload;
  } catch {
    return null;
  }
}

function latestNamedVersion(releases: Release[]): string | null {
  let best: string | null = null;
  for (const release of releases) {
    if (release.version === "unreleased") continue;
    if (!best || cmpVersion(release.version, best) > 0) best = release.version;
  }
  return best;
}

const SECTION_LABEL: Record<string, string> = {
  feat: "Novidades",
  fix: "Correções",
  refactor: "Refatorações",
  docs: "Documentação",
  chore: "Manutenção",
  perf: "Performance",
};

const SECTION_ORDER = ["feat", "fix", "perf", "refactor", "docs", "chore"];

function ReleaseCard({ release }: { release: Release }) {
  const ordered = SECTION_ORDER.filter((k) => release.sections[k]?.length);
  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-3 shadow-sm backdrop-blur dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-subtle)]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] dark:text-slate-100">
          {release.version === "unreleased"
            ? "Em desenvolvimento"
            : `v${release.version}`}
        </h4>
        {release.date && (
          <span className="text-[11px] text-[var(--text-muted)] dark:text-[var(--text-muted)]">
            {release.date}
          </span>
        )}
      </div>
      {ordered.map((key) => (
        <div key={key} className="mt-2 first:mt-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] dark:text-[var(--text-muted)]">
            {SECTION_LABEL[key] ?? key}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[12.5px] leading-snug text-[var(--text-secondary)] dark:text-[var(--color-text-muted)]">
            {release.sections[key]!.slice(0, 5).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
            {release.sections[key]!.length > 5 && (
              <li className="list-none text-[11px] italic opacity-70">
                + {release.sections[key]!.length - 5} itens…
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function UpdateAvailableBanner() {
  const { status: sessionStatus } = useSession();
  const pollingEnabled = sessionStatus === "authenticated";

  const { data } = useQuery({
    queryKey: ["changelog"],
    queryFn: fetchChangelog,
    enabled: pollingEnabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: remoteRevision } = useQuery({
    queryKey: ["app-revision"],
    queryFn: fetchAppRevision,
    enabled: pollingEnabled && CLIENT_REVISION !== "" && CLIENT_REVISION !== "dev",
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const [lastSeen, setLastSeen] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [reloading, setReloading] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setLastSeen(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const serverVersion = data ? latestNamedVersion(data.releases) : null;
  const staleFromChangelog = Boolean(
    APP_VERSION && serverVersion && cmpVersion(serverVersion, APP_VERSION) > 0,
  );
  const staleFromRevision = Boolean(
    CLIENT_REVISION &&
      CLIENT_REVISION !== "dev" &&
      remoteRevision &&
      remoteRevision !== CLIENT_REVISION,
  );
  const needsHardReload = staleFromChangelog || staleFromRevision;

  const newReleases = (data?.releases ?? []).filter((r) => {
    if (r.version === "unreleased") return !lastSeen && !needsHardReload;
    if (needsHardReload) {
      return cmpVersion(r.version, APP_VERSION || "0") > 0;
    }
    if (cmpVersion(r.version, APP_VERSION) > 0) return false;
    if (!lastSeen) return true;
    return cmpVersion(r.version, lastSeen) > 0;
  });

  if (sessionStatus !== "authenticated") return null;
  if (hidden) return null;
  if (!needsHardReload) {
    if (!APP_VERSION) return null;
    if (!data || data.releases.length === 0) return null;
    if (lastSeen && cmpVersion(APP_VERSION, lastSeen) <= 0) return null;
    if (newReleases.length === 0) return null;
  }

  const totalItems = newReleases.reduce(
    (acc, r) =>
      acc + Object.values(r.sections).reduce((a, list) => a + list.length, 0),
    0,
  );

  const handleDismiss = () => {
    if (needsHardReload) {
      setHidden(true);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, APP_VERSION);
    }
    setLastSeen(APP_VERSION);
    setHidden(true);
  };

  const handleHardReload = () => {
    if (reloading) return;
    setReloading(true);
    void clearWebCachesAndReload();
  };

  const handleChipClick = () => {
    if (needsHardReload && newReleases.length === 0) {
      handleHardReload();
      return;
    }
    setExpanded((v) => !v);
  };

  return (
    <div
      className="fixed bottom-4 left-[5.5rem] z-(--z-sheet) flex flex-col items-start gap-2"
      role="region"
      aria-label="Atualizações disponíveis"
    >
      {expanded && (
        <div
          className={cn(
            "max-h-[70vh] w-[min(420px,calc(100vw-2rem))] overflow-auto rounded-2xl border p-3 shadow-2xl",
            "border-[var(--glass-border)] bg-[var(--glass-bg-base)] backdrop-blur-xl",
            "dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-strong)]/80",
          )}
          style={{
            background: "var(--glass-bg-overlay, rgba(255,255,255,0.85))",
            boxShadow: "var(--glass-shadow, 0 20px 60px rgba(0,0,0,0.18))",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconSparkles size={18} className="text-[var(--brand-primary)]" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)] dark:text-slate-100">
                {needsHardReload
                  ? staleFromChangelog && serverVersion
                    ? `Nova versão — v${serverVersion}`
                    : "Nova versão disponível"
                  : `Novidades em v${APP_VERSION}`}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Fechar"
              className="rounded-md p-1 text-[var(--text-muted)] hover:bg-black/5 dark:text-[var(--text-faint)] dark:hover:bg-[var(--glass-bg-subtle)]"
            >
              <IconX size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {newReleases.map((r) => (
              <ReleaseCard key={r.version} release={r} />
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            {needsHardReload ? (
              <button
                type="button"
                onClick={handleHardReload}
                disabled={reloading}
                className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-primary)]/90 active:scale-[0.98] disabled:opacity-70"
              >
                {reloading ? "Atualizando…" : "Atualizar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-primary)]/90 active:scale-[0.98]"
              >
                Entendi
              </button>
            )}
          </div>
        </div>
      )}

      {/*
        O chip é um container `<div>` com DOIS botões reais lado a lado:
        toggle (expandir/recolher) e dismiss (X). Não dá pra aninhar
        `<button>` dentro de `<button>` (HTML inválido) — por isso a
        divisão. O X chama `handleDismiss` direto, que persiste a versão
        em localStorage e remove o banner permanentemente até a próxima
        release.
      */}
      <div
        className={cn(
          "group inline-flex items-stretch overflow-hidden rounded-full border shadow-lg backdrop-blur-md transition",
          "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-primary)] hover:bg-white",
          "dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-strong)]/80 dark:text-slate-100 dark:hover:bg-[var(--glass-bg-strong)]",
        )}
      >
        <button
          type="button"
          onClick={handleChipClick}
          disabled={reloading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium disabled:opacity-70"
          aria-expanded={expanded}
          aria-controls="update-banner-panel"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-primary)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
          </span>
          {needsHardReload ? (
            <IconRefresh size={16} className="text-[var(--brand-primary)]" />
          ) : (
            <IconSparkles size={16} className="text-[var(--brand-primary)]" />
          )}
          <span>
            {needsHardReload ? (
              reloading ? (
                "Atualizando…"
              ) : staleFromChangelog && serverVersion ? (
                <>
                  Nova versão — <strong>v{serverVersion}</strong>
                </>
              ) : (
                <>
                  Nova versão — <strong>atualizar</strong>
                </>
              )
            ) : (
              <>
                Novidades em <strong>v{APP_VERSION}</strong>
              </>
            )}
          </span>
          {totalItems > 0 && (
            <span className="rounded-full bg-[var(--brand-primary)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand-primary)] dark:bg-[var(--brand-primary)]/20 dark:text-[var(--brand-primary)]">
              {totalItems}
            </span>
          )}
          {!(needsHardReload && newReleases.length === 0) && (
            <IconChevronUp
              size={14}
              className={cn(
                "text-[var(--text-muted)] transition-transform",
                expanded && "rotate-180",
              )}
            />
          )}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label={needsHardReload ? "Dispensar nesta sessão" : "Dispensar e não mostrar mais"}
          title={needsHardReload ? "Esconder até recarregar a página" : "Não mostrar mais esta versão"}
          className={cn(
            "inline-flex items-center justify-center border-l px-2.5 text-[var(--text-muted)] transition-colors",
            "border-[var(--glass-border)] hover:bg-black/5 hover:text-[var(--text-secondary)]",
            "dark:border-[var(--glass-border-subtle)] dark:hover:bg-[var(--glass-bg-subtle)] dark:hover:text-slate-100",
          )}
        >
          <IconX size={14} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
