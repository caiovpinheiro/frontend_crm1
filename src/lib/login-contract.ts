/**
 * Contrato do login com o backend — tolerante às DUAS versões.
 *
 * Antigo (ainda em produção):
 *  - `signIn` devolve códigos específicos, entre eles `email_unverified`
 *    (o front redireciona para `/verify-email`);
 *  - `POST /api/auth/tenant-lookup` devolve `displayName` e, por org,
 *    `name` e `status`.
 *
 * Novo (correção do pentest — enumeração de contas):
 *  - códigos do login: `credentials`, `account_locked`, `rate_limited`,
 *    `mfa_required`, `mfa_invalid`, `database_unavailable`. Não existe mais
 *    `email_unverified`: conta sem verificação responde `credentials` e o
 *    próprio servidor reenvia o código — a tela só OFERECE o link para
 *    `/verify-email`, sem redirecionar sozinha;
 *  - `tenant-lookup`: 200 `{ ok, slug, apex, orgs: [{ slug, name, status }] }`
 *    sem `displayName` (`name` vem igual ao slug e `status` sempre "ACTIVE" —
 *    só o `slug` é confiável), 404 `{ ok: false }` e 429
 *    `{ ok: false, error: "rate_limit_exceeded" }` com `Retry-After`.
 *
 * Helpers puros (sem React/Next) para serem testados em vitest (node).
 */

/** Organização devolvida pelo `tenant-lookup`, já normalizada. */
export type TenantOrgChoice = {
  slug: string;
  /** Nome de exibição; cai no `slug` quando o backend não envia. */
  name: string;
  /** `null` quando o backend não informa o status (contrato novo). */
  status: string | null;
};

/** Mensagem única para código genérico ou desconhecido (não revela se a conta existe). */
export const GENERIC_LOGIN_ERROR =
  "E-mail ou senha incorretos. Se a sua conta ainda precisa de confirmação, enviamos um novo código para o seu e-mail.";

export type LoginErrorResolution = {
  message: string;
  /** Contrato antigo: `email_unverified` leva o usuário para `/verify-email`. */
  goToVerifyEmail: boolean;
  /**
   * Contrato novo: junto da mensagem genérica vai um link para
   * `/verify-email` (sem redirecionar — a tela não sabe se a conta existe).
   */
  offerVerifyEmailLink: boolean;
};

/**
 * Traduz o `code` do `signIn` em mensagem. Códigos antigos continuam
 * tratados; qualquer outro (inclusive ausente) cai na mensagem genérica.
 */
export function resolveLoginError(code: string | null | undefined): LoginErrorResolution {
  switch (code) {
    case "database_unavailable":
      return {
        message:
          "Não foi possível conectar ao banco de dados. Inicie o PostgreSQL (ex.: docker compose up -d) e confira o DATABASE_URL no .env.",
        goToVerifyEmail: false,
        offerVerifyEmailLink: false,
      };
    case "account_locked":
      return {
        message:
          "Conta temporariamente bloqueada por várias tentativas. Aguarde alguns minutos ou peça a um admin para revisar o bloqueio.",
        goToVerifyEmail: false,
        offerVerifyEmailLink: false,
      };
    case "mfa_required":
      return {
        message:
          "Esta conta exige MFA. Use o fluxo de código de autenticação (em desenvolvimento no login web).",
        goToVerifyEmail: false,
        offerVerifyEmailLink: false,
      };
    case "rate_limited":
      return {
        message: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
        goToVerifyEmail: false,
        offerVerifyEmailLink: false,
      };
    case "mfa_invalid":
      return {
        message: "Código de autenticação (MFA) inválido. Confira o código e tente novamente.",
        goToVerifyEmail: false,
        offerVerifyEmailLink: false,
      };
    case "email_unverified":
      // Só o backend antigo (ainda em produção) emite este código.
      return {
        message: "Confirme seu e-mail para entrar. Enviamos um código de 6 dígitos.",
        goToVerifyEmail: true,
        offerVerifyEmailLink: false,
      };
    default:
      // `credentials` (contrato novo), CredentialsSignin ou qualquer código
      // desconhecido: mensagem única + link para confirmar o e-mail.
      return { message: GENERIC_LOGIN_ERROR, goToVerifyEmail: false, offerVerifyEmailLink: true };
  }
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normaliza `orgs` do `tenant-lookup`: aceita `{ slug, name, status }`
 * (antigo), `{ slug }` ou só o slug (novo) e ignora entradas sem `slug`.
 * Nunca devolve `undefined` em `name`.
 */
export function normalizeTenantOrgs(raw: unknown): TenantOrgChoice[] {
  if (!Array.isArray(raw)) return [];
  const out: TenantOrgChoice[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const entry: unknown = typeof item === "string" ? { slug: item } : item;
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const slug = nonEmptyString(rec.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      name: nonEmptyString(rec.name) ?? slug,
      status: nonEmptyString(rec.status),
    });
  }
  return out;
}

/** `displayName` do `tenant-lookup`; `null` quando ausente/vazio/não-string. */
export function normalizeDisplayName(raw: unknown): string | null {
  return nonEmptyString(raw);
}

/**
 * A org pode ser escolhida? Com status informado, só `ACTIVE`. Sem status
 * (contrato novo) deixa seguir — quem recusa org expirada é o backend, no login.
 */
export function isOrgSelectable(org: Pick<TenantOrgChoice, "status">): boolean {
  return org.status === null || org.status === "ACTIVE";
}

/** Link de confirmação de e-mail oferecido junto da mensagem genérica. */
export function verifyEmailHref(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim();
  return trimmed ? `/verify-email?email=${encodeURIComponent(trimmed)}` : "/verify-email";
}

/** Espera sugerida pelo `Retry-After` (em segundos), em texto; `null` se ausente/inválido. */
function retryAfterText(retryAfter: string | null | undefined): string | null {
  const seconds = Number((retryAfter ?? "").trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.ceil(seconds)} segundo(s)`;
  return `${Math.ceil(seconds / 60)} minuto(s)`;
}

/**
 * Mensagem quando o `tenant-lookup` não devolve `ok`.
 * 429 (limite de tentativas) tem texto próprio — não é "conta não encontrada".
 */
export function tenantLookupFailureMessage(
  status: number,
  retryAfter?: string | null,
): string {
  if (status === 429) {
    const wait = retryAfterText(retryAfter);
    return wait
      ? `Muitas tentativas. Aguarde ${wait} e tente novamente.`
      : "Muitas tentativas. Aguarde um pouco e tente novamente.";
  }
  return "Não encontramos uma conta com este e-mail.";
}
