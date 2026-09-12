import type { EmailDetail } from "../api/types";

export type AvatarTone = "1" | "2" | "3" | "4" | "5";

const TONES: AvatarTone[] = ["1", "2", "3", "4", "5"];

export const AVATAR_TONE_CLASS: Record<AvatarTone, string> = {
  "1": "bg-[var(--avatar-1)] text-[var(--avatar-1-foreground)]",
  "2": "bg-[var(--avatar-2)] text-[var(--avatar-2-foreground)]",
  "3": "bg-[var(--avatar-3)] text-[var(--avatar-3-foreground)]",
  "4": "bg-[var(--avatar-4)] text-[var(--avatar-4-foreground)]",
  "5": "bg-[var(--avatar-5)] text-[var(--avatar-5-foreground)]",
};

export function avatarToneFromAddress(address: string): AvatarTone {
  let hash = 0;
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length] ?? "1";
}

export interface SecurityActivity {
  device: string;
  location: string;
  time: string;
}

const ALERT_RE =
  /alerta de seguran[cç]a|security alert|nova atividade|new sign-?in|verificar que [ée] voc|verify it.?s you|algu[eé]m acessou|suspicious (sign-?in|activity)/i;

export function isSecurityAlertEmail(email: Pick<EmailDetail, "subject" | "bodyText">): boolean {
  return ALERT_RE.test(`${email.subject ?? ""}\n${email.bodyText ?? ""}`);
}

export function parseSecurityAlert(email: EmailDetail): {
  appName: string;
  accountEmail: string;
  activities: SecurityActivity[];
} {
  const text = email.bodyText ?? "";
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const accountEmail = emailMatch?.[0] ?? email.toAddress;
  const appName =
    /google/i.test(`${email.subject ?? ""} ${email.fromAddress}`)
      ? "Google"
      : email.fromName ?? email.fromAddress;

  const activities: SecurityActivity[] = [];
  const lineRe =
    /(?:chrome|safari|firefox|edge|iphone|android|windows|mac|linux)[^\n]{0,80}/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) && activities.length < 6) {
    const chunk = m[0].replace(/\s+/g, " ").trim();
    activities.push({
      device: chunk.slice(0, 48),
      location: "—",
      time: email.receivedAt ?? "",
    });
  }
  if (activities.length === 0) {
    activities.push({
      device: "Sessão recente",
      location: "Detalhes no corpo do e-mail",
      time: email.receivedAt ?? "",
    });
  }

  return { appName, accountEmail, activities };
}
