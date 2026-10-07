/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { formatUsageHours } from "@/features/dashboard-v2/format";

import { SystemUsageBars } from "./system-usage-bars";

afterEach(cleanup);

const ROWS = [
  { id: "a", name: "Marcelo", seconds: 18 * 60 },
  { id: "b", name: "Emanuel", seconds: 4 * 3600 + 42 * 60 },
  { id: "c", name: "Camys", seconds: 80 * 60 },
];

function names() {
  return screen.getAllByRole("listitem").map((li) => li.querySelector("p span")?.textContent);
}

describe("SystemUsageBars", () => {
  it("ordena por tempo e alterna para A–Z", () => {
    render(<SystemUsageBars rows={ROWS} average={7200} formatValue={formatUsageHours} />);
    expect(names()).toEqual(["Emanuel", "Camys", "Marcelo"]);

    fireEvent.click(screen.getByRole("button", { name: "A–Z" }));
    expect(names()).toEqual(["Camys", "Emanuel", "Marcelo"]);
  });

  it("mostra a média com rótulo, a diferença por pessoa e o alerta só abaixo de 1h", () => {
    render(<SystemUsageBars rows={ROWS} average={7200} formatValue={formatUsageHours} />);
    expect(screen.getByText("média 2h00")).toBeTruthy();
    expect(screen.getByText("4h42")).toBeTruthy();
    expect(screen.getByText("+2h42")).toBeTruthy();
    expect(screen.getByText("−40min")).toBeTruthy();
    expect(screen.getAllByLabelText("Uso abaixo de 1h")).toHaveLength(1);
  });

  it("top 10 com 'Ver todos' quando há mais usuários", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `u${i}`,
      name: `Pessoa ${String(i).padStart(2, "0")}`,
      seconds: (12 - i) * 1800,
    }));
    render(<SystemUsageBars rows={many} average={9000} formatValue={formatUsageHours} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Ver todos (12)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Mostrar top 10" })).toBeTruthy();
  });
});
