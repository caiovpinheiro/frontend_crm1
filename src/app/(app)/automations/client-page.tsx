"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Activity,
  Bot,
  CircleCheck,
  Clock,
  LoaderCircle,
  Plus,
  Upload,
  Zap,
} from "lucide-react"

import { AppLoading } from "@/components/crm/app-loading"
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer"
import { cn } from "@/lib/utils"
import { RestrictedScreen } from "@/components/crm/restricted-screen"
import { useRequireManager } from "@/hooks/use-user-role"
import { ViewToggle, useCardsTableView } from "@/components/automations/view-toggle"
import { PageChrome } from "@/components/crm/page-header"
import { HeaderPillToggle, SectionHeader } from "@/components/crm/section-header"
import { SearchFilterBar } from "@/components/crm/search-filter-bar"
import { FilterChip } from "@/components/crm/filter-popover"
import { FilterCategoryColumn, FilterColumnsModal } from "@/components/crm/filter-columns-modal"
import { PageActionsMenu } from "@/components/crm/page-toolbar"
import { AutomationsGallery } from "@/components/crm/automations-gallery"
import { EmptyState } from "@/components/crm/empty-state"
import { LIST_PAGE_PANE_CLASS, PaginationGlass } from "@/components/crm/pagination-glass"
import { KpiCard, type KpiTone } from "@/components/crm/kpi-card"
import {
  useAutomations,
  useAutomationsSummary,
  useCreateAutomation,
  useDeleteAutomation,
  useReplaceAutomation,
  useToggleAutomation,
} from "@/features/automations-v2/hooks"
import { dtoToAutomation } from "@/features/automations-v2/automation-adapter"
import { isPageMockMode } from "@/lib/page-mock-mode"
import { AUTOMATION_TRIGGER_TYPES } from "@/lib/automation-workflow"
import { useConfirm } from "@/components/ui/confirm-dialog"

const DEFAULT_PER_PAGE = 25
const FILTERS = ["Todas", "Ativas", "Pausadas"] as const

type StatusFilter = 0 | 1 | 2

export default function V2AutomationsClientPage() {
  const router = useRouter()
  const { ready, isManagerUp } = useRequireManager()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filter, setFilter] = useState<StatusFilter>(0)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE)
  const [isImporting, setIsImporting] = useState(false)
  const [view, setView] = useCardsTableView()
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debounced, filter, perPage])

  const activeParam =
    filter === 1 ? true : filter === 2 ? false : undefined

  // Lista paginada de verdade (API: page/perPage/total; mock respeita os mesmos params).
  const listQuery = useAutomations({
    page,
    perPage,
    search: debounced || undefined,
    active: activeParam,
  })

  // KPIs / popover — COUNT + logs de hoje. Não bloqueia a galeria.
  const summaryQuery = useAutomationsSummary()

  const toggleMutation = useToggleAutomation()
  const createMutation = useCreateAutomation()
  const replaceMutation = useReplaceAutomation()
  const deleteMutation = useDeleteAutomation()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const hasFilters = debounced.length > 0 || filter !== 0
  // Automacoes: nao mostra mocks pra org nova (realCount=0). Isso confundia
  // usuarios reais em prod, que viam automacoes "fantasma" sem conseguir
  // desligar/apagar. Modo demo agora exige ativacao explicita (URL
  // ?mock=1, env NEXT_PUBLIC_MOCK_PAGES=1 ou preview v0).
  const isDemo = isPageMockMode() && !hasFilters

  const listItems = useMemo(
    () =>
      [...(listQuery.data?.items ?? [])]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(dtoToAutomation),
    [listQuery.data?.items],
  )

  const summary = useMemo(
    () => ({
      total: summaryQuery.data?.total ?? 0,
      active: summaryQuery.data?.active ?? 0,
      paused: summaryQuery.data?.paused ?? 0,
      runsToday: summaryQuery.data?.runsToday ?? 0,
      avgSuccess: summaryQuery.data?.avgSuccess ?? 0,
    }),
    [summaryQuery.data],
  )

  const total = listQuery.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const safePage = Math.min(page, lastPage)

  const handleToggle = (id: string) => {
    if (isDemo) {
      toast.info("Modo demonstração — o status não é salvo no servidor.")
      return
    }
    toggleMutation.mutate(id, {
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Erro ao alternar automação"),
    })
  }

  const handleDelete = async (id: string) => {
    if (isDemo) {
      toast.info("Modo demonstração — exclusão indisponível.")
      return
    }
    const target = listItems.find((a) => a.id === id)
    const name = target?.name ?? "esta automação"

    const ok = await confirm({
      title: "Excluir automação?",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{name}</strong>? Esta ação não
          pode ser desfeita. Todos os passos e o histórico de execuções da
          automação serão removidos.
        </>
      ),
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      destructive: true,
    })
    if (!ok) return

    deleteMutation.mutate(id, {
      onSuccess: () => toast.success(`Automação "${name}" excluída.`),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Erro ao excluir automação"),
    })
  }

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  /**
   * Importa um fluxo `.json` exportado por outra automação (formato do
   * `handleExportJson` em `features/legacy-v1/automations-editor.tsx`):
   *   { id?, name, description?, triggerType, triggerConfig?, active?,
   *     steps: [{ id, type, config }], exportedAt? }
   *
   * Estratégia em 2 passos:
   *   1. `POST /api/automations` — cria a casca (sempre pausada,
   *      `active: false`, para não disparar antes do operador revisar).
   *   2. `PUT  /api/automations/:id` — substitui tudo de uma vez (nome,
   *      triggerType, triggerConfig E steps embutidos). Mesmo endpoint
   *      usado pelo `OldAutomationEditor` para salvar o canvas — é o
   *      caminho confirmado em produção (o endpoint
   *      `PUT /api/automations/:id/steps` que o `saveAutomationSteps`
   *      sugeria não persiste no backend atual).
   *
   * O `id` original da AUTOMAÇÃO é descartado (backend gera UUID novo no
   * POST). Já o `id` de cada STEP é PRESERVADO — sem isso, as referências
   * internas do fluxo (`nextStepId`, `gotoStepId`, `elseGotoStepId`,
   * `targetStepId`, etc.) ficariam quebradas após a importação.
   */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (isImporting) return

    setIsImporting(true)
    try {
      const text = await file.text()

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        toast.error("Arquivo não é um JSON válido.")
        return
      }

      if (!parsed || typeof parsed !== "object") {
        toast.error("Estrutura inválida: era esperado um objeto JSON.")
        return
      }
      const data = parsed as Record<string, unknown>

      const name = typeof data.name === "string" ? data.name.trim() : ""
      const triggerType =
        typeof data.triggerType === "string" ? data.triggerType : ""
      const stepsRaw = Array.isArray(data.steps) ? data.steps : null

      if (!name) {
        toast.error("Campo `name` ausente ou vazio no JSON.")
        return
      }
      if (!triggerType) {
        toast.error("Campo `triggerType` ausente no JSON.")
        return
      }
      if (!stepsRaw) {
        toast.error("Campo `steps` ausente ou inválido no JSON.")
        return
      }
      if (
        !AUTOMATION_TRIGGER_TYPES.includes(
          triggerType as (typeof AUTOMATION_TRIGGER_TYPES)[number],
        )
      ) {
        toast.warning(
          `Gatilho "${triggerType}" não está no catálogo conhecido — tentando mesmo assim.`,
        )
      }

      const description =
        typeof data.description === "string" ? data.description : null
      const triggerConfig =
        data.triggerConfig && typeof data.triggerConfig === "object"
          ? (data.triggerConfig as Record<string, unknown>)
          : {}

      const steps = stepsRaw
        .map((raw) => {
          if (!raw || typeof raw !== "object") return null
          const s = raw as Record<string, unknown>
          if (typeof s.type !== "string" || !s.type) return null
          const config =
            s.config && typeof s.config === "object" && !Array.isArray(s.config)
              ? (s.config as Record<string, unknown>)
              : {}
          const id =
            typeof s.id === "string" && s.id.trim() ? s.id : undefined
          return { id, type: s.type, config }
        })
        .filter(
          (s): s is { id: string | undefined; type: string; config: Record<string, unknown> } =>
            s !== null,
        )

      if (steps.length === 0 && stepsRaw.length > 0) {
        toast.error("Nenhum step válido encontrado no JSON.")
        return
      }

      const created = await createMutation.mutateAsync({
        name,
        description,
        triggerType,
        triggerConfig,
        active: false,
      })

      try {
        await replaceMutation.mutateAsync({
          id: created.id,
          body: {
            name,
            description,
            triggerType,
            triggerConfig,
            steps,
          },
        })
      } catch (stepErr) {
        toast.warning(
          `Automação criada mas falhou ao salvar os ${steps.length} passos: ${
            stepErr instanceof Error ? stepErr.message : "erro desconhecido"
          }. Abra no editor para revisar.`,
        )
        router.push(`/automations/${created.number ?? created.id}`)
        return
      }

      toast.success(
        `Automação "${name}" importada (pausada, ${steps.length} ${
          steps.length === 1 ? "passo" : "passos"
        }).`,
      )
      router.push(`/automations/${created.number ?? created.id}`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao importar automação.",
      )
    } finally {
      setIsImporting(false)
    }
  }

  const isLoading = listQuery.isLoading && listItems.length === 0
  const isError = listQuery.isError && !isDemo
  const isEmpty =
    !isLoading && !isError && total === 0 && !hasFilters
  const isEmptyFiltered =
    !isLoading && !isError && total === 0 && hasFilters

  if (ready && !isManagerUp) return <RestrictedScreen />

  return (
    <div
      className={cn(
        "v2-screen v2-screen-fill grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-hidden bg-background",
      )}
    >
      <NavRailSpacer />

      <PageChrome
        className="px-4 py-5"
        header={
        <>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />

        <SectionHeader
          icon={Bot}
          title="Automações"
          searchSlot={
            <AutomationsSearchFilterBar
              search={query}
              onSearch={setQuery}
              filter={filter}
              onFilterChange={(v) => setFilter(v as StatusFilter)}
              counts={{
                all: summary.total,
                active: summary.active,
                paused: summary.paused,
              }}
              onClearAll={() => {
                setQuery("")
                setFilter(0)
              }}
            />
          }
          actions={
            <>
              <ViewToggle value={view} onChange={setView} />
              <HeaderPillToggle
                options={[
                  { key: "automations", label: "Automações" },
                  { key: "campaigns", label: "Campanhas" },
                ]}
                value="automations"
                onChange={(v) => {
                  if (v === "campaigns") router.push("/campaigns")
                }}
              />
            </>
          }
          menuSlot={
            <AutomationsActionsMenu
              onNew={() => router.push("/automations/new")}
              onImport={handleImportClick}
              importing={isImporting}
            />
          }
        />
        </>
        }
        bodyClassName="gap-4"
      >

        {isLoading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : (
        <>
        <AutomationsKpis
          summary={summary}
          filter={filter}
          onFilterChange={(v) => setFilter(v)}
        />

        <div className={LIST_PAGE_PANE_CLASS}>
        {isError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center text-sm text-destructive">
            {listQuery.error instanceof Error
              ? listQuery.error.message
              : "Erro ao carregar automações."}
          </div>
        ) : isEmpty ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
            <EmptyState
              icon={<Bot size={28} />}
              title="Nenhuma automação ainda"
              description="Crie sua primeira automação ou importe um fluxo em .json."
              action={
                <Link
                  href="/automations/new"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Plus size={16} /> Nova automação
                </Link>
              }
            />
          </div>
        ) : isEmptyFiltered ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
            <EmptyState
              icon={<Bot size={28} />}
              title="Nenhum resultado"
              description={
                debounced
                  ? `Sem resultados para "${debounced}".`
                  : "Nenhuma automação corresponde ao filtro selecionado."
              }
            />
          </div>
        ) : (
          <AutomationsGallery
            automations={listItems}
            onToggle={handleToggle}
            onDelete={handleDelete}
            view={view}
          />
        )}

        <PaginationGlass
          className="shrink-0"
          total={total}
          entityLabel="automações"
          page={safePage}
          lastPage={lastPage}
          canPrev={safePage > 1}
          canNext={safePage < lastPage}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          perPage={perPage}
          onPerPageChange={(value) => {
            setPerPage(value)
            setPage(1)
          }}
        />
        </div>
        </>
        )}
      </PageChrome>

      {confirmDialog}
    </div>
  )
}

// ── KPIs (mesmo KpiCard de Contatos/Empresas) ────────────────────────────

function AutomationsKpis({
  summary,
  filter,
  onFilterChange,
}: {
  summary: {
    total: number
    active: number
    paused: number
    runsToday: number
    avgSuccess: number
  }
  filter: StatusFilter
  onFilterChange: (v: StatusFilter) => void
}) {
  const cards: {
    key: string
    label: string
    value: string
    hint?: string
    tone: KpiTone
    icon: React.ReactNode
    segment?: StatusFilter
  }[] = [
    {
      key: "active",
      label: "Ativas",
      value: summary.active.toLocaleString("pt-BR"),
      hint: `de ${summary.total.toLocaleString("pt-BR")}`,
      tone: "brand",
      icon: <Zap size={20} strokeWidth={2} />,
      segment: 1,
    },
    {
      key: "runs",
      label: "Execuções hoje",
      value: summary.runsToday.toLocaleString("pt-BR"),
      tone: "violet",
      icon: <Activity size={20} strokeWidth={2} />,
    },
    {
      key: "success",
      label: "Taxa média de sucesso",
      value: `${summary.avgSuccess}%`,
      tone: "success",
      icon: <CircleCheck size={20} strokeWidth={2} />,
    },
    {
      key: "paused",
      label: "Pausadas",
      value: summary.paused.toLocaleString("pt-BR"),
      tone: "neutral",
      icon: <Clock size={20} strokeWidth={2} />,
      segment: 2,
    },
  ]

  return (
    <section
      className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Indicadores"
    >
      {cards.map((c) => (
        <KpiCard
          key={c.key}
          label={c.label}
          value={c.value}
          hint={c.hint}
          icon={c.icon}
          tone={c.tone}
          active={c.segment !== undefined && filter === c.segment}
          onClick={
            c.segment !== undefined
              ? () =>
                  onFilterChange(filter === c.segment ? 0 : (c.segment as StatusFilter))
              : undefined
          }
        />
      ))}
    </section>
  )
}

// ── Busca + popover de filtros (status) ──────────────────────────────────

function AutomationsSearchFilterBar({
  search,
  onSearch,
  filter,
  onFilterChange,
  counts,
  onClearAll,
}: {
  search: string
  onSearch: (v: string) => void
  filter: number
  onFilterChange: (v: number) => void
  counts: { all: number; active: number; paused: number }
  onClearAll: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const activeCount = filter !== 0 ? 1 : 0
  const countFor = (index: number) =>
    index === 0 ? counts.all : index === 1 ? counts.active : counts.paused

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar automações"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        chips={
          filter !== 0
            ? [{ id: "status", title: "Status", count: 1, onRemove: () => onFilterChange(0) }]
            : undefined
        }
      />

      <FilterColumnsModal
        open={open}
        onClose={() => setOpen(false)}
        onClear={onClearAll}
        onApply={() => setOpen(false)}
        count={activeCount}
        clearDisabled={activeCount === 0 && !search}
        title="Filtros"
        labelledBy="Filtros de automações"
      >
        <FilterCategoryColumn title="Status">
          {FILTERS.map((label, index) => (
            <FilterChip
              key={label}
              tone="fill"
              selected={filter === index}
              onClick={() => onFilterChange(index)}
              count={countFor(index)}
            >
              {label}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
      </FilterColumnsModal>
    </div>
  )
}

// ── Menu hamburger (CTAs da página) ──────────────────────────────────────

function AutomationsActionsMenu({
  onNew,
  onImport,
  importing,
}: {
  onNew: () => void
  onImport: () => void
  importing: boolean
}) {
  return (
    <PageActionsMenu
      items={[
        {
          icon: <Plus size={14} strokeWidth={2.6} />,
          label: "Nova automação",
          onClick: onNew,
          primary: true,
        },
        {
          icon: importing ? (
            <LoaderCircle size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          ),
          label: importing ? "Importando…" : "Importar .json",
          onClick: onImport,
          disabled: importing,
          divider: true,
        },
      ]}
    />
  )
}
