/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebchatAttendanceSection } from "../attendance-section";
import { WebchatIdentitySection } from "../identity-section";
import { defaultWebchatV2Config, type WebchatV2Config } from "../v2-config";

const SECRETS = {
  identity: { configured: true, rotatedAt: null },
  s2s: { configured: false, rotatedAt: null },
};

const RESPONSES: Record<string, unknown> = {
  "/api/users": [{ id: "u1", name: "Pessoa Um" }],
  "/api/settings/departments": [{ id: "d1", name: "Suporte" }],
  "/api/ai-agents-v2": {
    agents: [
      { userId: "a1", name: "Agente Ativo", active: true },
      { userId: "a2", name: "Agente Desligado", active: false },
    ],
  },
  "/api/custom-fields?entity=contact": [{ id: "c1", label: "Campo do contato" }],
  "/api/custom-fields?entity=deal": [{ id: "f1", label: "Identificador" }],
};

function Harness({
  Section,
  initial,
  onValue,
}: {
  Section: typeof WebchatAttendanceSection;
  initial: WebchatV2Config;
  onValue: (v: WebchatV2Config) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <Section
        channelId="ch-1"
        publicKey="wc_x"
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
        secrets={SECRETS}
        onSecretsChange={() => {}}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = Object.keys(RESPONSES).find((k) => String(url).endsWith(k));
      return new Response(JSON.stringify(key ? RESPONSES[key] : []), { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WebchatAttendanceSection", () => {
  it("escolhe fila, destino, responsável e alternativa", async () => {
    let last = defaultWebchatV2Config();
    render(<Harness Section={WebchatAttendanceSection} initial={last} onValue={(v) => (last = v)} />);

    fireEvent.change(screen.getByLabelText("Fila"), { target: { value: "high" } });
    expect(last.routing.priority).toBe("high");
    expect(screen.getByText(/até a primeira resposta de uma pessoa/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Para onde vai"), { target: { value: "ai_agent" } });
    expect(last.routing.destination).toEqual({ type: "ai_agent" });
    await screen.findByRole("option", { name: "Agente Ativo" });
    expect(screen.queryByRole("option", { name: "Agente Desligado" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Qual agente de IA"), { target: { value: "a1" } });
    expect(last.routing.destination).toEqual({ type: "ai_agent", id: "a1" });

    fireEvent.click(screen.getByLabelText(/já tem responsável disponível/));
    expect(last.routing.keepCurrentOwner).toBe(false);

    fireEvent.change(screen.getByLabelText("Se não estiver disponível"), { target: { value: "department" } });
    await screen.findByRole("option", { name: "Suporte" });
    fireEvent.change(screen.getByLabelText("Qual departamento"), { target: { value: "d1" } });
    expect(last.routing.fallback).toEqual({ type: "department", id: "d1" });
  });

  it("id apagado não some: avisa que vai para a alternativa", async () => {
    const initial = defaultWebchatV2Config();
    initial.routing.destination = { type: "user", id: "apagado" };
    render(<Harness Section={WebchatAttendanceSection} initial={initial} onValue={() => {}} />);
    expect(await screen.findByRole("option", { name: /Removido\. Vai para a alternativa/ })).toBeTruthy();
    const select = screen.getByLabelText("Qual pessoa") as HTMLSelectElement;
    expect(select.value).toBe("apagado");
  });

  it("não usa jargão técnico", () => {
    render(<Harness Section={WebchatAttendanceSection} initial={defaultWebchatV2Config()} onValue={() => {}} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/fallback|routing|keepCurrentOwner|S2S|standard|distribution/i);
  });
});

describe("WebchatIdentitySection: campo de negócio", () => {
  it("lista só campos de negócio no grupo próprio e grava a normalização", async () => {
    let last = defaultWebchatV2Config();
    render(<Harness Section={WebchatIdentitySection} initial={last} onValue={(v) => (last = v)} />);
    const option = await screen.findByRole("option", { name: "Negócio: Identificador" });
    expect(option.closest("optgroup")?.getAttribute("label")).toBe("Campos do negócio");
    await waitFor(() => screen.getByRole("option", { name: "Campo: Campo do contato" }));

    fireEvent.change(screen.getByLabelText("Onde fica o identificador do site"), {
      target: { value: "deal:f1" },
    });
    expect(last.identity.matchField).toEqual({ type: "dealCustomField", customFieldId: "f1", normalize: "none" });

    fireEvent.change(screen.getByLabelText("Como comparar o valor"), { target: { value: "digits" } });
    expect(last.identity.matchField).toEqual({ type: "dealCustomField", customFieldId: "f1", normalize: "digits" });

    fireEvent.change(screen.getByLabelText("Onde fica o identificador do site"), { target: { value: "c1" } });
    expect(last.identity.matchField).toEqual({ type: "customField", customFieldId: "c1" });
    expect(screen.queryByLabelText("Como comparar o valor")).toBeNull();
  });
});
