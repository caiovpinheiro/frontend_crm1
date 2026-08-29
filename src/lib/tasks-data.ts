export type TaskType = "tarefa" | "reuniao" | "ligacao" | "evento" | "email"
/** `atrasada` is legacy seed data; overdue is computed from dates + not completed. */
export type TaskStatus = "pendente" | "concluida" | "atrasada"
export type ChipColorKey = "blue" | "violet" | "green" | "orange" | "red"

export type TaskSituationFilter =
  | "all"
  | "overdue"
  | "upcoming"
  | "today"
  | "done"
  | "open"

export type Task = {
  id: string
  title: string
  type: TaskType
  start: Date | string
  durationMin: number
  contact?: string
  createdBy?: string
  status: TaskStatus
  linkLabel?: string
  linkHref?: string
}

export const TASK_TYPE_ORDER: TaskType[] = ["tarefa", "reuniao", "ligacao", "evento", "email"]

export const taskTypeMeta: Record<TaskType, { label: string; colorKey: ChipColorKey }> = {
  tarefa: { label: "Tarefa", colorKey: "blue" },
  reuniao: { label: "Reunião", colorKey: "violet" },
  ligacao: { label: "Ligação", colorKey: "green" },
  evento: { label: "Evento", colorKey: "orange" },
  email: { label: "E-mail", colorKey: "red" },
}

const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"] as const
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const

export { WEEKDAYS_SHORT }

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function taskStart(task: Task): Date {
  return task.start instanceof Date ? task.start : new Date(task.start)
}

export function taskEnd(task: Task): Date {
  return new Date(taskStart(task).getTime() + task.durationMin * 60_000)
}

export function isTaskCompleted(task: Task): boolean {
  return task.status === "concluida"
}

export function allTypesOn(): Record<TaskType, boolean> {
  return { tarefa: true, reuniao: true, ligacao: true, evento: true, email: true }
}

export function typesAreDefault(enabled: Record<TaskType, boolean>): boolean {
  return TASK_TYPE_ORDER.every((type) => enabled[type])
}

/** Vencidas: end < now and not done. A vencer: start > now and not done. Hoje: start is today. */
export function taskMatchesSituation(
  task: Task,
  situation: TaskSituationFilter,
  now: Date = new Date(),
): boolean {
  if (situation === "all") return true
  const start = taskStart(task)
  const done = isTaskCompleted(task)
  switch (situation) {
    case "done":
      return done
    case "open":
      return !done
    case "overdue":
      return !done && taskEnd(task).getTime() < now.getTime()
    case "upcoming":
      return !done && start.getTime() > now.getTime()
    case "today":
      return isSameDay(start, now)
  }
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/** 6 semanas (42 dias) cobrindo o mês, começando no domingo. */
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function toLocalISO(d: Date): string {
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function monthName(month: number): string {
  const name = MONTHS[month]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`
}

export function dayPeriodTitle(date: Date): string {
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" })
  const capWeekday = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`
  return `${capWeekday}, ${date.getDate()} de ${monthName(date.getMonth())}`
}

export function weekPeriodTitle(date: Date): string {
  const days = weekDays(date)
  const a = days[0]
  const b = days[6]
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} – ${b.getDate()} de ${monthName(a.getMonth())} de ${a.getFullYear()}`
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} de ${monthName(a.getMonth())} – ${b.getDate()} de ${monthName(b.getMonth())} de ${a.getFullYear()}`
  }
  return `${a.getDate()} de ${monthName(a.getMonth())} de ${a.getFullYear()} – ${b.getDate()} de ${monthName(b.getMonth())} de ${b.getFullYear()}`
}

export function monthPeriodTitle(date: Date): string {
  return `${monthName(date.getMonth())} de ${date.getFullYear()}`
}

export function emptyTypeCounts(): Record<TaskType, number> {
  return { tarefa: 0, reuniao: 0, ligacao: 0, evento: 0, email: 0 }
}

export function countByType(tasks: Task[]): Record<TaskType, number> {
  const counts = emptyTypeCounts()
  for (const t of tasks) counts[t.type] += 1
  return counts
}

export function tasksForDay(date: Date, source: Task[] = TASKS): Task[] {
  const key = dateKey(date)
  return source
    .filter((t) => dateKey(taskStart(t)) === key)
    .sort((a, b) => taskStart(a).getTime() - taskStart(b).getTime())
}

export function tasksForWeek(date: Date, source: Task[] = TASKS): Task[] {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return source
    .filter((t) => {
      const s = taskStart(t)
      return s >= start && s < end
    })
    .sort((a, b) => taskStart(a).getTime() - taskStart(b).getTime())
}

export function tasksForMonth(date: Date, source: Task[] = TASKS): Task[] {
  const y = date.getFullYear()
  const m = date.getMonth()
  return source
    .filter((t) => {
      const s = taskStart(t)
      return s.getFullYear() === y && s.getMonth() === m
    })
    .sort((a, b) => taskStart(a).getTime() - taskStart(b).getTime())
}

export function daysWithTasks(source: Task[] = TASKS): Set<string> {
  const set = new Set<string>()
  for (const t of source) set.add(dateKey(taskStart(t)))
  return set
}

export function taskMatchesQuery(task: Task, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const hay = [task.title, task.contact, task.linkLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return hay.includes(needle)
}

/** Inclusive YYYY-MM-DD window. Empty from/to means no bound. */
export function taskInIsoRange(task: Task, from: string, to: string): boolean {
  if (!from && !to) return true
  const key = dateKey(taskStart(task))
  if (from && key < from) return false
  if (to && key > to) return false
  return true
}

function atWeek(weekday: number, hour: number, minute = 0, weekOffset = 0): string {
  const d = startOfWeek(new Date())
  d.setDate(d.getDate() + weekday + weekOffset * 7)
  d.setHours(hour, minute, 0, 0)
  return toLocalISO(d)
}

export const TASKS: Task[] = [
  {
    id: "t-sun-1",
    title: "Revisão de pipeline da semana",
    type: "tarefa",
    start: atWeek(0, 10, 0),
    durationMin: 60,
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-mon-1",
    title: "Ligação — follow-up Acme",
    type: "ligacao",
    start: atWeek(1, 9, 0),
    durationMin: 30,
    contact: "Marina Alves",
    createdBy: "Você",
    status: "pendente",
    linkLabel: "Acme Ltda",
    linkHref: "/companies",
  },
  {
    id: "t-mon-2",
    title: "Reunião de descoberta",
    type: "reuniao",
    start: atWeek(1, 14, 0),
    durationMin: 60,
    contact: "Carlos Pereira",
    createdBy: "Ana Souza",
    status: "concluida",
  },
  {
    id: "t-tue-1",
    title: "Enviar proposta comercial",
    type: "tarefa",
    start: atWeek(2, 8, 30),
    durationMin: 45,
    contact: "Tech Solutions",
    createdBy: "Você",
    status: "atrasada",
  },
  {
    id: "t-tue-2",
    title: "E-mail de onboarding",
    type: "email",
    start: atWeek(2, 11, 0),
    durationMin: 30,
    contact: "Fernanda Lima",
    createdBy: "Você",
    status: "concluida",
  },
  {
    id: "t-tue-3",
    title: "Almoço com cliente",
    type: "evento",
    start: atWeek(2, 12, 30),
    durationMin: 90,
    contact: "Pedro Castro",
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-wed-1",
    title: "Demo da plataforma",
    type: "reuniao",
    start: atWeek(3, 10, 0),
    durationMin: 75,
    contact: "Loja Bella",
    createdBy: "Você",
    status: "pendente",
    linkLabel: "Negócio",
    linkHref: "/pipeline",
  },
  {
    id: "t-wed-2",
    title: "Retomada de contato",
    type: "ligacao",
    start: atWeek(3, 16, 0),
    durationMin: 20,
    contact: "João Mendes",
    createdBy: "Carlos Pereira",
    status: "pendente",
  },
  {
    id: "t-thu-1",
    title: "Atualizar cadastro do lead",
    type: "tarefa",
    start: atWeek(4, 9, 30),
    durationMin: 40,
    contact: "Restaurante Sabor",
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-thu-2",
    title: "Webinar: automação de vendas",
    type: "evento",
    start: atWeek(4, 15, 0),
    durationMin: 90,
    createdBy: "Sistema",
    status: "pendente",
  },
  {
    id: "t-fri-1",
    title: "Stand-up comercial",
    type: "reuniao",
    start: atWeek(5, 8, 0),
    durationMin: 30,
    createdBy: "Você",
    status: "concluida",
  },
  {
    id: "t-fri-2",
    title: "Follow-up de proposta",
    type: "ligacao",
    start: atWeek(5, 11, 0),
    durationMin: 25,
    contact: "Grand Italia",
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-fri-3",
    title: "Enviar contrato para assinatura",
    type: "tarefa",
    start: atWeek(5, 14, 0),
    durationMin: 45,
    contact: "Umbrella Edu",
    createdBy: "Você",
    status: "pendente",
    linkLabel: "Contato",
    linkHref: "/contacts",
  },
  {
    id: "t-fri-4",
    title: "Responder dúvidas de integração",
    type: "email",
    start: atWeek(5, 16, 30),
    durationMin: 30,
    contact: "Fernanda Lima",
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-fri-5",
    title: "Revisar e-mails da semana",
    type: "email",
    start: atWeek(5, 18, 0),
    durationMin: 30,
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-sat-1",
    title: "Evento: networking Educa+",
    type: "evento",
    start: atWeek(6, 10, 0),
    durationMin: 120,
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-last-1",
    title: "QBR mensal",
    type: "reuniao",
    start: atWeek(3, 9, 0, -1),
    durationMin: 60,
    createdBy: "Ana Souza",
    status: "concluida",
  },
  {
    id: "t-last-2",
    title: "Cobrar proposta vencida",
    type: "tarefa",
    start: atWeek(2, 9, 0, -1),
    durationMin: 30,
    contact: "Acme Ltda",
    createdBy: "Você",
    status: "pendente",
  },
  {
    id: "t-next-1",
    title: "Kickoff novo ciclo",
    type: "reuniao",
    start: atWeek(1, 9, 30, 1),
    durationMin: 60,
    createdBy: "Você",
    status: "pendente",
  },
]
