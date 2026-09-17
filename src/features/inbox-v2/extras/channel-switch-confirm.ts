import { ApiError } from "@/lib/api";
import type { OutboundChannelOption } from "@/features/inbox-v2/hooks/use-channels";

export const SESSION_CLOSED_TOAST =
  "Sessão de 24h encerrada. Para continuar, utilize um template aprovado.";

/** Erro 409 do backend: envio humano bloqueado por sessão de 24h fechada. */
export function isSessionClosedError(err: unknown): boolean {
  return err instanceof ApiError && err.code === "SESSION_CLOSED";
}

/** 409 do backend: canal de saída DISCONNECTED. */
export function isDisconnectedChannelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  if (!/desconectado/i.test(message)) return false;
  if (err instanceof ApiError) return err.status === 409;
  return true;
}

/** Só os dígitos — o canal guarda o número formatado ("+55 11 91518-4535"). */
function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Canal selecionado (Y) ≠ canal atual da conversa (X).
 *
 * Passando `channels` (os canais de envio), dois casos NÃO contam como troca:
 *  - o canal da conversa não está mais na lista de envio — conexão antiga
 *    desconectada. Não há troca a confirmar, e o dialog só teria um id cru
 *    para mostrar no lugar do nome;
 *  - os dois canais têm o MESMO número, o que acontece quando a conexão é
 *    recriada na Meta e as conversas antigas ficam apontando para o registro
 *    velho. O cliente recebe do mesmo telefone.
 */
export function isChannelMismatch(
  selectedChannelId: string | null | undefined,
  conversationChannelId: string | null | undefined,
  channels?: OutboundChannelOption[],
): boolean {
  if (!selectedChannelId || !conversationChannelId) return false;
  if (selectedChannelId === conversationChannelId) return false;
  if (!channels) return true;

  const conversationChannel = channels.find((c) => c.id === conversationChannelId);
  if (!conversationChannel) return false;

  const conversationPhone = phoneKey(conversationChannel.phoneNumber);
  const selectedPhone = phoneKey(
    channels.find((c) => c.id === selectedChannelId)?.phoneNumber,
  );
  if (conversationPhone && selectedPhone && conversationPhone === selectedPhone) {
    return false;
  }
  return true;
}

function formatChannelLabel(
  channels: OutboundChannelOption[] | undefined,
  channelId: string,
): string {
  const ch = channels?.find((c) => c.id === channelId);
  if (!ch) return channelId;
  return ch.phoneNumber ? `${ch.name} (${ch.phoneNumber})` : ch.name;
}

/** Texto do dialog de confirmação ao enviar por outro canal. */
export function channelSwitchConfirmOptions(
  channels: OutboundChannelOption[] | undefined,
  selectedChannelId: string,
  conversationChannelId: string,
): {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
} {
  const currentLabel = formatChannelLabel(channels, conversationChannelId);
  const selectedLabel = formatChannelLabel(channels, selectedChannelId);
  return {
    title: "Enviar por outro canal?",
    description: `Esta conversa está no canal ${currentLabel}. Você escolheu enviar por ${selectedLabel}. Confirma o envio neste canal?`,
    confirmLabel: "Enviar neste canal",
    cancelLabel: "Cancelar",
  };
}
