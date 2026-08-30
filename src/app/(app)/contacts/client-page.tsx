"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import {
  IconUsers,
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconPencil,
  IconBuilding,
  IconSearch,
  IconCheck,
  IconX,
  IconPhone,
  IconMail,
  IconColumns,
  IconRotateClockwise,
  IconAdjustmentsHorizontal,
  IconDownload,
  IconFileImport,
  IconSettings,
  IconUsersGroup,
  IconArrowMerge,
  IconLoader2,
  IconArrowsSort,
  IconTag,
  IconTrophy,
  IconUserPlus,
  IconUserOff,
  IconMessageCircle,
} from "@tabler/icons-react";
import { Building2, Check, Pencil, Search, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { useCan } from "@/hooks/use-my-permissions";
import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { DataView, DataRow } from "@/components/automations/data-view";
import { ViewToggle, useCardsTableView, type CardsTableView } from "@/components/automations/view-toggle";
import { PageChrome } from "@/components/crm/page-header";
import { SectionHeader } from "@/components/crm/section-header";
import {
  PeriodCalendarButton,
  PeriodIsoRangePanel,
} from "@/components/crm/period-calendar-button";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import {
  FilterApplyButton,
  FilterPopoverBody,
  FilterPopoverFooter,
  FilterPopoverHeader,
  FilterPopoverPanel,
  FilterRadioRow,
  FilterSegmentedTabs,
} from "@/components/crm/filter-popover";
import { ListColumnLabel, LIST_ACTIONS_CELL_CLASS, LIST_ACTIONS_TRACK, SortableHeader, type SortDir } from "@/components/crm/sortable-header";
import {
  ColumnResizer,
  parseWidthClass,
  useColumnWidths,
} from "@/components/crm/column-resizer";
import { LIST_PAGE_PANE_CLASS, LIST_PAGE_STACK_CLASS, PaginationGlass } from "@/components/crm/pagination-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { Chip } from "@/components/crm/chip";
import { InputGlass } from "@/components/crm/input-glass";
import { KpiCard, KPI_TONES, type KpiTone } from "@/components/crm/kpi-card";
import { ListHScroll } from "@/components/crm/list-hscroll";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/phone";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { AVATAR_SIZE } from "@/lib/avatar";
import {
  OmnisearchHitAvatar,
  OmnisearchHitButton,
  OmnisearchResultsPanel,
  OmnisearchSection,
} from "@/components/crm/omnisearch-results";
import { useOmnisearchMenu } from "@/components/crm/use-omnisearch-menu";
import { useContactsOmnisearch } from "@/features/directory-v2/use-directory-omnisearch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { ImportPanel, downloadFromApi } from "@/features/pipeline-v2/import-export";
import { apiUrl } from "@/lib/api";

import {
  useContacts,
  useContactStats,
  useContactTags,
  useContactFieldDefs,
  useContactDuplicates,
  useMergeContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
  useCompanies,
} from "@/features/directory-v2/hooks";
import {
  addContactTag,
  removeContactTag,
  fetchContact,
  type ContactFieldDefDto,
  type ContactListItemDto,
  type ContactStatsDto,
  type DuplicateContactSnap,
  type DuplicateGroup,
  type TagWithCountDto,
} from "@/features/directory-v2/api";
import { usePipelines, useCreateDeal } from "@/features/pipeline-v2/hooks";

const DEFAULT_PER_PAGE = 25;
type ViewMode = CardsTableView;
type Segment = "todos" | "clientes" | "leads" | "sem-resp";

/** Segmentos dos KPI cards (acionáveis) → filtros reais da API.
 *  Clientes = leads com negócios ganhos (lifecycle CUSTOMER). */
const SEGMENTS: {
  id: Segment;
  label: string;
  tone: KpiTone;
  icon: React.ReactNode;
  value: (s: ContactStatsDto | undefined) => number | undefined;
}[] = [
  {
    id: "todos",
    label: "Todos",
    tone: "brand",
    icon: <IconUsers size={20} stroke={2.2} />,
    value: (s) => s?.total,
  },
  {
    id: "clientes",
    label: "Clientes",
    tone: "success",
    icon: <IconTrophy size={20} stroke={2.2} />,
    value: (s) => s?.byStage?.CUSTOMER,
  },
  {
    id: "leads",
    label: "Leads",
    tone: "violet",
    icon: <IconUserPlus size={20} stroke={2.2} />,
    value: (s) => s?.byStage?.LEAD,
  },
  {
    id: "sem-resp",
    label: "Sem responsável",
    tone: "neutral",
    icon: <IconUserOff size={20} stroke={2.2} />,
    value: (s) => s?.unassigned,
  },
];

type SortField = "name" | "createdAt" | "updatedAt" | "leadScore" | "lifecycleStage";

/** Presets de ordenação (campo:direção) — aba Ordenar do painel de filtros. */
const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Mais recentes" },
  { value: "createdAt:asc", label: "Mais antigos" },
  { value: "name:asc", label: "Nome (A–Z)" },
  { value: "name:desc", label: "Nome (Z–A)" },
  { value: "updatedAt:desc", label: "Modificados recentemente" },
] as const;

type FilterPanelTab = "ordenar" | "tags";

const FILTER_TABS: { id: FilterPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: "ordenar", label: "Ordenar", icon: <IconArrowsSort size={14} stroke={2.2} /> },
  { id: "tags", label: "Tags", icon: <IconTag size={14} stroke={2.2} /> },
];

function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

// ── Configurador de colunas (estilo Kommo) ───────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  width: string;
  sortField?: SortField;
  cell: (c: ContactListItemDto) => React.ReactNode;
}

/** Célula de texto padrão (truncada) das colunas da Tabela. */
function txtCell(v: React.ReactNode) {
  return <span className="block truncate font-display text-[13px] text-[var(--text-secondary)]">{v}</span>;
}

/** Colunas nativas opcionais (a coluna Nome/E-mail é fixa e não entra aqui). */
const NATIVE_COLUMNS: ColumnDef[] = [
  { key: "phone", label: "Telefone", width: "w-[160px]", cell: (c) => txtCell(c.phone ? formatPhoneDisplay(c.phone) : "—") },
  { key: "company", label: "Empresa", width: "w-[180px]", cell: (c) => txtCell(c.company?.name ?? "—") },
  {
    key: "tags",
    label: "Tags",
    width: "w-[220px]",
    cell: (c) => (
      <div className="flex flex-wrap gap-1">
        {(c.tags ?? []).slice(0, 3).map((t) => (
          <Chip key={t.id} variant="ghost" color={t.color ?? undefined}>{t.name}</Chip>
        ))}
        {(c.tags?.length ?? 0) > 3 && (
          <span className="font-display text-[11px] text-[var(--text-muted)]">+{(c.tags?.length ?? 0) - 3}</span>
        )}
      </div>
    ),
  },
  { key: "assignedTo", label: "Responsável", width: "w-[170px]", cell: (c) => txtCell(c.assignedTo?.name ?? "—") },
  { key: "createdAt", label: "Criado em", width: "w-[130px]", sortField: "createdAt", cell: (c) => txtCell(fmtDateBR(c.createdAt)) },
  { key: "updatedAt", label: "Modificado em", width: "w-[130px]", sortField: "updatedAt", cell: (c) => txtCell(fmtDateBR(c.updatedAt)) },
];

const DEFAULT_COLUMN_KEYS = ["phone", "company", "tags", "createdAt"];
/** Bump v2: garante Tags no header da lista Cards/Tabela. */
const COLUMNS_STORAGE_KEY = "v2:contacts:columns:v2";
const WIDTHS_STORAGE_KEY = "v2:contacts:col-widths:v1";
const NAME_COL_KEY = "__name__";

const COLUMN_WIDTH_DEFAULTS: Record<string, number> = {
  [NAME_COL_KEY]: 240,
  ...Object.fromEntries(NATIVE_COLUMNS.map((c) => [c.key, parseWidthClass(c.width)])),
};

function customColumnKey(id: string): string {
  return `cf:${id}`;
}

/** Constrói os ColumnDef dos campos customizados a partir das definições. */
function buildCustomColumns(defs: ContactFieldDefDto[]): ColumnDef[] {
  return defs.map((f) => ({
    key: customColumnKey(f.id),
    label: f.label,
    width: "w-[160px]",
    cell: (c) => txtCell(c.customFields?.[f.id] ?? "—"),
  }));
}

/** Estilo de chip com a cor da tag (selecionado = mais forte). */
function tagChipStyle(color: string | null | undefined, selected: boolean): CSSProperties | undefined {
  if (!color) return undefined;
  return selected
    ? {
        color,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 20%, transparent)`,
      }
    : {
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      };
}

export default function V2ContactsClientPage() {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const router = useRouter();

  // "Abrir lead": leva ao negócio do contato; se não existir, cria um
  // no funil padrão (primeiro estágio) vinculado ao contato e abre.
  const { data: pipelines = [] } = usePipelines(isAuthenticated);
  const leadPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;
  const leadStages = leadPipeline?.stages ?? [];
  const createLead = useCreateDeal(leadPipeline?.id ?? null);
  const [openingLeadId, setOpeningLeadId] = useState<string | null>(null);

  async function openLead(contact: ContactListItemDto) {
    if (openingLeadId) return;
    setOpeningLeadId(contact.id);
    try {
      const detail = await fetchContact(contact.id);
      if (detail.deals.length > 0) {
        router.push(`/pipeline/${detail.deals[0].id}`);
        return;
      }
      const firstStageId = leadStages[0]?.id;
      if (!leadPipeline || !firstStageId) {
        toast.error("Nenhum funil disponível para criar o lead.");
        return;
      }
      const { deal } = await createLead.mutateAsync({
        stageId: firstStageId,
        contactId: contact.id,
      });
      if (deal?.id) {
        router.push(`/pipeline/${deal.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir o lead.");
    } finally {
      setOpeningLeadId(null);
    }
  }

  const [view, setView] = useCardsTableView();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [segment, setSegment] = useState<Segment | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [editing, setEditing] = useState<ContactListItemDto | null>(null);
  const [pinnedFromSearch, setPinnedFromSearch] = useState<ContactListItemDto | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMut = useDeleteContact();
  const canCreateContact = useCan("contact:create");
  const canEditContact = useCan("contact:edit");
  const canDeleteContact = useCan("contact:delete");
  const canImportContact = useCan("contact:import");
  const canExportContact = useCan("contact:export");

  function requestEdit(c: ContactListItemDto) {
    if (pinnedFromSearch && pinnedFromSearch.id !== c.id) setPinnedFromSearch(null);
    if (!canEditContact) {
      toast.error("Sem permissão para editar contato.");
      return;
    }
    setEditing(c);
  }

  function handlePickSearchContact(c: ContactListItemDto) {
    setPinnedFromSearch(c);
    setSearch("");
    if (!canEditContact) {
      toast.error("Sem permissão para editar contato.");
      return;
    }
    setEditing(c);
  }

  // Colunas visíveis da Tabela (persistidas no navegador).
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
          // Tags sempre presentes no header (pedido de produto).
          const keys = parsed.includes("tags") ? parsed : [...parsed, "tags"];
          setActiveColumnKeys(keys);
        }
      }
    } catch {
      /* localStorage indisponível — mantém o padrão */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(activeColumnKeys));
    } catch {
      /* ignore */
    }
  }, [activeColumnKeys]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setSelected(new Set());
  }, [debounced, page]);

  useEffect(() => {
    setPage(1);
  }, [segment, tagIds, sortBy, sortOrder, createdFrom, createdTo, updatedFrom, updatedTo]);

  const stageFilter = segment === "clientes" ? "CUSTOMER" : segment === "leads" ? "LEAD" : undefined;
  const unassignedFilter = segment === "sem-resp";

  const statsQuery = useContactStats(isAuthenticated);
  const tagsQuery = useContactTags(isAuthenticated);
  const fieldDefsQuery = useContactFieldDefs(isAuthenticated);

  const customColumns = useMemo(
    () => buildCustomColumns(fieldDefsQuery.data ?? []),
    [fieldDefsQuery.data],
  );
  // Todas as colunas opcionais disponíveis (nativas + customizadas).
  const allOptionalColumns = useMemo(
    () => [...NATIVE_COLUMNS, ...customColumns],
    [customColumns],
  );
  // Colunas ativas, na ordem escolhida, ignorando chaves que não existem mais.
  const activeColumns = useMemo(
    () =>
      activeColumnKeys
        .map((k) => allOptionalColumns.find((c) => c.key === k))
        .filter((c): c is ColumnDef => Boolean(c)),
    [activeColumnKeys, allOptionalColumns],
  );

  const { getWidth, setWidth } = useColumnWidths(WIDTHS_STORAGE_KEY, COLUMN_WIDTH_DEFAULTS);

  function toggleColumn(key: string) {
    setActiveColumnKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const query = useContacts({
    search: debounced || undefined,
    page,
    perPage,
    lifecycleStage: stageFilter,
    unassigned: unassignedFilter,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    updatedFrom: updatedFrom || undefined,
    updatedTo: updatedTo || undefined,
    sortBy,
    sortOrder,
    enabled: isAuthenticated,
  });

  // Contador de filtros ativos do painel (tags). Período vive no calendário.
  const activeFilterCount = tagIds.length;
  const periodActive = !!(createdFrom || createdTo || updatedFrom || updatedTo);

  function clearPanelFilters() {
    setTagIds([]);
  }

  /** Alterna a ordenação por uma coluna (usado pelos cabeçalhos da Tabela). */
  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  }

  const items = query.data?.items ?? [];
  const displayItems = useMemo(() => {
    if (!pinnedFromSearch) return items;
    return [pinnedFromSearch, ...items.filter((c) => c.id !== pinnedFromSearch.id)];
  }, [items, pinnedFromSearch]);
  const total = query.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  const allChecked = displayItems.length > 0 && displayItems.every((c) => selected.has(c.id));
  const someChecked = displayItems.some((c) => selected.has(c.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) displayItems.forEach((c) => next.delete(c.id));
      else displayItems.forEach((c) => next.add(c.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirmDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await deleteMut.mutateAsync(id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setConfirmOpen(false);
    setSelected(new Set());
    if (fail === 0) {
      toast.success(ok === 1 ? "Contato excluído." : `${ok} contatos excluídos.`);
    } else if (ok === 0) {
      toast.error("Não foi possível excluir os contatos selecionados.");
    } else {
      toast.error(`${ok} excluído(s), ${fail} falharam.`);
    }
  }

  const isLoading = query.isLoading && items.length === 0;
  const hasError = !!query.error;

  return (
    <div
      className={cn(
        "v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4",
      )}
    >
      <NavRailSpacer />

      <PageChrome
        header={
        <SectionHeader
          icon={Users}
          title="Contatos"
          searchSlot={
            <ContactsSearchFilterBar
              search={search}
              onSearch={setSearch}
              tags={tagsQuery.data ?? []}
              tagIds={tagIds}
              sortBy={sortBy}
              sortOrder={sortOrder}
              activeCount={activeFilterCount}
              onClear={clearPanelFilters}
              onPick={handlePickSearchContact}
              onApply={(next) => {
                setSortBy(next.sortBy);
                setSortOrder(next.sortOrder);
                setTagIds(next.tagIds);
              }}
            />
          }
          period={
            <PeriodCalendarButton active={periodActive}>
              <PeriodIsoRangePanel
                from={createdFrom}
                to={createdTo}
                onChange={({ from, to }) => {
                  setCreatedFrom(from);
                  setCreatedTo(to);
                }}
                rangeLabel="Criação"
                secondary={{
                  label: "Modificação",
                  from: updatedFrom,
                  to: updatedTo,
                  onChange: ({ from, to }) => {
                    setUpdatedFrom(from);
                    setUpdatedTo(to);
                  },
                }}
                allowClear
                onClear={() => {
                  setCreatedFrom("");
                  setCreatedTo("");
                  setUpdatedFrom("");
                  setUpdatedTo("");
                }}
              />
            </PeriodCalendarButton>
          }
          actions={<ViewToggle value={view} onChange={setView} />}
          menuSlot={
            <ActionsMenu
              canCreate={canCreateContact}
              canImport={canImportContact}
              canExport={canExportContact}
              onAdd={() => {
                if (!canCreateContact) {
                  toast.error("Sem permissão para criar contato.");
                  return;
                }
                setCreateOpen(true);
              }}
              onExport={() => {
                if (!canExportContact) {
                  toast.error("Sem permissão para exportar contatos.");
                  return;
                }
                void downloadFromApi(apiUrl("/api/contacts/export"), "contatos.csv")
                  .then(() => toast.success("Exportação concluída. Verifique seus downloads."))
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao exportar."));
              }}
              onImport={() => {
                if (!canImportContact) {
                  toast.error("Sem permissão para importar contatos.");
                  return;
                }
                setImportOpen(true);
              }}
              onColumns={() => setColumnsOpen(true)}
              onDupes={() => setDupesOpen(true)}
            />
          }
        />
        }
        bodyClassName="gap-4"
      >

        {isLoading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : (
        <>
        {/* KPI cards — mobile: 4 quadrados em h-scroll; desktop: grid */}
        <section className="shrink-0" aria-label="Indicadores de contatos">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden lg:hidden">
            {SEGMENTS.map((seg) => {
              const val = seg.value(statsQuery.data);
              const active = segment === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setSegment((prev) => (prev === seg.id ? null : seg.id))
                  }
                  className={cn(
                    "flex aspect-square w-[104px] shrink-0 flex-col justify-between rounded-[var(--radius-xl)] border p-2.5 text-left shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-colors",
                    active
                      ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)]"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg-base)]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-[var(--radius-md)] [&>svg]:size-4",
                      KPI_TONES[seg.tone],
                    )}
                  >
                    {seg.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-[18px] font-extrabold leading-none tabular-nums text-[var(--text-primary)]">
                      {val === undefined ? "—" : val.toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 truncate font-display text-[10px] font-semibold leading-tight tracking-wide text-muted-foreground">
                      {seg.id === "sem-resp" ? "Sem resp." : seg.label}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="hidden gap-2.5 sm:gap-3.5 lg:grid lg:grid-cols-4">
            {SEGMENTS.map((seg) => {
              const val = seg.value(statsQuery.data);
              return (
                <KpiCard
                  key={seg.id}
                  label={seg.label}
                  value={val === undefined ? "—" : val.toLocaleString("pt-BR")}
                  icon={seg.icon}
                  tone={seg.tone}
                  active={segment === seg.id}
                  onClick={() =>
                    setSegment((prev) => (prev === seg.id ? null : seg.id))
                  }
                />
              );
            })}
          </div>
        </section>

        {/* Barra de seleção em massa */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-4 py-2.5 backdrop-blur-md">
            <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">
              {selected.size} selecionado{selected.size > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <ButtonGlass
                variant="glass" size="sm" type="button"
                onClick={() => setSelected(new Set())}
                className="border-transparent bg-transparent shadow-none text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
              >
                Limpar
              </ButtonGlass>
              <ButtonGlass
                variant="danger"
                size="sm"
                type="button"
                disabled={!canDeleteContact}
                onClick={() => {
                  if (!canDeleteContact) {
                    toast.error("Sem permissão para excluir contato.");
                    return;
                  }
                  setConfirmOpen(true);
                }}
              >
                <IconTrash size={14} /> Excluir
              </ButtonGlass>
            </div>
          </div>
        )}

        {/* Estados: erro / vazio / lista */}
        <div className={LIST_PAGE_PANE_CLASS}>
        {hasError ? (
          <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center font-body text-[13px] text-[var(--color-danger-text)]">
            {query.error instanceof Error ? query.error.message : "Erro ao carregar."}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-md shadow-[var(--glass-shadow)]">
            <EmptyState
              icon={<IconUsers size={28} />}
              title="Nenhum contato encontrado"
              description={
                debounced
                  ? `Sem resultados para "${debounced}".`
                  : (segment != null && segment !== "todos") || activeFilterCount > 0
                    ? "Nenhum contato para os filtros selecionados."
                    : "Crie contatos no Inbox ou via API."
              }
            />
          </div>
        ) : (
          <CardsView
            view={view}
            items={displayItems}
            selected={selected}
            allChecked={allChecked}
            someChecked={someChecked}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            columns={activeColumns}
            getWidth={getWidth}
            setWidth={setWidth}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSort}
            onEdit={requestEdit}
            onOpenLead={openLead}
            openingLeadId={openingLeadId}
          />
        )}

        <PaginationGlass
          total={total}
          totalCapped={query.data?.hasMore === true}
          entityLabel="contatos"
          page={page}
          lastPage={lastPage}
          canPrev={page > 1}
          canNext={page < lastPage}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          perPage={perPage}
          onPerPageChange={(value) => { setPerPage(value); setPage(1); }}
        />
        </div>
        </>
        )}
      </PageChrome>

      <ContactFormDialog
        open={createOpen || editing !== null}
        contact={editing}
        availableTags={tagsQuery.data ?? []}
        onOpenChange={(next) => {
          if (!next) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
      />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
      <DuplicatesSheet open={dupesOpen} onOpenChange={setDupesOpen} />
      <ColumnsDialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        nativeColumns={NATIVE_COLUMNS}
        customColumns={customColumns}
        activeKeys={activeColumnKeys}
        onToggle={toggleColumn}
        onReset={() => setActiveColumnKeys(DEFAULT_COLUMN_KEYS)}
      />
      <ConfirmDeleteDialog
        open={confirmOpen} count={selected.size} pending={deleteMut.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

// ── Busca + painel de filtros segmentado (DS v2) ─────────────────────────────


type ContactFilterDraft = {
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  tagIds: string[];
};

function ContactsSearchFilterBar({
  search, onSearch, tags, tagIds,
  sortBy, sortOrder, activeCount, onClear, onApply, onPick,
}: {
  search: string;
  onSearch: (v: string) => void;
  tags: TagWithCountDto[];
  tagIds: string[];
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  activeCount: number;
  onClear: () => void;
  onApply: (next: ContactFilterDraft) => void;
  onPick?: (c: ContactListItemDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FilterPanelTab>("ordenar");
  const [tagQuery, setTagQuery] = useState("");
  const [draft, setDraft] = useState<ContactFilterDraft>({
    sortBy, sortOrder, tagIds,
  });
  const ref = useRef<HTMLDivElement>(null);
  const hits = useContactsOmnisearch(search, search.trim().length >= 3);
  const menu = useOmnisearchMenu(search, hits.items.length);

  function pickContact(c: ContactListItemDto) {
    onPick?.(c);
    menu.close();
  }

  useEffect(() => {
    if (!open) return;
    setDraft({ sortBy, sortOrder, tagIds });
    setTagQuery("");
  }, [open, sortBy, sortOrder, tagIds]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const visibleTags = (tags ?? [])
    .filter((t) => t.contactCount > 0)
    .filter((t) => t.name.toLowerCase().includes(tagQuery.trim().toLowerCase()));
  const tagSet = new Set(draft.tagIds);
  const sortKey = `${draft.sortBy}:${draft.sortOrder}`;

  const tagsCount = draft.tagIds.length;
  const draftActiveCount = tagsCount;

  function toggleDraftTag(id: string) {
    setDraft((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(id)
        ? prev.tagIds.filter((t) => t !== id)
        : [...prev.tagIds, id],
    }));
  }

  function handleClear() {
    setDraft((prev) => ({
      ...prev,
      tagIds: [],
    }));
    onClear();
  }

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  const tabBadge = (id: FilterPanelTab) => {
    if (id === "tags") return tagsCount;
    return 0;
  };

  return (
    <div ref={ref} className="relative w-full">
      <div ref={menu.wrapRef}>
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar contatos"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => {
          menu.close();
          setOpen((o) => !o);
        }}
        onFocus={() => menu.setFocused(true)}
        onKeyDown={(e) =>
          menu.onInputKeyDown(e, () => {
            const c = hits.items[menu.activeIndex] ?? hits.items[0];
            if (c) pickContact(c);
          })
        }
      />
      </div>
      {menu.showHits && menu.coords && typeof document !== "undefined" && (
        <OmnisearchResultsPanel
          coords={menu.coords}
          loading={hits.isLoading || hits.waitingDebounce}
          query={hits.query || search.trim()}
          empty={hits.items.length === 0}
          total={hits.items.length}
          onSeeAll={menu.close}
        >
          <OmnisearchSection icon={<IconUsers size={13} />} label="Contatos" count={hits.items.length}>
            {hits.items.map((c, i) => {
              const phone = formatPhoneDisplay(c.phone) || c.phone?.trim() || null;
              return (
                <OmnisearchHitButton
                  key={c.id}
                  active={i === menu.activeIndex}
                  onHover={() => menu.setActiveIndex(i)}
                  onClick={() => pickContact(c)}
                >
                  <OmnisearchHitAvatar
                    id={c.id}
                    name={c.name}
                    imageUrl={c.avatarUrl}
                    overlay={<IconUsers size={10} />}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                        {c.name}
                      </span>
                      {c.number != null && (
                        <span className="shrink-0 font-body text-[12px] tabular-nums text-[var(--text-muted)]">
                          #{c.number}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-body text-[12px] text-[var(--text-secondary)]">
                      <IconPhone size={12} className="shrink-0 text-[var(--text-muted)]" />
                      <span className="truncate">{phone || c.email || c.company?.name || "Abrir contato"}</span>
                    </span>
                  </span>
                </OmnisearchHitButton>
              );
            })}
          </OmnisearchSection>
        </OmnisearchResultsPanel>
      )}

      {open && (
        <FilterPopoverPanel>
          <FilterPopoverHeader
            count={draftActiveCount || activeCount}
            onClear={handleClear}
            clearDisabled={draftActiveCount === 0 && activeCount === 0}
          />
          <FilterSegmentedTabs
            value={tab}
            onChange={setTab}
            tabs={FILTER_TABS.map((t) => ({
              id: t.id,
              label: t.label,
              icon: t.icon,
              badge: tabBadge(t.id),
            }))}
          />

          <FilterPopoverBody>
            {tab === "ordenar" && (
              <div className="flex flex-col gap-0.5" role="listbox" aria-label="Ordenar por">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Ordenar resultados por
                </p>
                {SORT_OPTIONS.map((opt) => {
                  const selected = sortKey === opt.value;
                  return (
                    <FilterRadioRow
                      key={opt.value}
                      selected={selected}
                      onClick={() => {
                        const [f, o] = opt.value.split(":");
                        setDraft((prev) => ({
                          ...prev,
                          sortBy: f as SortField,
                          sortOrder: o as "asc" | "desc",
                        }));
                      }}
                    >
                      {opt.label}
                    </FilterRadioRow>
                  );
                })}
              </div>
            )}

            {tab === "tags" && (
              <div>
                <div className="relative mb-2.5">
                  <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Localizar tags..."
                    className={cn(formControlClass, "h-9 pl-8 text-sm")}
                  />
                </div>
                <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
                  {visibleTags.length === 0 ? (
                    <span className="px-1 py-1 text-sm text-muted-foreground">Nenhuma tag.</span>
                  ) : visibleTags.map((t) => {
                    const on = tagSet.has(t.id);
                    const colored = Boolean(t.color);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleDraftTag(t.id)}
                        aria-pressed={on}
                        style={tagChipStyle(t.color, on)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm font-semibold transition-colors",
                          !colored &&
                            (on
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-card text-muted-foreground hover:bg-secondary"),
                        )}
                      >
                        {on ? <IconCheck size={13} stroke={2.6} /> : <IconPlus size={13} stroke={2.4} />}
                        {t.name}
                        <span className={colored ? "opacity-70" : "text-muted-foreground"}>{t.contactCount}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </FilterPopoverBody>
          <FilterPopoverFooter>
            <FilterApplyButton onClick={handleApply} className="w-full justify-center">
              {draftActiveCount > 0 ? `Aplicar (${draftActiveCount})` : "Aplicar"}
            </FilterApplyButton>
          </FilterPopoverFooter>
        </FilterPopoverPanel>
      )}
    </div>
  );
}

// ── Menu de ações (hambúrguer estilo Kommo) ──────────────────────────────────

function ActionsMenu({
  onAdd, onExport, onImport, onColumns, onDupes,
  canCreate = true, canImport = true, canExport = true,
}: {
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
  onColumns: () => void;
  onDupes: () => void;
  canCreate?: boolean;
  canImport?: boolean;
  canExport?: boolean;
}) {
  const items = [
    canCreate
      ? { icon: <IconPlus size={14} stroke={2.6} />, label: "Adicionar contato", onClick: onAdd, primary: true as const }
      : null,
    canExport
      ? { icon: <IconDownload size={13} />, label: "Exportar", onClick: onExport }
      : null,
    canImport
      ? { icon: <IconFileImport size={13} />, label: "Importar", onClick: onImport }
      : null,
    { icon: <IconSettings size={13} />, label: "Configurações da lista", onClick: onColumns, divider: true as const },
    { icon: <IconUsersGroup size={13} />, label: "Localizar duplicadas", onClick: onDupes },
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return <PageActionsMenu items={items} />;
}

// ── Localizar duplicadas ─────────────────────────────────────────────────────

function DuplicatesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, isLoading, refetch } = useContactDuplicates(open);
  const mergeMut = useMergeContacts();
  const [merging, setMerging] = useState<string | null>(null); // grupo sendo mesclado
  const [done, setDone] = useState<Set<string>>(new Set()); // chaves já resolvidas

  useEffect(() => {
    if (open) { setDone(new Set()); void refetch(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = (data?.groups ?? []).filter((g) => !done.has(`${g.field}:${g.key}`));

  async function handleMerge(group: DuplicateGroup, keepId: string) {
    const sig = `${group.field}:${group.key}`;
    setMerging(sig);
    const removeIds = group.contacts.filter((c) => c.id !== keepId).map((c) => c.id);
    let ok = 0;
    let fail = 0;
    for (const removeId of removeIds) {
      try {
        await mergeMut.mutateAsync({ keepId, removeId });
        ok++;
      } catch {
        fail++;
      }
    }
    setMerging(null);
    if (fail === 0) {
      toast.success(`${ok} contato(s) mesclado(s) com sucesso.`);
      setDone((prev) => new Set(prev).add(sig));
    } else {
      toast.error(`${ok} mesclado(s), ${fail} falha(s). Verifique suas permissões (requer Administrador).`);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Localizar duplicadas"
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {/* Summary */}
        <p className="font-body text-[13px] leading-relaxed text-[var(--text-muted)]">
          Contatos com o mesmo telefone ou e-mail são exibidos abaixo. Escolha qual manter — os outros serão mesclados nele (conversas, negócios e notas são preservados).
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-muted)]">
            <IconLoader2 size={20} className="animate-spin" />
            <span className="font-body text-[13px]">Analisando contatos…</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">
              <IconCheck size={24} />
            </span>
            <p className="font-display text-[15px] font-bold text-[var(--text-primary)]">Nenhuma duplicata encontrada</p>
            <p className="font-body text-[13px] text-[var(--text-muted)]">Todos os contatos têm telefone e e-mail únicos.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">
                {groups.length} grupo{groups.length > 1 ? "s" : ""} encontrado{groups.length > 1 ? "s" : ""}
              </span>
              <span className="font-body text-[12px] text-[var(--text-muted)]">Clique em "Manter" para preservar o contato</span>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto">
              {groups.map((group) => {
                const sig = `${group.field}:${group.key}`;
                const isMerging = merging === sig;
                return (
                  <div
                    key={sig}
                    className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4"
                  >
                    {/* Header do grupo */}
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`flex h-6 items-center gap-1 rounded-full border px-2.5 font-display text-[11px] font-bold uppercase tracking-wider ${
                        group.field === "phone"
                          ? "border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]"
                          : "border-[var(--color-success)]/30 bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                      }`}>
                        {group.field === "phone" ? <IconPhone size={11} /> : <IconMail size={11} />}
                        {group.field === "phone" ? "Telefone" : "E-mail"}
                      </span>
                      <span className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">{group.key}</span>
                      <span className="font-body text-[12px] text-[var(--text-muted)]">· {group.contacts.length} contatos</span>
                    </div>

                    {/* Contatos do grupo */}
                    <div className="flex flex-col gap-2">
                      {group.contacts.map((c) => (
                        <DuplicateContactRow
                          key={c.id}
                          contact={c}
                          disabled={isMerging}
                          onKeep={() => void handleMerge(group, c.id)}
                        />
                      ))}
                    </div>

                    {isMerging && (
                      <div className="mt-2 flex items-center gap-2 pt-1 text-[var(--text-muted)]">
                        <IconLoader2 size={14} className="animate-spin" />
                        <span className="font-body text-[12px]">Mesclando…</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </FormDialog>
  );
}

function DuplicateContactRow({
  contact, disabled, onKeep,
}: {
  contact: DuplicateContactSnap;
  disabled: boolean;
  onKeep: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-2.5">
      <ChatAvatar
        user={{ id: contact.id, name: contact.name, imageUrl: contact.avatarUrl ?? null }}
        phone={contact.phone}
        channel={contact.phone ? "whatsapp" : null}
        size={AVATAR_SIZE.sm}
      />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/contacts/${contact.number ?? contact.id}`}
            className="truncate font-display text-[13px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
          >
            {contact.name}
          </Link>
          {contact.company && (
            <span className="truncate font-body text-[12px] text-[var(--text-muted)]">
              · {contact.company.name}
            </span>
          )}
        </div>
        <div className="flex gap-3 font-body text-[12px] text-[var(--text-muted)]">
          {contact.email && <span className="truncate">{contact.email}</span>}
          {contact.phone && <span className="truncate">{formatPhoneDisplay(contact.phone)}</span>}
          <span>Criado {fmtDateBR(contact.createdAt)}</span>
          {contact.assignedTo && <span>· {contact.assignedTo.name}</span>}
        </div>
      </div>

      {/* Ação */}
      <ButtonGlass
        variant="primary"
        size="sm"
        type="button"
        disabled={disabled}
        onClick={onKeep}
        className="shrink-0"
      >
        <IconArrowMerge size={14} />
        Manter este
      </ButtonGlass>
    </div>
  );
}

// ── Importação (sheet com ImportPanel) ───────────────────────────────────────

function ImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Importar contatos" size="lg">
      <ImportPanel
        fixedEntity="contacts"
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["v2-contacts"], exact: false });
          qc.invalidateQueries({ queryKey: ["v2-contact-stats"] });
        }}
      />
    </FormDialog>
  );
}

// ── Configurações da lista / colunas (dialog estilo Kommo) ───────────────────

function ColumnsDialog({
  open, onOpenChange, nativeColumns, customColumns, activeKeys, onToggle, onReset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nativeColumns: ColumnDef[];
  customColumns: ColumnDef[];
  activeKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const activeSet = new Set(activeKeys);

  function renderChip(col: ColumnDef) {
    const on = activeSet.has(col.key);
    return (
      <button
        key={col.key}
        type="button"
        onClick={() => onToggle(col.key)}
        aria-pressed={on}
        className={`flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors ${
          on
            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
            : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]"
        }`}
      >
        {on ? <IconCheck size={13} stroke={2.6} /> : <IconPlus size={13} stroke={2.4} />}
        {col.label}
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
              <IconColumns size={18} />
            </span>
            <DialogTitle className="text-base">Configurações da lista</DialogTitle>
          </div>
          <DialogDescription className="text-[13px] leading-relaxed">
            Escolha as colunas exibidas na visão em Tabela. Suas escolhas ficam salvas neste navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex items-center justify-between">
            <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Colunas nativas</span>
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 font-display text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)]"
            >
              <IconRotateClockwise size={12} /> Restaurar padrão
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">{nativeColumns.map(renderChip)}</div>
          {customColumns.length > 0 && (
            <>
              <div className="mt-2 font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Campos personalizados</div>
              <div className="flex flex-wrap gap-1.5">{customColumns.map(renderChip)}</div>
            </>
          )}
        </div>
        <DialogFooter>
          <ButtonGlass variant="primary" size="sm" type="button" onClick={() => onOpenChange(false)}>
            Concluído
          </ButtonGlass>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardsView({
  view = "cards",
  items, selected, allChecked, someChecked, onToggleAll, onToggleOne, columns, getWidth, setWidth, sortBy, sortOrder, onSort, onEdit, onOpenLead, openingLeadId,
}: {
  view?: CardsTableView;
  items: ContactListItemDto[];
  selected: Set<string>;
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  columns: ColumnDef[];
  getWidth: (key: string, fallback?: number) => number;
  setWidth: (key: string, px: number) => void;
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
  onEdit: (c: ContactListItemDto) => void;
  onOpenLead: (c: ContactListItemDto) => void;
  openingLeadId: string | null;
}) {
  const dirFor = (f: SortField): SortDir => (sortBy === f ? sortOrder : null);
  const nameW = getWidth(NAME_COL_KEY, 240);
  const gridTemplate = [
    "32px",
    `minmax(${nameW}px, 1fr)`,
    ...columns.map((c) => `${getWidth(c.key, parseWidthClass(c.width))}px`),
    LIST_ACTIONS_TRACK,
  ].join(" ");

  const header = (
    <>
        <span>
          <CheckboxGlass checked={allChecked} indeterminate={!allChecked && someChecked} onChange={onToggleAll} aria-label="Selecionar todos" />
        </span>
        <div className="relative min-w-0 overflow-x-hidden overflow-y-visible pr-1">
          <SortableHeader label="Contato" sort={dirFor("name")} onSort={() => onSort("name")} />
          <ColumnResizer value={nameW} onChange={(px) => setWidth(NAME_COL_KEY, px)} min={160} max={420} />
        </div>
        {columns.map((col) => {
          const w = getWidth(col.key, parseWidthClass(col.width));
          return (
            <div key={col.key} className="relative min-w-0 overflow-x-hidden overflow-y-visible pr-1">
              {col.sortField ? (
                <SortableHeader
                  label={col.label}
                  sort={dirFor(col.sortField)}
                  onSort={() => onSort(col.sortField as SortField)}
                />
              ) : (
                <ListColumnLabel>{col.label}</ListColumnLabel>
              )}
              <ColumnResizer value={w} onChange={(px) => setWidth(col.key, px)} min={72} max={480} />
            </div>
          );
        })}
        <ListColumnLabel align="right">Ações</ListColumnLabel>
    </>
  );

  return (
    <ListHScroll scrollerClassName="pb-1">
    <DataView
      view={view}
      columnClass="grid items-center justify-start gap-3"
      header={header}
      className={cn("w-max min-w-full", LIST_PAGE_STACK_CLASS)}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {items.map((c) => {
        const isSelected = selected.has(c.id);
        return (
          <DataRow
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onEdit(c)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEdit(c); } }}
            className={cn(
              "group cursor-pointer",
              isSelected && "border-primary bg-primary/10",
            )}
          >
            <span onClick={(e) => e.stopPropagation()}>
              <CheckboxGlass checked={isSelected} onChange={() => onToggleOne(c.id)} aria-label={`Selecionar ${c.name}`} />
            </span>

            <div className="flex min-w-0 items-center gap-2.5">
              <ChatAvatar
                user={{ id: c.id, name: c.name, imageUrl: c.avatarUrl ?? null }}
                phone={c.phone}
                channel={c.phone ? "whatsapp" : null}
                size={AVATAR_SIZE.md}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(c); }}
                  className="block w-full truncate text-left font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
                >
                  {c.name}
                </button>
                <div className="truncate font-body text-[12px] text-[var(--text-muted)]">{c.email ?? "—"}</div>
              </div>
            </div>

            {columns.map((col) => (
              <div key={col.key} className="min-w-0">
                {col.cell(c)}
              </div>
            ))}

            <div className={LIST_ACTIONS_CELL_CLASS}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenLead(c); }}
                disabled={openingLeadId === c.id}
                aria-label={`Abrir lead de ${c.name}`}
                title="Abrir lead (cria se não existir)"
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)] disabled:opacity-50"
              >
                {openingLeadId === c.id ? <IconLoader2 size={16} className="animate-spin" /> : <IconMessageCircle size={16} />}
              </button>
              <a href={c.phone ? `tel:${c.phone}` : undefined} onClick={(e) => e.stopPropagation()} aria-label="Ligar" aria-disabled={!c.phone} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]">
                <IconPhone size={16} />
              </a>
              <a href={c.email ? `mailto:${c.email}` : undefined} onClick={(e) => e.stopPropagation()} aria-label="Enviar e-mail" aria-disabled={!c.email} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]">
                <IconMail size={16} />
              </a>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(c); }}
                aria-label={`Editar ${c.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
              >
                <IconPencil size={16} />
              </button>
            </div>
          </DataRow>
        );
      })}
    </DataView>
    </ListHScroll>
  );
}

// ── Dialogs (inalterados) ────────────────────────────────────────────────────

export function ConfirmDeleteDialog({ open, count, pending, onCancel, onConfirm }: {
  open: boolean; count: number; pending: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] text-[var(--color-destructive)]">
              <IconAlertTriangle size={18} />
            </span>
            <DialogTitle className="text-base">{`Excluir ${count === 1 ? "contato" : `${count} contatos`}?`}</DialogTitle>
          </div>
          <DialogDescription className="text-[13px] leading-relaxed">
            Esta ação não pode ser desfeita. {count === 1 ? "O contato será removido" : "Os contatos serão removidos"} junto com as conversas, mensagens, notas e atividades vinculadas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <ButtonGlass variant="glass" size="sm" type="button" onClick={onCancel} disabled={pending} className="border-transparent bg-transparent shadow-none text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]">
            Cancelar
          </ButtonGlass>
          <ButtonGlass variant="danger" size="sm" type="button" onClick={onConfirm} disabled={pending}>
            <IconTrash size={14} /> {pending ? "Excluindo..." : "Excluir"}
          </ButtonGlass>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactFormDialog({
  open, contact, availableTags, onOpenChange,
}: {
  open: boolean;
  contact: ContactListItemDto | null;
  availableTags: TagWithCountDto[];
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = contact !== null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const createMut = useCreateContact();
  const updateMut = useUpdateContact();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setName(contact.name);
      setEmail(contact.email ?? "");
      setPhone(contact.phone ?? "");
      setCompanyId(contact.company?.id ?? null);
      setCompanyName(contact.company?.name ?? null);
      setSelectedTagIds((contact.tags ?? []).map((t) => t.id));
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setCompanyId(null);
      setCompanyName(null);
      setSelectedTagIds([]);
    }
    setTagQuery("");
    createMut.reset();
    updateMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?.id]);

  const visibleTags = availableTags
    .filter((t) => t.name.toLowerCase().includes(tagQuery.trim().toLowerCase()))
    .slice(0, 40);
  const tagSet = new Set(selectedTagIds);
  const pending = saving || createMut.isPending || updateMut.isPending;

  function toggleTag(id: string) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  async function syncTags(contactId: string, nextIds: string[], prevIds: string[]) {
    const toAdd = nextIds.filter((id) => !prevIds.includes(id));
    const toRemove = prevIds.filter((id) => !nextIds.includes(id));
    await Promise.all([
      ...toAdd.map((tagId) => addContactTag(contactId, tagId)),
      ...toRemove.map((tagId) => removeContactTag(contactId, tagId)),
    ]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || pending) return;
    setSaving(true);
    const body = {
      name: n,
      email: email.trim() || null,
      phone: phone.trim() || null,
      companyId,
    };
    try {
      if (isEdit && contact) {
        await updateMut.mutateAsync({ id: contact.id, body });
        const prevIds = (contact.tags ?? []).map((t) => t.id);
        await syncTags(contact.id, selectedTagIds, prevIds);
        void qc.invalidateQueries({ queryKey: ["v2-contacts"], exact: false });
        toast.success("Contato atualizado.");
      } else {
        const created = await createMut.mutateAsync(body);
        if (selectedTagIds.length > 0) {
          await syncTags(created.id, selectedTagIds, []);
          void qc.invalidateQueries({ queryKey: ["v2-contacts"], exact: false });
        }
        toast.success("Contato criado.");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar contato.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar contato" : "Novo contato"}
      description={isEdit ? name || contact?.name : "Cadastre um contato e vincule empresa e tags."}
      icon={
        <FormDialogIcon>
          {isEdit ? <Pencil className="size-4" /> : <UserPlus className="size-4" />}
        </FormDialogIcon>
      }
      size="md"
      busy={pending}
      footer={
        <>
          <ButtonGlass variant="glass" size="sm" type="button" onClick={() => onOpenChange(false)} disabled={pending} className={formDialogCancelClass}>Cancelar</ButtonGlass>
          <ButtonGlass variant="primary" size="sm" type="submit" form="contact-form-sheet" disabled={!name.trim() || pending} className={formDialogPrimaryClass}>
            {pending ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
          </ButtonGlass>
        </>
      }
    >
      <form id="contact-form-sheet" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="block">
          <span className={formLabelClass}>Nome *</span>
          <InputGlass type="text" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Maria Silva" className={formControlClass} />
        </label>
        <label className="block">
          <span className={formLabelClass}>E-mail</span>
          <InputGlass type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com" className={formControlClass} />
        </label>
        <label className="block">
          <span className={formLabelClass}>Telefone</span>
          <InputGlass type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className={formControlClass} />
        </label>
        <div>
          <span className={formLabelClass}>Empresa</span>
          <CompanyPicker valueId={companyId} valueName={companyName} onChange={(id, nm) => { setCompanyId(id); setCompanyName(nm); }} />
        </div>
        <div>
          <span className={formLabelClass}>
            Tags{selectedTagIds.length > 0 ? ` (${selectedTagIds.length})` : ""}
          </span>
          <div className="relative mb-2.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Localizar tags..."
              className={cn(formControlClass, "w-full pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20")}
            />
          </div>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {visibleTags.length === 0 ? (
              <span className="px-1 py-1 text-[12px] text-muted-foreground">Nenhuma tag.</span>
            ) : visibleTags.map((t) => {
              const on = tagSet.has(t.id);
              const colored = Boolean(t.color);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  aria-pressed={on}
                  style={tagChipStyle(t.color, on)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                    !colored &&
                      (on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-secondary"),
                  )}
                >
                  {on ? t.name : `+ ${t.name}`}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </FormDialog>
  );
}

function CompanyPicker({ valueId, valueName, onChange }: {
  valueId: string | null; valueName: string | null;
  onChange: (id: string | null, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useCompanies({ search: debounced || undefined, page: 1, perPage: 20, enabled: open });
  const options = data?.items ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(formControlClass, "flex w-full items-center justify-start gap-2 px-3 text-left outline-none focus:border-primary focus:ring-2 focus:ring-primary/20")}
      >
        {valueName ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[13px] text-foreground">
            <Building2 className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{valueName}</span>
            {valueId ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Remover vínculo de empresa"
                onClick={(e) => { e.stopPropagation(); onChange(null, null); }}
                className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <X className="size-3" />
              </span>
            ) : null}
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
            <Building2 className="size-4 shrink-0" />
            Sem empresa vinculada
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa..." className="w-full bg-transparent text-[13px] text-foreground outline-none" />
          </div>
          <div className="max-h-44 overflow-y-auto py-1">
            {isLoading ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">Carregando...</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">{debounced ? "Nenhuma empresa encontrada." : "Digite para buscar."}</div>
            ) : options.map((co) => {
              const active = co.id === valueId;
              return (
                <button key={co.id} type="button" onClick={() => { onChange(co.id, co.name); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-secondary">
                  <span className="truncate">{co.name}</span>
                  {active && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
