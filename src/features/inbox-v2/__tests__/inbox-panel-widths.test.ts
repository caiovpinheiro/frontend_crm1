import { describe, expect, it } from "vitest";

import {
  INBOX_CHAT_MIN_WIDTH,
  resolveInboxPanelWidths,
  resolveInboxTabletListWidth,
} from "../inbox-panel-widths";
import {
  inboxQueueTriggerLabel,
  inboxQueueTriggerShortLabel,
} from "../inbox-queue-catalog";

const none = { storedList: null, storedAside: null, asideCollapsed: false };

describe("L4 — larguras proporcionais dos painéis do Inbox", () => {
  it("1.280 px: lista ~30%, contato ~28%, chat o resto (antes 300/300 fixos)", () => {
    const w = resolveInboxPanelWidths({ viewport: 1280, ...none });
    const available = 1280 - 72 - 16;
    expect(w.list / available).toBeGreaterThanOrEqual(0.28);
    expect(w.list / available).toBeLessThanOrEqual(0.32);
    expect(w.aside / available).toBeGreaterThanOrEqual(0.26);
    expect(w.aside / available).toBeLessThanOrEqual(0.3);
    expect(w.list).toBeGreaterThan(300);
    expect(w.chat).toBeGreaterThanOrEqual(INBOX_CHAT_MIN_WIDTH);
    expect(w.list + w.aside + w.chat).toBe(available);
  });

  it("telas largas: respeita o máximo de cada painel", () => {
    const w = resolveInboxPanelWidths({ viewport: 2560, ...none });
    expect(w.list).toBe(440);
    expect(w.aside).toBe(420);
  });

  it("1.024 px: respeita os mínimos e o chat fica perto do mínimo", () => {
    const w = resolveInboxPanelWidths({ viewport: 1024, ...none });
    expect(w.list).toBeGreaterThanOrEqual(280);
    expect(w.aside).toBeGreaterThanOrEqual(260);
    expect(w.chat).toBeGreaterThanOrEqual(INBOX_CHAT_MIN_WIDTH - 10);
  });

  it("contato recolhido: 0, e o chat ocupa o espaço", () => {
    const w = resolveInboxPanelWidths({ viewport: 1280, ...none, asideCollapsed: true });
    expect(w.aside).toBe(0);
    expect(w.chat).toBe(1280 - 72 - 16 - w.list);
  });

  it("largura arrastada pela pessoa vale (dentro dos limites do arrasto)", () => {
    const w = resolveInboxPanelWidths({
      viewport: 1600,
      storedList: 500,
      storedAside: 300,
      asideCollapsed: false,
    });
    expect(w.list).toBe(500);
    expect(w.aside).toBe(300);
  });

  it("largura arrastada que espremeria o chat cede (contato primeiro)", () => {
    const w = resolveInboxPanelWidths({
      viewport: 1100,
      storedList: 500,
      storedAside: 480,
      asideCollapsed: false,
    });
    expect(w.aside).toBeLessThan(480);
    expect(w.chat).toBeGreaterThanOrEqual(INBOX_CHAT_MIN_WIDTH - 1);
  });

  it("tablet: lista entre 280 e 340 px", () => {
    expect(resolveInboxTabletListWidth(768)).toBeGreaterThanOrEqual(280);
    expect(resolveInboxTabletListWidth(1023)).toBeLessThanOrEqual(340);
  });

  it("NavRail expandida (220 px) estreita a área útil: a conversa não é espremida", () => {
    const recolhida = resolveInboxPanelWidths({ viewport: 1280, ...none });
    const expandida = resolveInboxPanelWidths({ viewport: 1280, ...none, navRail: 220 });
    expect(expandida.list + expandida.aside + expandida.chat).toBe(1280 - 220 - 16);
    expect(expandida.list).toBeLessThanOrEqual(recolhida.list);
    expect(expandida.chat).toBeGreaterThanOrEqual(INBOX_CHAT_MIN_WIDTH - 10);
    // tablet com a rail aberta: a lista cede para a conversa ter >= 300 px
    const lista = resolveInboxTabletListWidth(768, 220);
    expect(768 - 220 - lista).toBeGreaterThanOrEqual(300);
  });
});

describe("L4 — gatilho da fila: rótulo curto só para 'Todas as conversas'", () => {
  it("todos tem rótulo curto; outras filas e multi-seleção não", () => {
    expect(inboxQueueTriggerLabel(["todos"])).toBe("Todas as conversas");
    expect(inboxQueueTriggerShortLabel(["todos"])).toBe("Todas");
    expect(inboxQueueTriggerShortLabel(["entrada"])).toBeUndefined();
    expect(inboxQueueTriggerShortLabel(["todos", "entrada"])).toBeUndefined();
  });
});
