"use client";

import { useEffect, useMemo, useState } from "react";
import { IconBan as Ban, IconCheck as Check, IconChevronDown as ChevronDown, IconChevronRight as ChevronRight, IconEye as Eye, IconLoader2 as Loader2, IconMessagePlus as MessageSquarePlus, IconPlus as Plus, IconRadio as Radio, IconSend as Send, IconSettings as Settings, IconShield as Shield, IconHierarchy as Workflow, IconX as X, type Icon as TablerIcon } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { SensitiveBadge } from "@/components/crm/permissions/sensitive-badge";
import { cn } from "@/lib/utils";

import {
  useAddRoleAssignment,
  useEffectivePermissions,
  useRemoveRoleAssignment,
  useRoles,
  useScopeChannelOptions,
  useScopePipelineOptions,
  useUpdateUserScopeGrants,
  useUserScopeGrants,
  type ScopeEntityOption,
} from "./hooks";
import { groupResourcesByCategory, RESOURCE_LABELS } from "./categories";

interface UserPermissionsViewProps {
  userId: string;
  userName?: string;
  userEmail?: string;
  /**
   * Quando true, exibe o editor inline de roles (botão remover ao lado de
   * cada role + dropdown pra adicionar nova). Quando false (default),
   * a sheet fica somente leitura — preserva o uso histórico do componente.
   * O backend (`POST/DELETE /api/roles/[id]/assignments`) só exige
   * `settings:permissions`, então quem tem acesso a `/settings/permissions`
   * já tem acesso ao editor.
   */
  editable?: boolean;
}

export function UserPermissionsView({
  userId,
  userName,
  userEmail,
  editable = false,
}: UserPermissionsViewProps) {
  const { data, isLoading, error } = useEffectivePermissions(userId);
  const [permissionsOpen, setPermissionsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-4 animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Não foi possível carregar as permissões.
      </p>
    );
  }

  const hasFullAccess = data.permissions.includes("*");

  // Agrupar por recurso e depois por tema (mesmas categorias do editor de papel).
  const permissionThemeGroups = (() => {
    if (hasFullAccess) {
      return [
        {
          id: "acesso",
          label: "Acesso",
          resources: [{ resource: "acesso", actions: ["total (*)"] }],
        },
      ];
    }
    const byResource = new Map<string, string[]>();
    for (const key of data.permissions) {
      const [resource, action] = key.split(":");
      if (!resource || !action) continue;
      if (!byResource.has(resource)) byResource.set(resource, []);
      byResource.get(resource)!.push(action);
    }
    const flat = Array.from(byResource.entries()).map(([resource, actions]) => ({
      resource,
      actions,
    }));
    return groupResourcesByCategory(flat);
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Usuário */}
      {(userName ?? userEmail) && (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {userName}
          </p>
          {userEmail && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{userEmail}</p>
          )}
        </div>
      )}

      {/* Roles diretas — read-only ou com editor inline conforme `editable` */}
      {editable ? (
        <UserRolesEditor
          userId={userId}
          currentRoles={data.roles}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <SectionLabel icon={Shield}>Papéis</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {data.roles.length === 0 ? (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhum role atribuído</span>
            ) : (
              data.roles.map((r) => (
                <Badge key={r.id} variant="outline" className="text-xs">
                  {r.name}
                  {r.systemPreset && (
                    <span className="ml-1 opacity-60">· sistema</span>
                  )}
                </Badge>
              ))
            )}
          </div>
        </div>
      )}

      {/* Acesso a funis e canais (escopo por usuário) */}
      {editable && <UserScopeEditor userId={userId} />}

      {/* Canais efetivos */}
      {data.channelGrants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Radio className="size-3.5" style={{ color: "var(--text-muted)" }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Canais permitidos
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.channelGrants.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Permissões efetivas (colapsável) */}
      <div
        className="overflow-hidden rounded-[var(--radius-lg)] border"
        style={{ borderColor: "var(--glass-border)" }}
      >
        <button
          type="button"
          onClick={() => setPermissionsOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--glass-bg-overlay)]"
        >
          {permissionsOpen ? (
            <ChevronDown className="size-3.5" style={{ color: "var(--text-muted)" }} />
          ) : (
            <ChevronRight className="size-3.5" style={{ color: "var(--text-muted)" }} />
          )}
          <span className="flex-1 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            Permissões efetivas ({data.permissions.length})
          </span>
        </button>

        {permissionsOpen && (
          <div className="border-t px-4 pb-3 pt-2" style={{ borderColor: "var(--glass-border-subtle)" }}>
            {permissionThemeGroups.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma permissão</p>
            ) : (
              <div className="flex flex-col gap-3">
                {permissionThemeGroups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-1.5">
                    <p
                      className="font-display text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {group.label}
                    </p>
                    {group.resources.map((entry) => (
                      <div key={entry.resource} className="flex gap-2">
                        <span
                          className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {RESOURCE_LABELS[entry.resource] ?? entry.resource}
                        </span>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {entry.actions.join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── UserRolesEditor ─────────────────────────────────────────────────────── */

/**
 * Editor inline das roles atribuídas ao usuário. Renderizado dentro da
 * `UserPermissionsView` quando `editable=true`.
 *
 * Modelo: lista as roles atuais como `Badge`s removíveis (× ao lado de
 * cada uma) e oferece um `<select>` com as roles ainda não atribuídas +
 * botão "Adicionar". Cada mutação invalida `effective-permissions` e
 * `my-permissions` no React Query (ver hooks) — UI reflete sem F5.
 *
 * Erros: capturados localmente e exibidos como linha curta vermelha
 * abaixo do editor (sem toast — sheet é compacta, evita ruído).
 */
function UserRolesEditor({
  userId,
  currentRoles,
}: {
  userId: string;
  currentRoles: { id: string; name: string; systemPreset: string | null }[];
}) {
  const { data: allRoles = [], isLoading: rolesLoading } = useRoles();
  const addAssignment = useAddRoleAssignment();
  const removeAssignment = useRemoveRoleAssignment();

  const [selectedToAdd, setSelectedToAdd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentRoleIds = useMemo(
    () => new Set(currentRoles.map((r) => r.id)),
    [currentRoles],
  );
  const availableRoles = useMemo(
    () => allRoles.filter((r) => !currentRoleIds.has(r.id)),
    [allRoles, currentRoleIds],
  );

  async function handleAdd() {
    if (!selectedToAdd) return;
    setError(null);
    try {
      await addAssignment.mutateAsync({ roleId: selectedToAdd, userId });
      setSelectedToAdd("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atribuir role.");
    }
  }

  async function handleRemove(roleId: string) {
    setError(null);
    try {
      await removeAssignment.mutateAsync({ roleId, userId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover role.");
    }
  }

  const adding = addAssignment.isPending;
  const removingRoleId = removeAssignment.isPending
    ? removeAssignment.variables?.roleId
    : null;

  return (
    <div className="flex flex-col gap-3" data-tour="sec-people-roles">
      <SectionLabel icon={Shield}>Papéis</SectionLabel>

      <div className="flex flex-wrap gap-2">
        {currentRoles.length === 0 ? (
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Nenhum papel atribuído
          </span>
        ) : (
          currentRoles.map((r) => {
            const isRemoving = removingRoleId === r.id;
            return (
              <span
                key={r.id}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-enterprise-bg)] px-3 py-2"
              >
                <span className="font-display text-[14px] font-semibold text-[var(--brand-primary)]">
                  {r.name}
                </span>
                {r.systemPreset && (
                  <span className="text-[12px] text-[var(--text-muted)]">
                    · sistema
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleRemove(r.id)}
                  disabled={isRemoving}
                  className="rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:bg-white/60 hover:text-[var(--brand-primary)] disabled:opacity-50 v2-dark:hover:bg-white/10"
                  title={`Remover papel "${r.name}"`}
                  aria-label={`Remover papel ${r.name}`}
                >
                  {isRemoving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </button>
              </span>
            );
          })
        )}
      </div>

      {/* Atribuir papel novo */}
      <div className="flex items-center gap-3">
        <DropdownGlass
          options={availableRoles.map((r) => ({
            value: r.id,
            label: `${r.name}${r.systemPreset ? " · sistema" : ""}`,
          }))}
          value={selectedToAdd || undefined}
          onValueChange={setSelectedToAdd}
          placeholder={
            rolesLoading
              ? "Carregando papéis..."
              : availableRoles.length === 0
                ? "Todos os papéis já atribuídos"
                : "Atribuir papel..."
          }
          disabled={rolesLoading || availableRoles.length === 0 || adding}
          triggerClassName="h-11 flex-1 rounded-xl text-[13px]"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!selectedToAdd || adding}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-5",
            "bg-[var(--brand-primary)] font-display text-[13.5px] font-semibold text-[var(--color-primary-foreground)]",
            "shadow-[var(--glass-shadow-sm)] transition-colors hover:bg-[var(--brand-primary-hover,var(--brand-primary))]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {adding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Adicionar
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-[var(--color-danger-text)]">{error}</p>
      )}
    </div>
  );
}

/* ── Primitivos visuais (DS de permissions) ──────────────────────────────── */

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: TablerIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4" style={{ color: "var(--text-muted)" }} />
      <span
        className="font-display text-[11px] font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)" }}
      >
        {children}
      </span>
    </div>
  );
}

function IconTile({ icon: Icon }: { icon: TablerIcon }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

/** Switch em pílula com check — mesmo padrão das ações do editor de papéis. */
function ScopeSwitch({
  on,
  onToggle,
  label,
  tone = "brand",
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  tone?: "brand" | "warn";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? tone === "warn"
            ? "bg-amber-500"
            : "bg-[var(--brand-primary)]"
          : "bg-[var(--glass-border)]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow transition-all",
          on ? "left-[22px]" : "left-0.5",
        )}
      >
        {on && (
          <Check
            className="size-3"
            stroke={3}
            style={{
              color: tone === "warn" ? "#f59e0b" : "var(--brand-primary)",
            }}
          />
        )}
      </span>
    </button>
  );
}

type ScopeMode = "none" | "some" | "all";

/** Segmented Nenhum / Selecionados / Todos. */
function ScopeSegmented({
  value,
  onChange,
  label,
  disabled,
}: {
  value: ScopeMode;
  onChange: (next: ScopeMode) => void;
  label: string;
  disabled?: boolean;
}) {
  const options: { id: ScopeMode; label: string }[] = [
    { id: "none", label: "Nenhum" },
    { id: "some", label: "Selecionados" },
    { id: "all", label: "Todos" },
  ];
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-[var(--glass-bg-overlay)] p-1"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 font-display text-[12.5px] font-semibold transition",
              "focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "bg-white text-[var(--brand-primary)] shadow-sm ring-1 ring-[var(--brand-primary)]/15 v2-dark:bg-[var(--glass-bg-base)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Linha de escopo: tile + título/subtítulo + controle à direita. */
function ScopeRow({
  icon,
  title,
  badge,
  subtitle,
  control,
  children,
}: {
  icon: TablerIcon;
  title: string;
  badge?: React.ReactNode;
  subtitle: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center gap-4">
        <IconTile icon={icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
              {title}
            </h4>
            {badge}
          </div>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">
            {subtitle}
          </p>
        </div>
        {control}
      </div>
      {children}
    </div>
  );
}

/* ── UserScopeEditor ─────────────────────────────────────────────────────── */

/** `["*"]` salvo no backend equivale a "todos" → tratamos como `null` na UI. */
export function normalizeScope(value: string[] | null | undefined): string[] | null {
  if (!value) return null;
  if (value.includes("*")) return null;
  return value;
}

/**
 * Editor de escopo por usuário: define a quais funis o usuário tem acesso e
 * em quais canais pode ver / enviar mensagens. Persiste em
 * `permissions.scope.grants.v1` via `PUT /api/users/[id]/scope-grants`.
 *
 * `null` = sem restrição (todos). Só tem efeito real quando a flag
 * `rbac_granular_scope_v1` está ativa na org (enforcement no backend).
 */
function UserScopeEditor({ userId }: { userId: string }) {
  const { data, isLoading } = useUserScopeGrants(userId);
  const pipelines = useScopePipelineOptions();
  const channels = useScopeChannelOptions();
  const update = useUpdateUserScopeGrants(userId);

  const [pipelineIds, setPipelineIds] = useState<string[] | null>(null);
  const [channelViewIds, setChannelViewIds] = useState<string[] | null>(null);
  const [channelSendIds, setChannelSendIds] = useState<string[] | null>(null);
  const [channelInitiateIds, setChannelInitiateIds] = useState<string[] | null>(null);
  const [channelManageIds, setChannelManageIds] = useState<string[] | null>(null);
  const [channelDenyIds, setChannelDenyIds] = useState<string[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setPipelineIds(normalizeScope(data.pipelineIds));
    setChannelViewIds(normalizeScope(data.channelViewIds));
    setChannelSendIds(normalizeScope(data.channelSendIds));
    setChannelInitiateIds(normalizeScope(data.channelInitiateIds));
    setChannelManageIds(normalizeScope(data.channelManageIds));
    setChannelDenyIds(normalizeScope(data.channelDenyIds));
    setDirty(false);
  }, [data]);

  const markDirty = (setter: (v: string[] | null) => void) => (v: string[] | null) => {
    setter(v);
    setDirty(true);
    setSaved(false);
  };

  async function handleSave() {
    setError(null);
    try {
      await update.mutateAsync({
        pipelineIds,
        channelViewIds,
        channelSendIds,
        channelInitiateIds,
        channelManageIds,
        channelDenyIds,
      });
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar acesso.");
    }
  }

  const channelOptions = channels.data ?? [];
  const channelsLoading = isLoading || channels.isLoading;
  const capacities: {
    key: string;
    icon: TablerIcon;
    title: string;
    value: string[] | null;
    onChange: (next: string[] | null) => void;
  }[] = [
    {
      key: "view",
      icon: Eye,
      title: "Ver mensagens",
      value: channelViewIds,
      onChange: markDirty(setChannelViewIds),
    },
    {
      key: "send",
      icon: Send,
      title: "Responder mensagens",
      value: channelSendIds,
      onChange: markDirty(setChannelSendIds),
    },
    {
      key: "initiate",
      icon: MessageSquarePlus,
      title: "Iniciar nova conversa",
      value: channelInitiateIds,
      onChange: markDirty(setChannelInitiateIds),
    },
    {
      key: "manage",
      icon: Settings,
      title: "Administrar",
      value: channelManageIds,
      onChange: markDirty(setChannelManageIds),
    },
  ];

  const denyOn = channelDenyIds !== null;
  const setDeny = markDirty(setChannelDenyIds);

  return (
    <section className="flex flex-col gap-3" data-tour="sec-people-scope">
      <SectionLabel icon={Workflow}>Acesso a funis e canais</SectionLabel>

      {/* Funis — switch "todos"; desligado revela a lista para escolher. */}
      <div className="rounded-2xl border border-[var(--glass-border)] bg-white shadow-[var(--glass-shadow-sm)] v2-dark:bg-[var(--glass-bg-modal)]">
        <ScopeRow
          icon={Workflow}
          title="Funis com acesso"
          subtitle={scopeSummary(
            pipelineIds,
            (pipelines.data ?? []).length,
            PIPELINE_LABELS,
          )}
          control={
            <ScopeSwitch
              on={pipelineIds === null}
              onToggle={() =>
                markDirty(setPipelineIds)(pipelineIds === null ? [] : null)
              }
              label="Dar acesso a todos os funis"
            />
          }
        >
          {pipelineIds !== null && (
            <ScopeOptionList
              options={pipelines.data ?? []}
              value={pipelineIds}
              onChange={markDirty(setPipelineIds)}
              loading={isLoading || pipelines.isLoading}
            />
          )}
        </ScopeRow>
      </div>

      {/* Canais por capacidade */}
      <div className="overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-white shadow-[var(--glass-shadow-sm)] v2-dark:bg-[var(--glass-bg-modal)]">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)]/60 px-5 py-2.5">
          <span className="font-display text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Canais por capacidade
          </span>
          <span className="text-[11.5px] text-[var(--text-muted)]">
            {channelOptions.length} canais disponíveis
          </span>
        </header>
        <div className="divide-y divide-[var(--glass-border-subtle)]">
          {capacities.map((cap) => (
            <ChannelCapacityRow
              key={cap.key}
              icon={cap.icon}
              title={cap.title}
              options={channelOptions}
              value={cap.value}
              onChange={cap.onChange}
              loading={channelsLoading}
            />
          ))}
        </div>
      </div>

      {/* Canais bloqueados — deny vence tudo, exceto quem administra. */}
      <div className="rounded-2xl border border-[var(--glass-border)] bg-white shadow-[var(--glass-shadow-sm)] v2-dark:bg-[var(--glass-bg-modal)]">
        <ScopeRow
          icon={Ban}
          title="Canais bloqueados"
          badge={<SensitiveBadge tone="warn" withIcon>Sensível</SensitiveBadge>}
          subtitle={
            channelDenyIds !== null && channelDenyIds.length > 0
              ? `${channelDenyIds.length} de ${channelOptions.length} canais bloqueados`
              : "Nega tudo, exceto se o usuário administra o canal"
          }
          control={
            <ScopeSwitch
              on={denyOn}
              tone="warn"
              onToggle={() => setDeny(denyOn ? null : [])}
              label="Bloquear canais específicos"
            />
          }
        >
          {channelDenyIds !== null && (
            <ScopeOptionList
              options={channelOptions}
              value={channelDenyIds}
              onChange={setDeny}
              loading={channelsLoading}
            />
          )}
        </ScopeRow>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && (
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Salvo
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!dirty || update.isPending}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-5",
            "bg-[var(--brand-primary)] font-display text-[13.5px] font-semibold text-[var(--color-primary-foreground)]",
            "shadow-[var(--glass-shadow-sm)] transition-colors hover:bg-[var(--brand-primary-hover,var(--brand-primary))]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvar acesso
        </button>
      </div>

      {error && <p className="text-[11px] text-[var(--color-danger-text)]">{error}</p>}
    </section>
  );
}

/** Resumo textual do escopo — vira o subtítulo da linha. */
function scopeSummary(
  value: string[] | null,
  total: number,
  labels: { all: string; none: string; plural: string },
): string {
  if (value === null) return `${labels.all} (${total})`;
  if (value.length === 0) return labels.none;
  return `${value.length} de ${total} ${labels.plural}`;
}

const PIPELINE_LABELS = {
  all: "Todos os funis",
  none: "Nenhum funil",
  plural: "funis",
};
const CHANNEL_LABELS = {
  all: "Todos os canais",
  none: "Nenhum canal",
  plural: "canais",
};

/**
 * Linha de capacidade de canal: segmented Nenhum / Selecionados / Todos.
 * `null` = todos; `[]` = nenhum; array = restrito à seleção.
 */
function ChannelCapacityRow({
  icon,
  title,
  options,
  value,
  onChange,
  loading,
}: {
  icon: TablerIcon;
  title: string;
  options: ScopeEntityOption[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  loading?: boolean;
}) {
  // Mantém a lista aberta em "Selecionados" mesmo com seleção vazia —
  // caso contrário o estado seria indistinguível de "Nenhum".
  const [wantsList, setWantsList] = useState(false);
  const mode: ScopeMode =
    value === null ? "all" : value.length > 0 || wantsList ? "some" : "none";

  function setMode(next: ScopeMode) {
    setWantsList(next === "some");
    if (next === "all") onChange(null);
    else if (next === "none") onChange([]);
    else onChange(value ?? []);
  }

  return (
    <ScopeRow
      icon={icon}
      title={title}
      subtitle={scopeSummary(value, options.length, CHANNEL_LABELS)}
      control={
        <ScopeSegmented
          value={mode}
          onChange={setMode}
          label={`Canais para ${title.toLowerCase()}`}
        />
      }
    >
      {mode === "some" && (
        <ScopeOptionList
          options={options}
          value={value ?? []}
          onChange={onChange}
          loading={loading}
        />
      )}
    </ScopeRow>
  );
}

/**
 * Lista de itens selecionáveis do escopo. Só aparece quando o escopo está
 * restrito — "todos" e "nenhum" são resolvidos no controle da linha.
 */
function ScopeOptionList({
  options,
  value,
  onChange,
  loading,
}: {
  options: ScopeEntityOption[];
  value: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
}) {
  const selected = useMemo(() => new Set(value), [value]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[var(--glass-bg-overlay)]/60 px-3 py-2.5">
        <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--text-muted)" }} />
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Carregando…
        </span>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <p className="rounded-xl bg-[var(--glass-bg-overlay)]/60 px-3 py-2.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Nenhum item disponível
      </p>
    );
  }

  return (
    <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-[var(--glass-bg-overlay)]/60 p-2">
      {options.map((o) => {
        const on = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.id)}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] transition",
              "focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]",
              on
                ? "bg-white font-semibold text-[var(--brand-primary)] shadow-sm ring-1 ring-[var(--brand-primary)]/20 v2-dark:bg-[var(--glass-bg-base)]"
                : "text-[var(--text-secondary)] hover:bg-white/70 v2-dark:hover:bg-white/5",
            )}
          >
            {on && <Check className="size-3.5 shrink-0" stroke={3} />}
            <span className="truncate">{o.name}</span>
          </button>
        );
      })}
    </div>
  );
}
