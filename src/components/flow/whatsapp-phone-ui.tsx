"use client"

import { useMemo, type ReactNode } from "react"
import {
  ArrowLeft,
  CheckCheck,
  Copy,
  ExternalLink,
  FileText,
  ImageIcon,
  List,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Play,
  Reply,
  Smile,
  Video,
  Workflow,
} from "lucide-react"
import type { NodeConfig, Output } from "@/lib/flow-data"

export const WA_META = {
  header: 60,
  footer: 60,
  body: 1024,
  listBody: 4096,
  replyBtn: 20,
  templateBtn: 25,
  listBtn: 20,
  rowTitle: 24,
  rowDesc: 72,
  section: 24,
} as const

export type WaActionKind = "reply" | "url" | "call" | "flow" | "copy"
export type WaChoice = { id: string; title: string; description?: string; kind: WaActionKind }

export function clipWa(value: string, max: number) {
  const t = value.trim()
  if (!t) return ""
  return t.length > max ? t.slice(0, max) : t
}

export function nowWaLabel() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

export function waActionHint(kind: WaActionKind) {
  if (kind === "url") return "Abre o link no navegador do cliente"
  if (kind === "call") return "Inicia uma ligação"
  if (kind === "flow") return "Abre um WhatsApp Flow"
  if (kind === "copy") return "Copia o código"
  return null
}

export function asWaChoices(cfg: NodeConfig, outputs: Output[]): WaChoice[] {
  const fromButtons = Array.isArray(cfg.buttons)
    ? cfg.buttons.map((b, i) => {
        const rec = b && typeof b === "object" ? (b as Record<string, unknown>) : {}
        const title = String(rec.title ?? rec.text ?? `Opção ${i + 1}`).trim() || `Opção ${i + 1}`
        const description = String(rec.description ?? "").trim()
        const kindRaw = String(rec.kind ?? "").toLowerCase()
        const isFlow =
          kindRaw === "flow" ||
          (kindRaw !== "action" && Boolean(String(rec.flowDefinitionId ?? "").trim()))
        return {
          id: String(rec.id ?? `btn_${i}`),
          title,
          description: description || undefined,
          kind: isFlow ? ("flow" as const) : ("reply" as const),
        }
      })
    : []
  const fromRows = Array.isArray(cfg.rows)
    ? cfg.rows.map((r, i) => {
        const rec = r && typeof r === "object" ? (r as Record<string, unknown>) : {}
        const title = String(rec.title ?? rec.text ?? `Opção ${i + 1}`).trim() || `Opção ${i + 1}`
        const description = String(rec.description ?? "").trim()
        return {
          id: String(rec.id ?? `row_${i}`),
          title,
          description: description || undefined,
          kind: "reply" as const,
        }
      })
    : []
  if (fromButtons.length) return fromButtons
  if (fromRows.length) return fromRows
  return outputs
    .filter((o) => o.kind === "response")
    .map((o) => ({ id: o.key, title: o.label || "Opção", kind: "reply" as const }))
}

export function resolveWaBody(
  stepType: string,
  config: NodeConfig,
  cardPreview?: string,
  tplBody?: string,
) {
  if (stepType === "send_product") {
    const custom = typeof config.content === "string" ? config.content.trim() : ""
    if (custom) return custom
    const name = String(config.productName || "Produto")
    const price = typeof config.unitPrice === "number" ? config.unitPrice : undefined
    const discount = typeof config.discountPercent === "number" ? config.discountPercent : 0
    const finalPrice =
      price != null ? (discount > 0 ? price * (1 - discount / 100) : price) : undefined
    const money =
      finalPrice != null
        ? finalPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : null
    return [`*${name}*`, money ? `Valor: ${money}` : null].filter(Boolean).join("\n")
  }
  return (
    (stepType === "send_whatsapp_template"
      ? tplBody || config.bodyPreview || cardPreview
      : undefined) ||
    (typeof config.body === "string" ? config.body : "") ||
    (typeof config.message === "string" ? config.message : "") ||
    (typeof config.content === "string" ? config.content : "") ||
    (typeof config.caption === "string" ? config.caption : "") ||
    cardPreview ||
    ""
  )
}

export function WaText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
  return (
    <p className={className}>
      {parts.map((p, i) => {
        if (p.length >= 2 && p.startsWith("*") && p.endsWith("*")) {
          return <strong key={i}>{p.slice(1, -1)}</strong>
        }
        if (p.length >= 2 && p.startsWith("_") && p.endsWith("_")) {
          return <em key={i}>{p.slice(1, -1)}</em>
        }
        if (p.length >= 2 && p.startsWith("~") && p.endsWith("~")) {
          return <s key={i}>{p.slice(1, -1)}</s>
        }
        return <span key={i}>{p}</span>
      })}
    </p>
  )
}

export function ChoiceIcon({ kind }: { kind: WaActionKind }) {
  const cls = "h-3 w-3"
  if (kind === "url") return <ExternalLink className={cls} />
  if (kind === "call") return <Phone className={cls} />
  if (kind === "flow") return <Workflow className={cls} />
  if (kind === "copy") return <Copy className={cls} />
  return <Reply className={cls} />
}

export function ReceivedBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="relative max-w-[72%] overflow-hidden rounded-md rounded-tl-[2px] bg-white px-1.5 pb-0 pt-1 shadow-[0_1px_1px_rgba(11,20,26,0.13)]">
        {children}
      </div>
    </div>
  )
}

export function SentBubble({ children, time }: { children: ReactNode; time: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] rounded-md rounded-tr-[2px] bg-[#d9fdd3] px-1.5 pb-0.5 pt-1 shadow-[0_1px_1px_rgba(11,20,26,0.13)]">
        {children}
        <p className="mt-px flex items-center justify-end gap-0.5 text-[8px] text-[#667781]">
          {time}
          <CheckCheck className="h-2.5 w-2.5 text-[#53bdeb]" />
        </p>
      </div>
    </div>
  )
}

export function SystemChip({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto max-w-[92%] rounded-md bg-[#fff5c4] px-2 py-1 text-center text-[10px] text-[#54656f] shadow-sm">
      {children}
    </p>
  )
}

export function MediaBlock({ type, fileName, src }: { type: string; fileName?: string; src?: string }) {
  const kind = type.toLowerCase()
  if (kind === "audio") {
    return (
      <div className="mb-1 flex items-center gap-2 rounded-md bg-[#f0f2f5] px-2 py-2 text-[#54656f]">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00a884] text-white">
          <Play className="h-3.5 w-3.5 fill-current" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="h-1 rounded-full bg-[#d1d7db]">
            <div className="h-1 w-1/3 rounded-full bg-[#00a884]" />
          </div>
          <p className="mt-0.5 text-[10px]">0:12</p>
        </div>
        <Mic className="h-4 w-4" />
      </div>
    )
  }
  if (kind === "document") {
    const ext = (fileName?.split(".").pop() || "ARQ").toUpperCase()
    return (
      <div className="mb-1 flex items-center gap-2 rounded-md bg-[#f0f2f5] px-2 py-2">
        <FileText className="h-6 w-6 text-[#027eb5]" />
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-[#111b21]">{fileName || "Documento"}</p>
          <p className="text-[10px] text-[#667781]">{ext}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="relative mb-0.5 flex h-[72px] items-center justify-center overflow-hidden rounded bg-[#dfe5e7] text-[#667781]">
      {src && kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : kind === "video" ? (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white">
          <Play className="h-4 w-4 fill-current" />
        </span>
      ) : (
        <ImageIcon className="h-8 w-8" />
      )}
    </div>
  )
}

export function WhatsAppPhoneShell({
  bizName,
  bizDetail,
  time,
  onBack,
  composer,
  overlay,
  children,
}: {
  bizName: string
  bizDetail?: string
  time: string
  onBack: () => void
  composer?: ReactNode
  overlay?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-[min(78dvh,600px)] w-full max-w-[292px] flex-col overflow-hidden rounded-[32px] border-[7px] border-[#1f1f1f] bg-[#0b141a] shadow-[0_18px_48px_rgba(0,0,0,0.4)]">
      <div className="flex shrink-0 items-center justify-between bg-[#1f1f1f] px-4 pb-0.5 pt-1.5 text-[9px] font-semibold text-white/80">
        <span>{time}</span>
        <span className="mx-auto h-2.5 w-16 rounded-full bg-black" />
        <span>5G</span>
      </div>

      <div className="relative isolate flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-1.5 bg-[#008069] px-1.5 py-1.5 text-white">
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-white/10"
            onClick={onBack}
            aria-label="Fechar preview"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
            {bizName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">{bizName}</p>
            <p className="truncate text-[10px] text-white/75">{bizDetail || "online"}</p>
          </div>
          <Video className="h-3.5 w-3.5 opacity-90" />
          <Phone className="h-3.5 w-3.5 opacity-90" />
          <MoreVertical className="h-3.5 w-3.5 opacity-90" />
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{
            backgroundColor: "#efeae2",
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.035) 0 1px, transparent 1.5px), radial-gradient(circle at 80% 60%, rgba(0,0,0,0.03) 0 1px, transparent 1.5px)",
            backgroundSize: "28px 28px",
          }}
        >
          {children}
          {composer ?? (
            <div className="flex shrink-0 items-center gap-1 bg-[#f0f2f5] px-1 py-1">
              <Smile className="h-3.5 w-3.5 text-[#54656f]" />
              <div className="flex-1 rounded-full bg-white px-2 py-1 text-[10px] text-[#667781]">Mensagem</div>
              <Paperclip className="h-3.5 w-3.5 text-[#54656f]" />
            </div>
          )}
        </div>
        {overlay}
      </div>
    </div>
  )
}

export function WhatsAppBotBubble({
  stepType,
  config,
  outputs,
  cardPreview,
  tpl,
  time,
  onChoice,
  onOpenList,
  interactive,
}: {
  stepType: string
  config: NodeConfig
  outputs: Output[]
  cardPreview?: string
  tpl?: {
    bodyPreview?: string
    headerPreview?: string
    footerPreview?: string
    headerFormat?: string | null
    buttons: { title: string; kind: WaActionKind }[]
  }
  time: string
  onChoice?: (c: WaChoice, index: number) => void
  onOpenList?: () => void
  interactive?: boolean
}) {
  const isProduct = stepType === "send_product"
  const choices = useMemo<WaChoice[]>(() => {
    if (isProduct) return []
    if (stepType === "send_whatsapp_template" && tpl?.buttons.length) {
      return tpl.buttons.map((b, i) => ({
        id: `tpl_${i}`,
        title: clipWa(b.title, WA_META.templateBtn),
        kind: b.kind,
      }))
    }
    const raw = asWaChoices(config, outputs).slice(0, 10)
    const listMode =
      stepType === "send_whatsapp_list" ||
      (stepType === "send_whatsapp_interactive" && raw.length > 3)
    return raw.map((c) => ({
      ...c,
      title: clipWa(c.title, listMode ? WA_META.rowTitle : WA_META.replyBtn),
      description: c.description ? clipWa(c.description, WA_META.rowDesc) : undefined,
    }))
  }, [config, outputs, stepType, tpl, isProduct])

  const asList =
    stepType === "send_whatsapp_list" ||
    (stepType === "send_whatsapp_interactive" && choices.length > 3)

  const body = clipWa(
    resolveWaBody(stepType, config, cardPreview, tpl?.bodyPreview),
    asList ? WA_META.listBody : WA_META.body,
  )
  const header = clipWa(
    stepType === "send_whatsapp_template"
      ? tpl?.headerPreview || ""
      : typeof config.header === "string"
        ? config.header
        : "",
    WA_META.header,
  )
  const footer = clipWa(
    stepType === "send_whatsapp_template"
      ? tpl?.footerPreview || ""
      : typeof config.footer === "string"
        ? config.footer
        : "",
    WA_META.footer,
  )
  const listButton = clipWa(
    (typeof config.button === "string" && config.button.trim()) || "Ver opções",
    WA_META.listBtn,
  )
  const headerFormat = (tpl?.headerFormat ?? "").toUpperCase()
  const mediaType = String(config.mediaType ?? "image").toLowerCase()
  const mediaUrl = typeof config.mediaUrl === "string" ? config.mediaUrl.trim() : ""
  const mediaName = String(config.filename || config.uploadedFileName || config.mediaFileName || "").trim()
  const cannotSend =
    !body && choices.length === 0 && stepType !== "send_whatsapp_media" && !isProduct

  if (cannotSend) {
    return <SystemChip>Este card ainda não envia — falta texto, template ou opção</SystemChip>
  }

  const show =
    body || header || footer || asList || choices.length > 0 || stepType === "send_whatsapp_media"
  if (!show) return null

  return (
    <ReceivedBubble>
      {stepType === "send_whatsapp_media" && (
        <MediaBlock type={mediaType} fileName={mediaName} src={mediaUrl} />
      )}
      {stepType === "send_whatsapp_template" &&
        (headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT") && (
          <MediaBlock type={headerFormat.toLowerCase()} />
        )}
      <div className="relative min-w-[88px] pb-2.5 pr-7">
        {header ? (
          <p className="mb-px text-[11px] font-bold leading-[14px] text-[#111b21]">{header}</p>
        ) : null}
        {body ? (
          <WaText text={body} className="whitespace-pre-wrap text-[11px] leading-[14px] text-[#111b21]" />
        ) : null}
        {footer ? (
          <p className="mt-px text-[9px] leading-[12px] text-[#8696a0]">{footer}</p>
        ) : null}
        <span className="absolute bottom-0 right-0 text-[8px] leading-none text-[#667781]">{time}</span>
      </div>
      {interactive && !asList && choices.length > 0 && (
        <div className="-mx-1.5 mt-0.5 border-t border-[#e9edef]">
          {choices.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChoice?.(c, i)}
              className="flex w-full items-center justify-center gap-1 border-t border-[#e9edef] py-1 text-[11px] font-medium text-[#027eb5] first:border-t-0 hover:bg-[#f7f8fa]"
            >
              <ChoiceIcon kind={c.kind} />
              {c.title}
            </button>
          ))}
        </div>
      )}
      {interactive && asList && (
        <button
          type="button"
          onClick={onOpenList}
          className="-mx-1.5 mt-0.5 flex w-[calc(100%+0.75rem)] items-center justify-center gap-1 border-t border-[#e9edef] py-1 text-[11px] font-medium text-[#027eb5] hover:bg-[#f7f8fa]"
        >
          <List className="h-3 w-3" />
          {listButton}
        </button>
      )}
    </ReceivedBubble>
  )
}

export function WhatsAppListSheet({
  title,
  sectionTitle,
  choices,
  onClose,
  onChoice,
}: {
  title: string
  sectionTitle?: string
  choices: WaChoice[]
  onClose: () => void
  onChoice: (c: WaChoice, index: number) => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden">
      <button type="button" className="min-h-0 w-full flex-1 bg-black/45" onClick={onClose} aria-label="Fechar lista" />
      <div className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-t-[16px] bg-white pb-4 shadow-[0_-8px_24px_rgba(11,20,26,0.2)] [max-height:min(72%,28rem)]">
        <div className="mx-auto mt-1.5 h-1 w-8 shrink-0 rounded-full bg-[#d1d7db]" />
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
          <p className="truncate text-[13px] font-semibold text-[#111b21]">{title}</p>
          <button type="button" onClick={onClose} className="rounded-full p-0.5 text-[#54656f] hover:bg-[#f0f2f5]" aria-label="Fechar lista">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {sectionTitle ? (
            <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-[#8696a0]">{sectionTitle}</p>
          ) : null}
          {choices.length === 0 ? (
            <p className="px-3 py-2 text-[11px] italic text-[#8696a0]">Nenhuma opção cadastrada</p>
          ) : (
            choices.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChoice(c, i)}
                className="flex w-full flex-col items-start border-t border-[#f0f2f5] px-3 py-2.5 text-left first:border-t-0 hover:bg-[#f6f6f6]"
              >
                <span className="text-[13px] leading-[18px] text-[#111b21]">{c.title}</span>
                {c.description ? (
                  <span className="text-[11px] leading-[14px] text-[#667781]">{c.description}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
