"use client";

import {
  useState,
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconColumns,
  IconEye,
  IconEyeOff,
  IconFilter,
  IconInfoCircle,
  IconKey,
  IconLayoutSidebar,
  IconLoader2,
  IconMail,
  IconPhoto,
  IconPlus,
  IconShield,
  IconShieldCheck,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarGlass } from "@/components/crm/avatar-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  useCreateRole,
  useDeleteRole,
  usePermissionsCatalog,
  useRole,
  useUpdateRole,
} from "./hooks";
import type { FieldGrantEntry, RoleSidebarItem, StageGrantEntry } from "./types";
import {
  RolePermissionsEditor,
  type PermissionsEditorMode,
} from "./role-permissions-editor";
import {
  SidebarItemsEditor,
  toEditorItems,
  toPersistItems,
  type SidebarEditorItem,
} from "@/features/sidebar/sidebar-customization";
import { usePipelinesQuery } from "@/features/shared/queries/pipelines";

// ─── Data helpers (etapas do funil + campos personalizados) ──────────────────

type PipelineWithStages = { id: string; name: string; stages: { id: string; name: string }[] };
type CustomFieldDef = { id: string; name: string; label: string };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

function usePipelinesWithStages() {
  // `stages` já vem no payload canônico do GET /api/pipelines.
  return usePipelinesQuery<PipelineWithStages>();
}

function useEntityFields(entity: string) {
  return useQuery<CustomFieldDef[]>({
    queryKey: ["custom-fields", entity],
    queryFn: () => getJson<CustomFieldDef[]>(`/api/custom-fields?entity=${entity}`),
    staleTime: 60_000,
  });
}

const FIELD_ENTITIES = ["deal", "contact", "company", "product"] as const;
const FIELD_ENTITY_LABEL: Record<string, string> = {
  deal: "Negócio",
  contact: "Contato",
  company: "Empresa",
  product: "Produto",
};

interface RoleEditorProps {
  roleId: string | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export function RoleEditor({ roleId, onClose, onSaved }: RoleEditorProps) {
  const isNew = roleId === null;

  const { data: role, isLoading: roleLoading } = useRole(roleId);
  const { data: catalog, isLoading: catalogLoading } = usePermissionsCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  // Visibilidade de conversas (own/all) — configuração por PAPEL-BASE, não
  // por role custom: o backend guarda em OrganizationSetting `visibility.<ROLE>`
  // e o enforcement roda em `getVisibilityFilter`. Só exposto para os presets
  // Operador (MEMBER) e Gestor (MANAGER); Admin sempre vê tudo.
  const rolePreset = role?.systemPreset;
  const visibilityPreset: "MEMBER" | "MANAGER" | null =
    rolePreset === "MEMBER" || rolePreset === "MANAGER" ? rolePreset : null;
  const [convVisibilityAll, setConvVisibilityAll] = useState(false);
  // Eixo ortogonal a own/all: ver ou não os itens sem responsável (pool livre).
  const [seeUnassigned, setSeeUnassigned] = useState(false);
  const { data: orgPermSettings } = useQuery<{
    visibility?: Record<string, "own" | "all">;
    unassigned?: Record<string, boolean>;
  }>({
    queryKey: ["settings-permissions", "visibility"],
    queryFn: () =>
      getJson<{
        visibility?: Record<string, "own" | "all">;
        unassigned?: Record<string, boolean>;
      }>("/api/settings/permissions"),
    staleTime: 60_000,
    enabled: visibilityPreset !== null,
  });
  useEffect(() => {
    if (!visibilityPreset || !orgPermSettings) return;
    if (orgPermSettings.visibility) {
      setConvVisibilityAll(orgPermSettings.visibility[visibilityPreset] === "all");
    }
    if (orgPermSettings.unassigned) {
      setSeeUnassigned(orgPermSettings.unassigned[visibilityPreset] === true);
    }
  }, [visibilityPreset, orgPermSettings]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PermissionsEditorMode>("levels");
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Grants migrados de Grupos: etapas do funil, campos e extras.
  const [sharedInbox, setSharedInbox] = useState(true);
  const [mediaAccess, setMediaAccess] = useState(true);
  const [stageGrants, setStageGrants] = useState<Record<string, { canView: boolean; canEdit: boolean }>>({});
  const [fieldGrants, setFieldGrants] = useState<Record<string, FieldGrantEntry>>({});
  // Menu lateral do papel — controlado localmente e enviado no save. Quando
  // o admin nunca mexeu, `sidebarOverride` fica false: nao envia `sidebarItems`
  // no payload (backend mantem `null` = usa catalogo padrao). Ao habilitar o
  // toggle "Personalizar", carregamos o catalogo completo como ponto de partida.
  const [sidebarOverride, setSidebarOverride] = useState(false);
  const [sidebarItems, setSidebarItems] = useState<SidebarEditorItem[]>(() => toEditorItems(null));

  const allCatalogKeys = useMemo(
    () =>
      (catalog?.resources ?? []).flatMap((r) =>
        r.actions.map((a) => `${r.resource}:${a.action}`),
      ),
    [catalog?.resources],
  );

  // Editor unificado: exibe TODAS as permissões do catálogo, incluindo
  // mensageria (conversas, canais, templates, campanhas).
  const editorResources = catalog?.resources ?? [];

  useEffect(() => {
    if (role) {
      setName(role.name);
      setDescription(role.description ?? "");
      if (role.permissions.includes("*")) {
        setChecked(new Set(allCatalogKeys));
      } else {
        setChecked(new Set(role.permissions));
      }
      const hasOverride = Array.isArray(role.sidebarItems) && role.sidebarItems.length > 0;
      setSidebarOverride(hasOverride);
      setSidebarItems(toEditorItems(hasOverride ? role.sidebarItems : null));
      setSharedInbox(role.sharedInbox ?? true);
      setMediaAccess(role.mediaAccess ?? true);
      const sg: Record<string, { canView: boolean; canEdit: boolean }> = {};
      for (const g of role.stageGrants ?? []) sg[g.stageId] = { canView: g.canView, canEdit: g.canEdit };
      setStageGrants(sg);
      const fg: Record<string, FieldGrantEntry> = {};
      for (const f of role.fieldGrants ?? []) fg[`${f.entity}.${f.fieldKey}`] = f;
      setFieldGrants(fg);
    }
  }, [role, allCatalogKeys]);

  const isSystem = role?.isSystem ?? false;
  const isAdminPreset = role?.systemPreset === "ADMIN";
  const loading = roleLoading || catalogLoading;
  const saving = createRole.isPending || updateRole.isPending;
  const deleting = deleteRole.isPending;

  // Contadores dos stat cards. `nav:*` são derivadas, então não entram na
  // contagem de "permissões ativas".
  const permsCount = Array.from(checked).filter((k) => !k.startsWith("nav:")).length;
  const usersCount = role?._count?.assignments ?? 0;
  const fieldRestrictions = Object.values(fieldGrants).filter(
    (f) => !f.canView || !f.canEdit,
  ).length;
  const stageRules = Object.values(stageGrants).filter((v) => v.canView || v.canEdit).length;
  const assignments = role?.assignments ?? [];

  async function handleSave() {
    setError(null);
    const permissions = isAdminPreset ? ["*"] : Array.from(checked);
    const sidebarPayload: RoleSidebarItem[] | null = sidebarOverride
      ? toPersistItems(sidebarItems)
      : null;
    const stagePayload: StageGrantEntry[] = Object.entries(stageGrants)
      .filter(([, v]) => v.canView || v.canEdit)
      .map(([stageId, v]) => ({ stageId, canView: v.canView, canEdit: v.canEdit }));
    const fieldPayload: FieldGrantEntry[] = Object.values(fieldGrants);
    try {
      if (isNew) {
        const created = await createRole.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          permissions,
          sidebarItems: sidebarPayload,
          sharedInbox,
          mediaAccess,
          stageGrants: stagePayload,
          fieldGrants: fieldPayload,
        });
        onSaved?.(created.id);
      } else if (roleId) {
        await updateRole.mutateAsync({
          id: roleId,
          ...(isSystem ? {} : { name: name.trim(), description: description.trim() }),
          permissions,
          sidebarItems: sidebarPayload,
          sharedInbox,
          mediaAccess,
          stageGrants: stagePayload,
          fieldGrants: fieldPayload,
        });
        onSaved?.(roleId);
      }
      // Visibilidade de conversas vive em OrganizationSetting (por papel-base),
      // fora do payload do Role — salva em separado quando o preset a expõe.
      if (visibilityPreset) {
        const res = await fetch(apiUrl("/api/settings/permissions"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visibility: {
              [visibilityPreset]: convVisibilityAll ? "all" : "own",
            },
            unassigned: {
              [visibilityPreset]: seeUnassigned,
            },
          }),
        });
        if (!res.ok) throw new Error("Erro ao salvar a visibilidade de conversas.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function handleDelete() {
    if (!roleId || !deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setError(null);
    try {
      await deleteRole.mutateAsync(roleId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao deletar.");
      setDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <IconLoader2 className="size-5 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  const fieldsDisabled = isSystem && !isNew;
  const headerName = isNew ? "Novo papel" : name || role?.name || "";

  return (
    <div className="flex min-w-0 flex-col gap-5" data-tour="sec-role-detail">
      {/* ── Header (nome + badge + ações) ─────────────────────────────────── */}
      <div className="flex items-start gap-4 border-b border-[var(--glass-border-subtle)] pb-5">
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
          {isSystem ? <IconShieldCheck size={24} /> : <IconShield size={24} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
              {headerName}
            </h2>
            <Badge
              variant="outline"
              className="text-[10px] font-bold uppercase tracking-wide"
            >
              {isAdminPreset ? "Admin" : isSystem ? "Sistema" : "Base"}
            </Badge>
          </div>
          <p className="mt-1 truncate font-body text-[12.5px] text-[var(--text-muted)]">
            {description.trim() || (isSystem ? "Papel padrão do sistema" : "Papel personalizado")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || (!isNew && !name.trim())}
            className="h-8 text-xs"
          >
            {saving && <IconLoader2 className="mr-1.5 size-3 animate-spin" />}
            Salvar
          </Button>
          <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">
            Cancelar
          </Button>
          {!isNew && !isSystem && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className={cn(
                "flex h-8 items-center gap-1 rounded-[var(--radius-md)] border px-2.5 font-display text-[12px] font-semibold transition-colors",
                deleteConfirm
                  ? "border-[var(--color-destructive)] bg-[var(--color-destructive-soft)] text-[var(--color-destructive)]"
                  : "border-[var(--glass-border)] text-[var(--text-muted)] hover:border-red-200 hover:bg-red-50 hover:text-red-500",
              )}
            >
              {deleting ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconTrash size={14} />}
              {deleteConfirm ? "Confirmar" : "Excluir"}
            </button>
          )}
        </div>
      </div>

      {/* ── Identidade editável (papéis não-sistema) ──────────────────────── */}
      {!fieldsDisabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Supervisor SP"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      {/* ── Stat cards (estilo Departamentos) ─────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox value={usersCount} label={usersCount === 1 ? "usuário com este papel" : "usuários com este papel"} />
        <StatBox
          value={isAdminPreset ? "Todas" : permsCount}
          label={isAdminPreset ? "permissões (acesso total)" : "permissões ativas"}
        />
        <StatBox
          value={fieldRestrictions}
          label={fieldRestrictions === 1 ? "campo com restrição" : "campos com restrição"}
        />
      </div>

      {/* ── Banner informativo (estilo Departamentos) ─────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/6 px-4 py-3">
        <IconInfoCircle size={16} className="mt-0.5 shrink-0 text-[var(--brand-primary)]" />
        <p className="font-body text-[12.5px] leading-relaxed text-[var(--text-secondary,var(--text-muted))]">
          <strong className="font-semibold text-[var(--text-primary)]">O que este papel controla:</strong>{" "}
          as <strong className="font-semibold text-[var(--text-primary)]">permissões</strong> de cada módulo, a{" "}
          <strong className="font-semibold text-[var(--text-primary)]">visibilidade por funil e por campo</strong> e os{" "}
          <strong className="font-semibold text-[var(--text-primary)]">acessos extras</strong> (caixa
          compartilhada e mídia). As restrições de funil/campo só valem com o escopo granular ativado; o
          preset Admin sempre tem acesso total.
        </p>
      </div>

      {/* Avatares dos membros (quando houver) */}
      {!isNew && assignments.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
            Membros
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {assignments.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center gap-1.5" title={a.user.name}>
                <AvatarGlass size="sm" name={a.user.name} imageUrl={a.user.avatarUrl} />
              </div>
            ))}
            {assignments.length > 8 && (
              <span className="font-body text-[11.5px] text-[var(--text-muted)]">
                +{assignments.length - 8}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-destructive)] bg-[var(--color-destructive-soft)] px-3 py-2 text-xs text-[var(--color-destructive)]">
          <IconAlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Seções recolhíveis ────────────────────────────────────────────── */}
      <CollapsibleSection
        icon={<IconKey size={16} />}
        title="Permissões"
        sub="o que este papel pode fazer em cada módulo"
        defaultOpen
      >
        <div className="p-4">
          <RolePermissionsEditor
            resources={editorResources}
            checked={checked}
            onChange={setChecked}
            mode={mode}
            onModeChange={setMode}
            disabled={isAdminPreset || saving}
          />
          {isAdminPreset && (
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              O preset Admin sempre possui acesso total (
              <code className="font-mono">*</code>) — as permissões não são editáveis.
            </p>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={<IconFilter size={16} />}
        title="Visibilidade por funil"
        sub={stageRules > 0 ? `${stageRules} etapa(s) com regra` : "quais deals este papel enxerga e edita"}
      >
        <StagePanel grants={stageGrants} setGrants={setStageGrants} />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<IconColumns size={16} />}
        title="Permissões por campo"
        sub="restrinja campos sensíveis de negócios e contatos"
      >
        <FieldPanel grants={fieldGrants} setGrants={setFieldGrants} />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<IconMail size={16} />}
        title="Acessos extras"
        sub={visibilityPreset ? "visibilidade de conversas e funil, caixa compartilhada e mídia" : "caixa compartilhada e mídia"}
      >
        {visibilityPreset && (
          <ExtraToggle
            icon={<IconEye size={16} />}
            title="Ver conversas e negócios de toda a equipe"
            desc="Vale para a Caixa de entrada E para o funil (Kanban/Lista/Flow). Ligado: enxerga as conversas e os cards de todos (respeitando as filas e o escopo de canal). Desligado: vê apenas as conversas atribuídas a ele e os negócios em que é o responsável."
            checked={convVisibilityAll}
            onChange={setConvVisibilityAll}
          />
        )}
        {visibilityPreset && (
          <ExtraToggle
            icon={<IconEyeOff size={16} />}
            title="Ver conversas e negócios sem responsável"
            desc="Eixo separado, combina com o toggle acima. Ligado: enxerga o pool livre — conversas e cards ainda sem responsável (respeitando filas, escopo de canal e departamento). Desligado: só o que já tem responsável. Ex.: com «toda a equipe» desligado + este ligado, vê os próprios itens mais os que estão sem dono."
            checked={seeUnassigned}
            onChange={setSeeUnassigned}
          />
        )}
        <ExtraToggle
          icon={<IconMail size={16} />}
          title="Caixa de entrada compartilhada"
          desc="Legado para gestores: lê conversas não atribuídas ligadas aos seus contatos. Para operadores (MEMBER), use as permissões «Filas da Inbox» (ex.: Entrada + Assumir conversa; Automação)."
          checked={sharedInbox}
          onChange={setSharedInbox}
        />
        <ExtraToggle
          icon={<IconPhoto size={16} />}
          title="Acesso à mídia"
          desc="Baixar e visualizar arquivos, imagens e áudios anexados às conversas e negócios."
          checked={mediaAccess}
          onChange={setMediaAccess}
        />
      </CollapsibleSection>

      {/* Menu lateral do papel — reutiliza a customização existente. */}
      <RoleSidebarSection
        override={sidebarOverride}
        onOverrideChange={setSidebarOverride}
        items={sidebarItems}
        onItemsChange={setSidebarItems}
        disabled={saving}
      />
    </div>
  );
}

// ─── Stat card (estilo Departamentos) ────────────────────────────────────────

function StatBox({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3">
      <p className="font-display text-[22px] font-extrabold leading-none text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 font-body text-[11.5px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

// ─── Seção recolhível ─────────────────────────────────────────────────────────

function CollapsibleSection({
  icon,
  title,
  sub,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--glass-bg-strong)]"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[13.5px] font-bold text-[var(--text-primary)]">{title}</span>
          {sub && (
            <span className="block truncate font-body text-[11.5px] text-[var(--text-muted)]">{sub}</span>
          )}
        </span>
        <IconChevronDown
          size={16}
          className={cn("shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="border-t border-[var(--glass-border-subtle)]">{children}</div>}
    </div>
  );
}

// ─── Painel de etapas do funil ────────────────────────────────────────────────

function StagePanel({
  grants,
  setGrants,
}: {
  grants: Record<string, { canView: boolean; canEdit: boolean }>;
  setGrants: Dispatch<SetStateAction<Record<string, { canView: boolean; canEdit: boolean }>>>;
}) {
  const { data: pipelines = [] } = usePipelinesWithStages();

  function set(stageId: string, patch: Partial<{ canView: boolean; canEdit: boolean }>) {
    setGrants((p) => {
      const cur = p[stageId] ?? { canView: true, canEdit: false };
      return { ...p, [stageId]: { ...cur, ...patch } };
    });
  }

  if (pipelines.length === 0) {
    return (
      <p className="px-4 py-4 text-[12px] text-[var(--text-muted)]">
        Nenhum funil encontrado. Sem regras, o papel enxerga todas as etapas.
      </p>
    );
  }

  return (
    <div>
      {pipelines.map((pl) =>
        pl.stages.map((st) => {
          const g = grants[st.id] ?? { canView: true, canEdit: false };
          return (
            <div
              key={st.id}
              className="flex items-center gap-3 border-b border-[var(--glass-border-subtle)] px-4 py-2.5 last:border-b-0 hover:bg-black/[0.015]"
            >
              <div className="min-w-0">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.4px] text-[var(--text-muted)]">
                  {pl.name}
                </span>
                <div className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">{st.name}</div>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <MiniToggle label="Ver" checked={g.canView} onChange={(v) => set(st.id, { canView: v })} />
                <MiniToggle label="Editar" checked={g.canEdit} onChange={(v) => set(st.id, { canEdit: v })} />
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}

// ─── Painel de campos ─────────────────────────────────────────────────────────

function FieldPanel({
  grants,
  setGrants,
}: {
  grants: Record<string, FieldGrantEntry>;
  setGrants: Dispatch<SetStateAction<Record<string, FieldGrantEntry>>>;
}) {
  const [adding, setAdding] = useState(false);
  const entries = Object.values(grants);

  function set(key: string, patch: Partial<FieldGrantEntry>) {
    setGrants((p) => ({ ...p, [key]: { ...p[key]!, ...patch } }));
  }
  function remove(key: string) {
    setGrants((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }
  function add(entity: string, field: CustomFieldDef) {
    const key = `${entity}.${field.name}`;
    setGrants((p) => ({
      ...p,
      [key]: { entity, fieldKey: field.name, canView: true, canEdit: true },
    }));
    setAdding(false);
  }

  return (
    <div>
      {entries.length === 0 && !adding && (
        <p className="px-4 py-4 text-[12px] text-[var(--text-muted)]">
          Nenhuma restrição de campo. Por padrão, o papel vê e edita todos os campos permitidos.
        </p>
      )}
      {entries.map((f) => {
        const key = `${f.entity}.${f.fieldKey}`;
        return (
          <div
            key={key}
            className="flex items-center gap-3 border-b border-[var(--glass-border-subtle)] px-4 py-2.5 last:border-b-0 hover:bg-black/[0.015]"
          >
            <div className="min-w-0">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.4px] text-[var(--text-muted)]">
                {FIELD_ENTITY_LABEL[f.entity] ?? f.entity}
              </span>
              <div className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">{f.fieldKey}</div>
              <span className="block text-[11px] text-[var(--text-muted)]">
                {f.entity}.{f.fieldKey}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <MiniToggle label="Ver" checked={f.canView} onChange={(v) => set(key, { canView: v })} />
              <MiniToggle label="Editar" checked={f.canEdit} onChange={(v) => set(key, { canEdit: v })} />
              <button
                type="button"
                onClick={() => remove(key)}
                className="rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--color-destructive)]"
                title="Remover regra"
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>
        );
      })}

      {adding ? (
        <FieldPicker existing={new Set(Object.keys(grants))} onPick={add} onClose={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2.5 px-4 py-3 font-display text-[13px] font-bold text-[var(--brand-primary)] transition-colors hover:bg-black/[0.015]"
        >
          <span className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--glass-border)]">
            <IconPlus size={14} />
          </span>
          Definir permissões para outro campo
        </button>
      )}
    </div>
  );
}

function FieldPicker({
  existing,
  onPick,
  onClose,
}: {
  existing: Set<string>;
  onPick: (entity: string, field: CustomFieldDef) => void;
  onClose: () => void;
}) {
  const [entity, setEntity] = useState<(typeof FIELD_ENTITIES)[number]>("deal");
  const { data: fields = [], isLoading } = useEntityFields(entity);
  const available = fields.filter((f) => !existing.has(`${entity}.${f.name}`));

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--glass-border-subtle)] bg-black/[0.015] px-4 py-3">
      <div className="flex items-center gap-2">
        <DropdownGlass
          options={FIELD_ENTITIES.map((e) => ({ value: e, label: FIELD_ENTITY_LABEL[e] ?? e }))}
          value={entity}
          onValueChange={(v) => setEntity(v as (typeof FIELD_ENTITIES)[number])}
        />
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          <IconX size={15} />
        </button>
      </div>
      <div className="max-h-40 overflow-auto rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-white">
        {isLoading ? (
          <p className="px-2.5 py-2 text-[12px] text-[var(--text-muted)]">Carregando…</p>
        ) : available.length === 0 ? (
          <p className="px-2.5 py-2 text-[12px] text-[var(--text-muted)]">
            Nenhum campo personalizado disponível para {FIELD_ENTITY_LABEL[entity] ?? entity}.
          </p>
        ) : (
          available.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(entity, f)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-black/[0.04]"
            >
              <span className="font-semibold text-[var(--text-primary)]">{f.label}</span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {entity}.{f.name}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Toggles ──────────────────────────────────────────────────────────────────

function MiniToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span className="text-[11.5px] font-semibold text-[var(--text-secondary)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-[var(--brand-primary)]" : "bg-[var(--toggle-bg-off)]",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-white shadow-[var(--glass-shadow-sm)] transition-transform",
            checked ? "translate-x-[19px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </label>
  );
}

function ExtraToggle({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--glass-border-subtle)] px-4 py-4 last:border-b-0">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[13.5px] font-bold text-[var(--text-primary)]">{title}</div>
        <div className="mt-0.5 max-w-[560px] text-[12px] text-[var(--text-muted)]">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-[var(--brand-primary)]" : "bg-[var(--toggle-bg-off)]",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-white shadow-[var(--glass-shadow-sm)] transition-transform",
            checked ? "translate-x-[19px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}

/**
 * Seção do editor de Role que controla o menu lateral (sidebar) que os
 * usuários deste papel veem. Um toggle "Personalizar" define se o papel
 * override o catálogo padrão. O `SidebarItemsEditor` só aparece quando
 * o override está ligado.
 */
function RoleSidebarSection({
  override,
  onOverrideChange,
  items,
  onItemsChange,
  disabled,
}: {
  override: boolean;
  onOverrideChange: (v: boolean) => void;
  items: SidebarEditorItem[];
  onItemsChange: (items: SidebarEditorItem[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
            <IconLayoutSidebar size={16} />
          </span>
          <div className="min-w-0">
            <span className="block font-display text-[13.5px] font-bold text-[var(--text-primary)]">
              Menu lateral
            </span>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              Define quais atalhos aparecem na sidebar e a ordem — vale para todos os usuários com este
              papel. Sem personalização, o papel usa o catálogo padrão do CRM.
            </p>
          </div>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Personalizar</span>
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => onOverrideChange(e.target.checked)}
            disabled={disabled}
            className="size-4 cursor-pointer accent-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      </div>

      {override && <SidebarItemsEditor items={items} onChange={onItemsChange} disabled={disabled} />}
    </div>
  );
}
