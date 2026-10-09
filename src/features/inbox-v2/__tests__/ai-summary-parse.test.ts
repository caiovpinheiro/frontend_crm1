import { describe, expect, it } from "vitest";

import { parseSummaryContent } from "../extras/ai-summary-parse";

const standard = [
  "Motivo: Não conseguia entrar no aplicativo.",
  "O que foi feito: Enviada a orientação de acesso.",
  "Pendência: Nenhuma",
  "Resultado: Encerrado: resolvido",
  "Próximo passo: Se voltar, verificar o cadastro.",
].join("\n");

describe("resumo do atendimento — cartão", () => {
  it("itens na ordem gravada e linha do cartão fechado", () => {
    const parsed = parseSummaryContent(standard);
    expect(parsed.items.map((i) => i.label)).toEqual(["Motivo", "O que foi feito", "Pendência", "Resultado", "Próximo passo"]);
    expect(parsed.oneLine).toBe("Não conseguia entrar no aplicativo. → Encerrado: resolvido");
  });

  it("pendência real aparece na linha", () => {
    const parsed = parseSummaryContent(standard.replace("Pendência: Nenhuma", "Pendência: Confirmar o pagamento"));
    expect(parsed.oneLine).toBe("Não conseguia entrar no aplicativo. → Encerrado: resolvido · Confirmar o pagamento");
  });

  it("nível mínimo (sem rótulos): a linha é o próprio texto, sem itens", () => {
    const parsed = parseSummaryContent("Pedido atrasado → Transferido para a equipe");
    expect(parsed.items).toEqual([]);
    expect(parsed.oneLine).toBe("Pedido atrasado → Transferido para a equipe");
  });

  it("linhas que não são do resumo são ignoradas; dois-pontos dentro do valor não quebram", () => {
    const parsed = parseSummaryContent("Observação: ignorar\nResultado: Encerrado: resolvido");
    expect(parsed.items).toEqual([{ label: "Resultado", value: "Encerrado: resolvido" }]);
  });
});
