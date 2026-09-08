import type { ConnectEmailInput, EmailEncryption } from "./api/types";

export const CUSTOM_EMAIL_PROVIDER_ID = "custom";

export interface EmailProviderPreset {
  id: string;
  label: string;
  imapHost: string;
  imapPort: number;
  imapEncryption: EmailEncryption;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: EmailEncryption;
}

/** Presets IMAP/SMTP conhecidos. Novos provedores entram só neste array. */
export const EMAIL_PROVIDER_PRESETS: EmailProviderPreset[] = [
  {
    id: "uol-host",
    label: "UOL Host",
    imapHost: "imap.uhserver.com",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtps.uhserver.com",
    smtpPort: 465,
    smtpEncryption: "SSL_TLS",
  },
];

export function getEmailProviderPreset(id: string): EmailProviderPreset | undefined {
  return EMAIL_PROVIDER_PRESETS.find((p) => p.id === id);
}

export function applyEmailProviderPreset<
  T extends Pick<
    ConnectEmailInput,
    "imapHost" | "imapPort" | "imapEncryption" | "smtpHost" | "smtpPort" | "smtpEncryption"
  >,
>(form: T, preset: EmailProviderPreset): T {
  return {
    ...form,
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    imapEncryption: preset.imapEncryption,
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
    smtpEncryption: preset.smtpEncryption,
  };
}

export function emailProviderOptions() {
  return [
    ...EMAIL_PROVIDER_PRESETS.map((p) => ({
      value: p.id,
      label: p.label,
      description: `IMAP ${p.imapHost}:${p.imapPort} · SMTP ${p.smtpHost}:${p.smtpPort}`,
    })),
    {
      value: CUSTOM_EMAIL_PROVIDER_ID,
      label: "Outro (configurar manualmente)",
      description: "Informe os servidores IMAP e SMTP",
    },
  ];
}
