/**
 * Enums do Prisma usados no frontend, replicados como tipos/objetos puros
 * em TypeScript.
 *
 * Por que duplicar? O frontend separado NÃO tem `@prisma/client` instalado
 * (pra evitar bundling do engine binário do Prisma, ~20MB, e dependência
 * de `prisma generate` no postinstall). Como os enums são apenas valores
 * de string, replicá-los aqui é zero-risk e desacopla o frontend do schema
 * em runtime.
 *
 * MANTENHA EM SINCRONIA com `prisma/schema.prisma` do backend. Se um enum
 * mudar lá, atualize aqui também.
 */

export const UserRole = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  MEMBER: "MEMBER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ChannelType = {
  WHATSAPP: "WHATSAPP",
  INSTAGRAM: "INSTAGRAM",
  FACEBOOK: "FACEBOOK",
  EMAIL: "EMAIL",
  WEBCHAT: "WEBCHAT",
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const ChannelProvider = {
  META_CLOUD_API: "META_CLOUD_API",
  BAILEYS_MD: "BAILEYS_MD",
  META_INSTAGRAM_LOGIN: "META_INSTAGRAM_LOGIN",
} as const;
export type ChannelProvider = (typeof ChannelProvider)[keyof typeof ChannelProvider];

export const ChannelStatus = {
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  QR_READY: "QR_READY",
  FAILED: "FAILED",
} as const;
export type ChannelStatus = (typeof ChannelStatus)[keyof typeof ChannelStatus];

export const AIAgentArchetype = {
  SDR: "SDR",
  ATENDIMENTO: "ATENDIMENTO",
  VENDEDOR: "VENDEDOR",
  SUPORTE: "SUPORTE",
  TABULACAO: "TABULACAO",
} as const;
export type AIAgentArchetype = (typeof AIAgentArchetype)[keyof typeof AIAgentArchetype];

export const CustomFieldType = {
  TEXT: "TEXT",
  NUMBER: "NUMBER",
  DATE: "DATE",
  SELECT: "SELECT",
  MULTI_SELECT: "MULTI_SELECT",
  BOOLEAN: "BOOLEAN",
  URL: "URL",
  EMAIL: "EMAIL",
  PHONE: "PHONE",
} as const;
export type CustomFieldType = (typeof CustomFieldType)[keyof typeof CustomFieldType];
