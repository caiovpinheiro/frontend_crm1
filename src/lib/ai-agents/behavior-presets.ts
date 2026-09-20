/**
 * Presets de “Comportamento das respostas” — abstração do valor técnico de
 * `temperature` do LLM. A UI trabalha com nomes amigáveis; o backend converte
 * para temperatura no momento da chamada ao modelo.
 */

export const AGENT_RESPONSE_BEHAVIOR_PRESETS = {
  objective: {
    temperature: 0.2,
    label: "Mais objetivo",
    description: "Respostas diretas, consistentes e sem muita variação.",
  },
  balanced: {
    temperature: 0.4,
    label: "Equilibrado",
    description: "Respostas naturais, mantendo consistência e objetividade.",
  },
  natural: {
    temperature: 0.6,
    label: "Mais natural",
    description: "Conversa mais espontânea, com maior variedade na forma de responder.",
  },
  creative: {
    temperature: 0.8,
    label: "Mais criativo",
    description: "Respostas mais variadas e flexíveis, com maior liberdade na comunicação.",
  },
} as const;

export type AgentResponseBehavior = keyof typeof AGENT_RESPONSE_BEHAVIOR_PRESETS;

export function isAgentResponseBehavior(value: string): value is AgentResponseBehavior {
  return Object.prototype.hasOwnProperty.call(AGENT_RESPONSE_BEHAVIOR_PRESETS, value);
}

export function behaviorToTemperature(behavior: AgentResponseBehavior): number {
  return AGENT_RESPONSE_BEHAVIOR_PRESETS[behavior].temperature;
}

/**
 * Converte temperatura numérica legada no behavior mais próximo.
 * Em empate, prefere o preset mais objetivo (menor temperatura).
 */
export function temperatureToBehavior(temperature: number): AgentResponseBehavior {
  const entries = Object.entries(AGENT_RESPONSE_BEHAVIOR_PRESETS).map(
    ([id, p]) => ({ id: id as AgentResponseBehavior, temperature: p.temperature }),
  );
  let best: AgentResponseBehavior = "balanced";
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const { id, temperature: t } of entries) {
    const diff = Math.abs(temperature - t);
    if (diff < bestDiff || (diff === bestDiff && t < behaviorToTemperature(best))) {
      best = id;
      bestDiff = diff;
    }
  }
  return best;
}

export function normalizeResponseBehavior(
  value: string | null | undefined,
  fallbackTemperature?: number,
): AgentResponseBehavior {
  if (value && isAgentResponseBehavior(value)) return value;
  if (fallbackTemperature != null && Number.isFinite(fallbackTemperature)) {
    return temperatureToBehavior(fallbackTemperature);
  }
  return "balanced";
}
