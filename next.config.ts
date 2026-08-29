import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Lê `public/app-revision.json` (gerado por `scripts/generate-app-revision.mjs`
 * em predev/prebuild) e embute o fingerprint do build em `NEXT_PUBLIC_BUILD_ID`.
 * Usado pelo `MobileAppUpdateDialog` para detectar deploys novos comparando
 * contra `/api/app-revision` — ver esse componente para detalhes.
 */
function readAppRevision(): { revision: string; builtAt: string | null } {
  try {
    const raw = readFileSync(path.join(__dirname, "public", "app-revision.json"), "utf8");
    const parsed = JSON.parse(raw) as { revision?: string; builtAt?: string };
    return {
      revision: parsed.revision?.trim() || process.env.BUILD_ID || "dev",
      builtAt: parsed.builtAt ?? null,
    };
  } catch {
    return { revision: process.env.BUILD_ID || "dev", builtAt: null };
  }
}

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Navegação/RSC no SW (pages-rsc) + hard refresh = tela de erro
  // com APIs 200. Prefetch do rail já é prefetch={false}; o SW não
  // deve cachear documento nem payload RSC.
  cacheOnNavigation: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV !== "production",
  exclude: [
    /\.map$/,
    /^manifest.*\.js$/,
    /\/api\//,
    /\/_next\/data\//,
    /inbox[\\/]page/,
    /contacts[\\/]page/,
    /companies[\\/]page/,
    /automations[\\/]page/,
    /campaigns[\\/]page/,
    /activities[\\/]page/,
    /email[\\/]page/,
    /rely[\\/]page/,
    /dashboard[\\/]page/,
  ],
});

function securityHeaders(): { key: string; value: string }[] {
  const headers: { key: string; value: string }[] = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "payment=(), usb=(), geolocation=()",
    },
  ];
  const url = process.env.NEXTAUTH_URL ?? "";
  if (process.env.NODE_ENV === "production" && url.startsWith("https://")) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}

function backendBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

const appRevision = readAppRevision();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  env: {
    // Versão exibida pelo banner "Novidades em vX.Y.Z". Setar APP_VERSION
    // no ambiente de build (Easypanel) para alinhar com o CHANGELOG.md.
    NEXT_PUBLIC_APP_VERSION: process.env.APP_VERSION ?? "1.4.0",
    // Fingerprint único do build (sha/timestamp), usado pelo
    // MobileAppUpdateDialog para detectar deploys — NÃO confundir com
    // NEXT_PUBLIC_APP_VERSION (semver, usado pelo banner desktop).
    NEXT_PUBLIC_BUILD_ID: appRevision.revision,
    NEXT_PUBLIC_BUILD_TIME: appRevision.builtAt ?? "",
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Uploads de mídia e relatório de matriculados (até ~32MB + overhead).
    serverActions: {
      bodySizeLimit: "64mb",
    },
    middlewareClientMaxBodySize: "64mb",
  },
  /**
   * REWRITES — Frontend separado.
   *
   * O frontend NÃO tem rotas /api/* próprias (exceto /api/preview-login),
   * todas as chamadas /api/* são repassadas pro backend via rewrite. Isso
   * evita que código copiado do monolito quebre só por causa de URLs
   * absolutas e mantém os cookies de auth no mesmo origin do frontend.
   *
   * Usamos `afterFiles` para que o Next.js verifique o filesystem local
   * ANTES de aplicar o rewrite. Assim /api/preview-login (rota Next.js
   * local do frontend) é servida localmente, e tudo mais é proxiado para
   * o backend sem precisar de regex de exclusão.
   *
   * Lista de rewrites (afterFiles):
   *   - /api/:path*          → backend (CATCH-ALL via parâmetro nomeado)
   *   - /uploads/:path*      → backend (servir mídias armazenadas no backend)
   */
  async rewrites() {
    const base = backendBase();
    if (!base) return [];
    return {
      beforeFiles: [],
      afterFiles: [
        // afterFiles ganha de App Router em `/api/*`. Sem isto, o POST de
        // permissão de voz ia pro backend (rota inexistente) e o Traefik
        // devolvia 502 HTML. Destino fora de `/api/` = handler local.
        {
          source: "/api/wa-call-permission",
          destination: "/wa-call-permission",
        },
        {
          source: "/api/wa-whatsapp-call",
          destination: "/wa-whatsapp-call",
        },
        { source: "/api/:path*", destination: `${base}/api/:path*` },
        { source: "/uploads/:path*", destination: `${base}/api/uploads/:path*` },
        { source: "/cockpit-agente.html", destination: `${base}/cockpit-agente.html` },
      ],
      fallback: [],
    };
  },
  /**
   * REDIRECTS — Migração v1 (/old/*) e v2 (/v2/*) → raiz.
   *
   * Ordem: rotas ESPECÍFICAS antes do catch-all genérico. Dois casos
   * especiais exigem mapeamento explícito (nome mudou):
   *   - /old/tasks → /activities
   *   - /old/leads → /pipeline
   * O resto segue o padrão /:path* → /:path*.
   */
  async redirects() {
    return [
      // ── v2 legacy (segmento /v2/* virou raiz) ──────────────────────
      { source: "/team-chat", destination: "/rely", permanent: false },
      { source: "/orbita", destination: "/rely", permanent: false },
      { source: "/v2", destination: "/dashboard", permanent: true },
      { source: "/v2/:path*", destination: "/:path*", permanent: true },

      // ── v1 legacy (/old/*) — específicos com nome diferente ────────
      { source: "/old/tasks", destination: "/activities", permanent: true },
      {
        source: "/old/leads",
        destination: "/pipeline",
        permanent: true,
      },
      {
        source: "/old/leads/:id",
        destination: "/pipeline/:id",
        permanent: true,
      },
      {
        source: "/old/analytics/inbox",
        destination: "/analytics/inbox",
        permanent: true,
      },

      // ── v1 legacy — mapeamento direto (/:path*) ────────────────────
      { source: "/old", destination: "/dashboard", permanent: true },
      { source: "/old/:path*", destination: "/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

export default withSerwist(nextConfig);
