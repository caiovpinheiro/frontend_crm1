"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { LIST_CARD_ROW_CLASS } from "@/components/crm/sortable-header";
import {
  useUpdateDepartment,
  useDepartments,
} from "@/features/conversations-settings/hooks/use-departments";
import {
  useDistributionSettings,
  useUpdateDistributionSettings,
} from "@/features/distribution/hooks";
import { cn } from "@/lib/utils";

function GlassSwitch({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-50",
        checked
          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
          : "border-[var(--text-muted)]/40 bg-[var(--text-muted)]/25",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-sm transition-all",
          checked ? "right-0.5" : "left-0.5",
        )}
      />
    </button>
  );
}

/** Liga/desliga o motor (inbound, drenagem, automação, IA). */
export function DistributionEnabledToggle() {
  const settingsQuery = useDistributionSettings();
  const updateSettings = useUpdateDistributionSettings();
  const pendingEnabled = updateSettings.isPending
    ? updateSettings.variables?.enabled
    : undefined;
  const enabled = pendingEnabled ?? settingsQuery.data?.enabled ?? true;

  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", LIST_CARD_ROW_CLASS)}>
      <div className="min-w-0">
        <p className="font-display text-[14px] font-bold text-[var(--text-primary)]">
          Distribuição {enabled ? "ligada" : "desligada"}
        </p>
        <p className="mt-0.5 font-body text-[12px] text-muted-foreground">
          {enabled
            ? "Ligado: o motor atribui consultor nas conversas novas e drena a fila de espera."
            : "Desligado: ninguém é atribuído automaticamente. Clique de novo para religar."}
        </p>
      </div>
      <GlassSwitch
        checked={enabled}
        disabled={updateSettings.isPending || settingsQuery.isLoading}
        onClick={() => {
          updateSettings.mutate(
            { enabled: !enabled },
            {
              onSuccess: (data) =>
                toast.success(
                  data.enabled ? "Distribuição ligada." : "Distribuição desligada.",
                ),
              onError: (e) =>
                toast.error(
                  e instanceof Error ? e.message : "Erro ao salvar configuração.",
                ),
            },
          );
        }}
      />
    </div>
  );
}

export function AutoOnInboundToggle() {
  const settingsQuery = useDistributionSettings();
  const updateSettings = useUpdateDistributionSettings();
  const autoOnInbound = settingsQuery.data?.autoOnInbound ?? true;

  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", LIST_CARD_ROW_CLASS)}>
      <div className="min-w-0">
        <p className="font-display text-[14px] font-bold text-[var(--text-primary)]">
          Distribuir cada conversa nova automaticamente
        </p>
        <p className="mt-0.5 font-body text-[12px] text-muted-foreground">
          {autoOnInbound
            ? "Ligado: toda mensagem inbound sem responsável entra na fila de espera, mesmo sem passo na automação."
            : "Desligado: só entra na fila quem passar pelo passo Executar distribuição (automação, IA ou redistribuição manual)."}
        </p>
      </div>
      <GlassSwitch
        checked={autoOnInbound}
        disabled={updateSettings.isPending || settingsQuery.isLoading}
        onClick={() => {
          updateSettings.mutate(
            { autoOnInbound: !autoOnInbound },
            {
              onError: (e) =>
                toast.error(
                  e instanceof Error ? e.message : "Erro ao salvar configuração.",
                ),
            },
          );
        }}
      />
    </div>
  );
}

export function DepartmentsDistributionPanel() {
  const deptsQuery = useDepartments();
  const updateMut = useUpdateDepartment();
  const settingsQuery = useDistributionSettings();
  const updateSettings = useUpdateDistributionSettings();
  const depts = deptsQuery.data ?? [];
  const respectDepartment = settingsQuery.data?.respectDepartment ?? false;

  const fallbackOptions = depts.filter(
    (d) => d.distributionEnabled && (d._count?.members ?? 0) > 0,
  );
  const savedFallback = settingsQuery.data?.fallbackDepartmentId ?? null;
  const fallbackDepartmentId = fallbackOptions.some((d) => d.id === savedFallback)
    ? savedFallback!
    : "";
  const fallbackDepartmentName =
    fallbackOptions.find((d) => d.id === fallbackDepartmentId)?.name ?? null;

  if (deptsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-muted)]">
        <IconLoader2 size={18} className="animate-spin" />
        <span className="font-body text-[13px]">Carregando departamentos…</span>
      </div>
    );
  }

  if (depts.length === 0) {
    return (
      <p className="font-body text-[13px] text-[var(--text-muted)]">
        Nenhum departamento cadastrado. Crie em Configurações → Equipe →
        Departamentos.
      </p>
    );
  }

  const toggle = (id: string, next: boolean) => {
    updateMut.mutate(
      { id, distributionEnabled: next },
      {
        onError: (e) =>
          toast.error(
            e instanceof Error ? e.message : "Erro ao atualizar departamento.",
          ),
      },
    );
  };

  const toggleRespect = () => {
    updateSettings.mutate(
      { respectDepartment: !respectDepartment },
      {
        onError: (e) =>
          toast.error(
            e instanceof Error ? e.message : "Erro ao salvar configuração.",
          ),
      },
    );
  };

  const setFallbackDepartment = (next: string) => {
    if (next === fallbackDepartmentId) return;
    updateSettings.mutate(
      { fallbackDepartmentId: next || null },
      {
        onSuccess: () =>
          toast.success(
            next
              ? `Leads sem departamento vão para ${depts.find((d) => d.id === next)?.name ?? "o departamento escolhido"}.`
              : "Leads sem departamento voltam a ir para todos os elegíveis.",
          ),
        onError: (e) =>
          toast.error(
            e instanceof Error ? e.message : "Erro ao salvar configuração.",
          ),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <AutoOnInboundToggle />
      <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">
              Respeitar departamento da conversa
            </p>
            <p className="font-body text-[11.5px] text-[var(--text-muted)]">
              {respectDepartment
                ? "Ligado: conversas com departamento vão só para os membros dele."
                : "Desligado: distribuição clássica — todos os atendimentos vão para todos os elegíveis, ignorando departamento."}
            </p>
          </div>
          <GlassSwitch
            checked={respectDepartment}
            disabled={updateSettings.isPending || settingsQuery.isLoading}
            onClick={toggleRespect}
          />
        </div>

        {respectDepartment ? (
          <div className="flex flex-col gap-1.5 border-t border-[var(--glass-border)] pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[12.5px] font-semibold text-[var(--text-secondary)]">
                Sem departamento →
              </span>
              <DropdownGlass
                options={[
                  { value: "", label: "Todos os elegíveis (padrão)" },
                  ...fallbackOptions.map((d) => ({
                    value: d.id,
                    label: `${d.name} · ${d._count?.members ?? 0} membro(s)`,
                  })),
                ]}
                value={fallbackDepartmentId}
                onValueChange={setFallbackDepartment}
                disabled={updateSettings.isPending || settingsQuery.isLoading}
                triggerClassName="w-auto min-w-[240px]"
              />
            </div>
            <p className="font-body text-[11.5px] text-[var(--text-muted)]">
              {fallbackDepartmentName
                ? `Leads que chegam sem roteamento vão só para os membros de ${fallbackDepartmentName}. Se ninguém estiver disponível, esperam na fila desse departamento.`
                : "Leads que chegam sem roteamento vão para todos os elegíveis, de qualquer departamento."}
            </p>
          </div>
        ) : null}
      </div>

      <p className="font-body text-[12px] text-[var(--text-muted)]">
        Ligue para o departamento distribuir automaticamente entre seus membros os
        leads roteados a ele. Desligado = leads desse departamento ficam na fila de
        espera.
      </p>
      <div
        className={cn(
          "grid gap-2 sm:grid-cols-2 transition-opacity",
          respectDepartment ? "" : "pointer-events-none opacity-50",
        )}
      >
        {depts.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
                {d.name}
              </p>
              <p className="font-body text-[11px] text-[var(--text-muted)]">
                {d._count?.members ?? 0} membro(s)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!d.distributionEnabled}
              disabled={updateMut.isPending}
              onClick={() => toggle(d.id, !d.distributionEnabled)}
              className={cn(
                "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-50",
                d.distributionEnabled
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                  : "border-[var(--text-muted)]/40 bg-[var(--text-muted)]/25",
              )}
            >
              <span
                className={cn(
                  "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-sm transition-all",
                  d.distributionEnabled ? "right-0.5" : "left-0.5",
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Painel do drawer "Configurar" na Central de widgets (motor v2). */
export default function DistributionWidgetConfig() {
  return (
    <div className="flex flex-col gap-3">
      <DistributionEnabledToggle />
      <DepartmentsDistributionPanel />
    </div>
  );
}
