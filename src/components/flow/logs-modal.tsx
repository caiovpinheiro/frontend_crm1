"use client"

import { useMemo, useState } from "react"
import {
  CircleCheck,
  TriangleAlert,
  CircleX,
  Microscope,
  User,
  Briefcase,
  Phone,
  GitBranch,
  Inbox,
  Loader2,
  MessageSquare,
  Radio,
} from "lucide-react"
import { AttendanceLink } from "./attendance-link"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { InputGlass } from "@/components/crm/input-glass"
import { blockKeyForStepType, getBlockMeta } from "@/components/crm/flow-block-icon"
import {
  automationLogToEntry,
  formatDateTime,
  isTriggerEcho,
  matchesLogQuery,
  type LogEntry,
  type LogStatus,
} from "@/lib/logs-data"
import { useAutomationLogs, useAutomationStats } from "@/features/automations-v2/hooks"
import {
  logRowMatchesTab,
  statsForNode,
  statusesForLogTab,
  type LogTabKey,
} from "@/lib/flow-node-stats"
import { SessionInspectionModal } from "./session-inspection-modal"

export type LogsTarget = {
  /** Id do passo; o gatilho usa `"trigger"`, convenção aceita pela API. */
  nodeId: string
  title: string
  ref: number
  initialTab?: TabKey
}

type TabKey = LogTabKey

const STATUS_STYLE: Record<
  LogStatus,
  { icon: typeof CircleCheck; iconClass: string }
> = {
  success: { icon: CircleCheck, iconClass: "bg-[var(--color-success)] text-[var(--color-success-foreground)]" },
  alert: { icon: TriangleAlert, iconClass: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]" },
  error: { icon: CircleX, iconClass: "bg-[var(--color-danger)] text-white" },
}

export function LogsModal({
  automationId,
  target,
  open,
  onOpenChange,
}: {
  automationId: string
  target: LogsTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [tab, setTab] = useState<TabKey>(target?.initialTab ?? "success")
  const [queryText, setQueryText] = useState("")
  const [selected, setSelected] = useState<LogEntry | null>(null)
  const [lastNode, setLastNode] = useState<string | null>(null)

  // Mesmo render em que o alvo muda: a busca já vai com a aba certa.
  // Ao fechar, zera lastNode — senão clicar Erros no mesmo card reabre
  // na aba anterior e ignora `initialTab`.
  if ((!open || !target) && lastNode !== null) {
    setLastNode(null)
  }
  const nodeChanged = Boolean(target && target.nodeId !== lastNode)
  const activeTab: TabKey = nodeChanged
    ? (target?.initialTab ?? "success")
    : tab
  if (target && nodeChanged) {
    setLastNode(target.nodeId)
    setTab(target.initialTab ?? "success")
    setQueryText("")
    setSelected(null)
  }

  const statuses = target ? statusesForLogTab(activeTab, target.nodeId) : undefined
  const query = useAutomationLogs(
    automationId,
    target?.nodeId ?? null,
    open && target !== null,
    statuses,
  )
  const statsQuery = useAutomationStats(automationId, open && target !== null)
  const cardStats = statsForNode(target?.nodeId ?? "", statsQuery.data)
  const counts = {
    entered: cardStats.sucessos + cardStats.alertas + cardStats.erros,
    success: cardStats.sucessos,
    alert: cardStats.alertas,
    error: cardStats.erros,
  }
  const tabCount = counts[activeTab]
  const nodeId = target?.nodeId ?? ""

  const logs = useMemo(() => {
    const pages = query.data?.pages ?? []
    // Preferir `items` (o que GET /logs devolve). `logs ?? items` do legado
    // mostrava a página inteira se `logs` viesse sem filtro da aba.
    const rows = pages
      .flatMap((page) => page.items ?? page.logs ?? [])
      .filter((row) => !isTriggerEcho(row))
      .filter((row) => logRowMatchesTab(row.status, activeTab, nodeId))
      .map(automationLogToEntry)
      .filter((entry) =>
        activeTab === "entered"
          ? true
          : activeTab === "success"
            ? entry.status === "success"
            : activeTab === "alert"
              ? entry.status === "alert"
              : entry.status === "error",
      )
    return { rows }
  }, [query.data, activeTab, nodeId])

  if (!target) return null

  const tabs: { key: TabKey; label: string; count: number; tone?: LogStatus }[] = [
    { key: "entered", label: "Entraram", count: counts.entered },
    { key: "success", label: "Sucessos", count: counts.success, tone: "success" },
    { key: "alert", label: "Alertas", count: counts.alert, tone: "alert" },
    { key: "error", label: "Erros", count: counts.error, tone: "error" },
  ]

  const list = logs.rows.filter((entry) => matchesLogQuery(entry, queryText))

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="lg"
          showCloseButton={false}
          panelClassName="max-w-3xl h-[min(85vh,720px)]"
          bodyClassName="flex h-full min-h-0 flex-col gap-0 overflow-hidden p-0"
        >
          <header className="shrink-0 px-6 pb-0 pt-6">
            <DialogTitle className="text-xl font-semibold text-balance text-foreground">
              Logs — {target.title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              {query.isPending
                ? "Carregando registros…"
                : query.isError
                  ? "Não foi possível carregar os registros."
                  : `${counts.entered.toLocaleString("pt-BR")} registro(s)${
                      tabCount > logs.rows.length
                        ? ` · exibindo os ${logs.rows.length} mais recentes`
                        : ""
                    }`}
            </DialogDescription>

            <div
              role="tablist"
              aria-label="Filtrar logs por status"
              className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3"
            >
              {tabs.map((t) => {
                const active = activeTab === t.key
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "group relative flex items-center gap-2 pb-3 text-sm transition-colors",
                      active
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{t.label}</span>
                    <span
                      className={cn(
                        "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
                        active
                          ? "bg-[var(--color-primary-soft)] text-[var(--brand-primary)]"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.count}
                    </span>
                    {active && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--brand-primary)]" />
                    )}
                  </button>
                )
              })}
            </div>

            <div className="py-4">
              <label className="sr-only" htmlFor="automation-logs-search">
                Buscar logs por contato, negócio, telefone ou mensagem
              </label>
              <InputGlass
                id="automation-logs-search"
                type="search"
                withSearch
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Buscar evento, contato, telefone ou mensagem…"
                autoComplete="off"
              />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6">
            {query.isPending ? (
              <LoadingState />
            ) : query.isError ? (
              <ErrorState
                message={query.error?.message ?? "Erro ao carregar os logs."}
                onRetry={() => query.refetch()}
              />
            ) : list.length === 0 ? (
              <EmptyState
                hasQuery={queryText.trim().length > 0}
                categoryEmpty={tabCount === 0}
                canLoadMore={query.hasNextPage === true}
                onLoadMore={() => query.fetchNextPage()}
                loadingMore={query.isFetchingNextPage}
              />
            ) : (
              <>
                <ul className="space-y-3 py-4">
                  {list.map((entry) => (
                    <LogRow
                      key={entry.id}
                      entry={entry}
                      onDetails={() => setSelected(entry)}
                    />
                  ))}
                </ul>
                {query.hasNextPage && (
                  <div className="flex justify-center pb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={query.isFetchingNextPage}
                      onClick={() => query.fetchNextPage()}
                    >
                      {query.isFetchingNextPage
                        ? "Carregando…"
                        : `Carregar mais (${logs.rows.length.toLocaleString("pt-BR")} de ${tabCount.toLocaleString("pt-BR")})`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <footer className="flex shrink-0 justify-end border-t border-border p-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </footer>
        </DialogContent>
      </Dialog>

      <SessionInspectionModal
        entry={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </>
  )
}

function LogRow({
  entry,
  onDetails,
}: {
  entry: LogEntry
  onDetails: () => void
}) {
  const style = STATUS_STYLE[entry.status]
  const Icon = style.icon
  const reasonText = entry.reason?.trim() || ""
  const titleHasReason =
    reasonText.length > 0 &&
    entry.title.toLowerCase().includes(reasonText.toLowerCase())
  const detail =
    entry.status !== "success" && reasonText && !titleHasReason
      ? reasonText
      : entry.status !== "success" && !reasonText
        ? "Motivo não registrado nesta execução."
        : entry.message &&
            entry.message !== entry.title &&
            !entry.title.includes(entry.message)
          ? entry.message
          : null
  const quotedSnippet =
    entry.snippet && entry.snippet !== detail ? `“${entry.snippet}”` : null
  return (
    <li className="flex items-center gap-4 rounded-xl border border-border bg-[var(--glass-bg-base)] p-4 transition-colors hover:border-[var(--brand-primary)]/30 hover:bg-[var(--color-primary-soft)]/40">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          style.iconClass,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">{entry.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {formatDateTime(entry.timestamp)}
        </p>
        {detail && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {detail}
          </p>
        )}
        {quotedSnippet && (
          <p className="mt-0.5 inline-flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
            <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="line-clamp-2">{quotedSnippet}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <User className="size-4" aria-hidden />
            {entry.contactLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="size-4" aria-hidden />
            {entry.dealLabel}
          </span>
          {entry.contactPhone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-4" aria-hidden />
              {entry.contactPhone}
            </span>
          )}
          {entry.channelLabel && (
            <span className="inline-flex items-center gap-1.5">
              <Radio className="size-4" aria-hidden />
              {entry.channelLabel}
            </span>
          )}
          {entry.eventLabel &&
            !entry.title.toLowerCase().includes(entry.eventLabel.toLowerCase()) && (
              <span className="inline-flex items-center gap-1.5">
                <Inbox className="size-4" aria-hidden />
                {entry.eventLabel}
              </span>
            )}
          {entry.stepType && (
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-4" aria-hidden />
              {getBlockMeta(blockKeyForStepType(entry.stepType)).label}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-1">
        <AttendanceLink entry={entry} />
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={onDetails}
        >
          <Microscope className="size-4" aria-hidden />
          Detalhes
        </Button>
      </div>
    </li>
  )
}

function EmptyState({
  hasQuery,
  categoryEmpty,
  canLoadMore,
  onLoadMore,
  loadingMore,
}: {
  hasQuery?: boolean
  categoryEmpty?: boolean
  canLoadMore?: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
}) {
  const showLoadMore = Boolean((hasQuery || !categoryEmpty) && canLoadMore && onLoadMore)
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-4 w-4" />
      </span>
      <p className="text-sm text-muted-foreground">
        {hasQuery
          ? canLoadMore
            ? "Nenhum registro para esta busca nos carregados."
            : "Nenhum registro para esta busca."
          : categoryEmpty
            ? "Nenhum registro nesta categoria."
            : canLoadMore
              ? "Os registros desta categoria não estão nesta página."
              : "Não foi possível localizar os registros desta categoria."}
      </p>
      {showLoadMore && (
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "Carregando…" : "Carregar mais registros"}
        </Button>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Carregando registros…</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--route-error)]/10 text-[var(--route-error)]">
        <CircleX className="h-4 w-4" />
      </span>
      <p className="text-sm font-semibold text-foreground">
        Não foi possível carregar os logs
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  )
}
