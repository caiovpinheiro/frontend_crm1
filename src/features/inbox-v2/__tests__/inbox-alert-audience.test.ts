import { describe, expect, it } from "vitest";

import { inboxAlertAudience } from "../inbox-alert-audience";

const ME = "u_me";
const DEPTS = ["d_vendas"];

describe("inboxAlertAudience", () => {
  it("atribuída a mim → mine", () => {
    expect(
      inboxAlertAudience({ assignedToId: ME, assignedTo: { type: "HUMAN" } }, ME, DEPTS),
    ).toBe("mine");
  });

  it("atribuída a outro agente → nada, mesmo no meu departamento", () => {
    expect(
      inboxAlertAudience({ assignedToId: "u_outro", departmentId: "d_vendas" }, ME, DEPTS),
    ).toBeNull();
  });

  it("fila da IA → nada", () => {
    expect(
      inboxAlertAudience(
        { assignedToId: "u_ia", assignedTo: { type: "AI" }, departmentId: "d_vendas" },
        ME,
        DEPTS,
      ),
    ).toBeNull();
  });

  it("sem responsável no meu departamento → queue", () => {
    expect(
      inboxAlertAudience({ assignedToId: null, departmentId: "d_vendas" }, ME, DEPTS),
    ).toBe("queue");
  });

  it("sem responsável fora dos meus departamentos ou sem departamento → nada", () => {
    expect(
      inboxAlertAudience({ assignedToId: null, departmentId: "d_suporte" }, ME, DEPTS),
    ).toBeNull();
    expect(inboxAlertAudience({ assignedToId: null, departmentId: null }, ME, DEPTS)).toBeNull();
  });

  it("departamentos ainda não carregados → só o que é meu", () => {
    expect(
      inboxAlertAudience({ assignedToId: null, departmentId: "d_vendas" }, ME, undefined),
    ).toBeNull();
    expect(inboxAlertAudience({ assignedToId: ME }, ME, undefined)).toBe("mine");
  });

  it("sem usuário → nada", () => {
    expect(inboxAlertAudience({ assignedToId: ME }, null, DEPTS)).toBeNull();
  });
});
