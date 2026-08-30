"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAdjustments,
  IconKey,
  IconShield,
  IconShieldCheck,
} from "@tabler/icons-react";
import { IconAlertTriangle as AlertTriangle, IconCircleCheck as CheckCircle2, IconCircle as Circle, IconLoader2 as Loader2 } from "@tabler/icons-react";

import { EmptyState } from "@/components/crm/empty-state";
import { GlassCard } from "@/components/crm/glass-card";
import OldApiTokensPage from "@/features/legacy-v1/settings/api-tokens";

import { SETTINGS_HUB_BACK, SettingsV2Shell } from "../_v2-shell";
import { SettingsHeaderNav, type SettingsTab } from "../_components/settings-tabs";
import { PermissionsPanel, type Selection } from "../permissions/client-page";

type FeatureFlagItem = {
  key: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
};

async function fetchFlags(): Promise<{ flags: FeatureFlagItem[] }> {
  const res = await fetch("/api/settings/feature-flags");
  if (!res.ok) throw new Error("Erro ao carregar flags.");
  return res.json();
}

async function toggleFlag(key: string, enabled: boolean): Promise<void> {
  const res = await fetch("/api/settings/feature-flags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, enabled }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? "Erro ao salvar.");
  }
}

const FLAG_LABELS: Record<string, { label: string; warning?: string }> = {
  permissions_v2_enabled: {
    label: "Permissões v2 (RBAC dinâmico)",
    warning:
      "Após ativar, a visibilidade de negócios e conversas passará a ser controlada pelos roles e grupos configurados. Certifique-se de que os grupos estão configurados antes de ativar.",
  },
  rbac_granular_scope_v1: {
    label: "Escopo granular de RBAC (v1)",
    warning:
      "Ativa enforcement granular por funil, etapa, campo, sidebar e canais (acesso por usuário a funis e a ver/enviar mensagens por canal) via scope-grants. Use em conjunto com a configuração de permissões.",
  },
};

const TABS: SettingsTab[] = [
  { id: "permissions", label: "Permissões", icon: IconShieldCheck },
  { id: "api", label: "API e Webhooks", icon: IconKey },
  { id: "flags", label: "Feature flags", icon: IconAdjustments },
];

export function SecurityClientPage() {
  const router = useRouter();
  const params = useSearchParams();

  const requested = params.get("tab");
  const active = TABS.some((t) => t.id === requested)
    ? (requested as string)
    : "permissions";

  const setActive = useCallback(
    (id: string) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("tab", id);
      router.replace(`/settings/security?${sp.toString()}`);
    },
    [params, router],
  );

  const [selection, setSelection] = useState<Selection>({ kind: "none" });

  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Segurança"
      description="Permissões, API e Webhooks e feature flags"
      icon={<IconShield size={22} />}
    >
      <SettingsHeaderNav tabs={TABS} active={active} onChange={setActive} />

      {active === "permissions" && (
        <PermissionsPanel
          selection={selection}
          onSelect={setSelection}
          onClear={() => setSelection({ kind: "none" })}
        />
      )}
      {active === "api" && <OldApiTokensPage />}
      {active === "flags" && <FeatureFlagsPanel />}
    </SettingsV2Shell>
  );
}

function FeatureFlagsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["settings", "feature-flags"],
    queryFn: fetchFlags,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      toggleFlag(key, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "feature-flags"] }),
  });

  if (isLoading) {
    return (
      <GlassCard className="flex items-center gap-2 p-6 text-[13px] text-[var(--text-muted)]">
        <Loader2 size={16} className="animate-spin" />
        Carregando…
      </GlassCard>
    );
  }

  if (isError || !data) {
    return (
      <GlassCard className="p-6">
        <EmptyState
          icon={<AlertTriangle size={28} className="text-[var(--color-danger)]" />}
          title="Não foi possível carregar"
          description={
            error instanceof Error
              ? error.message
              : "Verifique a conexão ou tente novamente em instantes."
          }
        />
      </GlassCard>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 space-y-4">
      <p className="font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Feature flags
      </p>
      <div className="space-y-3">
        {data.flags.map((flag) => {
          const meta = FLAG_LABELS[flag.key];
          const label = meta?.label ?? flag.key;
          const warning = meta?.warning;

          return (
            <div
              key={flag.key}
              className="min-w-0 max-w-full rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] p-3.5 shadow-[var(--glass-shadow-sm)] backdrop-blur-md sm:p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[13.5px] font-semibold text-pretty text-[var(--text-primary)]">
                      {label}
                    </span>
                    {flag.enabled ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-success)]">
                        <CheckCircle2 size={10} />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--glass-bg-strong)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                        <Circle size={10} />
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] text-pretty text-[var(--text-muted)]">
                    {flag.description}
                  </p>
                  {warning && !flag.enabled && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-warning)]/8 px-2.5 py-2 text-[12px] text-pretty text-[var(--color-warning)]">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>{warning}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ key: flag.key, enabled: !flag.enabled })
                  }
                  className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] px-3 py-1.5 font-display text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                    flag.enabled
                      ? "bg-[var(--color-danger)]/8 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/15"
                      : "bg-[var(--brand-primary)]/8 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15"
                  }`}
                >
                  {flag.enabled ? "Desativar" : "Ativar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
