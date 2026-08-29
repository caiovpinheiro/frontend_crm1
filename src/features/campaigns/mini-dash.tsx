"use client";

import { useMemo, type ReactNode } from "react";
import {
  CircleCheck,
  MessageSquareReply,
  Send,
  Megaphone,
  TriangleAlert,
} from "lucide-react";

import { KpiCard, KpiSquareScroll, type KpiTone } from "@/components/crm/kpi-card";

import type { CampaignListItem, CampaignStatus } from "./types";
import { nf, rate } from "./viz";

const SENDING_SET: CampaignStatus[] = ["SENDING", "PROCESSING"];

export function CampaignsMiniDash({ items }: { items: CampaignListItem[] }) {
  const stats = useMemo(() => {
    let sending = 0;
    let sent = 0;
    let read = 0;
    let failed = 0;
    let replied = 0;
    for (const c of items) {
      if (SENDING_SET.includes(c.status)) sending++;
      sent += c.sentCount || 0;
      read += c.readCount || 0;
      failed += c.failedCount || 0;
      replied += c.repliedCount || 0;
    }
    return {
      total: items.length,
      sending,
      sent,
      failed,
      replied,
      readRate: rate(read, sent),
      failRate: rate(failed, sent + failed),
      replyRate: rate(replied, sent),
    };
  }, [items]);

  const cards: {
    key: string;
    label: string;
    shortLabel: string;
    value: ReactNode;
    tone: KpiTone;
    icon: ReactNode;
  }[] = [
    {
      key: "total",
      label: "Total de campanhas",
      shortLabel: "Campanhas",
      value: nf(stats.total),
      tone: "brand",
      icon: <Megaphone className="size-5" aria-hidden="true" />,
    },
    {
      key: "sending",
      label: "Em envio agora",
      shortLabel: "Em envio",
      value: nf(stats.sending),
      tone: "orange",
      icon: <Send className="size-5" aria-hidden="true" />,
    },
    {
      key: "sent",
      label: "Enviadas · leitura",
      shortLabel: "Enviadas",
      value: (
        <>
          {nf(stats.sent)}
          <span className="ml-1.5 text-base font-semibold text-success">
            {stats.readRate}%
          </span>
        </>
      ),
      tone: "success",
      icon: <CircleCheck className="size-5" aria-hidden="true" />,
    },
    {
      key: "replied",
      label: "Respostas · resposta",
      shortLabel: "Respostas",
      value: (
        <>
          {nf(stats.replied)}
          <span className="ml-1.5 text-base font-semibold text-accent">
            {stats.replyRate}%
          </span>
        </>
      ),
      tone: "violet",
      icon: <MessageSquareReply className="size-5" aria-hidden="true" />,
    },
    {
      key: "failed",
      label: "Falhas · erro",
      shortLabel: "Falhas",
      value: (
        <>
          {nf(stats.failed)}
          <span className="ml-1.5 text-base font-semibold text-chip-red">
            {stats.failRate}%
          </span>
        </>
      ),
      tone: "red",
      icon: <TriangleAlert className="size-5" aria-hidden="true" />,
    },
  ];

  return (
    <section className="shrink-0" aria-label="Indicadores de campanhas">
      <KpiSquareScroll
        items={cards.map((c) => ({
          key: c.key,
          label: c.shortLabel,
          value: c.value,
          icon: c.icon,
          tone: c.tone,
        }))}
      />
      <div className="hidden gap-4 lg:grid lg:grid-cols-5">
        {cards.map((c) => (
          <KpiCard
            key={c.key}
            label={c.label}
            value={c.value}
            icon={c.icon}
            tone={c.tone}
          />
        ))}
      </div>
    </section>
  );
}
