/** @vitest-environment jsdom */
/**
 * Bloco "Enviar para empresa": escolhe empresa e grupo, alterna para a
 * principal do negócio, todos os grupos e assinatura; card e saídas.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiUrl: (p: string) => p }));
vi.mock("@/features/directory-v2/hooks", () => ({
  useCompanies: () => ({ isLoading: false, data: { items: [{ id: "c1", name: "Cacau Lopes", city: "São Paulo", state: "SP" }] } }),
}));

import { CompanyGroupInlineConfig } from "../send-company-group-config";
import { defaultStepConfig, isStepIncomplete, summarizeCompanyGroupStep } from "@/lib/automation-workflow";
import { outputsFromStepConfig } from "@/lib/flow-step-adapter";

function renderCfg(config: Record<string, unknown>) {
  const onChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CompanyGroupInlineConfig
        config={config}
        onChange={onChange}
        textEditor={<textarea aria-label="texto" />}
        mediaEditor={<div>upload</div>}
        captionEditor={<textarea aria-label="legenda" />}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [
          { id: "g1", name: "RH Cacau", connected: true },
          { id: "g2", name: "Vagas Cacau", connected: false },
        ],
      }),
    ),
  );
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompanyGroupInlineConfig", () => {
  it("escolher empresa grava id e nome e limpa o grupo", () => {
    const onChange = renderCfg(defaultStepConfig("send_company_group"));
    fireEvent.click(screen.getByText("Cacau Lopes"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c1", companyName: "Cacau Lopes", groupId: "", groupName: "" }),
    );
  });

  it("com empresa: lista os grupos e oferece todos os grupos (N)", async () => {
    const onChange = renderCfg({ ...defaultStepConfig("send_company_group"), companyId: "c1", companyName: "Cacau Lopes" });
    expect(await screen.findByText("Enviar em todos os grupos da empresa (2)")).toBeTruthy();
    expect(h.fetch).toHaveBeenCalledWith("/api/companies/c1/whatsapp-groups");
    fireEvent.click(screen.getByRole("checkbox", { name: /todos os grupos/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ allGroups: true }));
  });

  it("principal do negócio não busca grupos e explica o padrão", async () => {
    renderCfg({ ...defaultStepConfig("send_company_group"), companyMode: "deal_primary" });
    expect(screen.getByText("Desmarcado: só o grupo vinculado por último.")).toBeTruthy();
    await waitFor(() => expect(h.fetch).not.toHaveBeenCalled());
  });

  it("alterna para a principal e liga a assinatura", () => {
    const onChange = renderCfg(defaultStepConfig("send_company_group"));
    fireEvent.click(screen.getByRole("radio", { name: /Principal do negócio/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ companyMode: "deal_primary" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Assinar como/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ signatureEnabled: true }));
  });

  it("mídia mostra o upload e a legenda", () => {
    renderCfg({ ...defaultStepConfig("send_company_group"), contentType: "media", mediaType: "image" });
    expect(screen.getByText("upload")).toBeTruthy();
    expect(screen.getByLabelText("legenda")).toBeTruthy();
  });
});

describe("passo send_company_group", () => {
  it("saídas: próximo passo e erro no envio", () => {
    expect(outputsFromStepConfig("send_company_group", {}).map((o) => o.key)).toEqual(["next", "failure"]);
  });

  it("resumo do card", () => {
    expect(
      summarizeCompanyGroupStep({ companyName: "Cacau Lopes", groupName: "RH Cacau", content: "Oi\nlinha 2" }),
    ).toBe("Cacau Lopes · RH Cacau — Oi");
    expect(summarizeCompanyGroupStep({ companyMode: "deal_primary", allGroups: true, contentType: "media" })).toBe(
      "★ Empresa principal do negócio · todos os grupos — 📎 mídia",
    );
  });

  it("incompleto sem empresa/grupo ou sem conteúdo", () => {
    const base = defaultStepConfig("send_company_group");
    expect(isStepIncomplete("send_company_group", base)).toBe(true);
    expect(isStepIncomplete("send_company_group", { ...base, companyId: "c1", groupId: "g1", content: "Oi" })).toBe(false);
    expect(isStepIncomplete("send_company_group", { ...base, companyMode: "deal_primary", content: "Oi" })).toBe(false);
    expect(isStepIncomplete("send_company_group", { ...base, companyMode: "deal_primary", contentType: "media" })).toBe(true);
  });
});
