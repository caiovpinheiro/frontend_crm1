/**
 * Regras puras do wizard de modelos do widget: rascunho, avisos, prévia e o
 * que vai no `PUT /api/channels/:id`. Os avisos só orientam: quem decide é o
 * backend, que devolve 400 `{ message }` para o que não aceitar.
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.15.
 */
import {
  WEBCHAT_APPEARANCE_LIMITS as L,
  safeHttpsUrl,
  type WebchatAction,
  type WebchatAppearance,
  type WebchatAppearanceModel,
  type WebchatOption,
  type WebchatTopic,
} from "@/features/webchat-widget/appearance";

import type { ApiChannel } from "../types";
import { parseChannelConfigRecord } from "../types";
import {
  WEBCHAT_CONTEXT_KEY_RE,
  prepareWebchatV2ForSave,
  readWebchatV2Config,
} from "./v2-config";

export const WIZARD_STEPS = [
  "Modelo",
  "Tópicos e botões",
  "Etapas",
  "Contexto e encerramento",
  "Revisar e salvar",
] as const;

export function emptyAppearance(): WebchatAppearance {
  return {
    model: "compact",
    allowExpand: false,
    start: { topics: [] },
    contextBanner: { enabled: false },
    closing: { enabled: false },
  };
}

/** Só o modelo com apoio nasce com o botão de expandir ligado. */
export function withModel(a: WebchatAppearance, model: WebchatAppearanceModel): WebchatAppearance {
  return { ...a, model, allowExpand: model === "assisted" };
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newTopic(): WebchatTopic {
  return { id: newId("t"), label: "", icon: "chat", action: { type: "send_text", text: "" } };
}

export function newOption(): WebchatOption {
  return { id: newId("o"), label: "", action: { type: "send_text", text: "" } };
}

export function moved<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

export type AppearanceProblem = { step: number; message: string };

function actionProblem(action: WebchatAction, name: string): string | null {
  if (action.type === "open_url" && !safeHttpsUrl(action.url)) {
    return `${name}: o link precisa começar com https://.`;
  }
  return null;
}

/** Avisos do rascunho, com o passo em que cada um se resolve (índice de `WIZARD_STEPS`). */
export function appearanceProblems(a: WebchatAppearance): AppearanceProblem[] {
  const out: AppearanceProblem[] = [];
  const add = (step: number, message: string | null) => {
    if (message) out.push({ step, message });
  };
  if (a.start.topics.length > L.topics) add(1, `No máximo ${L.topics} tópicos.`);
  a.start.topics.forEach((topic, i) => {
    const name = topic.label.trim() ? `Tópico "${topic.label.trim()}"` : `Tópico ${i + 1}`;
    if (!topic.label.trim()) add(1, `${name}: falta o título.`);
    add(1, actionProblem(topic.action, name));
    const followUp = topic.followUp;
    if (!followUp) return;
    if (!followUp.question.trim()) add(2, `${name}: falta a pergunta.`);
    if (followUp.options.length < 1 || followUp.options.length > L.options) {
      add(2, `${name}: a pergunta precisa de 1 a ${L.options} opções.`);
    }
    followUp.options.forEach((option, j) => {
      const optionName = `${name}, opção ${j + 1}`;
      if (!option.label.trim()) add(2, `${optionName}: falta o título.`);
      add(2, actionProblem(option.action, optionName));
    });
  });
  const { contextBanner: banner, closing } = a;
  if (banner.enabled) {
    if (!banner.titleKey?.trim() && !banner.subtitleKey?.trim()) {
      add(3, "Faixa de contexto: informe ao menos uma chave.");
    }
    for (const key of [banner.titleKey, banner.subtitleKey]) {
      if (key?.trim() && !WEBCHAT_CONTEXT_KEY_RE.test(key.trim())) {
        add(3, `Faixa de contexto: a chave "${key.trim()}" tem caracteres inválidos.`);
      }
    }
  }
  if (closing.enabled && !closing.resolvedLabel?.trim() && !closing.needHelpLabel?.trim()) {
    add(3, "Encerramento: informe o texto de ao menos um botão.");
  }
  return out;
}

/** Sem texto próprio, o botão envia o próprio título. */
function savedAction(action: WebchatAction, label: string): WebchatAction {
  if (action.type === "send_text") {
    return { type: "send_text", text: action.text.trim() || label.trim() };
  }
  if (action.type === "open_url") {
    const linkLabel = action.label?.trim();
    return {
      type: "open_url",
      url: action.url.trim(),
      ...(linkLabel ? { label: linkLabel } : {}),
    };
  }
  return action;
}

/** No backend, campo ausente mantém o valor gravado: limpar exige `null`. */
const orNull = (v: string | undefined) => v?.trim() || null;

/** Corpo de `config.v2.appearance` no `PUT`. */
export function prepareAppearanceForSave(a: WebchatAppearance) {
  return {
    model: a.model,
    allowExpand: a.allowExpand,
    start: {
      title: orNull(a.start.title),
      subtitle: orNull(a.start.subtitle),
      writeLabel: orNull(a.start.writeLabel),
      topics: a.start.topics.map((topic) => ({
        id: topic.id,
        label: topic.label.trim(),
        icon: topic.icon,
        action: savedAction(topic.action, topic.label),
        ...(topic.followUp
          ? {
              followUp: {
                question: topic.followUp.question.trim(),
                ...(topic.followUp.hint?.trim() ? { hint: topic.followUp.hint.trim() } : {}),
                options: topic.followUp.options.map((option) => ({
                  id: option.id,
                  label: option.label.trim(),
                  action: savedAction(option.action, option.label),
                })),
              },
            }
          : {}),
      })),
    },
    contextBanner: {
      enabled: a.contextBanner.enabled,
      titleKey: orNull(a.contextBanner.titleKey),
      subtitleKey: orNull(a.contextBanner.subtitleKey),
    },
    closing: {
      enabled: a.closing.enabled,
      resolvedLabel: orNull(a.closing.resolvedLabel),
      needHelpLabel: orNull(a.closing.needHelpLabel),
    },
  };
}

/** Corpo do `PUT`: troca só o `appearance` e preserva o resto da config gravada. */
export function appearanceSaveBody(channel: ApiChannel, a: WebchatAppearance) {
  const current = parseChannelConfigRecord(channel.config);
  return {
    name: channel.name,
    defaultPipelineId: channel.defaultPipelineId ?? null,
    config: {
      ...current,
      ...(channel.publicKey ? { publicKey: channel.publicKey } : {}),
      v2: {
        ...prepareWebchatV2ForSave(readWebchatV2Config(current)),
        appearance: prepareAppearanceForSave(a),
      },
    },
  };
}

const PREVIEW_UNTITLED = "Sem título";

function previewAction(action: WebchatAction, label: string): WebchatAction {
  // Link ainda incompleto não abre nada, mas o botão segue visível na prévia.
  if (action.type === "open_url" && !safeHttpsUrl(action.url)) return { type: "write" };
  return savedAction(action, label || PREVIEW_UNTITLED);
}

/** Rascunho como o widget o mostraria, sem sumir com o que ainda está incompleto. */
export function previewAppearance(a: WebchatAppearance): WebchatAppearance {
  return {
    ...a,
    start: {
      ...a.start,
      topics: a.start.topics.map((topic) => {
        const label = topic.label.trim() || PREVIEW_UNTITLED;
        const followUp = topic.followUp;
        return {
          ...topic,
          label,
          action: previewAction(topic.action, label),
          ...(followUp
            ? {
                followUp: {
                  ...followUp,
                  question: followUp.question.trim() || "Pergunta sem texto",
                  options: followUp.options.map((option) => {
                    const optionLabel = option.label.trim() || PREVIEW_UNTITLED;
                    return {
                      ...option,
                      label: optionLabel,
                      action: previewAction(option.action, optionLabel),
                    };
                  }),
                },
              }
            : {}),
        };
      }),
    },
  };
}
