import type { EmailFolder } from "../api/types";

export type FolderTone = "blue" | "violet" | "green" | "amber" | "rose";

export const FOLDER_TONES: FolderTone[] = ["blue", "violet", "green", "amber", "rose"];

export const FOLDER_TONE: Record<
  FolderTone,
  { swatch: string; bg: string; fg: string }
> = {
  blue: {
    swatch: "var(--primary)",
    bg: "color-mix(in oklch, var(--primary) 14%, transparent)",
    fg: "var(--primary)",
  },
  violet: {
    swatch: "var(--primary)",
    bg: "color-mix(in oklch, var(--primary) 14%, transparent)",
    fg: "var(--primary)",
  },
  green: {
    swatch: "var(--channel-online)",
    bg: "var(--success)",
    fg: "var(--success-foreground)",
  },
  amber: {
    swatch: "var(--warning)",
    bg: "var(--accent)",
    fg: "var(--accent-foreground)",
  },
  rose: {
    swatch: "var(--destructive)",
    bg: "color-mix(in oklch, var(--destructive) 12%, transparent)",
    fg: "var(--destructive)",
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
