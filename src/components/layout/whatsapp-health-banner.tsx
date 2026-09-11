"use client";

import { apiUrl } from "@/lib/api";
/**
 * Banner global de saúde do número WhatsApp Business.
 *
 * Roda em TODO o dashboard (montado uma vez no DashboardShell) e fica
 * invisível quando o número está saudável ou a integração não está
 * configurada. Quando a Meta reporta FLAGGED, RESTRICTED, quality
 * YELLOW/RED ou qualquer estado que impede entrega silenciosa, o banner
 * aparece no topo do `<main>` com cor amarela (warning) ou vermelha
 * (critical) e link pro painel da Meta.
 *
 * Polling moderado (2 min) + revalidação em foco. Admin/manager pode
 * forçar refresh com `?force=1` (botão "Reverificar").
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertTriangle as AlertTriangle, IconExternalLink as ExternalLink, IconRefresh as RefreshCw, IconShieldExclamation as ShieldAlert, IconX as X } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import type { WhatsAppHealthStatus } from "@/services/whatsapp-health";

const DISMISS_KEY_PREFIX = "whatsapp-health-dismissed:";
const DISMISS_TTL_MS = 30 * 60 * 1_000;

async function fetchHealth(force = false): Promise<WhatsAppHealthStatus> {
  const qs = force ? "?force=1" : "";
  const res = await fetch(apiUrl(`/api/whatsapp/health${qs}`), { cache: "no-store" });
  if (!res.ok) {
    return {
      reachable: false,
      severity: "unknown",
      message: "Falha ao consultar saúde do número.",
      reasons: [],
      configured: false,
      checkedAt: null,
      raw: null,
    };
  }
  return (await res.json()) as WhatsAppHealthStatus;
}

function dismissKey(raw: WhatsAppHealthStatus | null | undefined): string | null {
  if (!raw) return null;
  const sig = [
    raw.severity,
    raw.raw?.quality_rating ?? "",
    raw.raw?.status ?? "",
    raw.raw?.name_status ?? "",
  ].join("|");
  return DISMISS_KEY_PREFIX + sig;
}

function wasDismissed(raw: WhatsAppHealthStatus | null | undefined): boolean {
  if (typeof window === "undefined") return false;
  const key = dismissKey(raw);
  if (!key) return false;
  const raw2 = window.sessionStorage.getItem(key);
  if (!raw2) return false;
  const ts = Number.parseInt(raw2, 10);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_TTL_MS;
}

function setDismissed(raw: WhatsAppHealthStatus | null | undefined): void {
  if (typeof window === "undefined") return;
  const key = dismissKey(raw);
  if (!key) return;
  window.sessionStorage.setItem(key, String(Date.now()));
}

export function WhatsAppHealthBanner() {
  const { data: session, status: sessionStatus } = useSession();
  const qc = useQueryClient();
  const visible = useDocumentVisible();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canForce = role === "ADMIN" || role === "MANAGER";

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["whatsapp-health"],
    queryFn: () => fetchHealth(false),
    enabled: sessionStatus === "authenticated",
    refetchInterval: visible ? 2 * 60 * 1_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    setHidden(wasDismissed(data));
  }, [data]);

  if (!data) return null;
  if (!data.configured) return null;
  if (data.severity === "ok" || data.severity === "unknown") return null;
  if (hidden) return null;

  const isCritical = data.severity === "error";
  const Icon = isCritical ? ShieldAlert : AlertTriangle;

  const handleForce = async () => {
    if (!canForce) return;
    try {
      await fetchHealth(true);
    } finally {
      await qc.invalidateQueries({ queryKey: ["whatsapp-health"] });
      await refetch();
    }
  };

  const handleDismiss = () => {
    setDismissed(data);
    setHidden(true);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "mb-3 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm",
        isCritical
          ? "border-[var(--color-danger)]/60 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
          : "border-[var(--color-warn)]/60 bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", isCritical ? "text-[var(--color-danger-text)] dark:text-red-300" : "text-[var(--color-warn)] dark:text-[var(--color-amber-muted)]")} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">
          {isCritical ? "WhatsApp com problema crítico" : "WhatsApp com aviso"}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug opacity-95">{data.message}</p>
        {data.reasons.length > 1 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] opacity-90">
            {data.reasons.slice(1, 4).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a
            href="https://business.facebook.com/wa/manage/phone-numbers/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold underline-offset-2 hover:underline",
              isCritical ? "text-[var(--color-danger-text)] dark:text-red-200" : "text-[var(--color-warn-text)] dark:text-[var(--color-warning)]/70",
            )}
          >
            Abrir painel da Meta
            <ExternalLink className="size-3" />
          </a>
          {canForce && (
            <button
              type="button"
              onClick={handleForce}
              disabled={isFetching}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-semibold",
                isCritical
                  ? "border-[var(--color-danger)]/60 bg-[var(--glass-bg-overlay)] text-[var(--color-danger-text)] hover:bg-[var(--color-bg-card)] dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                  : "border-[var(--color-warn)]/60 bg-[var(--glass-bg-overlay)] text-[var(--color-warn-text)] hover:bg-[var(--color-bg-card)] dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
                isFetching && "opacity-60",
              )}
            >
              <RefreshCw className={cn("size-3", isFetching && "animate-spin")} />
              Reverificar agora
            </button>
          )}
          {data.checkedAt && (
            <span className="text-[11px] opacity-70">
              Última verificação: {new Date(data.checkedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
      <TooltipGlass label="Silenciar por 30 minutos" side="left">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Silenciar aviso por 30 minutos"
          className={cn(
            "-mr-1 -mt-1 rounded-md p-1 hover:bg-black/5 dark:hover:bg-[var(--glass-bg-subtle)]",
            isCritical ? "text-[var(--color-danger-text)] dark:text-red-200" : "text-[var(--color-warn)] dark:text-[var(--color-warning)]/70",
          )}
        >
          <X className="size-4" />
        </button>
      </TooltipGlass>
    </div>
  );
}
