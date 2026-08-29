"use client"

import { useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { AppLoading } from "@/components/crm/app-loading"
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer"
import { ActivityCalendar } from "@/components/crm/activities/activity-calendar"
import { ActivityRow } from "@/components/crm/activities/activity-row"
import { ActivityComposer } from "@/components/crm/activities/activity-composer"
import { ActivityDetailDialog } from "@/components/crm/activities/activity-detail-dialog"
import { ActivitiesUrgentCard } from "@/components/crm/activities/activities-urgent-card"
import { ActivitiesWeeklySummary } from "@/components/crm/activities/activities-weekly-summary"
import { ProductivityTipCard } from "@/components/crm/activities/activities-static-cards"
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_ORDER,
  activityDateKey,
  dateKey,
  isSameDay,
  longDateLabel,
  type Activity,
  type ActivityKind,
} from "@/lib/activities-data"
import { PageHeader } from "@/components/crm/page-header"
import {
  PagePrimaryButton,
  PageSegmentedControl,
} from "@/components/crm/page-toolbar"
import { cn } from "@/lib/utils"
import { IconCalendarEvent, IconPlus, IconX } from "@tabler/icons-react"
import {
  useAllActivities,
  useCreateActivity,
  useDeleteActivity,
  useUpdateActivity,
} from "@/features/directory-v2/hooks"
import {
  activityKindToType,
  dtoToActivity,
  localDateTimeToIso,
} from "@/features/directory-v2/activity-adapter"

type StatusFilter = "todas" | "pendentes" | "concluidas" | "atrasadas"

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "pendentes", label: "Pendentes" },
  { key: "concluidas", label: "Concluídas" },
  { key: "atrasadas", label: "Atrasadas" },
]

type ScopeFilter = "all" | "mine" | "department"

const SCOPE_FILTERS: { key: ScopeFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "mine", label: "Minhas" },
  { key: "department", label: "Departamento" },
]

const PANEL =
  "rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow)] backdrop-blur-md"

const isOverdue = (a: Activity) =>
  a.status === "pendente" && new Date(a.start).getTime() < Date.now()

function RightColumn({
  items,
  onSelectDate,
}: {
  items: Activity[]
  onSelectDate: (d: Date) => void
}) {
  return (
    <>
      <ActivitiesUrgentCard items={items} onSelect={onSelectDate} />
      <ActivitiesWeeklySummary items={items} />
    </>
  )
}

export default function V2ActivitiesClientPage() {
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas")
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all")
  const [kindFilter, setKindFilter] = useState<ActivityKind | "all">("all")
  const [composerOpen, setComposerOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null)

  const activitiesQuery = useAllActivities({ scope: scopeFilter })
  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity()
  const deleteMutation = useDeleteActivity()

  const realDtos = activitiesQuery.data?.items ?? []

  const items: Activity[] = useMemo(
    () => realDtos.map(dtoToActivity).filter((a) => a.start),
    [realDtos],
  )

  const calendarItems = useMemo(
    () => (kindFilter === "all" ? items : items.filter((a) => a.kind === kindFilter)),
    [items, kindFilter],
  )

  const dayItems = useMemo(() => {
    const key = dateKey(selectedDate)
    return calendarItems
      .filter((a) => activityDateKey(a) === key)
      .filter((a) => {
        if (statusFilter === "pendentes") return a.status === "pendente"
        if (statusFilter === "concluidas") return a.status === "concluida"
        if (statusFilter === "atrasadas") return isOverdue(a)
        return true
      })
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [calendarItems, selectedDate, statusFilter])

  const monthSummary = useMemo(() => {
    const m = viewDate.getMonth()
    const y = viewDate.getFullYear()
    const counts = {} as Record<ActivityKind, number>
    for (const k of ACTIVITY_KIND_ORDER) counts[k] = 0
    for (const a of items) {
      const d = new Date(a.start)
      if (d.getMonth() === m && d.getFullYear() === y) counts[a.kind]++
    }
    return counts
  }, [items, viewDate])

  const monthTotal = useMemo(
    () =>
      items.filter((a) => {
        const d = new Date(a.start)
        return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear()
      }).length,
    [items, viewDate],
  )

  const toggle = (id: string) => {
    const current = items.find((a) => a.id === id)
    if (!current) return
    const nextCompleted = current.status !== "concluida"
    updateMutation.mutate({
      id,
      payload: {
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : null,
      },
    })
  }

  const remove = (id: string) => deleteMutation.mutate(id)

  const markAllDone = () => {
    const nowIso = new Date().toISOString()
    for (const a of dayItems) {
      if (a.status === "concluida") continue
      updateMutation.mutate({
        id: a.id,
        payload: { completed: true, completedAt: nowIso },
      })
    }
  }

  const create = (a: Activity) => {
    createMutation.mutate(
      {
        type: activityKindToType(a.kind),
        title: a.title,
        description: a.notes ?? null,
        scheduledAt: localDateTimeToIso(a.start),
        completed: a.status === "concluida",
        contactId: a.contactId ?? null,
        dealId: a.dealId ?? null,
        userId: a.assigneeType === "department" ? null : a.assigneeUserId ?? undefined,
        departmentId: a.assigneeType === "department" ? a.departmentId ?? null : null,
      },
      {
        onSuccess: () => {
          setSelectedDate(new Date(a.start))
          setViewDate(new Date(a.start))
        },
      },
    )
  }

  const selectDate = (d: Date) => {
    setSelectedDate(d)
    setViewDate(d)
  }

  const isToday = isSameDay(selectedDate, new Date())

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />

      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-x-hidden overflow-y-auto p-0 lg:gap-4 lg:overflow-hidden">
        <PageHeader
          icon={<IconCalendarEvent size={22} stroke={2.2} />}
          title="Tarefas"
          actions={
            <PagePrimaryButton type="button" onClick={() => setComposerOpen(true)}>
              <IconPlus size={15} stroke={2.4} /> Nova tarefa
            </PagePrimaryButton>
          }
        />

        {activitiesQuery.isLoading && items.length === 0 ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : activitiesQuery.isError ? (
          <div className="flex-1 rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center text-sm text-destructive">
            {activitiesQuery.error instanceof Error
              ? activitiesQuery.error.message
              : "Erro ao carregar."}
          </div>
        ) : (
        <>
        {/* Seletor de data compacto — só mobile */}
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className={cn(
            PANEL,
            "flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--glass-bg-overlay)] lg:hidden",
          )}
          aria-label="Abrir calendário"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
            <IconCalendarEvent size={20} stroke={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[13px] font-bold capitalize text-[var(--text-primary)]">
              {longDateLabel(selectedDate)}
            </span>
            <span className="block font-body text-[11.5px] text-[var(--text-muted)]">
              Toque para escolher outra data
            </span>
          </span>
        </button>

        <Dialog.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
            <Dialog.Content
              className={cn(
                PANEL,
                "fixed left-1/2 top-1/2 z-50 w-[min(360px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 p-4 outline-none",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <Dialog.Title className="font-display text-[15px] font-bold text-[var(--text-primary)]">
                  Calendário
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Fechar"
                    className="flex size-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                  >
                    <IconX size={16} />
                  </button>
                </Dialog.Close>
              </div>
              <ActivityCalendar
                viewDate={viewDate}
                selectedDate={selectedDate}
                activities={calendarItems}
                onSelectDate={(d) => {
                  setSelectedDate(d)
                  setViewDate(d)
                  setCalendarOpen(false)
                }}
                onChangeMonth={setViewDate}
              />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Layout 3 colunas no desktop; no mobile empilha sem overflow horizontal. */}
        <div className="grid min-w-0 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[280px_1fr] lg:gap-4 lg:overflow-hidden xl:grid-cols-[280px_1fr_300px]">
          {/* Coluna esquerda — calendário só no desktop */}
          <div className="hidden min-w-0 flex-col gap-4 lg:flex lg:min-h-0 lg:overflow-auto">
            <section aria-label="Calendário" className={cn(PANEL, "min-w-0 p-4")}>
              <ActivityCalendar
                viewDate={viewDate}
                selectedDate={selectedDate}
                activities={calendarItems}
                onSelectDate={setSelectedDate}
                onChangeMonth={setViewDate}
              />
            </section>

            <section aria-label="Tipos de tarefa" className={cn(PANEL, "p-4")}>
              <p className="mb-3 font-display text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                Este mês
              </p>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => setKindFilter("all")}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors",
                    kindFilter === "all"
                      ? "bg-[var(--color-enterprise-bg)]"
                      : "hover:bg-[var(--glass-bg-overlay)]",
                  )}
                >
                  <span
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                    style={{
                      backgroundColor: "rgba(91,111,245,0.14)",
                      color: "var(--color-task, var(--brand-primary))",
                    }}
                  >
                    <IconCalendarEvent size={15} stroke={2.2} />
                  </span>
                  <span
                    className={cn(
                      "flex-1 text-left font-display text-[13px] font-bold",
                      kindFilter === "all"
                        ? "text-[var(--brand-primary)]"
                        : "text-[var(--text-secondary)]",
                    )}
                  >
                    Todas
                  </span>
                  <span className="min-w-[24px] rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-2 py-px text-center font-mono text-[12.5px] font-semibold text-[var(--text-muted)]">
                    {monthTotal}
                  </span>
                </button>

                {ACTIVITY_KIND_ORDER.map((kind) => {
                  const meta = ACTIVITY_KINDS[kind]
                  const Icon = meta.icon
                  const active = kindFilter === kind
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setKindFilter(active ? "all" : kind)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors",
                        active
                          ? "bg-[var(--color-enterprise-bg)]"
                          : "hover:bg-[var(--glass-bg-overlay)]",
                      )}
                    >
                      <span
                        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                        style={{ backgroundColor: meta.softBg, color: meta.color }}
                      >
                        <Icon size={15} stroke={2.2} />
                      </span>
                      <span
                        className={cn(
                          "flex-1 text-left font-display text-[13px] font-bold",
                          active
                            ? "text-[var(--brand-primary)]"
                            : "text-[var(--text-secondary)]",
                        )}
                      >
                        {meta.plural}
                      </span>
                      <span className="min-w-[24px] rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-2 py-px text-center font-mono text-[12.5px] font-semibold text-[var(--text-muted)]">
                        {monthSummary[kind]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Filtro de tipo compacto — só mobile */}
          <section
            aria-label="Tipos de tarefa"
            className={cn(PANEL, "min-w-0 p-3 lg:hidden")}
          >
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setKindFilter("all")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[11.5px] font-bold transition-colors",
                  kindFilter === "all"
                    ? "border-transparent bg-[var(--brand-primary)] text-white"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
                )}
              >
                Todas
                <span className="tabular-nums opacity-80">{monthTotal}</span>
              </button>
              {ACTIVITY_KIND_ORDER.map((kind) => {
                const meta = ACTIVITY_KINDS[kind]
                const active = kindFilter === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setKindFilter(active ? "all" : kind)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[11.5px] font-bold transition-colors",
                      active
                        ? "border-transparent text-white"
                        : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
                    )}
                    style={
                      active
                        ? { backgroundColor: meta.color }
                        : undefined
                    }
                  >
                    {meta.plural}
                    <span className="tabular-nums opacity-80">{monthSummary[kind]}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Coluna central */}
          <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:gap-4 lg:overflow-hidden">
            <section
              aria-label="Agenda do dia"
              className={cn(
                PANEL,
                "flex min-w-0 flex-col overflow-hidden p-0 lg:min-h-0 lg:flex-1 lg:min-h-[520px]",
              )}
            >
              <div className="flex flex-col gap-2.5 border-b border-[var(--glass-border-subtle)] px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-4.5 sm:py-4">
                <div className="min-w-0">
                  <h2 className="font-display text-[15px] font-extrabold capitalize tracking-tight text-[var(--text-primary)] sm:text-[17px]">
                    <span className="lg:hidden">{dayItems.length} {dayItems.length === 1 ? "tarefa" : "tarefas"}{isToday ? " hoje" : ""}</span>
                    <span className="hidden lg:inline">{longDateLabel(selectedDate)}</span>
                  </h2>
                  <p className="mt-px hidden font-body text-[12.5px] text-[var(--text-muted)] lg:block">
                    {dayItems.length}{" "}
                    {dayItems.length === 1 ? "tarefa" : "tarefas"}
                    {isToday ? " para hoje" : ""}
                    {dayItems.some((a) => a.status !== "concluida") && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={markAllDone}
                          className="cursor-pointer font-display font-semibold text-[var(--brand-primary)] transition-colors hover:text-[var(--brand-primary-dark)]"
                        >
                          Marcar todas como concluídas
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <div className="toolbar-hscroll flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 sm:w-auto">
                  <PageSegmentedControl
                    size="compact"
                    aria-label="Escopo das tarefas"
                    className="w-max shrink-0"
                    items={SCOPE_FILTERS.map((f) => ({
                      value: f.key,
                      label: f.label,
                    }))}
                    value={scopeFilter}
                    onChange={(v) => setScopeFilter(v as ScopeFilter)}
                  />
                  <PageSegmentedControl
                    size="compact"
                    aria-label="Filtrar tarefas"
                    className="w-max shrink-0"
                    items={STATUS_FILTERS.map((f) => ({
                      value: f.key,
                      label: f.label,
                    }))}
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as StatusFilter)}
                  />
                </div>
              </div>

              <div className="flex max-h-[min(360px,50vh)] min-h-[160px] min-w-0 flex-col gap-2 overflow-auto p-3 sm:p-4 lg:max-h-none lg:min-h-0 lg:flex-1">
                {dayItems.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center p-4 sm:p-10">
                    <div className="max-w-[320px] text-center">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)] sm:h-16 sm:w-16">
                        <IconCalendarEvent size={26} />
                      </div>
                      <h3 className="font-display text-[15px] font-extrabold text-[var(--text-primary)]">
                        Nenhuma tarefa neste dia
                      </h3>
                      <p className="mt-1 mb-4 font-body text-[13px] text-[var(--text-muted)]">
                        Clique em “Nova atividade” para agendar uma tarefa, reunião,
                        ligação ou evento.
                      </p>
                      <button
                        type="button"
                        onClick={() => setComposerOpen(true)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.35)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)]"
                      >
                        <IconPlus size={16} stroke={2.5} /> Nova tarefa
                      </button>
                    </div>
                  </div>
                ) : (
                  dayItems.map((a) => (
                    <ActivityRow
                      key={a.id}
                      activity={a}
                      overdue={isOverdue(a)}
                      onToggle={toggle}
                      onDelete={remove}
                      onOpenDetails={setDetailActivity}
                    />
                  ))
                )}
              </div>
            </section>

            <div className="hidden lg:block">
              <ProductivityTipCard />
            </div>
          </div>

          {/* Coluna direita — sidebar xl+ */}
          <div className="hidden min-h-0 min-w-0 flex-col gap-4 overflow-auto xl:flex">
            <RightColumn items={items} onSelectDate={selectDate} />
          </div>

          {/* Cards laterais — mobile / tablet */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden lg:col-span-2 lg:gap-4">
            <RightColumn items={items} onSelectDate={selectDate} />
          </div>
        </div>
        </>
        )}
      </main>

      <ActivityComposer
        open={composerOpen}
        defaultDate={selectedDate}
        onOpenChange={setComposerOpen}
        onCreate={create}
      />

      <ActivityDetailDialog
        open={Boolean(detailActivity)}
        onOpenChange={(open) => {
          if (!open) setDetailActivity(null)
        }}
        activityId={detailActivity?.id ?? null}
        activity={detailActivity}
      />
    </div>
  )
}
