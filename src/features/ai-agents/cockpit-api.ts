/**
 * Integração com o Cockpit IA (serviço nginx separado, embedado por iframe
 * na página "Agentes de IA").
 *
 * Regra central: o CRM **não conhece** a lista de abas do cockpit. Ela vem do
 * `nav.json` publicado pelo próprio serviço do cockpit (para montar as abas
 * sem carregar o iframe) e é corrigida pelo `cockpit:ready` quando o iframe
 * sobe. Adicionar uma aba no cockpit não exige rebuild do CRM.
 *
 * Desligável: sem `NEXT_PUBLIC_COCKPIT_URL` a página renderiza exatamente
 * como antes, sem barra de abas.
 */

import { apiUrl, getApiBaseUrl, parseApiResponse } from "@/lib/api";

export interface CockpitNavItem {
  /** `data-stage` da aba no cockpit. */
  id: string;
  label: string;
}

export interface CockpitNavGroup {
  /** Rótulo do grupo na sidebar do cockpit (ex.: "Operação"). Pode ser "". */
  group: string;
  items: CockpitNavItem[];
}

export interface CockpitEmbedTokenResponse {
  token: string;
  expiresInSeconds: number;
}

/** URL base do serviço do cockpit. Vazio = integração desligada. */
export function getCockpitUrl(): string {
  return (process.env.NEXT_PUBLIC_COCKPIT_URL ?? "").trim().replace(/\/+$/, "");
}

/** Origem exata do cockpit — usada para validar `postMessage` nos dois sentidos. */
export function getCockpitOrigin(cockpitUrl: string): string | null {
  try {
    return new URL(cockpitUrl).origin;
  } catch {
    return null;
  }
}

/** URL do iframe. O `embedded=1` é o que liga o modo embedded no cockpit. */
export function buildCockpitEmbedSrc(cockpitUrl: string): string {
  try {
    const url = new URL(cockpitUrl);
    url.searchParams.set("embedded", "1");
    return url.toString();
  } catch {
    return cockpitUrl;
  }
}

/**
 * Base absoluta que o cockpit deve usar para chamar a API.
 *
 * Preferimos o domínio do backend. Sem ele, cai na origem do frontend, que
 * reescreve `/api/*` para o backend — funciona igual, só passa por um salto a
 * mais. Em ambos os casos a origem do cockpit precisa estar em
 * `COCKPIT_ALLOWED_ORIGINS` no backend (CORS).
 */
export function resolveCockpitApiBase(): string {
  const backend = getApiBaseUrl();
  if (backend) return backend;
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Aceita tanto `[...]` quanto `{ nav: [...] }` — o cockpit publica o array. */
export function parseCockpitNav(raw: unknown): CockpitNavGroup[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { nav?: unknown } | null)?.nav)
      ? ((raw as { nav: unknown[] }).nav)
      : [];

  const groups: CockpitNavGroup[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { group?: unknown; items?: unknown };
    if (!Array.isArray(candidate.items)) continue;
    const items: CockpitNavItem[] = [];
    for (const item of candidate.items) {
      if (!item || typeof item !== "object") continue;
      const { id, label } = item as { id?: unknown; label?: unknown };
      if (typeof id !== "string" || !id) continue;
      items.push({ id, label: typeof label === "string" && label ? label : id });
    }
    if (!items.length) continue;
    groups.push({
      group: typeof candidate.group === "string" ? candidate.group : "",
      items,
    });
  }
  return groups;
}

export async function fetchCockpitNav(cockpitUrl: string): Promise<CockpitNavGroup[]> {
  const res = await fetch(`${cockpitUrl}/nav.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cockpit indisponível (${res.status}).`);
  return parseCockpitNav(await res.json());
}

/** Token curto (5 min) que o iframe usa como Bearer. Escopo `cockpit:read`. */
export async function fetchCockpitEmbedToken(): Promise<CockpitEmbedTokenResponse> {
  const res = await fetch(apiUrl("/api/ai-agents/cockpit-embed-token"), {
    cache: "no-store",
  });
  return parseApiResponse<CockpitEmbedTokenResponse>(
    res,
    "Falha ao autorizar o Cockpit IA.",
  );
}
