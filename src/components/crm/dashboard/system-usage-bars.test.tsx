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
  return screen.getAllByRole("listitem").map((li) => li.querySelector("span span")?.textContent);
}

describe("SystemUsageBars", () => {
  it("ordena por tempo e alterna para A–Z", () => {
    render(<SystemUsageBars rows={ROWS} average={7200} formatValue={formatUsageHours} />);
    expect(names()).toEqual(["Emanuel", "Camys", "Marcelo"]);

    fireEvent.click(screen.getByRole("button", { name: "A–Z" }));
    expect(names()).toEqual(["Camys", "Emanuel", "Marcelo"]);
  });

  it("mostra média, escala em horas e alerta só para uso abaixo de 1h", () => {
    render(<SystemUsageBars rows={ROWS} average={7200} formatValue={formatUsageHours} />);
    expect(screen.getByText("Média 2h00")).toBeTruthy();
    expect(screen.getByText("4h42")).toBeTruthy();
    expect(screen.getByText("5h")).toBeTruthy();
    expect(screen.getAllByLabelText("Uso abaixo de 1h")).toHaveLength(1);
  });
});
