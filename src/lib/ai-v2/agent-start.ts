import { looksLikeOpenAiApiKey } from "@/lib/agent-key";

/**
 * Regras puras da etapa "Começar" do wizard de agentes v2.
 * Sepradas do React para testes unitários rápidos.
 */

/** Publicação só é permitida quando há chave salva ou uma chave válida sendo digitada. */
export function canPublishAgent(hasSavedKey: boolean, openaiKey: string): boolean {
  return hasSavedKey || looksLikeOpenAiApiKey(openaiKey);
}

/** Aviso de cliente real aparece quando o agente está ativo, tem canal e não limitou números. */
export function showRealClientWarning(
  active: boolean,
  channelIds: string[],
  allowedPhoneNumbers: string[],
): boolean {
  return active && channelIds.length > 0 && allowedPhoneNumbers.length === 0;
}

/** Verifica se o modelo salvo está na lista de modelos suportados. */
export function isModelSupported(modelId: string, supportedModels: Array<{ id: string }>): boolean {
  return supportedModels.some((m) => m.id === modelId);
}

/** Modos de execução válidos para agentes v2. */
export const V2_AUTONOMY_OPTIONS = [
  { value: "suggest", label: "Sugerir resposta para a equipe aprovar" },
  { value: "auto", label: "Responder sozinho" },
] as const;

export type V2AutonomyMode = (typeof V2_AUTONOMY_OPTIONS)[number]["value"];
