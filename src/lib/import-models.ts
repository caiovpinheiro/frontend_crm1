/**
 * CRUD de "Modelos de Importação" salvos no localStorage do navegador.
 * Cada modelo guarda o mapeamento de colunas + delimitador para reuso
 * em futuras importações.
 *
 * Persistência local agora; migração para Prisma é um TODO futuro.
 */

import type { CsvDelimiter } from "@/lib/csv-parse";

const STORAGE_KEY = "crm_import_models_v1";

export type ImportEntity = "contacts" | "deals" | "companies";

/**
 * Modo de importação (usado em deals):
 *   "create" → só cria leads novos (ignora existentes)
 *   "update" → só atualiza leads existentes (casa por external_id)
 *   "upsert" → cria e atualiza
 */
export type ImportMode = "create" | "update" | "upsert";

export interface ImportModel {
  id: string;
  name: string;
  entity: ImportEntity;
  columnMapping: Record<string, string>;
  delimiter: CsvDelimiter;
  skipHeader: boolean;
  updateExisting: boolean;
  /** Opcional (deals). Ausente em modelos antigos → cai no default do wizard. */
  importMode?: ImportMode;
  createdAt: string;
}

function read(): ImportModel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ImportModel =>
        !!m && typeof (m as ImportModel).id === "string" && typeof (m as ImportModel).name === "string",
    );
  } catch {
    return [];
  }
}

function write(models: ImportModel[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch {
    /* quota cheia: ignora */
  }
}

export function getImportModels(entity?: ImportEntity): ImportModel[] {
  const all = read();
  return entity ? all.filter((m) => m.entity === entity) : all;
}

export function saveImportModel(
  model: Omit<ImportModel, "id" | "createdAt">,
): ImportModel {
  const all = read();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const novo: ImportModel = {
    ...model,
    id,
    createdAt: new Date().toISOString(),
  };
  all.push(novo);
  write(all);
  return novo;
}

export function deleteImportModel(id: string): void {
  const all = read();
  write(all.filter((m) => m.id !== id));
}

export function findImportModel(id: string): ImportModel | null {
  return read().find((m) => m.id === id) ?? null;
}
