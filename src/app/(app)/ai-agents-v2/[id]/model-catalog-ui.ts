/**
 * Textos do catálogo de modelos ("Atualizar modelos") — funções puras para
 * a tela e para os testes. Nenhum domínio de cliente.
 */

export type ModelProvider = "openai" | "anthropic";
export type ModelPriceSource = "builtin" | "org" | "unknown";

export type CatalogModelOption = {
  id: string;
  name: string;
  provider?: ModelProvider;
  hint?: string;
  /** builtin: lista fixa do CRM; discovered: veio do provedor no "Atualizar modelos". */
  source?: "builtin" | "discovered";
  legacy?: boolean;
  /** Preço conhecido (US$ por 1M tokens); null = desconhecido. */
  inputPer1M?: number | null;
  outputPer1M?: number | null;
  priceSource?: ModelPriceSource;
  /** Preço que a estimativa de gasto e o limite usam. */
  estimateInputPer1M?: number;
  estimateOutputPer1M?: number;
  /** O provedor não lista mais este modelo. */
  missing?: boolean;
  missingSince?: string | null;
  discoveredAt?: string | null;
};

export type ProviderRefreshResult = {
  ok: boolean;
  error?: string;
  code?: string;
  chatModels?: number;
  added?: string[];
  missing?: string[];
};

export type RefreshResult = Partial<Record<ModelProvider, ProviderRefreshResult>>;

export type LastRefresh = { at: string; userId: string | null; userName: string | null; result: RefreshResult | null };

export const PROVIDER_LABEL: Record<ModelProvider, string> = { openai: "OpenAI", anthropic: "Anthropic" };

export function formatPrice(v?: number | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: v < 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** O que aparece à direita do modelo: preço ou "Preço desconhecido". */
export function modelPriceLabel(m: CatalogModelOption): string {
  if (m.priceSource === "unknown" || m.inputPer1M === null || m.outputPer1M === null) return "Preço desconhecido";
  if (m.inputPer1M === undefined) return "";
  return `US$ ${formatPrice(m.inputPer1M)} / ${formatPrice(m.outputPer1M)}`;
}

/** Aviso sobre o custo do modelo escolhido; vazio quando o preço é o de tabela. */
export function modelCostNotice(m: CatalogModelOption | undefined): string {
  if (!m) return "";
  if (m.priceSource === "unknown") {
    return `Preço desconhecido: a estimativa de gasto e o limite usam US$ ${formatPrice(m.estimateInputPer1M)} / ${formatPrice(m.estimateOutputPer1M)} por 1 milhão de tokens (o mais caro do provedor na lista) até alguém preencher o preço. O limite corta antes, nunca depois.`;
  }
  if (m.priceSource === "org") return "Gasto estimado pelo preço que a organização informou para este modelo.";
  return "";
}

function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function lastRefreshLabel(last: LastRefresh | null | undefined): string {
  if (!last) return "A lista ainda não foi atualizada com os provedores.";
  const when = dateTime(last.at);
  return `Atualizada em ${when}${last.userName ? ` por ${last.userName}` : ""}.`;
}

/** Uma linha por provedor: o que entrou, o que saiu, ou o erro. */
export function refreshSummaryLines(result: RefreshResult | null | undefined, names: Map<string, string> = new Map()): Array<{ ok: boolean; text: string }> {
  if (!result) return [];
  const out: Array<{ ok: boolean; text: string }> = [];
  for (const provider of ["openai", "anthropic"] as ModelProvider[]) {
    const r = result[provider];
    if (!r) continue;
    const label = PROVIDER_LABEL[provider];
    if (!r.ok) {
      out.push({ ok: false, text: `${label}: ${r.error ?? "não foi possível consultar."}` });
      continue;
    }
    const added = r.added ?? [];
    const parts = [
      added.length ? `${added.length} novo${added.length > 1 ? "s" : ""} (${added.map((id) => names.get(id) ?? id).join(", ")})` : "nenhum modelo novo",
    ];
    if (r.missing?.length) parts.push(`${r.missing.length} não aparece${r.missing.length > 1 ? "m" : ""} mais na lista do provedor`);
    out.push({ ok: true, text: `${label}: ${parts.join("; ")}.` });
  }
  return out;
}
