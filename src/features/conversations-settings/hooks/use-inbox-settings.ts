"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import {
  parseProofreadIgnore,
  parseProofreadReplacements,
  type ProofreadReplacement,
} from "@/features/inbox-v2/lib/proofread-pilot";

export interface InboxSettings {
  agentSignatureEnabled: boolean;
  agentSignatureEditable: boolean;
  requireSignature: boolean;
  keepAgentOnEnd: boolean;
  keepDepartmentOnEnd: boolean;
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
  /** Corretor automático no envio do inbox (org). Default desligado. */
  proofreadEnabled: boolean;
  proofreadReplacements: ProofreadReplacement[];
  proofreadIgnore: string[];
  proofreadReplacementsSaved: boolean;
  proofreadIgnoreSaved: boolean;
}

const DEFAULTS: InboxSettings = {
  agentSignatureEnabled: true,
  agentSignatureEditable: true,
  requireSignature: false,
  keepAgentOnEnd: false,
  keepDepartmentOnEnd: false,
  audioTranscription: "none",
  transcriptionLanguage: "pt-BR",
  showInboundSignal: true,
  countAgentReplyAsAnswered: false,
  proofreadEnabled: false,
  proofreadReplacements: [],
  proofreadIgnore: [],
  proofreadReplacementsSaved: false,
  proofreadIgnoreSaved: false,
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
    audioTranscription: (data["conversation.audioTranscription"] as InboxSettings["audioTranscription"]) ?? "none",
    transcriptionLanguage: (data["conversation.transcriptionLanguage"] as InboxSettings["transcriptionLanguage"]) ?? "pt-BR",
    // Default ligado: ausência da chave mantém o comportamento atual.
    showInboundSignal: data["conversation.showInboundSignal"] !== "false",
    countAgentReplyAsAnswered:
      data["conversation.countAgentReplyAsAnswered"] === "true",
    proofreadEnabled: data["conversation.proofreadEnabled"] === "true",
    proofreadReplacements: parseProofreadReplacements(
      data["conversation.proofreadReplacements"] ?? null,
    ),
    proofreadIgnore: parseProofreadIgnore(
      data["conversation.proofreadIgnore"] ?? null,
    ),
    proofreadReplacementsSaved:
      data["conversation.proofreadReplacements"] != null,
    proofreadIgnoreSaved: data["conversation.proofreadIgnore"] != null,
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
    mutationFn: async ({
      key,
      value,
    }: {
      key: keyof InboxSettings;
      value: InboxSettings[keyof InboxSettings];
    }) => {
      const fullKey = `conversation.${key}`;
      const serialized =
        typeof value === "boolean" || typeof value === "string"
          ? String(value)
          : JSON.stringify(value);
      const res = await fetch(apiUrl("/api/settings/org"), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: fullKey, value: serialized }),
      });
      if (!res.ok) throw new Error("Falha ao salvar configuração");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
