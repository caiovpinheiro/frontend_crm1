import { describe, expect, it } from "vitest";

import { inboxAlertKind } from "../inbox-alert-audience";

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

  it("fila da IA → others", () => {
    expect(
      inboxAlertKind(
        { assignedToId: "u_ia", assignedTo: { type: "AI" }, departmentId: "d_vendas" },
        ME,
        DEPTS,
      ),
    ).toBe("others");
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
