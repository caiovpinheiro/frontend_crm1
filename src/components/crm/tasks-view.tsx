"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import {
  Calendar,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react"

import { ButtonGlass } from "@/components/crm/button-glass"
import { InputGlass } from "@/components/crm/input-glass"
import { MiniCalendar } from "@/components/crm/mini-calendar"
import { PageActionsMenu } from "@/components/crm/page-toolbar"
import {
  PeriodCalendarButton,
  PeriodIsoRangePanel,
} from "@/components/crm/period-calendar-button"
import { HeaderPillToggle, SectionHeader } from "@/components/crm/section-header"
import { SearchFilterBar } from "@/components/crm/search-filter-bar"
import {
  FilterPopoverBody,
  FilterPopoverHeader,
  FilterPopoverPanel,
  FilterRadioRow,
  FilterSegmentedTabs,
} from "@/components/crm/filter-popover"
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header"
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog"
import { cn } from "@/lib/utils"
import {
  TASKS,
  TASK_TYPE_ORDER,
  WEEKDAYS_SHORT,
  allTypesOn,
  buildMonthGrid,
  countByType,
  dateKey,
  dayPeriodTitle,
  daysWithTasks,
  formatTime,
  isSameDay,
  monthPeriodTitle,
  taskInIsoRange,
  taskMatchesQuery,
  taskMatchesSituation,
  taskStart,
  taskTypeMeta,
  tasksForDay,
  tasksForMonth,
  tasksForWeek,
  typesAreDefault,
  weekDays,
  weekPeriodTitle,
  type ChipColorKey,
  type Task,
  type TaskSituationFilter,
  type TaskType,
} from "@/lib/tasks-data"

const CHIP_BLOCK: Record<ChipColorKey, string> = {
  blue: "bg-chip-blue/15 text-chip-blue border-chip-blue/30",
  violet: "bg-chip-violet/15 text-chip-violet border-chip-violet/30",
  green: "bg-chip-green/15 text-chip-green border-chip-green/30",
  orange: "bg-chip-orange/15 text-chip-orange border-chip-orange/30",
  red: "bg-chip-red/15 text-chip-red border-chip-red/30",
}

const CHIP_CHECK_ON: Record<ChipColorKey, string> = {
  blue: "border-chip-blue bg-chip-blue/15 text-chip-blue",
  violet: "border-chip-violet bg-chip-violet/15 text-chip-violet",
  green: "border-chip-green bg-chip-green/15 text-chip-green",
  orange: "border-chip-orange bg-chip-orange/15 text-chip-orange",
  red: "border-chip-red bg-chip-red/15 text-chip-red",
}

const CHIP_CHECK_OFF: Record<ChipColorKey, string> = {
  blue: "border-chip-blue/40 text-transparent",
  violet: "border-chip-violet/40 text-transparent",
  green: "border-chip-green/40 text-transparent",
  orange: "border-chip-orange/40 text-transparent",
  red: "border-chip-red/40 text-transparent",
}

const CHIP_ICON: Record<ChipColorKey, string> = {
  blue: "text-chip-blue",
  violet: "text-chip-violet",
  green: "text-chip-green",
  orange: "text-chip-orange",
  red: "text-chip-red",
}

const TASK_TYPE_ICON: Record<TaskType, LucideIcon> = {
  tarefa: CheckSquare,
  reuniao: Users,
  ligacao: Phone,
  evento: CalendarDays,
  email: Mail,
}

function TaskTypeIcon({ type, className }: { type: TaskType; className?: string }) {
  const Icon = TASK_TYPE_ICON[type]
  return <Icon className={className} strokeWidth={2} aria-hidden="true" />
}

type CalendarView = "dia" | "semana" | "mes"

const HOUR_START = 7
const HOUR_END = 20
const HOUR_HEIGHT = 56
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT

const SITUATION_OPTIONS: { id: TaskSituationFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "overdue", label: "Vencidas" },
  { id: "upcoming", label: "A vencer" },
  { id: "today", label: "Hoje" },
  { id: "done", label: "Concluídas" },
  { id: "open", label: "Em aberto" },
]

function filterByType(tasks: Task[], enabled: Record<TaskType, boolean>): Task[] {
  return tasks.filter((t) => enabled[t.type])
}

function blockGeometry(start: Date, durationMin: number): { top: number; height: number } | null {
  const startMin = start.getHours() * 60 + start.getMinutes()
  const endMin = startMin + durationMin
  const visStart = HOUR_START * 60
  const visEnd = HOUR_END * 60
  const clippedStart = Math.max(startMin, visStart)
  const clippedEnd = Math.min(endMin, visEnd)
  if (clippedEnd <= visStart || clippedStart >= visEnd) return null
  return {
    top: ((clippedStart - visStart) / 60) * HOUR_HEIGHT,
    height: Math.max(((clippedEnd - clippedStart) / 60) * HOUR_HEIGHT, 18),
  }
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function NowLine({ now }: { now: Date }) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const visStart = HOUR_START * 60
  const visEnd = HOUR_END * 60
  if (minutes < visStart || minutes > visEnd) return null
  const top = ((minutes - visStart) / 60) * HOUR_HEIGHT
  return (
    <div
      className="pointer-events-none absolute right-0 left-0 z-10 flex items-center"
      style={{ top }}
    >
      <span className="size-2 shrink-0 rounded-full bg-chip-red" />
      <span className="h-px min-w-0 flex-1 bg-chip-red" />
    </div>
  )
}

function TaskBlock({ task, compact }: { task: Task; compact?: boolean }) {
  const meta = taskTypeMeta[task.type]
  const start = taskStart(task)
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border px-1.5 py-0.5 text-left",
        CHIP_BLOCK[meta.colorKey],
        task.status === "concluida" && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-start gap-1">
        <TaskTypeIcon
          type={task.type}
          className={cn("shrink-0", compact ? "mt-px size-2.5" : "mt-0.5 size-3")}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold", compact ? "text-[10px] leading-tight" : "text-xs")}>
            {task.title}
          </p>
          {!compact && (
            <p className="truncate text-[10px] opacity-80">
              {formatTime(start)}
              {task.contact ? ` · ${task.contact}` : ""}
            </p>
          )}
          {!compact && task.linkLabel && task.linkHref && (
            <Link
              href={task.linkHref}
              className="truncate text-[10px] font-medium underline-offset-2 hover:underline"
            >
              {task.linkLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function TimeGrid({
  days,
  tasks,
  now,
}: {
  days: Date[]
  tasks: Task[]
  now: Date
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const day of days) map.set(dateKey(day), [])
    for (const task of tasks) {
      const key = dateKey(taskStart(task))
      map.get(key)?.push(task)
    }
    return map
  }, [days, tasks])

  return (
    <div
      className="grid min-w-[640px]"
      style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
    >
      <div />
      {days.map((day) => {
        const today = isSameDay(day, now)
        return (
          <div
            key={dateKey(day)}
            className={cn(
              "border-b border-border px-1 py-2 text-center",
              today && "text-primary",
            )}
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              {WEEKDAYS_SHORT[day.getDay()]}
            </p>
            <p
              className={cn(
                "mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                today && "bg-primary text-primary-foreground",
              )}
            >
              {day.getDate()}
            </p>
          </div>
        )
      })}

      <div className="relative" style={{ height: GRID_HEIGHT }}>
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="pr-2 text-right text-[11px] leading-none text-muted-foreground"
            style={{ height: HOUR_HEIGHT }}
          >
            {String(hour).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {days.map((day) => {
        const key = dateKey(day)
        const dayTasks = byDay.get(key) ?? []
        const today = isSameDay(day, now)
        return (
          <div key={key} className="relative border-l border-border" style={{ height: GRID_HEIGHT }}>
            {HOURS.map((hour) => (
              <div key={hour} className="border-b border-border/60" style={{ height: HOUR_HEIGHT }} />
            ))}
            {dayTasks.map((task) => {
              const geo = blockGeometry(taskStart(task), task.durationMin)
              if (!geo) return null
              return (
                <div
                  key={task.id}
                  className="absolute right-1 left-1 z-[1]"
                  style={{ top: geo.top, height: geo.height }}
                >
                  <TaskBlock task={task} />
                </div>
              )
            })}
            {today && <NowLine now={now} />}
          </div>
        )
      })}
    </div>
  )
}

function MonthGrid({
  date,
  tasks,
  selectedDate,
  onSelectDate,
}: {
  date: Date
  tasks: Task[]
  selectedDate: Date
  onSelectDate: (d: Date) => void
}) {
  const now = new Date()
  const year = date.getFullYear()
  const month = date.getMonth()
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      const key = dateKey(taskStart(task))
      const list = map.get(key)
      if (list) list.push(task)
      else map.set(key, [task])
    }
    return map
  }, [tasks])

  return (
    <div className="grid grid-cols-7 border-t border-l border-border">
      {WEEKDAYS_SHORT.map((d) => (
        <div
          key={d}
          className="border-r border-b border-border bg-card px-2 py-1.5 text-[11px] font-medium text-muted-foreground"
        >
          {d}
        </div>
      ))}
      {grid.map((day) => {
        const key = dateKey(day)
        const inMonth = day.getMonth() === month
        const items = byDay.get(key) ?? []
        const extra = Math.max(0, items.length - 3)
        const visible = items.slice(0, 3)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDate(day)}
            className={cn(
              "min-h-24 border-r border-b border-border p-1.5 text-left align-top",
              !inMonth && "bg-secondary/40",
              isSameDay(day, selectedDate) && "ring-1 ring-inset ring-primary/40",
            )}
          >
            <span
              className={cn(
                "mb-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                isSameDay(day, now) && "bg-primary text-primary-foreground",
                !isSameDay(day, now) && inMonth && "text-foreground",
                !inMonth && "text-muted-foreground/50",
              )}
            >
              {day.getDate()}
            </span>
            <div className="flex flex-col gap-0.5">
              {visible.map((task) => (
                <TaskBlock key={task.id} task={task} compact />
              ))}
              {extra > 0 && (
                <span className="px-1 text-[10px] font-medium text-muted-foreground">+{extra}</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function NewTaskDialog({
  open,
  onOpenChange,
  defaultDate,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate: Date
  onCreate: (task: Task) => void
}) {
  const [title, setTitle] = useState("")
  const [type, setType] = useState<TaskType>("tarefa")
  const [contact, setContact] = useState("")
  const [company, setCompany] = useState("")
  const [date, setDate] = useState(dateKey(defaultDate))
  const [time, setTime] = useState("09:00")
  const [duration, setDuration] = useState("30")

  useEffect(() => {
    if (!open) return
    setTitle("")
    setType("tarefa")
    setContact("")
    setCompany("")
    setDate(dateKey(defaultDate))
    setTime("09:00")
    setDuration("30")
  }, [open, defaultDate])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const mins = Number(duration)
    onCreate({
      id: `t-local-${Date.now()}`,
      title: trimmed,
      type,
      start: `${date}T${time || "09:00"}`,
      durationMin: Number.isFinite(mins) && mins > 0 ? mins : 30,
      contact: contact.trim() || undefined,
      linkLabel: company.trim() || undefined,
      createdBy: "Você",
      status: "pendente",
    })
    onOpenChange(false)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova tarefa"
      description="Agende uma tarefa, reunião ou outro compromisso."
      icon={
        <FormDialogIcon>
          <CheckSquare className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass
            variant="glass"
            size="sm"
            type="button"
            onClick={() => onOpenChange(false)}
            className={formDialogCancelClass}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            variant="primary"
            size="sm"
            type="submit"
            form="new-task-form"
            disabled={!title.trim()}
            className={formDialogPrimaryClass}
          >
            Criar
          </ButtonGlass>
        </>
      }
    >
      <form id="new-task-form" className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <span className={formLabelClass}>Título *</span>
          <InputGlass
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Follow-up com cliente"
            className={formControlClass}
            autoFocus
          />
        </div>
        <div>
          <span className={formLabelClass}>Tipo</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TaskType)}
            className={cn(formControlClass, "text-sm text-foreground")}
          >
            {TASK_TYPE_ORDER.map((key) => (
              <option key={key} value={key}>
                {taskTypeMeta[key].label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={formLabelClass}>Contato</span>
            <InputGlass
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Nome do contato"
              className={formControlClass}
            />
          </div>
          <div>
            <span className={formLabelClass}>Empresa</span>
            <InputGlass
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Empresa vinculada"
              className={formControlClass}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className={formLabelClass}>Data</span>
            <InputGlass
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={formControlClass}
            />
          </div>
          <div>
            <span className={formLabelClass}>Hora</span>
            <InputGlass
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={formControlClass}
            />
          </div>
          <div>
            <span className={formLabelClass}>Duração (min)</span>
            <InputGlass
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={formControlClass}
            />
          </div>
        </div>
      </form>
    </FormDialog>
  )
}

function TasksSearchFilterBar({
  search,
  onSearch,
  enabledTypes,
  onToggleType,
  typeCounts,
  situation,
  onSituationChange,
  situationCounts,
  activeCount,
  onClear,
}: {
  search: string
  onSearch: (value: string) => void
  enabledTypes: Record<TaskType, boolean>
  onToggleType: (type: TaskType) => void
  typeCounts: Record<TaskType, number>
  situation: TaskSituationFilter
  onSituationChange: (value: TaskSituationFilter) => void
  situationCounts: Record<TaskSituationFilter, number>
  activeCount: number
  onClear: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"tipo" | "situacao">("tipo")

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const typeBadge = typesAreDefault(enabledTypes)
    ? 0
    : TASK_TYPE_ORDER.filter((type) => enabledTypes[type]).length
  const situationBadge = situation === "all" ? 0 : 1

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar tarefas..."
        ariaLabel="Buscar e filtrar tarefas"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
      />

      {open ? (
        <FilterPopoverPanel>
          <FilterPopoverHeader
            onClear={onClear}
            clearDisabled={activeCount === 0}
            count={activeCount}
          />
          <FilterSegmentedTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "tipo", label: "Tipo", badge: typeBadge },
              { id: "situacao", label: "Situação", badge: situationBadge },
            ]}
          />
          <FilterPopoverBody>
            {tab === "tipo" ? (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Tipo de tarefa</p>
                <ul className="flex flex-col gap-0.5">
                  {TASK_TYPE_ORDER.map((type) => {
                    const meta = taskTypeMeta[type]
                    const on = enabledTypes[type]
                    return (
                      <li key={type}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => onToggleType(type)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors",
                            on ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-secondary",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border",
                              on ? CHIP_CHECK_ON[meta.colorKey] : CHIP_CHECK_OFF[meta.colorKey],
                            )}
                          >
                            {on ? <Check className="size-3" aria-hidden="true" /> : null}
                          </span>
                          <TaskTypeIcon
                            type={type}
                            className={cn("size-4 shrink-0", CHIP_ICON[meta.colorKey])}
                          />
                          <span className="min-w-0 flex-1 font-semibold">{meta.label}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {typeCounts[type]}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Situação</p>
                <ul className="flex flex-col gap-0.5" role="listbox" aria-label="Situação">
                  {SITUATION_OPTIONS.map((opt) => {
                    const selected = situation === opt.id
                    return (
                      <li key={opt.id}>
                        <FilterRadioRow
                          selected={selected}
                          onClick={() => onSituationChange(opt.id)}
                          trailing={
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {situationCounts[opt.id]}
                            </span>
                          }
                        >
                          {opt.label}
                        </FilterRadioRow>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </FilterPopoverBody>
        </FilterPopoverPanel>
      ) : null}
    </div>
  )
}

export function TasksView() {
  const now = useNow()
  const [view, setView] = useState<CalendarView>("semana")
  const [cursor, setCursor] = useState(() => new Date())
  const [enabledTypes, setEnabledTypes] = useState<Record<TaskType, boolean>>(allTypesOn)
  const [situation, setSituation] = useState<TaskSituationFilter>("all")
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [extraTasks, setExtraTasks] = useState<Task[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  const allTasks = useMemo(() => [...TASKS, ...extraTasks], [extraTasks])

  const rangedTasks = useMemo(
    () => allTasks.filter((t) => taskMatchesQuery(t, search) && taskInIsoRange(t, dateFrom, dateTo)),
    [allTasks, search, dateFrom, dateTo],
  )

  const catalogTasks = useMemo(
    () => rangedTasks.filter((t) => taskMatchesSituation(t, situation, now)),
    [rangedTasks, situation, now],
  )

  const situationCounts = useMemo(() => {
    const counts: Record<TaskSituationFilter, number> = {
      all: rangedTasks.length,
      overdue: 0,
      upcoming: 0,
      today: 0,
      done: 0,
      open: 0,
    }
    for (const task of rangedTasks) {
      if (taskMatchesSituation(task, "overdue", now)) counts.overdue += 1
      if (taskMatchesSituation(task, "upcoming", now)) counts.upcoming += 1
      if (taskMatchesSituation(task, "today", now)) counts.today += 1
      if (taskMatchesSituation(task, "done", now)) counts.done += 1
      if (taskMatchesSituation(task, "open", now)) counts.open += 1
    }
    return counts
  }, [rangedTasks, now])

  const markedDates = useMemo(() => daysWithTasks(catalogTasks), [catalogTasks])

  const periodTasks = useMemo(() => {
    if (view === "dia") return tasksForDay(cursor, catalogTasks)
    if (view === "semana") return tasksForWeek(cursor, catalogTasks)
    return tasksForMonth(cursor, catalogTasks)
  }, [catalogTasks, cursor, view])

  const visibleTasks = useMemo(
    () => filterByType(periodTasks, enabledTypes),
    [periodTasks, enabledTypes],
  )

  const typeCounts = useMemo(() => countByType(periodTasks), [periodTasks])
  const periodActive = Boolean(dateFrom || dateTo)
  const typesDefault = typesAreDefault(enabledTypes)
  const filterActiveCount = (typesDefault ? 0 : 1) + (situation === "all" ? 0 : 1)

  function toggleType(type: TaskType) {
    setEnabledTypes((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  function clearFilters() {
    setEnabledTypes(allTypesOn())
    setSituation("all")
  }

  const title =
    view === "dia" ? dayPeriodTitle(cursor) : view === "semana" ? weekPeriodTitle(cursor) : monthPeriodTitle(cursor)

  const shift = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev)
      if (view === "dia") next.setDate(next.getDate() + delta)
      else if (view === "semana") next.setDate(next.getDate() + delta * 7)
      else next.setMonth(next.getMonth() + delta)
      return next
    })
  }

  const goToday = () => setCursor(new Date())

  const days = view === "dia" ? [cursor] : weekDays(cursor)

  function handleCreate(task: Task) {
    setExtraTasks((prev) => [...prev, task])
    setCursor(taskStart(task))
  }

  return (
    <>
      <SectionHeader
        icon={Calendar}
        title="Tarefas"
        searchSlot={
          <TasksSearchFilterBar
            search={search}
            onSearch={setSearch}
            enabledTypes={enabledTypes}
            onToggleType={toggleType}
            typeCounts={typeCounts}
            situation={situation}
            onSituationChange={setSituation}
            situationCounts={situationCounts}
            activeCount={filterActiveCount}
            onClear={clearFilters}
          />
        }
        period={
          <PeriodCalendarButton active={periodActive}>
            <PeriodIsoRangePanel
              from={dateFrom}
              to={dateTo}
              onChange={({ from, to }) => {
                setDateFrom(from)
                setDateTo(to)
              }}
              rangeLabel="Exibir tarefas"
              allowClear
            />
          </PeriodCalendarButton>
        }
        menuSlot={
          <PageActionsMenu
            aria-label="Ações de tarefas"
            items={[
              {
                icon: <Plus size={14} strokeWidth={2.6} />,
                label: "Nova tarefa",
                onClick: () => setCreateOpen(true),
                primary: true,
              },
            ]}
          />
        }
      />

      <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
          <div className={cn(CARD_SURFACE_CLASS, "p-4")}>
            <MiniCalendar
              selectedDate={cursor}
              onSelectDate={setCursor}
              markedDates={markedDates}
            />
          </div>
          <div className={cn(CARD_SURFACE_CLASS, "p-4")}>
            <p className="mb-3 text-sm font-semibold text-foreground">Minhas agendas</p>
            <ul className="flex flex-col gap-1.5">
              {TASK_TYPE_ORDER.map((type) => {
                const meta = taskTypeMeta[type]
                const on = enabledTypes[type]
                return (
                  <li key={type}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleType(type)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-secondary/60"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          on ? CHIP_CHECK_ON[meta.colorKey] : CHIP_CHECK_OFF[meta.colorKey],
                        )}
                      >
                        {on && <Check className="size-3" aria-hidden="true" />}
                      </span>
                      <TaskTypeIcon
                        type={type}
                        className={cn("size-4 shrink-0", CHIP_ICON[meta.colorKey])}
                      />
                      <span className="min-w-0 flex-1 text-sm text-foreground">{meta.label}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{typeCounts[type]}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>

        <section className={cn(CARD_SURFACE_CLASS, "flex min-w-0 flex-1 flex-col overflow-hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToday}
                className="h-9 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                Hoje
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Período anterior"
                  onClick={() => shift(-1)}
                  className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Próximo período"
                  onClick={() => shift(1)}
                  className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
              <h2 className="truncate text-lg font-semibold text-foreground">{title}</h2>
            </div>
            <HeaderPillToggle
              options={[
                { key: "dia", label: "Dia" },
                { key: "semana", label: "Semana" },
                { key: "mes", label: "Mês" },
              ]}
              value={view}
              onChange={setView}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {view === "mes" ? (
              <MonthGrid
                date={cursor}
                tasks={visibleTasks}
                selectedDate={cursor}
                onSelectDate={setCursor}
              />
            ) : (
              <TimeGrid days={days} tasks={visibleTasks} now={now} />
            )}
          </div>
        </section>
      </div>

      <NewTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={cursor}
        onCreate={handleCreate}
      />
    </>
  )
}
