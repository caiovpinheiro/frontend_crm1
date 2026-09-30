/**
 * Última visualização do funil (Kanban / Lista / Flow).
 * Persistida em localStorage — usada ao abrir Pipeline pela nav.
 */

export type PipelineViewPreference = "kanban" | "list" | "flow";

export const PIPELINE_VIEW_STORAGE_KEY = "crm:pipeline:last-view:v1";

export function readPipelineViewPreference(): PipelineViewPreference {
  if (typeof window === "undefined") return "kanban";
  try {
    const v = localStorage.getItem(PIPELINE_VIEW_STORAGE_KEY);
    if (v === "list" || v === "flow" || v === "kanban") return v;
  } catch {
    /* private mode / quota */
  }
  return "kanban";
}

export function writePipelineViewPreference(view: PipelineViewPreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PIPELINE_VIEW_STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}

export function pathForPipelineView(view: PipelineViewPreference): string {
  if (view === "list") return "/pipeline/list";
  if (view === "flow") return "/pipeline/flow";
  return "/pipeline";
}

export type PipelineEntryDecision =
  | { kind: "kanban" }
  | { kind: "redirect"; view: Exclude<PipelineViewPreference, "kanban">; href: string };

/**
 * Decide o que `/pipeline` deve fazer ANTES de montar o kanban.
 *
 * - `?deal=` sempre abre no kanban (deep-link do negócio).
 * - Preferência salva "list"/"flow" → redirect, preservando a query.
 * - Caso contrário → kanban.
 *
 * Pura para o teste: recebe a query string e a preferência já lidas.
 */
export function resolvePipelineEntry(input: {
  /** `window.location.search` (com ou sem `?`). */
  search: string;
  preferred: PipelineViewPreference;
}): PipelineEntryDecision {
  const raw = input.search.startsWith("?") ? input.search.slice(1) : input.search;
  const qs = new URLSearchParams(raw);
  if (qs.get("deal")) return { kind: "kanban" };
  if (input.preferred === "kanban") return { kind: "kanban" };
  const path = pathForPipelineView(input.preferred);
  const q = qs.toString();
  return { kind: "redirect", view: input.preferred, href: q ? `${path}?${q}` : path };
}
