"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import {
  IconBuilding,
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconPencil,
  IconPhone,
  IconMail,
  IconSettings,
  IconCheck,
  IconColumns,
  IconRotateClockwise,
  IconBuildingCommunity,
  IconMailOff,
  IconPhoneOff,
  IconSearch,
  IconAdjustmentsHorizontal,
  IconArrowsSort,
  IconMapPin,
} from "@tabler/icons-react";
import { Building2, LayoutList, Pencil, Table2 } from "lucide-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { HeaderPillToggle, SectionHeader } from "@/components/crm/section-header";
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
import { ListColumnLabel, LIST_CARD_ROW_CLASS, LIST_CARD_STACK_CLASS, SortableHeader, listTableHeadRowClass, type SortDir } from "@/components/crm/sortable-header";
import {
  ColumnResizer,
  parseWidthClass,
  ResizableColumnHead,
  useColumnWidths,
} from "@/components/crm/column-resizer";
import { PaginationGlass } from "@/components/crm/pagination-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { BadgeGlass } from "@/components/crm/badge-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { KpiCard, KpiSquareScroll, type KpiTone } from "@/components/crm/kpi-card";
import { ListHScroll } from "@/components/crm/list-hscroll";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { AVATAR_SIZE } from "@/lib/avatar";
import {
  OmnisearchHitAvatar,
  OmnisearchHitButton,
  OmnisearchResultsPanel,
  OmnisearchSection,
} from "@/components/crm/omnisearch-results";
import { useOmnisearchMenu } from "@/components/crm/use-omnisearch-menu";
import { useCompaniesOmnisearch } from "@/features/directory-v2/use-directory-omnisearch";
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
  FormDialogGlyphPlus,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";

import {
  useCompanies,
  useCompanyFacets,
  useCompanyStats,
  useCreateCompany,
  useDeleteCompany,
  useUpdateCompany,
} from "@/features/directory-v2/hooks";
import type {
  CompanyFacetsDto,
  CompanyListItemDto,
  CompanySegment,
  CompanySortField,
  CompanyStatsDto,
} from "@/features/directory-v2/api";

const DEFAULT_PER_PAGE = 25;
type ViewMode = "cards" | "tabela";

const SEGMENTS: {
  id: CompanySegment;
  label: string;
  tone: KpiTone;
  icon: React.ReactNode;
  value: (s: CompanyStatsDto | undefined) => number | undefined;
}[] = [
  {
    id: "todos",
    label: "Todas",
    tone: "brand",
    icon: <IconBuilding size={20} stroke={2.2} />,
    value: (s) => s?.total,
  },
  {
    id: "com-contatos",
    label: "Com contatos",
    tone: "violet",
    icon: <IconBuildingCommunity size={20} stroke={2.2} />,
    value: (s) => s?.withContacts,
  },
  {
    id: "sem-email",
    label: "Sem e-mail",
    tone: "warning",
    icon: <IconMailOff size={20} stroke={2.2} />,
    value: (s) => s?.withoutEmail,
  },
  {
    id: "sem-telefone",
    label: "Sem telefone",
    tone: "neutral",
    icon: <IconPhoneOff size={20} stroke={2.2} />,
    value: (s) => s?.withoutPhone,
  },
];

interface ColumnDef {
  key: string;
  label: string;
  width: string;
  /** Campo de ordenação server-side, quando aplicável. */
  sortField?: CompanySortField;
  cell: (c: CompanyListItemDto) => React.ReactNode;
}

function txtCell(v: React.ReactNode) {
  return <span className="block truncate font-display text-[13px] text-[var(--text-secondary)]">{v}</span>;
}

const NATIVE_COLUMNS: ColumnDef[] = [
  { key: "phone", label: "Telefone", width: "w-[160px]", cell: (c) => txtCell(c.phone ? formatPhoneDisplay(c.phone) : "—") },
  { key: "domain", label: "E-mail", width: "w-[180px]", cell: (c) => txtCell(c.domain ?? "—") },
  { key: "size", label: "CNPJ", width: "w-[150px]", cell: (c) => txtCell(c.size ?? "—") },
  { key: "industry", label: "Setor", width: "w-[140px]", cell: (c) => txtCell(c.industry ?? "—") },
  { key: "cep", label: "CEP", width: "w-[110px]", cell: (c) => txtCell(c.cep ?? "—") },
  { key: "city", label: "Cidade", width: "w-[140px]", cell: (c) => txtCell(c.city ?? "—") },
  { key: "state", label: "Estado", width: "w-[90px]", cell: (c) => txtCell(c.state ?? "—") },
  { key: "address", label: "Endereço", width: "w-[200px]", cell: (c) => txtCell(c.address ?? "—") },
  {
    key: "contacts",
    label: "Contatos",
    width: "w-[100px]",
    cell: (c) => <BadgeGlass variant="enterprise">{c._count.contacts}</BadgeGlass>,
  },
  { key: "createdAt", label: "Criado em", width: "w-[130px]", sortField: "createdAt", cell: (c) => txtCell(fmtDateBR(c.createdAt)) },
];

const DEFAULT_COLUMN_KEYS = ["phone", "domain", "city", "state", "contacts", "createdAt"];
const COLUMNS_STORAGE_KEY = "v2:companies:columns:v1";
const WIDTHS_STORAGE_KEY = "v2:companies:col-widths:v1";
const NAME_COL_KEY = "__name__";

const COLUMN_WIDTH_DEFAULTS: Record<string, number> = {
  [NAME_COL_KEY]: 240,
  ...Object.fromEntries(NATIVE_COLUMNS.map((c) => [c.key, parseWidthClass(c.width)])),
};

// ── Filtro (padrão Contatos) ─────────────────────────────────────────────────

/** Presets de ordenação (campo:direção) — aba Ordenar do painel de filtros. */
const SORT_OPTIONS = [
  { value: "name:asc", label: "Nome (A–Z)" },
  { value: "name:desc", label: "Nome (Z–A)" },
  { value: "createdAt:desc", label: "Mais recentes" },
  { value: "createdAt:asc", label: "Mais antigas" },
  { value: "updatedAt:desc", label: "Modificadas recentemente" },
] as const;

type FilterPanelTab = "ordenar" | "local";

const FILTER_TABS: { id: FilterPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: "ordenar", label: "Ordenar", icon: <IconArrowsSort size={14} stroke={2.2} /> },
  { id: "local", label: "Local", icon: <IconMapPin size={14} stroke={2.2} /> },
];

type CompanyFilterDraft = {
  sortBy: CompanySortField;
  sortOrder: "asc" | "desc";
  state: string;
  city: string;
  industry: string;
};


function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

export default function V2CompaniesClientPage() {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const [view, setView] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [segment, setSegment] = useState<CompanySegment | null>(null);
  const [sortBy, setSortBy] = useState<CompanySortField>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [createOpen, setCreateOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyListItemDto | null>(null);
  const [pinnedFromSearch, setPinnedFromSearch] = useState<CompanyListItemDto | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMut = useDeleteCompany();

  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
          setActiveColumnKeys(parsed);
        }
      }
    } catch {
      /* localStorage indisponível */
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
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setSelected(new Set()); }, [debounced, page, segment]);
  useEffect(() => {
    setPage(1);
  }, [segment, sortBy, sortOrder, createdFrom, createdTo, filterState, filterCity, filterIndustry]);

  const activeFilterCount =
    (filterState ? 1 : 0) +
    (filterCity ? 1 : 0) +
    (filterIndustry ? 1 : 0);
  const periodActive = !!(createdFrom || createdTo);

  function clearPanelFilters() {
    setFilterState("");
    setFilterCity("");
    setFilterIndustry("");
  }

  const activeColumns = useMemo(
    () =>
      activeColumnKeys
        .map((k) => NATIVE_COLUMNS.find((c) => c.key === k))
        .filter((c): c is ColumnDef => Boolean(c)),
    [activeColumnKeys],
  );

  const { getWidth, setWidth } = useColumnWidths(WIDTHS_STORAGE_KEY, COLUMN_WIDTH_DEFAULTS);

  function toggleColumn(key: string) {
    setActiveColumnKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const statsQuery = useCompanyStats(isAuthenticated);
  const facetsQuery = useCompanyFacets(isAuthenticated);
  const query = useCompanies({
    search: debounced || undefined,
    page,
    perPage,
    segment: segment ?? undefined,
    sortBy,
    sortOrder,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    state: filterState || undefined,
    city: filterCity || undefined,
    industry: filterIndustry || undefined,
    enabled: isAuthenticated,
  });
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

  function toggleSort(field: CompanySortField) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  }

  async function handleConfirmDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    let ok = 0; let fail = 0;
    for (const id of ids) {
      try { await deleteMut.mutateAsync(id); ok += 1; } catch { fail += 1; }
    }
    setConfirmOpen(false);
    setSelected(new Set());
    if (fail === 0) toast.success(ok === 1 ? "Empresa excluída." : `${ok} empresas excluídas.`);
    else if (ok === 0) toast.error("Não foi possível excluir as empresas selecionadas.");
    else toast.error(`${ok} excluída(s), ${fail} falharam.`);
  }

  const isLoading = query.isLoading && items.length === 0;

  function requestEdit(c: CompanyListItemDto) {
    if (pinnedFromSearch && pinnedFromSearch.id !== c.id) setPinnedFromSearch(null);
    setEditing(c);
  }

  function handlePickSearchCompany(c: CompanyListItemDto) {
    setPinnedFromSearch(c);
    setSearch("");
    setEditing(c);
  }

  return (
    <div className="v2-screen v2-page-scroll grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-y-auto p-4">
      <NavRailSpacer />

      <main className="flex min-w-0 flex-col gap-4">
        <SectionHeader
          icon={Building2}
          title="Empresas"
          searchSlot={
            <CompaniesSearchFilterBar
              search={search}
              onSearch={setSearch}
              facets={facetsQuery.data}
              sortBy={sortBy}
              sortOrder={sortOrder}
              stateFilter={filterState}
              cityFilter={filterCity}
              industryFilter={filterIndustry}
              activeCount={activeFilterCount}
              onClear={clearPanelFilters}
              onPick={handlePickSearchCompany}
              onApply={(next) => {
                setSortBy(next.sortBy);
                setSortOrder(next.sortOrder);
                setFilterState(next.state);
                setFilterCity(next.city);
                setFilterIndustry(next.industry);
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
                allowClear
              />
            </PeriodCalendarButton>
          }
          actions={
            <HeaderPillToggle
              options={[
                { key: "cards", label: "Cards", icon: LayoutList },
                { key: "tabela", label: "Tabela", icon: Table2 },
              ]}
              value={view}
              onChange={(v) => setView(v as ViewMode)}
            />
          }
          menuSlot={
            <ActionsMenu
              onAdd={() => setCreateOpen(true)}
              onColumns={() => setColumnsOpen(true)}
            />
          }
        />

        <section className="shrink-0" aria-label="Indicadores de empresas">
          <KpiSquareScroll
            items={SEGMENTS.map((seg) => {
              const val = seg.value(statsQuery.data);
              return {
                key: seg.id,
                label:
                  seg.id === "com-contatos"
                    ? "Com contatos"
                    : seg.id === "sem-telefone"
                      ? "Sem tel."
                      : seg.label,
                value: val === undefined ? "—" : val.toLocaleString("pt-BR"),
                icon: seg.icon,
                tone: seg.tone,
                active: segment === seg.id,
                onClick: () =>
                  setSegment((prev) => (prev === seg.id ? null : seg.id)),
              };
            })}
          />
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

        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-4 py-2.5 backdrop-blur-md">
            <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">
              {selected.size} selecionada{selected.size > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <ButtonGlass
                variant="glass" size="sm" type="button"
                onClick={() => setSelected(new Set())}
                className="border-transparent bg-transparent shadow-none text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
              >
                Limpar
              </ButtonGlass>
              <ButtonGlass variant="danger" size="sm" type="button" onClick={() => setConfirmOpen(true)}>
                <IconTrash size={14} /> Excluir
              </ButtonGlass>
            </div>
          </div>
        )}

        {isLoading ? (
          <AppLoading variant="inline" className="min-h-[400px]" />
        ) : query.error ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center font-body text-[13px] text-[var(--color-danger-text)]">
            {query.error instanceof Error ? query.error.message : "Erro ao carregar."}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-md shadow-[var(--glass-shadow)]">
            <EmptyState
              icon={<IconBuilding size={28} />}
              title="Nenhuma empresa encontrada"
              description={
                debounced
                  ? `Sem resultados para "${debounced}".`
                  : segment != null && segment !== "todos"
                    ? "Nenhuma empresa para o segmento selecionado."
                    : "Use o menu de ações para cadastrar a primeira empresa."
              }
            />
          </div>
        ) : view === "tabela" ? (
          <TabelaView
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
          />
        ) : (
          <CardsView
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
          />
        )}

        <PaginationGlass
          total={total}
          entityLabel="empresas"
          page={page}
          lastPage={lastPage}
          canPrev={page > 1}
          canNext={page < lastPage}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          perPage={perPage}
          onPerPageChange={(value) => { setPerPage(value); setPage(1); }}
        />
      </main>

      <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditCompanyDialog company={editing} onClose={() => setEditing(null)} />
      <ColumnsDialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        nativeColumns={NATIVE_COLUMNS}
        activeKeys={activeColumnKeys}
        onToggle={toggleColumn}
        onReset={() => setActiveColumnKeys(DEFAULT_COLUMN_KEYS)}
      />
      <ConfirmDeleteDialog
        open={confirmOpen}
        count={selected.size}
        pending={deleteMut.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

// ── Busca + painel de filtros segmentado (padrão Contatos) ───────────────────

function CompaniesSearchFilterBar({
  search, onSearch, facets,
  sortBy, sortOrder,
  stateFilter, cityFilter, industryFilter,
  activeCount, onClear, onApply, onPick,
}: {
  search: string;
  onSearch: (v: string) => void;
  facets: CompanyFacetsDto | undefined;
  sortBy: CompanySortField;
  sortOrder: "asc" | "desc";
  stateFilter: string;
  cityFilter: string;
  industryFilter: string;
  activeCount: number;
  onClear: () => void;
  onApply: (next: CompanyFilterDraft) => void;
  onPick?: (c: CompanyListItemDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FilterPanelTab>("ordenar");
  const [draft, setDraft] = useState<CompanyFilterDraft>({
    sortBy, sortOrder,
    state: stateFilter, city: cityFilter, industry: industryFilter,
  });
  const ref = useRef<HTMLDivElement>(null);
  const hits = useCompaniesOmnisearch(search, search.trim().length >= 3);
  const menu = useOmnisearchMenu(search, hits.items.length);

  function pickCompany(c: CompanyListItemDto) {
    onPick?.(c);
    menu.close();
  }

  useEffect(() => {
    if (!open) return;
    setDraft({
      sortBy, sortOrder,
      state: stateFilter, city: cityFilter, industry: industryFilter,
    });
  }, [open, sortBy, sortOrder, stateFilter, cityFilter, industryFilter]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const sortKey = `${draft.sortBy}:${draft.sortOrder}`;
  const localCount = (draft.state ? 1 : 0) + (draft.city ? 1 : 0) + (draft.industry ? 1 : 0);
  const draftActiveCount = localCount;

  function handleClear() {
    setDraft((prev) => ({
      ...prev,
      state: "", city: "", industry: "",
    }));
    onClear();
  }

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  const tabBadge = (id: FilterPanelTab) => {
    if (id === "local") return localCount;
    return 0;
  };

  return (
    <div ref={ref} className="relative w-full">
      <div ref={menu.wrapRef}>
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar empresas"
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
            if (c) pickCompany(c);
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
          <OmnisearchSection icon={<IconBuilding size={13} />} label="Empresas" count={hits.items.length}>
            {hits.items.map((c, i) => (
              <OmnisearchHitButton
                key={c.id}
                active={i === menu.activeIndex}
                onHover={() => menu.setActiveIndex(i)}
                onClick={() => pickCompany(c)}
              >
                <OmnisearchHitAvatar
                  id={c.id}
                  name={c.name}
                  overlay={<IconBuilding size={10} />}
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
                  <span className="mt-0.5 truncate font-body text-[12px] text-[var(--text-secondary)]">
                    {c.domain || c.city || c.industry || "Abrir empresa"}
                  </span>
                </span>
              </OmnisearchHitButton>
            ))}
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
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Ordenar resultados por</p>
                {SORT_OPTIONS.map((opt) => {
                  const selected = sortKey === opt.value;
                  return (
                    <FilterRadioRow
                      key={opt.value}
                      selected={selected}
                      onClick={() => {
                        const [f, o] = opt.value.split(":");
                        setDraft((prev) => ({ ...prev, sortBy: f as CompanySortField, sortOrder: o as "asc" | "desc" }));
                      }}
                    >
                      {opt.label}
                    </FilterRadioRow>
                  );
                })}
              </div>
            )}

            {tab === "local" && (
              <div className="flex flex-col gap-3">
                <FilterSelectField
                  label="Estado"
                  value={draft.state}
                  options={facets?.states ?? []}
                  placeholder="Todos os estados"
                  onChange={(v) => setDraft((p) => ({ ...p, state: v }))}
                />
                <FilterSelectField
                  label="Cidade"
                  value={draft.city}
                  options={facets?.cities ?? []}
                  placeholder="Todas as cidades"
                  onChange={(v) => setDraft((p) => ({ ...p, city: v }))}
                />
                <FilterSelectField
                  label="Setor"
                  value={draft.industry}
                  options={facets?.industries ?? []}
                  placeholder="Todos os setores"
                  onChange={(v) => setDraft((p) => ({ ...p, industry: v }))}
                />
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

function FilterSelectField({
  label, value, options, placeholder, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={formLabelClass}>{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(formControlClass, "h-9 appearance-none pr-8 text-sm", value ? "border-primary/50" : "")}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <IconMapPin size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
    </label>
  );
}

// ── Menu de ações (hambúrguer — espelha Contatos) ────────────────────────────

function ActionsMenu({
  onAdd, onColumns,
}: {
  onAdd: () => void;
  onColumns: () => void;
}) {
  return (
    <PageActionsMenu
      items={[
        { icon: <IconPlus size={14} stroke={2.6} />, label: "Adicionar empresa", onClick: onAdd, primary: true },
        { icon: <IconSettings size={13} />, label: "Configurações da lista", onClick: onColumns, divider: true },
      ]}
    />
  );
}

// ── Configurações da lista ───────────────────────────────────────────────────

function ColumnsDialog({
  open, onOpenChange, nativeColumns, activeKeys, onToggle, onReset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nativeColumns: ColumnDef[];
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
            Escolha as colunas exibidas na visão Cards e Tabela. Suas escolhas ficam salvas neste navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex items-center justify-between">
            <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Colunas</span>
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 font-display text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)]"
            >
              <IconRotateClockwise size={12} /> Restaurar padrão
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">{nativeColumns.map(renderChip)}</div>
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

// ── Tabela ───────────────────────────────────────────────────────────────────

function TabelaView({
  items, selected, allChecked, someChecked, onToggleAll, onToggleOne, columns, getWidth, setWidth, sortBy, sortOrder, onSort, onEdit,
}: {
  items: CompanyListItemDto[];
  selected: Set<string>;
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  columns: ColumnDef[];
  getWidth: (key: string, fallback?: number) => number;
  setWidth: (key: string, px: number) => void;
  sortBy: CompanySortField;
  sortOrder: "asc" | "desc";
  onSort: (field: CompanySortField) => void;
  onEdit: (c: CompanyListItemDto) => void;
}) {
  const dirFor = (f: CompanySortField): SortDir => (sortBy === f ? sortOrder : null);
  const nameW = getWidth(NAME_COL_KEY, 240);
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <ListHScroll>
        <div className={cn("w-max min-w-full", LIST_CARD_STACK_CLASS)}>
          <div className={listTableHeadRowClass("hidden w-max min-w-full items-center lg:flex")}>
            <span className="w-9 shrink-0">
              <CheckboxGlass checked={allChecked} indeterminate={!allChecked && someChecked} onChange={onToggleAll} aria-label="Selecionar todas" />
            </span>
            <ResizableColumnHead width={nameW} onResize={(px) => setWidth(NAME_COL_KEY, px)} min={160} max={420}>
              <SortableHeader label="Empresa" sort={dirFor("name")} onSort={() => onSort("name")} className="whitespace-nowrap" />
            </ResizableColumnHead>
            {columns.map((col) => (
              <ResizableColumnHead
                key={col.key}
                width={getWidth(col.key, parseWidthClass(col.width))}
                onResize={(px) => setWidth(col.key, px)}
              >
                {col.sortField ? (
                  <SortableHeader
                    label={col.label}
                    sort={dirFor(col.sortField)}
                    onSort={() => onSort(col.sortField!)}
                    className="whitespace-nowrap"
                  />
                ) : (
                  <ListColumnLabel className="whitespace-nowrap">{col.label}</ListColumnLabel>
                )}
              </ResizableColumnHead>
            ))}
          </div>
          {items.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onEdit(c)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEdit(c); } }}
              className={cn(
                "flex w-max min-w-full cursor-pointer items-center gap-3",
                LIST_CARD_ROW_CLASS,
                selected.has(c.id) && "border-primary bg-primary/10",
              )}
            >
              <span className="w-9 shrink-0" onClick={(e) => e.stopPropagation()}>
                <CheckboxGlass checked={selected.has(c.id)} onChange={() => onToggleOne(c.id)} aria-label={`Selecionar ${c.name}`} />
              </span>
              <div className="flex shrink-0 items-center gap-2.5 overflow-hidden" style={{ width: nameW, minWidth: nameW, maxWidth: nameW }}>
                <ChatAvatar
                  user={{ id: c.id, name: c.name }}
                  channel={null}
                  size={AVATAR_SIZE.sm}
                />
                <div className="min-w-0 leading-tight">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(c); }}
                    className="group/name inline-flex max-w-full items-center gap-1.5 text-left font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
                  >
                    <span className="truncate">{c.name}</span>
                    <IconPencil size={13} className="flex-shrink-0 opacity-0 transition-opacity group-hover/name:opacity-60" />
                  </button>
                  <div className="truncate font-body text-[12px] text-[var(--text-muted)]">{c.domain ?? "—"}</div>
                </div>
              </div>
              {columns.map((col) => {
                const w = getWidth(col.key, parseWidthClass(col.width));
                return (
                  <div key={col.key} className="min-w-0 shrink-0 overflow-hidden" style={{ width: w, minWidth: w, maxWidth: w }}>
                    {col.cell(c)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ListHScroll>
    </div>
  );
}

// ── Cards (linhas horizontais — padrão Contatos) ─────────────────────────────

function CardsView({
  items, selected, allChecked, someChecked, onToggleAll, onToggleOne, columns, getWidth, setWidth, sortBy, sortOrder, onSort, onEdit,
}: {
  items: CompanyListItemDto[];
  selected: Set<string>;
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  columns: ColumnDef[];
  getWidth: (key: string, fallback?: number) => number;
  setWidth: (key: string, px: number) => void;
  sortBy: CompanySortField;
  sortOrder: "asc" | "desc";
  onSort: (field: CompanySortField) => void;
  onEdit: (c: CompanyListItemDto) => void;
}) {
  const dirFor = (f: CompanySortField): SortDir => (sortBy === f ? sortOrder : null);
  const nameW = getWidth(NAME_COL_KEY, 240);
  const gridTemplate = [
    "32px",
    `${nameW}px`,
    ...columns.map((c) => `${getWidth(c.key, parseWidthClass(c.width))}px`),
    "112px",
  ].join(" ");

  return (
    <ListHScroll scrollerClassName="pb-1">
    <div className={cn("w-max min-w-full", LIST_CARD_STACK_CLASS)}>
      <div
        className={listTableHeadRowClass("hidden gap-3 lg:grid")}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <span>
          <CheckboxGlass checked={allChecked} indeterminate={!allChecked && someChecked} onChange={onToggleAll} aria-label="Selecionar todas" />
        </span>
        <div className="relative min-w-0 overflow-x-hidden overflow-y-visible pr-1">
          <SortableHeader label="Empresa" sort={dirFor("name")} onSort={() => onSort("name")} />
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
                  onSort={() => onSort(col.sortField!)}
                />
              ) : (
                <ListColumnLabel>{col.label}</ListColumnLabel>
              )}
              <ColumnResizer value={w} onChange={(px) => setWidth(col.key, px)} min={72} max={480} />
            </div>
          );
        })}
        <ListColumnLabel align="right">Ações</ListColumnLabel>
      </div>
      {items.map((c) => {
        const isSelected = selected.has(c.id);
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onEdit(c)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEdit(c); } }}
            style={{ gridTemplateColumns: gridTemplate }}
            className={cn(
              "group grid cursor-pointer items-center gap-3",
              LIST_CARD_ROW_CLASS,
              isSelected && "border-primary bg-primary/10",
            )}
          >
            <span onClick={(e) => e.stopPropagation()}>
              <CheckboxGlass checked={isSelected} onChange={() => onToggleOne(c.id)} aria-label={`Selecionar ${c.name}`} />
            </span>

            <div className="flex min-w-0 items-center gap-2.5">
              <ChatAvatar
                user={{ id: c.id, name: c.name }}
                channel={null}
                size={AVATAR_SIZE.md}
              />
              <div className="min-w-0 leading-tight">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(c); }}
                  className="truncate text-left font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
                >
                  {c.name}
                </button>
                <div className="truncate font-body text-[12px] text-[var(--text-muted)]">{c.domain ?? "—"}</div>
              </div>
            </div>

            {columns.map((col) => (
              <div key={col.key} className="min-w-0">
                {col.cell(c)}
              </div>
            ))}

            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <a href={c.phone ? `tel:${normalizePhone(c.phone) ?? c.phone}` : undefined} aria-label="Ligar" aria-disabled={!c.phone} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]">
                <IconPhone size={16} />
              </a>
              <a href={c.domain ? `mailto:${c.domain}` : undefined} aria-label="Enviar e-mail" aria-disabled={!c.domain} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]">
                <IconMail size={16} />
              </a>
              <button
                type="button"
                onClick={() => onEdit(c)}
                aria-label={`Editar ${c.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
              >
                <IconPencil size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
    </ListHScroll>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

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
            <DialogTitle className="text-base">{`Excluir ${count === 1 ? "empresa" : `${count} empresas`}?`}</DialogTitle>
          </div>
          <DialogDescription className="text-[13px] leading-relaxed">
            Esta ação não pode ser desfeita. Os contatos vinculados são preservados (ficam sem empresa).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <ButtonGlass variant="glass" size="sm" type="button" onClick={onCancel} disabled={pending} className="border-transparent bg-transparent shadow-none text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]">Cancelar</ButtonGlass>
          <ButtonGlass variant="danger" size="sm" type="button" onClick={onConfirm} disabled={pending}>
            <IconTrash size={14} /> {pending ? "Excluindo..." : "Excluir"}
          </ButtonGlass>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [address, setAddress] = useState("");
  const createMut = useCreateCompany();

  useEffect(() => {
    if (!open) { setName(""); setCnpj(""); setPhone(""); setEmail(""); setCep(""); setCity(""); setUf(""); setAddress(""); createMut.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    createMut.mutate({
      name: n,
      size: cnpj.trim() || null,
      phone: normalizePhone(phone) ?? (phone.trim() || null),
      domain: email.trim() || null,
      cep: cep.trim() || null,
      city: city.trim() || null,
      state: uf.trim() || null,
      address: address.trim() || null,
    }, {
      onSuccess: () => { toast.success("Empresa criada."); onOpenChange(false); },
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova empresa"
      description="Cadastre uma empresa no CRM."
      icon={
        <FormDialogIcon>
          <FormDialogGlyphPlus>
            <Building2 className="size-4" />
          </FormDialogGlyphPlus>
        </FormDialogIcon>
      }
      size="lg"
      footer={
        <>
          <ButtonGlass variant="glass" size="sm" type="button" onClick={() => onOpenChange(false)} className={formDialogCancelClass}>Cancelar</ButtonGlass>
          <ButtonGlass variant="primary" size="sm" type="submit" form="new-company-form" disabled={!name.trim() || createMut.isPending} className={formDialogPrimaryClass}>{createMut.isPending ? "Criando..." : "Criar"}</ButtonGlass>
        </>
      }
    >
      <form id="new-company-form" onSubmit={handleSubmit} className="flex flex-col">
        <FieldInput label="Nome da empresa *" type="text" required autoFocus value={name} onChange={setName} placeholder="Razão social ou nome fantasia" />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="CNPJ" type="text" value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" />
          <FieldInput label="Telefone" type="tel" value={phone} onChange={setPhone} placeholder="(11) 3333-4444" />
        </div>
        <FieldInput label="E-mail" type="email" value={email} onChange={setEmail} placeholder="contato@empresa.com" />
        <div className="grid grid-cols-[1fr_1.4fr_0.7fr] gap-3">
          <FieldInput label="CEP" type="text" value={cep} onChange={setCep} placeholder="00000-000" />
          <FieldInput label="Cidade" type="text" value={city} onChange={setCity} placeholder="São Paulo" />
          <FieldInput label="Estado" type="text" value={uf} onChange={setUf} placeholder="UF" />
        </div>
        <FieldInput label="Endereço da empresa" type="text" value={address} onChange={setAddress} placeholder="Rua, número, complemento" />
        {createMut.isError && (
          <p className="text-[12px] text-[var(--color-danger-text)]">{createMut.error instanceof Error ? createMut.error.message : "Erro ao criar empresa."}</p>
        )}
      </form>
    </FormDialog>
  );
}

function EditCompanyDialog({ company, onClose }: { company: CompanyListItemDto | null; onClose: () => void }) {
  const open = company !== null;
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [address, setAddress] = useState("");
  const updateMut = useUpdateCompany();

  useEffect(() => {
    if (company) {
      setName(company.name);
      setCnpj(company.size ?? "");
      setPhone(company.phone ?? "");
      setEmail(company.domain ?? "");
      setCep(company.cep ?? "");
      setCity(company.city ?? "");
      setUf(company.state ?? "");
      setAddress(company.address ?? "");
      updateMut.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !company) return;
    updateMut.mutate({
      id: company.id,
      body: {
        name: n,
        size: cnpj.trim() || null,
        phone: normalizePhone(phone) ?? (phone.trim() || null),
        domain: email.trim() || null,
        cep: cep.trim() || null,
        city: city.trim() || null,
        state: uf.trim() || null,
        address: address.trim() || null,
      },
    }, {
      onSuccess: () => { toast.success("Empresa atualizada."); onClose(); },
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Editar empresa"
      description={name || company?.name}
      icon={
        <FormDialogIcon>
          <Pencil className="size-4" />
        </FormDialogIcon>
      }
      size="lg"
      footer={
        <>
          <ButtonGlass variant="glass" size="sm" type="button" onClick={onClose} className={formDialogCancelClass}>Cancelar</ButtonGlass>
          <ButtonGlass variant="primary" size="sm" type="submit" form="edit-company-form" disabled={!name.trim() || updateMut.isPending} className={formDialogPrimaryClass}>{updateMut.isPending ? "Salvando..." : "Salvar"}</ButtonGlass>
        </>
      }
    >
      <form id="edit-company-form" onSubmit={handleSubmit} className="flex flex-col">
        <FieldInput label="Nome da empresa *" type="text" required autoFocus value={name} onChange={setName} placeholder="Razão social ou nome fantasia" />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="CNPJ" type="text" value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" />
          <FieldInput label="Telefone" type="tel" value={phone} onChange={setPhone} placeholder="(11) 3333-4444" />
        </div>
        <FieldInput label="E-mail" type="email" value={email} onChange={setEmail} placeholder="contato@empresa.com" />
        <div className="grid grid-cols-[1fr_1.4fr_0.7fr] gap-3">
          <FieldInput label="CEP" type="text" value={cep} onChange={setCep} placeholder="00000-000" />
          <FieldInput label="Cidade" type="text" value={city} onChange={setCity} placeholder="São Paulo" />
          <FieldInput label="Estado" type="text" value={uf} onChange={setUf} placeholder="UF" />
        </div>
        <FieldInput label="Endereço da empresa" type="text" value={address} onChange={setAddress} placeholder="Rua, número, complemento" />
        {updateMut.isError && (
          <p className="text-[12px] text-[var(--color-danger-text)]">{updateMut.error instanceof Error ? updateMut.error.message : "Erro ao atualizar empresa."}</p>
        )}
      </form>
    </FormDialog>
  );
}

function FieldInput({ label, type, value, onChange, placeholder, required, autoFocus }: {
  label: string; type: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; autoFocus?: boolean;
}) {
  return (
    <label className="mb-3 block">
      <span className={formLabelClass}>{label}</span>
      <InputGlass type={type} required={required} autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={formControlClass} />
    </label>
  );
}
