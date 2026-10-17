"use client";

import type { ComponentType } from "react";
import type { ChannelProvider, ChannelStatus, ChannelType } from "@/lib/prisma-enum-types";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconGlobe as Globe,
  IconLoader2 as Loader2,
  IconMail as Mail,
  IconSettings as Settings,
  IconTrash as Trash2,
} from "@tabler/icons-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { ApiChannel } from "./types";
import { parseChannelConfigRecord } from "./types";

const PROVIDER_LABELS: Record<ChannelProvider, string> = {
  META_CLOUD_API: "Cloud API",
  BAILEYS_MD: "QR Code",
  META_INSTAGRAM_LOGIN: "Instagram",
  WEBCHAT: "Widget",
};

const TYPE_LABELS: Record<ChannelType, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  EMAIL: "E-mail",
  WEBCHAT: "Webchat",
};

type BrandTile = {
  Icon: ComponentType<{ className?: string; size?: number }>;
  bg: string;
  title: string;
};

function brandTile(type: ChannelType): BrandTile {
  switch (type) {
    case "WHATSAPP":
      return {
        Icon: IconBrandWhatsapp,
        bg: "var(--channel-whatsapp)",
        title: "WhatsApp",
      };
    case "INSTAGRAM":
      return {
        Icon: IconBrandInstagram,
        bg: "linear-gradient(45deg,#F58529 0%,#DD2A7B 50%,#8134AF 100%)",
        title: "Instagram",
      };
    case "FACEBOOK":
      return {
        Icon: IconBrandFacebook,
        bg: "var(--channel-facebook)",
        title: "Facebook",
      };
    case "EMAIL":
      return { Icon: Mail, bg: "var(--channel-email)", title: "E-mail" };
    case "WEBCHAT":
      return { Icon: Globe, bg: "var(--channel-webchat)", title: "Webchat" };
    default:
      return {
        Icon: IconBrandWhatsapp,
        bg: "var(--channel-whatsapp)",
        title: "Canal",
      };
  }
}

type BadgeStyle = {
  label: string;
  wrap: string;
  dot: string;
  ping?: boolean;
};

function badgeStyle(status: ChannelStatus): BadgeStyle {
  switch (status) {
    case "CONNECTED":
      return {
        label: "Conectado",
        wrap: "text-[var(--color-success-text)]",
        dot: "bg-[var(--color-success)]",
        ping: true,
      };
    case "CONNECTING":
      return {
        label: "Conectando",
        wrap: "text-[var(--color-warn)]",
        dot: "bg-[var(--color-warn)]",
      };
    case "QR_READY":
      return {
        label: "Aguardando QR",
        wrap: "text-[var(--brand-primary)]",
        dot: "bg-[var(--brand-primary)]",
      };
    case "FAILED":
      return {
        label: "Falhou",
        wrap: "text-[var(--color-danger-text)]",
        dot: "bg-[var(--color-danger-text)]",
      };
    case "DISCONNECTED":
    default:
      return {
        label: "Desconectado",
        wrap: "text-[var(--text-muted)]",
        dot: "bg-[var(--text-muted)]",
      };
  }
}

function channelIdentifier(channel: ApiChannel): string | null {
  if (channel.phoneNumber?.trim()) return channel.phoneNumber.trim();
  const cfg = parseChannelConfigRecord(channel.config);
  if (channel.type === "WEBCHAT") {
    // Sites liberados (o que o admin reconhece) ou, sem nenhum, a chave.
    const origins = Array.isArray(cfg.allowedOrigins)
      ? cfg.allowedOrigins.filter((o): o is string => typeof o === "string")
      : [];
    if (origins.length) {
      const first = origins[0]?.replace(/^https?:\/\//, "") ?? "";
      return origins.length > 1 ? `${first} +${origins.length - 1}` : first;
    }
    const key = channel.publicKey ?? (typeof cfg.publicKey === "string" ? cfg.publicKey : null);
    return key || null;
  }
  for (const key of ["username", "pageUsername", "pageName", "igUsername"] as const) {
    const v = cfg[key];
    if (typeof v === "string" && v.trim()) {
      const raw = v.trim();
      if (channel.type === "INSTAGRAM" || channel.type === "FACEBOOK") {
        return raw.startsWith("@") || raw.startsWith("/") ? raw : `@${raw}`;
      }
      return raw;
    }
  }
  return null;
}

export type ChannelCardProps = {
  channel: ApiChannel;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onConfigure: (channel: ApiChannel) => void;
  onDelete: (id: string) => void;
  onOpenQr: (channel: ApiChannel) => void;
  isConnectPending?: boolean;
  isDisconnectPending?: boolean;
  isDeletePending?: boolean;
};

/**
 * ChannelCard — layout "integração" (DS v2)
 * ─────────────────────────────────────────
 *  - topo: status (dot + label) + provider
 *  - corpo: tile com logo oficial + nome + tipo · identifier
 *  - rodapé: Gerenciar (+ excluir discreto) | Switch On/Off
 *
 * QR / estados intermediários: Gerenciar abre o fluxo de QR.
 * Toggle mapeia CONNECTED ↔ DISCONNECTED.
 */
export function ChannelCard({
  channel,
  onConnect,
  onDisconnect,
  onConfigure,
  onDelete,
  onOpenQr,
  isConnectPending,
  isDisconnectPending,
  isDeletePending,
}: ChannelCardProps) {
  const { status, id } = channel;

  const isActive = status === "CONNECTED";
  const isTogglePending = isConnectPending || isDisconnectPending;
  const isIntermediate = status === "CONNECTING" || status === "QR_READY";
  const canToggle = !isTogglePending && !isIntermediate;
  const badge = badgeStyle(status);
  const brand = brandTile(channel.type);
  const BrandIcon = brand.Icon;
  const identifier = channelIdentifier(channel);

  const handleToggle = (next: boolean) => {
    if (!canToggle) return;
    if (next) onConnect(id);
    else onDisconnect(id);
  };

  const handleManage = () => {
    if (status === "QR_READY" || status === "CONNECTING") {
      onOpenQr(channel);
      return;
    }
    onConfigure(channel);
  };

  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-[var(--glass-shadow)]",
      )}
    >
      {/* Topo: status + provider */}
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-display text-[12px] font-bold tracking-[0.2px]",
            badge.wrap,
          )}
        >
          {badge.ping ? (
            <span className="relative flex size-1.5">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                  badge.dot,
                )}
              />
              <span className={cn("relative inline-flex size-1.5 rounded-full", badge.dot)} />
            </span>
          ) : (
            <span className={cn("size-1.5 shrink-0 rounded-full", badge.dot)} />
          )}
          {badge.label}
        </span>
        <span className="truncate text-[12px] text-[var(--text-muted)]">
          {PROVIDER_LABELS[channel.provider]}
        </span>
      </div>

      {/* Corpo: marca + nome + identifier */}
      <div className="flex items-start gap-3.5 px-5 py-3.5">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-white shadow-[var(--glass-shadow-sm)]"
          style={{ background: brand.bg }}
          title={brand.title}
        >
          <BrandIcon className="size-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="break-words font-display text-[16.5px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)]"
            title={channel.name}
          >
            {channel.name}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">
            {TYPE_LABELS[channel.type]}
          </p>
          <p
            className={cn(
              "mt-1.5 truncate text-[13px] font-semibold tabular-nums text-[var(--text-secondary)]",
              !identifier && "font-medium text-[var(--text-muted)] opacity-50",
            )}
            title={identifier ?? undefined}
          >
            {identifier ?? "—"}
          </p>
        </div>
      </div>

      {/* Rodapé: Gerenciar + Switch */}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-4 py-2.5">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-white/60 hover:text-[var(--brand-primary)]"
          onClick={handleManage}
        >
          <Settings className="size-4 opacity-80" />
          Gerenciar
        </button>

        <button
          type="button"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]",
          )}
          onClick={() => onDelete(id)}
          disabled={isDeletePending}
          aria-label="Excluir canal"
          title="Excluir"
        >
          {isDeletePending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            disabled={!canToggle}
            aria-label={isActive ? "Desativar canal" : "Ativar canal"}
            className={isActive ? "bg-[var(--color-success)]" : undefined}
          />
          <span
            className={cn(
              "min-w-[2.5rem] font-display text-[12.5px] font-bold",
              isActive ? "text-[var(--color-success)]" : "text-[var(--text-muted)]",
            )}
          >
            {isTogglePending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
              </span>
            ) : isActive ? (
              "On"
            ) : (
              "Off"
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
