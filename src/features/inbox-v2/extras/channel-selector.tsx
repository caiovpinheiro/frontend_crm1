"use client";

import { useMemo } from "react";
import { IconCircleDot } from "@tabler/icons-react";

import { DropdownGlass, type DropdownOption } from "@/components/crm/dropdown-glass";
import { ChannelTypeIcon } from "@/components/inbox/channel-type-icon";
import { cn } from "@/lib/utils";

import type { OutboundChannelOption } from "@/features/inbox-v2/hooks/use-channels";

/**
 * Seletor de canal de envio (WhatsApp / Instagram / Messenger).
 * apenas quando a org tem >1 canal CONNECTED — orgs com 1 canal só não
 * precisam do widget (comportamento legacy preservado).
 *
 * O canal em que o cliente escreveu por último (`customerChannelId`) leva o
 * chip "cliente" na lista. Sem mensagem do cliente no thread, o canal da
 * conversa leva o chip "atual". O canal selecionado para envio é controlado
 * pelo pai (`useSelectedOutboundChannel`), que troca sozinho para o canal do
 * cliente quando chega mensagem nova dele.
 */
export function ChannelSelector({
  channels,
  selectedChannelId,
  conversationChannelId,
  customerChannelId,
  onSelect,
  disabled,
  className,
}: {
  channels: OutboundChannelOption[];
  selectedChannelId: string | null;
  /** Canal "atual" da conversa (último inbound) — destacado como referência. */
  conversationChannelId: string | null;
  /** Canal da última mensagem do cliente. Ausente = usa o da conversa. */
  customerChannelId?: string | null;
  onSelect: (channelId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const referenceId = customerChannelId ?? conversationChannelId;
  const referenceLabel = customerChannelId ? "cliente" : "atual";
  const options = useMemo<DropdownOption[]>(() => {
    return channels.map((ch) => {
      const isCurrent = ch.id === referenceId;
      return {
        value: ch.id,
        label: (
          <span className="flex items-start gap-2">
            <span className="whitespace-normal break-words">{ch.name}</span>
            {isCurrent ? (
              <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 font-display text-[10px] font-semibold text-success ring-1 ring-inset ring-success/25">
                {referenceLabel}
              </span>
            ) : null}
          </span>
        ),
        icon: <ChannelTypeIcon type={ch.type} size={14} />,
        description: ch.phoneNumber ?? undefined,
      };
    });
  }, [channels, referenceId, referenceLabel]);

  const selected = channels.find((c) => c.id === selectedChannelId) ?? null;
  const labelText = selected?.name ?? "Selecionar canal";
  const sublabelText = selected?.phoneNumber ?? null;
  const customerChannel = customerChannelId
    ? (channels.find((c) => c.id === customerChannelId) ?? null)
    : null;
  const customerHint = customerChannel
    ? `Cliente escreveu por último em ${customerChannel.name}`
    : null;

  return (
    <div className="inline-flex max-w-none shrink-0 overflow-visible">
      <DropdownGlass
        options={options}
        value={selectedChannelId ?? undefined}
        onValueChange={onSelect}
        disabled={disabled}
        matchTriggerWidth={false}
        wrapLabels
        menuLabel={customerHint ? `Enviar por · ${customerHint}` : "Enviar por"}
        align="end"
        side="top"
        className="min-w-[16rem] max-w-[min(100vw-1.5rem,22rem)]"
        itemClassName="items-start"
        trigger={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex max-w-none shrink-0 items-center gap-1.5 overflow-visible whitespace-nowrap rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2.5 py-1 font-display text-[11.5px] font-semibold text-[var(--text-secondary)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            aria-label={`Canal de envio: ${labelText}${sublabelText ? ` ${sublabelText}` : ""}`}
            title={customerHint ?? undefined}
          >
            <ChannelTypeIcon type={selected?.type} size={13} />
            <span className="whitespace-nowrap">
              {labelText}
              {sublabelText ? (
                <span className="font-semibold text-[var(--text-muted)]">
                  {" "}
                  · {sublabelText}
                </span>
              ) : null}
            </span>
            <IconCircleDot
              size={10}
              className={cn(
                "shrink-0",
                selectedChannelId && selectedChannelId === referenceId
                  ? "text-success"
                  : "text-[var(--brand-primary)]",
              )}
            />
          </button>
        }
      />
    </div>
  );
}
