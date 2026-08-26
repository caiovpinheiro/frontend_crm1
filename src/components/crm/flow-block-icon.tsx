import {
  IconBolt,
  IconMail,
  IconArrowsExchange2,
  IconUserPlus,
  IconUsersGroup,
  IconTag,
  IconTagOff,
  IconPencil,
  IconCalendarPlus,
  IconTrendingUp,
  IconClock,
  IconArrowsSplit2,
  IconMessage,
  IconFileText,
  IconPhoto,
  IconClick,
  IconClipboardList,
  IconWorld,
  IconHelpCircle,
  IconPlayerPause,
  IconVariable,
  IconCornerDownRight,
  IconTransfer,
  IconCircleCheck,
  IconSquareRounded,
  IconRobot,
  IconFlag,
  type IconProps,
} from "@tabler/icons-react"
import type { ComponentType, CSSProperties } from "react"

type TablerIcon = ComponentType<IconProps>

/** Cores nomeadas usadas como acento por bloco (color-coding funcional do builder) */
export type BlockColor =
  | "indigo"
  | "blue"
  | "teal"
  | "green"
  | "red"
  | "amber"
  | "violet"
  | "pink"
  | "orange"
  | "slate"

export type BlockCategory = "trigger" | "action" | "logic" | "whatsapp" | "integration" | "salesbot" | "ai" | "final"

interface BlockMeta {
  label: string
  Icon: TablerIcon
  color: BlockColor
  category: BlockCategory
  /** Tom legado (trigger | action | salesbot | final) para componentes existentes */
  tone: "trigger" | "action" | "salesbot" | "final"
}

/** Paleta de acentos: cor sólida do ícone + fundo suave do chip */
export const blockPalette: Record<BlockColor, { fg: string; bg: string }> = {
  indigo: { fg: "var(--color-primary)", bg: "rgba(91,111,245,0.12)" },
  blue: { fg: "#2f6df6", bg: "rgba(47,109,246,0.12)" },
  teal: { fg: "#0d9488", bg: "rgba(13,148,136,0.12)" },
  green: { fg: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  red: { fg: "var(--color-destructive)", bg: "rgba(239,68,68,0.12)" },
  amber: { fg: "#d97706", bg: "rgba(217,119,6,0.14)" },
  violet: { fg: "#7c3aed", bg: "rgba(124,58,237,0.12)" },
  pink: { fg: "#db2777", bg: "rgba(219,39,119,0.12)" },
  orange: { fg: "var(--color-orange)", bg: "rgba(249,115,22,0.13)" },
  slate: { fg: "#475569", bg: "rgba(71,85,105,0.12)" },
}

const categoryTone: Record<BlockCategory, BlockMeta["tone"]> = {
  trigger: "trigger",
  final: "final",
  salesbot: "salesbot",
  ai: "salesbot",
  action: "action",
  logic: "action",
  whatsapp: "action",
  integration: "action",
}

function def(label: string, Icon: TablerIcon, color: BlockColor, category: BlockCategory): BlockMeta {
  return { label, Icon, color, category, tone: categoryTone[category] }
}

export const blockMeta: Record<string, BlockMeta> = {
  trigger: def("Gatilho", IconBolt, "indigo", "trigger"),
  final: def("Finalizar fluxo", IconFlag, "red", "final"),

  // Ações
  "send-email": def("Enviar e-mail", IconMail, "blue", "action"),
  "move-stage": def("Mover estágio", IconArrowsExchange2, "indigo", "action"),
  assign: def("Atribuir responsável", IconUserPlus, "teal", "action"),
  "transfer-department": def("Transferir para departamento", IconUsersGroup, "teal", "action"),
  "add-tag": def("Adicionar tag", IconTag, "green", "action"),
  "remove-tag": def("Remover tag", IconTagOff, "red", "action"),
  "update-field": def("Atualizar campo", IconPencil, "amber", "action"),
  "create-activity": def("Criar atividade", IconCalendarPlus, "violet", "action"),
  "lead-score": def("Atualizar lead score", IconTrendingUp, "pink", "action"),

  // Lógica
  delay: def("Atraso", IconClock, "orange", "logic"),
  condition: def("Condição", IconArrowsSplit2, "indigo", "logic"),

  // WhatsApp
  "wa-message": def("Mensagem WhatsApp", IconMessage, "green", "whatsapp"),
  "wa-template": def("Template WhatsApp", IconFileText, "green", "whatsapp"),
  "wa-media": def("Mídia WhatsApp", IconPhoto, "green", "whatsapp"),
  "wa-buttons": def("Botões WhatsApp", IconClick, "violet", "whatsapp"),
  "wa-flow": def("Formulário WhatsApp", IconClipboardList, "violet", "whatsapp"),

  // Integrações
  webhook: def("Webhook", IconWorld, "slate", "integration"),

  // Salesbot
  "ask-lead": def("Pergunta ao lead", IconHelpCircle, "blue", "salesbot"),
  "wait-reply": def("Aguardar resposta", IconPlayerPause, "orange", "salesbot"),
  "set-variable": def("Definir variável", IconVariable, "pink", "salesbot"),
  goto: def("Ir para (Goto)", IconCornerDownRight, "blue", "salesbot"),
  "transfer-automation": def("Transferir automação", IconTransfer, "indigo", "salesbot"),
  "end-conversation": def("Encerrar conversa", IconCircleCheck, "green", "salesbot"),
  "finish-flow": def("Finalizar fluxo", IconSquareRounded, "red", "salesbot"),

  // IA
  "ai-agent": def("Transferir para agente IA", IconRobot, "violet", "ai"),
  "ai-ask": def("Perguntar ao agente IA", IconRobot, "violet", "ai"),
}

/**
 * Vocabulário do backend (snake_case, ex.: "send_email") → chave do catálogo
 * de blocos da UI (hífen, ex.: "send-email"). O mini-fluxo dos cards recebe os
 * tipos reais dos passos vindos da API; sem este mapa todos cairiam no ícone
 * padrão (Bolt). Tipos sem bloco dedicado (business_hours, create_deal, etc.)
 * caem no fallback do `getBlockMeta`.
 */
const apiTypeToBlockKey: Record<string, string> = {
  send_email: "send-email",
  move_stage: "move-stage",
  assign_owner: "assign",
  transfer_department: "transfer-department",
  add_tag: "add-tag",
  remove_tag: "remove-tag",
  update_field: "update-field",
  create_activity: "create-activity",
  update_lead_score: "lead-score",
  send_whatsapp_message: "wa-message",
  send_whatsapp_template: "wa-template",
  send_whatsapp_media: "wa-media",
  send_whatsapp_interactive: "wa-buttons",
  send_whatsapp_flow: "wa-flow",
  send_whatsapp_list: "wa-buttons",
  webhook: "webhook",
  delay: "delay",
  condition: "condition",
  question: "ask-lead",
  wait_for_reply: "wait-reply",
  set_variable: "set-variable",
  goto: "goto",
  transfer_automation: "transfer-automation",
  stop_automation: "finish-flow",
  finish: "final",
  finish_conversation: "end-conversation",
  ask_ai_agent: "ai-ask",
  transfer_to_ai_agent: "ai-agent",
}

/** Normaliza um tipo de passo (snake_case do backend OU já em hífen) para a
 *  chave do catálogo usada pelos ícones. */
export function blockKeyForStepType(type: string): string {
  return apiTypeToBlockKey[type] ?? type
}

export function getBlockMeta(type: string): BlockMeta {
  return blockMeta[type] ?? def(type, IconBolt, "indigo", "action")
}

/** Estilo inline do chip de ícone por bloco (fundo suave + cor sólida) */
export function blockChipStyle(type: string): CSSProperties {
  const { color } = getBlockMeta(type)
  const p = blockPalette[color]
  return { color: p.fg, backgroundColor: p.bg }
}

/** Apenas a cor sólida do bloco (para barras de acento, traços, etc.) */
export function blockAccent(type: string): string {
  return blockPalette[getBlockMeta(type).color].fg
}

/** Catálogo agrupado para a paleta lateral (ordem fiel ao produto) */
export const blockCategories: { id: BlockCategory; label: string; types: string[] }[] = [
  {
    id: "action",
    label: "Ações",
    types: [
      "send-email",
      "move-stage",
      "assign",
      "add-tag",
      "remove-tag",
      "update-field",
      "create-activity",
      "lead-score",
    ],
  },
  { id: "logic", label: "Lógica", types: ["delay", "condition"] },
  { id: "whatsapp", label: "WhatsApp", types: ["wa-message", "wa-template", "wa-media", "wa-buttons"] },
  { id: "integration", label: "Integrações", types: ["webhook"] },
  {
    id: "salesbot",
    label: "Salesbot",
    types: ["ask-lead", "wait-reply", "set-variable", "goto", "transfer-automation", "end-conversation", "finish-flow"],
  },
  { id: "ai", label: "IA", types: ["ai-agent", "ai-ask"] },
]

/** Classes do "chip" de ícone por tom — mantido para componentes legados (mini-flow, etc.) */
export const toneIconClasses: Record<BlockMeta["tone"], string> = {
  trigger: "bg-[var(--glass-bg)] text-white",
  action: "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]",
  salesbot: "bg-[rgba(167,139,250,0.18)] text-[var(--brand-secondary)]",
  final: "bg-[rgba(239,68,68,0.14)] text-[var(--color-danger)]",
}
