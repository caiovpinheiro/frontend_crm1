/**
 * PREVIEW MODE
 *
 * Bypass de autenticação para ambientes de preview do v0.dev / sandbox onde
 * cookies cross-origin são bloqueados (cookies `__Host-` / `__Secure-` com
 * `SameSite=Lax` só persistem no domínio que os emite — produção).
 *
 * Em produção NUNCA deve estar ligado — fazendo isso, qualquer um navega
 * todas as telas sem login.
 *
 * ## Como liga (SEC-13 / SEC-21)
 *
 *  - Fora de produção (`NODE_ENV !== "production"`): basta
 *    `NEXT_PUBLIC_PREVIEW_MODE=true`.
 *  - Em produção (`NODE_ENV === "production"`, ou seja, `next build` +
 *    `next start`): `NEXT_PUBLIC_PREVIEW_MODE=true` SOZINHO É IGNORADO.
 *    É preciso a segunda chave explícita
 *    `NEXT_PUBLIC_PREVIEW_MODE_ALLOW_PRODUCTION_BUILD=true`.
 *    Motivo: uma env var copiada por engano para o deploy real não pode
 *    abrir o CRM inteiro sem login nem emitir sessão assinada com o
 *    `AUTH_SECRET` real (`/api/preview-login`). Um sandbox do v0 que rode o
 *    build de produção precisa configurar as DUAS.
 *  - Fallback por host (`*.v0.dev` etc.) só vale fora de produção: em produção
 *    o header `Host` pode ser encaminhado arbitrariamente pelo proxy.
 *
 * As leituras de `process.env.X` abaixo são LITERAIS de propósito: o Next
 * inlina `process.env.NODE_ENV` e `process.env.NEXT_PUBLIC_*` em build time
 * (client e middleware). Passar `process.env` como objeto quebraria isso.
 *
 * Usado por:
 *  - middleware.ts (libera todas as rotas)
 *  - app/api/preview-login/route.ts (emite sessão fake)
 *  - app/(auth)/login/client-page.tsx (botão "Entrar (preview)" → /dashboard)
 */

/** Sufixos dos domínios de preview do v0.dev. */
const V0_PREVIEW_HOST_SUFFIXES = [
  ".vusercontent.net",
  ".v0.dev",
  ".v0.app",
  ".v0.build",
] as const;

/** Recorte das env vars que decidem o preview mode (testável sem tocar `process.env`). */
export type PreviewEnv = {
  nodeEnv?: string;
  previewMode?: string;
  allowProductionBuild?: string;
};

function readPreviewEnv(): PreviewEnv {
  return {
    nodeEnv: process.env.NODE_ENV,
    // `.trim()`: o painel do v0 às vezes salva "true\n", o que furava o match.
    previewMode: process.env.NEXT_PUBLIC_PREVIEW_MODE,
    allowProductionBuild: process.env.NEXT_PUBLIC_PREVIEW_MODE_ALLOW_PRODUCTION_BUILD,
  };
}

function isTrueFlag(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

/** `NODE_ENV === "production"` (build de produção do Next). */
export function isProductionRuntime(env: PreviewEnv = readPreviewEnv()): boolean {
  return env.nodeEnv === "production";
}

/**
 * Preview habilitado por env var.
 *
 * NÃO liga por NODE_ENV: localhost (`next dev`) também é "development" e
 * precisa bater no backend real. Em produção exige a dupla chave (ver topo).
 */
export function isPreviewEnabledByEnv(env: PreviewEnv = readPreviewEnv()): boolean {
  if (!isTrueFlag(env.previewMode)) return false;
  if (isProductionRuntime(env)) return isTrueFlag(env.allowProductionBuild);
  return true;
}

/** Normaliza um header `Host` / hostname: minúsculas, sem porta. */
function normalizeHostname(host: string | null | undefined): string {
  const raw = (host ?? "").trim().toLowerCase();
  // IPv6 literal com porta: `[::1]:3000` → `[::1]`.
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end === -1 ? raw : raw.slice(0, end + 1);
  }
  return raw.split(":")[0] ?? "";
}

/** `true` para hostnames de preview do v0.dev. NUNCA casa localhost nem produção. */
export function isPreviewHostName(host: string | null | undefined): boolean {
  const hostname = normalizeHostname(host);
  if (!hostname) return false;
  return V0_PREVIEW_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

/** `true` para `localhost` / `*.localhost` / `127.0.0.1` / `[::1]`. */
export function isLocalHostName(host: string | null | undefined): boolean {
  const hostname = normalizeHostname(host);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * Decisão do MIDDLEWARE: pular a checagem de sessão para esta request?
 *
 *  - env (com dupla chave em produção) → sim.
 *  - produção → nunca por host (SEC-21: `Host` não é confiável atrás do proxy).
 *  - fora de produção → host de preview do v0.
 */
export function shouldBypassAuthForPreview(
  host: string | null | undefined,
  env: PreviewEnv = readPreviewEnv(),
): boolean {
  if (isPreviewEnabledByEnv(env)) return true;
  if (isProductionRuntime(env)) return false;
  return isPreviewHostName(host);
}

/**
 * Decisão de `GET /api/preview-login` (SEC-13).
 *
 *  - "allow": emite a sessão fake.
 *  - "not-found": produção sem a dupla chave → a rota se comporta como se
 *    não existisse (404), independentemente do `Host`.
 *  - "forbidden": fora de produção, mas o host não é de preview nem local.
 */
export function previewLoginDecision(
  host: string | null | undefined,
  env: PreviewEnv = readPreviewEnv(),
): "allow" | "forbidden" | "not-found" {
  if (isPreviewEnabledByEnv(env)) return "allow";
  if (isProductionRuntime(env)) return "not-found";
  return isPreviewHostName(host) || isLocalHostName(host) ? "allow" : "forbidden";
}

export function isPreviewMode(): boolean {
  // 1) Via env var explícita (build/runtime), com dupla chave em produção.
  if (isPreviewEnabledByEnv()) {
    return true;
  }
  // 2) Fallback CLIENT por hostname do v0. CRÍTICO: sem isto, TODO o app
  //    (mocks, sessão fake, hooks v2) ficaria desligado no preview do v0 quando
  //    a env var não é inlinada no build — aí você "entra" mas é tratado como
  //    deslogado e volta pro login. NUNCA casa localhost nem produção.
  return isV0PreviewHost();
}

/**
 * Fallback CLIENT-ONLY: detecta os domínios de preview do v0.dev pelo hostname.
 *
 * Por quê: `NEXT_PUBLIC_PREVIEW_MODE` é inlinado em BUILD time. O sandbox do v0
 * às vezes injeta a var só no runtime, então o bundle do client fica com
 * `undefined` mesmo a variável "estando lá" — o middleware (que lê em runtime)
 * libera as rotas, mas o botão "Entrar (preview)" não renderiza.
 *
 * Esta checagem NUNCA casa `localhost`/`127.0.0.1` nem o domínio de produção
 * (Easypanel), então é seguro: só liga o botão dentro do próprio v0.dev.
 * Aqui `window.location.hostname` é o host REAL do browser (não um header
 * forjável), por isso não passa pela restrição de produção do middleware.
 *
 * IMPORTANTE: usar apenas no client, dentro de `useEffect`/após mount, para não
 * gerar hydration mismatch (no SSR `window` é undefined).
 */
export function isV0PreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  return isPreviewHostName(window.location.hostname);
}

/** User mockado retornado quando preview mode está ativo. */
export const PREVIEW_USER = {
  id: "u-demo-gestor",
  name: "Gestor Demo",
  email: "gestor.demo@example.com",
  role: "OWNER" as const,
  organizationId: "preview-org",
  isSuperAdmin: false,
};
