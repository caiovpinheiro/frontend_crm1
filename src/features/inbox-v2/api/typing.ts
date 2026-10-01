/*
 * Indicador "digitando…" — POST /api/conversations/:id/typing.
 *
 * O backend repassa ao canal (o WhatsApp mostra "digitando…" por alguns
 * segundos), então basta 1 chamada a cada `TYPING_THROTTLE_MS` enquanto o
 * agente digita — e nunca com o campo vazio (apagar tudo não é digitar).
 * O throttle é por carimbo de tempo (sem timer pendente), o que o torna
 * trivial de testar com relógio falso e não vaza nada ao desmontar.
 */

import { postTyping } from "./conversations";

export const TYPING_THROTTLE_MS = 3_000;

export interface TypingNotifier {
  /** Chamar a cada mudança do texto do composer. */
  notify(text: string): void;
  /** Zera o relógio (troca de conversa, envio). */
  reset(): void;
}

export function createTypingNotifier(opts: {
  send: () => void;
  intervalMs?: number;
  now?: () => number;
}): TypingNotifier {
  const interval = opts.intervalMs ?? TYPING_THROTTLE_MS;
  const now = opts.now ?? (() => Date.now());
  let lastSentAt: number | null = null;
  return {
    notify(text) {
      if (!text.trim()) return;
      const t = now();
      if (lastSentAt !== null && t - lastSentAt < interval) return;
      lastSentAt = t;
      opts.send();
    },
    reset() {
      lastSentAt = null;
    },
  };
}

/** Dispara o indicador para a conversa (fire-and-forget, erros ignorados). */
export function sendTypingIndicator(conversationId: string): void {
  postTyping(conversationId);
}
