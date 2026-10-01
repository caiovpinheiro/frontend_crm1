export interface MultiSelectOption {
  value: string;
  label: string;
  /** Cor opcional (ex.: tag) renderizada como swatch. */
  color?: string;
  sub?: string;
}

export function matchMultiSelectOptions(options: MultiSelectOption[], query: string): MultiSelectOption[] {
  const trimmed = query.trim();
  if (!trimmed) return options;
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const digits = trimmed.replace(/\D/g, "");
  return options.filter((opt) => {
    const haystack = `${opt.label ?? ""} ${opt.sub ?? ""}`.toLowerCase();
    const textMatch = tokens.every((t) => haystack.includes(t));
    const haystackDigits = `${opt.label ?? ""}${opt.sub ?? ""}`.replace(/\D/g, "");
    const phoneMatch = digits.length > 0 && haystackDigits.includes(digits);
    return textMatch || phoneMatch;
  });
}
