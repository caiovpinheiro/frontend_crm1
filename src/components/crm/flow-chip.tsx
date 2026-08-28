import {
  Clock,
  FileText,
  Flag,
  GitBranch,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  Pause,
  Sparkles,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { blockKeyForStepType, getBlockMeta } from "./flow-block-icon"

export type ChipColor = "blue" | "violet" | "green" | "orange" | "red"

/** Cor do chip por tipo — nunca uma cor fixa (handoff erro #2). */
const colorMap: Record<ChipColor, string> = {
  blue: "bg-chip-blue-soft text-chip-blue",
  violet: "bg-chip-violet-soft text-chip-violet",
  green: "bg-chip-green-soft text-chip-green",
  orange: "bg-chip-orange-soft text-chip-orange",
  red: "bg-chip-red-soft text-chip-red",
}

const lucideByType: Record<string, LucideIcon> = {
  trigger: Zap,
  branch: GitBranch,
  condition: GitBranch,
  goto: GitBranch,
  sparkle: Sparkles,
  web: Globe,
  webhook: Globe,
  "ai-agent": Sparkles,
  "ai-ask": Sparkles,
  ask_ai_agent: Sparkles,
  transfer_to_ai_agent: Sparkles,
  message: MessageSquare,
  tag: Tag,
  document: FileText,
  image: ImageIcon,
  send_message: MessageSquare,
  send_whatsapp_message: MessageSquare,
  "wa-message": MessageSquare,
  add_tag: Tag,
  "add-tag": Tag,
  send_email: FileText,
  send_whatsapp_template: FileText,
  "wa-template": FileText,
  send_whatsapp_media: ImageIcon,
  "wa-media": ImageIcon,
  pause: Pause,
  delay: Clock,
  wait: Pause,
  wait_for_reply: Pause,
  "wait-reply": Pause,
  flag: Flag,
  final: Flag,
  finish: Flag,
  stop_automation: Flag,
  finish_conversation: Flag,
  "finish-flow": Flag,
  "end-conversation": Flag,
}

function lucideForStepType(type: string): LucideIcon {
  return lucideByType[type] ?? lucideByType[type.replace(/_/g, "-")] ?? Zap
}

const typeColor: Record<string, ChipColor> = {
  trigger: "blue",
  branch: "violet",
  condition: "violet",
  goto: "violet",
  sparkle: "violet",
  web: "violet",
  webhook: "violet",
  "ai-agent": "violet",
  "ai-ask": "violet",
  ask_ai_agent: "violet",
  transfer_to_ai_agent: "violet",
  message: "green",
  tag: "green",
  document: "green",
  image: "green",
  send_message: "green",
  send_whatsapp_message: "green",
  "wa-message": "green",
  add_tag: "green",
  "add-tag": "green",
  send_email: "green",
  send_whatsapp_template: "green",
  "wa-template": "green",
  send_whatsapp_media: "green",
  "wa-media": "green",
  pause: "orange",
  delay: "orange",
  wait: "orange",
  wait_for_reply: "orange",
  "wait-reply": "orange",
  flag: "red",
  final: "red",
  finish: "red",
  stop_automation: "red",
  finish_conversation: "red",
  "finish-flow": "red",
  "end-conversation": "red",
}

export function chipColorForStepType(type: string): ChipColor {
  if (typeColor[type]) return typeColor[type]
  const hyphen = type.replace(/_/g, "-")
  if (typeColor[hyphen]) return typeColor[hyphen]
  const meta = getBlockMeta(blockKeyForStepType(type))
  if (meta.color === "violet" || meta.color === "pink") return "violet"
  if (meta.color === "green" || meta.color === "teal") return "green"
  if (meta.color === "orange" || meta.color === "amber") return "orange"
  if (meta.color === "red") return "red"
  return "blue"
}

export function FlowChip({
  type,
  label,
}: {
  type: string
  label?: string
}) {
  const meta = getBlockMeta(blockKeyForStepType(type))
  const Icon = lucideForStepType(type)
  return (
    <span
      title={label ?? meta.label}
      className={cn(
        "flex size-9 items-center justify-center rounded-xl",
        colorMap[chipColorForStepType(type)],
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  )
}

export function FlowTrail({
  types,
  extraSteps,
}: {
  types: string[]
  extraSteps: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      {types.map((type, i) => (
        <FlowChip key={`${type}-${i}`} type={type} />
      ))}
      {extraSteps > 0 && (
        <span className="flex h-9 items-center rounded-xl border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground">
          +{extraSteps}
        </span>
      )}
    </div>
  )
}
