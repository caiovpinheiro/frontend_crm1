/** @vitest-environment jsdom */
/**
 * "Trocar de organização" — cliente: normalização da lista, ticket →
 * `update({ orgSwitch })`, destino por ambiente (subdomínio × host único),
 * limpeza dos caches da org anterior e aviso entre abas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyOrgSwitch,
  clearOrgScopedStorage,
  completeOrgSwitch,
  normalizeSwitchableOrganizations,
  ORG_SWITCH_STORAGE_KEY,
  orgDashboardUrl,
  orgSwitchCredentialStep,
  requestOrgSwitch,
  resolveOrgDashboardUrl,
  watchOrgSwitchInOtherTabs,
} from "@/lib/org-switch";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("normalizeSwitchableOrganizations", () => {
  it("normaliza, descarta itens inválidos/duplicados e nunca inventa `current`/`linked`", () => {
    const out = normalizeSwitchableOrganizations({
      currentOrganizationId: "orgA",
      organizations: [
        { organizationId: "orgA", slug: "acme", name: "Acme", role: "ADMIN", current: true, linked: true },
        { organizationId: "orgB", slug: "beta", current: "sim", linked: 1 },
        { organizationId: "orgB", slug: "beta-dup" },
        { slug: "sem-id" },
        null,
      ],
    });
    expect(out.currentOrganizationId).toBe("orgA");
    expect(out.organizations).toEqual([
      { organizationId: "orgA", slug: "acme", name: "Acme", logoUrl: null, role: "ADMIN", current: true, linked: true },
      { organizationId: "orgB", slug: "beta", name: "beta", logoUrl: null, role: "MEMBER", current: false, linked: false },
    ]);
    expect(normalizeSwitchableOrganizations(null)).toEqual({ currentOrganizationId: null, organizations: [] });
  });
});

describe("orgDashboardUrl", () => {
  it("host único (dev/EasyPanel): mesma origem", () => {
    expect(orgDashboardUrl("beta", { host: "localhost:3000", origin: "http://localhost:3000" })).toBe(
      "http://localhost:3000/dashboard",
    );
    expect(
      orgDashboardUrl("beta", {
        host: "crm-dev-frontend.ca31ey.easypanel.host",
        origin: "https://crm-dev-frontend.ca31ey.easypanel.host",
      }),
    ).toBe("https://crm-dev-frontend.ca31ey.easypanel.host/dashboard");
  });

  it("produção: subdomínio da org de destino", () => {
    vi.stubEnv("NEXT_PUBLIC_TENANT_BASE_DOMAIN", "bwipo.com");
    vi.stubEnv("NEXT_PUBLIC_TENANT_PROTOCOL", "https");
    expect(orgDashboardUrl("beta", { host: "acme.bwipo.com", origin: "https://acme.bwipo.com" })).toBe(
      "https://beta.bwipo.com/dashboard",
    );
  });
});

describe("resolveOrgDashboardUrl (APK)", () => {
  it("no app nativo fica no host do app (allowNavigation), nunca vai ao subdomínio", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm-dev-frontend.ca31ey.easypanel.host/");
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    expect(resolveOrgDashboardUrl("beta")).toBe("https://crm-dev-frontend.ca31ey.easypanel.host/dashboard");
  });
});

describe("requestOrgSwitch", () => {
  it("envia só organizationId + credenciais e devolve o ticket", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, organization: { id: "orgB", slug: "beta", name: "Beta" }, orgSwitch: { token: "tk", expiresInSec: 60 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const grant = await requestOrgSwitch({ organizationId: "orgB", password: "s" });
    expect(grant).toEqual({ ticket: "tk", organization: { id: "orgB", slug: "beta", name: "Beta" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/me/organizations/switch");
    expect(JSON.parse(String(init.body))).toEqual({ organizationId: "orgB", password: "s" });
  });

  it("erro do backend vira ApiError com o code (passo de credencial)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "Informe o MFA.", code: "mfa_required" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(requestOrgSwitch({ organizationId: "orgB", password: "s" })).rejects.toMatchObject({
      status: 403,
      code: "mfa_required",
    });
    expect(orgSwitchCredentialStep("password_required")).toBe("password");
    expect(orgSwitchCredentialStep("invalid_credentials")).toBe("password");
    expect(orgSwitchCredentialStep("mfa_invalid")).toBe("mfa");
    expect(orgSwitchCredentialStep("organization_unavailable")).toBeNull();
  });
});

describe("applyOrgSwitch", () => {
  it("entrega SÓ o ticket ao update() e confirma pela org da sessão devolvida", async () => {
    const update = vi.fn(async () => ({ user: { id: "uB", organizationId: "orgB" } }));
    expect(await applyOrgSwitch(update, "tk", "orgB")).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ orgSwitch: "tk" });
  });

  it("sessão continuou na org atual (ticket recusado): false, sem nova tentativa", async () => {
    const update = vi.fn(async () => ({ user: { id: "uA", organizationId: "orgA" } }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ user: { organizationId: "orgA" } }))),
    );
    expect(await applyOrgSwitch(update, "tk", "orgB")).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("update() sem retorno (provider ocupado): confere lendo a sessão", async () => {
    const update = vi.fn(async () => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ user: { organizationId: "orgB" } }))),
    );
    expect(await applyOrgSwitch(update, "tk", "orgB")).toBe(true);
  });
});

describe("caches e abas", () => {
  it("apaga só os caches ligados à org anterior", () => {
    window.localStorage.setItem("crm:sidebar-prefs-items", "[]");
    window.localStorage.setItem("crm:org-brand", "{}");
    window.localStorage.setItem("crm:pipeline:last-selected:v1", "p1");
    window.localStorage.setItem("crm:pipeline:flow:last-stage:v1:p1", "s1");
    window.localStorage.setItem("crm:list-view", "cards");
    window.sessionStorage.setItem("crm:dash-manager-up", "1");
    clearOrgScopedStorage();
    expect(window.localStorage.getItem("crm:sidebar-prefs-items")).toBeNull();
    expect(window.localStorage.getItem("crm:org-brand")).toBeNull();
    expect(window.localStorage.getItem("crm:pipeline:last-selected:v1")).toBeNull();
    expect(window.localStorage.getItem("crm:pipeline:flow:last-stage:v1:p1")).toBeNull();
    expect(window.sessionStorage.getItem("crm:dash-manager-up")).toBeNull();
    // Preferência do aparelho fica.
    expect(window.localStorage.getItem("crm:list-view")).toBe("cards");
  });

  it("completeOrgSwitch: limpa, avisa as outras abas e navega para o /dashboard da org nova", () => {
    window.localStorage.setItem("crm:org-brand", "{}");
    const navigate = vi.fn();
    completeOrgSwitch({ id: "orgB", slug: "beta" }, navigate);
    expect(window.localStorage.getItem("crm:org-brand")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(ORG_SWITCH_STORAGE_KEY) ?? "{}")).toMatchObject({
      organizationId: "orgB",
      slug: "beta",
    });
    // jsdom = localhost → host único.
    expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/dashboard`);
  });

  it("outra aba trocou de org: esta aba vai para o dashboard da org nova (e ignora aviso da própria org)", () => {
    const navigate = vi.fn();
    let current = "orgA";
    const stop = watchOrgSwitchInOtherTabs(() => current, navigate);
    try {
      const fire = (value: string | null, key = ORG_SWITCH_STORAGE_KEY) =>
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
      fire("lixo");
      fire(JSON.stringify({ at: 1, organizationId: "orgB", slug: "beta" }), "outra-chave");
      expect(navigate).not.toHaveBeenCalled();

      fire(JSON.stringify({ at: 1, organizationId: "orgB", slug: "beta" }));
      expect(navigate).toHaveBeenCalledWith(`${window.location.origin}/dashboard`);

      navigate.mockClear();
      current = "orgB";
      fire(JSON.stringify({ at: 2, organizationId: "orgB", slug: "beta" }));
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
