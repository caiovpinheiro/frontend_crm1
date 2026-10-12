/**
 * Widget ainda sem resposta: a busca está pendente ou nem foi disparada (a
 * carga por intersecção só liga a query quando o card chega perto da tela).
 * Nesse estado o card mostra esqueleto — nunca o estado vazio ("Sem
 * tabulações no período", "Sem uso hoje"), que só vale com a resposta em mãos.
 * Com erro e sem dado, quem decide é o card (erro com "tentar de novo").
 */
export function queryWaiting(query: { data?: unknown; error?: unknown }): boolean {
  return query.data === undefined && !query.error;
}

/**
 * Cards da aba Negócios (uso, insights, campos): esqueleto enquanto a busca
 * roda ou os filtros ainda assentam (`filtersReady` falso). Busca desligada de
 * vez com os filtros prontos (prévia, card sem etapa) não fica em esqueleto
 * eterno: o card aparece com "—".
 */
export function cardQueryWaiting(
  query: { data?: unknown; error?: unknown; isEnabled: boolean },
  filtersReady: boolean,
): boolean {
  return queryWaiting(query) && (query.isEnabled || !filtersReady);
}
