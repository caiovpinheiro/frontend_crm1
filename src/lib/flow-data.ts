// ============================================================================
// Fluxo real "BV - Calouros" reconstruído a partir do JSON exportado.
// Cada card expõe MÚLTIPLAS SAÍDAS (uma por linha), como no editor original:
//  - botões  -> saída "Resposta" (verde)
//  - Próximo passo / Outra resposta -> "Navegação" (azul)
//  - Caso o contato não responda / erro no envio -> "Erro / sem resposta" (vermelho)
// ============================================================================

export type RouteType = "navigation" | "response" | "error"

export type NodeKind =
  | "trigger"
  | "template"
  | "interactive"
  | "media"
  | "message"
  | "webhook"
  | "distribution"
  | "move_stage"
  | "finish"
  | "condition"
  | "action"

export type TopicKey =
  | "inicio"
  | "portal"
  | "financeiro"
  | "documentos"
  | "encerramento"

export type Output = {
  key: string
  label: string
  kind: RouteType
  target?: string
}

export interface NodeConfig {
  channel?: string
  template?: string
  idioma?: string
  mediaFileName?: string
  mediaUrl?: string
  filename?: string
  uploadedFileName?: string
  timeout?: { h: number; min: number; seg: number }
  gotoTimeout?: string
  gotoFailure?: string
  url?: string
  method?: string
  variableName?: string
  value?: string
  field?: string
  op?: string
  delayMs?: number
  ms?: number
  delayUnit?: "minutes" | "hours" | "days"
  timeoutMs?: number
  channelId?: string
  channelIds?: string[]
  channelScope?: "all" | "selected"
  button?: string
  sectionTitle?: string
  header?: string
  footer?: string
  content?: string
  message?: string
  caption?: string
  bodyPreview?: string
  mediaType?: string
  targetStepId?: string
  templateName?: string
  templateLabel?: string
  languageCode?: string
  userId?: string
  userLabel?: string
  departmentId?: string
  departmentName?: string
  assignAll?: boolean
  assignTo?: "deal" | "contact" | "conversation" | "all"
  target?: "deal" | "contact" | "conversation" | "all" | "both"
  productId?: string
  productName?: string
  unitPrice?: number
  discountPercent?: number
  targetAutomationId?: string
  targetAutomationName?: string
  stageId?: string
  stageName?: string
  pipelineId?: string
  pipelineName?: string
  lostReason?: string
  tagName?: string
  agentId?: string
  agentUserId?: string
  branches?: unknown[]
  elseStepId?: string
  options?: unknown[]
  buttons?: unknown[]
  rows?: unknown[]
  flowDefinitionId?: string
  flowCta?: string
  headers?: unknown[]
  queryParams?: unknown[]
  body?: string
  nextStepId?: string
  timeoutGotoStepId?: string
  failureGotoStepId?: string
  elseGotoStepId?: string
  receivedGotoStepId?: string
  continueIfNoDeal?: boolean
}

export interface FlowNodeData extends Record<string, unknown> {
  ref: number
  kind: NodeKind
  /** Tipo real do catálogo de automações, quando o card veio da paleta/modal. */
  stepType?: string
  /** Tipo do gatilho persistido (`message_received`, etc.) — só no card inicial. */
  triggerType?: string
  topic: TopicKey
  title: string
  preview: string
  outputs: Output[]
  stats: { sucessos: number; alertas: number; erros: number }
  config?: NodeConfig
}

export interface RawNode {
  id: string
  data: FlowNodeData
}

export interface RawEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  type: RouteType
}

export const ROUTE_META: Record<RouteType, { label: string; color: string; dashed: boolean }> = {
  navigation: { label: "Navegação", color: "var(--route-navigation)", dashed: false },
  response: { label: "Resposta", color: "var(--route-response)", dashed: false },
  error: { label: "Erro / sem resposta", color: "var(--route-error)", dashed: true },
}

export const TOPIC_META: Record<TopicKey, { label: string; color: string; tint: string }> = {
  inicio: { label: "Início / Boas-vindas", color: "var(--topic-inicio)", tint: "var(--topic-inicio-tint)" },
  portal: { label: "Acesso ao Portal", color: "var(--topic-portal)", tint: "var(--topic-portal-tint)" },
  financeiro: { label: "Financeiro", color: "var(--topic-financeiro)", tint: "var(--topic-financeiro-tint)" },
  documentos: { label: "Documentos", color: "var(--topic-documentos)", tint: "var(--topic-documentos-tint)" },
  encerramento: { label: "Encerramento", color: "var(--topic-encerramento)", tint: "var(--topic-encerramento-tint)" },
}

const STOP = "__none__"
const ok = (id?: string) => (id && id !== STOP ? id : undefined)

type Btn = { label: string; target: string }

/** Saídas de um card com botões (interativo/template). */
function replyOutputs(
  buttons: Btn[],
  o: { next?: string; other?: string; timeout?: string; failure?: string },
): Output[] {
  return [
    ...buttons.map((b, i) => ({
      key: `btn${i}`,
      label: b.label,
      kind: "response" as const,
      target: ok(b.target),
    })),
    { key: "next", label: "Próximo passo", kind: "navigation", target: ok(o.next) },
    { key: "other", label: "Outra resposta", kind: "navigation", target: ok(o.other) },
    { key: "timeout", label: "Caso o contato não responda", kind: "error", target: ok(o.timeout) },
    { key: "failure", label: "Caso ocorrer erro no envio de mensagem", kind: "error", target: ok(o.failure) },
  ]
}

/** Saídas de um card simples (mensagem/mídia/webhook). */
function msgOutputs(next?: string): Output[] {
  return [
    { key: "next", label: "Próximo passo", kind: "navigation", target: ok(next) },
    { key: "timeout", label: "Caso o contato não responda", kind: "error" },
    { key: "failure", label: "Caso ocorrer erro no envio de mensagem", kind: "error" },
  ]
}

export const KIND_META: Record<
  NodeKind,
  { label: string; description: string; group: "Mensagens" | "Ações" }
> = {
  trigger: {
    label: "Gatilho",
    description: "Inicia o fluxo quando um evento ocorre.",
    group: "Ações",
  },
  message: {
    label: "Mensagem",
    description: "Envia uma mensagem de texto no WhatsApp.",
    group: "Mensagens",
  },
  template: {
    label: "Template",
    description: "Envia um template oficial do WhatsApp.",
    group: "Mensagens",
  },
  interactive: {
    label: "Botões",
    description: "Mensagem com botões de resposta rápida.",
    group: "Mensagens",
  },
  media: {
    label: "Mídia",
    description: "Envia imagem, vídeo ou documento.",
    group: "Mensagens",
  },
  webhook: {
    label: "Webhook",
    description: "Chama uma URL externa (POST).",
    group: "Ações",
  },
  distribution: {
    label: "Distribuição",
    description: "Encaminha o atendimento para a equipe.",
    group: "Ações",
  },
  move_stage: {
    label: "Mover etapa",
    description: "Move o negócio para outra etapa do funil.",
    group: "Ações",
  },
  finish: {
    label: "Finalizar",
    description: "Encerra o fluxo de atendimento.",
    group: "Ações",
  },
  condition: {
    label: "Condição",
    description: "Ramifica o fluxo conforme uma regra.",
    group: "Ações",
  },
  action: {
    label: "Ação",
    description: "Executa uma ação no CRM.",
    group: "Ações",
  },
}

export function defaultOutputsForKind(kind: NodeKind): Output[] {
  if (kind === "trigger") {
    return [{ key: "next", label: "Iniciar fluxo", kind: "navigation" }]
  }
  if (kind === "finish") return []
  if (kind === "move_stage") {
    return [{ key: "next", label: "Próximo passo", kind: "navigation" }]
  }
  if (kind === "distribution") {
    return [
      { key: "next", label: "Próximo passo", kind: "navigation" },
      { key: "other", label: "Se não houver atendente", kind: "error" },
    ]
  }
  if (kind === "webhook") {
    return [
      { key: "next", label: "Próximo passo", kind: "navigation" },
      { key: "failure", label: "Se o webhook falhar", kind: "error" },
    ]
  }
  if (kind === "condition") {
    return [
      { key: "branch:1", label: "Se 1", kind: "navigation" },
      { key: "else", label: "Senão", kind: "error" },
    ]
  }
  if (kind === "action") {
    return [{ key: "next", label: "Próximo passo", kind: "navigation" }]
  }
  if (kind === "interactive") {
    return replyOutputs([{ label: "Opção 1", target: STOP }], {})
  }
  if (kind === "template") return msgOutputs()
  return msgOutputs()
}

export function blankFlowNodeData(
  kind: NodeKind,
  ref: number,
  opts?: { title?: string; stepType?: string; outputs?: Output[]; config?: NodeConfig; preview?: string },
): FlowNodeData {
  const meta = KIND_META[kind]
  const topic: TopicKey =
    kind === "finish" || kind === "distribution" || kind === "move_stage"
      ? "encerramento"
      : "inicio"
  return {
    ref,
    kind,
    stepType: opts?.stepType,
    topic,
    title: opts?.title ?? meta.label,
    preview: opts?.preview ?? "",
    outputs: opts?.outputs ?? defaultOutputsForKind(kind),
    stats: { sucessos: 0, alertas: 0, erros: 0 },
    config: opts?.config,
  }
}

const S = (n: number, a = 0, e = 0) => ({ sucessos: n, alertas: a, erros: e })

// ---- IDs dos passos (do JSON) ---------------------------------------------

const ID = {
  trigger: "trigger",
  welcome: "b9e9f48a-1656-43a9-b5b1-9196168cbec3",
  menu: "ebf312b5-dc00-4bc0-afce-90d4701b42e0",
  portalPlat: "76c87657-795a-427d-b2bd-c76a1649fb23",
  portalVideo: "4a181cb7-da67-493b-82f2-0975aa3dacc9",
  portalMsg1: "ad68e560-db1f-4988-aff8-a2ca515cdce8",
  portalMsg2: "a7fd2494-6056-4f6a-85c9-cb85b2c287cd",
  portalMsg3: "ec84e744-3896-4728-9abf-375379bf18fe",
  entendeu: "dc6a2224-de5c-4ece-83af-1af00aeebe1e",
  agradece: "534eea8e-b9e2-49ec-a919-93227feb043a",
  finish1: "2fb01e5c-998a-484c-b4b5-63a6755e416c",
  portalRetry: "79848002-4504-4cf5-8f52-af657b69ba66",
  pagPlat: "fbfa6473-0cb9-4eb0-8000-c71385219017",
  pagMsg: "53b8b839-bc4a-458d-9cf7-bb0666ec31d0",
  pagVideo: "b15bb755-eafc-4a23-b750-3d55f15375cc",
  financeiro: "5ae2a7f3-4854-4ee2-a134-6f00dee5bfcd",
  regras1: "c0e36160-0ca8-4c42-ba94-7f8b134d3851",
  regras2: "6ac22f16-6ae2-4619-833c-2c03b48531f2",
  regras3: "d1cb6098-a65d-4150-ab5f-3e4dad9513ca",
  pagVideoApp: "0ad7da4a-9ea8-431b-9f88-eefe7c855b8f",
  pagRetry: "161c6017-51e9-4936-a302-43644744ef74",
  alterarDatas: "7de75b5d-ff61-41b7-8a43-780fb70fb663",
  finRetry: "9953e22a-1f73-46c5-8dca-05287f20aef6",
  docPlat: "1ded5476-5c98-4da8-a103-060741eaa11b",
  docPortal: "3a37e143-af34-49a8-9529-489b5b395d9b",
  docApp: "4c6d3aa2-4b84-44e3-bd2b-a9ce7e463d55",
  docRetry: "ea91c815-45ad-4e48-8af3-2ce4acaa27fa",
  distrib: "b76f01a3-6e9f-4300-89f9-3d678f4e6934",
  atendente: "162ce2d7-9700-4ccf-9c39-a7b48f40492f",
  moveStage: "1a01d308-926c-4652-9d37-9f79d203bcd9",
  emailMsg: "38a41d33-9379-4b66-a6d9-05b04d4c0bcc",
  credMsg: "a9796d40-e796-47e2-954f-dfff02a7dd4d",
  welcomeRetry: "14caf271-598a-4036-8dfa-b1b2c244a797",
  semAtendente: "e9383227-1ddd-43cb-a01b-26714b36ced3",
  menuRetry: "a60b4c80-9924-42f9-a007-5af7f61c348f",
  appVideo: "d6a02641-ae91-474d-8a6d-b1710a852073",
  entendeuRetry: "fee39d06-911b-48ef-a7a4-06d1b446e788",
  fup: "e1c94622-9ab5-4bbf-8155-b37270038859",
  finish2: "92bb3356-22de-4a81-a62e-fd5ab1fa054d",
  hookAcesso: "29b783c7-c8af-4672-a746-79023e5d4f40",
  hookNao: "f6a879ff-cc3d-4b2f-8d81-2289b97c0562",
  hookCurso: "ba92370f-5ba5-45d7-b087-48796193d973",
  fupRetry: "04868ab6-bb99-4a80-a79b-c6c9094ba8a9",
  hookSemInt: "76a4e82c-8362-4844-a0a5-783dac5f08ff",
  encerra: "92776bcb-5ec2-4700-aa5a-8f6dcc6db3c9",
  welcomeAlt: "cmstfixmstm34wa7ada05cc8fdc",
} as const

// ---- Nós -------------------------------------------------------------------

export const rawNodes: RawNode[] = [
  {
    id: ID.trigger,
    data: {
      ref: 1, kind: "trigger", topic: "inicio",
      title: "Gatilho: Negócio criado",
      preview: "Inicia quando um negócio entra na etapa configurada do funil.",
      outputs: [{ key: "next", label: "Iniciar fluxo", kind: "navigation", target: ID.welcome }],
      stats: S(460),
    },
  },
  {
    id: ID.welcome,
    data: {
      ref: 2, kind: "template", topic: "inicio",
      title: "Template WhatsApp",
      preview: "⭐ Seja muito bem-vindo(a) à Cruzeiro do Sul! Este é seu canal oficial de atendimento…",
      outputs: replyOutputs(
        [
          { label: "Sobre o Curso", target: ID.hookCurso },
          { label: "Receber dados de acesso", target: ID.hookAcesso },
          { label: "Não, obrigado", target: ID.hookNao },
        ],
  { next: STOP, other: ID.welcomeRetry, timeout: ID.fup, failure: ID.encerra },
  ),
  stats: S(1262, 0, 237),
  config: {
  channel: "Acadêmico · +55 11 98980-0401",
  template: "bv_calouros",
  idioma: "pt_BR",
  mediaFileName: "Primeiro acesso - Tutorial App Duda (1) (1).mp4",
  timeout: { h: 1, min: 0, seg: 0 },
  gotoTimeout: ID.fup,
  gotoFailure: ID.encerra,
  },
  },
  },
  {
    id: ID.menu,
    data: {
      ref: 3, kind: "interactive", topic: "inicio",
      title: "Botões WhatsApp",
      preview: "Veja as opções disponíveis para entender melhor sobre seu curso:",
      outputs: replyOutputs(
        [
          { label: "Acesso ao Portal", target: ID.portalPlat },
          { label: "Financeiro", target: ID.financeiro },
          { label: "Entrega de Documentos", target: ID.docPlat },
        ],
        { other: ID.menuRetry },
      ),
      stats: S(446),
    },
  },
  {
    id: ID.portalPlat,
    data: {
      ref: 4, kind: "interactive", topic: "portal",
      title: "Botões WhatsApp",
      preview: "Qual plataforma você está usando para acessar?",
      outputs: replyOutputs(
        [
          { label: "Portal (computador)", target: ID.portalVideo },
          { label: "App Duda (celular)", target: ID.appVideo },
        ],
        { other: ID.portalRetry },
      ),
      stats: S(101),
    },
  },
  {
    id: ID.portalVideo,
    data: {
      ref: 5, kind: "media", topic: "portal",
      title: "Mídia WhatsApp",
      preview: "🎬 Vídeo: Assista ao nosso tutorial de primeiro acesso ☝️",
      outputs: msgOutputs(ID.portalMsg1),
      stats: S(53),
    },
  },
  {
    id: ID.portalMsg1,
    data: {
      ref: 6, kind: "message", topic: "portal",
      title: "Mensagem WhatsApp",
      preview: "Para acessar o portal pela primeira vez, basta seguir o passo a passo:",
      outputs: msgOutputs(ID.portalMsg2),
      stats: S(53),
    },
  },
  {
    id: ID.portalMsg2,
    data: {
      ref: 7, kind: "message", topic: "portal",
      title: "Mensagem WhatsApp",
      preview: "1️⃣ Acesse: novoportal.cruzeirodosul.edu.br  2️⃣ Selecione Ensino Superior…",
      outputs: msgOutputs(ID.portalMsg3),
      stats: S(53),
    },
  },
  {
    id: ID.portalMsg3,
    data: {
      ref: 8, kind: "message", topic: "portal",
      title: "Mensagem WhatsApp",
      preview: "✅ Agora, volte para a página inicial e faça login com seu e-mail acadêmico…",
      outputs: msgOutputs(ID.entendeu),
      stats: S(53),
    },
  },
  {
    id: ID.entendeu,
    data: {
      ref: 9, kind: "interactive", topic: "inicio",
      title: "Botões WhatsApp",
      preview: "Conseguiu entender as explicações?",
      outputs: replyOutputs(
        [
          { label: "Sim! Tudo certo", target: ID.agradece },
          { label: "Preciso de ajuda", target: ID.moveStage },
          { label: "Outro assunto", target: ID.menu },
        ],
        { next: ID.agradece, other: ID.entendeuRetry },
      ),
      stats: S(210),
    },
  },
  {
    id: ID.agradece,
    data: {
      ref: 10, kind: "message", topic: "inicio",
      title: "Mensagem WhatsApp",
      preview: "Esperamos ter ajudado! Qualquer dúvida, estamos por aqui 📲",
      outputs: msgOutputs(ID.encerra),
      stats: S(180),
    },
  },
  {
    id: ID.finish1,
    data: {
      ref: 11, kind: "finish", topic: "encerramento",
      title: "Finalizar",
      preview: "Encerra a automação (stop).",
      outputs: [],
      stats: S(120),
    },
  },
  {
    id: ID.portalRetry,
    data: {
      ref: 12, kind: "message", topic: "portal",
      title: "Mensagem WhatsApp",
      preview: "Clique em um dos botões para continuar a conversa.",
      outputs: msgOutputs(ID.portalPlat),
      stats: S(9),
    },
  },
  {
    id: ID.pagPlat,
    data: {
      ref: 13, kind: "interactive", topic: "financeiro",
      title: "Botões WhatsApp",
      preview: "Qual plataforma você está usando para acessar? (Pagamento)",
      outputs: replyOutputs(
        [
          { label: "Portal (computador)", target: ID.pagMsg },
          { label: "App Duda (celular)", target: ID.pagVideoApp },
        ],
        { next: ID.pagMsg, other: ID.pagRetry },
      ),
      stats: S(24),
    },
  },
  {
    id: ID.pagMsg,
    data: {
      ref: 14, kind: "message", topic: "financeiro",
      title: "Mensagem WhatsApp",
      preview: "Para pagar suas mensalidades, siga o passo a passo: 1️⃣ Área do Aluno 2️⃣ Pagar Mensalidade…",
      outputs: msgOutputs(ID.pagVideo),
      stats: S(12),
    },
  },
  {
    id: ID.pagVideo,
    data: {
      ref: 15, kind: "media", topic: "financeiro",
      title: "Mídia WhatsApp",
      preview: "🎬 Vídeo: Tutorial de pagamento pelo computador ☝️",
      outputs: msgOutputs(ID.entendeu),
      stats: S(12),
    },
  },
  {
    id: ID.financeiro,
    data: {
      ref: 16, kind: "interactive", topic: "financeiro",
      title: "Botões WhatsApp",
      preview: "Selecione uma das opções:",
      outputs: replyOutputs(
        [
          { label: "Regras de Vencimento", target: ID.regras1 },
          { label: "Pagamento", target: ID.pagPlat },
          { label: "Alterar Datas", target: ID.alterarDatas },
        ],
        { other: ID.finRetry },
      ),
      stats: S(96),
    },
  },
  {
    id: ID.regras1,
    data: {
      ref: 17, kind: "message", topic: "financeiro",
      title: "Mensagem WhatsApp",
      preview: "📢 Regras de Desconto na Mensalidade 💰 Primeira mensalidade: desconto até o dia 25…",
      outputs: msgOutputs(ID.regras2),
      stats: S(40),
    },
  },
  {
    id: ID.regras2,
    data: {
      ref: 18, kind: "message", topic: "financeiro",
      title: "Mensagem WhatsApp",
      preview: "💰 Demais mensalidades: até o dia 10 = 25% de desconto, até o dia 25 = 15%…",
      outputs: msgOutputs(ID.regras3),
      stats: S(40),
    },
  },
  {
    id: ID.regras3,
    data: {
      ref: 19, kind: "message", topic: "financeiro",
      title: "Mensagem WhatsApp",
      preview: "📌 Exemplo: mensalidade de R$ 200 → R$ 150 até dia 10, R$ 170 até dia 25…",
      outputs: msgOutputs(ID.entendeu),
      stats: S(40),
    },
  },
  {
    id: ID.pagVideoApp,
    data: {
      ref: 20, kind: "media", topic: "financeiro",
      title: "Mídia WhatsApp",
      preview: "🎬 Vídeo: Pagar mensalidade pelo app Duda — Financeiro → Pagar com boleto…",
      outputs: msgOutputs(ID.entendeu),
      stats: S(12),
    },
  },
  {
    id: ID.pagRetry,
    data: {
      ref: 21, kind: "message", topic: "financeiro",
      title: "Mensagem WhatsApp",
      preview: "Clique em um dos botões para continuar a conversa.",
      outputs: msgOutputs(ID.pagPlat),
      stats: S(3),
    },
  },
  {
    id: ID.alterarDatas,
    data: {
      ref: 22, kind: "message", topic: "financeiro",
      title: "Mensagem WhatsApp",
      preview: "O vencimento é fixo e, infelizmente, não conseguimos alterar essa data…",
      outputs: msgOutputs(ID.entendeu),
      stats: S(6),
    },
  },
  {
    id: ID.finRetry,
    data: {
      ref: 23, kind: "message", topic: "financeiro",
      title: "Mensagem WhatsApp",
      preview: "Clique em um dos botões para continuar a conversa.",
      outputs: msgOutputs(ID.financeiro),
      stats: S(4),
    },
  },
  {
    id: ID.docPlat,
    data: {
      ref: 24, kind: "interactive", topic: "documentos",
      title: "Botões WhatsApp",
      preview: "Qual plataforma você está usando para acessar? (Documentos)",
      outputs: replyOutputs(
        [
          { label: "Portal (computador)", target: ID.docPortal },
          { label: "App Duda (celular)", target: ID.docApp },
        ],
        { next: ID.docPortal, other: ID.docRetry },
      ),
      stats: S(30),
    },
  },
  {
    id: ID.docPortal,
    data: {
      ref: 25, kind: "message", topic: "documentos",
      title: "Mensagem WhatsApp",
      preview: "Acesse pelo portal → Vida Acadêmica → Entrega de Documentos. Aceita arquivos até 1MB!",
      outputs: msgOutputs(ID.entendeu),
      stats: S(15),
    },
  },
  {
    id: ID.docApp,
    data: {
      ref: 26, kind: "message", topic: "documentos",
      title: "Mensagem WhatsApp",
      preview: "No app Duda: Perfil → Meus documentos para anexar.",
      outputs: msgOutputs(ID.entendeu),
      stats: S(15),
    },
  },
  {
    id: ID.docRetry,
    data: {
      ref: 27, kind: "message", topic: "documentos",
      title: "Mensagem WhatsApp",
      preview: "Clique em um dos botões para continuar a conversa.",
      outputs: msgOutputs(ID.docPlat),
      stats: S(2),
    },
  },
  {
    id: ID.distrib,
    data: {
      ref: 28, kind: "distribution", topic: "encerramento",
      title: "Distribuição",
      preview: "Distribui o atendimento para o departamento: Acolhimento.",
      outputs: [
        { key: "next", label: "Próximo passo", kind: "navigation", target: ID.atendente },
        { key: "other", label: "Se não houver atendente", kind: "error", target: ID.semAtendente },
      ],
      stats: S(18),
    },
  },
  {
    id: ID.atendente,
    data: {
      ref: 29, kind: "message", topic: "encerramento",
      title: "Mensagem WhatsApp",
      preview: "Oi {{contact.name}}, sou {{assignee.name}} do time de suporte 😊 Como posso ajudar?",
      outputs: msgOutputs(ID.finish1),
      stats: S(14),
    },
  },
  {
    id: ID.moveStage,
    data: {
      ref: 30, kind: "move_stage", topic: "encerramento",
      title: "Mover etapa",
      preview: "Move o negócio para a etapa de atendimento humano.",
      outputs: [{ key: "next", label: "Próximo passo", kind: "navigation", target: ID.distrib }],
      stats: S(18),
    },
  },
  {
    id: ID.emailMsg,
    data: {
      ref: 31, kind: "message", topic: "inicio",
      title: "Mensagem WhatsApp",
      preview: "Seu e-mail de acesso será gerado em breve. Acompanhe as notificações!",
      outputs: msgOutputs(ID.menu),
      stats: S(120),
    },
  },
  {
    id: ID.credMsg,
    data: {
      ref: 32, kind: "message", topic: "inicio",
      title: "Mensagem WhatsApp",
      preview: "Certo, é importante que você já saiba suas credenciais para acessar o portal, ok?",
      outputs: msgOutputs(ID.menu),
      stats: S(80),
    },
  },
  {
    id: ID.welcomeRetry,
    data: {
      ref: 33, kind: "message", topic: "inicio",
      title: "Mensagem WhatsApp",
      preview: "Toque em um dos botões abaixo para continuar.",
      outputs: msgOutputs(ID.welcomeAlt),
      stats: S(30),
    },
  },
  {
    id: ID.semAtendente,
    data: {
      ref: 34, kind: "message", topic: "encerramento",
      title: "Mensagem WhatsApp",
      preview: "No momento, não há atendentes disponíveis. Aguarde contato para continuar, ok?",
      outputs: msgOutputs(ID.finish1),
      stats: S(4),
    },
  },
  {
    id: ID.menuRetry,
    data: {
      ref: 35, kind: "message", topic: "inicio",
      title: "Mensagem WhatsApp",
      preview: "Clique em uma das opções para continuar essa conversa:",
      outputs: msgOutputs(ID.menu),
      stats: S(12),
    },
  },
  {
    id: ID.appVideo,
    data: {
      ref: 36, kind: "media", topic: "portal",
      title: "Mídia WhatsApp",
      preview: "🎬 Vídeo: Veja o tutorial de primeiro acesso ao app.",
      outputs: msgOutputs(ID.entendeu),
      stats: S(48),
    },
  },
  {
    id: ID.entendeuRetry,
    data: {
      ref: 37, kind: "message", topic: "inicio",
      title: "Mensagem WhatsApp",
      preview: "Clique em uma das opções para dar andamento na conversa:",
      outputs: msgOutputs(ID.entendeu),
      stats: S(30),
    },
  },
  {
    id: ID.fup,
    data: {
      ref: 38, kind: "template", topic: "inicio",
      title: "Template WhatsApp",
      preview: "Follow-up: Você conseguiu acessar sua Área do Aluno? Está tudo certo com o acesso?",
      outputs: replyOutputs(
        [
          { label: "Está tudo certo", target: ID.hookNao },
          { label: "Preciso de ajuda", target: ID.hookCurso },
        ],
        { next: ID.hookSemInt, other: ID.fupRetry, timeout: ID.hookSemInt, failure: ID.finish2 },
      ),
      stats: S(90),
    },
  },
  {
    id: ID.finish2,
    data: {
      ref: 39, kind: "finish", topic: "encerramento",
      title: "Finalizar",
      preview: "Encerra a automação (stop).",
      outputs: [],
      stats: S(60),
    },
  },
  {
    id: ID.hookAcesso,
    data: {
      ref: 40, kind: "webhook", topic: "inicio",
      title: "Webhook",
      preview: "POST → n8n /webhook/acad_bv (dados de acesso)",
      stepType: "webhook",
      config: { method: "POST", url: "https://n8n.example/webhook/acad_bv" },
      outputs: [{ key: "next", label: "Próximo passo", kind: "navigation", target: ID.emailMsg }],
      stats: S(120),
    },
  },
  {
    id: ID.hookNao,
    data: {
      ref: 41, kind: "webhook", topic: "inicio",
      title: "Webhook",
      preview: "POST → n8n /webhook/acad_bv (não, obrigado)",
      stepType: "webhook",
      config: { method: "POST", url: "https://n8n.example/webhook/acad_bv" },
      outputs: [{ key: "next", label: "Próximo passo", kind: "navigation", target: ID.credMsg }],
      stats: S(80),
    },
  },
  {
    id: ID.hookCurso,
    data: {
      ref: 42, kind: "webhook", topic: "inicio",
      title: "Webhook",
      preview: "POST → n8n /webhook/acad_bv (sobre o curso)",
      stepType: "webhook",
      config: { method: "POST", url: "https://n8n.example/webhook/acad_bv" },
      outputs: [{ key: "next", label: "Próximo passo", kind: "navigation", target: ID.menu }],
      stats: S(160),
    },
  },
  {
    id: ID.fupRetry,
    data: {
      ref: 43, kind: "message", topic: "inicio",
      title: "Mensagem WhatsApp",
      preview: "Clique em um dos botões para continuar a conversa.",
      outputs: msgOutputs(ID.fup),
      stats: S(10),
    },
  },
  {
    id: ID.hookSemInt,
    data: {
      ref: 44, kind: "webhook", topic: "encerramento",
      title: "Webhook",
      preview: "POST → n8n /webhook/acad_sem_interacao",
      stepType: "webhook",
      config: { method: "POST", url: "https://n8n.example/webhook/acad_sem_interacao" },
      outputs: [{ key: "next", label: "Próximo passo", kind: "navigation", target: ID.encerra }],
      stats: S(30),
    },
  },
  {
    id: ID.encerra,
    data: {
      ref: 45, kind: "finish", topic: "encerramento",
      title: "Encerrar conversa",
      preview: "Finaliza a conversa e a automação.",
      outputs: [{ key: "next", label: "Próximo passo", kind: "navigation", target: ID.finish2 }],
      stats: S(200),
    },
  },
  {
    id: ID.welcomeAlt,
    data: {
      ref: 46, kind: "interactive", topic: "inicio",
      title: "Botões WhatsApp",
      preview: "Toque em um dos botões abaixo para continuar:",
      outputs: replyOutputs(
        [
          { label: "Sobre o Curso", target: ID.hookCurso },
          { label: "Dados de acesso", target: ID.hookAcesso },
          { label: "Não, obrigado", target: ID.hookNao },
        ],
        { other: ID.moveStage },
      ),
      stats: S(30),
    },
  },
]

// ---- Arestas derivadas das saídas (uma por handle) ------------------------

export const rawEdges: RawEdge[] = rawNodes.flatMap((n) =>
  n.data.outputs
    .filter((o) => o.target)
    .map((o) => ({
      id: `${n.id}::${o.key}->${o.target}`,
      source: n.id,
      sourceHandle: o.key,
      target: o.target as string,
      type: o.kind,
    })),
)

// ============================================================================
// ADAPTER PARA A API REAL (opcional)
// ----------------------------------------------------------------------------
// Este bloco NÃO é usado pelos componentes por padrão — eles consomem os
// `rawNodes`/`rawEdges` de exemplo acima. Quando quiser plugar seu backend,
// busque o JSON do seu endpoint (o mesmo formato do "Exportar JSON") e passe
// por `fromApi()`. Nenhum componente do editor precisa mudar: eles só recebem
// `{ nodes, edges }` no formato interno.
//
//   // Exemplo de uso num Server Component / rota:
//   const payload = await fetch(`/api/fluxos/${id}`).then((r) => r.json())
//   const { nodes, edges } = fromApi(payload)
//   // ...passe `nodes`/`edges` para o FlowEditor.
//
// Ajuste APENAS o mapeamento abaixo para casar com os nomes de campo do SEU
// JSON. As chaves à esquerda são o formato interno; as da direita, exemplos
// vindos da sua exportação — troque conforme necessário.
// ============================================================================

/** Formato aproximado de um passo vindo da sua exportação. Ajuste os campos. */
export interface ApiStep {
  id: string
  ref?: number
  type?: string // ex.: "template" | "interactive" | "message" | ...
  topic?: string
  title?: string
  text?: string // texto/prévia da mensagem
  buttons?: { label: string; goTo?: string }[]
  next?: string
  otherResponse?: string
  onTimeout?: string
  onFailure?: string
  stats?: { sucessos?: number; alertas?: number; erros?: number }
  config?: Partial<NodeConfig>
}

/** Converte o payload da sua API para o formato interno do editor. */
export function fromApi(steps: ApiStep[]): {
  nodes: RawNode[]
  edges: RawEdge[]
} {
  const nodes: RawNode[] = steps.map((s, i) => {
    const outputs: Output[] = []

    // 1) Botões viram saídas "Resposta" (verde)
    for (const [bi, b] of (s.buttons ?? []).entries()) {
      outputs.push({
        key: `btn-${bi}`,
        label: b.label,
        kind: "response",
        target: b.goTo,
      })
    }
    // 2) Navegação (azul)
    outputs.push({ key: "next", label: "Próximo passo", kind: "navigation", target: s.next })
    outputs.push({ key: "other", label: "Outra resposta", kind: "navigation", target: s.otherResponse })
    // 3) Erro / sem resposta (vermelho)
    outputs.push({ key: "timeout", label: "Caso o contato não responda", kind: "error", target: s.onTimeout })
    outputs.push({ key: "failure", label: "Caso ocorrer erro no envio de mensagem", kind: "error", target: s.onFailure })

    return {
      id: s.id,
      data: {
        ref: s.ref ?? i + 1,
        kind: (s.type as NodeKind) ?? "message",
        topic: (s.topic as TopicKey) ?? "inicio",
        title: s.title ?? "Passo",
        preview: s.text ?? "",
        outputs,
        stats: {
          sucessos: s.stats?.sucessos ?? 0,
          alertas: s.stats?.alertas ?? 0,
          erros: s.stats?.erros ?? 0,
        },
        config: s.config,
      },
    }
  })

  const edges: RawEdge[] = nodes.flatMap((n) =>
    n.data.outputs
      .filter((o) => o.target)
      .map((o) => ({
        id: `${n.id}::${o.key}->${o.target}`,
        source: n.id,
        sourceHandle: o.key,
        target: o.target as string,
        type: o.kind,
      })),
  )

  return { nodes, edges }
}

/** Altura estimada do card (usada pelo layout Dagre). */
export function nodeHeight(data: FlowNodeData): number {
  const HEADER = 88
  const FOOTER = 40
  const ROW = 26
  return HEADER + FOOTER + Math.max(data.outputs.length, 1) * ROW
}
