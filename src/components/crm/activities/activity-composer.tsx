"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckSquare, Clock } from "lucide-react"
import { IconSearch, IconX } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { InputGlass } from "@/components/crm/input-glass"
import { ButtonGlass } from "@/components/crm/button-glass"
import { DatePicker } from "@/components/ui/date-picker"
import { Textarea } from "@/components/ui/textarea"
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog"
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

const pillOff =
  "border-border bg-card text-muted-foreground hover:bg-secondary"
const assignPillOn = "border-primary bg-primary text-primary-foreground"

const KIND_PILL_ON: Record<ActivityKind, string> = {
  tarefa: "border-chip-blue bg-chip-blue text-primary-foreground",
  reuniao: "border-chip-violet bg-chip-violet text-primary-foreground",
  ligacao: "border-chip-green bg-chip-green text-primary-foreground",
  evento: "border-chip-orange bg-chip-orange text-primary-foreground",
  email: "border-chip-red bg-chip-red text-primary-foreground",
}

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
  const canSubmit = Boolean(title.trim()) && !(assignKind === "department" && !departmentId)

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
    if (!canSubmit) return
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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova tarefa"
      description="Agende uma tarefa, reunião, ligação ou evento."
      icon={
        <FormDialogIcon>
          <CheckSquare className="size-4" />
        </FormDialogIcon>
      }
      size="md"
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={!canSubmit}
            onClick={submit}
          >
            Salvar
          </ButtonGlass>
        </>
      }
    >
      <div>
        <label htmlFor="ac-title" className={formLabelClass}>
          Título *
        </label>
        <InputGlass
          id="ac-title"
          autoFocus
          placeholder="Adicionar título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
          }}
          className={cn(formControlClass, "h-12 text-lg font-semibold")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={formLabelClass}>Tipo</span>
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
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  active ? KIND_PILL_ON[k] : pillOff,
                )}
              >
                <Icon size={15} stroke={2} />
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className={formLabelClass}>Quando</span>
        <div className="flex flex-wrap items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <DatePicker
            value={date}
            onChange={setDate}
            shape="soft"
            placeholder="Escolher data"
            className="min-w-[10.5rem] flex-1"
            triggerClassName={cn(formControlClass, "h-11 justify-between")}
          />
          <InputGlass
            id="ac-time"
            type="time"
            aria-label="Hora"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={cn(formControlClass, "w-[7.5rem] shrink-0")}
          />
          {usesDuration && (
            <InputGlass
              id="ac-dur"
              type="number"
              min={5}
              step={5}
              aria-label="Duração em minutos"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={cn(formControlClass, "w-[6.5rem] shrink-0")}
              placeholder="Min"
            />
          )}
        </div>
      </div>

      <div className={cn("grid gap-3", usesLocation ? "grid-cols-2" : "grid-cols-1")}>
        <div className="relative">
          <label htmlFor="ac-who" className={formLabelClass}>
            Contato{" "}
            {!lockContact && (
              <span className="normal-case tracking-normal">(opcional)</span>
            )}
          </label>
          {contactId ? (
            <div
              className={cn(
                formControlClass,
                "flex items-center gap-2 px-3.5",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {contactName || "Contato selecionado"}
              </span>
              {!lockContact && (
                <button
                  type="button"
                  onClick={clearContact}
                  aria-label="Limpar contato"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <IconSearch
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <InputGlass
                id="ac-who"
                className={cn(formControlClass, "pl-9")}
                placeholder="Buscar contato cadastrado…"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                autoComplete="off"
              />
              {contactSearch.trim().length >= 1 && (
                <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                  {contactsQuery.isLoading ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Buscando…
                    </p>
                  ) : contactHits.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
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
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-secondary"
                      >
                        <span className="truncate text-sm font-semibold text-foreground">
                          {c.name}
                        </span>
                        {(c.email || c.phone) && (
                          <span className="truncate text-[11px] text-muted-foreground">
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
          <div>
            <label htmlFor="ac-loc" className={formLabelClass}>
              Local
            </label>
            <InputGlass
              id="ac-loc"
              placeholder="Endereço ou link"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={formControlClass}
            />
          </div>
        )}
      </div>

      {showDealPicker && (
        <div>
          <label htmlFor="ac-deal" className={formLabelClass}>
            Negócio <span className="normal-case tracking-normal">(opcional)</span>
          </label>
          <select
            id="ac-deal"
            className={cn(formControlClass, "text-sm text-foreground")}
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

      <div className="flex flex-col gap-1.5">
        <span className={formLabelClass}>Responsável</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setAssignKind("user")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
              assignKind === "user" ? assignPillOn : pillOff,
            )}
          >
            Usuário
          </button>
          <button
            type="button"
            onClick={() => setAssignKind("department")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
              assignKind === "department" ? assignPillOn : pillOff,
            )}
          >
            Departamento
          </button>
        </div>
        {assignKind === "user" ? (
          <select
            className={cn(formControlClass, "text-sm text-foreground")}
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
            className={cn(formControlClass, "text-sm text-foreground")}
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
          <p className="text-[11px] text-muted-foreground">
            Todos os membros do departamento verão e poderão concluir esta tarefa.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="ac-notes" className={formLabelClass}>
          Notas
        </label>
        <Textarea
          id="ac-notes"
          rows={3}
          placeholder="Detalhes adicionais (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={cn(formControlClass, "h-auto min-h-[5.5rem] resize-none py-2.5")}
        />
      </div>
    </FormDialog>
  )
}
