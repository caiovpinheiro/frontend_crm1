import type {
  ChannelProvider,
  ChannelStatus,
  ChannelType,
} from "@/lib/prisma-enum-types";

/** Canal como retornado pela API (datas serializadas como string). */
export type ApiChannel = {
  id: string;
  name: string;
  type: ChannelType;
  provider: ChannelProvider;
  status: ChannelStatus;
  config: unknown;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
  qrCode: string | null;
  sessionData: unknown;
  /// Funil de destino do inbound deste canal. `null` = usa o funil padrão
  /// da org (comportamento legado).
  defaultPipelineId: string | null;
  createdAt: string;
  updatedAt: string;
  /// Slug da Organization dona deste canal — usado pra montar a URL
  /// do webhook Meta scoped (/api/webhooks/meta/{slug}). Vazio nao
  /// deve acontecer (todo canal tem org), mas tipado como string
  /// pra robustez.
  organizationSlug: string;
  /// Chave pública do canal WEBCHAT (`wc_…`, vai no snippet). Também pode
  /// vir em `config.publicKey`; `null` nos demais tipos.
  publicKey?: string | null;
  /// Só em canais WEBCHAT: marca da organização (`Organization.primaryColor`
  /// / `logoUrl`) que o widget herda quando `config.theme.primary` /
  /// `config.theme.avatarUrl` estão ausentes ou `null`.
  webchatDefaults?: { primary?: string | null; avatarUrl?: string | null } | null;
  /// Só em canais WEBCHAT (v2): chaves secretas configuradas (sim/não + data).
  /// O valor nunca vem da API — aparece uma vez, na geração (§9.5 do contrato).
  webchatSecrets?: {
    identity?: { configured?: boolean; rotatedAt?: string | null } | null;
    s2s?: { configured?: boolean; rotatedAt?: string | null } | null;
  } | null;
};

export function parseChannelConfigRecord(
  config: unknown
): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return { ...(config as Record<string, unknown>) };
  }
  return {};
}
