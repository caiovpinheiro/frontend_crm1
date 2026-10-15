import type { ApiChannel } from "@/components/channels/types";
import type { EmailAccount } from "@/features/email-v2/api/types";
import { apiUrl } from "@/lib/api";

/** Recorte mínimo que os pickers de canal dos steps consomem. */
export type StepChannelSource = Pick<
  ApiChannel,
  "id" | "name" | "type" | "status" | "phoneNumber"
>;

/** Canal WhatsApp Cloud API (templates são por WABA deste canal). */
export function isMetaCloudWhatsAppChannel(ch: Pick<ApiChannel, "type" | "provider">): boolean {
  return ch.type === "WHATSAPP" && ch.provider === "META_CLOUD_API";
}

/** Canal de e-mail (usado por `send_email`). */
export function isEmailChannel(ch: Pick<ApiChannel, "type">): boolean {
  return ch.type === "EMAIL";
}

/** Filtra só os canais CONECTADOS — é o que importa pra seleção em automação. */
export function onlyConnectedChannels<T extends Pick<ApiChannel, "status">>(channels: T[]): T[] {
  return channels.filter((c) => c.status === "CONNECTED");
}

/** Label do select: nome + telefone (não o WABA cru). */
export function formatMetaChannelLabel(ch: Pick<ApiChannel, "name" | "phoneNumber">): string {
  const phone = typeof ch.phoneNumber === "string" ? ch.phoneNumber.trim() : "";
  const name = ch.name?.trim() || "Canal";
  return phone ? `${name} · ${phone}` : name;
}

async function fetchAllChannels(): Promise<ApiChannel[]> {
  const res = await fetch(apiUrl("/api/channels")).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { channels?: unknown })?.channels)
      ? ((data as { channels: ApiChannel[] }).channels)
      : [];
  return list as ApiChannel[];
}

export async function fetchMetaCloudWhatsAppChannels(): Promise<ApiChannel[]> {
  const list = await fetchAllChannels();
  return list.filter(isMetaCloudWhatsAppChannel);
}

/** Canais WhatsApp Cloud API CONECTADOS — usado pelo picker de canal dos steps de mensagem. */
export async function fetchConnectedMetaCloudWhatsAppChannels(): Promise<ApiChannel[]> {
  return onlyConnectedChannels(await fetchMetaCloudWhatsAppChannels());
}

/**
 * Conta IMAP/SMTP (`/api/email-accounts`) projetada como canal do passo.
 * O id é o `EmailAccount.id` — é o que o motor (`send_email`) resolve.
 */
export function emailAccountToStepChannel(
  acc: Pick<EmailAccount, "id" | "email" | "visibility">,
): StepChannelSource {
  return {
    id: acc.id,
    name: acc.visibility === "PERSONAL" ? `${acc.email} (pessoal)` : acc.email,
    type: "EMAIL",
    status: "CONNECTED",
    phoneNumber: null,
  };
}

async function fetchEmailAccountsAsChannels(): Promise<StepChannelSource[]> {
  const res = await fetch(apiUrl("/api/email-accounts"), { credentials: "include" }).catch(
    () => null,
  );
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  const accounts = Array.isArray((data as { accounts?: unknown })?.accounts)
    ? ((data as { accounts: EmailAccount[] }).accounts)
    : [];
  return accounts.map(emailAccountToStepChannel);
}

/**
 * Canais de e-mail CONECTADOS — usado pelo picker de canal do `send_email`.
 * As contas conectadas em /email (`EmailAccount`) são a fonte real; um
 * `Channel.type=EMAIL` legado ainda entra, sem duplicar id.
 */
export async function fetchConnectedEmailChannels(): Promise<StepChannelSource[]> {
  const [channels, accounts] = await Promise.all([
    fetchAllChannels(),
    fetchEmailAccountsAsChannels(),
  ]);
  const legacy = onlyConnectedChannels(channels.filter(isEmailChannel));
  const seen = new Set<string>();
  return [...accounts, ...legacy].filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
