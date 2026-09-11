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
    id: "gmail",
    label: "Gmail / Google Workspace",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpEncryption: "STARTTLS",
  },
  {
    id: "outlook",
    label: "Outlook / Microsoft 365",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpEncryption: "STARTTLS",
  },
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
  {
    id: "locaweb",
    label: "Locaweb",
    imapHost: "email-ssl.com.br",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "email-ssl.com.br",
    smtpPort: 465,
    smtpEncryption: "SSL_TLS",
  },
  {
    id: "hostinger",
    label: "Hostinger",
    imapHost: "imap.hostinger.com",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtp.hostinger.com",
    smtpPort: 465,
    smtpEncryption: "SSL_TLS",
  },
  {
    id: "kinghost",
    label: "KingHost",
    imapHost: "imap.kinghost.net",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtp.kinghost.net",
    smtpPort: 587,
    smtpEncryption: "STARTTLS",
  },
  {
    id: "yahoo",
    label: "Yahoo",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    smtpEncryption: "STARTTLS",
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    imapHost: "imap.zoho.com",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtp.zoho.com",
    smtpPort: 587,
    smtpEncryption: "STARTTLS",
  },
  {
    id: "icloud",
    label: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapEncryption: "SSL_TLS",
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpEncryption: "STARTTLS",
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

export type EmailProviderChoice = {
  id: string;
  label: string;
  imapLine?: string;
  smtpLine?: string;
  hint?: string;
};

/** Opções do dropdown (IMAP/SMTP em linhas separadas; custom sem host). */
export function emailProviderChoices(): EmailProviderChoice[] {
  return [
    ...EMAIL_PROVIDER_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      imapLine: `${p.imapHost}:${p.imapPort}`,
      smtpLine: `${p.smtpHost}:${p.smtpPort}`,
    })),
    {
      id: CUSTOM_EMAIL_PROVIDER_ID,
      label: "Outro (configurar manualmente)",
      hint: "Informe os servidores IMAP e SMTP",
    },
  ];
}
