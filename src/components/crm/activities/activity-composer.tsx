"use client"

import { useEffect, useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { IconSearch, IconX } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { InputGlass } from "@/components/crm/input-glass"
import { ButtonGlass } from "@/components/crm/button-glass"
import { Textarea } from "@/components/ui/textarea"
import { useTeamUsers } from "@/features/pipeline-v2/hooks/use-deal-mutations"
import { useDepartments } from "@/features/conversations-settings/hooks/use-departments"
import { useContact, useContacts } from "@/features/directory-v2/hooks"
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_ORDER,
  dateKey,
  type Activity,
  type ActivityKind,
} from "@/lib/activities-data"

export type ActivityDealOption = { id: string; title: string }

interface ActivityComposerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Data pré-selecionada (do calendário). */
  defaultDate: Date
  onCreate: (activity: Activity) => void
  /** Contato pré-selecionado (Inbox / Pipeline). */
  presetContactId?: string | null
  presetContactName?: string | null
  /** Negócio pré-selecionado. */
  presetDealId?: string | null
  presetDealTitle?: string | null
  /**
   * Negócios do contato já conhecidos (ex.: aside do Inbox).
   * Se omitido e houver contato, carrega via `useContact`.
   */
  availableDeals?: ActivityDealOption[]
  /** Impede trocar o contato (contexto com contato fixo). */
  lockContact?: boolean
}

const labelCls = "font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]"

export function ActivityComposer({
  open,
  onOpenChange,
  defaultDate,
  onCreate,
  presetContactId = null,
  presetContactName = null,
  presetDealId = null,
  presetDealTitle = null,
  availableDeals,
  lockContact = false,
}: ActivityComposerProps) {
  const [kind, setKind] = useState<ActivityKind>("tarefa")
  const [title, setTitle] = useState("")
  const [date, setDate] = useState(dateKey(defaultDate))
  const [time, setTime] = useState("09:00")
  const [duration, setDuration] = useState("30")
  const [contactId, setContactId] = useState<string | null>(null)
  const [contactName, setContactName] = useState<string | null>(null)
  const [dealId, setDealId] = useState<string | null>(null)
  const [dealTitle, setDealTitle] = useState<string | null>(null)
  const [contactSearch, setContactSearch] = useState("")
  const [debouncedContactSearch, setDebouncedContactSearch] = useState("")
  const [location, setLocation] = useState("")
  const [notes, setNotes] = useState("")
  const [assignKind, setAssignKind] = useState<"user" | "department">("user")
  const [assigneeUserId, setAssigneeUserId] = useState("")
  const [departmentId, setDepartmentId] = useState("")

  const usersQuery = useTeamUsers(open)
  const departmentsQuery = useDepartments()
  const users = usersQuery.data ?? []
  const departments = departmentsQuery.data ?? []

  const contactsQuery = useContacts({
    search: debouncedContactSearch || undefined,
    perPage: 12,
    enabled: open && !contactId && !lockContact && debouncedContactSearch.length >= 1,
  })
  const contactHits = contactsQuery.data?.items ?? []

  const shouldFetchContactDeals =
    open && Boolean(contactId) && availableDeals === undefined
  const contactDetailQuery = useContact(shouldFetchContactDeals ? contactId : null)

  const dealOptions: ActivityDealOption[] = useMemo(() => {
    if (availableDeals) return availableDeals
    const deals = contactDetailQuery.data?.deals ?? []
    return deals.map((d) => ({
      id: d.id,
      title: d.title || d.stage?.name || "Negócio",
    }))
  }, [availableDeals, contactDetailQuery.data?.deals])

  // Sincroniza presets / limpa ao abrir
  useEffect(() => {
    if (!open) return
    setDate(dateKey(defaultDate))
    setTitle("")
    setKind("tarefa")
    const hh = String(defaultDate.getHours()).padStart(2, "0")
    const mm = String(defaultDate.getMinutes()).padStart(2, "0")
    setTime(
      defaultDate.getHours() === 0 && defaultDate.getMinutes() === 0
        ? "09:00"
        : `${hh}:${mm}`,
    )
    setDuration("30")
    setContactId(presetContactId)
    setContactName(presetContactName)
    setDealId(presetDealId)
    setDealTitle(presetDealTitle)
    setContactSearch("")
    setDebouncedContactSearch("")
    setLocation("")
    setNotes("")
    setAssignKind("user")
    setAssigneeUserId("")
    setDepartmentId("")
  }, [
    open,
    defaultDate,
    presetContactId,
    presetContactName,
    presetDealId,
    presetDealTitle,
  ])

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedContactSearch(contactSearch.trim()),
      250,
    )
    return () => window.clearTimeout(timer)
  }, [contactSearch])

  // Se o deal pré-selecionado sumiu da lista, limpa; se há 1 deal e nenhum
  // selecionado, não auto-força (opcional). Mantém preset quando válido.
  useEffect(() => {
    if (!open || !dealId) return
    if (dealOptions.length === 0) return
    const stillThere = dealOptions.some((d) => d.id === dealId)
    if (!stillThere) {
      setDealId(null)
      setDealTitle(null)
    }
  }, [open, dealId, dealOptions])

  const usesDuration = kind === "reuniao" || kind === "evento" || kind === "ligacao"
  const usesLocation = kind === "reuniao" || kind === "evento"
  const showDealPicker = Boolean(contactId) && dealOptions.length > 0

  const clearContact = () => {
    if (lockContact) return
    setContactId(null)
    setContactName(null)
    setDealId(null)
    setDealTitle(null)
    setContactSearch("")
    setDebouncedContactSearch("")
  }

  const selectDeal = (id: string) => {
    if (!id) {
      setDealId(null)
      setDealTitle(null)
      return
    }
    const hit = dealOptions.find((d) => d.id === id)
    setDealId(id)
    setDealTitle(hit?.title ?? null)
  }

  const submit = () => {
    if (!title.trim()) return
    if (assignKind === "department" && !departmentId) return
    const isDept = assignKind === "department"
    onCreate({
      id: `a-${Date.now()}`,
      kind,
      title: title.trim(),
      start: `${date}T${time}`,
      durationMin: usesDuration ? Number(duration) || undefined : undefined,
      status: "pendente",
      withWhom: contactName ?? undefined,
      contactId: contactId,
      contactName: contactName,
      dealId: dealId,
      dealTitle: dealTitle,
      location: usesLocation ? location.trim() || undefined : undefined,
      notes: notes.trim() || undefined,
      assigneeType: isDept ? "department" : "user",
      assigneeUserId: isDept ? null : assigneeUserId || null,
      departmentId: isDept ? departmentId : null,
    })
    onOpenChange(false)
  }

  const selectCls =
    "h-9 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 font-body text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
            "max-h-[calc(100vh-3rem)] overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--glass-border)]",
            "bg-[var(--glass-bg-overlay)] p-5 shadow-[var(--glass-shadow)] backdrop-blur-2xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-display text-[17px] font-bold text-[var(--text-primary)]">
                Nova tarefa
              </Dialog.Title>
              <Dialog.Description className="font-body text-[12px] text-[var(--text-muted)]">
                Agende uma tarefa, reunião, ligação ou evento.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              >
                <IconX size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Seletor de tipo */}
          <div className="mb-4 flex flex-col gap-1.5">
            <span className={labelCls}>Tipo</span>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_KIND_ORDER.map((k) => {
                const meta = ACTIVITY_KINDS[k]
                const Icon = meta.icon
                const active = k === kind
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-semibold transition-all duration-150",
                      active
                        ? "text-white shadow-[var(--glass-shadow-sm)]"
                        : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]",
                    )}
                    style={
                      active ? { backgroundColor: meta.color, borderColor: meta.color } : undefined
                    }
                  >
                    <Icon size={15} stroke={2} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Título */}
          <div className="mb-4 flex flex-col gap-1.5">
            <label htmlFor="ac-title" className={labelCls}>
              Título
            </label>
            <InputGlass
              id="ac-title"
              autoFocus
              placeholder="Ex.: Ligar para o cliente"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
              }}
            />
          </div>

          {/* Data / hora / duração */}
          <div className={cn("mb-4 grid gap-3", usesDuration ? "grid-cols-3" : "grid-cols-2")}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ac-date" className={labelCls}>
                Data
              </label>
              <InputGlass id="ac-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ac-time" className={labelCls}>
                Hora
              </label>
              <InputGlass id="ac-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            {usesDuration && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ac-dur" className={labelCls}>
                  Duração (min)
                </label>
                <InputGlass
                  id="ac-dur"
                  type="number"
                  min={5}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Contato (opcional) / local */}
          <div className={cn("mb-4 grid gap-3", usesLocation ? "grid-cols-2" : "grid-cols-1")}>
            <div className="relative flex flex-col gap-1.5">
              <label htmlFor="ac-who" className={labelCls}>
                Contato{" "}
                {!lockContact && (
                  <span className="normal-case tracking-normal font-body font-normal">(opcional)</span>
                )}
              </label>
              {contactId ? (
                <div className="flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5">
                  <span className="min-w-0 flex-1 truncate font-body text-[13px] text-[var(--text-primary)]">
                    {contactName || "Contato selecionado"}
                  </span>
                  {!lockContact && (
                    <button
                      type="button"
                      onClick={clearContact}
                      aria-label="Limpar contato"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                    >
                      <IconX size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <IconSearch
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  />
                  <InputGlass
                    id="ac-who"
                    className="pl-8"
                    placeholder="Buscar contato cadastrado…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {contactSearch.trim().length >= 1 && (
                    <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow)] backdrop-blur-md">
                      {contactsQuery.isLoading ? (
                        <p className="px-3 py-2 font-body text-[12px] text-[var(--text-muted)]">
                          Buscando…
                        </p>
                      ) : contactHits.length === 0 ? (
                        <p className="px-3 py-2 font-body text-[12px] text-[var(--text-muted)]">
                          Nenhum contato encontrado. Deixe vazio para lembrete pessoal.
                        </p>
                      ) : (
                        contactHits.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setContactId(c.id)
                              setContactName(c.name)
                              setDealId(null)
                              setDealTitle(null)
                              setContactSearch("")
                            }}
                            className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[var(--glass-bg-overlay)]"
                          >
                            <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                              {c.name}
                            </span>
                            {(c.email || c.phone) && (
                              <span className="truncate font-body text-[11px] text-[var(--text-muted)]">
                                {[c.email, c.phone].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {usesLocation && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ac-loc" className={labelCls}>
                  Local
                </label>
                <InputGlass
                  id="ac-loc"
                  placeholder="Endereço ou link"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Negócio (opcional) — após contato */}
          {showDealPicker && (
            <div className="mb-4 flex flex-col gap-1.5">
              <label htmlFor="ac-deal" className={labelCls}>
                Negócio{" "}
                <span className="normal-case tracking-normal font-body font-normal">(opcional)</span>
              </label>
              <select
                id="ac-deal"
                className={selectCls}
                value={dealId ?? ""}
                onChange={(e) => selectDeal(e.target.value)}
              >
                <option value="">Nenhum — só o contato</option>
                {dealOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Responsável — usuário ou departamento (tarefa compartilhada) */}
          <div className="mb-4 flex flex-col gap-1.5">
            <span className={labelCls}>Responsável</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAssignKind("user")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-semibold transition-all",
                  assignKind === "user"
                    ? "border-transparent bg-[var(--brand-primary)] text-white"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]",
                )}
              >
                Usuário
              </button>
              <button
                type="button"
                onClick={() => setAssignKind("department")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-semibold transition-all",
                  assignKind === "department"
                    ? "border-transparent bg-[var(--brand-primary)] text-white"
                    : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]",
                )}
              >
                Departamento
              </button>
            </div>
            {assignKind === "user" ? (
              <select
                className={selectCls}
                value={assigneeUserId}
                onChange={(e) => setAssigneeUserId(e.target.value)}
              >
                <option value="">Eu (padrão)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className={selectCls}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Selecione um departamento…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {assignKind === "department" && (
              <p className="font-body text-[11px] text-[var(--text-muted)]">
                Todos os membros do departamento verão e poderão concluir esta tarefa.
              </p>
            )}
          </div>

          {/* Notas */}
          <div className="mb-5 flex flex-col gap-1.5">
            <label htmlFor="ac-notes" className={labelCls}>
              Notas
            </label>
            <Textarea
              id="ac-notes"
              rows={3}
              placeholder="Detalhes adicionais (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none"
            />
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-2">
            <Dialog.Close asChild>
              <ButtonGlass variant="glass">Cancelar</ButtonGlass>
            </Dialog.Close>
            <ButtonGlass
              variant="primary"
              onClick={submit}
              disabled={!title.trim() || (assignKind === "department" && !departmentId)}
            >
              Agendar tarefa
            </ButtonGlass>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
