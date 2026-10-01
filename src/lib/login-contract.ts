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
 *  - o login não distingue mais "e-mail não verificado" de "credencial
 *    inválida": vem um código único genérico e o próprio servidor reenvia a
 *    verificação quando cabe;
 *  - o `tenant-lookup` deixa de devolver `displayName`, `name` e `status`.
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
  "E-mail ou senha incorretos. Se a conta existir e ainda precisar de verificação, enviamos um novo e-mail.";

export type LoginErrorResolution = {
  message: string;
  /** Contrato antigo: `email_unverified` leva o usuário para `/verify-email`. */
  goToVerifyEmail: boolean;
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
      };
    case "account_locked":
      return {
        message:
          "Conta temporariamente bloqueada por várias tentativas. Aguarde alguns minutos ou peça a um admin para revisar o bloqueio.",
        goToVerifyEmail: false,
      };
    case "mfa_required":
      return {
        message:
          "Esta conta exige MFA. Use o fluxo de código de autenticação (em desenvolvimento no login web).",
        goToVerifyEmail: false,
      };
    case "email_unverified":
      return {
        message: "Confirme seu e-mail para entrar. Enviamos um código de 6 dígitos.",
        goToVerifyEmail: true,
      };
    default:
      // Credenciais inválidas (CredentialsSignin), código genérico do contrato
      // novo ou qualquer código desconhecido: mensagem única.
      return { message: GENERIC_LOGIN_ERROR, goToVerifyEmail: false };
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
