import { IconClockExclamation, IconStarFilled } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { MetaSendErrorBalloon } from "@/components/crm/meta-send-error-balloon"
import { StatusTicks } from "@/components/crm/status-ticks"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Message } from "./types"

/** Horário + ticks de status (ou aviso de falha / entrega não confirmada) da bolha. */
export function BubbleMeta({
  message,
  isOutgoing,
  isBot,
  isCampaign,
  hasButtons,
  timeOverMedia,
  deliveryStale,
}: {
  message: Message
  isOutgoing: boolean
  isBot: boolean
  isCampaign: boolean
  hasButtons: boolean
  timeOverMedia: boolean
  deliveryStale: boolean
}) {
  return (
    <span
      className={cn(
        "pointer-events-none select-none items-center gap-0.5 whitespace-nowrap text-[10.5px] leading-none",
        hasButtons
          ? "mt-1.5 flex w-full justify-end"
          : "absolute bottom-2 right-3 inline-flex",
        timeOverMedia &&
          "rounded px-1 py-0.5 text-white shadow-[0_1px_2px_rgba(0,0,0,0.55)] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] bg-black/35",
        !timeOverMedia && isOutgoing && isBot && !isCampaign && "text-white/70",
        !timeOverMedia && isOutgoing && isCampaign && "opacity-65",
        !timeOverMedia && !isOutgoing && "text-[var(--text-muted)]",
      )}
      style={
        !timeOverMedia && isOutgoing && !isBot && !isCampaign
          ? { color: "var(--chat-bubble-sent-time)" }
          : undefined
      }
    >
      {message.isFavorited && (
        <IconStarFilled size={10} className="text-amber-400" aria-label="Favoritada" />
      )}
      {message.time}
      {isOutgoing && message.status === "failed" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="pointer-events-auto inline-flex cursor-help">
              <StatusTicks status="failed" onLightBg={false} />
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="end"
            className="border-0 bg-transparent p-0 shadow-none"
          >
            <MetaSendErrorBalloon sendError={message.sendError} />
          </TooltipContent>
        </Tooltip>
      ) : isOutgoing && deliveryStale ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="pointer-events-auto inline-flex cursor-help text-amber-300"
              aria-label="Entrega não confirmada"
              data-delivery-stale
            >
              <IconClockExclamation size={13} stroke={2.4} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="max-w-[240px] text-left leading-tight">
            Entrega não confirmada após 5 min — o número pode estar
            pausado, sinalizado ou com qualidade rebaixada na Meta.
          </TooltipContent>
        </Tooltip>
      ) : isOutgoing && message.status ? (
        <StatusTicks status={message.status} onLightBg={false} />
      ) : null}
    </span>
  )
}
