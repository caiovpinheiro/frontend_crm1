/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Fundo animado (canvas/WebGL) e texto animado não interessam ao contrato.
vi.mock("@/components/ui/hero-geometric", () => ({
  HeroGeometric: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/blur-text", () => ({
  BlurText: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { normalizeDisplayName, normalizeTenantOrgs } from "@/lib/login-contract";

import { OrgAccountPicker } from "./org-account-picker";

afterEach(cleanup);

function renderPicker(lookup: { orgs?: unknown; displayName?: unknown }) {
  return render(
    <OrgAccountPicker
      email="pessoa@example.com"
      displayName={normalizeDisplayName(lookup.displayName)}
      orgs={normalizeTenantOrgs(lookup.orgs)}
      onSelect={() => {}}
      onExit={() => {}}
    />,
  );
}

describe("OrgAccountPicker — contrato antigo do tenant-lookup", () => {
  it("mostra nome, selo de status e saudação pelo displayName", () => {
    renderPicker({
      displayName: "Maria Souza",
      orgs: [
        { slug: "acme", name: "Acme Ltda", status: "ACTIVE" },
        { slug: "beta", name: "Beta SA", status: "ARCHIVED" },
      ],
    });
    expect(screen.getByText("Bem-vindo de volta, Maria")).toBeTruthy();
    expect(screen.getByText("Acme Ltda")).toBeTruthy();
    expect(screen.getByText("Beta SA")).toBeTruthy();
    expect(screen.getByText("Ativo")).toBeTruthy();
    expect(screen.getByText("Expirado")).toBeTruthy();
  });
});

describe("OrgAccountPicker — contrato novo (sem displayName, name e status)", () => {
  it("não quebra, não mostra \"undefined\" e não inventa selo de status", () => {
    const { container } = renderPicker({ orgs: [{ slug: "acme" }, { slug: "beta" }] });
    // Sem displayName: saúda pela parte local do e-mail que a própria pessoa digitou.
    expect(screen.getByText("Bem-vindo de volta, pessoa")).toBeTruthy();
    // Sem name: cai no slug.
    expect(screen.getByText("acme")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.queryByText("Ativo")).toBeNull();
    expect(screen.queryByText("Expirado")).toBeNull();
    expect(container.textContent).not.toMatch(/undefined|null/);
  });
});
