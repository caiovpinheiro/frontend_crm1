/**
 * Entrada em `/pipeline`: veio de dentro do app ou é abertura "fria"?
 *
 * Os filtros/busca do Kanban moram na URL (fonte da verdade). O
 * localStorage só devolve o que a pessoa tinha ao VOLTAR de outra tela do
 * app (Inbox, Contatos…). Numa abertura fria (F5, link digitado, nova aba)
 * a URL limpa é a vontade explícita da pessoa: nada é reaplicado — era isso
 * que fazia filtros já removidos "ressuscitarem".
 *
 * Como distinguir sem arriscar: o módulo vive enquanto a aba vive, então
 *  - já houve uma visão do funil montada nesta aba → navegação interna;
 *  - senão, o documento carregado (Navigation Timing) não era do funil →
 *    a pessoa chegou aqui por navegação interna a partir de outra tela;
 *  - qualquer outra coisa (inclusive API indisponível) → NÃO reaplica.
 */

let funnelViewMounted = false;

function documentLoadedOutsideFunnel(): boolean {
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return false;
  }
  try {
    const entry = performance.getEntriesByType?.("navigation")?.[0];
    if (!entry?.name) return false;
    const { pathname } = new URL(entry.name);
    return !pathname.startsWith("/pipeline");
  } catch {
    return false;
  }
}

/** A entrada atual no funil é uma navegação interna (pode reaplicar o salvo)? */
export function isInternalFunnelEntry(): boolean {
  return funnelViewMounted || documentLoadedOutsideFunnel();
}

/** Marca que uma visão do funil (Kanban/Lista/Flow) já foi montada nesta aba. */
export function markFunnelViewMounted(): void {
  funnelViewMounted = true;
}

/** Só para testes. */
export function resetFunnelEntryForTests(): void {
  funnelViewMounted = false;
}
