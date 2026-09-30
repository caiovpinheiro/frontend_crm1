/**
 * Porteiro do ping de presença (`POST /api/agents/me/ping`).
 *
 * O timer de 90 s e os disparos por foco/visibilidade passam pelo mesmo
 * gate: um ping só sai se não houver outro em voo e se o último saiu há
 * pelo menos `minGapMs`. Antes o gap dos disparos por foco era de 8 s —
 * alternar entre abas gerava uma rajada de pings por usuário (SS-3).
 */

/** Gap mínimo entre pings, seja do timer, seja de foco/visibilidade. */
export const PRESENCE_PING_MIN_GAP_MS = 45_000;

export interface PresencePingGate {
  /** `true` se o ping pode sair agora; marca o instante e o "em voo". */
  begin(now: number): boolean;
  /** Ping terminou (sucesso ou falha) — libera o próximo. */
  end(): void;
  /** Instante do último ping liberado (`-Infinity` se nenhum). */
  lastSentAt(): number;
}

export function createPresencePingGate(
  minGapMs: number = PRESENCE_PING_MIN_GAP_MS,
): PresencePingGate {
  let lastAt = Number.NEGATIVE_INFINITY;
  let inFlight = false;
  return {
    begin(now) {
      if (inFlight) return false;
      if (now - lastAt < minGapMs) return false;
      inFlight = true;
      lastAt = now;
      return true;
    },
    end() {
      inFlight = false;
    },
    lastSentAt: () => lastAt,
  };
}
