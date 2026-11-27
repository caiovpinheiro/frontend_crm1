import { describe, expect, it } from "vitest";

import {
  buildTemplateComponents,
  chatTemplateSlots,
  countMissingTemplateVariables,
  reconcileTemplateVariables,
  renderTemplateButtonUrl,
  setTemplateVariableValue,
  templateVariableLabel,
  templateVariableSlots,
  templateVariablesFromConfig,
  templateVariableValue,
  templateUrlButtons,
  type TemplateButtonInfo,
} from "../template-variables";

const PROVA_URL = "https://prova.cruzeiroead.com.br/{{1}}";
const BODY = "Olá {{1}}, sua prova foi liberada.";

const dynamicUrl: TemplateButtonInfo = { type: "URL", text: "Acessar prova", url: PROVA_URL };
const quickReply: TemplateButtonInfo = { type: "QUICK_REPLY", text: "Quero", url: null };
const flowBtn: TemplateButtonInfo = { type: "FLOW", text: "Abrir formulário", url: null };
const fixedUrl: TemplateButtonInfo = {
  type: "URL",
  text: "Site",
  url: "https://www.cruzeirodosulvirtual.com.br",
};

describe("templateVariableSlots × botões", () => {
  it("botão URL dinâmico vira slot com buttonIndex, depois do corpo", () => {
    expect(templateVariableSlots(BODY, null, [dynamicUrl])).toEqual([
      { component: "body", key: "1" },
      {
        component: "button",
        key: "1",
        buttonIndex: 0,
        buttonText: "Acessar prova",
        buttonUrl: PROVA_URL,
      },
    ]);
  });

  it("índice segue a ordem da seção BUTTONS (quick reply e Flow contam)", () => {
    const slots = templateVariableSlots(BODY, null, [quickReply, flowBtn, dynamicUrl]);
    const btn = slots.filter((s) => s.component === "button");
    expect(btn).toHaveLength(1);
    expect(btn[0].buttonIndex).toBe(2);
  });

  it("quick reply, Flow e URL fixa não geram slot", () => {
    expect(templateVariableSlots(BODY, null, [quickReply, flowBtn, fixedUrl])).toEqual([
      { component: "body", key: "1" },
    ]);
  });

  it("template sem botões continua igual", () => {
    expect(templateVariableSlots(BODY, "Oi {{1}}")).toEqual([
      { component: "header", key: "1" },
      { component: "body", key: "1" },
    ]);
  });
});

describe("chatTemplateSlots × botões", () => {
  it("inclui o botão URL dinâmico no modal do chat", () => {
    const slots = chatTemplateSlots(BODY, "", null, [quickReply, dynamicUrl]);
    expect(slots.map((s) => [s.component, s.key, s.buttonIndex])).toEqual([
      ["body", "1", undefined],
      ["button", "1", 1],
    ]);
  });

  it("URL fixa e quick reply não pedem nada", () => {
    expect(chatTemplateSlots("Sem variáveis", "", null, [fixedUrl, quickReply])).toEqual([]);
  });
});

describe("valores do botão", () => {
  const slots = templateVariableSlots(BODY, null, [dynamicUrl]);
  const button = slots[1];

  it("rótulo mostra o botão e a parte fixa da URL", () => {
    expect(templateVariableLabel(button)).toBe(
      "Botão 'Acessar prova' — final da URL (https://prova.cruzeiroead.com.br/…)",
    );
  });

  it("grava em components com sub_type url e index do botão", () => {
    let vars = reconcileTemplateVariables(slots, []);
    vars = setTemplateVariableValue(vars, slots[0], "{{contact.name}}");
    vars = setTemplateVariableValue(vars, button, "{{dealCustomFields.codigo_da_prova}}");
    expect(templateVariableValue(vars, button)).toBe("{{dealCustomFields.codigo_da_prova}}");
    // O `{{1}}` do corpo não é afetado pelo `{{1}}` do botão.
    expect(templateVariableValue(vars, slots[0])).toBe("{{contact.name}}");
    expect(buildTemplateComponents(vars)).toEqual([
      { type: "body", parameters: [{ type: "text", text: "{{contact.name}}" }] },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: "{{dealCustomFields.codigo_da_prova}}" }],
      },
    ]);
  });

  it("preserva o valor ao reler o passo salvo e conta no 'todos preenchidos'", () => {
    const empty = reconcileTemplateVariables(slots, []);
    expect(countMissingTemplateVariables(empty)).toBe(2);

    const saved = buildTemplateComponents(
      setTemplateVariableValue(setTemplateVariableValue(empty, slots[0], "Ana"), button, "ABC123"),
    );
    const reread = templateVariablesFromConfig(slots, saved);
    expect(templateVariableValue(reread, button)).toBe("ABC123");
    expect(templateVariableValue(reread, slots[0])).toBe("Ana");
    expect(countMissingTemplateVariables(reread)).toBe(0);
  });

  it("troca para template sem botão descarta o parâmetro do botão", () => {
    const filled = setTemplateVariableValue(reconcileTemplateVariables(slots, []), button, "X");
    const other = templateVariableSlots(BODY, null, [fixedUrl]);
    const next = reconcileTemplateVariables(other, filled);
    expect(next.some((v) => v.component === "button")).toBe(false);
    expect(buildTemplateComponents(next).some((c) => (c as { type: string }).type === "button")).toBe(
      false,
    );
  });

  it("preview renderiza a URL final do botão", () => {
    const [btn] = templateUrlButtons([dynamicUrl]);
    const vars = setTemplateVariableValue(reconcileTemplateVariables(slots, []), button, "PRV-42");
    expect(renderTemplateButtonUrl(btn, vars)).toBe("https://prova.cruzeiroead.com.br/PRV-42");
    expect(renderTemplateButtonUrl(btn, reconcileTemplateVariables(slots, []))).toBe(PROVA_URL);
  });
});
