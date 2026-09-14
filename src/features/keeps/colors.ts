export const KEEP_NOTE_COLORS = [
  "coral",
  "peach",
  "sand",
  "mint",
  "sage",
  "fog",
  "storm",
  "dusk",
  "blossom",
] as const;

export type KeepNoteColorId = (typeof KEEP_NOTE_COLORS)[number];

export const KEEP_COLOR_LABELS: Record<KeepNoteColorId | "none", string> = {
  none: "Padrão",
  coral: "Coral",
  peach: "Pêssego",
  sand: "Areia",
  mint: "Menta",
  sage: "Sálvia",
  fog: "Névoa",
  storm: "Chumbo",
  dusk: "Anil",
  blossom: "Rosa",
};
