"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CheckSquare } from "lucide-react"
import { useSession } from "next-auth/react"
import { useUserRole } from "@/hooks/use-user-role"
import { toast } from "sonner"
import {
  IconChevronDown,
  IconExternalLink,
  IconLoader2,
  IconBan,
  IconCalendarEvent,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react"

import { AvatarGlass } from "@/components/crm/avatar-glass"
import { ButtonGlass } from "@/components/crm/button-glass"
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  FormDialog,
  FormDialogIcon,
  formDialogCancelClass,
  formLabelClass,
} from "@/components/ui/form-dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  ACTIVITY_COMMENT_CONTENT_MAX,
  type ActivityCommentDto,
  type ActivityCommentRevisionAction,
} from "@/features/directory-v2/api"
import { dtoToActivity } from "@/features/directory-v2/activity-adapter"
import {
  useActivity,
  useActivityCommentHistory,
  useActivityComments,
  useCreateActivityComment,
  useDeleteActivityComment,
  useUpdateActivityComment,
} from "@/features/directory-v2/hooks"
import {
  ACTIVITY_KINDS,
  activityTime,
  type Activity,
} from "@/lib/activities-data"
import { cn } from "@/lib/utils"

export interface ActivityDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** ID da atividade; quando null o dialog não carrega notas. */
  activityId: string | null
  /** Dados mínimos do cabeçalho (lista local). Enriquecidos via GET se disponível. */
  activity?: Activity | null
  onReschedule?: (activity: Activity) => void
  onCancel?: (activity: Activity) => void
  onDelete?: (activity: Activity) => void
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

const REVISION_LABEL: Record<ActivityCommentRevisionAction, string> = {
  CREATED: "Criou",
  UPDATED: "Editou",
  DELETED: "Excluiu",
}

const APPOINTMENT_KINDS = new Set<Activity["kind"]>(["reuniao", "evento", "ligacao"])

export function ActivityDetailDialog({
  open,
  onOpenChange,
  activityId,
  activity: activityProp,
  onReschedule,
  onCancel,
  onDelete,
}: ActivityDetailDialogProps) {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? null
  const { isManagerUp } = useUserRole()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const detailQuery = useActivity(activityId, open && Boolean(activityId))
  const activity: Activity | null = useMemo(() => {
    if (detailQuery.data) return dtoToActivity(detailQuery.data)
    return activityProp ?? null
  }, [detailQuery.data, activityProp])

  const commentsQuery = useActivityComments(activityId, open && Boolean(activityId))
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyQuery = useActivityCommentHistory(
    activityId,
    open && historyOpen && isManagerUp && Boolean(activityId),
  )

  const createMut = useCreateActivityComment(activityId)
  const updateMut = useUpdateActivityComment(activityId)
  const deleteMut = useDeleteActivityComment(activityId)

  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")

  const comments = commentsQuery.data?.items ?? []
  const revisions = historyQuery.data?.items ?? []

  const creatorName = activity?.createdBy?.name ?? "Sistema"
  const contextLink = activity?.dealId
    ? { href: `/pipeline/${activity.dealId}`, label: "Abrir negócio" }
    : activity?.contactId
      ? { href: `/contacts/${activity.contactId}`, label: "Abrir contato" }
      : null

  const meta = activity ? ACTIVITY_KINDS[activity.kind] : null

  const resetComposer = () => {
    setDraft("")
    setEditingId(null)
    setEditDraft("")
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetComposer()
      setHistoryOpen(false)
    }
    onOpenChange(next)
  }

  const submitNote = async () => {
    const content = draft.trim()
    if (!content || !activityId || createMut.isPending) return
    if (content.length > ACTIVITY_COMMENT_CONTENT_MAX) {
      toast.error(`Nota excede ${ACTIVITY_COMMENT_CONTENT_MAX} caracteres.`)
      return
    }
    try {
      await createMut.mutateAsync({ content })
      setDraft("")
      toast.success("Nota adicionada.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar nota.")
    }
  }

  const saveEdit = async (commentId: string) => {
    const content = editDraft.trim()
    if (!content || updateMut.isPending) return
    if (content.length > ACTIVITY_COMMENT_CONTENT_MAX) {
      toast.error(`Nota excede ${ACTIVITY_COMMENT_CONTENT_MAX} caracteres.`)
      return
    }
    try {
      await updateMut.mutateAsync({ commentId, content })
      setEditingId(null)
      setEditDraft("")
      toast.success("Nota atualizada.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao editar nota.")
    }
  }

  const removeNote = async (comment: ActivityCommentDto) => {
    const ok = await confirm({
      title: "Excluir nota?",
      description: "A nota será marcada como excluída e permanecerá no histórico.",
      confirmLabel: "Excluir",
      pendingLabel: "Excluindo…",
      destructive: true,
      action: async () => {
        try {
          await deleteMut.mutateAsync({ commentId: comment.id })
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Erro ao excluir nota.")
          throw e
        }
      },
    })
    if (!ok) return
    toast.success("Nota excluída.")
  }

  const footer =
    activity && (onReschedule || onCancel || onDelete) ? (
      <>
        {onReschedule && activity.status !== "concluida" && (
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onReschedule(activity)}
          >
            <IconCalendarEvent size={14} />
            Remarcar
          </ButtonGlass>
        )}
        {onCancel &&
          activity.status !== "concluida" &&
          APPOINTMENT_KINDS.has(activity.kind) && (
            <ButtonGlass
              type="button"
              variant="glass"
              className={formDialogCancelClass}
              onClick={() => onCancel(activity)}
            >
              <IconBan size={14} />
              Cancelar
            </ButtonGlass>
          )}
        {onDelete && (
          <ButtonGlass
            type="button"
            variant="danger"
            className="rounded-full px-4"
            onClick={() => onDelete(activity)}
          >
            <IconTrash size={14} />
            Excluir
          </ButtonGlass>
        )}
      </>
    ) : undefined

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={activity?.title ?? "Detalhes da tarefa"}
        description="Notas e histórico da tarefa"
        icon={
          <FormDialogIcon>
            <CheckSquare className="size-4" />
          </FormDialogIcon>
        }
        size="lg"
        footer={footer}
      >
              {activity && (
                <section className="mb-5 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {meta && (
                      <span
                        className="rounded-full px-2.5 py-0.5 font-display text-[10px] font-bold"
                        style={{ backgroundColor: meta.softBg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    )}
                    <span className="font-body text-[12px] text-[var(--text-muted)]">
                      {activity.start ? `${activity.start.slice(0, 10)} · ${activityTime(activity)}` : "—"}
                      {activity.status === "concluida" ? " · Concluída" : ""}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-2 font-body text-[12px] sm:grid-cols-2">
                    <div>
                      <dt className={formLabelClass}>
                        Criada por
                      </dt>
                      <dd className="mt-0.5 text-[var(--text-primary)]">{creatorName}</dd>
                    </div>
                    <div>
                      <dt className={formLabelClass}>
                        Responsável
                      </dt>
                      <dd className="mt-0.5 text-[var(--text-primary)]">
                        {activity.assigneeLabel ??
                          (activity.assigneeType === "department" ? "Departamento" : "—")}
                      </dd>
                    </div>
                    {(activity.contactName || activity.withWhom) && (
                      <div>
                        <dt className={formLabelClass}>
                          Contato
                        </dt>
                        <dd className="mt-0.5 text-[var(--text-primary)]">
                          {activity.contactName || activity.withWhom}
                        </dd>
                      </div>
                    )}
                    {activity.dealTitle && (
                      <div>
                        <dt className={formLabelClass}>
                          Negócio
                        </dt>
                        <dd className="mt-0.5 text-[var(--text-primary)]">{activity.dealTitle}</dd>
                      </div>
                    )}
                  </dl>

                  {activity.notes && (
                    <p className="mt-3 whitespace-pre-wrap font-body text-[13px] text-[var(--text-secondary)]">
                      {activity.notes}
                    </p>
                  )}

                  {contextLink && (
                    <Link
                      href={contextLink.href}
                      className="mt-3 inline-flex items-center gap-1.5 font-display text-[12px] font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-primary-dark)]"
                    >
                      <IconExternalLink size={14} />
                      {contextLink.label}
                    </Link>
                  )}
                </section>
              )}

              {/* Timeline de notas */}
              <section>
                <h3 className={cn(formLabelClass, "mb-2")}>
                  Notas
                </h3>

                {commentsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <IconLoader2 size={20} className="animate-spin text-[var(--text-muted)]" />
                  </div>
                ) : commentsQuery.isError ? (
                  <p className="py-4 text-center font-body text-[13px] text-[var(--color-danger)]">
                    {commentsQuery.error instanceof Error
                      ? commentsQuery.error.message
                      : "Não foi possível carregar as notas."}
                  </p>
                ) : comments.length === 0 ? (
                  <p className="py-6 text-center font-body text-[13px] text-[var(--text-muted)]">
                    Nenhuma nota ainda. Seja o primeiro a registrar.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {comments.map((c) => {
                      const isOwn = Boolean(currentUserId && c.authorId === currentUserId)
                      const deleted = Boolean(c.deletedAt)
                      const isEditing = editingId === c.id
                      return (
                        <li
                          key={c.id}
                          className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-3"
                        >
                          <div className="flex items-start gap-2.5">
                            <AvatarGlass
                              name={c.author.name}
                              imageUrl={c.author.avatarUrl}
                              seed={c.author.id}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                                  {c.author.name}
                                </span>
                                <span className="font-body text-[11px] text-[var(--text-muted)]">
                                  {formatDateTime(c.createdAt)}
                                  {c.editedAt && !deleted ? " · (editada)" : ""}
                                </span>
                              </div>

                              {isEditing ? (
                                <div className="mt-2 space-y-2">
                                  <Textarea
                                    rows={3}
                                    value={editDraft}
                                    maxLength={ACTIVITY_COMMENT_CONTENT_MAX}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    className="w-full resize-none"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <ButtonGlass
                                      variant="glass"
                                      type="button"
                                      onClick={() => {
                                        setEditingId(null)
                                        setEditDraft("")
                                      }}
                                    >
                                      Cancelar
                                    </ButtonGlass>
                                    <ButtonGlass
                                      variant="primary"
                                      type="button"
                                      disabled={!editDraft.trim() || updateMut.isPending}
                                      onClick={() => void saveEdit(c.id)}
                                    >
                                      {updateMut.isPending ? "Salvando…" : "Salvar"}
                                    </ButtonGlass>
                                  </div>
                                </div>
                              ) : deleted ? (
                                <p className="mt-1 italic font-body text-[13px] text-[var(--text-muted)]">
                                  Nota excluída
                                </p>
                              ) : (
                                <p className="mt-1 whitespace-pre-wrap font-body text-[13px] text-[var(--text-primary)]">
                                  {c.content}
                                </p>
                              )}
                            </div>

                            {isOwn && !deleted && !isEditing && (
                              <div className="flex shrink-0 gap-0.5">
                                <button
                                  type="button"
                                  aria-label="Editar nota"
                                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
                                  onClick={() => {
                                    setEditingId(c.id)
                                    setEditDraft(c.content ?? "")
                                  }}
                                >
                                  <IconPencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Excluir nota"
                                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] hover:text-[var(--color-danger)]"
                                  onClick={() => void removeNote(c)}
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {/* Composer — qualquer visualizador */}
                <div className="mt-3 space-y-2">
                  <Textarea
                    rows={3}
                    placeholder="Adicionar nota…"
                    value={draft}
                    maxLength={ACTIVITY_COMMENT_CONTENT_MAX}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full resize-none"
                    disabled={!activityId || createMut.isPending}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-[11px] text-[var(--text-muted)]">
                      {draft.length}/{ACTIVITY_COMMENT_CONTENT_MAX}
                    </span>
                    <ButtonGlass
                      variant="primary"
                      type="button"
                      disabled={!draft.trim() || createMut.isPending || !activityId}
                      onClick={() => void submitNote()}
                    >
                      {createMut.isPending ? "Enviando…" : "Adicionar nota"}
                    </ButtonGlass>
                  </div>
                </div>
              </section>

              {/* Histórico recolhível — só ADMIN/gestor */}
              {isManagerUp && (
              <section className="mt-5 border-t border-[var(--glass-border-subtle)] pt-3">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-1 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)]"
                >
                  <span className={formLabelClass}>
                    Histórico de alterações
                  </span>
                  <IconChevronDown
                    size={16}
                    className={cn(
                      "text-[var(--text-muted)] transition-transform",
                      historyOpen && "rotate-180",
                    )}
                  />
                </button>

                {historyOpen && (
                  <div className="mt-2">
                    {historyQuery.isLoading ? (
                      <div className="flex justify-center py-6">
                        <IconLoader2 size={18} className="animate-spin text-[var(--text-muted)]" />
                      </div>
                    ) : historyQuery.isError ? (
                      <p className="py-3 text-center font-body text-[12px] text-[var(--color-danger)]">
                        {historyQuery.error instanceof Error
                          ? historyQuery.error.message
                          : "Erro ao carregar histórico."}
                      </p>
                    ) : revisions.length === 0 ? (
                      <p className="py-3 text-center font-body text-[12px] text-[var(--text-muted)]">
                        Sem alterações registradas.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {revisions.map((r) => (
                          <li
                            key={r.id}
                            className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-2.5"
                          >
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-display text-[12px] font-semibold text-[var(--text-primary)]">
                                {REVISION_LABEL[r.action] ?? r.action}
                              </span>
                              <span className="font-body text-[11px] text-[var(--text-secondary)]">
                                {r.actor.name}
                              </span>
                              <span className="font-body text-[11px] text-[var(--text-muted)]">
                                {formatDateTime(r.createdAt)}
                              </span>
                            </div>
                            {(r.beforeContent != null || r.afterContent != null) && (
                              <div className="mt-1.5 space-y-1 font-body text-[12px]">
                                {r.beforeContent != null && (
                                  <p className="text-[var(--text-muted)]">
                                    <span className="font-display font-semibold">Antes:</span>{" "}
                                    <span className="whitespace-pre-wrap">{r.beforeContent || "—"}</span>
                                  </p>
                                )}
                                {r.afterContent != null && (
                                  <p className="text-[var(--text-secondary)]">
                                    <span className="font-display font-semibold">Depois:</span>{" "}
                                    <span className="whitespace-pre-wrap">{r.afterContent || "—"}</span>
                                  </p>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
              )}
      </FormDialog>
      {confirmDialog}
    </>
  )
}
