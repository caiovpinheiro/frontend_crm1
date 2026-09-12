import type { KeepNoteColor } from "./types";

export const KEEP_NOTE_COLORS: readonly KeepNoteColor[] = [
  "default",
  "yellow",
  "orange",
  "coral",
  "green",
  "teal",
  "blue",
  "lavender",
] as const;

export const KEEP_COLOR_VAR: Record<KeepNoteColor, string> = {
  default: "var(--keep-swatch-default)",
  yellow: "var(--keep-swatch-yellow)",
  orange: "var(--keep-swatch-orange)",
  coral: "var(--keep-swatch-coral)",
  green: "var(--keep-swatch-green)",
  teal: "var(--keep-swatch-teal)",
  blue: "var(--keep-swatch-blue)",
  lavender: "var(--keep-swatch-lavender)",
};

export const KEEP_COLOR_LABEL: Record<KeepNoteColor, string> = {
  default: "Padrão",
  yellow: "Amarelo",
  orange: "Laranja",
  coral: "Coral",
  green: "Verde",
  teal: "Verde-água",
  blue: "Azul",
  lavender: "Lavanda",
};

export function isKeepNoteColor(value: unknown): value is KeepNoteColor {
  return typeof value === "string" && (KEEP_NOTE_COLORS as readonly string[]).includes(value);
}
