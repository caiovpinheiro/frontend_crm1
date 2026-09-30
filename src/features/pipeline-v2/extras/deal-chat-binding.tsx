"use client";

/*
 * Liga o painel do negócio (DealDetailPanel) à conversa real do contato.
 * O chat em si (lista, composer, 24h, fixadas, busca…) é o host canônico
 * `ConversationChatHost`; aqui fica só o que é do NEGÓCIO: garantir a
 * conversa (auto-ensure, travado até o detail confirmar que não há
 * ticket), a nota fixada para a aba Notas e a conexão atual para o chip
 * do header do contato.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconMessageCirclePlus } from "@tabler/icons-react";

import { apiUrl } from "@/lib/api";
import type { ConnectionRef } from "@/lib/connection-label";
import { useMessages } from "@/features/inbox-v2/hooks";
import { useDealDetail } from "@/features/pipeline-v2/hooks/use-deal-detail";

export interface DealChatBindingResult {
  /** Conversa efetiva: a do deal ou a recém-garantida pelo auto-ensure. */
  effectiveConversationId: string | null;
  /** Ainda garantindo a conversa do contato (skeleton no lugar do chat). */
  ensuring: boolean;
  /** Nota fixada na conversa, caso exista, para exibir na tab Notas. */
  pinnedNote: { id: string; content: string; senderName?: string | null; time?: string | null } | null;
  /** Conexão atual da conversa (qual WhatsApp/conta) — chip no header do contato. */
  connection: ConnectionRef | null;
}

export function useDealChatBinding(params: {
  conversationId: string | null;
  contactId?: string | null;
  /** ID do deal — trava o auto-ensure até o detail confirmar "sem conversa". */
  dealId?: string | null;
}): DealChatBindingResult {
  const { conversationId, contactId, dealId } = params;

  // ── Auto-ensure da conversa ──────────────────────────────────────
  // Para a aba "Conversa" do deal ficar idêntica ao /inbox (composer com
  // "+"/templates funcionando mesmo em lead sem histórico), garantimos uma
  // conversa do contato quando o deal ainda não tem uma vinculada. Reusa o
  // endpoint `skipSend` (cria OU reutiliza a conversa WhatsApp do contato),
  // mesmo comportamento do deal detail legado (`ConversationsPanel`).
  const qc = useQueryClient();
  // Conversa garantida, carimbada com o contato: o painel é reusado entre
  // cards (o hook não desmonta ao trocar de deal), então trocar de contato
  // "esquece" a anterior sem efeito de reset, e uma resposta atrasada do
  // card anterior nunca vincula ao card aberto agora.
  const [ensured, setEnsured] = useState<{ contactId: string; id: string } | null>(null);
  const ensuredId = ensured && ensured.contactId === contactId ? ensured.id : null;
  // Contato para o qual o auto-ensure já disparou / do POST em voo.
  const autoEnsuredForRef = useRef<string | null>(null);
  const ensureTargetRef = useRef<string | null>(null);

  // `contactId` chega pelo seed do board ANTES do GET /api/deals/:id
  // responder. Nesse intervalo `conversationId` ainda é null mesmo quando o
  // contato já tem ticket, e o auto-ensure abria um ticket vazio só por
  // abrir o card. Assinamos a MESMA query do detail (mesma queryKey → sem
  // request extra) só para esperar a confirmação de que não há conversa.
  const dealDetailQuery = useDealDetail(dealId ?? null);
  const dealDetailContact = dealDetailQuery.data?.contact ?? null;
  const dealDetailSettled =
    !dealId || dealDetailQuery.isSuccess || dealDetailQuery.isError;
  // Sem `dealId` o hook não tem como esperar o detail — mantém o
  // comportamento antigo para quem usa o binding fora do pipeline.
  const canAutoEnsure =
    !dealId ||
    (!!contactId &&
      dealDetailContact?.id === contactId &&
      (dealDetailContact.conversations?.length ?? 0) === 0);

  const ensureMutation = useMutation({
    mutationFn: async (cid: string) => {
      const res = await fetch(apiUrl("/api/conversations/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: cid,
          skipSend: true,
          source: "deal_chat",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Erro ao iniciar conversa");
      return data.conversation as { id: string };
    },
    onSuccess: (conv, cid) => {
      qc.invalidateQueries({ queryKey: ["contact", cid] });
      qc.invalidateQueries({ queryKey: ["conversation-timeline", conv.id] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      if (ensureTargetRef.current !== cid) return;
      setEnsured({ contactId: cid, id: conv.id });
    },
    onError: (err: Error) => toast.error(err.message || "Falha ao iniciar conversa"),
  });

  // Dispara uma vez por contato. `isPending` nas deps: trocar de card com o
  // POST do contato anterior em voo adia o ensure do novo; quando o anterior
  // assenta, tenta de novo.
  useEffect(() => {
    if (!canAutoEnsure) return;
    if (conversationId || !contactId) return;
    if (ensuredId || autoEnsuredForRef.current === contactId || ensureMutation.isPending) return;
    autoEnsuredForRef.current = contactId;
    ensureTargetRef.current = contactId;
    ensureMutation.mutate(contactId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, contactId, ensuredId, canAutoEnsure, ensureMutation.isPending]);

  // Id efetivo: o do deal (quando já vinculado) ou o recém-garantido.
  const effectiveConversationId = conversationId ?? ensuredId;
  const ensuring =
    !effectiveConversationId &&
    !!contactId &&
    !ensureMutation.isError &&
    (ensureMutation.isPending || !dealDetailSettled || canAutoEnsure);

  // Mesma query do host (cache compartilhado, sem request extra): a nota
  // fixada alimenta a aba Notas e a conexão o chip do header do contato.
  const { data: messagesResp } = useMessages(effectiveConversationId);
  const pinnedNoteId = messagesResp?.pinnedNoteId ?? null;
  const pinnedNote = useMemo(() => {
    if (!pinnedNoteId) return null;
    const raw = (messagesResp?.messages ?? []).find((m) => m.id === pinnedNoteId);
    if (!raw) return null;
    return {
      id: raw.id,
      content: raw.content,
      senderName: raw.senderName ?? null,
      time: raw.createdAt
        ? new Date(raw.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : null,
    };
  }, [pinnedNoteId, messagesResp]);

  return {
    effectiveConversationId,
    ensuring,
    pinnedNote,
    connection: messagesResp?.channel ?? null,
  };
}

/** Deal sem contato/telefone: nada para conversar — aponta para a Inbox. */
export function DealChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]">
        <IconMessageCirclePlus size={28} />
      </div>
      <h3 className="mt-4 font-display text-[15px] font-bold text-[var(--text-primary)]">
        Sem conversa vinculada
      </h3>
      <p className="mt-1.5 max-w-[340px] font-display text-[13px] leading-relaxed text-[var(--text-muted)]">
        Este negócio ainda não tem contato com WhatsApp. Vincule um contato
        com telefone para conversar por aqui.
      </p>
      <Link
        href="/inbox"
        className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--brand-primary)] px-5 py-2.5 font-display text-[13px] font-bold text-white shadow-[var(--glass-shadow-sm)] transition-opacity hover:opacity-90"
      >
        <IconMessageCirclePlus size={16} />
        Abrir Caixa de Entrada
      </Link>
    </div>
  );
}

/** Isola o hook do kanban: estado de chat não re-renderiza o board. */
export function DealChatBindingHost({
  children,
  ...params
}: Parameters<typeof useDealChatBinding>[0] & {
  children: (result: DealChatBindingResult) => React.ReactNode;
}) {
  const result = useDealChatBinding(params);
  return <>{children(result)}</>;
}
