import { IconSpeakerphone } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { AutomationBotIcon } from "@/components/icons/automation-bot-icon"
import { templateBadgeInfo } from "./template-badge"
import type { Message } from "./types"

/** Pills do topo da bolha: campanha, automação e template WABA. */
export function BubbleBadges({
  message,
  isOutgoing,
  isBot,
  isCampaign,
  senderName,
}: {
  message: Message
  isOutgoing: boolean
  isBot: boolean
  isCampaign: boolean
  senderName: string | undefined
}) {
  return (
    <>
      {/* Badge CAMPANHA — pill + nome da campanha (sem duplicar
          "Campanha: …" no pill genérico de bot). */}
      {isCampaign && (
        <div className="mb-1.5 flex flex-col gap-0.5">
          <span
            className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-widest"
            style={{
              background: "var(--chat-bubble-campaign-badge-bg)",
              color: "var(--chat-bubble-campaign-badge-text)",
            }}
            title={senderName || "Campanha"}
          >
            <IconSpeakerphone size={11} />
            Campanha
          </span>
          {message.campaignName ? (
            <span className="font-display text-[11.5px] font-semibold leading-snug">
              {message.campaignName}
            </span>
          ) : null}
        </div>
      )}
      {/* Badge AUTOMAÇÃO — pill escuro em cima do card claro tintado.
          Exibe o nome da automação (senderName) quando o backend envia;
          caso contrário cai no rótulo genérico "Automação". */}
      {isBot && !isCampaign && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-widest"
            style={{ background: "rgba(199,210,254,0.18)", color: "#e0e7ff" }}
            title={
              message.isAutomationRun
                ? "Automação disparada manualmente"
                : senderName || "Automação"
            }
          >
            <AutomationBotIcon size={11} />
            {message.isAutomationRun ? "Manual" : senderName || "Automação"}
          </span>
        </div>
      )}
      {/* Badge TEMPLATE — identifica visualmente quando a mensagem
          foi enviada usando um template pré-aprovado da Meta. Pode
          coexistir com o badge AUTOMAÇÃO (automação disparando um
          template) ou aparecer sozinho (agente enviando template
          manualmente). Usa cor accent que contrasta com ambos os
          fundos (bolha azul regular e bolha automação tintada). */}
      {message.messageType === "template" && (() => {
        const tpl = templateBadgeInfo(message.templateMeta)
        const TplIcon = tpl.icon
        return (
          <div className={cn("mb-1.5 flex items-center gap-1.5", isBot && "-mt-0.5")}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-widest",
                isOutgoing && !isBot
                  ? "bg-white/22 text-white ring-1 ring-inset ring-white/25"
                  : "bg-[color-mix(in_srgb,#0ea5e9_14%,white)] text-[#0369a1] ring-1 ring-inset ring-[color-mix(in_srgb,#0ea5e9_35%,transparent)]",
              )}
              title={tpl.title}
              data-template-category={tpl.category ?? undefined}
            >
              <TplIcon size={10} />
              {tpl.label}
            </span>
          </div>
        )
      })()}
    </>
  )
}
