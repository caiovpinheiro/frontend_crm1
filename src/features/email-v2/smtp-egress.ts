import type { EmailEncryption } from "./api/types";

/**
 * Saída SMTP pela Contabo (porta que a DigitalOcean não bloqueia).
 * O backend em produção ainda fala com o host/porta do payload — sem
 * patch no GitHub do backend. IMAP continua no provedor (993).
 */
export const SMTP_EGRESS_HOST = "185.215.164.198";

const PROVIDER_EGRESS_PORT: Record<string, number> = {
  gmail: 2525,
  outlook: 2526,
  "uol-host": 2527,
  locaweb: 2528,
  hostinger: 2529,
  kinghost: 2530,
  yahoo: 2531,
  zoho: 2532,
  icloud: 2533,
};

export function smtpEgressForProvider(providerId: string): {
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: EmailEncryption;
} {
  return {
    smtpHost: SMTP_EGRESS_HOST,
    smtpPort: PROVIDER_EGRESS_PORT[providerId] ?? 2534,
    smtpEncryption: "NONE",
  };
}
