/**
 * Wrappers HTTP usados pelo painel de filtros do Kanban.
 *
 * Mantemos as URLs relativas pra reaproveitar o rewrite do Next.
 */

import { apiUrl } from "@/lib/api";

import type { AdvancedDealFilters, FilterOptionsResponse, SavedFilter } from "./types";

/**
 * Fallback: lista custom fields de uma entidade direto via `/api/custom-fields?entity=...`.
 *
 * Existe porque o endpoint principal `/api/kanban/filter-options` às vezes
 * devolve `dealCustomFields: []` / `contactCustomFields: []` mesmo quando a
 * org tem campos cadastrados (versão de backend desatualizada / RBAC). Esse
 * endpoint alternativo (também publico e auth-only) sempre traz a lista
 * completa de campos da org.
 *
 * Retorna `null` em qualquer erro pra não derrubar o painel inteiro.
 */
async function fetchCustomFieldsByEntity(
  entity: "deal" | "contact",
): Promise<FilterOptionsResponse["dealCustomFields"] | null> {
  try {
    const res = await fetch(apiUrl(`/api/custom-fields?entity=${entity}`), {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) return null;
    return data
      .filter((cf): cf is Record<string, unknown> => !!cf && typeof cf === "object")
      .map((cf) => ({
        id: String(cf.id ?? ""),
        name: String(cf.name ?? ""),
        label: String(cf.label ?? cf.name ?? ""),
        type: String(cf.type ?? "TEXT"),
        options: Array.isArray(cf.options)
          ? (cf.options as unknown[]).map((o) => String(o))
          : [],
        entity,
      }));
  } catch {
    return null;
  }
}

/**
 * Tenta buscar pipelines via `/api/pipelines` (existe há mais tempo no backend).
 * Usado quando `/api/kanban/filter-options` está indisponível (404/erro).
 */
async function fetchPipelinesFallback(): Promise<FilterOptionsResponse["pipelines"]> {
  try {
    const res = await fetch(apiUrl("/api/pipelines"), {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];
    return data.map((p: Record<string, unknown>) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? ""),
      number: typeof p.number === "number" ? p.number : undefined,
      slug: typeof p.slug === "string" ? p.slug : undefined,
      stages: Array.isArray(p.stages)
        ? (p.stages as Record<string, unknown>[]).map((s, i) => ({
            id: String(s.id ?? ""),
            name: String(s.name ?? ""),
            number: typeof s.number === "number" ? s.number : undefined,
            slug: typeof s.slug === "string" ? s.slug : undefined,
            color: String(s.color ?? "#94a3b8"),
            position: typeof s.position === "number" ? s.position : i,
          }))
        : [],
    }));
  } catch {
    return [];
  }
}

async function fetchUsersFallback(): Promise<FilterOptionsResponse["users"]> {
  try {
    const res = await fetch(apiUrl("/api/users"), {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    return arr.map((u: Record<string, unknown>) => ({
      id: String(u.id ?? ""),
      name: String(u.name ?? ""),
      avatarUrl: typeof u.avatarUrl === "string" ? u.avatarUrl : null,
      role: String(u.role ?? "MEMBER"),
      type: String(u.type ?? "USER"),
    }));
  } catch {
    return [];
  }
}

async function fetchTagsFallback(): Promise<FilterOptionsResponse["tags"]> {
  try {
    const res = await fetch(apiUrl("/api/tags"), {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    return arr.map((t: Record<string, unknown>) => ({
      id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      color: String(t.color ?? "#94a3b8"),
    }));
  } catch {
    return [];
  }
}

/**
 * Fallback: lista os motivos de perda do catálogo via
 * `/api/settings/loss-reasons`. Usado quando o endpoint principal
 * devolve `lossReasons: []` (versão de backend antiga, escopo, ou cache
 * antigo) — sem isso a seção "Motivo da perda" do painel some por
 * completo mesmo com a org tendo motivos cadastrados.
 */
async function fetchLossReasonsFallback(): Promise<string[]> {
  try {
    const res = await fetch(apiUrl("/api/settings/loss-reasons"), {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    return arr
      .map((r: Record<string, unknown>) => String(r.label ?? "").trim())
      .filter((s: string) => s.length > 0);
  } catch {
    return [];
  }
}

export async function fetchFilterOptions(): Promise<FilterOptionsResponse> {
  const res = await fetch(apiUrl("/api/kanban/filter-options"), {
    cache: "no-store",
    credentials: "include",
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));

  const primaryFailed = !res.ok;
  if (primaryFailed && typeof window !== "undefined") {
    console.warn(
      `[kanban-filter-options] HTTP ${res.status} — tentando fallback`,
      data?.message ?? "(sem mensagem)",
    );
  }

  // 1) Sempre considera o que o primário trouxe (mesmo que parcial).
  let dealCustomFields = Array.isArray(data?.dealCustomFields)
    ? data.dealCustomFields
    : [];
  let contactCustomFields = Array.isArray(data?.contactCustomFields)
    ? data.contactCustomFields
    : [];
  let pipelines = Array.isArray(data?.pipelines) ? data.pipelines : [];
  let users = Array.isArray(data?.users) ? data.users : [];
  let tags = Array.isArray(data?.tags) ? data.tags : [];
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const utmSources = Array.isArray(data?.utmSources) ? data.utmSources : [];
  let lossReasons = Array.isArray(data?.lossReasons) ? data.lossReasons : [];

  // 2) Fallback: chama endpoints individuais (que existem há mais tempo) p/
  //    preencher campos faltantes. Ocorre quando o primário falhou (404/etc)
  //    OU quando devolveu arrays vazios mesmo com 200.
  const needsDealCfs = dealCustomFields.length === 0;
  const needsContactCfs = contactCustomFields.length === 0;
  const needsPipelines = pipelines.length === 0;
  const needsUsers = users.length === 0;
  const needsTags = tags.length === 0;
  const needsLossReasons = lossReasons.length === 0;

  if (
    primaryFailed ||
    needsDealCfs ||
    needsContactCfs ||
    needsPipelines ||
    needsUsers ||
    needsTags ||
    needsLossReasons
  ) {
    const [
      dealFb,
      contactFb,
      pipelinesFb,
      usersFb,
      tagsFb,
      lossReasonsFb,
    ] = await Promise.all([
      needsDealCfs ? fetchCustomFieldsByEntity("deal") : Promise.resolve(null),
      needsContactCfs ? fetchCustomFieldsByEntity("contact") : Promise.resolve(null),
      needsPipelines ? fetchPipelinesFallback() : Promise.resolve(null),
      needsUsers ? fetchUsersFallback() : Promise.resolve(null),
      needsTags ? fetchTagsFallback() : Promise.resolve(null),
      needsLossReasons ? fetchLossReasonsFallback() : Promise.resolve(null),
    ]);

    if (dealFb && dealFb.length > 0) {
      dealCustomFields = dealFb;
      if (typeof window !== "undefined") {
        console.info(
          `[kanban-filter-options] fallback: ${dealFb.length} campos de negócio via /api/custom-fields`,
        );
      }
    }
    if (contactFb && contactFb.length > 0) {
      contactCustomFields = contactFb;
      if (typeof window !== "undefined") {
        console.info(
          `[kanban-filter-options] fallback: ${contactFb.length} campos de contato via /api/custom-fields`,
        );
      }
    }
    if (pipelinesFb && pipelinesFb.length > 0) pipelines = pipelinesFb;
    if (usersFb && usersFb.length > 0) users = usersFb;
    if (tagsFb && tagsFb.length > 0) tags = tagsFb;
    if (lossReasonsFb && lossReasonsFb.length > 0) lossReasons = lossReasonsFb;
  }

  // 3) Só lança se NADA foi recuperado e a primária falhou — assim a UI
  //    ainda consegue renderizar o painel com o que tem.
  const totallyEmpty =
    primaryFailed &&
    pipelines.length === 0 &&
    users.length === 0 &&
    tags.length === 0 &&
    dealCustomFields.length === 0 &&
    contactCustomFields.length === 0;
  if (totallyEmpty) {
    throw new Error(
      (data?.message as string) ?? `Erro ao carregar opções (HTTP ${res.status}).`,
    );
  }

  return {
    pipelines,
    users,
    tags,
    dealCustomFields,
    contactCustomFields,
    sources,
    utmSources,
    lossReasons,
  } as FilterOptionsResponse;
}

/** Typeahead de contatos no filtro Pessoas (Kanban). */
export type ContactFilterHit = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export async function searchContactsForFilter(search: string): Promise<ContactFilterHit[]> {
  const q = search.trim();
  if (q.length < 2) return [];
  const res = await fetch(apiUrl(`/api/contacts?perPage=10&search=${encodeURIComponent(q)}`), {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const list = Array.isArray(data) ? data : data.items ?? data.contacts ?? [];
  return (list as ContactFilterHit[]).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
  }));
}

export async function fetchBoardWithFilters(
  pipelineId: string,
  status: string,
  filters: AdvancedDealFilters,
): Promise<unknown[]> {
  const res = await fetch(`/api/pipelines/${pipelineId}/board`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, filters }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Erro ao carregar quadro.");
  return Array.isArray(data) ? data : Array.isArray(data?.stages) ? data.stages : [];
}

export async function fetchSavedFilters(entityType = "kanban_deals"): Promise<SavedFilter[]> {
  const res = await fetch(apiUrl(`/api/saved-filters?entityType=${encodeURIComponent(entityType)}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Erro ao listar filtros.");
  return Array.isArray(data?.items) ? data.items : [];
}

/**
 * Filtro salvo por id — usado pelo atalho `?filter=<id>` na URL, que expande
 * o preset em params legíveis. Devolve `null` quando não existe/sem acesso
 * (link antigo ou de outra org não pode travar a tela).
 */
export async function fetchSavedFilterById(id: string): Promise<SavedFilter | null> {
  try {
    const res = await fetch(apiUrl(`/api/saved-filters/${encodeURIComponent(id)}`), {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return null;
    return data as SavedFilter;
  } catch {
    return null;
  }
}

export async function createSavedFilter(payload: {
  name: string;
  filterConfig: AdvancedDealFilters;
  isShared?: boolean;
  isDefault?: boolean;
  entityType?: string;
}): Promise<SavedFilter> {
  const res = await fetch(apiUrl("/api/saved-filters"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType: "kanban_deals", ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Erro ao salvar filtro.");
  return data as SavedFilter;
}

export async function updateSavedFilter(
  id: string,
  payload: {
    name?: string;
    filterConfig?: AdvancedDealFilters;
    isShared?: boolean;
    isDefault?: boolean;
  },
): Promise<SavedFilter> {
  const res = await fetch(apiUrl(`/api/saved-filters/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Erro ao atualizar filtro.");
  return data as SavedFilter;
}

export async function deleteSavedFilter(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/saved-filters/${id}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? "Erro ao excluir filtro.");
  }
}

export async function duplicateSavedFilter(id: string): Promise<SavedFilter> {
  const res = await fetch(apiUrl(`/api/saved-filters/${id}/duplicate`), { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Erro ao duplicar.");
  return data as SavedFilter;
}
