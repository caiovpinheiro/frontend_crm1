/**
 * Schema da condicional multi-branch (estilo Kommo).
 *
 * A condition deixou de ser um simples SIM/NAO. Agora um `condition`
 * tem N branches avaliados em ordem; a primeira branch cujo conjunto de
 * `rules` bater (AND entre rules) dispara o caminho daquele branch. Se
 * nenhum branch bater, caimos no `elseStepId`.
 *
 *   condition.config = {
 *     branches: [
 *       {
 *         id: "branch_abc",
 *         label: "Entrada manual",           // opcional
 *         rules: [
 *           { field: "variables.resposta", op: "eq", value: "manual" },
 *           { field: "contact.leadScore",  op: "gt", value: 50 }  // AND
 *         ],
 *         nextStepId: "step_xyz"             // pra onde vai se bater
 *       },
 *       { ... outro branch ... }
 *     ],
 *     elseStepId: "step_fallback"            // nenhuma bateu
 *   }
 *
 * Também mantém retrocompat lendo o formato antigo `{ path, op, value,
 * elseStepId }` e migrando pra 1 branch com 1 rule.
 */

export type ConditionOp =
  | "eq"
  | "ne"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "includes"
  | "starts_with"
  | "ends_with"
  | "empty"
  | "not_empty"
  // 27/mai/26 — Operadores específicos para tags. Funcionam contra
  // `contact.tags` / `contact.tagIds` (e par no `deal`), populados pelo
  // executor a partir das relações TagOnContact/TagOnDeal.
  | "has_tag"
  | "not_has_tag"
  | "in_business_hours"
  | "not_in_business_hours";

export type ConditionRule = {
  field: string;
  op: ConditionOp;
  value: unknown;
};

export type ConditionBranch = {
  id: string;
  label?: string;
  rules: ConditionRule[];
  nextStepId?: string;
};

export type ConditionConfig = {
  branches: ConditionBranch[];
  elseStepId?: string;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function newBranchId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `branch_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `branch_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeOp(raw: unknown): ConditionOp {
  const s = String(raw ?? "eq").toLowerCase();
  // aliases usados por versões antigas / UI
  if (s === "equals") return "eq";
  if (s === "not_equals") return "ne";
  if (s === "greater_than") return "gt";
  if (s === "less_than") return "lt";
  if (s === "greater_or_equal") return "gte";
  if (s === "less_or_equal") return "lte";
  if (s === "contains") return "includes";
  if (s === "contains_tag" || s === "tag_present" || s === "tag_added") return "has_tag";
  if (s === "missing_tag" || s === "tag_absent" || s === "tag_not_present") return "not_has_tag";
  const allowed: ConditionOp[] = [
    "eq", "ne", "gt", "lt", "gte", "lte",
    "includes", "starts_with", "ends_with",
    "empty", "not_empty",
    "has_tag", "not_has_tag",
    "in_business_hours", "not_in_business_hours",
  ];
  return (allowed.includes(s as ConditionOp) ? s : "eq") as ConditionOp;
}

/** CUID/UUID não entram no resumo do card — o operador vê nome ou um rótulo curto. */
export function looksLikeOpaqueId(s: string): boolean {
  if (s.length < 16) return false;
  return (
    /^c[a-z0-9]{20,}$/i.test(s) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) ||
    /^[0-9a-f]{24,}$/i.test(s)
  );
}

const FIELD_ALIASES: Record<string, string> = {
  stageId: "deal.stageId",
  "deal.stage": "deal.stageId",
  pipelineId: "deal.pipelineId",
  "deal.pipeline": "deal.pipelineId",
  departmentId: "conversation.departmentId",
};

function canonicalizeField(field: string): string {
  return FIELD_ALIASES[field] ?? field;
}

function branchRulesOf(b: Record<string, unknown>): unknown[] {
  if (Array.isArray(b.rules)) return b.rules;
  if (Array.isArray(b.conditions)) return b.conditions;
  return [];
}

function scalarRuleValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.id === "string" && rec.id.trim()) return rec.id.trim();
    if (typeof rec.value === "string") return rec.value;
  }
  return value ?? "";
}

export function normalizeRule(raw: unknown): ConditionRule | null {
  const r = asRecord(raw);
  const field = canonicalizeField(String(r.field ?? r.path ?? r.left ?? "").trim());
  if (!field) return null;
  return {
    field,
    op: normalizeOp(r.op ?? r.operator),
    value: scalarRuleValue(r.value ?? r.right),
  };
}

function normalizeBranch(raw: unknown): ConditionBranch | null {
  const b = asRecord(raw);
  const rules = branchRulesOf(b)
    .map(normalizeRule)
    .filter((x): x is ConditionRule => x !== null);
  if (rules.length === 0) return null;
  return {
    id: typeof b.id === "string" && b.id ? b.id : newBranchId(),
    label: typeof b.label === "string" ? b.label : undefined,
    rules,
    nextStepId: typeof b.nextStepId === "string" && b.nextStepId ? b.nextStepId : undefined,
  };
}

function elseStepOf(c: Record<string, unknown>): string | undefined {
  return typeof c.elseStepId === "string" && c.elseStepId ? c.elseStepId : undefined;
}

function legacyRuleFromConfig(c: Record<string, unknown>): ConditionRule | null {
  return normalizeRule({
    field: c.field ?? c.path ?? c.left,
    op: c.op ?? c.operator,
    value: c.value ?? c.right,
  });
}

/**
 * Converte qualquer config (novo ou antigo) pra ConditionConfig
 * canônico. Chame isto antes de avaliar / renderizar.
 */
export function normalizeConditionConfig(raw: unknown): ConditionConfig {
  const c = asRecord(raw);

  if (Array.isArray(c.branches)) {
    const branches = c.branches
      .map(normalizeBranch)
      .filter((b): b is ConditionBranch => b !== null);
    if (branches.length > 0) {
      return { branches, elseStepId: elseStepOf(c) };
    }
  }

  // Formato antigo `{ path, op, value, elseStepId }` → migra pra 1 branch.
  // Também cobre `branches: []` / rules vazias com field/path no topo.
  const legacy = legacyRuleFromConfig(c);
  if (legacy) {
    const legacyNext =
      typeof c.nextStepId === "string" && c.nextStepId && c.nextStepId !== "__none__"
        ? c.nextStepId
        : undefined;
    return {
      branches: [
        {
          id: newBranchId(),
          rules: [legacy],
          nextStepId: legacyNext,
        },
      ],
      elseStepId: elseStepOf(c),
    };
  }

  return { branches: [], elseStepId: elseStepOf(c) };
}

function emptyRule(): ConditionRule {
  return { field: "", op: "eq", value: "" };
}

/**
 * Hidrata branches pra UI: preserva ids (handles `branch:id`) e linhas
 * vazias do editor; promove `path`/`operator`/`conditions` e o field
 * legado no topo quando as rules vieram em branco.
 */
export function hydrateConditionBranches(raw: unknown): ConditionBranch[] {
  const c = asRecord(raw);
  const rawBranches = Array.isArray(c.branches) ? c.branches : [];
  if (rawBranches.length > 0) {
    const hydrated = rawBranches.map((b, i) => {
      const rec = asRecord(b);
      const rawRules = branchRulesOf(rec);
      const rules =
        rawRules.length > 0
          ? rawRules.map((r) => normalizeRule(r) ?? emptyRule())
          : [emptyRule()];
      return {
        id: typeof rec.id === "string" && rec.id ? rec.id : `branch_${i}`,
        label: typeof rec.label === "string" ? rec.label : "",
        rules,
        nextStepId:
          typeof rec.nextStepId === "string" && rec.nextStepId ? rec.nextStepId : undefined,
      } satisfies ConditionBranch;
    });
    const hasField = hydrated.some((b) => b.rules.some((r) => r.field));
    if (!hasField) {
      const legacy = legacyRuleFromConfig(c);
      if (legacy) {
        return hydrated.map((b, i) => (i === 0 ? { ...b, rules: [legacy] } : b));
      }
    }
    return hydrated;
  }

  const normalized = normalizeConditionConfig(c);
  if (normalized.branches.length > 0) {
    return normalized.branches.map((b) => ({ ...b, label: b.label ?? "" }));
  }
  return [{ id: newBranchId(), label: "", rules: [emptyRule()] }];
}

const FIELD_LABELS: Record<string, string> = {
  "contact.name": "Nome do contato",
  "contact.email": "E-mail",
  "contact.phone": "Telefone",
  "contact.source": "Origem",
  "contact.adUtmSource": "utm_source",
  "contact.adUtmMedium": "utm_medium",
  "contact.adUtmCampaign": "utm_campaign",
  "contact.adUtmContent": "utm_content",
  "contact.adUtmTerm": "utm_term",
  "contact.utmId": "utm_id",
  "contact.utmReferrer": "utm_referrer",
  "contact.referrer": "referrer",
  "contact.gclid": "gclid",
  "contact.fbclid": "fbclid",
  "contact.googleClientId": "gclientid",
  "contact.ttadId": "ttad_id",
  "contact.ttadName": "ttad_name",
  "contact.lifecycleStage": "Ciclo de vida",
  "contact.assignedToId": "Responsável",
  "contact.tags": "Tags do contato",
  "deal.title": "Título do negócio",
  "deal.value": "Valor",
  "deal.status": "Status do negócio",
  "deal.stageId": "Etapa",
  "deal.pipelineId": "Funil",
  "deal.ownerId": "Responsável (negócio)",
  "deal.tags": "Tags do negócio",
  "conversation.channel": "Canal",
  "conversation.assignedToId": "Atendente",
  "conversation.departmentId": "Departamento",
  "conversation.isClosed": "Conversa encerrada",
  "conversation.hasAgentReply": "Teve resposta do agente",
  "conversation.hasError": "Conversa com erro",
  "system.now": "Momento atual",
};

const OP_LABELS: Record<string, string> = {
  eq: "=",
  ne: "≠",
  includes: "contém",
  starts_with: "começa com",
  ends_with: "termina com",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  empty: "vazio",
  not_empty: "não vazio",
  has_tag: "tem tag",
  not_has_tag: "não tem tag",
  in_business_hours: "no expediente",
  not_in_business_hours: "fora do expediente",
};

const VALUE_LABELS: Record<string, string> = {
  true: "Sim",
  false: "Não",
  OPEN: "Aberto",
  WON: "Ganho",
  LOST: "Perdido",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  webchat: "Webchat",
};

function resolveRuleValue(rule: ConditionRule, lookup?: Record<string, string>): string {
  const raw = String(rule.value ?? "").trim();
  if (!raw) return "";
  const named = lookup?.[raw] ?? VALUE_LABELS[raw];
  if (named && !looksLikeOpaqueId(named)) return named;
  if (looksLikeOpaqueId(raw)) return "";
  return raw;
}

function describeRule(rule: ConditionRule, lookup?: Record<string, string>): string {
  const resolved = resolveRuleValue(rule, lookup);
  if (rule.op === "has_tag") {
    return resolved ? `tem tag "${resolved}"` : "tem tag";
  }
  if (rule.op === "not_has_tag") {
    return resolved ? `não tem tag "${resolved}"` : "não tem tag";
  }
  const fieldFromLookup = lookup?.[rule.field];
  const field =
    fieldFromLookup && !looksLikeOpaqueId(fieldFromLookup)
      ? fieldFromLookup
      : (FIELD_LABELS[rule.field] ?? (looksLikeOpaqueId(rule.field) ? "Campo" : rule.field));
  const op = OP_LABELS[rule.op] ?? rule.op;
  if (rule.op === "empty" || rule.op === "not_empty" || rule.op === "in_business_hours" || rule.op === "not_in_business_hours") {
    return `${field} ${op}`;
  }
  return resolved ? `${field} ${op} ${resolved.slice(0, 28)}` : `${field} ${op}`;
}

/**
 * Retorna uma string curta pro summary dentro do node. Mostra a
 * primeira regra da primeira branch + qtd de branches extras.
 */
export function summarizeConditionConfig(
  raw: unknown,
  lookup?: Record<string, string>,
): string {
  const cfg = normalizeConditionConfig(raw);
  if (cfg.branches.length === 0) return "Definir regra";
  const first = cfg.branches[0];
  const firstRule = first.rules[0];
  const base = firstRule
    ? describeRule(firstRule, lookup)
    : first.label ?? "Branch 1";
  const extras =
    cfg.branches.length > 1
      ? ` · +${cfg.branches.length - 1} ${cfg.branches.length - 1 === 1 ? "condição" : "condições"}`
      : "";
  return base + extras;
}
