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

/** Paleta exclusiva de categorias — ids distintos da paleta de notas. */
export const KEEP_CATEGORY_COLORS = [
  "ember",
  "honey",
  "citrus",
  "fern",
  "lagoon",
  "cobalt",
  "iris",
  "berry",
  "graphite",
] as const;

export type KeepCategoryColorId = (typeof KEEP_CATEGORY_COLORS)[number];

const CATEGORY_COLOR_SET = new Set<string>(KEEP_CATEGORY_COLORS);

export function isKeepCategoryColor(value: string): value is KeepCategoryColorId {
  return CATEGORY_COLOR_SET.has(value);
}

export const KEEP_CATEGORY_COLOR_LABELS: Record<KeepCategoryColorId, string> = {
  ember: "Brasa",
  honey: "Mel",
  citrus: "Cítrico",
  fern: "Samambaia",
  lagoon: "Lagoa",
  cobalt: "Cobalto",
  iris: "Íris",
  berry: "Amora",
  graphite: "Grafite",
};
