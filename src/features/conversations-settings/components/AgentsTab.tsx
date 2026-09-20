"use client";

import * as React from "react";
import {
  IconUser,
  IconUsers,
  IconEye,
  IconEyeOff,
  IconArrowsExchange,
  IconCircleCheck,
  IconTrash,
  IconMessageCircle,
  IconLink,
  IconLayoutGrid,
  IconShieldCheck,
  IconInfoCircle,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconSearch,
  IconChevronDown,
  IconSparkles,
  IconDeviceFloppy,
} from "@tabler/icons-react";
import { ButtonGlass } from "@/components/crm/button-glass";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/crm/kpi-card";

import { SwitchGlass } from "@/components/crm/switch-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import {
  useAgentList,
  useSaveAgentPermissions,
  DEFAULT_PERMISSIONS,
  type AgentWithPermissions,
  type AgentPermissions,
} from "../hooks/use-agent-permissions";
import { useDepartments, type Department } from "../hooks/use-departments";

// ─── Channels hook ────────────────────────────────────────────────────────────

type Channel = { id: string; name: string; type: string; provider: string };

function useChannels() {
  return useQuery<Channel[]>({
    queryKey: ["settings", "channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.channels) ? data.channels : [];
    },
    staleTime: 60_000,
  });
}

// ─── Preset models ────────────────────────────────────────────────────────────

const PRESETS: Record<string, Partial<AgentPermissions>> = {
  standard: {
    canViewOtherAgentsConversations: false,
    disableConversationsWithoutAgent: false,
    canTransferConversation: true,
    canCloseConversation: true,
    canDeleteConversation: false,
    canManageQuickMessages: false,
    canConfigureFieldVisibility: false,
  },
  supervisor: {
    canViewOtherAgentsConversations: true,
    disableConversationsWithoutAgent: false,
    canTransferConversation: true,
    canCloseConversation: true,
    canDeleteConversation: true,
    canManageQuickMessages: true,
    canConfigureFieldVisibility: true,
  },
  readonly: {
    canViewOtherAgentsConversations: false,
    disableConversationsWithoutAgent: true,
    canTransferConversation: false,
    canCloseConversation: false,
    canDeleteConversation: false,
    canManageQuickMessages: false,
    canConfigureFieldVisibility: false,
  },
};

const PRESET_OPTIONS = [
  { value: "custom",    label: "Personalizado" },
  { value: "standard",  label: "Atendente padrão" },
  { value: "supervisor", label: "Supervisor" },
  { value: "readonly",  label: "Somente leitura" },
];

// ─── Preset group descriptions ────────────────────────────────────────────────

const PRESET_GROUP_META: Record<string, { label: string; desc: string; color: string; bg: string }> = {
  standard:  { label: "Atendente padrão", desc: "Tranferir e encerrar, sem ver outras conversas.",   color: "text-emerald-700",  bg: "bg-emerald-50" },
  supervisor: { label: "Supervisor",       desc: "Visão total, pode excluir e gerir mensagens rápidas.", color: "text-violet-700",  bg: "bg-violet-50" },
  readonly:  { label: "Somente leitura",  desc: "Apenas visualização, sem poder agir.",             color: "text-amber-700",   bg: "bg-amber-50" },
  custom:    { label: "Personalizado",    desc: "Permissões definidas individualmente.",            color: "text-slate-600",   bg: "bg-slate-50" },
};

function detectPreset(perms: AgentPermissions | null): string {
  if (!perms) return "custom";
  for (const [key, preset] of Object.entries(PRESETS)) {
    if (
      Object.entries(preset).every(
        ([k, v]) => (perms as Record<string, unknown>)[k] === v,
      )
    ) return key;
  }
  return "custom";
}

// ─── Avatar color ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#5B57F0", "#D97706", "#0F766E", "#BE185D", "#1C2030",
  "#7C3AED", "#DC2626", "#2563EB", "#16A34A", "#0891B2",
];

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function roleBadgeLabel(role: string) {
  if (role === "ADMIN") return "Admin";
  if (role === "SUPERVISOR") return "Supervisor";
  return "Atendente";
}

// ─── Chip checkbox ────────────────────────────────────────────────────────────

function Chip({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 py-1.5 font-body text-[12.5px] font-medium transition-all",
        checked
          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-panel)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)]",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <div
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
          checked
            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
            : "border-[var(--glass-border)] bg-white",
        )}
      >
        {checked && <IconCheck size={9} strokeWidth={3} className="text-white" />}
      </div>
      {label}
    </button>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function PermGroup({
  title,
  desc,
  iconBg,
  iconColor,
  icon: Icon,
  children,
}: {
  title: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)]">
      <div className="flex items-center gap-3 px-3 py-4 sm:px-5">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]", iconBg, iconColor)}>
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-[14px] font-bold text-pretty text-[var(--text-primary)]">{title}</h3>
          <p className="font-body text-[12px] text-pretty text-[var(--text-muted)]">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Permission row ───────────────────────────────────────────────────────────

function PermRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  desc,
  dangerTag,
  checked,
  onChange,
  disabled,
  children,
}: {
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  label: string;
  desc: string;
  dangerTag?: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--glass-border-subtle)]">
      <div className="flex items-start gap-3 px-3 py-3.5 sm:px-5">
        <div className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
          iconBg || "bg-[var(--glass-bg-strong)]",
          iconColor || "text-[var(--text-muted)]",
        )}>
          <Icon size={15} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[13.5px] font-semibold text-pretty text-[var(--text-primary)]">{label}</span>
            {dangerTag && (
              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 font-display text-[10px] font-bold tracking-wide text-red-600">
                Irreversível
              </span>
            )}
          </div>
          <p className="mt-0.5 break-words font-body text-[12.5px] leading-relaxed text-[var(--text-muted)]">{desc}</p>
        </div>
        <SwitchGlass checked={checked} onChange={onChange} disabled={disabled} size="sm" aria-label={label} className="mt-0.5 shrink-0" />
      </div>
      {children}
    </div>
  );
}

// ─── Accordion ────────────────────────────────────────────────────────────────

function Accordion({
  icon: Icon,
  title,
  desc,
  defaultOpen,
  children,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  return (
    <div className="border-t border-[var(--glass-border-subtle)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3.5 text-left transition-colors hover:bg-[var(--glass-bg-overlay)] sm:px-5"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--glass-bg-strong)] text-[var(--text-muted)]">
          <Icon size={15} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[13.5px] font-semibold text-pretty text-[var(--text-primary)]">{title}</p>
          <p className="break-words font-body text-[12px] text-[var(--text-muted)]">{desc}</p>
        </div>
        <IconChevronDown size={16} className={cn("shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="min-w-0 px-3 pb-5 pt-1 sm:px-5 sm:pl-[4.5rem]">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Summary sidebar ──────────────────────────────────────────────────────────

function SummaryCard({
  agent,
  draft,
  channels,
  departments,
}: {
  agent: AgentWithPermissions;
  draft: AgentPermissions;
  channels: Channel[];
  departments: Department[];
}) {
  const firstName = agent.name.split(" ")[0];
  const limitConn = draft.allowedConnectionIds.length > 0;
  const limitDept = draft.allowedDepartmentIds.length > 0;

  const items = [
    {
      ok: draft.canViewOtherAgentsConversations,
      text: draft.canViewOtherAgentsConversations
        ? "Vê conversas de todos os atendentes"
        : `Vê apenas as conversas atribuídas a ${firstName}`,
    },
    {
      ok: draft.canTransferConversation,
      text: draft.canTransferConversation
        ? "Pode transferir conversas para outra pessoa ou depto."
        : "Não pode transferir conversas",
    },
    {
      ok: draft.canCloseConversation,
      text: draft.canCloseConversation
        ? "Pode fechar e resolver conversas"
        : "Não pode fechar conversas",
    },
    {
      risk: draft.canDeleteConversation,
      text: draft.canDeleteConversation
        ? "Pode excluir conversas permanentemente"
        : "Não pode excluir conversas",
    },
    {
      ok: draft.canManageQuickMessages,
      text: draft.canManageQuickMessages
        ? "Pode editar as mensagens rápidas da equipe"
        : "Não edita mensagens rápidas",
    },
    {
      ok: draft.canConfigureFieldVisibility,
      text: draft.canConfigureFieldVisibility
        ? "Pode exibir/ocultar campos nos painéis"
        : "Não configura visibilidade de campos",
    },
    {
      ok: !limitConn,
      text: limitConn
        ? `Acesso restrito a ${draft.allowedConnectionIds.length} de ${channels.length} conexão(ões)`
        : "Acesso liberado a todas as conexões",
    },
    {
      ok: !limitDept,
      text: limitDept
        ? `Atende ${draft.allowedDepartmentIds.length} de ${departments.length} departamento(s)`
        : "Acesso liberado a todos os departamentos",
    },
  ];

  return (
    <div className="flex flex-col gap-4 2xl:sticky 2xl:top-0">
      {/* Summary card */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)]">
        <div className="border-b border-[var(--glass-border-subtle)] px-4 py-3">
          <h4 className="flex items-center gap-2 font-display text-[13px] font-bold text-[var(--text-primary)]">
            <IconSparkles size={14} className="text-[var(--brand-primary)]" />
            O que {firstName} pode fazer
          </h4>
          <p className="mt-0.5 font-body text-[11.5px] text-[var(--text-muted)]">
            Resumo atualizado em tempo real
          </p>
        </div>
        <div className="divide-y divide-[var(--glass-border-subtle)] px-4">
          {items.map((item, i) => {
            const isRisk = item.risk && draft.canDeleteConversation;
            const isOk = !isRisk && item.ok;
            return (
              <div key={i} className="flex items-start gap-2.5 py-2.5">
                <div className={cn(
                  "mt-0.5 shrink-0",
                  isRisk ? "text-red-500" : isOk ? "text-[var(--color-success,#16a34a)]" : "text-[var(--text-muted)]",
                )}>
                  {isRisk
                    ? <IconAlertTriangle size={13} strokeWidth={2} />
                    : isOk
                      ? <IconCheck size={13} strokeWidth={2.5} />
                      : <IconX size={13} strokeWidth={2.5} />
                  }
                </div>
                <span className={cn(
                  "font-body text-[12.5px] leading-snug",
                  isRisk ? "font-semibold text-red-600" : "text-[var(--text-primary)]",
                )}>
                  {item.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tip */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/8 px-4 py-3.5">
        <p className="flex items-center gap-2 font-display text-[12.5px] font-bold text-[var(--brand-primary)]">
          <IconInfoCircle size={14} /> Dica
        </p>
        <p className="mt-1.5 font-body text-[12px] leading-relaxed text-[var(--brand-primary)]/80">
          Comece por um modelo pronto no topo da página e ajuste só o que for diferente — é mais rápido do que configurar item a item.
        </p>
      </div>
    </div>
  );
}

// ─── Permissions panel ────────────────────────────────────────────────────────

function PermissionsPanel({ agent }: { agent: AgentWithPermissions }) {
  const isAdmin = agent.role === "ADMIN";
  const saved = agent.permissions ?? DEFAULT_PERMISSIONS;

  const [draft, setDraft] = React.useState<AgentPermissions>({ ...DEFAULT_PERMISSIONS, ...saved });
  const [preset, setPreset] = React.useState("custom");

  const { data: channels = [] } = useChannels();
  const { data: departments = [] } = useDepartments();

  React.useEffect(() => {
    setDraft({ ...DEFAULT_PERMISSIONS, ...saved });
    setPreset("custom");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id, agent.permissions]);

  const isDirty = React.useMemo(() => {
    const base = { ...DEFAULT_PERMISSIONS, ...saved };
    return JSON.stringify(draft) !== JSON.stringify(base);
  }, [draft, saved]);

  const saveMutation = useSaveAgentPermissions(agent.id);

  function toggle(key: keyof AgentPermissions) {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
    setPreset("custom");
  }

  function applyPreset(value: string) {
    setPreset(value);
    if (value !== "custom" && PRESETS[value]) {
      setDraft((prev) => ({ ...prev, ...PRESETS[value] }));
    }
  }

  // Connection scope
  const limitConnections = draft.allowedConnectionIds.length > 0;
  function toggleLimitConnections() {
    setDraft((prev) => ({
      ...prev,
      allowedConnectionIds: limitConnections ? [] : channels.map((c) => c.id),
    }));
    setPreset("custom");
  }
  function toggleConnectionId(id: string) {
    setDraft((prev) => {
      const ids = prev.allowedConnectionIds;
      return { ...prev, allowedConnectionIds: ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id] };
    });
    setPreset("custom");
  }

  // Department scope
  const limitDepartments = draft.allowedDepartmentIds.length > 0;
  function toggleLimitDepartments() {
    setDraft((prev) => ({
      ...prev,
      allowedDepartmentIds: limitDepartments ? [] : departments.map((d: Department) => d.id),
    }));
    setPreset("custom");
  }
  function toggleDepartmentId(id: string) {
    setDraft((prev) => {
      const ids = prev.allowedDepartmentIds;
      return { ...prev, allowedDepartmentIds: ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id] };
    });
    setPreset("custom");
  }

  const color = avatarColor(agent.id);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ── Profile card ── */}
      <div className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full font-display text-[15px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {getInitials(agent.name)}
            </div>
            <span className={cn(
              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--glass-bg-panel)]",
              agent.isOnline ? "bg-green-500" : "bg-[var(--text-muted)]",
            )} />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] font-bold text-pretty text-[var(--text-primary)]">{agent.name}</p>
            <p className="truncate font-body text-[13px] text-[var(--text-muted)]">{agent.email}</p>
          </div>
        </div>

        {/* Preset selector */}
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <span className="shrink-0 font-body text-[12px] text-[var(--text-muted)]">Modelo</span>
          <DropdownGlass
            options={PRESET_OPTIONS}
            value={preset}
            onValueChange={applyPreset}
            disabled={isAdmin}
            triggerClassName="w-40 text-[13px] sm:w-44"
          />
        </div>
      </div>

      {/* ── Admin alert ── */}
      {isAdmin && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/8 px-4 py-3">
          <IconInfoCircle size={16} className="mt-0.5 shrink-0 text-[var(--brand-primary)]" />
          <p className="font-body text-[13px] text-[var(--brand-primary)]">
            Permissões não são aplicadas a administradores — eles sempre têm acesso total.
          </p>
        </div>
      )}

      {/* ── 2-column: permissions + summary ──
          Resumo só na direita em telas realmente largas (≥1536px). Em
          telas médias empilha embaixo pra evitar o corte. */}
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_260px]">
        {/* Left: permission groups */}
        <div className="flex flex-col gap-4">
          {/* VISIBILIDADE */}
          <PermGroup
            title="Visibilidade"
            desc="Quais conversas esse atendente consegue ver"
            icon={IconEye}
            iconBg="bg-[var(--brand-primary)]/12"
            iconColor="text-[var(--brand-primary)]"
          >
            <PermRow
              icon={IconUsers}
              label="Ver conversas de outros atendentes"
              desc="Permite visualizar conversas atribuídas a outras pessoas da equipe, não só as próprias."
              checked={draft.canViewOtherAgentsConversations}
              onChange={() => toggle("canViewOtherAgentsConversations")}
              disabled={isAdmin}
            />
            <PermRow
              icon={IconEyeOff}
              label="Ocultar conversas sem atendente"
              desc="Conversas que ainda não têm ninguém responsável ficam fora da fila desse atendente."
              checked={draft.disableConversationsWithoutAgent}
              onChange={() => toggle("disableConversationsWithoutAgent")}
              disabled={isAdmin}
            />
          </PermGroup>

          {/* AÇÕES PERMITIDAS */}
          <PermGroup
            title="Ações permitidas"
            desc="O que o atendente pode fazer dentro de uma conversa"
            icon={IconShieldCheck}
            iconBg="bg-green-100"
            iconColor="text-green-700"
          >
            <PermRow
              icon={IconArrowsExchange}
              label="Transferir conversa"
              desc="Pode encaminhar uma conversa para outro atendente ou departamento."
              checked={draft.canTransferConversation}
              onChange={() => toggle("canTransferConversation")}
              disabled={isAdmin}
            />
            <PermRow
              icon={IconCircleCheck}
              label="Fechar / resolver conversa"
              desc="Pode marcar uma conversa como resolvida e encerrar o atendimento."
              checked={draft.canCloseConversation}
              onChange={() => toggle("canCloseConversation")}
              disabled={isAdmin}
            />
            <PermRow
              icon={IconTrash}
              iconBg={draft.canDeleteConversation ? "bg-red-50" : undefined}
              iconColor={draft.canDeleteConversation ? "text-red-500" : undefined}
              label="Excluir conversa"
              desc="Apaga a conversa e seu histórico permanentemente. Não é possível desfazer."
              dangerTag
              checked={draft.canDeleteConversation}
              onChange={() => toggle("canDeleteConversation")}
              disabled={isAdmin}
            >
              {draft.canDeleteConversation && (
                <div className="mx-5 mb-3 ml-[4.5rem] flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <IconAlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="font-body text-[12px] leading-relaxed text-amber-700">
                    Com essa opção ativa, {agent.name.split(" ")[0]} poderá apagar conversas de forma definitiva. Considere liberar apenas para líderes de equipe.
                  </p>
                </div>
              )}
            </PermRow>
            <PermRow
              icon={IconMessageCircle}
              label="Gerenciar mensagens rápidas"
              desc="Pode criar, editar e excluir os atalhos de mensagens rápidas da equipe."
              checked={draft.canManageQuickMessages}
              onChange={() => toggle("canManageQuickMessages")}
              disabled={isAdmin}
            />
            <PermRow
              icon={IconEye}
              label="Configurar visibilidade de campos"
              desc="Pode exibir ou ocultar campos personalizados nos painéis de inbox e negócio."
              checked={draft.canConfigureFieldVisibility}
              onChange={() => toggle("canConfigureFieldVisibility")}
              disabled={isAdmin}
            />
          </PermGroup>

          {/* ACESSOS */}
          <PermGroup
            title="Escopos de acesso"
            desc="Limite quais conexões e departamentos este atendente enxerga"
            icon={IconLink}
            iconBg="bg-[var(--glass-bg-strong)]"
            iconColor="text-[var(--text-muted)]"
          >
            {/* Accordion: Conexões */}
            <Accordion
              icon={IconLink}
              title={limitConnections
                ? `Conexões · acesso a ${draft.allowedConnectionIds.length} de ${channels.length}`
                : "Conexões · acesso a todas"}
              desc="Quais canais (WhatsApp, Instagram, etc.) esse atendente enxerga"
              defaultOpen={limitConnections}
            >
              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--glass-bg-overlay)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-display text-[13px] font-semibold text-pretty text-[var(--text-primary)]">
                    Limitar acesso por conexões específicas
                  </p>
                  <p className="break-words font-body text-[11.5px] text-[var(--text-muted)]">
                    Quando ativo, o atendente só vê as conexões marcadas abaixo.
                  </p>
                </div>
                <SwitchGlass checked={limitConnections} onChange={toggleLimitConnections} disabled={isAdmin} size="sm" className="shrink-0 self-end sm:self-auto" />
              </div>
              {channels.length > 0 ? (
                <div className={cn("mt-3 flex flex-wrap gap-2 transition-opacity", !limitConnections && "pointer-events-none opacity-40")}>
                  {channels.map((ch) => (
                    <Chip
                      key={ch.id}
                      label={ch.name}
                      checked={draft.allowedConnectionIds.includes(ch.id)}
                      onChange={() => toggleConnectionId(ch.id)}
                      disabled={isAdmin || !limitConnections}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 font-body text-[12px] text-[var(--text-muted)]">Nenhuma conexão disponível.</p>
              )}
            </Accordion>

            {/* Accordion: Departamentos */}
            <Accordion
              icon={IconLayoutGrid}
              title={limitDepartments
                ? `Departamentos · acesso a ${draft.allowedDepartmentIds.length} de ${departments.length}`
                : "Departamentos · acesso a todos"}
              desc="Quais equipes esse atendente pode atender"
              defaultOpen={limitDepartments}
            >
              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--glass-bg-overlay)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-display text-[13px] font-semibold text-pretty text-[var(--text-primary)]">
                    Limitar acesso por departamentos específicos
                  </p>
                  <p className="break-words font-body text-[11.5px] text-[var(--text-muted)]">
                    Quando ativo, o atendente só atende os departamentos marcados abaixo.
                  </p>
                </div>
                <SwitchGlass checked={limitDepartments} onChange={toggleLimitDepartments} disabled={isAdmin} size="sm" className="shrink-0 self-end sm:self-auto" />
              </div>
              {departments.length > 0 ? (
                <div className={cn("mt-3 flex flex-wrap gap-2 transition-opacity", !limitDepartments && "pointer-events-none opacity-40")}>
                  {departments.map((dept: Department) => (
                    <Chip
                      key={dept.id}
                      label={dept.name}
                      checked={draft.allowedDepartmentIds.includes(dept.id)}
                      onChange={() => toggleDepartmentId(dept.id)}
                      disabled={isAdmin || !limitDepartments}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 font-body text-[12px] text-[var(--text-muted)]">Nenhum departamento cadastrado.</p>
              )}
            </Accordion>
          </PermGroup>
        </div>

        {/* Right: summary */}
        <SummaryCard agent={agent} draft={draft} channels={channels} departments={departments} />
      </div>

      {/* ── Save footer (DS v2 padrão) ── */}
      {isDirty && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-4 py-3 shadow-[var(--glass-shadow)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
            <span className="font-display text-[13px] font-medium text-[var(--text-secondary)]">
              Alterações não salvas
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ButtonGlass
              variant="glass"
              size="sm"
              type="button"
              onClick={() => { setDraft({ ...DEFAULT_PERMISSIONS, ...saved }); setPreset("custom"); }}
            >
              Descartar
            </ButtonGlass>
            <ButtonGlass
              variant="primary"
              size="sm"
              type="button"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <IconDeviceFloppy size={14} />
              {saveMutation.isPending ? "Salvando…" : "Salvar permissões"}
            </ButtonGlass>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent list item ──────────────────────────────────────────────────────────

function AgentListItem({
  agent,
  isSelected,
  onClick,
}: {
  agent: AgentWithPermissions;
  isSelected: boolean;
  onClick: () => void;
}) {
  const color = avatarColor(agent.id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors",
        isSelected ? "bg-[var(--brand-primary)]/10" : "hover:bg-[var(--glass-bg-overlay)]",
      )}
    >
      <div className="relative shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full font-display text-[12px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {getInitials(agent.name)}
        </div>
        <span className={cn(
          "absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-[var(--glass-bg-panel)]",
          agent.isOnline ? "bg-green-500" : "bg-[var(--text-muted)]",
        )} />
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn(
          "truncate font-display text-[13px] font-semibold",
          isSelected ? "text-[var(--brand-primary)]" : "text-[var(--text-primary)]",
        )}>
          {agent.name}
        </p>
        <p className="truncate font-body text-[11.5px] text-[var(--text-muted)]">{agent.email}</p>
      </div>

      <span className={cn(
        "shrink-0 rounded-full px-2 py-0.5 font-display text-[10px] font-bold",
        agent.role === "ADMIN"
          ? "bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]"
          : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
      )}>
        {roleBadgeLabel(agent.role)}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Groups view ──────────────────────────────────────────────────────────────

function GroupsView({
  agents,
  onSelectAgent,
}: {
  agents: AgentWithPermissions[];
  onSelectAgent: (id: string) => void;
}) {
  const [expandedGroup, setExpandedGroup] = React.useState<string | null>("standard");
  const saveMutation = useSaveAgentBulkPreset();

  const grouped = React.useMemo(() => {
    const map: Record<string, AgentWithPermissions[]> = {
      standard: [], supervisor: [], readonly: [], custom: [],
    };
    for (const a of agents) {
      const key = detectPreset(a.permissions);
      map[key].push(a);
    }
    return map;
  }, [agents]);

  return (
    <div className="flex flex-col gap-2 p-1">
      {(["standard", "supervisor", "readonly", "custom"] as const).map((key) => {
        const meta = PRESET_GROUP_META[key];
        const members = grouped[key] ?? [];
        const isOpen = expandedGroup === key;
        return (
          <div key={key} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white/80 shadow-[0_1px_3px_rgba(100,130,180,0.07)]">
            {/* Group header — compacto */}
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--glass-bg-overlay)]"
              onClick={() => setExpandedGroup(isOpen ? null : key)}
            >
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]", meta.bg, meta.color)}>
                <IconShieldCheck size={14} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-display text-[12.5px] font-bold leading-tight", meta.color)}>{meta.label}</p>
                <p className="mt-0.5 line-clamp-2 font-body text-[10.5px] leading-tight text-[var(--text-muted)]">{meta.desc}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-display text-[11px] font-bold", meta.bg, meta.color)}>
                {members.length}
              </span>
              <IconChevronDown size={14} className={cn("shrink-0 text-[var(--text-muted)] transition-transform", isOpen && "rotate-180")} />
            </button>

            {/* Members list */}
            {isOpen && (
              <div className="border-t border-[var(--glass-border-subtle)]">
                {members.length === 0 ? (
                  <p className="px-4 py-3 font-body text-[12.5px] text-[var(--text-muted)]">
                    Nenhum atendente neste grupo.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col divide-y divide-[var(--glass-border-subtle)]">
                      {members.map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-overlay)]"
                          onClick={() => onSelectAgent(agent.id)}
                        >
                          <div className="relative shrink-0">
                            {agent.avatarUrl ? (
                              <img src={agent.avatarUrl} className="h-7 w-7 rounded-full object-cover" alt={agent.name} />
                            ) : (
                              <span
                                className="flex h-7 w-7 items-center justify-center rounded-full font-display text-[11px] font-bold text-white"
                                style={{ background: avatarColor(agent.id) }}
                              >
                                {getInitials(agent.name)}
                              </span>
                            )}
                            <span className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white",
                              agent.isOnline ? "bg-emerald-400" : "bg-slate-300",
                            )} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-[12.5px] font-semibold text-[var(--text-primary)]">{agent.name}</p>
                            <p className="truncate font-body text-[11px] text-[var(--text-muted)]">{agent.email}</p>
                          </div>
                          <IconChevronDown size={12} className="-rotate-90 text-[var(--text-muted)] opacity-40" />
                        </button>
                      ))}
                    </div>
                    {key !== "custom" && (
                      <div className="border-t border-[var(--glass-border-subtle)] px-4 py-2.5">
                        <button
                          type="button"
                          disabled={saveMutation.isPending}
                          onClick={() =>
                            saveMutation.mutate(
                              members.map((a) => a.id),
                              PRESETS[key],
                            )
                          }
                          className={cn(
                            "flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1.5 font-display text-[12px] font-semibold transition-all",
                            meta.bg, meta.color, "border-current/25 hover:opacity-80",
                          )}
                        >
                          <IconDeviceFloppy size={13} />
                          Reaplicar preset &quot;{meta.label}&quot; a todos
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useSaveAgentBulkPreset() {
  const qc = useQueryClient();
  const [isPending, setIsPending] = React.useState(false);

  const mutate = React.useCallback(
    async (agentIds: string[], preset: Partial<AgentPermissions>) => {
      setIsPending(true);
      try {
        await Promise.all(
          agentIds.map((id) =>
            fetch(`/api/settings/agent-permissions/${id}`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(preset),
            }),
          ),
        );
        qc.invalidateQueries({ queryKey: ["settings", "agent-permissions", "list"] });
      } finally {
        setIsPending(false);
      }
    },
    [qc],
  );

  return { isPending, mutate };
}

export function AgentsTab() {
  const { data: agents = [], isLoading, isError, error } = useAgentList();
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [listView, setListView] = React.useState<"atendentes" | "grupos">("atendentes");

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? agents.filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)) : agents;
  }, [agents, search]);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  const kpis = React.useMemo(() => ({
    total: agents.length,
    online: agents.filter((a) => a.isOnline).length,
    admins: agents.filter((a) => a.role === "ADMIN").length,
    withPerms: agents.filter((a) => a.permissions != null).length,
    noPerms: agents.filter((a) => a.permissions == null).length,
  }), [agents]);

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] py-20 text-center">
        <IconUser size={36} className="text-[var(--text-muted)] opacity-40" />
        <p className="font-display text-[14px] font-semibold text-[var(--text-muted)]">Erro ao carregar atendentes</p>
        <p className="font-body text-[12.5px] text-[var(--text-muted)]">{(error as Error)?.message ?? "Tente novamente."}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      <section
        className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-5"
        aria-label="Indicadores de atendentes"
      >
        <KpiCard
          label="Total atendentes"
          value={kpis.total.toLocaleString("pt-BR")}
          icon={<IconUsers size={20} stroke={2.2} />}
          tone="brand"
        />
        <KpiCard
          label="Online"
          value={kpis.online.toLocaleString("pt-BR")}
          icon={<IconCircleCheck size={20} stroke={2.2} />}
          tone="success"
        />
        <KpiCard
          label="Admins"
          value={kpis.admins.toLocaleString("pt-BR")}
          icon={<IconShieldCheck size={20} stroke={2.2} />}
          tone="violet"
        />
        <KpiCard
          label="Com permissões"
          value={kpis.withPerms.toLocaleString("pt-BR")}
          icon={<IconCheck size={20} stroke={2.2} />}
          tone="warning"
        />
        <KpiCard
          label="Sem permissões"
          value={kpis.noPerms.toLocaleString("pt-BR")}
          icon={<IconX size={20} stroke={2.2} />}
          tone="neutral"
        />
      </section>

      <div className="grid min-w-0 w-full max-w-full grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* ── Agent list sidebar ── */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)]">
        {/* View toggle + search */}
        <div className="flex flex-col gap-2 border-b border-[var(--glass-border-subtle)] p-3">
          {/* Tabs: Atendentes / Grupos */}
          <div className="flex rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5">
            {(["atendentes", "grupos"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setListView(v)}
                className={cn(
                  "flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 font-display text-[12px] font-semibold transition-all",
                  listView === v
                    ? "bg-white text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                {v === "atendentes" ? (
                  <span className="flex items-center justify-center gap-1.5"><IconUser size={12} />Atendentes</span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5"><IconShieldCheck size={12} />Grupos</span>
                )}
              </button>
            ))}
          </div>

          {/* Search — only in atendentes mode */}
          {listView === "atendentes" && (
            <div className="relative">
              <IconSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar atendente…"
                className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] pl-8 pr-3 font-body text-[13px] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--brand-primary)]"
              />
            </div>
          )}
        </div>

        {/* Content */}
        {listView === "grupos" ? (
          <div className="max-h-[60vh] overflow-y-auto p-2">
            <GroupsView
              agents={agents}
              onSelectAgent={(id) => { setSelectedId(id); setListView("atendentes"); }}
            />
          </div>
        ) : isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-[var(--radius-md)] bg-[var(--glass-bg-strong)]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <IconUser size={28} className="text-[var(--text-muted)] opacity-40" />
            <p className="font-body text-[12.5px] text-[var(--text-muted)]">
              {search ? "Nenhum atendente encontrado" : "Nenhum atendente cadastrado"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex flex-col gap-0.5">
              {filtered.map((agent) => (
                <AgentListItem
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedId === agent.id}
                  onClick={() => setSelectedId(agent.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer — only in atendentes mode */}
        {listView === "atendentes" && !isLoading && filtered.length > 0 && (
          <div className="border-t border-[var(--glass-border-subtle)] px-4 py-2.5">
            <p className="font-body text-[11.5px] text-[var(--text-muted)]">
              {filtered.length} atendente{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* ── Permissions panel ── */}
      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-[var(--radius-lg)] bg-[var(--glass-bg-strong)]" />
          ))}
        </div>
      ) : selectedAgent ? (
        <PermissionsPanel key={selectedAgent.id} agent={selectedAgent} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--glass-bg-strong)]">
            <IconUser size={24} className="text-[var(--text-muted)] opacity-40" />
          </div>
          <p className="font-display text-[14px] font-semibold text-[var(--text-muted)]">Selecione um atendente</p>
          <p className="font-body text-[12.5px] text-[var(--text-muted)]">Clique em um nome na lista para configurar as permissões.</p>
        </div>
      )}
      </div>
    </div>
  );
}
