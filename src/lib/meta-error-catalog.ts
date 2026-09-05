/**
 * Espelho (frontend) do catálogo PT-BR de erros da WhatsApp Cloud API.
 *
 * Fonte da verdade: `backend/src/lib/meta-whatsapp/error-catalog.ts`. Mantido
 * aqui para traduzir, em tempo de render, mensagens de erro que foram
 * persistidas em inglês ANTES de a tradução no backend existir (histórico),
 * ou caso algum caminho de envio ainda não passe pela tradução.
 *
 * `translateSendError()` é idempotente: se o texto já vier traduzido pelo
 * backend (contém "(Meta:"), é retornado sem alteração.
 */

const CATALOG: Record<number, string> = {
  // ── Genéricos / infra ───────────────────────────────────────
  1: "Erro desconhecido ao enviar pela Meta. Tente reenviar. Se persistir, verifique a saúde da conta WhatsApp e o status da Cloud API.",
  // Oficial Meta: downtime/overload (HTTP 503). O texto Graph "Something went
  // wrong" é genérico — NÃO é janela 24h (131047) nem token inválido (190).
  2: "Serviço da Meta temporariamente indisponível. Tente novamente em alguns minutos.",
  // ── Autenticação / autorização ──────────────────────────────
  0: "Falha de autenticação com a Meta. Verifique o token de acesso do canal nas configurações.",
  3: "A app não tem permissão para esta ação na Cloud API. Confira as permissões (whatsapp_business_messaging) no app da Meta.",
  10: "Permissão negada pela Meta para esta operação. Revise as permissões e o status do app no Gerenciador de Negócios.",
  190: "Token de acesso expirado ou inválido. Reconecte o canal WhatsApp para gerar um novo token.",
  200: "Permissão de API ausente para enviar mensagens. Adicione a permissão whatsapp_business_messaging ao app.",
  // ── Limites / throttling ────────────────────────────────────
  4: "Limite de requisições da API atingido (rate limit). Reduza a velocidade de envio e tente novamente.",
  80007: "Limite de taxa da conta WhatsApp Business (WABA) atingido. Aguarde e reduza a velocidade de envio.",
  130429: "Limite de throughput de mensagens atingido (Cloud API). Diminua a velocidade de disparo; o envio será reenfileirado.",
  131048: "Limite de spam atingido — a qualidade da conta restringiu envios. Melhore a qualidade das mensagens; aguarde a recuperação do número.",
  131056: "Muitas mensagens para o mesmo destinatário em pouco tempo (pair rate limit). Espace os envios para o mesmo contato.",
  // ── Elegibilidade / billing ─────────────────────────────────
  131042: "Não há método de pagamento configurado na conta WhatsApp Business. Adicione um cartão/forma de pagamento no Billing Hub da Meta para liberar os envios.",
  131031: "Conta WhatsApp Business bloqueada por violação de política. Verifique notificações da Meta e a saúde da conta no Gerenciador.",
  368: "Conta temporariamente bloqueada por violações de política. Aguarde o desbloqueio e revise as políticas da Meta.",
  // ── Entregabilidade / janela 24h ────────────────────────────
  131026: "Mensagem não pôde ser entregue ao destinatário. O número pode não ter WhatsApp, não ter aceitado os termos, ou estar inalcançável. Confirme o número.",
  131047: "Fora da janela de 24h — só é possível reengajar com template aprovado. Use uma campanha de template (HSM) aprovado em vez de texto livre.",
  131049: "A Meta limitou esta mensagem de marketing para preservar o engajamento. Envie menos mensagens de marketing ao mesmo usuário; espace os disparos.",
  130472: "Número do usuário faz parte de um experimento da Meta (marketing). Comportamento esperado em alguns números; tente outro destinatário.",
  131050: "O destinatário recusou mensagens de marketing neste WhatsApp. Não reenvie marketing a este número. Use conversa de serviço (janela 24h) ou outro canal.",
  131021: "O destinatário não pode ser o próprio remetente. Use um número de destino diferente do número de envio.",
  // ── Parâmetros / payload ────────────────────────────────────
  100: "Parâmetro inválido na requisição à Meta. Revise o conteúdo/variáveis da mensagem ou template.",
  131008: "Parâmetro obrigatório ausente na requisição. Verifique se todos os campos do template/mensagem foram preenchidos.",
  131009: "Valor de parâmetro inválido. Revise os valores enviados (telefone, variáveis, mídia).",
  131051: "Tipo de mensagem não suportado. Verifique o tipo de conteúdo enviado.",
  131052: "Falha ao baixar a mídia do destinatário. Tente reenviar; verifique a URL/arquivo de mídia.",
  131053: "Falha ao enviar a mídia para a Meta. Verifique o formato/tamanho do arquivo e tente novamente.",
  // ── Templates ───────────────────────────────────────────────
  132000: "Número de variáveis do template não bate com o esperado. Ajuste a quantidade de variáveis para corresponder ao template aprovado.",
  132001: "Template não existe para este nome/idioma. Confirme o nome exato e o idioma (ex.: pt_BR) do template aprovado.",
  132005: "Texto do template ficou longo demais após preencher as variáveis. Reduza o tamanho do conteúdo das variáveis.",
  132007: "Conteúdo viola a política de templates da Meta. Revise o texto do template conforme as políticas da Meta.",
  132012: "Formato de parâmetro do template incorreto. Confira o formato esperado das variáveis do template.",
  132015: "Template pausado por baixa qualidade. Use outro template ou aguarde a reativação na Meta.",
  132016: "Template desativado por violação de política. Crie/aprove um novo template em conformidade.",
  // ── Infra / temporários ─────────────────────────────────────
  131000: "Erro genérico da Meta ao processar o envio. Tente novamente; se persistir, verifique o fbtrace_id com o suporte.",
  131016: "Serviço da Meta temporariamente indisponível. Tente novamente em alguns minutos.",
  133004: "Servidor da Meta temporariamente indisponível. Tente novamente em alguns minutos.",
  131057: "Conta em manutenção na Meta. Aguarde a manutenção terminar e tente novamente.",
};

/** Motivo PT-BR de um código de erro da Meta, ou `null` se não catalogado. */
export function metaErrorReasonPtBr(code: number | null | undefined): string | null {
  if (typeof code !== "number" || Number.isNaN(code)) return null;
  return CATALOG[code] ?? null;
}

/** Extrai o código de erro da Meta de um texto cru ("(code N)" ou "(cód. N)"). */
export function extractMetaErrorCode(raw: string | null | undefined): number | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const m =
    text.match(/\bcode\s+(\d+)/i) ?? text.match(/\bc[oó]d\.\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Resumo CURTO do erro de envio para exibir em tooltip/timeline/logs.
 *
 * Diferente de `translateSendError` (que preserva o texto cru da Meta — útil
 * para copiar), aqui devolvemos só o motivo PT-BR + código. A mensagem da Meta
 * costuma ser enorme (ex.: link do Billing Hub) e polui a UI.
 */
/**
 * Corpo do erro sem o sufixo de código (o balão de UI mostra `cód. N` à parte).
 */
export function summarizeSendErrorBody(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "Falha no envio — sem detalhes da Meta.";

  const code = extractMetaErrorCode(text);
  const reason = metaErrorReasonPtBr(code);
  if (reason) return reason;

  const beforeMeta = text.split("(Meta:")[0].trim();
  const base = (beforeMeta || text)
    .replace(/\s*\((?:code|c[oó]d\.)\s*\d+[^)]*\)\s*$/i, "")
    .trim();
  return base.length > 180 ? `${base.slice(0, 177).trim()}…` : base || text;
}

export function summarizeSendError(raw: string | null | undefined): string {
  const body = summarizeSendErrorBody(raw);
  const code = extractMetaErrorCode(raw);
  if (code != null && !/\bc(?:ode|ód\.)\s/i.test(body)) {
    return `${body} (cód. ${code})`;
  }
  return body;
}

/**
 * Traduz um `sendError` para PT-BR em tempo de render.
 *
 * - Idempotente: se já contém "(Meta:" (traduzido pelo backend), retorna igual.
 * - Extrai o `code` do sufixo "(code N, ...)" e, se catalogado, recompõe no
 *   mesmo formato do backend: "motivo (Meta: <texto original>) (code N)".
 * - Sem code conhecido ou code não catalogado: retorna o texto original.
 */
export function translateSendError(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "Falha no envio — sem detalhes da Meta.";
  if (text.includes("(Meta:")) return text;

  const codeMatch = text.match(/\bcode\s+(\d+)/i);
  const code = codeMatch ? Number(codeMatch[1]) : null;
  const reason = metaErrorReasonPtBr(code);
  if (!reason) return text;

  // Remove o sufixo "(code N, fbtrace=...)" para isolar o texto cru da Meta.
  const suffix = text.match(/\s*\(code\s+\d+[^)]*\)\s*$/i);
  const human = suffix && suffix.index !== undefined ? text.slice(0, suffix.index).trim() : text;
  const codePart = code != null ? ` (code ${code})` : "";
  return human ? `${reason} (Meta: ${human})${codePart}` : `${reason}${codePart}`;
}
