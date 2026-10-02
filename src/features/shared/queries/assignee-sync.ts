"use client";

/*
 * Sincronização do RESPONSÁVEL entre as telas.
 *
 * Trocar o responsável da conversa também troca o do contato e dos negócios
 * abertos (backend), e trocar o do negócio pode propagar para a conversa.
 * Cada tela só invalidava o próprio cache, então Inbox, aside do negócio,
 * Kanban e Flow divergiam até o próximo refetch. Este módulo concentra:
 *
 *  - `resolveAssignee`: nome/avatar reais (resposta do servidor → cache da
 *    equipe), para o patch otimista nunca mostrar nome vazio.
 *  - `applyAssigneeOptimistic` / `rollbackAssignee`: patch imediato do card
 *    da conversa (lista, conversa aberta e contadores) com desfazer exato.
 *  - `syncAssigneeEverywhere`: invalida os caches que dependem do dono.
 */

import type { QueryClient } from "@tanstack/react-query";

import type { ConversationListRow } from "@/features/inbox-v2/api";
import {
  applyConversationFieldsToInboxCaches,
  findCachedConversationRow,
} from "@/features/inbox-v2/hooks/apply-outbound-inbox-card";
import { invalidatePipelineBoards } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

import { teamUsersKey, type CanonicalTeamUser } from "./team-users";

export type ConversationAssignee = NonNullable<ConversationListRow["assignedTo"]>;

type PreviousAssignee = Pick<ConversationListRow, "assignedToId" | "assignedTo">;

/** Procura o usuário nas listas de equipe já carregadas (humanos e com IA). */
function findTeamUser(
  qc: QueryClient,
  userId: string,
): CanonicalTeamUser | undefined {
  for (const includeAi of [true, false]) {
    const list = qc.getQueryData<CanonicalTeamUser[]>(teamUsersKey(includeAi));
    const hit = Array.isArray(list) ? list.find((u) => u.id === userId) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Responsável com nome real. Prioridade: o que o servidor devolveu → cache da
 * equipe → só o id (nome vazio, último recurso).
 */
export function resolveAssignee(
  qc: QueryClient,
  assignedToId: string | null,
  fromServer?: ConversationListRow["assignedTo"] | null,
): ConversationAssignee | null {
  if (assignedToId == null) return null;
  if (fromServer && fromServer.id === assignedToId && fromServer.name) {
    return fromServer;
  }
  const user = findTeamUser(qc, assignedToId);
  if (user?.name) {
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? undefined,
      avatarUrl: user.avatarUrl ?? null,
      type: user.type ?? "HUMAN",
    };
  }
  return fromServer ?? { id: assignedToId, name: "", type: "HUMAN" };
}

/**
 * Aplica o novo responsável no card da conversa (lista + conversa aberta +
 * contadores das abas). Devolve o estado anterior para `rollbackAssignee`,
 * ou `null` quando a conversa não está em cache (nada a desfazer).
 */
export function applyAssigneeOptimistic(
  qc: QueryClient,
  conversationId: string,
  assignedToId: string | null,
  fromServer?: ConversationListRow["assignedTo"] | null,
): PreviousAssignee | null {
  const existing = findCachedConversationRow(qc, conversationId);
  if (!existing) return null;
  const previous: PreviousAssignee = {
    assignedToId: existing.assignedToId ?? null,
    assignedTo: existing.assignedTo ?? null,
  };
  applyConversationFieldsToInboxCaches(qc, conversationId, {
    assignedToId,
    assignedTo: resolveAssignee(qc, assignedToId, fromServer),
  });
  return previous;
}

/** Desfaz `applyAssigneeOptimistic` (erro da API). */
export function rollbackAssignee(
  qc: QueryClient,
  conversationId: string,
  previous: PreviousAssignee | null | undefined,
): void {
  if (!previous) return;
  applyConversationFieldsToInboxCaches(qc, conversationId, previous);
}

/**
 * Invalida o que depende do responsável: aside do negócio (Inbox, Kanban,
 * Flow), timelines, conversas do contato no Flow e os boards. Invalidar só
 * refaz o fetch das queries ATIVAS; as demais ficam marcadas como stale.
 */
export function syncAssigneeEverywhere(
  qc: QueryClient,
  opts: { conversationId?: string | null } = {},
): void {
  qc.invalidateQueries({ queryKey: ["deal-detail-v2"] });
  qc.invalidateQueries({ queryKey: ["deal-timeline-v2"] });
  qc.invalidateQueries({ queryKey: ["saleshub-contact-conversations"] });
  if (opts.conversationId) {
    qc.invalidateQueries({ queryKey: ["conversation-timeline", opts.conversationId] });
  }
  invalidatePipelineBoards(qc);
}
