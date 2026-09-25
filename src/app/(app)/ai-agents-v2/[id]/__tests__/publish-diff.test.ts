import { describe, expect, it } from "vitest";

import { buildPublishDiff, focusTextChange } from "../publish-diff";

const catalogs = {
  messageTemplates: [
    { id: "m1", name: "Boas-vindas" },
    { id: "m2", name: "Segunda via" },
  ],
  departments: [{ id: "d1", name: "Suporte" }],
};

describe("buildPublishDiff", () => {
  it("mostra de → para com os rótulos da tela", () => {
    const before = {
      responseLength: "medium",
      emojis: "none",
      allowedMessageModelIds: ["m1"],
      media: { audio: { action: "handoff" }, image: { action: "handoff" } },
    };
    const after = {
      responseLength: "short",
      emojis: "light",
      allowedMessageModelIds: ["m2"],
      media: { audio: { action: "transcribe" }, image: { action: "handoff" } },
    };
    const out = buildPublishDiff(before, after, catalogs);
    const quem = out.find((s) => s.section === "Quem é o agente")!;
    expect(quem.lines).toContainEqual({ label: "Tamanho das respostas", from: "Médias", to: "Curtas" });
    expect(quem.lines).toContainEqual({ label: "Emojis", from: "Nenhum", to: "Poucos" });
    const sabe = out.find((s) => s.section === "O que ele sabe")!;
    expect(sabe.lines).toContainEqual({ label: "Mensagens prontas", added: ["Segunda via"], removed: ["Boas-vindas"] });
    const comeco = out.find((s) => s.section === "Começo e fim da conversa")!;
    expect(comeco.lines).toEqual([{ label: "Áudio", from: "Passar para a equipe", to: "Transcrever e continuar" }]);
  });

  it("assunto alterado mostra o que mudou dentro dele", () => {
    const t = { id: "t1", name: "Financeiro", when: ["boleto"], handoffDestination: undefined };
    const out = buildPublishDiff(
      { themes: [t] },
      { themes: [{ ...t, when: ["boleto", "pix"], handoffDestination: { type: "department", id: "d1" } }, { id: "t2", name: "Novo" }] },
      catalogs,
    );
    const g = out[0].groups[0];
    expect(g.added).toEqual(["Novo"]);
    expect(g.changed[0].name).toBe("Financeiro");
    expect(g.changed[0].lines).toContainEqual({ label: "Palavras de reconhecimento", added: ["pix"], removed: [] });
    expect(g.changed[0].lines).toContainEqual({ label: "Se transferir", from: "Destino padrão", to: "Departamento: Suporte" });
  });

  it("sem mudanças, sem linhas", () => {
    expect(buildPublishDiff({ a: 1, emojis: "none" }, { emojis: "none", a: 1 }, catalogs)).toEqual([]);
  });
});

describe("focusTextChange", () => {
  it("mostra só o trecho alterado de um texto longo", () => {
    const base = "Você é cordial e objetivo. ".repeat(10);
    const r = focusTextChange(`${base}Nunca prometa prazo.${base}`, `${base}Nunca prometa prazo nem valor.${base}`);
    expect(r.from).toContain("prazo.");
    expect(r.to).toContain("prazo nem valor.");
    expect(r.from.length).toBeLessThan(200);
  });
});
