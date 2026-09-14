"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";

export interface InboxSettings {
  agentSignatureEnabled: boolean;
  agentSignatureEditable: boolean;
  requireSignature: boolean;
  keepAgentOnEnd: boolean;
  keepDepartmentOnEnd: boolean;
  /** Protocolo aguardar + encerramento com agente (saídas no canvas). */
  closingProtocolEnabled: boolean;
  audioTranscription: "none" | "all" | "on_demand";
  transcriptionLanguage: "pt-BR" | "en-US" | "es-ES";
  /**
   * Rodapé lilás "aguardando resposta" nos cards (kanban/inbox) quando a
   * última mensagem é inbound. Default ligado.
   */
  showInboundSignal: boolean;
  /**
   * Contar outbound de agente/automação/IA como respondida nos filtros
   * (inbox + direção no funil). Default desligado.
   */
  countAgentReplyAsAnswered: boolean;
}

const DEFAULTS: InboxSettings = {
  agentSignatureEnabled: true,
  agentSignatureEditable: true,
  requireSignature: false,
  keepAgentOnEnd: false,
  keepDepartmentOnEnd: false,
  closingProtocolEnabled: false,
  audioTranscription: "none",
  transcriptionLanguage: "pt-BR",
  showInboundSignal: true,
  countAgentReplyAsAnswered: false,
};

/**
 * Key canônica de GET /api/settings/org?prefix=conversation. (P1-2) —
 * compartilhada com `useConversationFeatures` (que faz `select` sobre
 * este cache). Antes cada hook tinha sua key e o endpoint baixava 2×.
 */
export const INBOX_SETTINGS_QUERY_KEY = ["org-settings", "inbox"] as const;

const QUERY_KEY = INBOX_SETTINGS_QUERY_KEY;

export async function fetchInboxSettings(): Promise<InboxSettings> {
  const res = await fetch(apiUrl("/api/settings/org?prefix=conversation."), {
    credentials: "include",
  });
  if (!res.ok) return DEFAULTS;
  const data: Record<string, string> = await res.json();

  return {
    agentSignatureEnabled: data["conversation.agentSignatureEnabled"] !== "false",
    agentSignatureEditable: data["conversation.agentSignatureEditable"] !== "false",
    requireSignature: data["conversation.requireSignature"] === "true",
    keepAgentOnEnd: data["conversation.keepAgentOnEnd"] === "true",
    keepDepartmentOnEnd: data["conversation.keepDepartmentOnEnd"] === "true",
    closingProtocolEnabled: data["conversation.closingProtocolEnabled"] === "true",
    audioTranscription: (data["conversation.audioTranscription"] as InboxSettings["audioTranscription"]) ?? "none",
    transcriptionLanguage: (data["conversation.transcriptionLanguage"] as InboxSettings["transcriptionLanguage"]) ?? "pt-BR",
    // Default ligado: ausência da chave mantém o comportamento atual.
    showInboundSignal: data["conversation.showInboundSignal"] !== "false",
    countAgentReplyAsAnswered:
      data["conversation.countAgentReplyAsAnswered"] === "true",
  };
}

export function useInboxSettings() {
  const { data, ...rest } = useQuery<InboxSettings>({
    queryKey: QUERY_KEY,
    queryFn: fetchInboxSettings,
    staleTime: 5 * 60_000,
  });

  return {
    settings: data ?? DEFAULTS,
    ...rest,
  };
}

export function useSaveInboxSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: keyof InboxSettings; value: string | boolean }) => {
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
