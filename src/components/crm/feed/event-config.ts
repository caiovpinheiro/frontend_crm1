/**
 * Configuracao visual e descritor de eventos do Activity Log (Kommo-grade).
 *
 * Generalizado do `timeline-panel.tsx` (que era deal-only) — agora cobre
 * eventos de DEAL, CONTACT, CONVERSATION, MESSAGE, ACTIVITY, NOTE, TAG.
 *
 * Para adicionar um novo tipo de evento:
 *   1. Adicionar entrada em EVENT_CONFIG (icone + cores + label canonico)
 *   2. Adicionar caso em eventDescription() para o detalhe (old → new)
 * Tipos nao mapeados caem em FALLBACK_CONFIG e geram descricao vazia.
 */

import { IconAlertTriangle as AlertTriangle, IconArrowRight as ArrowRight, IconRobot as Bot, IconCalendarCheck as CalendarCheck, IconCircleCheck as CheckCircle2, IconClock as Clock, IconEdit as Edit3, IconMessage as MessageSquare, IconMessagePlus as MessageSquarePlus, IconPackage as Package, IconPhone as Phone, IconPhoneEnd as PhoneMissed, IconSend as Send, IconNote as StickyNote, IconTag as Tag, IconTrash as Trash2, IconTrophy as Trophy, IconUserCheck as UserCheck, IconUserCog as UserCog, IconUserMinus as UserMinus, IconUserPlus as UserPlus, IconUsers as Users, IconHierarchy as Workflow, IconCircleX as XCircle, IconRefresh as RefreshCw, IconRotate2 as RotateCcw } from "@tabler/icons-react"
import type { Icon as LucideIcon } from "@tabler/icons-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { summarizeSendError } from "@/lib/meta-error-catalog";

export type EventVisualConfig = {
  Icon: LucideIcon;
  ring: string;
  bg: string;
  label: string;
};

export const EVENT_CONFIG: Record<string, EventVisualConfig> = {
  // ── Deal ─────────────────────────────────────────────────────────
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
  DEAL_DELETED: {
    Icon: Trash2,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Negócio excluído",
  },
  CUSTOM_FIELD_UPDATED: {
    Icon: Edit3,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Campo personalizado atualizado",
  },

  // ── Tags / Produtos ──────────────────────────────────────────────
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

  // ── Notas / Atividades ───────────────────────────────────────────
  NOTE_ADDED: {
    Icon: StickyNote,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Nota adicionada",
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
  ACTIVITY_DUE_CHANGED: {
    Icon: Clock,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Prazo da tarefa alterado",
  },
  ACTIVITY_DESCRIPTION_CHANGED: {
    Icon: Edit3,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Descrição da tarefa alterada",
  },
  ACTIVITY_RENAMED: {
    Icon: Edit3,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Tarefa renomeada",
  },
  ACTIVITY_DELETED: {
    Icon: Trash2,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Tarefa excluída",
  },

  // ── Vinculo de contato ───────────────────────────────────────────
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
  CONTACT_CREATED: {
    Icon: Users,
    ring: "ring-primary/30 text-primary",
    bg: "bg-primary-soft",
    label: "Contato criado",
  },
  CONTACT_DELETED: {
    Icon: Trash2,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Contato excluído",
  },
  CONTACT_FIELD_CHANGED: {
    Icon: Edit3,
    ring: "ring-cyan/30 text-cyan",
    bg: "bg-cyan-soft",
    label: "Campo do contato alterado",
  },
  CONTACT_TAG_ADDED: {
    Icon: Tag,
    ring: "ring-pink/30 text-pink",
    bg: "bg-pink-soft",
    label: "Tag adicionada ao contato",
  },
  CONTACT_TAG_REMOVED: {
    Icon: XCircle,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Tag removida do contato",
  },
  CONTACT_OWNER_CHANGED: {
    Icon: UserCog,
    ring: "ring-accent/30 text-accent",
    bg: "bg-lavender-soft",
    label: "Responsável do contato",
  },

  // ── Conversa / Mensagem ──────────────────────────────────────────
  CONVERSATION_CREATED: {
    Icon: MessageSquarePlus,
    ring: "ring-primary/30 text-primary",
    bg: "bg-primary-soft",
    label: "Conversa criada",
  },
  CONVERSATION_STATUS_CHANGED: {
    Icon: CheckCircle2,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Status da conversa",
  },
  CONVERSATION_CLOSED: {
    Icon: CheckCircle2,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Conversa encerrada",
  },
  CONVERSATION_TABULATED: {
    Icon: CheckCircle2,
    ring: "ring-accent/30 text-accent",
    bg: "bg-lavender-soft",
    label: "Conversa tabulada",
  },
  CONVERSATION_REOPENED: {
    Icon: RotateCcw,
    ring: "ring-warning/30 text-warning",
    bg: "bg-warning-soft",
    label: "Conversa reaberta",
  },
  ASSIGNEE_CHANGED: {
    Icon: UserCheck,
    ring: "ring-accent/30 text-accent",
    bg: "bg-lavender-soft",
    label: "Responsável da conversa",
  },
  CONVERSATION_DEPARTMENT_CHANGED: {
    Icon: Workflow,
    ring: "ring-accent/30 text-accent",
    bg: "bg-lavender-soft",
    label: "Departamento alterado",
  },
  MESSAGE_SENT: {
    Icon: Send,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Mensagem enviada",
  },
  MESSAGE_RECEIVED: {
    Icon: MessageSquare,
    ring: "ring-primary/30 text-primary",
    bg: "bg-primary-soft",
    label: "Mensagem recebida",
  },
  MESSAGE_FAILED: {
    Icon: AlertTriangle,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Falha no envio",
  },
  MESSAGE_READ: {
    Icon: CheckCircle2,
    ring: "ring-sky-500/30 text-sky-500",
    bg: "bg-sky-500/10",
    label: "Mensagem lida",
  },

  // ── Chamadas ─────────────────────────────────────────────────────
  CALL_COMPLETED: {
    Icon: Phone,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Chamada atendida",
  },
  CALL_MISSED: {
    Icon: PhoneMissed,
    ring: "ring-destructive/30 text-destructive",
    bg: "bg-destructive-soft",
    label: "Chamada perdida",
  },

  // ── Mensagens agendadas ──────────────────────────────────────────
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

  // ── Automacao / IA ───────────────────────────────────────────────
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

  // ── Distribuição Inteligente ─────────────────────────────────────
  LEAD_DISTRIBUTED: {
    Icon: UserCheck,
    ring: "ring-success/30 text-success",
    bg: "bg-success-soft",
    label: "Lead distribuído",
  },
  LEAD_DISTRIBUTION_FAILED: {
    Icon: Clock,
    ring: "ring-ink-subtle/30 text-ink-muted",
    bg: "bg-bg-subtle",
    label: "Distribuição pendente",
  },
};

export const FALLBACK_CONFIG: EventVisualConfig = {
  Icon: RotateCcw,
  ring: "ring-ink-subtle/30 text-ink-muted",
  bg: "bg-bg-subtle",
  label: "Evento",
};

/**
 * Evento canonico do feed/timeline. Usado por FeedRow, FeedDayHeader e
 * pelo deal-timeline (apontando para o mesmo endpoint).
 */
export type FeedEvent = {
  id: string;
  type: string;
  /// Timestamp ISO. `occurredAt` no log novo, `createdAt` no antigo
  /// (mantemos ambos disponiveis na transformacao do caller).
  occurredAt: string;
  meta: Record<string, unknown>;

  entityType?: string;
  entityId?: string;
  entityLabel?: string | null;

  dealId?: string | null;
  contactId?: string | null;
  conversationId?: string | null;

  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;

  actorType?: "HUMAN" | "AI" | "AUTOMATION" | "INTEGRATION" | "SYSTEM";
  actorUserId?: string | null;
  actorLabel?: string | null;
  actorSublabel?: string | null;
  actorRef?: string | null;
  actorUser?: { id: string; name: string | null; avatarUrl: string | null } | null;
  /// Nome do contato relacionado ao evento. Enriquecido pelo backend
  /// (`/api/activity-feed`) via batch fetch quando `contactId` existe.
  /// Usado na coluna "Origem" para distinguir Cliente x Agente em
  /// eventos de mensagem, sem alterar o `entityLabel` semântico.
  contactName?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberto",
  WON: "Ganho",
  LOST: "Perdido",
};
const CONV_STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberta",
  RESOLVED: "Encerrada",
  PENDING: "Pendente",
  SNOOZED: "Adiada",
};
const FIELD_LABEL: Record<string, string> = {
  title: "Título",
  value: "Valor",
  expectedClose: "Fechamento previsto",
};

/// Descricao textual do evento (linha 2 do FeedRow), no formato
/// "antigo → novo" / "rotulo do alvo" / "preview" conforme o tipo.
function formatCreatedAtLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d =
      typeof iso === "string" && iso.includes("T") ? parseISO(iso) : new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
}

export function eventDescription(ev: FeedEvent): string {
  const m = ev.meta ?? {};

  // Atalho universal: se o evento tiver field/oldValue/newValue
  // populados (log novo), renderiza um diff generico no fallback.
  const genericDiff = (): string | null => {
    if (ev.field && (ev.oldValue || ev.newValue)) {
      const label = FIELD_LABEL[ev.field] ?? ev.field;
      return `${label}: ${ev.oldValue ?? "vazio"} → ${ev.newValue ?? "vazio"}`;
    }
    return null;
  };

  switch (ev.type) {
    case "CREATED": {
      const when =
        formatCreatedAtLabel(String(m.createdAt ?? "")) ||
        formatCreatedAtLabel(ev.occurredAt);
      return when ? `Criado em ${when}` : String(ev.entityLabel ?? "");
    }
    case "STAGE_CHANGED": {
      const from = (m.from as { name?: string })?.name ?? ev.oldValue ?? "?";
      const to = (m.to as { name?: string })?.name ?? ev.newValue ?? "?";
      return `${from} → ${to}`;
    }
    case "STATUS_CHANGED": {
      const from = STATUS_LABEL[m.from as string] ?? (m.from as string) ?? ev.oldValue ?? "?";
      const to = STATUS_LABEL[m.to as string] ?? (m.to as string) ?? ev.newValue ?? "?";
      const reason = m.lostReason ? ` — ${m.lostReason}` : "";
      return `${from} → ${to}${reason}`;
    }
    case "OWNER_CHANGED":
    case "CONTACT_OWNER_CHANGED":
    case "ASSIGNEE_CHANGED": {
      const from = (m.from as { name?: string })?.name ?? ev.oldValue ?? "Nenhum";
      const to =
        (m.to as { name?: string })?.name ??
        (m.to as { id?: string })?.id ??
        ev.newValue ??
        "Nenhum";
      return `${from} → ${to}`;
    }
    case "FIELD_UPDATED":
    case "CONTACT_FIELD_CHANGED": {
      const label =
        FIELD_LABEL[(m.field as string) ?? ev.field ?? ""] ??
        (m.field as string) ??
        ev.field ??
        "Campo";
      const from = m.from ? String(m.from) : ev.oldValue ?? "vazio";
      const to = m.to ? String(m.to) : ev.newValue ?? "vazio";
      return `${label}: ${from} → ${to}`;
    }
    case "CUSTOM_FIELD_UPDATED": {
      const label = String(m.fieldLabel ?? ev.field ?? "?");
      const from = m.from ? String(m.from) : ev.oldValue ?? "vazio";
      const to = m.to ? String(m.to) : ev.newValue ?? "vazio";
      return `${label}: ${from} → ${to}`;
    }
    case "TAG_ADDED":
    case "TAG_REMOVED":
    case "CONTACT_TAG_ADDED":
    case "CONTACT_TAG_REMOVED":
      return String(m.tagName ?? ev.newValue ?? ev.oldValue ?? "");
    case "PRODUCT_ADDED":
    case "PRODUCT_REMOVED":
    case "PRODUCT_UPDATED":
      return String(m.productName ?? "");
    case "NOTE_ADDED":
    case "NOTE_UPDATED":
    case "NOTE_DELETED":
      return String(m.preview ?? "");
    case "ACTIVITY_ADDED":
    case "ACTIVITY_DELETED":
    case "ACTIVITY_RENAMED":
      return String(m.title ?? ev.newValue ?? "");
    case "ACTIVITY_STARTED": {
      const title = String(m.title ?? "Tarefa");
      const who = m.actorName ? String(m.actorName) : "";
      return who ? `${title} — ${who} começou a executar` : title;
    }
    case "ACTIVITY_COMPLETED": {
      const title = String(m.title ?? "Tarefa");
      const who = m.actorName ? String(m.actorName) : "";
      const starter = m.startedByName ? String(m.startedByName) : "";
      const result = m.result ? ` — ${String(m.result)}` : "";
      const done = who ? `concluída por ${who}` : "concluída";
      const ran = starter && starter !== who ? `execução de ${starter}, ` : "";
      return `${title} — ${ran}${done}${result}`;
    }
    case "ACTIVITY_DESCRIPTION_CHANGED":
      return String(m.title ?? "");
    case "ACTIVITY_DUE_CHANGED": {
      const title = String(m.title ?? "");
      const fmt = (v?: string | null) =>
        v ? format(parseISO(v), "dd/MM 'às' HH:mm", { locale: ptBR }) : "sem prazo";
      return `${title}: ${fmt(ev.oldValue)} → ${fmt(ev.newValue)}`;
    }
    case "ACTIVITY_UPDATED": {
      const title = String(m.title ?? "");
      const fields = Array.isArray(m.fields) ? (m.fields as string[]).join(", ") : "";
      return fields ? `${title} — alterado: ${fields}` : title;
    }
    case "CONTACT_LINKED": {
      const to = (m.to as { name?: string })?.name ?? "";
      const from = (m.from as { name?: string })?.name;
      return from ? `${from} → ${to}` : to;
    }
    case "CONTACT_UNLINKED": {
      const from = (m.from as { name?: string })?.name ?? "";
      return from;
    }
    case "CONTACT_CREATED": {
      const when =
        formatCreatedAtLabel(String(m.createdAt ?? "")) ||
        formatCreatedAtLabel(ev.occurredAt);
      const who = String(m.name ?? m.preview ?? ev.entityLabel ?? "").trim();
      if (when && who) return `${who} · criado em ${when}`;
      if (when) return `Criado em ${when}`;
      return who || String(m.source ?? "");
    }
    case "CONTACT_DELETED":
    case "DEAL_DELETED":
      return String(ev.entityLabel ?? m.name ?? m.title ?? "");
    case "CALL_COMPLETED":
    case "CALL_MISSED": {
      const initiatedBy =
        m.initiatedBy === "contact" ? "Cliente ligou" : "Empresa ligou";
      const dur = Number(m.durationSec ?? 0);
      if (dur > 0) {
        const mm = Math.floor(dur / 60);
        const ss = dur % 60;
        const durStr = mm > 0 ? `${mm}m${ss.toString().padStart(2, "0")}s` : `${ss}s`;
        const rec = m.recordingUrl ? " • gravação" : "";
        return `${initiatedBy} • ${durStr}${rec}`;
      }
      return initiatedBy;
    }
    case "MESSAGE_SENT":
    case "MESSAGE_RECEIVED": {
      const preview = String(m.preview ?? "").trim();
      if (preview) {
        return preview.length > 140 ? `${preview.slice(0, 140)}…` : preview;
      }
      if (m.hasMedia) return "[anexo]";
      return "";
    }
    case "MESSAGE_FAILED": {
      const raw = String(ev.newValue ?? m.error ?? "").trim();
      // Resumo CURTO (motivo PT-BR + código) — a mensagem crua da Meta é
      // enorme e poluiria a timeline/logs. O texto completo continua
      // disponível no tooltip da bolha (com botão "Copiar erro").
      const err = raw ? summarizeSendError(raw) : "";
      const code =
        m.errorCode && !/\bc(?:ode|ód\.)\s/i.test(err)
          ? ` (cód. ${String(m.errorCode)})`
          : "";
      return (err || "Falha no envio") + code;
    }
    case "MESSAGE_READ": {
      const preview = String(m.preview ?? ev.newValue ?? "").trim();
      if (preview) {
        return preview.length > 140 ? `${preview.slice(0, 140)}…` : preview;
      }
      return "Cliente leu a mensagem";
    }
    case "CONVERSATION_DEPARTMENT_CHANGED": {
      const from =
        (m.fromDepartmentName as string) ?? ev.oldValue ?? "Nenhum";
      const to = (m.toDepartmentName as string) ?? ev.newValue ?? "Nenhum";
      return `${from} → ${to}`;
    }
    case "CONVERSATION_CREATED": {
      const source = String(m.source ?? "");
      const openedEmpty = m.openedWithoutMessage === true;
      if (openedEmpty || source === "ui_skip_send" || source === "deal_chat" || source === "deal_workspace" || source === "deal_panel") {
        const where =
          source === "deal_chat" || source === "deal_workspace" || source === "deal_panel"
            ? "pelo negócio"
            : "pela interface";
        return `Atendimento aberto sem mensagem (${where})`;
      }
      if (source === "reopen") return "Novo ticket após reabertura";
      if (source === "outbound_reopen") return "Novo ticket ao responder conversa encerrada";
      const channel = String(m.channel ?? "").trim();
      return channel ? `Canal ${channel}` : "";
    }
    case "CONVERSATION_CLOSED":
    case "CONVERSATION_REOPENED":
    case "CONVERSATION_STATUS_CHANGED": {
      const from = CONV_STATUS_LABEL[String(m.from)] ?? String(m.from ?? "");
      const to = CONV_STATUS_LABEL[String(m.to)] ?? String(m.to ?? "");
      return from && to ? `${from} → ${to}` : to || from;
    }
    case "CONVERSATION_TABULATED": {
      const name = String(m.tabulationName ?? m.tabulationLabel ?? "").trim();
      const numRaw = m.tabulationNumber;
      const num =
        typeof numRaw === "number" && Number.isFinite(numRaw)
          ? numRaw
          : typeof numRaw === "string" && /^\d+$/.test(numRaw)
            ? Number(numRaw)
            : null;
      if (name) return num != null ? `${name} (#${num})` : name;
      return "Tabulação registrada";
    }
    case "AUTOMATION_EXECUTED": {
      const name = String(m.automationName ?? "Automação");
      const evt = m.event ? ` • ${m.event}` : "";
      const st = m.status === "COMPLETED_WITH_ERRORS" ? " (com erros)" : "";
      return `${name}${evt}${st}`;
    }
    case "LEAD_DISTRIBUTED": {
      const who = String(ev.newValue ?? ev.entityLabel ?? "").trim();
      return who ? `para ${who}` : "Distribuição Inteligente";
    }
    case "LEAD_DISTRIBUTION_FAILED": {
      const reason = String(m.reason ?? "");
      if (reason === "NO_ELIGIBLE_RESPONSIBLE")
        return "Sem responsável disponível — na fila de espera";
      if (reason === "NO_DEPARTMENT")
        return "Sem departamento habilitado — na fila de espera";
      return "Não distribuído — na fila de espera";
    }
    case "AI_AGENT_ACTION": {
      const actionMap: Record<string, string> = {
        created_deal: "criou negócio",
        moved_stage: "moveu estágio",
        added_tag: "adicionou tag",
        transferred_to_human: "transferiu para humano",
      };
      const action = actionMap[String(m.action ?? "")] ?? String(m.action ?? "");
      const extra = m.stageName
        ? ` → ${m.stageName}`
        : m.tagName
          ? `: ${m.tagName}`
          : m.title
            ? `: ${m.title}`
            : m.reason
              ? ` — ${m.reason}`
              : "";
      return `${action}${extra}`;
    }
    case "SCHEDULED_MESSAGE_CREATED": {
      const preview = String(m.preview ?? "").trim();
      const when = m.scheduledAt
        ? format(parseISO(String(m.scheduledAt)), "dd/MM 'às' HH:mm", { locale: ptBR })
        : "";
      const suffix = m.hasFallbackTemplate ? " (com template de fallback)" : "";
      const shortPreview = preview
        ? ` — "${preview.length > 80 ? preview.slice(0, 80) + "…" : preview}"`
        : m.hasMedia
          ? " — anexo"
          : "";
      return `Para ${when}${shortPreview}${suffix}`;
    }
    case "SCHEDULED_MESSAGE_SENT":
      return m.viaFallbackTemplate
        ? "Enviada via template (sessão 24h expirada)"
        : "Enviada automaticamente";
    case "SCHEDULED_MESSAGE_CANCELLED": {
      const reasonMap: Record<string, string> = {
        client_reply: "cliente respondeu",
        agent_reply: "agente respondeu",
        manual: "cancelado manualmente",
        conversation_closed: "conversa encerrada",
      };
      return reasonMap[String(m.reason ?? "")] ?? String(m.reason ?? "");
    }
    case "SCHEDULED_MESSAGE_FAILED":
      return String(m.reason ?? "Erro desconhecido");
    default:
      return genericDiff() ?? "";
  }
}

/**
 * Origem de automacao do evento — "qual card fez isso".
 *
 * O backend grava `meta.automationOrigin` em todo evento produzido dentro
 * de um passo de automacao (ver `lib/automation-origin.ts` +
 * `withAutomationOriginMeta`). O `stepNumber` e o MESMO numero exibido no
 * badge do card no editor de automacoes, entao o operador consegue abrir
 * o fluxo e achar o passo que, por exemplo, distribuiu o lead.
 *
 * Eventos ANTIGOS (pre-feature) nao tem a chave: retornamos `null` e a UI
 * simplesmente nao renderiza a linha. Como fallback, aceitamos o
 * `meta.automationId`/`automationName` que alguns eventos (STAGE_CHANGED,
 * STATUS_CHANGED, AUTOMATION_EXECUTED) ja gravavam sem o numero do card.
 */
export type AutomationOriginInfo = {
  automationId: string | null;
  automationName: string | null;
  stepNumber: number | null;
  stepLabel: string | null;
  /// Texto pronto, ex.: `via automação «Boas-vindas» · card #3 (Executar distribuição)`.
  text: string;
};

export function automationOrigin(
  meta: Record<string, unknown> | null | undefined,
): AutomationOriginInfo | null {
  const m = meta ?? {};
  const raw = m.automationOrigin;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  const automationId =
    typeof o?.automationId === "string"
      ? o.automationId
      : typeof m.automationId === "string"
        ? m.automationId
        : null;
  const automationName =
    typeof o?.automationName === "string" && o.automationName.trim()
      ? o.automationName.trim()
      : typeof m.automationName === "string" && m.automationName.trim()
        ? (m.automationName as string).trim()
        : null;
  const stepNumber =
    typeof o?.stepNumber === "number" && Number.isFinite(o.stepNumber)
      ? o.stepNumber
      : null;
  const stepLabel =
    typeof o?.stepLabel === "string" && o.stepLabel.trim() ? o.stepLabel.trim() : null;

  if (!automationId && !automationName) return null;

  const namePart = automationName ? `«${automationName}»` : "";
  const cardPart = stepNumber != null ? ` · card #${stepNumber}` : "";
  const labelPart = stepLabel ? ` (${stepLabel})` : "";
  return {
    automationId,
    automationName,
    stepNumber,
    stepLabel,
    text: `via automação ${namePart}${cardPart}${labelPart}`.replace(/\s+/g, " ").trim(),
  };
}

/// Label de exibicao do ator (com fallback razoavel).
export function actorDisplay(ev: FeedEvent): {
  label: string;
  sublabel: string | null;
  type: "HUMAN" | "AI" | "AUTOMATION" | "INTEGRATION" | "SYSTEM";
} {
  const type = ev.actorType ?? "SYSTEM";
  const label =
    ev.actorLabel ??
    ev.actorUser?.name ??
    (type === "AI"
      ? "IA"
      : type === "AUTOMATION"
        ? "Automação"
        : type === "INTEGRATION"
          ? "Integração"
          : type === "SYSTEM"
            ? "Sistema"
            : "Usuário");
  return { label, sublabel: ev.actorSublabel ?? null, type };
}
