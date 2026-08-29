export type QueueItem = {
  id: string
  contact: string
  phone: string
  department: string
  departmentId?: string | null
  waitingMin: number
  enteredAt: string
  enteredLabel: string
  reason: string
}

export type QueueSortKey = "contact" | "department" | "waitingMin" | "enteredAt"

/** Fonte mínima da fila real (`PendingDistributionDto`) para mapear → QueueItem. */
export type PendingQueueSource = {
  id: string
  label: string
  departmentId?: string | null
  departmentName?: string | null
  triggerSource?: string | null
  attempts?: number
  createdAt: string
}

/** Mesma paleta de Settings → Departamentos, sem cinzas (chips nunca mudos). */
const DEPT_TAG_PALETTE = [
  "#6366f1",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#0891b2",
] as const

function normalizeDeptName(name: string): string {
  return name.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ")
}

/** Cor do departamento: dado real, senão hash estável do nome (como tags do Contatos). */
export function queueDepartmentColor(
  name: string,
  knownColor?: string | null,
): string {
  const known = knownColor?.trim()
  if (known) return known
  const key = normalizeDeptName(name)
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return DEPT_TAG_PALETTE[Math.abs(h) % DEPT_TAG_PALETTE.length]!
}

export function colorForQueueDepartment(
  item: Pick<QueueItem, "department" | "departmentId">,
  departments: ReadonlyArray<{ id: string; name: string; color: string }>,
): string {
  if (item.departmentId) {
    const byId = departments.find((d) => d.id === item.departmentId)
    if (byId?.color) return byId.color
  }
  const key = normalizeDeptName(item.department)
  const byName = departments.find((d) => normalizeDeptName(d.name) === key)
  return queueDepartmentColor(item.department, byName?.color)
}

const PHONE_LABEL = /^\+?\d[\d\s()-]{7,}$/

export function formatEnteredLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function queueReason(triggerSource?: string | null, attempts = 0): string {
  const parts = (triggerSource ?? "")
    .split("+")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const fromAi = parts.some((p) => p === "AI_AGENT" || p === "AI")
  const fromAutomation = parts.some((p) => p === "AUTOMATION")
  const base = fromAi
    ? "Agente IA"
    : fromAutomation
      ? "Automação"
      : "Sem responsável elegível"
  return attempts > 1 ? `${base} · ${attempts}x` : base
}

export function pendingToQueueItem(
  p: PendingQueueSource,
  now = Date.now(),
): QueueItem {
  const enteredAt = p.createdAt
  const waitingMin = Math.max(
    0,
    Math.floor((now - new Date(enteredAt).getTime()) / 60_000),
  )
  const label = p.label?.trim() || "Atendimento"
  const phoneLike = PHONE_LABEL.test(label)
  return {
    id: p.id,
    contact: phoneLike ? "Atendimento" : label,
    phone: phoneLike ? label : "",
    department: p.departmentName?.trim() || "Sem departamento",
    departmentId: p.departmentId ?? null,
    waitingMin,
    enteredAt,
    enteredLabel: formatEnteredLabel(enteredAt),
    reason: queueReason(p.triggerSource, p.attempts),
  }
}

export function sortQueueItems(
  items: QueueItem[],
  key: QueueSortKey,
  dir: "asc" | "desc",
): QueueItem[] {
  const sign = dir === "asc" ? 1 : -1
  return [...items].sort((a, b) => {
    if (key === "waitingMin") return (a.waitingMin - b.waitingMin) * sign
    if (key === "enteredAt") return a.enteredAt.localeCompare(b.enteredAt) * sign
    return a[key].localeCompare(b[key], "pt-BR") * sign
  })
}

export const queueItems: QueueItem[] = [
  {
    id: "q-1",
    contact: "GEIZA FARIAS COELHO",
    phone: "+5511976197542",
    department: "Atendimento – SAC",
    waitingMin: 47,
    enteredAt: "2026-08-28T15:12:00.000Z",
    enteredLabel: "28/08/26, 12:12",
    reason: "Sem responsável elegível",
  },
  {
    id: "q-2",
    contact: "ALINE JESUS ALVES CRUZ",
    phone: "+5511952993430",
    department: "Atendimento – SAC",
    waitingMin: 32,
    enteredAt: "2026-08-28T15:27:00.000Z",
    enteredLabel: "28/08/26, 12:27",
    reason: "Agente IA",
  },
  {
    id: "q-3",
    contact: "Thayná Palluza Santina da Silva Bezerra",
    phone: "+5511959548557",
    department: "Retenção",
    waitingMin: 18,
    enteredAt: "2026-08-28T15:41:00.000Z",
    enteredLabel: "28/08/26, 12:41",
    reason: "Sem responsável elegível",
  },
  {
    id: "q-4",
    contact: "Vivian Paris",
    phone: "+5511995170138",
    department: "Sem departamento",
    waitingMin: 8,
    enteredAt: "2026-08-28T15:51:00.000Z",
    enteredLabel: "28/08/26, 12:51",
    reason: "Automação",
  },
  {
    id: "q-5",
    contact: "Alessandro Lima",
    phone: "+5521992020818",
    department: "Acolhimento",
    waitingMin: 3,
    enteredAt: "2026-08-28T15:56:00.000Z",
    enteredLabel: "28/08/26, 12:56",
    reason: "Sem responsável elegível",
  },
]
