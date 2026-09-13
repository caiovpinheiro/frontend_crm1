import { describe, expect, it } from "vitest";

import { auditAutomation } from "@/lib/automation-auditor";
import {
  clearGhostRootNext,
  migrateLegacyLinearNext,
  needsLegacyLinearMigration,
  shouldClearGhostRootNext,
  stepUsesRootNextStepId,
} from "@/lib/automation-ghost-next";

describe("automation-ghost-next", () => {
  it("não usa nextStepId raiz em menu, pergunta ou encerrar conversa", () => {
    expect(stepUsesRootNextStepId("send_whatsapp_list")).toBe(false);
    expect(stepUsesRootNextStepId("send_whatsapp_interactive")).toBe(false);
    expect(stepUsesRootNextStepId("question")).toBe(false);
    expect(stepUsesRootNextStepId("finish_conversation")).toBe(false);
    expect(stepUsesRootNextStepId("send_whatsapp_message")).toBe(true);
  });

  it("limpa next fantasma quando todas as opções do menu já têm destino", () => {
    const steps = [
      {
        id: "menu",
        type: "send_whatsapp_list",
        config: {
          body: "Escolha",
          rows: [
            { title: "Falar com equipe", gotoStepId: "handoff" },
            { title: "Financeiro", gotoStepId: "fin" },
          ],
          nextStepId: "welcome",
        },
      },
    ];
    expect(shouldClearGhostRootNext(steps[0].type, steps[0].config)).toBe(true);
    const { steps: next, changed } = clearGhostRootNext(steps);
    expect(changed).toBe(true);
    expect((next[0].config as { nextStepId: string }).nextStepId).toBe("__none__");
  });

  it("não limpa next se alguma opção do menu ainda não tem destino", () => {
    const config = {
      buttons: [
        { title: "A", gotoStepId: "" },
        { title: "B", gotoStepId: "step-b" },
      ],
      nextStepId: "fallback",
    };
    expect(shouldClearGhostRootNext("question", config)).toBe(false);
  });

  it("limpa next depois de encerrar conversa", () => {
    const { steps, changed } = clearGhostRootNext([
      {
        id: "close",
        type: "finish_conversation",
        config: { nextStepId: "welcome" },
      },
    ]);
    expect(changed).toBe(true);
    expect((steps[0].config as { nextStepId: string }).nextStepId).toBe("__none__");
  });

  it("migração legada não inventa next em lista nem em encerrar", () => {
    const steps = [
      { id: "hello", type: "send_whatsapp_message", config: {} },
      { id: "menu", type: "send_whatsapp_list", config: { rows: [] } },
      { id: "close", type: "finish_conversation", config: {} },
    ];
    expect(needsLegacyLinearMigration(steps)).toBe(true);
    const migrated = migrateLegacyLinearNext(steps);
    expect((migrated[0].config as { nextStepId: string }).nextStepId).toBe("menu");
    expect((migrated[1].config as { nextStepId?: string }).nextStepId).toBeUndefined();
    expect((migrated[2].config as { nextStepId?: string }).nextStepId).toBeUndefined();
  });
});

describe("auditAutomation — reentrada e close", () => {
  it("marca next fantasma em lista e continuação após encerrar", () => {
    const report = auditAutomation({
      id: "auto-1",
      name: "INICIO - PIPEPE",
      triggerType: "message_received",
      active: true,
      steps: [
        {
          id: "menu",
          type: "send_whatsapp_list",
          config: {
            body: "Selecione",
            button: "Opções",
            rows: [{ title: "Falar com equipe", gotoStepId: "handoff" }],
            nextStepId: "welcome",
          },
        },
        {
          id: "close",
          type: "finish_conversation",
          config: { nextStepId: "welcome" },
        },
      ],
    });
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain("interactive_ghost_next");
    expect(codes).toContain("continues_after_close");
    expect(codes).toContain("message_received_reentry");
  });
});
