import { IconRobot, IconSpeakerphone } from "@tabler/icons-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/crm/user-avatar"
import { avatarInitials } from "@/lib/avatar"
import { AUTOMATION_ACCENT, CAMPAIGN_ACCENT } from "./constants"
import type { Message, MessageBubbleProps } from "./types"

/** Avatar do remetente de uma mensagem enviada: robô (bot/campanha) ou agente. */
export function SenderAvatar({
  message,
  isBot,
  isCampaign,
  senderName,
  senderPhotoByName,
}: {
  message: Message
  isBot: boolean
  isCampaign: boolean
  senderName: string | undefined
  senderPhotoByName: MessageBubbleProps["senderPhotoByName"]
}) {
  return message.isAutomationRun && message.automationAgentInitials ? (
    <div className="relative flex shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex h-9 w-9 cursor-default items-center justify-center rounded-full font-display text-[10px] font-bold text-white"
            style={{ background: AUTOMATION_ACCENT }}
          >
            <IconRobot size={20} aria-label="Automação" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="font-medium text-[11px]">
          Automação
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="absolute -bottom-1 -right-1 flex h-[21px] min-w-[21px] cursor-default items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] px-0.5 font-display text-[10px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(15,20,40,0.28)]">
            {message.automationAgentInitials}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="font-medium text-[11px]">
          Disparada por {message.automationAgentName || "agente"}
        </TooltipContent>
      </Tooltip>
    </div>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        {isBot ? (
          <div
            className="flex h-9 w-9 shrink-0 cursor-default items-center justify-center overflow-hidden rounded-full font-display text-[11px] font-bold text-white"
            style={{
              background: isCampaign ? CAMPAIGN_ACCENT : AUTOMATION_ACCENT,
            }}
          >
            {isCampaign ? (
              <IconSpeakerphone size={18} aria-label="Campanha" />
            ) : (
              <IconRobot size={19} aria-label="Automação" />
            )}
          </div>
        ) : (
          <span className="inline-flex shrink-0">
            <UserAvatar
              name={senderName}
              initials={
                message.senderInitials ||
                avatarInitials(senderName) ||
                "?"
              }
              imageUrl={
                message.senderImageUrl ||
                (senderPhotoByName && senderName
                  ? senderPhotoByName.get(
                      senderName.trim().toLowerCase(),
                    ) ?? null
                  : null) ||
                null
              }
              size={36}
            />
          </span>
        )}
      </TooltipTrigger>
      {senderName && (
        <TooltipContent side="left" className="font-medium text-[11px]">
          {senderName}
        </TooltipContent>
      )}
    </Tooltip>
  )
}
