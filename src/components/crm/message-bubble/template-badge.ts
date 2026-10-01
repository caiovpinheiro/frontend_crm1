import { IconFile, IconShieldCheck, IconSpeakerphone, IconTool } from "@tabler/icons-react"
import type { Message } from "./types"

/**
 * Badge do template WABA: categoria (custo) + nome no tooltip. Sem
 * categoria conhecida cai no rótulo genérico "Template".
 */
export function templateBadgeInfo(
  meta: Message["templateMeta"] | undefined,
): {
  label: string
  category: "marketing" | "utility" | "authentication" | null
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
} {
  const cat = (meta?.category ?? "").trim().toLowerCase()
  const isMkt = cat === "marketing"
  const isUtility = cat === "utility" || cat === "utilidade"
  const isAuth = cat === "authentication" || cat.includes("autentica")
  const label = isMkt ? "Marketing" : isUtility ? "Utility" : isAuth ? "Autenticação" : "Template"
  const hint = isMkt
    ? "Custo mais alto — mensagem promocional"
    : isUtility
      ? "Custo moderado — mensagem transacional"
      : isAuth
        ? "Custo baixo — autenticação"
        : "Modelo de mensagem aprovado pela Meta"
  const name = meta?.name?.trim()
  return {
    label,
    category: isMkt ? "marketing" : isUtility ? "utility" : isAuth ? "authentication" : null,
    title: name ? `${label} · ${name} — ${hint}` : `${label} — ${hint}`,
    icon: isMkt ? IconSpeakerphone : isUtility ? IconTool : isAuth ? IconShieldCheck : IconFile,
  }
}
