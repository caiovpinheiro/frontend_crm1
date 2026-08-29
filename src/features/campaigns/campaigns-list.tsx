"use client"

import Link from "next/link"
import { MessageCircle, Pause, Play, TriangleAlert, Trash2 } from "lucide-react"

import { EmptyState } from "@/components/crm/empty-state"
import { LIST_PAGE_STACK_CLASS } from "@/components/crm/pagination-glass"
import { ListColumnLabel, LIST_CARD_HEAD_CLASS, LIST_CARD_ROW_CLASS, LIST_CARD_STACK_CLASS } from "@/components/crm/sortable-header"
import { cn } from "@/lib/utils"

import { STATUS_CHIP_CLASS, STATUS_META } from "./constants"
import type { CampaignListItem, CampaignStatus } from "./types"
import {
  anomalies,
  campaignSegmentLabel,
  fmtDateBR,
  isDeletable,
  isPausable,
  isResumable,
  isSendingLike,
  nf,
  rate,
} from "./viz"

type VisualStatus =
  | "concluida"
  | "pausada"
  | "enviando"
  | "falhou"
  | "agendada"
  | "rascunho"

const dotStyle: Record<VisualStatus, string> = {
  concluida: "bg-success",
  pausada: "bg-warning",
  enviando: "bg-chip-blue",
  falhou: "bg-chip-red",
  agendada: "bg-chip-violet",
  rascunho: "bg-muted-foreground/40",
}

function visualStatus(status: CampaignStatus): VisualStatus {
  switch (status) {
    case "COMPLETED":
      return "concluida"
    case "PAUSED":
      return "pausada"
    case "SENDING":
    case "PROCESSING":
      return "enviando"
    case "FAILED":
      return "falhou"
    case "SCHEDULED":
      return "agendada"
    default:
      return "rascunho"
  }
}

const columnClass =
  "grid min-w-0 grid-cols-[1fr] items-center gap-4 lg:grid-cols-[minmax(0,1.6fr)_120px_minmax(0,110px)_repeat(3,minmax(0,0.8fr))]"

function MetricCell({ count, pct }: { count: number; pct: number }) {
  return (
    <div className="text-sm tabular-nums">
      <span className="font-semibold text-foreground">{nf(count)}</span>
      <span className="ml-1.5 text-muted-foreground">{pct}%</span>
    </div>
  )
}

export function CampaignsList({
  items,
  onDelete,
  onPause,
  onResume,
  pendingId,
}: {
  items: CampaignListItem[]
  onDelete?: (campaign: CampaignListItem) => void
  onPause?: (campaign: CampaignListItem) => void
  onResume?: (campaign: CampaignListItem) => void
  pendingId?: string | null
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
        <EmptyState
          icon={<MessageCircle size={28} />}
          title="Nenhuma campanha encontrada."
          description="Ajuste a busca ou o filtro para ver outros disparos."
        />
      </div>
    )
  }

  return (
    <div
      className={cn("min-w-0", LIST_CARD_STACK_CLASS, LIST_PAGE_STACK_CLASS)}
      aria-label="Lista de campanhas"
    >
      <div className={cn(columnClass, LIST_CARD_HEAD_CLASS)}>
        <ListColumnLabel>Campanha / público</ListColumnLabel>
        <ListColumnLabel>Status</ListColumnLabel>
        <ListColumnLabel>Leitura</ListColumnLabel>
        <ListColumnLabel>Lido</ListColumnLabel>
        <ListColumnLabel>Resp.</ListColumnLabel>
        <ListColumnLabel>Falha</ListColumnLabel>
      </div>

      {items.map((campaign) => {
          const visual = visualStatus(campaign.status)
          const sending = isSendingLike(campaign)
          const isEmpty = visual === "agendada" || visual === "rascunho"
          const warning =
            campaign.status === "FAILED"
              ? anomalies(campaign)[0] ?? STATUS_META.FAILED.label
              : anomalies(campaign)[0]
          const sent = campaign.sentCount || 0
          const total = campaign.totalRecipients || 0
          const sendPct = total ? Math.min(100, Math.round((sent / total) * 100)) : 0
          const readPct = rate(campaign.readCount || 0, sent)
          const respPct = rate(campaign.repliedCount || 0, sent)
          const failPct = rate(campaign.failedCount || 0, sent + (campaign.failedCount || 0))
          const canDelete = isDeletable(campaign)
          const href = `/campaigns/${campaign.number ?? campaign.id}`

          return (
            <div
              key={campaign.id}
              className={cn(
                "group relative cursor-pointer",
                LIST_CARD_ROW_CLASS,
                columnClass,
              )}
            >
              <Link
                href={href}
                className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Abrir ${campaign.name}`}
              >
                <span className="sr-only">Abrir campanha</span>
              </Link>

              <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-3">
                <span
                  className={cn("size-2.5 shrink-0 rounded-full", dotStyle[visual])}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{campaign.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageCircle className="size-3 text-primary" aria-hidden="true" />
                    <span className="truncate">
                      {campaignSegmentLabel(campaign)} · {fmtDateBR(campaign.createdAt)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                    STATUS_CHIP_CLASS[campaign.status],
                  )}
                >
                  {STATUS_META[campaign.status].label}
                </span>
                {warning && (
                  <TriangleAlert
                    className="size-4 shrink-0 text-chip-red"
                    aria-label={warning}
                  />
                )}
              </div>

              {sending ? (
                <div
                  className="pointer-events-none relative z-10 min-w-0 pr-[4.75rem] lg:col-span-4"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={sendPct}
                  aria-label={`Envio ${nf(sent)} de ${nf(total)}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${sendPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {nf(sent)} / {nf(total)}
                    </span>
                  </div>
                </div>
              ) : isEmpty ? (
                <p className="pointer-events-none relative z-10 text-sm italic text-muted-foreground lg:col-span-4">
                  {visual === "agendada" ? "Aguardando disparo" : "Rascunho"}
                </p>
              ) : (
                <>
                  <span
                    className={cn(
                      "pointer-events-none relative z-10 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
                      readPct >= 60
                        ? "bg-success-soft text-success"
                        : readPct > 0
                          ? "bg-warning-soft text-warning"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {readPct}%
                  </span>
                  <div className="pointer-events-none relative z-10">
                    <MetricCell count={campaign.readCount || 0} pct={readPct} />
                  </div>
                  <div className="pointer-events-none relative z-10">
                    <MetricCell count={campaign.repliedCount || 0} pct={respPct} />
                  </div>
                  <div className="pointer-events-none relative z-10 pr-[4.75rem]">
                    <MetricCell count={campaign.failedCount || 0} pct={failPct} />
                  </div>
                </>
              )}

              {(onPause || onResume || onDelete) && (
                <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 items-center pointer-events-auto">
                  {isPausable(campaign) && onPause ? (
                    <button
                      type="button"
                      disabled={pendingId === campaign.id}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onPause(campaign)
                      }}
                      aria-label="Pausar"
                      title="Pausar"
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        "text-primary transition-colors",
                        "hover:bg-primary/10",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      <Pause size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                  ) : null}
                  {isResumable(campaign) && onResume ? (
                    <button
                      type="button"
                      disabled={pendingId === campaign.id}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onResume(campaign)
                      }}
                      aria-label="Retomar"
                      title="Retomar"
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        "text-primary transition-colors",
                        "hover:bg-primary/10",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      <Play size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      disabled={!canDelete || pendingId === campaign.id}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (canDelete) onDelete(campaign)
                      }}
                      aria-label={`Excluir ${campaign.name}`}
                      title={
                        sending
                          ? "Campanhas em envio não podem ser excluídas"
                          : canDelete
                            ? "Excluir campanha"
                            : "Cancele a campanha antes de excluir"
                      }
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        "text-muted-foreground transition-colors",
                        "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                        "hover:bg-destructive/10 hover:text-destructive",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
                        "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
                      )}
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
