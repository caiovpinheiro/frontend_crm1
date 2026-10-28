/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebchatS2SSection, callbackUrlProblem, isIncompleteRule } from "../s2s-section";
import { defaultWebchatV2Config, type WebchatV2Config } from "../v2-config";

const SECRETS = {
  identity: { configured: false, rotatedAt: null },
  s2s: { configured: true, rotatedAt: "2026-10-28T12:00:00.000Z" },
};

function Harness({ onValue }: { onValue: (v: WebchatV2Config) => void }) {
  const [value, setValue] = useState(defaultWebchatV2Config());
  return (
    <WebchatS2SSection
      channelId="ch-wc"
      publicKey="wc_abcdefghijklmnopqrstuvwx"
      publicOrigin="https://app.example.test"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
      secrets={SECRETS}
      onSecretsChange={() => {}}
    />
  );
}

function renderSection() {
  const onValue = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness onValue={onValue} />
    </QueryClientProvider>,
  );
  return onValue;
}

describe("seção Servidor a servidor", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/api/tags")) return new Response(JSON.stringify([{ id: "tag-1", name: "Fila site" }]));
        if (u.includes("/api/settings/departments")) {
          return new Response(JSON.stringify([{ id: "dep-1", name: "Suporte" }]));
        }
        if (u.includes("/api/custom-fields")) return new Response(JSON.stringify([{ id: "cf-1", label: "Protocolo" }]));
        return new Response("[]");
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mostra o endereço de entrada com a chave pública", () => {
    renderSection();
    expect((screen.getByLabelText("Endereço de entrada (POST)") as HTMLInputElement).value).toBe(
      "https://app.example.test/api/public/webchat/s2s/wc_abcdefghijklmnopqrstuvwx",
    );
  });

  it("etiqueta da fila, campo do negócio e URL de retorno vão para o v2", async () => {
    const onValue = renderSection();
    await waitFor(() => expect(screen.getByRole("option", { name: "Fila site" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Etiqueta ao abrir conversa nova"), { target: { value: "tag-1" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Protocolo" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Campo do negócio que recebe o ref"), { target: { value: "cf-1" } });
    fireEvent.change(screen.getByLabelText("URL de retorno (atendido / resolvido)"), {
      target: { value: " https://hooks.example.test/crm " },
    });
    const last = onValue.mock.calls.at(-1)![0] as WebchatV2Config;
    expect(last.s2s.queueTagId).toBe("tag-1");
    expect(last.refDealCustomFieldId).toBe("cf-1");
    expect(last.s2s.callbackUrl).toBe("https://hooks.example.test/crm");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("URL de retorno sem https é sinalizada", () => {
    renderSection();
    fireEvent.change(screen.getByLabelText("URL de retorno (atendido / resolvido)"), {
      target: { value: "http://hooks.example.test/crm" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(/https/);
  });

  it("regra: critério + ação; incompleta é sinalizada", async () => {
    const onValue = renderSection();
    fireEvent.click(screen.getByText("Adicionar regra"));
    expect(screen.getByText(/Regra\s+incompleta não é salva/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Prioridade da regra 1"), { target: { value: "alta" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Suporte" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Departamento da regra 1"), { target: { value: "dep-1" } });
    fireEvent.click(screen.getByLabelText("Fixar a nota no topo da conversa"));
    expect(screen.queryByText(/Regra\s+incompleta não é salva/)).toBeNull();
    const last = onValue.mock.calls.at(-1)![0] as WebchatV2Config;
    expect(last.s2s.rules).toEqual([{ priority: "alta", departmentId: "dep-1", pinNote: true }]);
    expect((screen.getByLabelText("Categoria da regra 1") as HTMLInputElement).maxLength).toBe(64);
  });
});

describe("validações da seção", () => {
  it("callbackUrlProblem", () => {
    expect(callbackUrlProblem(null)).toBeNull();
    expect(callbackUrlProblem("https://hooks.example.test/x")).toBeNull();
    expect(callbackUrlProblem("http://hooks.example.test/x")).toMatch(/https/);
    expect(callbackUrlProblem("https://u:p@hooks.example.test/x")).toMatch(/usuário/);
    expect(callbackUrlProblem("não é url")).toMatch(/inválido/);
  });

  it("isIncompleteRule", () => {
    expect(isIncompleteRule({})).toBe(true);
    expect(isIncompleteRule({ priority: "alta" })).toBe(true);
    expect(isIncompleteRule({ tagId: "t1" })).toBe(true);
    expect(isIncompleteRule({ category: "a", tagId: "t1" })).toBe(false);
  });
});
