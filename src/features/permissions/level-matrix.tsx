/**
 * level-matrix — lógica de níveis do editor de permissões (modo
 * simplificado). Fonte da verdade consumida pelo
 * `role-permissions-editor.tsx`; o componente visual NÃO reimplementa
 * nada disto.
 *
 * Modelo mental (estilo Kommo/HubSpot):
 *   Nível 0 "Nenhum"  → nenhuma action do resource
 *   Nível 1 "Ver"     → actions tier 1 (somente leitura)
 *   Nível 2 "Operar"  → tiers 1–2 (criar/editar/ações de domínio)
 *   Nível 3 "Total"   → tiers 1–3 (inclui destrutivas/sensíveis)
 *
 * `nav:*` nunca é editado direto no modo simplificado — é DERIVADO do
 * `:view` dos módulos via `deriveNav()` (espelha o fail-closed da
 * sidebar em `src/lib/sidebar-catalog.ts`).
 */

import type { ActionDef, ResourceDef } from "./types";

export interface LevelDef {
  id: 0 | 1 | 2 | 3;
  label: string;
  /** Subtítulo curto no segmented (DS permissions). */
  hint: string;
}

/** Níveis do segmented control, em ordem. */
export const LEVELS: readonly LevelDef[] = [
  { id: 0, label: "Nenhum", hint: "Sem acesso" },
  { id: 1, label: "Ver", hint: "Apenas leitura" },
  { id: 2, label: "Operar", hint: "Criar e editar" },
  { id: 3, label: "Total", hint: "Inclui exclusão" },
] as const;

/**
 * Actions sensíveis que não carregam `destructive: true` no catálogo
 * mas afetam o trabalho de OUTROS agentes — só entram no nível Total.
 */
const SENSITIVE_ACTIONS = new Set(["transfer_owner", "reassign_others"]);

/**
 * Tier de uma action. Prioridade: campo explícito `tier` do catálogo >
 * heurística estável (view = 1; destrutiva/sensível = 3; resto = 2).
 */
export function actionTier(action: ActionDef): 1 | 2 | 3 {
  if (action.tier) return action.tier;
  if (action.action === "view") return 1;
  if (action.destructive) return 3;
  if (SENSITIVE_ACTIONS.has(action.action)) return 3;
  if (action.action.endsWith("_others")) return 3;
  return 2;
}

/** Chaves `resource:action` de um resource, na ordem do catálogo. */
export function resourceKeys(resource: ResourceDef): string[] {
  return resource.actions.map((a) => `${resource.resource}:${a.action}`);
}

/**
 * Nível exato correspondente ao subconjunto marcado de um resource.
 * Retorna `null` quando o conjunto não bate com nenhum nível
 * ("personalizado" na UI).
 */
export function levelOf(
  resource: ResourceDef,
  checked: ReadonlySet<string>,
): 0 | 1 | 2 | 3 | null {
  for (const level of LEVELS) {
    const expected = resource.actions
      .filter((a) => actionTier(a) <= level.id)
      .map((a) => `${resource.resource}:${a.action}`);
    const got = resourceKeys(resource).filter((k) => checked.has(k));
    if (
      expected.length === got.length &&
      expected.every((k) => checked.has(k))
    ) {
      return level.id;
    }
  }
  return null;
}

/**
 * Aplica um nível a um resource: substitui TODAS as chaves daquele
 * resource pelas de tier <= level. Retorna um NOVO Set (imutável).
 */
export function applyLevel(
  resource: ResourceDef,
  level: 0 | 1 | 2 | 3,
  checked: ReadonlySet<string>,
): Set<string> {
  const next = new Set(checked);
  for (const a of resource.actions) {
    const key = `${resource.resource}:${a.action}`;
    if (actionTier(a) <= level && level > 0) next.add(key);
    else next.delete(key);
  }
  return next;
}

/**
 * Derivação `nav:<key>` ← chaves-fonte (any-of). Espelha o catálogo
 * backend (`resource: nav`) e o `requiredPermission` de
 * `src/lib/sidebar-catalog.ts`.
 *
 * Decisões:
 *  - `dashboard` é acesso básico: derivado sempre que a role tem ao
 *    menos UMA permissão (o item é `locked` na sidebar).
 *  - `logs` segue `report:view` (feed analítico de eventos).
 *  - `widgets` segue `distribution:view` (único módulo de widget hoje).
 */
export const NAV_DERIVATION: Record<string, readonly string[]> = {
  dashboard: [],
  pipeline: ["pipeline:view"],
  contacts: ["contact:view"],
  companies: ["company:view"],
  inbox: ["conversation:view"],
  activities: ["task:view"],
  automations: ["automation:view"],
  campaigns: ["campaign:view"],
  distribution: ["distribution:view"],
  logs: ["report:view"],
  widgets: ["distribution:view"],
  "team-chat": ["team_chat:view"],
  "bwipo-keeps": ["keep:view"],
  email: ["email_account:view", "email_account:view_own"],
  "whatsapp-groups": ["whatsapp_group:view"],
  demands: ["demand:view"],
};

/**
 * Calcula as chaves `nav:*` derivadas do conjunto marcado. Ignora as
 * chaves `nav:*` já presentes no Set (entrada = só módulos/settings).
 */
export function deriveNav(checked: ReadonlySet<string>): string[] {
  const hasAny = [...checked].some((k) => !k.startsWith("nav:"));
  const out: string[] = [];
  for (const [navKey, sources] of Object.entries(NAV_DERIVATION)) {
    if (sources.length === 0) {
      if (hasAny) out.push(`nav:${navKey}`);
      continue;
    }
    if (sources.some((s) => checked.has(s))) out.push(`nav:${navKey}`);
  }
  return out;
}

/**
 * Substitui as chaves `nav:*` de um Set pelas derivadas — usado no
 * onChange do modo simplificado (nav nunca é editado direto lá).
 */
export function withDerivedNav(checked: ReadonlySet<string>): Set<string> {
  const next = new Set([...checked].filter((k) => !k.startsWith("nav:")));
  for (const k of deriveNav(next)) next.add(k);
  return next;
}
