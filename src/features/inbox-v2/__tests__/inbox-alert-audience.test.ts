import { describe, expect, it } from "vitest";

import {
  DEFAULT_INBOX_ALERT_CONFIG,
  inboxAlertKind,
  withInboxAlertDefaults,
} from "../inbox-alert-audience";

const ME = "u_me";
const DEPTS = ["d_vendas"];

describe("inboxAlertKind", () => {
  it("atribuída a mim → mine", () => {
    expect(
      inboxAlertKind({ assignedToId: ME, assignedTo: { type: "HUMAN" } }, ME, DEPTS),
    ).toBe("mine");
  });

  it("atribuída a outro agente → others, mesmo no meu departamento", () => {
    expect(
      inboxAlertKind({ assignedToId: "u_outro", departmentId: "d_vendas" }, ME, DEPTS),
    ).toBe("others");
  });

  it("conversa com a IA → ai (linha própria na config)", () => {
    expect(
      inboxAlertKind(
        { assignedToId: "u_ia", assignedTo: { type: "AI" }, departmentId: "d_vendas" },
        ME,
        DEPTS,
      ),
    ).toBe("ai");
  });

  it("config sem o tipo ai (backend/config antigos) → ai vale o padrão", () => {
    const old = { ...DEFAULT_INBOX_ALERT_CONFIG } as Partial<typeof DEFAULT_INBOX_ALERT_CONFIG>;
    delete old.ai;
    expect(withInboxAlertDefaults(old).ai).toEqual(DEFAULT_INBOX_ALERT_CONFIG.ai);
    expect(withInboxAlertDefaults(null)).toEqual(DEFAULT_INBOX_ALERT_CONFIG);
  });

  it("sem responsável no meu departamento → queue", () => {
    expect(inboxAlertKind({ assignedToId: null, departmentId: "d_vendas" }, ME, DEPTS)).toBe(
      "queue",
    );
  });

  it("sem responsável fora dos meus departamentos ou sem departamento → others", () => {
    expect(inboxAlertKind({ assignedToId: null, departmentId: "d_suporte" }, ME, DEPTS)).toBe(
      "others",
    );
    expect(inboxAlertKind({ assignedToId: null, departmentId: null }, ME, DEPTS)).toBe("others");
  });

  it("departamentos ainda não carregados → fila vira others", () => {
    expect(
      inboxAlertKind({ assignedToId: null, departmentId: "d_vendas" }, ME, undefined),
    ).toBe("others");
    expect(inboxAlertKind({ assignedToId: ME }, ME, undefined)).toBe("mine");
  });

  it("sem usuário → nada", () => {
    expect(inboxAlertKind({ assignedToId: ME }, null, DEPTS)).toBeNull();
  });
});
