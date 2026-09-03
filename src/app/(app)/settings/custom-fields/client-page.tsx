"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconAlertCircle,
  IconAsterisk,
  IconCalendar,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconForms,
  IconGripVertical,
  IconHash,
  IconLayoutList,
  IconLetterT,
  IconLink,
  IconList,
  IconLoader2,
  IconMail,
  IconPencil,
  IconPhone,
  IconPlus,
  IconStack2,
  IconToggleLeft,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";

import { apiUrl } from "@/lib/api";
import { AppLoading } from "@/components/crm/app-loading";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/hooks/use-confirm";
import { useFieldLayout } from "@/hooks/use-field-layout";
import { type SectionConfig } from "@/lib/field-layout";
import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { KpiCard } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { MobileTableScroll } from "@/components/crm/mobile-table-scroll";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { type FieldConfigEntity } from "@/components/crm/fields/field-config-panel";
import {
  PageActionsMenu,
  PageSegmentedControl,
} from "@/components/crm/page-toolbar";
import {
  SettingsListFilterBar,
  type SettingsFilterGroup,
} from "@/components/crm/settings-filter-bar";
import { listTableHeadRowClass } from "@/components/crm/sortable-header";
import { FormDialog } from "@/components/ui/form-dialog";
import { PageTourButton } from "@/features/product-tour";

import {
  SETTINGS_HUB_BACK,
  SettingsV2Shell,
  useSettingsHeaderSlots,
} from "../_v2-shell";

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomFieldItem = {
  id: string;
  name: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  entity: string;
  showInInboxLeadPanel?: boolean;
  inboxLeadPanelOrder?: number | null;
  showInDealPanel?: boolean;
};

type EntityTab = "deal" | "contact";
type PageMode = "fields" | "groups";

const TYPES = [
  { value: "TEXT", label: "Texto" },
  { value: "SELECT", label: "Seleção" },
  { value: "MULTI_SELECT", label: "Multi-seleção" },
  { value: "NUMBER", label: "Número" },
  { value: "DATE", label: "Data" },
  { value: "BOOLEAN", label: "Sim/Não" },
  { value: "URL", label: "URL" },
  { value: "EMAIL", label: "E-mail" },
  { value: "PHONE", label: "Telefone" },
] as const;

const TYPE_ICONS: Record<string, React.ReactNode> = {
  TEXT: <IconLetterT size={13} strokeWidth={2.5} />,
  NUMBER: <IconHash size={13} strokeWidth={2.5} />,
  DATE: <IconCalendar size={13} strokeWidth={2.2} />,
  SELECT: <IconList size={13} strokeWidth={2.2} />,
  MULTI_SELECT: <IconList size={13} strokeWidth={2.2} />,
  BOOLEAN: <IconToggleLeft size={13} strokeWidth={2.2} />,
  URL: <IconLink size={13} strokeWidth={2.2} />,
  EMAIL: <IconMail size={13} strokeWidth={2.2} />,
  PHONE: <IconPhone size={13} strokeWidth={2.2} />,
};

// grid: handle | Campo (2fr) | Slug | Tipo | Inbox | Negócio | Ações
const CF_COLS =
  "grid-cols-[20px_minmax(180px,2fr)_minmax(120px,1fr)_minmax(90px,0.8fr)_80px_80px_64px]";

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchFields(entity: string): Promise<CustomFieldItem[]> {
  const res = await fetch(apiUrl(`/api/custom-fields?entity=${entity}`));
  const data = res.ok ? await res.json() : [];
  return Array.isArray(data) ? data : [];
}
async function createField(data: Record<string, unknown>) {
  const res = await fetch(apiUrl("/api/custom-fields"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string })?.message ?? "Erro ao criar campo",
    );
  }
  return res.json();
}
async function updateField(id: string, data: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/custom-fields/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Erro ao atualizar campo");
  return res.json();
}
async function deleteField(id: string) {
  const res = await fetch(apiUrl(`/api/custom-fields/${id}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Erro ao excluir campo");
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function CustomFieldsV2ClientPage() {
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Campos"
      description="Configure os campos exibidos nos registros. Arraste pelo indicador para definir a ordem no painel lateral da Inbox."
      icon={<IconForms size={22} />}
    >
      <CustomFieldsPage />
    </SettingsV2Shell>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function CustomFieldsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const slots = useSettingsHeaderSlots();

  const [activeEntity, setActiveEntity] = React.useState<EntityTab>("deal");
  const [mode, setMode] = React.useState<PageMode>("fields");
  const [search, setSearch] = React.useState("");
  const [visFilter, setVisFilter] = React.useState<"todos" | "inbox" | "deal">(
    "todos",
  );
  const [reqFilter, setReqFilter] = React.useState<"todos" | "sim">("todos");
  const [typeFilter, setTypeFilter] = React.useState<string>("todos");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editItem, setEditItem] = React.useState<CustomFieldItem | null>(null);

  const resetFilters = React.useCallback(() => {
    setSearch("");
    setVisFilter("todos");
    setReqFilter("todos");
    setTypeFilter("todos");
  }, []);

  const queryKey = React.useMemo(
    () => ["custom-fields", activeEntity] as const,
    [activeEntity],
  );

  const { data: fields = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchFields(activeEntity),
  });

  const [localOrder, setLocalOrder] = React.useState<string[]>([]);
  React.useEffect(() => {
    setLocalOrder(fields.map((f) => f.id));
  }, [fields]);

  const orderedFields = React.useMemo(() => {
    const map = Object.fromEntries(fields.map((f) => [f.id, f]));
    return localOrder.map((id) => map[id]).filter(Boolean);
  }, [fields, localOrder]);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return orderedFields.filter((f) => {
      if (
        q &&
        !f.label.toLowerCase().includes(q) &&
        !f.name.toLowerCase().includes(q)
      )
        return false;
      if (visFilter === "inbox" && !f.showInInboxLeadPanel) return false;
      if (visFilter === "deal" && !f.showInDealPanel) return false;
      if (reqFilter === "sim" && !f.required) return false;
      if (typeFilter !== "todos" && f.type !== typeFilter) return false;
      return true;
    });
  }, [orderedFields, search, visFilter, reqFilter, typeFilter]);

  const inboxCount = fields.filter((f) => f.showInInboxLeadPanel).length;
  const dealCount = fields.filter((f) => f.showInDealPanel).length;
  const requiredCount = fields.filter((f) => f.required).length;

  const filterGroups = React.useMemo<SettingsFilterGroup[]>(
    () => [
      {
        key: "vis",
        label: "Exibição no painel",
        value: visFilter,
        onChange: (v) => setVisFilter(v as "todos" | "inbox" | "deal"),
        options: [
          { value: "todos", label: "Todos" },
          { value: "inbox", label: "Inbox", count: inboxCount },
          ...(activeEntity === "deal"
            ? [{ value: "deal", label: "Negócio", count: dealCount }]
            : []),
        ],
      },
      {
        key: "req",
        label: "Obrigatoriedade",
        value: reqFilter,
        onChange: (v) => setReqFilter(v as "todos" | "sim"),
        options: [
          { value: "todos", label: "Todos" },
          { value: "sim", label: "Só obrigatórios", count: requiredCount },
        ],
      },
      {
        key: "type",
        label: "Tipo de campo",
        value: typeFilter,
        onChange: setTypeFilter,
        options: [
          { value: "todos", label: "Todos" },
          ...TYPES.map((t) => ({
            value: t.value,
            label: t.label,
            count: fields.filter((f) => f.type === t.value).length,
          })),
        ],
      },
    ],
    [
      visFilter,
      reqFilter,
      typeFilter,
      activeEntity,
      inboxCount,
      dealCount,
      requiredCount,
      fields,
    ],
  );

  const deleteMutation = useMutation({
    mutationFn: deleteField,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({
      id,
      inboxLeadPanelOrder,
    }: {
      id: string;
      inboxLeadPanelOrder: number;
    }) => updateField(id, { inboxLeadPanelOrder }),
  });

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const next = Array.from(localOrder);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setLocalOrder(next);
    next.forEach((id, idx) =>
      reorderMutation.mutate({ id, inboxLeadPanelOrder: idx }),
    );
  }

  // Header slots — busca com filtros (center) + pills + hamburger (actions).
  React.useEffect(() => {
    if (!slots) return;
    if (mode !== "fields") {
      slots.setCenter(null);
      return () => slots.setCenter(null);
    }
    slots.setCenter(
      <div data-tour="custom-fields-search" className="relative w-full">
        <SettingsListFilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Buscar campo…"
          ariaLabel="Buscar campo personalizado"
          icon={<IconForms size={15} />}
          groups={filterGroups}
          popoverTitle="Filtrar campos"
          onClearAll={resetFilters}
        />
      </div>,
    );
    return () => slots.setCenter(null);
  }, [slots, search, mode, filterGroups, resetFilters]);

  React.useEffect(() => {
    if (!slots) return;
    slots.setActions(
      <div className="flex items-center gap-2">
        <PageTourButton tourId="custom-fields" />
        <div data-tour="custom-fields-modes" className="flex items-center gap-2">
          <PageSegmentedControl
            items={[
              { value: "fields", label: "Campos" },
              { value: "groups", label: "Grupos" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as PageMode)}
            size="compact"
            aria-label="Modo de exibição"
          />
          <PageSegmentedControl
            items={[
              { value: "deal", label: "Negócio" },
              { value: "contact", label: "Contato" },
            ]}
            value={activeEntity}
            onChange={(v) => {
              setActiveEntity(v as EntityTab);
              resetFilters();
            }}
            size="compact"
            aria-label="Entidade dos campos"
          />
        </div>
        <div data-tour="custom-fields-actions" className="flex shrink-0">
          <PageActionsMenu
            aria-label="Ações de campos personalizados"
            items={[
              {
                icon: <IconPlus size={16} />,
                label: "Novo campo",
                onClick: () => setCreateOpen(true),
                primary: true,
                tourId: "custom-fields-new",
              },
              {
                icon: <IconStack2 size={16} />,
                label: mode === "groups" ? "Ver campos" : "Organizar grupos",
                onClick: () => setMode(mode === "groups" ? "fields" : "groups"),
                divider: true,
                tourId: "custom-fields-groups-item",
              },
            ]}
          />
        </div>
      </div>,
    );
    return () => slots.setActions(null);
  }, [slots, activeEntity, mode, resetFilters]);

  if (mode === "groups") {
    return <CustomFieldGroupsManager entity={activeEntity} />;
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3.5">
      {isLoading ? (
        <AppLoading variant="inline" className="min-h-0 flex-1" />
      ) : (
      <>
      {/* Mini-dash KPI */}
      <div data-tour="custom-fields-kpis">
      <KpiStrip
        aria-label="Indicadores de campos"
        gridClassName="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4"
      >
        <KpiCard
          label="Total"
          value={fields.length.toLocaleString("pt-BR")}
          icon={<IconForms size={20} stroke={2.2} />}
          tone="brand"
          active={visFilter === "todos" && reqFilter === "todos"}
          onClick={() => {
            setVisFilter("todos");
            setReqFilter("todos");
          }}
        />
        <KpiCard
          label="No painel Inbox"
          value={inboxCount.toLocaleString("pt-BR")}
          icon={<IconEye size={20} stroke={2.2} />}
          tone="success"
          active={visFilter === "inbox"}
          onClick={() =>
            setVisFilter((v) => (v === "inbox" ? "todos" : "inbox"))
          }
        />
        {activeEntity === "deal" && (
          <KpiCard
            label="No painel Negócio"
            value={dealCount.toLocaleString("pt-BR")}
            icon={<IconEye size={20} stroke={2.2} />}
            tone="violet"
            active={visFilter === "deal"}
            onClick={() =>
              setVisFilter((v) => (v === "deal" ? "todos" : "deal"))
            }
          />
        )}
        <KpiCard
          label="Obrigatórios"
          value={requiredCount.toLocaleString("pt-BR")}
          icon={<IconAsterisk size={20} stroke={2.2} />}
          tone="warning"
          active={reqFilter === "sim"}
          onClick={() =>
            setReqFilter((v) => (v === "sim" ? "todos" : "sim"))
          }
        />
      </KpiStrip>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--glass-bg-strong)]">
            <IconLayoutList
              size={22}
              className="text-[var(--text-muted)] opacity-50"
            />
          </div>
          <div>
            <p className="font-display text-[14px] font-semibold text-[var(--text-primary)]">
              {fields.length === 0
                ? "Nenhum campo personalizado criado"
                : "Nenhum campo encontrado"}
            </p>
            <p className="mt-1 font-body text-[12.5px] text-[var(--text-muted)]">
              {fields.length === 0
                ? "Crie campos para enriquecer seus registros."
                : "Tente um termo diferente."}
            </p>
          </div>
          {fields.length === 0 && (
            <ButtonGlass
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="mt-1 gap-1.5"
            >
              <IconPlus size={13} /> Criar campo
            </ButtonGlass>
          )}
        </div>
      ) : (
        <div data-tour="custom-fields-list">
        <MobileTableScroll minWidth={780}>
            {/* Header de colunas — padrão Contatos */}
            <div
              className={listTableHeadRowClass(
                cn(
                  "grid gap-3 border border-transparent px-4 py-2",
                  CF_COLS,
                ),
              )}
            >
              <span />
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                Campo
              </span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                Slug
              </span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                Tipo
              </span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.05em] text-emerald-600">
                Inbox
              </span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.05em] text-violet-600">
                Negócio
              </span>
              <span className="text-right font-display text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                Ações
              </span>
            </div>

            {/* Linhas em cards com DnD */}
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="custom-fields-list">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex flex-col gap-2"
                  >
                    {filtered.map((field, index) => (
                      <Draggable
                        key={field.id}
                        draggableId={field.id}
                        index={index}
                      >
                        {(drag, snapshot) => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            className={cn(
                              "group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)]",
                              CF_COLS,
                              snapshot.isDragging &&
                                "border-[var(--brand-primary)]/40 bg-[var(--color-primary-soft)] shadow-[var(--glass-shadow)]",
                            )}
                          >
                            {/* Drag handle */}
                            <div
                              {...drag.dragHandleProps}
                              className="cursor-grab text-[var(--text-muted)]/40 transition-colors hover:text-[var(--text-muted)] active:cursor-grabbing"
                              title="Arrastar para reordenar"
                            >
                              <IconGripVertical size={14} />
                            </div>

                            {/* Campo */}
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                                {TYPE_ICONS[field.type] ?? (
                                  <IconLetterT size={13} strokeWidth={2.5} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-display text-[13.5px] font-semibold text-[var(--text-primary)]">
                                    {field.label}
                                  </span>
                                  {field.required && (
                                    <span className="shrink-0 rounded-[4px] bg-red-50 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-red-500">
                                      Obrigatório
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Slug */}
                            <span className="inline-block max-w-full truncate rounded-[4px] bg-[var(--glass-bg-strong)] px-1.5 py-0.5 font-mono text-[11.5px] text-[var(--text-muted)]">
                              {field.name}
                            </span>

                            {/* Tipo */}
                            <span className="truncate font-display text-[13px] text-[var(--text-secondary)]">
                              {TYPES.find((t) => t.value === field.type)
                                ?.label ?? field.type}
                            </span>

                            {/* Inbox */}
                            <div>
                              {(field.entity === "contact" ||
                                field.entity === "deal") && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold",
                                    field.showInInboxLeadPanel
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
                                  )}
                                >
                                  {field.showInInboxLeadPanel ? (
                                    <IconEye size={11} />
                                  ) : (
                                    <IconEyeOff size={11} />
                                  )}
                                  {field.showInInboxLeadPanel ? "Sim" : "Não"}
                                </span>
                              )}
                            </div>

                            {/* Negócio */}
                            <div>
                              {field.entity === "deal" && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[11px] font-semibold",
                                    field.showInDealPanel
                                      ? "bg-violet-100 text-violet-700"
                                      : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
                                  )}
                                >
                                  {field.showInDealPanel ? (
                                    <IconEye size={11} />
                                  ) : (
                                    <IconEyeOff size={11} />
                                  )}
                                  {field.showInDealPanel ? "Sim" : "Não"}
                                </span>
                              )}
                            </div>

                            {/* Ações — sempre visíveis no mobile (sem hover);
                                no desktop só aparecem no hover da linha. */}
                            <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => setEditItem(field)}
                                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                                title="Editar"
                                aria-label={`Editar ${field.label}`}
                              >
                                <IconPencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: "Excluir campo",
                                    description: `Excluir o campo "${field.label}"? Todos os valores serão perdidos.`,
                                    confirmLabel: "Excluir",
                                    variant: "destructive",
                                  });
                                  if (ok) deleteMutation.mutate(field.id);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                                title="Excluir"
                                aria-label={`Excluir ${field.label}`}
                              >
                                <IconTrash size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
        </MobileTableScroll>
        </div>
      )}
      </>
      )}

      {/* Modais */}
      <FieldFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        defaultEntity={activeEntity}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey });
          setCreateOpen(false);
        }}
      />
      {editItem && (
        <FieldFormDialog
          open={!!editItem}
          onOpenChange={(o) => {
            if (!o) setEditItem(null);
          }}
          mode="edit"
          initial={editItem}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey });
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Grupos de campos (organização para o agente) ──────────────────────────────

/** Extrai os grupos (custom_fields_group) de uma entidade a partir de um layout. */
function pickGroups(sections: SectionConfig[], entity: FieldConfigEntity) {
  return sections.filter(
    (s) => s.kind === "custom_fields_group" && s.entity === entity,
  );
}

const genGroupId = (entity: string) =>
  `cfg_${entity}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * Editor unificado de grupos: o gestor organiza os campos personalizados em
 * grupos e o resultado vale para os dois painéis laterais (Inbox e Negócio).
 * Persiste no escopo "admin" (padrão para os agentes) em ambos os contextos.
 */
function CustomFieldGroupsManager({ entity }: { entity: FieldConfigEntity }) {
  const deal = useFieldLayout("deal_panel_v2");
  const inbox = useFieldLayout("inbox_lead_v2");

  const { data: allFields = [] } = useQuery({
    queryKey: ["custom-fields", entity],
    queryFn: () => fetchFields(entity),
  });

  // Base canônica: prioriza o que já existe no painel do Negócio; se vazio,
  // usa o da Inbox. A partir do primeiro salvamento os dois ficam idênticos.
  const initialGroups = React.useMemo(() => {
    const fromDeal = pickGroups(deal.adminSections, entity);
    return fromDeal.length > 0 ? fromDeal : pickGroups(inbox.adminSections, entity);
  }, [deal.adminSections, inbox.adminSections, entity]);

  const [draft, setDraft] = React.useState<SectionConfig[] | null>(null);
  const [newName, setNewName] = React.useState("");
  const working = draft ?? initialGroups;
  const dirty = draft !== null;

  // Ao trocar de entidade, descarta rascunho não salvo.
  React.useEffect(() => {
    setDraft(null);
    setNewName("");
  }, [entity]);

  const fieldsById = React.useMemo(
    () => new Map(allFields.map((f) => [f.id, f] as const)),
    [allFields],
  );
  const assigned = React.useMemo(
    () => new Set(working.flatMap((g) => g.fields.map((f) => f.id))),
    [working],
  );
  const orphans = React.useMemo(
    () => allFields.filter((f) => !assigned.has(f.id)),
    [allFields, assigned],
  );

  const addGroup = () => {
    const label = newName.trim();
    if (!label) return;
    setDraft([
      ...working,
      {
        id: genGroupId(entity),
        label,
        kind: "custom_fields_group",
        entity,
        fields: [],
        collapsedDefault: false,
      },
    ]);
    setNewName("");
  };
  const renameGroup = (id: string, label: string) =>
    setDraft(working.map((g) => (g.id === id ? { ...g, label } : g)));
  const deleteGroup = (id: string) =>
    setDraft(working.filter((g) => g.id !== id));
  const assignField = (groupId: string, field: CustomFieldItem) =>
    setDraft(
      working.map((g) => {
        if (g.id === groupId) {
          if (g.fields.some((f) => f.id === field.id)) return g;
          return { ...g, fields: [...g.fields, { id: field.id, label: field.label }] };
        }
        // 1 campo por grupo (mesma entidade): remove dos demais.
        return { ...g, fields: g.fields.filter((f) => f.id !== field.id) };
      }),
    );
  const removeField = (groupId: string, fieldId: string) =>
    setDraft(
      working.map((g) =>
        g.id === groupId
          ? { ...g, fields: g.fields.filter((f) => f.id !== fieldId) }
          : g,
      ),
    );

  const save = () => {
    for (const ctx of [deal, inbox] as const) {
      const merged = [
        ...ctx.adminSections.filter(
          (s) => !(s.kind === "custom_fields_group" && s.entity === entity),
        ),
        ...working,
      ];
      ctx.saveAdmin(merged);
    }
    setDraft(null);
    toast.success("Grupos salvos");
  };

  const saving = deal.saveAdminPending || inbox.saveAdminPending;
  const entityLabel = entity === "deal" ? "Negócio" : "Contato";

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {/* Mini-dash KPI */}
      <section
        className="grid shrink-0 grid-cols-3 gap-2.5 sm:gap-3.5"
        aria-label="Indicadores de grupos"
      >
        <KpiCard
          label="Grupos"
          value={working.length.toLocaleString("pt-BR")}
          icon={<IconStack2 size={20} stroke={2.2} />}
          tone="brand"
        />
        <KpiCard
          label="Campos agrupados"
          value={assigned.size.toLocaleString("pt-BR")}
          icon={<IconForms size={20} stroke={2.2} />}
          tone="success"
        />
        <KpiCard
          label="Sem grupo"
          value={orphans.length.toLocaleString("pt-BR")}
          icon={<IconLayoutList size={20} stroke={2.2} />}
          tone="neutral"
        />
      </section>

      <p className="font-body text-[12.5px] leading-relaxed text-[var(--text-muted)]">
        Organize os campos de{" "}
        <span className="font-semibold text-[var(--text-secondary)]">
          {entityLabel}
        </span>{" "}
        em grupos. Os grupos aparecem nos painéis laterais da Inbox e do Negócio
        para todos os agentes. Cada campo pode estar em apenas um grupo; os campos
        sem grupo continuam listados normalmente.
      </p>

      <div className="flex flex-col gap-2.5">
        {working.map((g) => (
          <GroupCardRow
            key={g.id}
            group={g}
            fieldsById={fieldsById}
            orphans={orphans}
            onRename={(label) => renameGroup(g.id, label)}
            onDelete={() => deleteGroup(g.id)}
            onAssign={(field) => assignField(g.id, field)}
            onRemoveField={(fieldId) => removeField(g.id, fieldId)}
          />
        ))}

        {/* Campos sem grupo */}
        {orphans.length > 0 && (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3.5">
            <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">
              Sem grupo ({orphans.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {orphans.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2.5 py-1 font-display text-[12px] text-[var(--text-secondary)]"
                >
                  <span className="text-[var(--brand-primary)]">
                    {TYPE_ICONS[f.type] ?? <IconLetterT size={12} strokeWidth={2.5} />}
                  </span>
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Novo grupo */}
        <div className="flex items-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3">
          <InputGlass
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGroup();
              }
            }}
            placeholder="Nome do novo grupo (ex.: Documentos)"
            className="flex-1"
          />
          <ButtonGlass
            variant="primary"
            size="sm"
            onClick={addGroup}
            disabled={!newName.trim()}
            className="shrink-0 gap-1.5"
          >
            <IconPlus size={14} /> Grupo
          </ButtonGlass>
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-3 flex items-center justify-end gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 shadow-[var(--glass-shadow)] backdrop-blur-md">
          <span className="mr-auto font-body text-[11.5px] text-[var(--text-muted)]">
            Alterações não salvas
          </span>
          <button
            type="button"
            onClick={() => setDraft(null)}
            disabled={saving}
            className="rounded-full px-3 py-1.5 font-display text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <ButtonGlass
            variant="primary"
            size="sm"
            onClick={save}
            disabled={saving}
            className="gap-1.5"
          >
            {saving ? (
              <IconLoader2 size={13} className="animate-spin" />
            ) : (
              <IconCheck size={13} />
            )}
            Salvar grupos
          </ButtonGlass>
        </div>
      )}
    </div>
  );
}

function GroupCardRow({
  group,
  fieldsById,
  orphans,
  onRename,
  onDelete,
  onAssign,
  onRemoveField,
}: {
  group: SectionConfig;
  fieldsById: Map<string, CustomFieldItem>;
  orphans: CustomFieldItem[];
  onRename: (label: string) => void;
  onDelete: () => void;
  onAssign: (field: CustomFieldItem) => void;
  onRemoveField: (fieldId: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(group.label);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const commitName = () => {
    const v = draftName.trim();
    if (v && v !== group.label) onRename(v);
    setEditing(false);
  };

  return (
    <div className="group rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3.5 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:shadow-[var(--glass-shadow)]">
      {/* Cabeçalho do grupo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
          <IconStack2 size={16} strokeWidth={2.2} />
        </div>
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitName();
              } else if (e.key === "Escape") {
                setDraftName(group.label);
                setEditing(false);
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--glass-bg-strong)] px-2.5 font-display text-[14px] font-semibold text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(group.label);
              setEditing(true);
            }}
            className="flex min-w-0 items-center gap-1.5 text-left"
            title="Renomear grupo"
          >
            <span className="truncate font-display text-[14px] font-semibold text-[var(--text-primary)]">
              {group.label}
            </span>
            <IconPencil
              size={13}
              className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        )}
        <span className="ml-1 shrink-0 rounded-full bg-[var(--glass-bg-strong)] px-2 py-0.5 font-display text-[11px] font-semibold text-[var(--text-muted)]">
          {group.fields.length} campo{group.fields.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Excluir grupo"
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <IconTrash size={14} />
        </button>
      </div>

      {/* Campos do grupo */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {group.fields.length === 0 && (
          <span className="font-body text-[12px] italic text-[var(--text-muted)]">
            Nenhum campo neste grupo.
          </span>
        )}
        {group.fields.map((f) => {
          const def = fieldsById.get(f.id);
          const label = def?.label ?? f.label;
          const missing = !def;
          return (
            <span
              key={f.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[12px]",
                missing
                  ? "border-dashed border-amber-300 text-amber-600"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-secondary)]",
              )}
              title={missing ? "Campo excluído (será ignorado)" : undefined}
            >
              {def && (
                <span className="text-[var(--brand-primary)]">
                  {TYPE_ICONS[def.type] ?? <IconLetterT size={12} strokeWidth={2.5} />}
                </span>
              )}
              {label}
              <button
                type="button"
                onClick={() => onRemoveField(f.id)}
                aria-label={`Remover ${label} do grupo`}
                className="text-[var(--text-muted)] transition-colors hover:text-red-500"
              >
                <IconX size={12} />
              </button>
            </span>
          );
        })}

        {/* Picker de campos órfãos */}
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={orphans.length === 0}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-primary)]/40 hover:text-[var(--brand-primary)] disabled:opacity-50"
          >
            <IconPlus size={12} />
            {orphans.length === 0 ? "Sem campos disponíveis" : "Adicionar campo"}
          </button>
          {pickerOpen && orphans.length > 0 && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-64 w-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] p-1 shadow-[var(--glass-shadow-lg)] backdrop-blur-md">
              {orphans.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onAssign(f);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left font-display text-[12.5px] text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-strong)]"
                >
                  <span className="text-[var(--brand-primary)]">
                    {TYPE_ICONS[f.type] ?? <IconLetterT size={12} strokeWidth={2.5} />}
                  </span>
                  <span className="truncate">{f.label}</span>
                  <span className="ml-auto shrink-0 font-body text-[10.5px] text-[var(--text-muted)]">
                    {TYPES.find((t) => t.value === f.type)?.label ?? f.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Field form dialog ────────────────────────────────────────────────────────

function FieldLabel({
  children,
  htmlFor,
  hint,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]"
    >
      {children}
      {hint && (
        <span className="ml-1 font-normal normal-case text-[var(--text-muted)]/70">
          {hint}
        </span>
      )}
    </label>
  );
}

function AlternativesEditor({
  options,
  onChange,
  error,
}: {
  options: string[];
  onChange: (next: string[]) => void;
  error?: string | null;
}) {
  const [draft, setDraft] = React.useState("");

  function addOption() {
    const value = draft.trim();
    if (!value || options.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...options, value]);
    setDraft("");
  }

  function removeOption(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1.5" data-tour="field-create-options">
      <FieldLabel>Alternativas</FieldLabel>
      <p className="-mt-1 font-body text-[11.5px] text-[var(--text-muted)]">
        Opções exibidas na lista de seleção
      </p>

      {options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt, i) => (
            <span
              key={`${opt}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] pl-3 pr-1.5 py-1 font-body text-[12.5px] text-[var(--text-primary)]"
            >
              {opt}
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                title={`Remover "${opt}"`}
              >
                <IconX size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="font-body text-[12px] text-[var(--text-muted)]/80">
          Adicione pelo menos uma alternativa
        </p>
      )}

      <div className="flex gap-2">
        <InputGlass
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOption();
            }
          }}
          placeholder="Nova alternativa"
          className="flex-1"
        />
        <ButtonGlass type="button" variant="glass" size="sm" onClick={addOption}>
          Adicionar
        </ButtonGlass>
      </div>

      {error && <p className="font-body text-[11.5px] text-red-500">{error}</p>}
    </div>
  );
}

export function FieldFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  defaultEntity = "deal",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: CustomFieldItem;
  defaultEntity?: string;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [label, setLabel] = React.useState(initial?.label ?? "");
  const [type, setType] = React.useState(initial?.type ?? "TEXT");
  const [entity, setEntity] = React.useState(initial?.entity ?? defaultEntity);
  const [required, setRequired] = React.useState(initial?.required ?? false);
  const [options, setOptions] = React.useState<string[]>(
    initial?.options ?? [],
  );
  const [optionsError, setOptionsError] = React.useState<string | null>(null);
  const [showInInboxLeadPanel, setShowInInboxLeadPanel] = React.useState(
    initial?.showInInboxLeadPanel ?? false,
  );
  const [showInDealPanel, setShowInDealPanel] = React.useState(
    initial?.showInDealPanel ?? false,
  );

  React.useEffect(() => {
    if (open && initial) {
      setName(initial.name);
      setLabel(initial.label);
      setType(initial.type);
      setEntity(initial.entity);
      setRequired(initial.required);
      setOptions(initial.options ?? []);
      setOptionsError(null);
      setShowInInboxLeadPanel(initial.showInInboxLeadPanel ?? false);
      setShowInDealPanel(initial.showInDealPanel ?? false);
    } else if (open && !initial) {
      setName("");
      setLabel("");
      setType("TEXT");
      setEntity(defaultEntity);
      setRequired(false);
      setOptions([]);
      setOptionsError(null);
      setShowInInboxLeadPanel(false);
      setShowInDealPanel(false);
    }
  }, [open, initial, defaultEntity]);

  const supportsInboxPanel = entity === "contact" || entity === "deal";
  React.useEffect(() => {
    if (open && mode === "create" && !supportsInboxPanel) {
      setShowInInboxLeadPanel(false);
    }
  }, [supportsInboxPanel, open, mode]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        return createField({
          name,
          label,
          type,
          options,
          required,
          entity,
          ...(supportsInboxPanel ? { showInInboxLeadPanel } : {}),
          ...(entity === "deal" ? { showInDealPanel } : {}),
        });
      } else if (initial) {
        const editSupports =
          initial.entity === "contact" || initial.entity === "deal";
        return updateField(initial.id, {
          label,
          type,
          options,
          required,
          ...(editSupports ? { showInInboxLeadPanel } : {}),
          ...(initial.entity === "deal" ? { showInDealPanel } : {}),
        });
      }
    },
    onSuccess: () => onSaved(),
  });

  const showOptions = type === "SELECT" || type === "MULTI_SELECT";
  // IDs únicos: create e edit ficam montados ao mesmo tempo; `form="…"` no
  // footer apontava para o primeiro `#field-form` (sempre o de create) e o
  // Salvar da edição acabava em POST /api/custom-fields → 400.
  const formId = mode === "create" ? "field-form-create" : "field-form-edit";
  const entityOptions = [
    { value: "contact", label: "Contato" },
    { value: "deal", label: "Negócio" },
    { value: "product", label: "Produto/Serviço" },
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={mutation.isPending}
      size="lg"
      icon={
        <span className="text-[var(--brand-primary)]">
          {TYPE_ICONS[type] ?? <IconLetterT size={16} strokeWidth={2.5} />}
        </span>
      }
      title={mode === "create" ? "Novo campo" : "Editar campo"}
      description={
        mode === "create"
          ? "Defina o nome, tipo e entidade."
          : `Editando "${initial?.label}"`
      }
      headerAccessory={
        mode === "create" ? (
          <PageTourButton tourId="custom-fields-create" size="sm" />
        ) : undefined
      }
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[var(--radius-md)] border border-[var(--glass-border)] px-4 py-1.5 font-display text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <ButtonGlass
            type="submit"
            form={formId}
            variant="primary"
            disabled={mutation.isPending || !label.trim()}
            data-tour="field-create-submit"
          >
            {mutation.isPending
              ? "Salvando…"
              : mode === "create"
                ? "Criar campo"
                : "Salvar"}
          </ButtonGlass>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (showOptions && options.length === 0) {
            setOptionsError("Adicione pelo menos uma alternativa");
            return;
          }
          setOptionsError(null);
          mutation.mutate();
        }}
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5" data-tour="field-create-entity">
              <FieldLabel>Entidade</FieldLabel>
              <DropdownGlass
                options={entityOptions}
                value={entity}
                onValueChange={(v) => setEntity(v)}
                disabled={mode === "edit"}
                triggerClassName="w-full"
              />
              {mode === "edit" && (
                <p className="font-body text-[11px] text-[var(--text-muted)]">
                  Não pode ser alterada
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5" data-tour="field-create-type">
              <FieldLabel>Tipo</FieldLabel>
              <DropdownGlass
                options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
                value={type}
                onValueChange={(v) => setType(v)}
                triggerClassName="w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5" data-tour="field-create-slug">
            <FieldLabel hint="— deixe vazio para gerar automaticamente">
              Identificador (slug)
            </FieldLabel>
            <InputGlass
              value={name}
              onChange={(e) => {
                const cleaned = e.target.value
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]+/g, "_")
                  .replace(/^_+|_+$/g, "")
                  .replace(/_+/g, "_");
                setName(cleaned);
              }}
              placeholder="ex: fonte_do_lead"
              disabled={mode === "edit"}
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5" data-tour="field-create-label">
            <FieldLabel>Nome (exibição)</FieldLabel>
            <InputGlass
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: Fonte do Lead"
              autoFocus={mode === "create"}
            />
          </div>

          {showOptions && (
            <AlternativesEditor
              options={options}
              onChange={(next) => {
                setOptions(next);
                if (next.length > 0) setOptionsError(null);
              }}
              error={optionsError}
            />
          )}

          <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3" data-tour="field-create-required">
            <div>
              <p className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                Campo obrigatório
              </p>
              <p className="mt-0.5 font-body text-[11.5px] text-[var(--text-muted)]">
                Impede salvar o registro sem preencher este campo.
              </p>
            </div>
            <SwitchGlass
              checked={required}
              onChange={setRequired}
              aria-label="Campo obrigatório"
              size="sm"
            />
          </div>

          {supportsInboxPanel && (
            <div className="flex flex-col gap-2" data-tour="field-create-visibility">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Visibilidade nos painéis
              </p>
              <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3">
                <div>
                  <p className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                    Painel lateral — Inbox
                  </p>
                  <p className="mt-0.5 font-body text-[11.5px] leading-snug text-[var(--text-muted)]">
                    Exibir no chat ao atender
                  </p>
                </div>
                <SwitchGlass
                  checked={showInInboxLeadPanel}
                  onChange={setShowInInboxLeadPanel}
                  aria-label="Exibir no painel Inbox"
                  size="sm"
                />
              </div>
              {entity === "deal" && (
                <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3">
                  <div>
                    <p className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                      Painel do Negócio
                    </p>
                    <p className="mt-0.5 font-body text-[11.5px] leading-snug text-[var(--text-muted)]">
                      Exibir no deal detail
                    </p>
                  </div>
                  <SwitchGlass
                    checked={showInDealPanel}
                    onChange={setShowInDealPanel}
                    aria-label="Exibir no painel do Negócio"
                    size="sm"
                  />
                </div>
              )}
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-red-100 bg-red-50 px-3 py-2.5">
              <IconAlertCircle size={14} className="shrink-0 text-red-500" />
              <p className="font-body text-[12.5px] text-red-600">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Erro ao salvar"}
              </p>
            </div>
          )}
        </div>
      </form>
    </FormDialog>
  );
}
