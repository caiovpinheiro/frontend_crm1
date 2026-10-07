/** @vitest-environment jsdom */
/**
 * L7 — alvos de toque: em `(pointer: coarse)` ou abaixo de `md`, botões de
 * ícone dos cards do Kanban, da Lista e de Contatos têm área mínima de
 * 40×40 px, sem mudar o visual no desktop. jsdom não aplica `@media`; o
 * contrato é conferido na classe/CSS e no desenho (caixa de 18 px).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckboxGlass } from "../checkbox-glass";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

afterEach(() => cleanup());

describe("CheckboxGlass touchTarget", () => {
  it("padrão: a caixa de 18 px É o botão (desktop inalterado)", () => {
    render(<CheckboxGlass checked aria-label="x" />);
    const btn = screen.getByRole("checkbox");
    expect(btn.className).toContain("h-[18px]");
    expect(btn.className).toContain("border");
    expect(btn.className).not.toContain("touch-target-40");
  });

  it("touchTarget: botão com min 40×40 e a caixa de 18 px dentro, desenho igual", () => {
    const onChange = vi.fn();
    render(<CheckboxGlass checked={false} onChange={onChange} aria-label="y" touchTarget />);
    const btn = screen.getByRole("checkbox");
    expect(btn.className).toContain("touch-target-40");
    expect(btn.className).not.toContain("border");
    const box = btn.firstElementChild as HTMLElement;
    expect(box.className).toContain("h-[18px]");
    expect(box.className).toContain("w-[18px]");
    expect(box.className).toContain("border");
    btn.click();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("contrato de CSS e dos cards", () => {
  it(".touch-target-40 só vale em ponteiro grosso ou abaixo de md", () => {
    const css = read("../../../app/globals.css");
    const block = css.slice(css.indexOf("@media (pointer: coarse), (max-width: 767.98px)"));
    expect(block).toContain(".touch-target-40 { min-width: 40px; min-height: 40px; }");
    // fora do @media não existe a regra de 40px
    const before = css.slice(0, css.indexOf("@media (pointer: coarse), (max-width: 767.98px)"));
    expect(before).not.toContain(".touch-target-40");
  });

  it("card do Kanban: checkbox de seleção, +tag, responsável e Mover usam o alvo de 40 px", () => {
    const card = read("../deal-card.tsx");
    expect(card).toContain("touch-target-40 touch-target-40-bleed");
    expect(read("../../../features/pipeline-v2/extras/tags-popover.tsx")).toContain("touch-target-40");
    expect(read("../../../features/pipeline-v2/extras/assignee-popover.tsx")).toContain("touch-target-40");
    expect(read("../../../app/(app)/pipeline/_v2-client.tsx")).toContain(
      'className="touch-target-40 flex size-7 items-center justify-center rounded-full bg-cyan-500',
    );
    expect(read("../kanban-column.tsx")).toContain("touch-target-40");
  });

  it("título do card do Kanban e nomes truncados têm title", () => {
    const card = read("../deal-card.tsx");
    expect(card).toContain("title={deal.name}");
    const list = read("../deal-list-table.tsx");
    expect(list).toContain("title={d.dealTitle}");
    expect(list).toContain("title={d.contactName}");
  });

  it("Lista e Contatos: checkboxes e ações com alvo de toque", () => {
    expect(read("../deal-list-table.tsx")).toContain("touchTarget");
    const contacts = read("../../../app/(app)/contacts/client-page.tsx");
    expect(contacts).toContain("touchTarget");
    expect(contacts.match(/touch-target-40 flex h-8 w-8/g)?.length).toBe(4);
  });
});
