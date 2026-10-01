import { useState } from "react"
import { PhoneIncoming, PhoneOff, PhoneOutgoing, ShoppingBag } from "lucide-react"
import { IconChevronDown, IconClipboardList } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { EventRow } from "@/components/crm/chat-timeline"
import type { Message } from "./types"

function formatOrderMoney(amount: number, currency: string): string {
  const code = currency?.trim() || "BRL"
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}

export function CatalogOrderBubble({
  order,
  time,
  className,
}: {
  order: NonNullable<Message["catalogOrder"]>
  time: string
  className?: string
}) {
  const lineTotal = (price: number, qty: number) => price * qty
  return (
    <div className={cn("flex w-full justify-start", className)}>
      <div className="w-full max-w-[22rem] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <ShoppingBag className="size-4 text-primary" aria-hidden />
          <p className="text-sm font-semibold">Pedido do catálogo</p>
        </div>
        {order.text ? (
          <p className="px-3 pt-2 text-sm text-muted-foreground">{order.text}</p>
        ) : null}
        <ul className="flex flex-col gap-2 px-3 py-2">
          {order.items.map((item) => (
            <li key={`${item.productRetailerId}-${item.productId ?? "x"}`} className="flex min-w-0 items-center gap-2">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px] text-muted-foreground">
                  {item.productId ? "SKU" : "?"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × {formatOrderMoney(item.itemPrice, item.currency)}
                  {!item.productId ? ` · ${item.productRetailerId}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm tabular-nums">
                {formatOrderMoney(lineTotal(item.itemPrice, item.quantity), item.currency)}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
          <span className="text-muted-foreground">{time}</span>
          <span className="font-semibold tabular-nums">
            Total {formatOrderMoney(order.total, order.currency)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function FormBubble({ message, className }: { message: Message; className?: string }) {
  const [open, setOpen] = useState(false)
  const fields = message.formFields!
  const count = fields.length

  return (
    <div className={cn("flex max-w-[72%] flex-col gap-1", className)}>
      <div
        className="overflow-hidden rounded-[var(--radius-lg)] rounded-bl border border-[var(--glass-border)] shadow-[0_2px_8px_rgba(100,130,180,0.08)]"
        style={{ background: "var(--chat-bubble-received-bg)" }}
      >
        {/* Cabeçalho clicável — sempre visível */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--brand-primary)]/[0.04]"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--brand-primary)]/10">
            <IconClipboardList size={13} className="text-[var(--brand-primary)]" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-primary)]/70 leading-none mb-0.5">
              Formulário
            </p>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="truncate font-display text-[13px] font-bold leading-tight text-[var(--text-primary)]">
                {message.formTitle || "Resposta"}
              </p>
              {/* Contador de campos como pill preenchida (ref. V0) */}
              <span className="shrink-0 rounded-md bg-[var(--brand-primary)]/12 px-2 py-0.5 font-display text-[10.5px] font-semibold text-[var(--brand-primary)]">
                {count} {count === 1 ? "campo" : "campos"}
              </span>
              {/* Timestamp inline no estado recolhido — padrão WhatsApp */}
              {!open && (
                <span className="ml-auto shrink-0 font-body text-[10px] leading-none text-[var(--text-muted)]">
                  {message.time}
                </span>
              )}
            </div>
          </div>
          <IconChevronDown
            size={14}
            className={cn(
              "shrink-0 text-[var(--text-muted)] transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>

        {/* Campos — só visíveis quando aberto */}
        {open && (
          <div className="border-t border-[var(--glass-border)]/60">
            {fields.map((f, i) => {
              const isLast = i === fields.length - 1
              return (
                <div
                  key={i}
                  className={cn(
                    "px-3 py-1.5",
                    !isLast && "border-b border-[var(--glass-border)]/40",
                    isLast && "pb-2",
                  )}
                >
                  <p className="font-display text-[9.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)] leading-none mb-0.5">
                    {f.label}
                  </p>
                  {/* Último campo: spacer flutuante reserva só a largura do horário
                      (padrão WhatsApp) — sem padding-right fixo que abre um vão. */}
                  <div className="relative">
                    <p className="flow-root font-body text-[12.5px] leading-snug text-[var(--text-primary)]">
                      {f.value}
                      {isLast && (
                        <span
                          aria-hidden
                          className="invisible float-right ml-1.5 font-body text-[10px] leading-none"
                        >
                          {message.time}
                        </span>
                      )}
                    </p>
                    {isLast && (
                      <span className="pointer-events-none absolute bottom-0 right-0 select-none font-body text-[10px] leading-none text-[var(--text-muted)]">
                        {message.time}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** Ligação SIP ou WhatsApp Calling: EventRow na conversa.
 * Gravação WhatsApp COM mediaUrl cai no fluxo de áudio (detectMediaKind). */
export function isVoiceCallEvent(message: Message): boolean {
  const callType = String(message.messageType ?? "").toLowerCase()
  return (
    (callType === "sip_call" && !message.mediaUrl) ||
    callType === "whatsapp_call" ||
    (callType === "whatsapp_call_recording" && !message.mediaUrl)
  )
}

export function VoiceCallEventRow({ message, className }: { message: Message; className?: string }) {
  const callType = String(message.messageType ?? "").toLowerCase()
  const inbound = message.type === "incoming"
  const body = message.content ?? ""
  const missed = /n[ãa]o atendida|n[ãa]o completada|falhou/i.test(body)
  const ended = /\bfim\b|encerrada/i.test(body)
  const fallback =
    callType === "sip_call"
      ? inbound
        ? "Ligação recebida"
        : "Ligação realizada"
      : inbound
        ? "Chamada recebida pelo WhatsApp"
        : missed
          ? "Chamada WhatsApp não completada"
          : ended
            ? "Chamada WhatsApp encerrada"
            : "Chamada realizada pelo WhatsApp"
  const dirIcon = inbound ? PhoneIncoming : PhoneOutgoing
  return (
    <EventRow
      icon={missed ? PhoneOff : dirIcon}
      iconClassName={
        missed
          ? "text-[var(--color-danger)]"
          : ended
            ? "text-[var(--color-ink-soft)]"
            : "text-[var(--color-success)]"
      }
      text={fallback}
      actor=""
      time={message.time}
      className={className}
    />
  )
}
