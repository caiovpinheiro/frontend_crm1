/**
 * "De → para" da publicação: compara a versão publicada com o rascunho e
 * descreve cada mudança com o valor antigo e o novo, em português da tela.
 * Listas mostram o que entrou e o que saiu; assuntos e atalhos alterados
 * mostram o que mudou dentro de cada um.
 */

export type NameCatalogs = {
  departments?: Array<{ id: string; name: string }>;
  distributionRules?: Array<{ id: string; name: string }>;
  users?: Array<{ id: string; name: string }>;
  aiAgents?: Array<{ id: string; name: string }>;
  messageTemplates?: Array<{ id: string; name: string }>;
  knowledgeDocs?: Array<{ id: string; name: string }>;
  channels?: Array<{ id: string; name: string }>;
  contactCustomFields?: Array<{ id: string; name: string }>;
  dealCustomFields?: Array<{ id: string; name: string }>;
  models?: Array<{ id: string; name: string }>;
  pipelines?: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
};

export type DiffLine = {
  label: string;
  /** Troca de valor: de → para. */
  from?: string;
  to?: string;
  added?: string[];
  removed?: string[];
  /** Mudança sem valor legível (ex.: só a ordem). */
  note?: string;
};

/** Item de lista (assunto, atalho) com as mudanças dentro dele. */
export type DiffItem = { name: string; lines: DiffLine[] };

export type DiffGroup = { label: string; added: string[]; removed: string[]; changed: DiffItem[]; reordered: boolean };

export type DiffSection = { section: string; lines: DiffLine[]; groups: DiffGroup[] };

export const CHANGE_GROUPS: Array<{ section: string; keys: Array<[string, string]> }> = [
  {
    section: "Quem é o agente",
    keys: [["name", "Nome"], ["tone", "Tom de voz"], ["responseLength", "Tamanho das respostas"], ["emojis", "Emojis"], ["globalRules", "Regras que ele sempre segue"], ["responseBehavior", "Estilo de resposta"], ["replyEnding", "Como terminar as respostas"]],
  },
  {
    section: "O que ele sabe",
    keys: [["allowedKnowledgeDocIds", "Materiais em uso"], ["calendar", "Calendário"], ["contextFields", "Dados do cliente"], ["variables", "Informações da empresa"], ["derivedFields", "Informações montadas"], ["allowedMessageModelIds", "Mensagens prontas"], ["messageModelAdapt", "Adaptar mensagens prontas"], ["knowledgeSearch", "Busca nos materiais"], ["productPolicy", "Catálogo"], ["dealSelection", "Negócio usado"]],
  },
  {
    section: "Do que ele cuida",
    keys: [["themes", "Assuntos"], ["rules", "Atalhos automáticos"], ["enabledTools", "O que ele pode fazer"], ["actionOptions", "O que ele pode fazer"], ["scope", "Fora do escopo"], ["themeRecognition", "Reconhecimento de assunto"]],
  },
  {
    section: "Começo e fim da conversa",
    keys: [["entry", "Boas-vindas e confirmação"], ["media", "Áudio, imagem e arquivo"], ["closure", "Encerramento"], ["inactivity", "Cliente sem responder"], ["tabulation", "Tabulação"]],
  },
  {
    section: "Quando chama a equipe",
    keys: [["handoff", "Transferência"], ["businessHours", "Horário de atendimento"], ["sentiment", "Cliente irritado"], ["fallback", "Quando não souber"], ["limits", "Limites"]],
  },
  {
    section: "Publicação",
    keys: [["channelIds", "Números de WhatsApp"], ["allowedPhoneNumbers", "Fase de teste"], ["autonomyMode", "Como ele responde"], ["model", "Modelo de IA"], ["simulateTyping", "Simular digitação"], ["markMessagesRead", "Marcar como lida"], ["typingPerCharMs", "Ritmo de digitação"], ["allowedDomains", "Sites permitidos"], ["structuredOutput", "Formato da resposta"]],
  },
];

/** Rótulos dos campos internos (caminho sem índices de lista). */
const PATH_LABEL: Record<string, string> = {
  "media.audio": "Áudio",
  "media.audio.action": "Áudio",
  "media.image": "Imagem",
  "media.image.action": "Imagem",
  "media.document": "Documento",
  "media.document.action": "Documento",
  "media.confirmUnderstanding": "Confirmar o que entendeu",

  "entry.openingEnabled": "Mandar boas-vindas",
  "entry.openingMessage": "Mensagem de boas-vindas",
  "entry.confirmContact": "Confirmar os dados do cliente",
  "entry.confirmationFields": "Dados confirmados",
  "entry.confirmationMessage": "Mensagem de confirmação",
  "entry.confirmationMode": "Quando confirmar",
  "entry.identificationMessage": "Mensagem para pedir identificação",
  "entry.onDealNotFound": "Quando não achar o negócio",
  "entry.automationVariablesMapping": "Variáveis da automação",
  "entry.maxAttempts": "Tentativas de identificação",

  "handoff.defaultDestination": "Destino padrão",
  "handoff.message": "Mensagem ao transferir",
  "handoff.humanRequestKeywords": "Palavras que pedem atendente",
  "handoff.whileQueued": "Cliente escreve na fila",
  "handoff.queuedMessage": "Aviso de fila",
  "fallback.confusion.action": "Cliente não entendeu",
  "closure.shortReplyMessage": "Resposta curtinha depois de encerrar",
  "closure.postCloseMessages.courtesy": "Depois de encerrar: resposta ao agradecimento",
  "closure.postCloseMessages.new_demand": "Depois de encerrar: resposta ao pedido novo",
  "closure.postCloseMessages.ambiguous": "Depois de encerrar: resposta quando não dá para saber",
  "closure.postCloseQuestion.message": "Pergunta depois de encerrar",
  "closure.postCloseQuestion.yesLabel": "Botão “sim” depois de encerrar",
  "closure.postCloseQuestion.noLabel": "Botão “não” depois de encerrar",
  "inactivity.enabled": "Avisar e encerrar sem resposta",
  "inactivity.closeAfter": "Encerrar sem resposta (min)",
  "inactivity.nudgeAfter": "Aviso sem resposta (min)",
  "inactivity.nudgeMessage": "Aviso sem resposta",
  "inactivity.closeMessage": "Mensagem ao encerrar sem resposta",
  "tabulation.enabled": "Tabular a conversa",
  "tabulation.when": "Quando tabular",
  "tabulation.fallbackId": "Tabulação padrão",
  "tabulation.byTheme": "Tabulação por assunto",
  "tabulation.strategy": "Como escolher a tabulação",
  "tabulation.allowedIds": "Tabulações que o agente pode usar",
  "tabulation.instructions": "Orientações para tabular",
  "themeRecognition.minSimilarity": "Similaridade para escolher assunto",
  "themeRecognition.switchSimilarity": "Similaridade para trocar assunto",
  "themeRecognition.switchMargin": "Folga para trocar assunto",
  "themeRecognition.shortMessageWords": "Palavras para reconsiderar assunto",
  "knowledgeSearch.minSimilarity": "Similaridade mínima dos trechos",

  "closure.postCloseWindowHours": "Janela depois de encerrar (horas)",
  "closure.courtesyBehavior": "Agradecimento depois de encerrar",
  "closure.newDemandBehavior": "Novo pedido depois de encerrar",
  "closure.ambiguousBehavior": "Mensagem ambígua depois de encerrar",
  "closure.returnToOriginStage": "Voltar à etapa de origem",
  "closure.goodbyeMessage": "Mensagem de despedida",

  "limits.maxCourtesyReplies": "Respostas de cortesia",
  "limits.maxHelpOffers": "Ofertas de ajuda",
  "limits.maxStalledExchanges": "Trocas sem avanço",
  "limits.stalledExchangesAction": "Quando a conversa travar",
  "limits.nonsenseLimit": "Mensagens sem sentido",
  "limits.nonsenseAction": "Depois das mensagens sem sentido",
  "limits.silenceMinutes": "Minutos em silêncio",
  "limits.loopDetectionWindowMinutes": "Janela de repetição (min)",
  "limits.maxLoopCount": "Repetições",
  "limits.maxAiTransfers": "Transferências entre agentes",

  "fallback.unknown.message": "Quando não souber: mensagem",
  "fallback.unknown.action": "Quando não souber: o que fazer",
  "fallback.humanRequest.message": "Pedido de atendente: mensagem",
  "fallback.noSource.message": "Sem material: mensagem",
  "fallback.error.message": "Erro: mensagem",

  "scope.message": "Mensagem fora do escopo",
  "scope.forbidden": "Assuntos que ele não trata",
  "actionOptions.tags": "Etiquetas que pode usar",
  "actionOptions.stageIds": "Etapas para onde pode mover",

  "sentiment.enabled": "Detectar insatisfação",
  "sentiment.threshold": "A partir de",
  "sentiment.action": "O que fazer",

  "businessHours.timezone": "Fuso horário",
  "businessHours.weekdays": "Dias e horários",

  "productPolicy.enabled": "Usar o catálogo",
  "productPolicy.maxItems": "Máximo de itens",
  "productPolicy.showPrice": "Mostrar preço",
  "productPolicy.showConditions": "Mostrar condições",
  "productPolicy.showImage": "Mostrar imagem",
  "productPolicy.showLink": "Mostrar link",
  "productPolicy.citableFields": "Campos que pode citar",
  "productPolicy.actions": "Ações",

  "contextFields.contact": "Campos do cliente",
  "contextFields.deal": "Campos do negócio",
  "calendar.events": "Datas",

  "themes.name": "Nome",
  "themes.when": "Palavras de reconhecimento",
  "themes.examples": "Exemplos de mensagem",
  "themes.instructions": "Instruções",
  "themes.allowedTools": "O que ele pode fazer",
  "themes.allowedKnowledgeDocIds": "Materiais",
  "themes.allowedMessageModelIds": "Mensagens prontas",
  "themes.productPolicy": "Catálogo",
  "themes.productPolicy.enabled": "Usar o catálogo",
  "themes.answerBy": "Quem responde",
  "themes.directHandoff": "Só encaminha",
  "themes.handoffDestination": "Se transferir",
  "themes.replyEnding": "Como terminar as respostas",
  "themes.replyEnding.inherit": "Frases deste assunto",
  "themes.replyEnding.procedure.enabled": "Fecho depois de passo a passo",
  "themes.replyEnding.procedure.phrases": "Frases depois de passo a passo",
  "themes.replyEnding.info.enabled": "Fecho depois de informação",
  "themes.replyEnding.info.phrases": "Frases depois de informação",
  "replyEnding.procedure.enabled": "Fecho depois de passo a passo",
  "replyEnding.procedure.phrases": "Frases depois de passo a passo",
  "replyEnding.info.enabled": "Fecho depois de informação",
  "replyEnding.info.phrases": "Frases depois de informação",
  "replyEnding.procedure.buttons": "Botões depois de passo a passo",
  "replyEnding.info.buttons": "Botões depois de informação",
  "themes.replyEnding.procedure.buttons": "Botões depois de passo a passo",
  "themes.replyEnding.info.buttons": "Botões depois de informação",

  "rules.name": "Nome",
  "rules.enabled": "Ligado",
  "rules.order": "Ordem",
  "rules.conditions": "Condições",
  "rules.actions": "Ações",
};

const YES_NO = { true: "Sim", false: "Não" } as const;

/** Rótulos de valores fixos, por campo. */
const VALUE_LABEL: Record<string, Record<string, string>> = {
  responseLength: { short: "Curtas", medium: "Médias", long: "Longas" },
  emojis: { none: "Nenhum", light: "Poucos", moderate: "À vontade" },
  responseBehavior: { objective: "Mais previsível", balanced: "Equilibrado", natural: "Mais natural", creative: "Mais criativo" },
  autonomyMode: { auto: "Responder sozinho", suggest: "Sugerir para a equipe" },
  dealSelection: { latest: "Usar o mais recente", ask: "Perguntar ao cliente qual" },
  typingPerCharMs: { "10": "Rápido", "25": "Normal", "50": "Calmo", "90": "Lento" },
  "entry.onDealNotFound": { ask_identification: "Pedir os dados", create_deal: "Criar um negócio e seguir", handoff: "Passar para a equipe" },
  "entry.confirmationMode": { combined: "Na mesma mensagem das boas-vindas", separate_turn: "Na mensagem seguinte" },
  "sentiment.threshold": { any: "Qualquer sinal de insatisfação", dissatisfied: "Cliente insatisfeito", angry: "Cliente bravo" },
  "sentiment.action": { handoff: "Passar para a equipe", notify_and_continue: "Continuar atendendo", log_only: "Só registrar no rastro" },
  "limits.nonsenseAction": { warn_and_silence: "Avisar e parar de responder", handoff: "Passar para a equipe" },
};

/** Valores comuns a vários campos (ações de mídia, comportamento após encerrar). */
const COMMON_VALUE: Record<string, string> = {
  handoff: "Passar para a equipe",
  transcribe: "Transcrever e continuar",
  describe: "Ler a imagem e continuar",
  ask_text: "Pedir para o cliente escrever",
  no_reply: "Não responder",
  short_reply: "Responder curtinho",
  reopen_and_route: "Reabrir e encaminhar",
  ask_with_options: "Perguntar com botões",
  department: "Departamento",
  distribution_rule: "Fila automática",
  user: "Uma pessoa",
  ai_agent: "Outro agente",
  automation: "Automação",
  self: "O próprio agente",
};

const TOOL_LABEL: Record<string, string> = {
  search_products: "Buscar produtos no catálogo",
  search_crm_records: "Buscar dados do cliente no CRM",
  knowledge_search: "Buscar nos materiais",
  list_message_models: "Listar mensagens prontas",
  ask_with_options: "Perguntar com botões",
  add_tag: "Colocar etiqueta",
  move_stage: "Mover o negócio de etapa",
  create_activity: "Criar tarefa para a equipe",
  add_note: "Deixar anotação interna",
  handoff: "Transferir",
  send_message_model: "Enviar mensagem pronta",
  send_product: "Enviar produto",
  create_deal: "Criar negócio",
  update_field: "Atualizar campo",
};

const CONDITION_LABEL: Record<string, string> = {
  keywords: "a mensagem contiver",
  first_message: "for a primeira mensagem",
  out_of_hours: "estiver fora do horário",
  contact_tag: "o cliente tiver a etiqueta",
  deal_stage: "o negócio estiver na etapa",
  no_deal: "o cliente não tiver negócio aberto",
  media_kind: "o cliente mandar mídia do tipo",
  message_type: "a mensagem for do tipo",
};

const ACTION_LABEL: Record<string, string> = {
  send_message: "enviar a mensagem",
  handoff: "passar para a equipe",
  set_theme: "tratar como o assunto",
  add_tag: "adicionar a etiqueta",
  send_message_model: "enviar a mensagem pronta",
  close_conversation: "encerrar a conversa",
  no_reply: "não responder",
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Obj = Record<string, unknown>;

export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Obj)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);
const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Qual catálogo traduz os ids de cada campo. */
function idCatalog(path: string, c: NameCatalogs): Array<{ id: string; name: string }> | null {
  const last = path.split(".").pop() ?? "";
  if (last === "allowedKnowledgeDocIds") return c.knowledgeDocs ?? [];
  if (last === "allowedMessageModelIds") return c.messageTemplates ?? [];
  if (path === "channelIds") return c.channels ?? [];
  if (path === "model") return c.models ?? [];
  if (path === "contextFields.contact") return c.contactCustomFields ?? [];
  if (path === "contextFields.deal") return c.dealCustomFields ?? [];
  if (path === "actionOptions.stageIds") return (c.pipelines ?? []).flatMap((p) => p.stages.map((s) => ({ id: s.id, name: `${p.name} › ${s.name}` })));
  return null;
}

function destination(v: unknown, c: NameCatalogs): string {
  if (!isObj(v) || !v.type) return "Destino padrão";
  const list =
    v.type === "department"
      ? c.departments
      : v.type === "distribution_rule"
        ? c.distributionRules
        : v.type === "user"
          ? c.users
          : v.type === "ai_agent"
            ? c.aiAgents
            : [];
  const kind = COMMON_VALUE[String(v.type)] ?? String(v.type);
  const name = v.id ? (list ?? []).find((x) => x.id === v.id)?.name : undefined;
  return name ? `${kind}: ${name}` : kind;
}

/** Texto curto que identifica um item de lista. */
function itemName(path: string, v: unknown, c: NameCatalogs): string {
  if (typeof v === "string") {
    const cat = idCatalog(path, c);
    if (cat) return cat.find((x) => x.id === v)?.name ?? "(item removido do CRM)";
    if (path.endsWith("allowedTools") || path === "enabledTools") return TOOL_LABEL[v] ?? v;
    return clip(v, 120);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (!isObj(v)) return "";
  if (path === "calendar.events") {
    const d = (s: unknown) => (typeof s === "string" ? s.slice(0, 10).split("-").reverse().join("/") : "");
    return `${d(v.start)}${v.end && v.end !== v.start ? ` a ${d(v.end)}` : ""} · ${String(v.title ?? "")}`;
  }
  if (path === "businessHours.weekdays") return `${WEEKDAYS[Number(v.day)] ?? v.day} ${v.start ?? ""}–${v.end ?? ""}`;
  if (path === "variables") return `${String(v.key ?? "")}: ${clip(String(v.value ?? ""), 80)}`;
  if (path.endsWith("conditions")) {
    const vals = Array.isArray(v.values) ? (v.values as unknown[]).join(", ") : "";
    return `${CONDITION_LABEL[String(v.type)] ?? v.type}${vals ? ` ${vals}` : ""}`;
  }
  if (path.endsWith("actions") && !path.startsWith("productPolicy")) {
    const extra = v.message ?? v.themeId ?? v.tag ?? v.messageModelId ?? "";
    const target = isObj(v.destination) ? ` (${destination(v.destination, c)})` : "";
    return `${ACTION_LABEL[String(v.type)] ?? v.type}${extra ? ` “${clip(String(extra), 80)}”` : ""}${target}`;
  }
  const n = v.name ?? v.title ?? v.label ?? v.key ?? v.question ?? v.subject;
  return n ? clip(String(n), 120) : clip(stableJson(v), 120);
}

function formatValue(path: string, v: unknown, c: NameCatalogs): string {
  if (path.endsWith("Destination") || path === "handoff.defaultDestination") return destination(v, c);
  if (v === undefined || v === null) return "(não definido)";
  if (typeof v === "boolean") return YES_NO[String(v) as "true" | "false"];
  if (typeof v === "number" || typeof v === "string") {
    const s = String(v);
    const cat = idCatalog(path, c);
    if (cat) return cat.find((x) => x.id === s)?.name ?? s;
    const byField = VALUE_LABEL[path];
    if (byField?.[s]) return byField[s];
    if (COMMON_VALUE[s]) return COMMON_VALUE[s];
    if (s.trim() === "") return "(vazio)";
    return typeof v === "string" ? `“${clip(s)}”` : s;
  }
  if (Array.isArray(v)) return v.length ? v.map((x) => itemName(path, x, c)).join(", ") : "(nenhum)";
  if (isObj(v) && Object.keys(v).length === 0) return "(nenhum)";
  return clip(stableJson(v), 120);
}

/** Rótulo do campo pelo caminho (listas de assuntos/atalhos sem índice). */
const labelFor = (path: string) => PATH_LABEL[path];

/** Vazio em qualquer forma (nada, "", [], {} só com vazios). */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isObj(v)) return Object.values(v).every(isEmptyValue);
  return false;
}

function diffValue(path: string, label: string, a: unknown, b: unknown, c: NameCatalogs, out: DiffLine[]) {
  // Campo novo ainda sem valor ("" → nada, [] → nada) não é mudança.
  if (same(a, b) || (isEmptyValue(a) && isEmptyValue(b))) return;

  // Objetos: desce nos campos; destinos são um valor só.
  if ((isObj(a) || isObj(b)) && !path.endsWith("Destination") && path !== "handoff.defaultDestination") {
    const ao = isObj(a) ? a : {};
    const bo = isObj(b) ? b : {};
    const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])];
    const before = out.length;
    for (const k of keys) {
      const p = `${path}.${k}`;
      diffValue(p, labelFor(p) ?? label, ao[k], bo[k], c, out);
    }
    // Ligou/desligou um bloco inteiro (ex.: horário de atendimento).
    if (out.length === before) out.push({ label, from: formatValue(path, a, c), to: formatValue(path, b, c) });
    return;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    const added = bb.filter((x) => !aa.some((y) => same(x, y))).map((x) => itemName(path, x, c));
    const removed = aa.filter((x) => !bb.some((y) => same(x, y))).map((x) => itemName(path, x, c));
    if (added.length || removed.length) out.push({ label, added, removed });
    else if (aa.length > 0) out.push({ label, note: "mesma lista, em outra ordem" });
    return;
  }

  if (typeof a === "string" && typeof b === "string" && Math.max(a.length, b.length) > 160) {
    out.push({ label, ...focusTextChange(a, b) });
    return;
  }
  out.push({ label, from: formatValue(path, a, c), to: formatValue(path, b, c) });
}

/**
 * Texto longo (tom de voz, instruções): mostra só o trecho que mudou, com um
 * pouco de contexto antes e depois, em vez do texto inteiro duas vezes.
 */
export function focusTextChange(a: string, b: string, context = 50): { from: string; to: string } {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  // Recua até o começo/fim de palavra para não cortar no meio.
  while (p > 0 && /\S/.test(a[p - 1] ?? "")) p--;
  while (s > 0 && /\S/.test(a[a.length - s] ?? "")) s--;
  const start = Math.max(0, p - context);
  const pre = (start > 0 ? "…" : "") + a.slice(start, p);
  const postA = a.slice(a.length - s, a.length - s + context);
  const tail = s > context ? "…" : "";
  const mid = (x: string) => clip(x.slice(p, x.length - s), 400) || "(nada)";
  return { from: `${pre}${mid(a)}${postA}${tail}`, to: `${pre}${mid(b)}${postA}${tail}` };
}

/** Assuntos e atalhos: por id, com o que mudou dentro de cada um. */
function diffItems(key: "themes" | "rules", label: string, a: unknown, b: unknown, c: NameCatalogs): DiffGroup {
  const aa = (Array.isArray(a) ? a : []).filter(isObj);
  const bb = (Array.isArray(b) ? b : []).filter(isObj);
  const name = (x: Obj) => String(x.name ?? "").trim() || "(sem nome)";
  const byId = new Map(aa.map((x) => [String(x.id), x]));
  const group: DiffGroup = { label, added: [], removed: [], changed: [], reordered: false };
  for (const x of bb) {
    const old = byId.get(String(x.id));
    if (!old) {
      group.added.push(name(x));
      continue;
    }
    if (same(old, x)) continue;
    const lines: DiffLine[] = [];
    const keys = [...new Set([...Object.keys(old), ...Object.keys(x)])].filter((k) => k !== "id" && k !== "order");
    for (const k of keys) diffValue(`${key}.${k}`, labelFor(`${key}.${k}`) ?? k, old[k], x[k], c, lines);
    if (lines.length) group.changed.push({ name: name(x), lines });
  }
  for (const x of aa) if (!bb.some((y) => String(y.id) === String(x.id))) group.removed.push(name(x));
  const order = (xs: Obj[]) => xs.map((x) => String(x.id)).filter((id) => aa.some((y) => String(y.id) === id) && bb.some((y) => String(y.id) === id));
  group.reordered = !group.added.length && !group.removed.length && !group.changed.length && !same(order(aa), order(bb));
  return group;
}

export function buildPublishDiff(published: Obj | undefined, draft: Obj | undefined, catalogs: NameCatalogs): DiffSection[] {
  if (!draft) return [];
  const before = published ?? {};
  const out: DiffSection[] = [];
  for (const g of CHANGE_GROUPS) {
    const lines: DiffLine[] = [];
    const groups: DiffGroup[] = [];
    for (const [key, label] of g.keys) {
      if (same(before[key], draft[key])) continue;
      if (key === "themes" || key === "rules") groups.push(diffItems(key, label, before[key], draft[key], catalogs));
      else diffValue(key, label, before[key], draft[key], catalogs, lines);
    }
    // "Parecer humano" repetia; linhas idênticas somem.
    const seen = new Set<string>();
    const unique = lines.filter((l) => {
      const k = stableJson(l);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (unique.length || groups.length) out.push({ section: g.section, lines: unique, groups });
  }
  return out;
}
