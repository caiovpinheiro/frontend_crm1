import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shouldVerifyTenantExistence } from "../tenant-existence";

// Sem sessão: o cenário do atacante anônimo.
vi.mock("next-auth/jwt", () => ({ getToken: async () => null }));

/**
 * Pentest: `https://{slug}.<base>/api/*` respondia 404 HTML para subdomínio
 * inexistente e 401 JSON para existente — dava para enumerar organizações.
 * Aqui o middleware roda de verdade, com o backend (`by-slug`) simulado.
 */

const EXISTING = "org-existente";
const MISSING = "org-inexistente";

const backendFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  const slug = url.searchParams.get("slug");
  return new Response(JSON.stringify({ ok: slug === EXISTING }), {
    status: slug === EXISTING ? 200 : 404,
    headers: { "Content-Type": "application/json" },
  });
});

async function run(slug: string, path: string) {
  const { middleware } = await import("@/middleware");
  const host = `${slug}.bwipo.test`;
  const res = await middleware(
    new NextRequest(`https://${host}${path}`, { headers: { host } }),
  );
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    body: await res.text(),
    // Nome dos cookies e valores, trocando o slug para comparar as duas respostas.
    cookies: res.headers
      .getSetCookie()
      .map((c) => c.split(slug).join("{slug}"))
      .sort(),
    headers: [...res.headers.keys()].filter((k) => k !== "set-cookie").sort(),
  };
}

describe("middleware — enumeração de subdomínios", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TENANT_BASE_DOMAIN", "bwipo.test");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://backend.test");
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    vi.stubEnv("AUTH_SECRET", "segredo-de-teste");
    backendFetch.mockClear();
    vi.stubGlobal("fetch", backendFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(["/api/deals", "/api/contacts?page=1", "/api/users/me", "/api/rota-que-nao-existe"])(
    "%s: resposta idêntica para subdomínio existente e inexistente",
    async (path) => {
      const existing = await run(EXISTING, path);
      const missing = await run(MISSING, path);

      expect(missing).toEqual(existing);
      expect(existing.status).toBe(401);
      expect(existing.contentType).toMatch(/application\/json/);
      expect(existing.body).not.toContain(EXISTING);
      // Nem consulta o backend: não há diferença de tempo nem cookie de "verificado".
      expect(backendFetch).not.toHaveBeenCalled();
      expect(existing.cookies.join(";")).not.toContain("tenant_verified");
    },
  );

  it("rotas públicas de /api/auth seguem para o backend do mesmo jeito nos dois casos", async () => {
    const existing = await run(EXISTING, "/api/auth/session");
    const missing = await run(MISSING, "/api/auth/session");
    expect(missing).toEqual(existing);
    expect(backendFetch).not.toHaveBeenCalled();
  });

  it("páginas HTML continuam mostrando \"organização não encontrada\" (404) só para slug inexistente", async () => {
    const missing = await run(MISSING, "/login");
    expect(missing.status).toBe(404);
    expect(missing.contentType).toMatch(/text\/html/);

    const existing = await run(EXISTING, "/login");
    expect(existing.status).toBe(200);
    expect(backendFetch).toHaveBeenCalledTimes(2);
  });
});

describe("shouldVerifyTenantExistence", () => {
  it("nunca verifica em /api/* nem em assets do Next", () => {
    for (const p of ["/api", "/api/deals", "/api/organization/by-slug", "/api/health", "/_next/static/x.js"]) {
      expect(shouldVerifyTenantExistence(p)).toBe(false);
    }
  });

  it("verifica em páginas (inclusive as que só começam parecido com /api)", () => {
    for (const p of ["/", "/login", "/dashboard", "/apidocs", "/api-keys"]) {
      expect(shouldVerifyTenantExistence(p)).toBe(true);
    }
  });
});
