"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { IconArrowLeft, IconMessageCircle } from "@tabler/icons-react";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import {
  DealDetailsPanel,
  type DealField,
  type DealFieldGroup,
  type DealRecord,
  type FunnelSegment,
} from "@/components/crm/deal-details-panel";
import { DealViewersStack } from "@/components/crm/deal-viewers-stack";
import { ChatWindow } from "@/components/inbox/chat-window";

import { useDealDetail, useEntityViewers, usePipelines } from "@/features/pipeline-v2/hooks";
import type {
  DealContactConversation,
  DealPanelField,
} from "@/features/pipeline-v2/api/deals";

/**
 * /v2/pipeline/[id] — detalhe do negócio (página inteira).
 *
 * Cabeada em:
 *  - `GET /api/deals/:id`     → useDealDetail
 *  - `GET /api/pipelines`     → usePipelines (stages leves pro funil;
 *    evita o board completo ~900KB)
 *
 * O chat real (mensagens da conversa do contato) fica como
 * placeholder por enquanto — o `deal-chat-binding` existente está
 * acoplado ao slide-over do Kanban; ligá-lo aqui exige mais um passe
 * de refactor. Deixei o slot pronto para a próxima iteração.
 */

interface V2DealDetailClientPageProps {
  dealId: string;
}

function brl(value: number | string | null | undefined): string {
  const n =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Formata o valor cru (string) de um campo personalizado conforme o tipo
 * (CustomFieldType do backend). Mesma fonte usada pelo slide-over v2
 * (`dealPanelFields`), garantindo consistência entre as duas telas.
 */
function fmtCustomFieldValue(
  value: string | null | undefined,
  type: string | null | undefined,
): string | undefined {
  if (value == null || value === "") return undefined;
  switch ((type ?? "").toUpperCase()) {
    case "DATE": {
      const formatted = fmtDateBR(value);
      return formatted || value;
    }
    case "BOOLEAN":
      return ["true", "1", "sim", "yes"].includes(value.trim().toLowerCase())
        ? "Sim"
        : "Não";
    case "NUMBER": {
      const n = Number.parseFloat(value.replace(",", "."));
      return Number.isFinite(n) ? n.toLocaleString("pt-BR") : value;
    }
    default:
      return value;
  }
}

/**
 * Shape "estendido" do payload de `/api/deals/:id` — o tipo de retorno
 * exportado em `features/pipeline-v2/api` (BoardDealDto) ainda não
 * descreve `stage`/`stageId`/`createdAt`. Aqui declaramos só o que esta
 * página precisa para evitar `any` espalhado e cast em cascata.
 */
interface DealDetailExtra {
  stageId?: string;
  stage?: { id?: string; name?: string; color?: string; pipelineId?: string };
  createdAt?: string;
  expectedClose?: string | null;
  value?: number | string | null;
  number?: number;
  /** Campos de negócio marcados para o painel (showInDealPanel) — a API
   *  os retorna em `dealPanelFields`; o legado `deal.customFields` nunca
   *  era populado por `GET /api/deals/:id`. */
  dealPanelFields?: DealPanelField[];
  /** Tags do negócio, achatadas pelo backend para `[{ id, name, color }]`. */
  tags?: { id: string; name: string; color: string | null }[];
  /** Origem do negócio (Deal.source). */
  source?: string | null;
  contact?: {
    id?: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    source?: string | null;
    conversations?: DealContactConversation[];
  } | null;
}

export default function V2DealDetailClientPage({ dealId }: V2DealDetailClientPageProps) {
  const router = useRouter();
  const dealQuery = useDealDetail(dealId);
  // Presença "quem está vendo" (estilo Kommo) — outros usuários com este
  // deal aberto agora. Lista já vem sem você mesmo.
  const viewers = useEntityViewers("deal", dealId);
  const deal = dealQuery.data as (typeof dealQuery.data & DealDetailExtra) | undefined;

  const conversations = deal?.contact?.conversations ?? [];
  const [selectedConv, setSelectedConv] = useState<DealContactConversation | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    if (deal && !autoLoaded && conversations.length > 0 && !selectedConv) {
      setSelectedConv(conversations[0] ?? null);
      setAutoLoaded(true);
    }
  }, [deal, autoLoaded, conversations, selectedConv]);

  // Funil visual: stages já vêm em GET /api/pipelines — NÃO puxar o board
  // inteiro (~900KB / ~8s em prod) só para desenhar segmentos de cor.
  const pipelineId = deal?.stage?.pipelineId;
  const pipelinesQuery = usePipelines(!!pipelineId);
  const funnelStages = useMemo(() => {
    const p = pipelinesQuery.data?.find((x) => x.id === pipelineId);
    return p?.stages ?? [];
  }, [pipelinesQuery.data, pipelineId]);

  const record: DealRecord | null = useMemo(() => {
    if (!deal) return null;

    const stages = funnelStages;
    const currentStageId = deal.stageId;
    const currentStagePos =
      stages.find((s) => s.id === currentStageId)?.position ?? 0;
    const segments: FunnelSegment[] = stages
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        color: s.color || "var(--brand-primary)",
        reached: s.position <= currentStagePos,
      }));

    const stageObj = deal.stage;
    const contact = deal.contact;
    const owner = deal.owner;

    // Grupo 1 — informações do negócio
    const dealFields: DealField[] = [
      { label: "Valor", value: brl(deal.value), type: "money" },
      { label: "Etapa", value: stageObj?.name, type: "chip" },
      {
        label: "Status",
        value:
          deal.status === "WON"
            ? "Ganho"
            : deal.status === "LOST"
              ? "Perdido"
              : "Aberto",
      },
      {
        label: "Responsável",
        value: owner?.name ?? undefined,
      },
      {
        label: "Previsão de fechamento",
        value: fmtDateBR(deal.expectedClose),
      },
      {
        label: "Criado em",
        value: fmtDateBR(deal.createdAt),
      },
    ];

    const contactFields: DealField[] = [
      { label: "Nome", value: contact?.name ?? undefined, emphasis: "name" },
      { label: "E-mail", value: contact?.email ?? undefined },
      { label: "Telefone", value: contact?.phone ?? undefined, emphasis: "link" },
    ];

    // Campos personalizados — consome `dealPanelFields` (filtrados por
    // showInDealPanel no backend), mesma fonte do slide-over v2. Só exibe
    // os que têm valor preenchido para não poluir a página read-only.
    const customFields: DealField[] = [];
    for (const f of deal.dealPanelFields ?? []) {
      const formatted = fmtCustomFieldValue(f.value, f.type);
      if (formatted === undefined) continue;
      const isChip = ["SELECT", "MULTI_SELECT"].includes(
        (f.type ?? "").toUpperCase(),
      );
      customFields.push({
        label: f.label || f.name,
        value: formatted,
        ...(isChip ? { type: "chip" as const } : {}),
      });
    }

    const dealNumber = deal.number;
    const numberLabel =
      dealNumber != null ? `#${dealNumber}` : `#${deal.id.slice(0, 6)}`;

    const groups: DealFieldGroup[] = [
      {
        title: "Negócio",
        meta: numberLabel,
        icon: "deal",
        fields: dealFields,
      },
      {
        title: "Contato",
        icon: "contact",
        fields: contactFields,
      },
    ];
    if (customFields.length) {
      groups.push({ title: "Campos personalizados", icon: "tag", fields: customFields });
    }

    // Canal exibido no grid do header: nome da inbox/canal da 1ª conversa.
    const firstConv = contact?.conversations?.[0];
    const channelLabel = firstConv
      ? [firstConv.channel, firstConv.inboxName].filter(Boolean).join(" · ") || null
      : null;

    return {
      leadNumber: `Lead ${numberLabel}`,
      tag: deal.title || "Sem título",
      dealNumber: numberLabel,
      funnelStage: stageObj?.name ?? "—",
      stageColor: stageObj?.color ?? null,
      ownerName: owner?.name ?? null,
      origin: deal.source ?? contact?.source ?? null,
      channelLabel,
      tags: deal.tags ?? [],
      pipelineName: (stageObj as { pipeline?: { name?: string } } | null)?.pipeline?.name ?? null,
      segments: segments.length
        ? segments
        : [
            { color: stageObj?.color || "var(--brand-primary)", reached: true },
          ],
      groups,
    };
  }, [deal, funnelStages]);

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />

      <div className="grid min-h-0 grid-cols-[380px_1fr] gap-4 overflow-hidden">
        {dealQuery.isLoading && !record ? (
          <aside className="flex min-h-0 flex-col">
            <AppLoading variant="inline" className="min-h-0 flex-1" />
          </aside>
        ) : dealQuery.error ? (
          <DealErrorPanel
            message={
              dealQuery.error instanceof Error
                ? dealQuery.error.message
                : "Erro ao carregar negócio."
            }
          />
        ) : record ? (
          <DealDetailsPanel
            record={record}
            productCount={0}
            onBack={() => router.push("/pipeline")}
            viewersSlot={<DealViewersStack viewers={viewers} />}
          />
        ) : (
          <DealErrorPanel message="Negócio não encontrado." />
        )}

        <DealChatPanel
          conversationId={selectedConv?.id ?? null}
          conversationStatus={selectedConv?.status ?? undefined}
          contactId={deal?.contact?.id}
          conversations={conversations}
          selectedConvId={selectedConv?.id ?? null}
          onSelectConv={setSelectedConv}
        />
      </div>
    </div>
  );
}

function DealErrorPanel({ message }: { message: string }) {
  return (
    <aside className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-6 text-center backdrop-blur-md shadow-[var(--glass-shadow)]">
      <p className="font-display text-sm font-bold text-[var(--text-secondary)]">
        {message}
      </p>
      <Link
        href="/pipeline/list"
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-sm font-bold text-white"
      >
        <IconArrowLeft size={16} />
        Voltar à lista
      </Link>
    </aside>
  );
}

function DealChatPanel({
  conversationId,
  conversationStatus,
  contactId,
  conversations,
  selectedConvId,
  onSelectConv,
}: {
  conversationId: string | null;
  conversationStatus?: string;
  contactId?: string;
  conversations: DealContactConversation[];
  selectedConvId: string | null;
  onSelectConv: (conv: DealContactConversation) => void;
}) {
  if (conversations.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-10 text-center backdrop-blur-md shadow-[var(--glass-shadow)]">
        <div className="grid size-16 place-items-center rounded-[var(--radius-lg)] bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
          <IconMessageCircle size={28} />
        </div>
        <p className="text-[13px] text-[var(--text-muted)]">
          Sem conversas vinculadas a este negócio.
        </p>
        <Link
          href="/inbox"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-2 font-display text-sm font-bold text-[var(--brand-primary)] shadow-[var(--glass-shadow-sm)] hover:bg-[var(--glass-bg-strong)]"
        >
          <IconMessageCircle size={16} />
          Abrir Inbox
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)]">
      {conversations.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--glass-border)] p-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelectConv(conv)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${
                selectedConvId === conv.id
                  ? "bg-[var(--brand-primary)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)]"
              }`}
            >
              {conv.channel ?? conv.inboxName ?? conv.id.slice(0, 6)}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ChatWindow
          conversationId={conversationId}
          conversationStatus={conversationStatus}
          contactId={contactId}
          compactChrome
        />
      </div>
    </main>
  );
}
