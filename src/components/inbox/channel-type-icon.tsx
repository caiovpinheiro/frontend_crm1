"use client";

import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconMail,
  IconWorld,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/** Ícone da marca do canal (perfil, composer, seletor). WhatsApp permanece o default. */
export function ChannelTypeIcon({
  type,
  size = 14,
  className,
}: {
  type?: string | null;
  size?: number;
  className?: string;
}) {
  const t = (type ?? "").toUpperCase();
  if (t === "INSTAGRAM") {
    return (
      <IconBrandInstagram
        size={size}
        className={cn("shrink-0 text-[#DD2A7B]", className)}
      />
    );
  }
  if (t === "FACEBOOK") {
    return (
      <IconBrandFacebook
        size={size}
        className={cn("shrink-0 text-[#1877F2]", className)}
      />
    );
  }
  if (t === "EMAIL") {
    return <IconMail size={size} className={cn("shrink-0", className)} />;
  }
  if (t === "WEBCHAT") {
    return (
      <IconWorld
        size={size}
        className={cn("shrink-0 text-[var(--channel-webchat)]", className)}
      />
    );
  }
  return (
    <IconBrandWhatsapp
      size={size}
      className={cn("shrink-0 text-[#25d366]", className)}
    />
  );
}

/** Janela de 24h / template HSM vale só para WhatsApp Cloud API. */
export function usesWhatsapp24hWindow(type?: string | null): boolean {
  return (type ?? "").toUpperCase() === "WHATSAPP";
}
