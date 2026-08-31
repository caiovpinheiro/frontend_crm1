"use client";

import * as React from "react";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandMessenger,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconForms,
  IconMail,
  IconRobot,
} from "@tabler/icons-react";

import {
  AVATAR_BOT_BG,
  AVATAR_UNREAD_BG,
  avatarInitials,
  getAvatarSolidColor,
} from "@/lib/avatar";
import { cn } from "@/lib/utils";

export type ChatAvatarChannel =
  | "whatsapp"
  | "instagram"
  | "email"
  | "meta"
  | "facebook"
  | "messenger"
  | "telegram"
  | "webchat"
  | null;

export interface ChatAvatarUser {
  id?: string | number;
  name?: string | null;
  imageUrl?: string | null;
}

export interface ChatAvatarProps {
  user?: ChatAvatarUser;
  name?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
  unreadCount?: number;
  bgColor?: string;
  /** Diâmetro do avatar em pixels (default 48 — inbox). */
  size?: number;
  /** Qual canal exibir no badge inferior direito. `null` oculta. */
  channel?: ChatAvatarChannel | string | null;
  /** Oculta o overlay de cartoon (legado; mantido por compat). */
  hideCartoon?: boolean;
  /**
   * Força ícone de robô em vez de iniciais.
   * Usado pra mensagens geradas por automação (`senderName === "Automação"`).
   */
  isBot?: boolean;
  className?: string;
}

type ChannelBadgeSpec = {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  bg: string;
  title: string;
};

function resolveChannelBadge(
  channel: ChatAvatarChannel | string | null | undefined,
): ChannelBadgeSpec | null {
  const c = (channel ?? "").toLowerCase().trim();
  if (!c) return null;
  if (c === "whatsapp" || c === "wa")
    return { Icon: IconBrandWhatsapp, bg: "var(--channel-whatsapp)", title: "WhatsApp" };
  if (c === "instagram" || c === "ig")
    return {
      Icon: IconBrandInstagram,
      bg: "linear-gradient(45deg,#F58529 0%,#DD2A7B 50%,#8134AF 100%)",
      title: "Instagram",
    };
  if (c === "facebook" || c === "fb")
    return { Icon: IconBrandFacebook, bg: "var(--channel-facebook)", title: "Facebook" };
  if (c === "meta" || c === "messenger")
    return { Icon: IconBrandMessenger, bg: "var(--channel-messenger)", title: "Messenger" };
  if (c === "telegram" || c === "tg")
    return { Icon: IconBrandTelegram, bg: "var(--channel-telegram)", title: "Telegram" };
  if (c === "email" || c === "mail")
    return { Icon: IconMail, bg: "var(--channel-email)", title: "E-mail" };
  if (c === "webchat" || c === "form" || c === "site" || c === "landing")
    return { Icon: IconForms, bg: "var(--channel-webchat)", title: "Formulário" };
  return null;
}

export function ChatAvatar({
  user,
  name,
  phone,
  imageUrl,
  unreadCount,
  bgColor: customBgColor,
  size = 48,
  channel = "whatsapp",
  hideCartoon: _hideCartoon = false,
  isBot = false,
  className,
}: ChatAvatarProps) {
  const finalName = user?.name || name || phone || "Usuário";
  const finalImageUrl = user?.imageUrl || imageUrl;
  const finalId = String(user?.id ?? finalName);
  const initials = avatarInitials(finalName);

  const lowered = finalName.toLowerCase();
  const isBotResolved =
    isBot ||
    lowered === "automação" ||
    lowered === "automacao" ||
    lowered === "sistema" ||
    lowered === "bot";

  const bgColor =
    customBgColor || (isBotResolved ? AVATAR_BOT_BG : getAvatarSolidColor(finalId));

  const showUnread = typeof unreadCount === "number" && unreadCount > 0;
  const channelBadge = resolveChannelBadge(channel);

  const badgeSize = Math.max(14, Math.round(size * 0.32));
  const badgeFontSize = Math.max(9, Math.round(size * 0.17));
  const badgeBorder = Math.max(1.5, Math.round(size * 0.033));
  const channelIconSize = Math.max(8, Math.round(badgeSize * 0.55));
  const initialsFontSize = Math.max(10, Math.round(size * 0.3));

  return (
    <div
      className={cn("relative isolate shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {showUnread && (
        <div
          className="absolute z-20 flex items-center justify-center rounded-full font-bold text-white shadow-lg"
          style={{
            width: badgeSize,
            height: badgeSize,
            top: -badgeSize * 0.18,
            right: -badgeSize * 0.18,
            fontSize: badgeFontSize,
            border: `${badgeBorder}px solid var(--avatar-ring)`,
            lineHeight: 1,
            backgroundColor: AVATAR_UNREAD_BG,
          }}
        >
          {unreadCount! > 9 ? "9+" : unreadCount}
        </div>
      )}

      <div
        className="relative flex size-full items-center justify-center overflow-hidden rounded-full shadow-[var(--shadow-sm)]"
        style={{
          backgroundColor: bgColor,
          border: `${badgeBorder}px solid var(--color-border)`,
        }}
      >
        {finalImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={finalImageUrl}
            alt={finalName}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : isBotResolved ? (
          <div className="relative flex size-full items-center justify-center">
            <IconRobot
              size="72%"
              stroke={1.8}
              className="relative z-10 text-white"
              aria-label="Automação"
            />
          </div>
        ) : (
          <div className="relative flex size-full items-center justify-center">
            <span
              className="pointer-events-none font-semibold uppercase leading-none text-white/95"
              style={{ fontSize: initialsFontSize }}
            >
              {initials}
            </span>
          </div>
        )}
      </div>

      {channelBadge && (
        <div
          className="absolute z-10 flex items-center justify-center rounded-full text-white shadow-sm"
          title={channelBadge.title}
          aria-label={channelBadge.title}
          style={{
            width: badgeSize,
            height: badgeSize,
            bottom: -badgeSize * 0.08,
            right: -badgeSize * 0.08,
            background: channelBadge.bg,
            border: `${badgeBorder}px solid var(--avatar-ring)`,
          }}
        >
          <channelBadge.Icon size={channelIconSize} className="text-white" />
        </div>
      )}
    </div>
  );
}
