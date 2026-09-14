/**
 * Catálogo + helpers de interpolação para **templates internos** do CRM
 * (cadastrados em `/old/settings/message-models?tab=internal`).
 *
 * Diferença em relação a `automation-webhook-variables.ts`:
 *   - Foco em conversa humana (contato + negócio + atendente), não em
 *     payload de webhook.
 *   - Aceita dotted-path simples (`{{contato.nome}}`,
 *     `{{negocio.valor}}`) — resolvido client-side antes de injetar o
 *     texto no composer do inbox.
 *   - Não envolve a Meta/WABA — esses templates ficam só no banco do CRM.
 *
 * Compat: tokens desconhecidos são **mantidos como estão** no texto
 * (não são apagados). Isso preserva os antigos `{{1}}`/`{{2}}` que o
 * operador eventualmente preenche manualmente, e também garante que
 * adicionar variáveis novas no catálogo nunca quebre templates já
 * salvos.
 */

export type InternalTemplateVariableGroup =
  | "Contato"
  | "Negócio"
  | "Atendente"
  | "Agora";

export interface InternalTemplateVariableOption {
  /** Token literal pra inserir no editor (já com `{{ }}`). */
  token: string;
  label: string;
  hint?: string;
  group: InternalTemplateVariableGroup;
}

export const INTERNAL_TEMPLATE_VARIABLE_OPTIONS: InternalTemplateVariableOption[] = [
  // Contato
  {
    token: "{{contato.nome}}",
    label: "Nome do contato",
    hint: "Nome completo cadastrado",
    group: "Contato",
  },
  {
    token: "{{contato.primeiroNome}}",
    label: "Primeiro nome do contato",
    hint: "Só a primeira palavra do nome — ideal para abertura",
    group: "Contato",
  },
  {
    token: "{{contato.telefone}}",
    label: "Telefone do contato",
    group: "Contato",
  },
  {
    token: "{{contato.email}}",
    label: "E-mail do contato",
    group: "Contato",
  },
  {
    token: "{{contato.cpf}}",
    label: "CPF do contato",
    group: "Contato",
  },
  {
    token: "{{contato.tags}}",
    label: "Tags do contato",
    hint: "Lista separada por vírgula",
    group: "Contato",
  },

  // Negócio (deal aberto na conversa)
  {
    token: "{{negocio.titulo}}",
    label: "Título do negócio",
    group: "Negócio",
  },
  {
    token: "{{negocio.valor}}",
    label: "Valor do negócio",
    hint: "Formatado em BRL (ex.: R$ 1.250,00)",
    group: "Negócio",
  },
  {
    token: "{{negocio.estagio}}",
    label: "Estágio atual",
    hint: "Nome da etapa do pipeline",
    group: "Negócio",
  },
  {
    token: "{{negocio.produto}}",
    label: "Produto associado",
    group: "Negócio",
  },
  {
    token: "{{negocio.id}}",
    label: "ID do negócio",
    hint: "Útil para links internos",
    group: "Negócio",
  },

  // Atendente (usuário logado)
  {
    token: "{{atendente.nome}}",
    label: "Nome do atendente",
    hint: "Quem está enviando a mensagem",
    group: "Atendente",
  },
  {
    token: "{{atendente.email}}",
    label: "E-mail do atendente",
    group: "Atendente",
  },

  // Agora (data/hora local)
  {
    token: "{{data}}",
    label: "Data de hoje",
    hint: "Ex.: 29/05/2026",
    group: "Agora",
  },
  {
    token: "{{hora}}",
    label: "Hora atual",
    hint: "Ex.: 14:35",
    group: "Agora",
  },
];

export const INTERNAL_TEMPLATE_VARIABLE_GROUPS: InternalTemplateVariableGroup[] = [
  "Contato",
  "Negócio",
  "Atendente",
  "Agora",
];

// ─────────────────────────────────────────────────────────────────
// Helper de interpolação — usado na hora de injetar o texto no
// composer do inbox (substitui `{{contato.nome}}` pelo nome real
// do contato selecionado, etc.).
// ─────────────────────────────────────────────────────────────────

export interface InternalTemplateContext {
  contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    cpf?: string | null;
    tags?: ReadonlyArray<{ name?: string | null } | string> | null;
  } | null;
  /** Negócio aberto na conversa, se houver (o primeiro do contato). */
  deal?: {
    id?: string | null;
    title?: string | null;
    value?: number | null;
    stageName?: string | null;
    productName?: string | null;
  } | null;
  agent?: {
    name?: string | null;
    email?: string | null;
  } | null;
  /** Permite congelar o "agora" em testes. */
  now?: Date;
}

function formatBRL(n: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function firstName(full: string | null | undefined): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  return parts[0] ?? "";
}

function tagsToString(
  tags: ReadonlyArray<{ name?: string | null } | string> | null | undefined,
): string {
  if (!Array.isArray(tags)) return "";
  return tags
    .map((t) => {
      if (typeof t === "string") return t;
      return t?.name ?? "";
    })
    .filter((s) => s.length > 0)
    .join(", ");
}

const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Substitui tokens dotted-path no `content` usando o `ctx`. Tokens
 * desconhecidos são preservados no texto (compat retroativa com
 * placeholders manuais antigos como `{{1}}`/`{{nome_cliente}}`).
 */
export function interpolateInternalTemplate(
  content: string,
  ctx: InternalTemplateContext,
): string {
  const now = ctx.now ?? new Date();
  const map: Record<string, string> = {
    "contato.nome": ctx.contact?.name ?? "",
    "contato.primeiroNome": firstName(ctx.contact?.name),
    "contato.telefone": ctx.contact?.phone ?? "",
    "contato.email": ctx.contact?.email ?? "",
    "contato.cpf": ctx.contact?.cpf ?? "",
    "contato.tags": tagsToString(ctx.contact?.tags),
    "negocio.id": ctx.deal?.id ?? "",
    "negocio.titulo": ctx.deal?.title ?? "",
    "negocio.valor":
      typeof ctx.deal?.value === "number" ? formatBRL(ctx.deal.value) : "",
    "negocio.estagio": ctx.deal?.stageName ?? "",
    "negocio.produto": ctx.deal?.productName ?? "",
    "atendente.nome": ctx.agent?.name ?? "",
    "atendente.email": ctx.agent?.email ?? "",
    data: now.toLocaleDateString("pt-BR"),
    hora: now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  return content.replace(TOKEN_REGEX, (full, raw: string) => {
    const key = raw.trim();
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      return map[key];
    }
    return full;
  });
}

export function interpolateInternalTemplateAttachments<
  T extends { messageBefore?: string | null },
>(attachments: T[], ctx: InternalTemplateContext): T[] {
  return attachments.map((a) => {
    const raw = a.messageBefore;
    if (typeof raw !== "string" || !raw.trim()) return a;
    return { ...a, messageBefore: interpolateInternalTemplate(raw, ctx) };
  });
}

/** Lista todos os tokens conhecidos pelo catálogo (útil pra validação). */
export function getKnownInternalTemplateTokens(): string[] {
  return INTERNAL_TEMPLATE_VARIABLE_OPTIONS.map((o) => o.token);
}
