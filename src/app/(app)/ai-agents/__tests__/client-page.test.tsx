/** @vitest-environment jsdom */
/**
 * Página "Agentes de IA": o cockpit do agente acadêmico é sempre o NATIVO
 * (React + `/api/public/agent-cockpit` same-origin). O iframe do cockpit
 * externo (`NEXT_PUBLIC_COCKPIT_URL`) foi removido — nenhum iframe, com ou
 * sem a variável.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  // O `dynamic()` da página carrega `AcademicCockpitTab`; aqui vira um stub
  // síncrono que expõe a aba recebida.
  default: () =>
    function NativeCockpitStub({ tab }: { tab: string }) {
      return <div data-testid="native-cockpit" data-tab={tab} />;
    },
}));

vi.mock("@/features/ai-agents/academic-cockpit", () => ({
  ACADEMIC_TABS: [
    { id: "saude", label: "Saúde" },
    { id: "resolucao", label: "Resolução" },
    { id: "handoff", label: "Handoff" },
    { id: "funil", label: "Funil" },
  ],
  AcademicCockpitTab: () => null,
}));

vi.mock("@/features/legacy-v1/ai-agents", () => ({
  default: () => <div data-testid="agents-list" />,
}));

vi.mock("../../_v2-page-shell", () => ({
  AppV2PageShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

import AIAgentsV2ClientPage from "../client-page";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("AIAgentsV2ClientPage", () => {
  it("abre na aba Agentes e oferece as abas do cockpit nativo", () => {
    render(<AIAgentsV2ClientPage />);

    expect(screen.getByTestId("agents-list")).toBeTruthy();
    expect(screen.queryByTestId("native-cockpit")).toBeNull();
    const labels = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(labels).toEqual(["Agentes", "Saúde", "Resolução", "Handoff", "Funil"]);
  });

  it("renderiza o cockpit nativo ao trocar de aba, sem iframe", () => {
    // Mesmo com a variável antiga definida, não há mais caminho de iframe.
    vi.stubEnv("NEXT_PUBLIC_COCKPIT_URL", "https://cockpit.example.com");
    const { container } = render(<AIAgentsV2ClientPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Handoff" }));

    expect(screen.getByTestId("native-cockpit").getAttribute("data-tab")).toBe("handoff");
    expect(container.querySelector("iframe")).toBeNull();
  });
});
