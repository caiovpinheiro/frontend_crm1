import { describe, expect, it } from "vitest";

import {
  mergeInboxPolicy,
  normalizeAttendanceScope,
  normalizeInboxPolicy,
  type InboxPolicy,
} from "@/lib/ai-agents/steering";

/**
 * `InboxPolicy` desta tela é cópia do tipo do backend, e o dialog salva o
 * objeto inteiro. Enquanto a normalização DESCARTAVA chave desconhecida e o
 * `handleSubmit` remontava o PUT a partir de `defaultInboxPolicy()` daqui,
 * todo campo que só o backend conhece voltava ao default a cada "Salvar" —
 * política de transferência, horário de atendente humano e mensagens de
 * fila sumiam sem ninguém abrir a seção relacionada.
 *
 * O ciclo completo (carregar → editar outra coisa → salvar) é onde o bug
 * vivia, então é ele que estes testes travam.
 */

/// Campos que hoje só existem no backend. O `_FUTURO` é fictício de
/// propósito: o teste vale para o PRÓXIMO campo, não só para os de agora.
const BACKEND_ONLY = {
  transferPolicy: "on_request_or_topic",
  inboundBatchWindowMinutes: 45,
  humanAttendancePreEndMinutes: 20,
  queueMessage: "Você está na fila, a equipe atende até as 19h.",
  assignedConsultantMessage: "A Ana já está com o seu atendimento.",
  audioHandoffMessage: "Recebi seu áudio, vou chamar alguém do time.",
  humanRequestKeywords: ["quero falar com humano", "atendente"],
  humanAttendanceHours: {
    enabled: true,
    timezone: "America/Sao_Paulo",
    weekdays: [{ day: 1, start: "08:00", end: "19:00" }],
  },
  media: {
    actions: {
      image: "ask_text",
      video: "ignore",
      audio: "handoff",
      document: "ask_text",
      sticker: "ignore",
      location: "handoff",
      contact: "handoff",
      other: "handoff",
    },
    handoffMessage: "Recebi seu anexo, já chamo a equipe.",
    askTextMessage: "Pode me contar por escrito o que precisa?",
  },
  campoQueSoOBackendConhece: { ligado: true },
} as const;

function loadedFromBackend(): InboxPolicy {
  return normalizeInboxPolicy({
    // O que a tela conhece.
    interceptRetention: true,
    retentionKeywords: ["trancar"],
    unknownAnswerMode: "handoff",
    scope: { allowedPipelineIds: ["pipe-1"], attendWithoutDeal: false },
    // O que só o backend conhece.
    ...BACKEND_ONLY,
  });
}

function raw(p: InboxPolicy): Record<string, unknown> {
  return p as unknown as Record<string, unknown>;
}

describe("InboxPolicy: chave desconhecida sobrevive ao round-trip", () => {
  it("normalizeInboxPolicy preserva o que a tela não conhece", () => {
    const loaded = loadedFromBackend();
    for (const [key, value] of Object.entries(BACKEND_ONLY)) {
      expect(raw(loaded)[key], `${key} foi descartado no load`).toEqual(value);
    }
    // E o campo conhecido continua normalizado.
    expect(loaded.retentionKeywords).toEqual(["trancar"]);
  });

  it("salvar após editar outra seção não apaga o bloco desconhecido", () => {
    const loaded = loadedFromBackend();
    // Reproduz o `handleSubmit`: o operador mexeu só na pilotagem e no
    // escopo, e nunca abriu mídia nem atendimento humano.
    const saved = mergeInboxPolicy(loaded, {
      scope: normalizeAttendanceScope(loaded.scope),
      handoffMessage: "Vou te passar para o time.",
      retentionHandoffMessage: null,
      unknownAnswerMode: "clarify",
      unknownAnswerMessage: null,
      knowledgeExpiredInstruction: null,
      useMessageModels: true,
    });

    expect(saved.unknownAnswerMode).toBe("clarify");
    expect(saved.handoffMessage).toBe("Vou te passar para o time.");
    for (const [key, value] of Object.entries(BACKEND_ONLY)) {
      expect(raw(saved)[key], `${key} foi apagado no Salvar`).toEqual(value);
    }
    // O que vai no corpo do PUT, não só o objeto em memória.
    const body = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
    expect(body.transferPolicy).toBe("on_request_or_topic");
    expect(body.media).toEqual(BACKEND_ONLY.media);
    expect(body.humanAttendanceHours).toEqual(BACKEND_ONLY.humanAttendanceHours);
  });

  it("`handoffMessage` do topo não vaza para dentro de `media`", () => {
    // Os dois blocos têm um campo de mesmo nome; achatar um no outro
    // trocaria a frase do anexo pela frase da fila humana.
    const saved = mergeInboxPolicy(loadedFromBackend(), {
      handoffMessage: "Frase da fila humana.",
    });
    const media = raw(saved).media as Record<string, unknown>;
    expect(saved.handoffMessage).toBe("Frase da fila humana.");
    expect(media.handoffMessage).toBe(BACKEND_ONLY.media.handoffMessage);
  });

  it("edição parcial dentro de `media` não achata as ações por tipo", () => {
    // Preservação rasa devolveria um `media` só com `handoffMessage` e
    // levaria embora a escolha por tipo de mídia.
    const saved = mergeInboxPolicy(loadedFromBackend(), {
      media: { handoffMessage: "Outra frase." },
    } as unknown as Partial<InboxPolicy>);
    const media = raw(saved).media as Record<string, unknown>;
    expect(media.handoffMessage).toBe("Outra frase.");
    expect(media.actions).toEqual(BACKEND_ONLY.media.actions);
    expect(media.askTextMessage).toBe(BACKEND_ONLY.media.askTextMessage);
  });

  it("edição de UM tipo de mídia preserva os outros sete", () => {
    const saved = mergeInboxPolicy(loadedFromBackend(), {
      media: { actions: { image: "handoff" } },
    } as unknown as Partial<InboxPolicy>);
    const actions = (raw(saved).media as Record<string, unknown>)
      .actions as Record<string, unknown>;
    expect(actions.image).toBe("handoff");
    expect(actions.video).toBe("ignore");
    expect(actions.document).toBe("ask_text");
    expect(Object.keys(actions)).toHaveLength(8);
  });

  it("`scope` também preserva campo novo do backend", () => {
    // `scope` sai do PUT vindo de `form.attendanceScope`, então a
    // preservação do nível de cima não cobre ele.
    const scope = normalizeAttendanceScope({
      allowedPipelineIds: ["pipe-1"],
      campoNovoDoBackend: ["algo"],
    });
    expect(scope.allowedPipelineIds).toEqual(["pipe-1"]);
    expect(
      (scope as unknown as Record<string, unknown>).campoNovoDoBackend,
    ).toEqual(["algo"]);
  });

  it("policy ausente ou inválida continua caindo no default da tela", () => {
    expect(normalizeInboxPolicy(null).lowConfidenceHandoff).toBe(true);
    expect(normalizeInboxPolicy("nada").retentionKeywords).toEqual([]);
    expect(normalizeInboxPolicy([]).unknownAnswerMode).toBe("handoff");
  });
});
