/** @vitest-environment jsdom */
/**
 * Seletor "Trocar de organização": destaca a org atual, troca direto as
 * vinculadas, pede senha (e MFA) na primeira vinculação e, em qualquer
 * erro, mantém a sessão atual (não navega).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  completeOrgSwitch: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "authenticated", update: h.update }),
}));
vi.mock("@/lib/org-switch", async (orig) => {
  const real = await orig<typeof import("@/lib/org-switch")>();
  return { ...real, completeOrgSwitch: h.completeOrgSwitch };
});

import { OrgSwitcherDialog } from "@/components/crm/org-switcher-dialog";

const LIST = {
  currentOrganizationId: "orgA",
  organizations: [
    { organizationId: "orgA", slug: "acme", name: "Acme", logoUrl: null, role: "ADMIN", current: true, linked: true },
    { organizationId: "orgB", slug: "beta", name: "Beta", logoUrl: null, role: "MEMBER", current: false, linked: true },
    { organizationId: "orgC", slug: "zeta", name: "Zeta", logoUrl: null, role: "MANAGER", current: false, linked: false },
  ],
};

type Reply = { status: number; body: unknown };
let switchReplies: Reply[] = [];
let switchBodies: unknown[] = [];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function ok(orgId: string, slug: string) {
  return { status: 200, body: { ok: true, organization: { id: orgId, slug, name: slug }, orgSwitch: { token: `tk-${orgId}`, expiresInSec: 60 } } };
}

beforeEach(() => {
  switchReplies = [];
  switchBodies = [];
  h.update.mockReset();
  h.completeOrgSwitch.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/me/organizations/switch")) {
        switchBodies.push(JSON.parse(String(init?.body ?? "{}")));
        const next = switchReplies.shift() ?? { status: 500, body: { message: "erro" } };
        return json(next.status, next.body);
      }
      if (url.includes("/api/me/organizations")) return json(200, LIST);
      if (url.includes("/api/auth/session")) return json(200, { user: { organizationId: "orgA" } });
      return json(404, {});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrgSwitcherDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

async function orgButton(name: string) {
  return (await screen.findByText(name)).closest("button") as HTMLButtonElement;
}

describe("OrgSwitcherDialog", () => {
  it("lista as orgs e destaca a atual (não clicável)", async () => {
    renderDialog();
    const current = await orgButton("Acme");
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(current.disabled).toBe(true);
    expect(screen.getByText("Atual")).toBeTruthy();
    expect(screen.getByText(/Vinculada/)).toBeTruthy();
    expect(screen.getByText(/Requer senha/)).toBeTruthy();
  });

  it("org vinculada: troca sem senha e navega", async () => {
    switchReplies.push(ok("orgB", "beta"));
    h.update.mockResolvedValue({ user: { id: "uB", organizationId: "orgB" } });
    renderDialog();
    fireEvent.click(await orgButton("Beta"));
    await waitFor(() => expect(h.completeOrgSwitch).toHaveBeenCalledWith({ id: "orgB", slug: "beta", name: "beta" }));
    expect(switchBodies).toEqual([{ organizationId: "orgB" }]);
    expect(h.update).toHaveBeenCalledWith({ orgSwitch: "tk-orgB" });
  });

  it("primeira vinculação: pede senha, depois MFA, e só então troca", async () => {
    switchReplies.push(
      { status: 403, body: { message: "Informe o código de autenticação (MFA) desta conta.", code: "mfa_required" } },
      ok("orgC", "zeta"),
    );
    h.update.mockResolvedValue({ user: { id: "uC", organizationId: "orgC" } });
    renderDialog();
    fireEvent.click(await orgButton("Zeta"));

    fireEvent.change(await screen.findByLabelText("Senha"), { target: { value: "segredo" } });
    fireEvent.click(screen.getByText("Entrar").closest("button")!);

    fireEvent.change(await screen.findByLabelText("Código de autenticação"), { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Entrar").closest("button")!);

    await waitFor(() => expect(h.completeOrgSwitch).toHaveBeenCalled());
    expect(switchBodies).toEqual([
      { organizationId: "orgC", password: "segredo" },
      { organizationId: "orgC", password: "segredo", mfaCode: "123456" },
    ]);
  });

  it("senha errada: mostra o erro e não troca", async () => {
    switchReplies.push({ status: 403, body: { message: "Senha incorreta.", code: "invalid_credentials" } });
    renderDialog();
    fireEvent.click(await orgButton("Zeta"));
    fireEvent.change(await screen.findByLabelText("Senha"), { target: { value: "errada" } });
    fireEvent.click(screen.getByText("Entrar").closest("button")!);
    expect(await screen.findByText("Senha incorreta.")).toBeTruthy();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.completeOrgSwitch).not.toHaveBeenCalled();
  });

  it("ticket recusado no update(): avisa e mantém a sessão atual (sem navegar)", async () => {
    switchReplies.push(ok("orgB", "beta"));
    h.update.mockResolvedValue({ user: { id: "uA", organizationId: "orgA" } });
    renderDialog();
    fireEvent.click(await orgButton("Beta"));
    expect(await screen.findByText(/continua na organização atual/)).toBeTruthy();
    expect(h.completeOrgSwitch).not.toHaveBeenCalled();
  });
});
