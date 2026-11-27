/**
 * Cola entre o template aprovado na Meta e o `config.components` do passo
 * `send_whatsapp_template`.
 *
 * O corpo aprovado na Meta só entende `{{1}}`/`{{2}}` (ou nomes, em templates
 * NAMED). Token do CRM escrito dentro do template chega literal no aluno — o
 * caminho correto é o operador preencher CADA placeholder aqui, com texto fixo
 * ou com um token do CRM (`{{dealCustomFields.x}}`), que o executor resolve no
 * envio.
 *
 * Formato de gravação e leitura vêm do contrato compartilhado com o backend
 * (`@/lib/meta-whatsapp/build-template-components`); aqui só ficam as regras
 * de tela: descobrir os slots e reconciliar valores na troca de template.
 */

import {
  buildTemplateComponents,
  extractMetaPlaceholderKeys,
  renderTemplatePreview,
  extractUnsupportedPlaceholderTokens,
  isMetaPlaceholderKey,
  templateVariablesFromSendComponents,
  type TemplateVariableInput,
} from "@/lib/meta-whatsapp/build-template-components";
import {
  operatorVariableCrmField,
  type OperatorVariableMeta,
} from "@/lib/meta-whatsapp/operator-template-variables";

/**
 * Um campo da tela: o placeholder `key` dentro de `component`. Em botão,
 * `buttonIndex` é a posição do botão na seção BUTTONS do template (o `index`
 * que a Meta espera no envio) e `buttonText`/`buttonUrl` servem ao rótulo.
 */
export type TemplateVariableSlot = {
  component: "body" | "header" | "button";
  key: string;
  buttonIndex?: number;
  buttonText?: string;
  buttonUrl?: string;
};

/** Botão do template como o catálogo devolve (ordem da seção BUTTONS). */
export type TemplateButtonInfo = {
  type?: string | null;
  text?: string | null;
  url?: string | null;
};

function slotId(component: string, key: string, buttonIndex?: number | null): string {
  return component === "button"
    ? `button:${buttonIndex ?? 0}::${key}`
    : `${component}::${key}`;
}

function varSlotId(v: TemplateVariableInput): string {
  return slotId(v.component ?? "body", String(v.key ?? "").trim(), v.buttonIndex);
}

/** Id estável do slot — chave de estado em telas que guardam valores por campo. */
export function templateSlotId(slot: TemplateVariableSlot): string {
  return slotId(slot.component, slot.key, slot.buttonIndex);
}

/** Botão URL com sufixo dinâmico (`https://x/{{1}}`), com o índice da Meta. */
export type TemplateUrlButton = { index: number; text: string; url: string; dynamic: boolean };

/**
 * Botões URL do template, com o índice na ordem da seção BUTTONS (inclui
 * quick reply/Flow na contagem, como a Meta). Usado no preview.
 */
export function templateUrlButtons(
  buttons: TemplateButtonInfo[] | null | undefined,
): TemplateUrlButton[] {
  const out: TemplateUrlButton[] = [];
  (buttons ?? []).forEach((b, index) => {
    if (String(b?.type ?? "").toUpperCase() !== "URL") return;
    const url = String(b?.url ?? "").trim();
    if (!url) return;
    out.push({
      index,
      text: String(b?.text ?? "").trim(),
      url,
      dynamic: extractMetaPlaceholderKeys(url).length > 0,
    });
  });
  return out;
}

/**
 * Um slot por `{{n}}` na URL de cada botão URL dinâmico. Quick reply, Flow,
 * telefone e URL fixa não têm parâmetro de envio, então não geram campo.
 */
export function templateButtonSlots(
  buttons: TemplateButtonInfo[] | null | undefined,
): TemplateVariableSlot[] {
  const slots: TemplateVariableSlot[] = [];
  for (const b of templateUrlButtons(buttons)) {
    if (!b.dynamic) continue;
    for (const key of extractMetaPlaceholderKeys(b.url)) {
      slots.push({
        component: "button",
        key,
        buttonIndex: b.index,
        buttonText: b.text,
        buttonUrl: b.url,
      });
    }
  }
  return slots;
}

/** URL final do botão, com o sufixo preenchido (placeholder vazio fica `{{1}}`). */
export function renderTemplateButtonUrl(
  button: Pick<TemplateUrlButton, "index" | "url">,
  vars: TemplateVariableInput[],
): string {
  const own = templateVariablesOf(vars, "button", button.index).filter((v) =>
    (v.value ?? "").trim(),
  );
  return renderTemplatePreview(button.url, own);
}

/**
 * Slots na ordem em que o contato lê a mensagem (cabeçalho antes do corpo),
 * que é também a ordem dos componentes gerados por `buildTemplateComponents`.
 *
 * Só entram os marcadores que a Meta promove a parâmetro. Token como
 * `{{dealCustomFields.x}}` escrito dentro do corpo aprovado é texto literal
 * para ela: oferecer campo para ele faria o passo gravar parâmetro num
 * template que, do lado da Meta, não tem nenhum — e o envio voltaria 132000.
 */
/**
 * Slots do envio no chat. O texto do cabeçalho manda quando a Meta devolveu
 * o template. Se o catálogo ainda não trouxe esse texto, o mapeamento gravado
 * na criação (`component: "header"`) entra mesmo assim — senão o `{{1}}` do
 * cabeçalho some e o envio volta 132000.
 */
export function chatTemplateSlots(
  bodyText: string | null | undefined,
  headerText: string | null | undefined,
  operatorVariables: OperatorVariableMeta[] | null | undefined,
  buttons?: TemplateButtonInfo[] | null,
): TemplateVariableSlot[] {
  const slots = templateVariableSlots(bodyText, headerText, buttons);
  const have = new Set(slots.map((s) => `${s.component}::${s.key}`));
  const headerFromConfig: TemplateVariableSlot[] = [];
  for (const v of operatorVariables ?? []) {
    if (v.component !== "header") continue;
    const key = String(v.key ?? "").trim();
    if (!key || !isMetaPlaceholderKey(key)) continue;
    const id = `header::${key}`;
    if (have.has(id)) continue;
    have.add(id);
    headerFromConfig.push({ component: "header", key });
  }
  return [...headerFromConfig, ...slots];
}

export function templateVariableSlots(
  bodyText: string | null | undefined,
  headerText?: string | null,
  buttons?: TemplateButtonInfo[] | null,
): TemplateVariableSlot[] {
  const slots: TemplateVariableSlot[] = [];
  for (const key of extractMetaPlaceholderKeys(headerText ?? "")) {
    slots.push({ component: "header", key });
  }
  for (const key of extractMetaPlaceholderKeys(bodyText ?? "")) {
    slots.push({ component: "body", key });
  }
  slots.push(...templateButtonSlots(buttons));
  return slots;
}

/**
 * Tokens entre chaves que a Meta ignora, na ordem em que aparecem. Não geram
 * campo; servem para explicar ao operador por que a tela não pede nada.
 */
export function unsupportedTemplateTokens(
  bodyText: string | null | undefined,
  headerText?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of [headerText ?? "", bodyText ?? ""]) {
    for (const token of extractUnsupportedPlaceholderTokens(text)) {
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/**
 * Alinha os valores já gravados aos slots do template atual: mantém o que
 * casa por componente+chave e DESCARTA o resto. Parâmetro órfão de um template
 * anterior faria a Meta rejeitar o envio (132000), então trocar de template
 * precisa limpar, não acumular.
 */
export function reconcileTemplateVariables(
  slots: TemplateVariableSlot[],
  previous: TemplateVariableInput[] | null | undefined,
): TemplateVariableInput[] {
  const byId = new Map(
    (previous ?? []).map((v) => [varSlotId(v), v.value == null ? "" : String(v.value)]),
  );
  return slots.map((s) => ({
    component: s.component,
    key: s.key,
    value: byId.get(templateSlotId(s)) ?? "",
    ...(s.component === "button" ? { buttonIndex: s.buttonIndex ?? 0 } : {}),
  }));
}

/**
 * Aplica o mapeamento padrão definido na criação do template
 * (`WhatsAppTemplateConfig.operatorVariables[].crmField`) aos slots ainda
 * vazios. O operador continua livre para sobrescrever: valor já preenchido
 * nunca é tocado.
 *
 * Cabeçalho e corpo podem ter a mesma chave (`{{1}}`); o padrão usa o componente.
 */
export function applyOperatorVariableDefaults(
  vars: TemplateVariableInput[],
  operatorVariables: OperatorVariableMeta[] | null | undefined,
): TemplateVariableInput[] {
  if (!operatorVariables?.length) return vars;
  return vars.map((v) => {
    if ((v.value ?? "").trim()) return v;
    // Mapeamento padrão da criação só cobre cabeçalho e corpo.
    if (v.component === "button") return v;
    const component = v.component === "header" ? "header" : "body";
    const crmField = operatorVariableCrmField(
      operatorVariables,
      String(v.key ?? "").trim(),
      component,
    );
    return crmField ? { ...v, value: crmField } : v;
  });
}

/** Estado da UI a partir do passo salvo, já reconciliado com o template atual. */
export function templateVariablesFromConfig(
  slots: TemplateVariableSlot[],
  components: unknown,
): TemplateVariableInput[] {
  return reconcileTemplateVariables(
    slots,
    templateVariablesFromSendComponents(Array.isArray(components) ? components : undefined),
  );
}

/** Substitui o valor de um slot, preservando ordem e os demais valores. */
export function setTemplateVariableValue(
  vars: TemplateVariableInput[],
  slot: TemplateVariableSlot,
  value: string,
): TemplateVariableInput[] {
  const id = templateSlotId(slot);
  return vars.map((v) => (varSlotId(v) === id ? { ...v, value } : v));
}

export function templateVariableValue(
  vars: TemplateVariableInput[],
  slot: TemplateVariableSlot,
): string {
  const id = templateSlotId(slot);
  const hit = vars.find((v) => varSlotId(v) === id);
  return hit?.value ?? "";
}

/**
 * Recorta as variáveis de um componente. Cabeçalho, corpo e cada botão têm
 * numeração independente na Meta (todos podem ter `{{1}}`), então o preview de
 * cada um precisa ser renderizado só com as suas.
 */
export function templateVariablesOf(
  vars: TemplateVariableInput[],
  component: "body" | "header" | "button",
  buttonIndex?: number,
): TemplateVariableInput[] {
  return vars.filter(
    (v) =>
      (v.component ?? "body") === component &&
      (component !== "button" || buttonIndex == null || (v.buttonIndex ?? 0) === buttonIndex),
  );
}

/** Rótulo do campo: `{{1}}` posicional ou o nome, em templates NAMED. */
export function templateVariableLabel(slot: TemplateVariableSlot): string {
  if (slot.component === "button") return templateButtonSlotLabel(slot);
  const where = slot.component === "header" ? "Cabeçalho" : "Variável";
  return `${where} {{${slot.key}}}`;
}

/**
 * `Botão 'Acessar prova' — final da URL (https://prova.exemplo.com.br/…)`.
 * O que vem antes do `{{n}}` é fixo no template aprovado; o operador só
 * preenche o resto.
 */
export function templateButtonSlotLabel(slot: TemplateVariableSlot): string {
  const name = slot.buttonText?.trim()
    ? `Botão '${slot.buttonText.trim()}'`
    : `Botão ${(slot.buttonIndex ?? 0) + 1}`;
  const url = slot.buttonUrl?.trim() ?? "";
  const placeholders = url.match(/\{\{[^}]+\}\}/g) ?? [];
  const what = placeholders.length > 1 ? `trecho {{${slot.key}}} da URL` : "final da URL";
  if (!url) return `${name} — ${what}`;
  const base = url.replace(/\{\{[^}]+\}\}/g, "…");
  return `${name} — ${what} (${base})`;
}

export function countMissingTemplateVariables(vars: TemplateVariableInput[]): number {
  return vars.filter((v) => (v.value ?? "").trim() === "").length;
}

/**
 * `true` quando o array gravado já corresponde ao que a UI produziria — usado
 * pelos efeitos de sincronização para não entrar em loop de re-render.
 */
export function sameTemplateComponents(current: unknown, next: unknown[]): boolean {
  const cur = Array.isArray(current) ? current : [];
  return JSON.stringify(cur) === JSON.stringify(next);
}

export { buildTemplateComponents, type TemplateVariableInput };
