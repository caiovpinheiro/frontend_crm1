import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { isPreviewMode } from "@/lib/preview-mode";
import {
  resolveTenantFromRequest,
  TENANT_SLUG_COOKIE,
  TENANT_SLUG_HEADER,
  TENANT_VERIFIED_COOKIE,
} from "@/lib/tenant-host";
import { getTenantBaseDomain, getTenantProtocol } from "@/lib/tenant-url";

/**
 * Middleware do FRONTEND separado.
 *
 * Diferente do monólito, aqui NÃO temos rotas /api locais (exceto /api/health
 * super-leve). Tudo de /api/* é repassado via `rewrites()` no next.config.ts
 * pro backend. Por isso este middleware é enxuto:
 *
 *  - Resolve tenant pelo Host (`{slug}.crm.eduit.com.br`) ou override de
 *    dev (`x-tenant-slug` / `{slug}.localhost`).
 *  - Lê o JWT do cookie direto (Edge-friendly, sem `NextAuth(authConfig)`).
 *  - Em subdomínio de org: exige que a sessão pertença ao mesmo slug
 *    (exceto super-admin).
 *  - Aplica headers de segurança em todas as respostas.
 *  - Redireciona pra /login se a sessão estiver vazia em rotas privadas.
 *  - Bloqueia /admin pra quem não é super-admin (esse flag fica no JWT).
 *
 * Por que `getToken` em vez de `auth(...)` do NextAuth?
 *  - O wrapper `NextAuth(config)` no Edge usa `NEXTAUTH_URL` fixo pra
 *    construir a action URL e validar o cookie. Em ambientes onde a barra
 *    de endereço difere de NEXTAUTH_URL (ex.: porta/host alternativos no
 *    Easypanel, healthchecks de proxy), o cookie é tratado como ausente
 *    e o user é mandado pra /login mesmo logado.
 *  - `getToken({ req, secret, secureCookie })` lê o cookie usando o
 *    secret e a flag, sem chamar a URL — funciona consistentemente.
 */

function secureCookieFromEnv(): boolean {
  return (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
}

const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

type AuthFromCookie = {
  user?: {
    id: string;
    isSuperAdmin?: boolean;
    organizationSlug?: string | null;
  };
} | null;

async function readAuthFromRequestCookie(
  req: NextRequest,
): Promise<AuthFromCookie> {
  if (!AUTH_SECRET) return null;
  try {
    const token = await getToken({
      req,
      secret: AUTH_SECRET,
      secureCookie: secureCookieFromEnv(),
    });
    if (!token || typeof token !== "object") return null;
    const rec = token as Record<string, unknown>;
    const id =
      typeof rec.id === "string" ? rec.id : typeof rec.sub === "string" ? rec.sub : null;
    if (!id) return null;
    return {
      user: {
        id,
        isSuperAdmin: Boolean(rec.isSuperAdmin),
        organizationSlug:
          typeof rec.organizationSlug === "string"
            ? rec.organizationSlug
            : null,
      },
    };
  } catch {
    return null;
  }
}

function withSecurityHeaders(res: NextResponse): NextResponse {
  // HSTS só em HTTPS — em HTTP local causaria Mixed Content e bloquearia SSE
  if ((process.env.NEXTAUTH_URL ?? "").startsWith("https://")) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("X-DNS-Prefetch-Control", "on");
  return res;
}

function apexOrigin(req: NextRequest): string {
  const proto = getTenantProtocol();
  const base = getTenantBaseDomain();
  // Em localhost (dev sem wildcard), volta pra mesma origem da request.
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0] ?? "";
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1"
  ) {
    return req.nextUrl.origin;
  }
  return `${proto}://${base}`;
}

function unknownTenantResponse(req: NextRequest, slug: string): NextResponse {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organização não encontrada</title>
  <style>
    body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0b1220;color:#e8eefc}
    main{max-width:28rem;padding:2rem;text-align:center}
    a{color:#7dd3fc}
    code{background:#1e293b;padding:.1rem .35rem;border-radius:.25rem}
  </style>
</head>
<body>
  <main>
    <h1>Organização não encontrada</h1>
    <p>O endereço <code>${slug}</code> não é um workspace válido.</p>
    <p><a href="${apexOrigin(req)}/">Voltar para o início</a></p>
  </main>
</body>
</html>`;
  return withSecurityHeaders(
    new NextResponse(html, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  );
}

function withTenantContext(
  req: NextRequest,
  slug: string | null,
): { requestHeaders: Headers; applyCookies: (res: NextResponse) => NextResponse } {
  const requestHeaders = new Headers(req.headers);
  if (slug) {
    requestHeaders.set(TENANT_SLUG_HEADER, slug);
  } else {
    requestHeaders.delete(TENANT_SLUG_HEADER);
  }
  return {
    requestHeaders,
    applyCookies(res) {
      if (slug) {
        res.cookies.set(TENANT_SLUG_COOKIE, slug, {
          path: "/",
          sameSite: "lax",
          httpOnly: false,
          secure: secureCookieFromEnv(),
        });
      } else {
        res.cookies.delete(TENANT_SLUG_COOKIE);
        res.cookies.delete(TENANT_VERIFIED_COOKIE);
      }
      return res;
    },
  };
}

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/health",
  "/accept-invite",
  "/test-bulk-bar",
  "/dev/campaigns-cards-preview",
  // Cockpit: HTML estático; dados via Bearer token ou sessão CRM.
  "/cockpit-agente.html",
]);

const PUBLIC_API_PATHS = new Set([
  "/api/signup",
  "/api/app-revision",
  "/api/mobile-release",
  "/api/organization/by-slug",
]);

const PWA_PUBLIC_PATHS = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/sw.js.map",
  "/icon",
  "/icon0",
  "/icon1",
  "/icon2",
  "/icon.svg",
  "/icon-maskable.svg",
  "/apple-icon",
  "/api/push/vapid-public",
  "/mobile-release.json",
]);

/** Cookie curto: evita bater no BE a cada request do middleware. */
const TENANT_VERIFIED_MAX_AGE_SEC = 600;

async function verifyTenantSlugExists(
  req: NextRequest,
  slug: string,
  sessionSlug: string | null | undefined,
): Promise<"ok" | "missing" | "skip"> {
  // Sessão da própria org já prova existência ACTIVE no login.
  if (sessionSlug && sessionSlug === slug) return "ok";
  if (req.cookies.get(TENANT_VERIFIED_COOKIE)?.value === slug) return "ok";

  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  // Sem backend configurado (sandbox/misconfig): só validação de formato.
  if (!apiBase) return "skip";

  try {
    const url = `${apiBase}/api/organization/by-slug?slug=${encodeURIComponent(slug)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) return "missing";
    if (!res.ok) return "skip";
    return "ok";
  } catch {
    // BE fora do ar: não derruba o app inteiro — auth/JWT ainda protege dados.
    return "skip";
  }
}

export async function middleware(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;

    // PREVIEW MODE: libera todas as rotas sem checar cookie. Usado pelo
    // sandbox do v0.dev onde cookies cross-origin são bloqueados pelo browser.
    // NUNCA deve estar ativo em produção (qualquer um navega tudo sem login).
    //
    // `isPreviewMode()` no edge não vê `window`, então cobrimos o host do v0
    // lendo o header `host` em RUNTIME (a env var NEXT_PUBLIC_* costuma não
    // estar disponível no build do sandbox). Só casa domínios de preview do v0
    // — nunca localhost nem o domínio de produção (Easypanel).
    const requestHost = (req.headers.get("host") ?? "").toLowerCase();
    const isV0Host =
      requestHost.endsWith(".vusercontent.net") ||
      requestHost.endsWith(".v0.dev") ||
      requestHost.endsWith(".v0.app") ||
      requestHost.endsWith(".v0.build");
    if (isPreviewMode() || isV0Host) {
      return withSecurityHeaders(NextResponse.next());
    }

    // Dev fallback (apex/localhost): header `x-tenant-slug`.
    // Cookie `tenant-slug` NÃO é usado como override — só ecoa o Host atual.
    const tenant = resolveTenantFromRequest({
      hostHeader: req.headers.get("host"),
      overrideSlug: req.headers.get(TENANT_SLUG_HEADER),
    });

    // Slug inválido / multi-label → 404 amigável.
    if (tenant.kind === "unknown") {
      return unknownTenantResponse(req, tenant.slug);
    }

    const tenantSlug = tenant.kind === "tenant" ? tenant.slug : null;
    const { requestHeaders, applyCookies } = withTenantContext(req, tenantSlug);

    // Auth cedo: reutilizado na checagem de existência + mismatch.
    const reqAuth = await readAuthFromRequestCookie(req);

    let cacheTenantVerified = false;
    if (
      tenantSlug &&
      pathname !== "/api/organization/by-slug" &&
      !pathname.startsWith("/_next") &&
      !pathname.startsWith("/api/health")
    ) {
      const existence = await verifyTenantSlugExists(
        req,
        tenantSlug,
        reqAuth?.user?.organizationSlug,
      );
      if (existence === "missing") {
        return unknownTenantResponse(req, tenantSlug);
      }
      if (existence === "ok") cacheTenantVerified = true;
    }

    const finish = (res: NextResponse) => {
      let out = applyCookies(withSecurityHeaders(res));
      if (cacheTenantVerified && tenantSlug) {
        out.cookies.set(TENANT_VERIFIED_COOKIE, tenantSlug, {
          path: "/",
          sameSite: "lax",
          httpOnly: true,
          secure: secureCookieFromEnv(),
          maxAge: TENANT_VERIFIED_MAX_AGE_SEC,
        });
      }
      return out;
    };

    const nextWithTenant = () =>
      finish(NextResponse.next({ request: { headers: requestHeaders } }));

    // Rotas /v2/* são redirecionadas por next.config.ts (redirects) para
    // o path canônico. Liberamos aqui para que o redirect ocorra sem
    // loop de auth — o destino final já exige autenticação normalmente.
    if (pathname.startsWith("/v2") || pathname.startsWith("/old")) {
      return nextWithTenant();
    }

    // Rotas de auth + assets do Next + webhooks + uploads não passam por auth.
    // O rewrite pro backend acontece em next.config.ts.
    if (
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/webhooks") ||
      pathname.startsWith("/api/health") ||
      pathname.startsWith("/api/cron") ||
      pathname.startsWith("/uploads/") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon.ico")
    ) {
      return nextWithTenant();
    }

    if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)) {
      return nextWithTenant();
    }

    if (
      PWA_PUBLIC_PATHS.has(pathname) ||
      pathname.startsWith("/swe-worker-") ||
      pathname.startsWith("/workbox-")
    ) {
      return nextWithTenant();
    }

    if (PUBLIC_PATHS.has(pathname) || PUBLIC_API_PATHS.has(pathname)) {
      return nextWithTenant();
    }

    // Sessão logada em subdomínio de outra org → rejeita (exceto super-admin).
    if (
      tenantSlug &&
      reqAuth?.user &&
      !reqAuth.user.isSuperAdmin &&
      reqAuth.user.organizationSlug &&
      reqAuth.user.organizationSlug !== tenantSlug
    ) {
      if (pathname.startsWith("/api/")) {
        return finish(
          NextResponse.json(
            {
              message: "Sessão não pertence a esta organização.",
              code: "TENANT_MISMATCH",
            },
            { status: 403 },
          ),
        );
      }
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("error", "tenant_mismatch");
      return finish(NextResponse.redirect(loginUrl));
    }

    // Para /api/* (rotas que vão pro backend), permite Bearer token mesmo sem sessão.
    if (
      !reqAuth &&
      pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/sse")
    ) {
      const authHeader = req.headers.get("authorization") ?? "";
      if (/^Bearer\s+.+/i.test(authHeader)) {
        return nextWithTenant();
      }
    }

    if (!reqAuth) {
      // Para /api/* sem sessão, devolve 401 JSON em vez de redirect pro /login.
      // Por que: o fetch dos hooks segue redirects e acaba tentando dar JSON.parse
      // na página de login (HTML), causando o erro
      // `Unexpected token '<', "<!doctype "... is not valid JSON`. Devolver 401
      // JSON deixa o React Query ir direto pro estado de erro com payload tratável.
      if (pathname.startsWith("/api/")) {
        return finish(
          NextResponse.json(
            { message: "Unauthorized", code: "AUTH_REQUIRED" },
            { status: 401 },
          ),
        );
      }
      const loginUrl = new URL("/login", req.nextUrl.origin);
      const fullPath = pathname + (req.nextUrl.search ?? "");
      loginUrl.searchParams.set("callbackUrl", fullPath);
      return finish(NextResponse.redirect(loginUrl));
    }

    const isSuperAdmin = Boolean(reqAuth.user?.isSuperAdmin);

    if (
      (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) &&
      !isSuperAdmin
    ) {
      if (pathname.startsWith("/api/admin")) {
        return finish(
          NextResponse.json(
            { message: "Acesso restrito a administradores da plataforma." },
            { status: 403 },
          ),
        );
      }
      return finish(NextResponse.redirect(new URL("/", req.nextUrl.origin)));
    }

    return nextWithTenant();
  } catch {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }
}

export const config = {
  // api/uploads e academic-records/upload ficam fora do matcher: multipart
  // grande não deve passar pelo buffer do middleware; auth no backend.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/uploads|api/academic-records/upload|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
