/**
 * Listas que as seções v2 do painel Webchat oferecem para escolha (campos
 * personalizados, tags, departamentos). Leituras simples das rotas que o
 * CRM já tem; falha = lista vazia (o painel continua utilizável).
 */
import { apiUrl } from "@/lib/api";

export type WebchatOption = { id: string; label: string };

function list(data: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

async function getJson(path: string): Promise<unknown> {
  try {
    const res = await fetch(apiUrl(path), { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function toOptions(rows: Record<string, unknown>[], labelKeys: string[]): WebchatOption[] {
  return rows.flatMap((r) => {
    const id = typeof r.id === "string" ? r.id : null;
    const label = labelKeys.map((k) => r[k]).find((v): v is string => typeof v === "string" && v.length > 0);
    return id ? [{ id, label: label ?? id }] : [];
  });
}

export async function fetchCustomFieldOptions(entity: "contact" | "deal"): Promise<WebchatOption[]> {
  return toOptions(list(await getJson(`/api/custom-fields?entity=${entity}`), ["items", "fields"]), [
    "label",
    "name",
  ]);
}

export async function fetchTagOptions(): Promise<WebchatOption[]> {
  return toOptions(list(await getJson("/api/tags"), ["tags", "items"]), ["name"]);
}

export async function fetchDepartmentOptions(): Promise<WebchatOption[]> {
  return toOptions(list(await getJson("/api/settings/departments"), ["items", "departments", "data"]), ["name"]);
}
