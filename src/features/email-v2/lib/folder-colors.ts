import type { EmailFolder } from "../api/types";

export type FolderTone = "blue" | "violet" | "green" | "amber" | "rose";

export const FOLDER_TONES: FolderTone[] = ["blue", "violet", "green", "amber", "rose"];

export const FOLDER_TONE: Record<
  FolderTone,
  { swatch: string; bg: string; fg: string }
> = {
  blue: {
    swatch: "var(--brand-primary)",
    bg: "color-mix(in srgb, var(--brand-primary) 16%, transparent)",
    fg: "var(--brand-primary)",
  },
  violet: {
    swatch: "var(--brand-secondary, #a78bfa)",
    bg: "color-mix(in srgb, var(--brand-secondary, #a78bfa) 18%, transparent)",
    fg: "var(--brand-secondary, #7c3aed)",
  },
  green: {
    swatch: "var(--color-success, #16a34a)",
    bg: "color-mix(in srgb, var(--color-success, #16a34a) 16%, transparent)",
    fg: "var(--color-success, #16a34a)",
  },
  amber: {
    swatch: "var(--color-warning, #d97706)",
    bg: "color-mix(in srgb, var(--color-warning, #d97706) 18%, transparent)",
    fg: "var(--color-warning, #d97706)",
  },
  rose: {
    swatch: "var(--color-danger, #e11d48)",
    bg: "color-mix(in srgb, var(--color-danger, #e11d48) 16%, transparent)",
    fg: "var(--color-danger, #e11d48)",
  },
};

export const SYSTEM_FOLDER_TONE: Record<EmailFolder, FolderTone> = {
  INBOX: "blue",
  SENT: "green",
  TRASH: "rose",
};

export function resolveFolderTone(color: string | null | undefined, seed = ""): FolderTone {
  if (color && FOLDER_TONES.includes(color as FolderTone)) return color as FolderTone;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return FOLDER_TONES[Math.abs(hash) % FOLDER_TONES.length] ?? "blue";
}

export function nextFolderTone(current: FolderTone): FolderTone {
  const i = FOLDER_TONES.indexOf(current);
  return FOLDER_TONES[(i + 1) % FOLDER_TONES.length] ?? "blue";
}
