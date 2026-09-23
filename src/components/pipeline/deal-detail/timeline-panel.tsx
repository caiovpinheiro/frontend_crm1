"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconAlertTriangle as AlertTriangle, IconArrowRight as ArrowRight, IconRobot as Bot, IconCalendarCheck as CalendarCheck, IconCircleCheck as CheckCircle2, IconClock as Clock, IconEdit as Edit3, IconPackage as Package, IconSend as Send, IconNote as StickyNote, IconTag as Tag, IconTrash as Trash2, IconTrophy as Trophy, IconUserCheck as UserCheck, IconUserCog as UserCog, IconUserMinus as UserMinus, IconUserPlus as UserPlus, IconHierarchy as Workflow, IconCircleX as XCircle, IconRefresh as RefreshCw, IconRotate2 as RotateCcw } from "@tabler/icons-react"
import type { Icon as LucideIcon } from "@tabler/icons-react";

import Link from "next/link";

import { automationOrigin } from "@/components/crm/feed/event-config";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DealTimelineEvent } from "./shared";

const EVENT_CONFIG: Record<
  string,
  { Icon: LucideIcon; ring: string; bg: string; label: string }
> = {
  CREATED: {
    Icon: RefreshCw,
    ring: "ring-primary/30 text-primary",
    bg: "bg-primary-soft",
    label: "Negócio criado",
  },
  STAGE_CHANGED: {
    Icon: ArrowRight,
    ring: "ring-primary/30 text-primary-dark",
    bg: "bg-primary-soft",
    label: "Etapa alterada",
  },
  STATUS_CHANGED: {
    Icon: Trophy,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Status alterado",
  },
  OWNER_CHANGED: {
    Icon: UserCog,
    ring: "ring-accent/30 text-accent",
    bg: "bg-lavender-soft",
    label: "Responsável alterado",
  },
  FIELD_UPDATED: {
    Icon: Edit3,
    ring: "ring-cyan/30 text-cyan",
    bg: "bg-cyan-soft",
    label: "Campo atualizado",
  },
  TAG_ADDED: {
    Icon: Tag,
    ring: "ring-pink/30 text-pink",
    bg: "bg-pink-soft",
    label: "Tag adicionada",
  },
  TAG_REMOVED: {
    Icon: XCircle,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Tag removida",
  },
  PRODUCT_ADDED: {
    Icon: Package,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Produto adicionado",
  },
  PRODUCT_REMOVED: {
    Icon: Package,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Produto removido",
  },
  PRODUCT_UPDATED: {
    Icon: Package,
    ring: "ring-cyan/30 text-cyan",
    bg: "bg-cyan-soft",
    label: "Produto atualizado",
  },
  CUSTOM_FIELD_UPDATED: {
    Icon: Edit3,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Campo personalizado atualizado",
  },
  NOTE_ADDED: {
    Icon: StickyNote,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Nota adicionada",
  },
  ACTIVITY_ADDED: {
    Icon: CalendarCheck,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Tarefa criada",
  },
  ACTIVITY_STARTED: {
    Icon: CalendarCheck,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Tarefa em execução",
  },
  ACTIVITY_COMPLETED: {
    Icon: CalendarCheck,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Tarefa concluída",
  },
  ACTIVITY_UPDATED: {
    Icon: Edit3,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Tarefa atualizada",
  },
  ACTIVITY_DELETED: {
    Icon: Trash2,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Tarefa excluída",
  },
  NOTE_UPDATED: {
    Icon: Edit3,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Nota atualizada",
  },
  NOTE_DELETED: {
    Icon: Trash2,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Nota excluída",
  },
  CONTACT_LINKED: {
    Icon: UserPlus,
    ring: "ring-primary/30 text-primary",
    bg: "bg-primary-soft",
    label: "Contato vinculado",
  },
  CONTACT_UNLINKED: {
    Icon: UserMinus,
    ring: "ring-ink-subtle/30 text-foreground",
    bg: "bg-bg-subtle",
    label: "Contato desvinculado",
  },
  AUTOMATION_EXECUTED: {
    Icon: Workflow,
    ring: "ring-accent/30 text-accent",
    bg: "bg-lavender-soft",
    label: "Automação executada",
  },
  AI_AGENT_ACTION: {
    Icon: Bot,
    ring: "ring-pink/30 text-pink",
    bg: "bg-pink-soft",
    label: "Ação do agente IA",
  },
  CONVERSATION_STATUS_CHANGED: {
    Icon: CheckCircle2,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Status da conversa",
  },
  ASSIGNEE_CHANGED: {
    Icon: UserCheck,
    ring: "ring-accent/30 text-accent",
    bg: "bg-lavender-soft",
    label: "Responsável da conversa",
  },
  SCHEDULED_MESSAGE_CREATED: {
    Icon: Clock,
    ring: "ring-primary/30 text-primary",
    bg: "bg-primary-soft",
    label: "Mensagem agendada",
  },
  SCHEDULED_MESSAGE_SENT: {
    Icon: Send,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Mensagem agendada enviada",
  },
  SCHEDULED_MESSAGE_CANCELLED: {
    Icon: XCircle,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Mensagem agendada cancelada",
  },
  SCHEDULED_MESSAGE_FAILED: {
    Icon: AlertTriangle,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Falha no envio agendado",
  },
  MESSAGE_READ: {
    Icon: CheckCircle2,
    ring: "ring-sky-500/30 text-sky-500",
    bg: "bg-sky-500/10",
    label: "Mensagem lida",
  },
};

const FALLBACK_CONFIG = {
  Icon: RotateCcw,
  ring: "ring-ink-subtle/30 text-ink-muted",
  bg: "bg-bg-subtle",
  label: "Evento",
};

function formatDayHeader(d: Date) {
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
}

function groupByDay(events: DealTimelineEvent[]) {
  const map = new Map<string, DealTimelineEvent[]>();
  for (const ev of events) {
    const key = format(parseISO(ev.createdAt), "yyyy-MM-dd");
    const arr = map.get(key);
    if (arr) arr.push(ev);
    else map.set(key, [ev]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

const STATUS_LABEL: Record<string, string> = { OPEN: "Aberto", WON: "Ganho", LOST: "Perdido" };

const FIELD_LABEL: Record<string, string> = {
  title: "Título",
  value: "Valor",
  expectedClose: "Fechamento previsto",
};

function eventDescription(ev: DealTimelineEvent): string {
  const m = ev.meta;

  switch (ev.type) {
    case "STAGE_CHANGED": {
      const from = (m.from as { name?: string })?.name ?? "?";
      const to = (m.to as { name?: string })?.name ?? "?";
      return `${from} → ${to}`;
    }
    case "STATUS_CHANGED": {
      const from = STATUS_LABEL[m.from as string] ?? (m.from as string);
      const to = STATUS_LABEL[m.to as string] ?? (m.to as string);
      const reason = m.lostReason ? ` — ${m.lostReason}` : "";
      return `${from} → ${to}${reason}`;
    }
    case "OWNER_CHANGED": {
      const from = (m.from as { name?: string })?.name ?? "Nenhum";
      const to = (m.to as { name?: string })?.name ?? (m.to as { id?: string })?.id ?? "Nenhum";
      return `${from} → ${to}`;
    }
    case "FIELD_UPDATED": {
      const label = FIELD_LABEL[m.field as string] ?? (m.field as string);
      const from = m.from ? String(m.from) : "vazio";
      const to = m.to ? String(m.to) : "vazio";
      return `${label}: ${from} → ${to}`;
    }
    case "TAG_ADDED":
    case "TAG_REMOVED":
      return String(m.tagName ?? "");
    case "PRODUCT_ADDED":
    case "PRODUCT_REMOVED":
    case "PRODUCT_UPDATED":
      return String(m.productName ?? "");
    case "CUSTOM_FIELD_UPDATED": {
      const label = String(m.fieldLabel ?? "?");
      const from = m.from ? String(m.from) : "vazio";
      const to = m.to ? String(m.to) : "vazio";
      return `${label}: ${from} → ${to}`;
    }
    case "NOTE_ADDED":
    case "NOTE_UPDATED":
    case "NOTE_DELETED":
      return String(m.preview ?? "");
    case "ACTIVITY_ADDED":
      return String(m.title ?? "");
    case "ACTIVITY_STARTED": {
      const title = String(m.title ?? "Tarefa");
      const who = m.actorName ? String(m.actorName) : "";
      return who ? `${title} — ${who} começou a executar` : title;
    }
    case "ACTIVITY_COMPLETED": {
      const title = String(m.title ?? "Tarefa");
      const who = m.actorName ? String(m.actorName) : "";
      const starter = m.startedByName ? String(m.startedByName) : "";
      const done = who ? `concluída por ${who}` : "concluída";
      const ran = starter && starter !== who ? `execução de ${starter}, ` : "";
      return `${title} — ${ran}${done}`;
    }
    case "ACTIVITY_UPDATED": {
      const title = String(m.title ?? "");
      const fields = Array.isArray(m.fields) ? (m.fields as string[]).join(", ") : "";
      return fields ? `${title} — alterado: ${fields}` : title;
    }
    case "ACTIVITY_DELETED":
      return String(m.title ?? "");
    case "CONTACT_LINKED": {
      const to = (m.to as { name?: string })?.name ?? "";
      const from = (m.from as { name?: string })?.name;
      return from ? `${from} → ${to}` : to;
    }
    case "CONTACT_UNLINKED": {
      const from = (m.from as { name?: string })?.name ?? "";
      return from;
    }
    case "AUTOMATION_EXECUTED": {
      const name = String(m.automationName ?? "Automação");
      const evt = m.event ? ` • ${m.event}` : "";
      const st = m.status === "COMPLETED_WITH_ERRORS" ? " (com erros)" : "";
      return `${name}${evt}${st}`;
    }
    case "AI_AGENT_ACTION": {
      const actionMap: Record<string, string> = {
        created_deal: "criou negócio",
        moved_stage: "moveu estágio",
        added_tag: "adicionou tag",
        transferred_to_human: "transferiu para humano",
      };
      const action = actionMap[String(m.action ?? "")] ?? String(m.action ?? "");
      const extra =
        m.stageName ? ` → ${m.stageName}` :
        m.tagName ? `: ${m.tagName}` :
        m.title ? `: ${m.title}` :
        m.reason ? ` — ${m.reason}` : "";
      return `${action}${extra}`;
    }
    case "CONVERSATION_STATUS_CHANGED": {
      const statusMap: Record<string, string> = { OPEN: "Aberta", RESOLVED: "Resolvida", PENDING: "Pendente", SNOOZED: "Adiada" };
      const from = statusMap[String(m.from)] ?? String(m.from);
      const to = statusMap[String(m.to)] ?? String(m.to);
      return `${from} → ${to}`;
    }
    case "ASSIGNEE_CHANGED": {
      const from = (m.from as { name?: string })?.name ?? "Nenhum";
      const to = (m.to as { name?: string })?.name ?? "Nenhum";
      return `${from} → ${to}`;
    }
    case "SCHEDULED_MESSAGE_CREATED": {
      const preview = String(m.preview ?? "").trim();
      const when = m.scheduledAt
        ? format(parseISO(String(m.scheduledAt)), "dd/MM 'às' HH:mm", { locale: ptBR })
        : "";
      const suffix = m.hasFallbackTemplate ? " (com template de fallback)" : "";
      const shortPreview = preview ? ` — "${preview.length > 80 ? preview.slice(0, 80) + "…" : preview}"` : m.hasMedia ? " — anexo" : "";
      return `Para ${when}${shortPreview}${suffix}`;
    }
    case "SCHEDULED_MESSAGE_SENT": {
      return m.viaFallbackTemplate ? "Enviada via template (sessão 24h expirada)" : "Enviada automaticamente";
    }
    case "SCHEDULED_MESSAGE_CANCELLED": {
      const reasonMap: Record<string, string> = {
        client_reply: "cliente respondeu",
        agent_reply: "agente respondeu",
        manual: "cancelado manualmente",
        conversation_closed: "conversa encerrada",
      };
      return reasonMap[String(m.reason ?? "")] ?? String(m.reason ?? "");
    }
    case "SCHEDULED_MESSAGE_FAILED": {
      return String(m.reason ?? "Erro desconhecido");
    }
    case "MESSAGE_READ": {
      const preview = String(m.preview ?? "").trim();
      if (preview) {
        return preview.length > 80 ? `"${preview.slice(0, 80)}…"` : `"${preview}"`;
      }
      return "Cliente leu a mensagem";
    }
    default:
      return "";
  }
}

export function TimelinePanel({ dealId }: { dealId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["deal-timeline", dealId],
    enabled: Boolean(dealId),
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/deals/${dealId}/timeline`));
      if (!res.ok) throw new Error("Falha ao carregar timeline");
      return (await res.json()) as DealTimelineEvent[];
    },
  });

  const groups = React.useMemo(() => (data?.length ? groupByDay(data) : []), [data]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 pt-0.5">
                <Skeleton className="h-4 w-[75%] max-w-xs" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <RotateCcw className="mb-3 size-10 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Alterações no deal aparecerão aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
      <div className="relative">
        <div className="space-y-8">
          {groups.map(([dayKey, dayItems]) => (
            <div key={dayKey}>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDayHeader(parseISO(dayItems[0].createdAt))}
              </h3>
              <ul>
                {dayItems.map((ev, idx) => {
                  const cfg = EVENT_CONFIG[ev.type] ?? FALLBACK_CONFIG;
                  const Icon = cfg.Icon;
                  const desc = eventDescription(ev);
                  const at = parseISO(ev.createdAt);
                  const isLast = idx === dayItems.length - 1;
                  // Origem da ação automática (automação + nº do card do
                  // editor). Ausente em eventos antigos / ações manuais.
                  const origin = automationOrigin(ev.meta);

                  return (
                    <li key={ev.id} className="relative flex gap-3 pb-6 last:pb-0">
                      <div className="relative z-1 flex shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background",
                            cfg.bg,
                            cfg.ring,
                          )}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        {!isLast && (
                          <span
                            className="absolute top-9 left-1/2 h-[calc(100%-0.25rem)] w-px -translate-x-1/2 bg-border"
                            aria-hidden
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium">{cfg.label}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {format(at, "HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {desc && (
                          <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                            {desc}
                          </p>
                        )}
                        {ev.user && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            por {ev.user.name}
                          </p>
                        )}
                        {origin && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {origin.automationId ? (
                              <Link
                                href={`/automations/${origin.automationId}`}
                                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                              >
                                {origin.text}
                              </Link>
                            ) : (
                              origin.text
                            )}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
