"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import {
  fetchInboxSettings,
  INBOX_SETTINGS_QUERY_KEY,
  type InboxSettings,
} from "@/features/conversations-settings/hooks/use-inbox-settings";

/**
 * Permissões de funcionalidades da conversa, configuradas por admin em
 * /settings/conversations. Usam o endpoint genérico /api/settings/org
 * com o prefixo "conversation.".
 *
 * Valores default (quando a chave não existe no banco):
 *  - agentSignatureEnabled: true  — agentes podem usar assinatura
 *  - agentSignatureEditable: true — agentes podem editar o texto da assinatura
 *  - proofreadEnabled: false — corretor no envio (admin em /settings/conversations)
 */
export interface ConversationFeatures {
  agentSignatureEnabled: boolean;
  agentSignatureEditable: boolean;
  proofreadEnabled: boolean;
}

// P1-2: mesma query key do `useInboxSettings` (mesmo endpoint) — este
// hook virou um `select` sobre o cache compartilhado, sem request próprio.
const QUERY_KEY = INBOX_SETTINGS_QUERY_KEY;

function selectConversationFeatures(s: InboxSettings): ConversationFeatures {
  return {
    agentSignatureEnabled: s.agentSignatureEnabled,
    agentSignatureEditable: s.agentSignatureEditable,
    proofreadEnabled: s.proofreadEnabled,
  };
}

/** Lê as permissões de conversa para uso no Composer e em outras UIs. */
export function useConversationFeatures() {
  const { data, ...rest } = useQuery<InboxSettings, Error, ConversationFeatures>({
    queryKey: QUERY_KEY,
    queryFn: fetchInboxSettings,
    staleTime: 5 * 60_000,
    select: selectConversationFeatures,
  });

  return {
    features: data ?? {
      agentSignatureEnabled: true,
      agentSignatureEditable: true,
      proofreadEnabled: false,
    },
    ...rest,
  };
}

/** Salva uma única chave de funcionalidade da conversa (admin only). */
export function useSaveConversationFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: keyof ConversationFeatures;
      value: boolean;
    }) => {
      const fullKey = `conversation.${key}`;
      const res = await fetch(apiUrl("/api/settings/org"), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: fullKey, value: String(value) }),
      });
      if (!res.ok) throw new Error("Falha ao salvar configuração");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
