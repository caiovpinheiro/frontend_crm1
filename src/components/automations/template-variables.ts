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
  extractUnsupportedPlaceholderTokens,
  templateVariablesFromSendComponents,
  type TemplateVariableInput,
} from "@/lib/meta-whatsapp/build-template-components";

/** Um campo da tela: o placeholder `key` dentro de `component`. */
export type TemplateVariableSlot = {
  component: "body" | "header";
  key: string;
};

function slotId(component: string, key: string): string {
  return `${component}::${key}`;
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
export function templateVariableSlots(
  bodyText: string | null | undefined,
  headerText?: string | null,
): TemplateVariableSlot[] {
  const slots: TemplateVariableSlot[] = [];
  for (const key of extractMetaPlaceholderKeys(headerText ?? "")) {
    slots.push({ component: "header", key });
  }
  for (const key of extractMetaPlaceholderKeys(bodyText ?? "")) {
    slots.push({ component: "body", key });
  }
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
    (previous ?? []).map((v) => [
      slotId(v.component ?? "body", String(v.key ?? "").trim()),
      v.value == null ? "" : String(v.value),
    ]),
  );
  return slots.map((s) => ({
    component: s.component,
    key: s.key,
    value: byId.get(slotId(s.component, s.key)) ?? "",
  }));
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
  return vars.map((v) =>
    (v.component ?? "body") === slot.component && v.key === slot.key ? { ...v, value } : v,
  );
}

export function templateVariableValue(
  vars: TemplateVariableInput[],
  slot: TemplateVariableSlot,
): string {
  const hit = vars.find(
    (v) => (v.component ?? "body") === slot.component && v.key === slot.key,
  );
  return hit?.value ?? "";
}

/**
 * Recorta as variáveis de um componente. Cabeçalho e corpo têm numeração
 * independente na Meta (os dois podem ter `{{1}}`), então o preview de cada um
 * precisa ser renderizado só com as suas.
 */
export function templateVariablesOf(
  vars: TemplateVariableInput[],
  component: "body" | "header",
): TemplateVariableInput[] {
  return vars.filter((v) => (v.component ?? "body") === component);
}

/** Rótulo do campo: `{{1}}` posicional ou o nome, em templates NAMED. */
export function templateVariableLabel(slot: TemplateVariableSlot): string {
  const where = slot.component === "header" ? "Cabeçalho" : "Variável";
  return `${where} {{${slot.key}}}`;
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
