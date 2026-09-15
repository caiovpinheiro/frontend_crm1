"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";

import { getOneOnOne } from "./api";

export function OneOnOnePanel({
  peerId,
  peerName,
  onClose,
}: {
  peerId: string;
  peerName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["team-chat-one-on-one", peerId],
    queryFn: () => getOneOnOne(peerId),
    enabled: !!peerId,
  });

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-[var(--orbita-divider)] bg-[var(--orbita-block)]">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">1:1</p>
          <p className="text-[15px] font-semibold text-foreground">{peerName}</p>
        </div>
        <button type="button" aria-label="Fechar 1:1" onClick={onClose} className="text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        <section className={cn(CARD_SURFACE_CLASS, "p-3")}>
          <h3 className="text-[12px] font-semibold text-muted-foreground">Encaminhamentos</h3>
          {(data?.forwards ?? []).length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">Nenhum encaminhamento.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(data?.forwards ?? []).map((f) => (
                <li key={f.id} className="text-[13px]">
                  <p className="font-semibold text-foreground">{f.type}</p>
                  <p className="text-muted-foreground">{f.excerpt}</p>
                  <p className="text-foreground">{f.note}</p>
                  {f.respondedAt && <p className="text-[11px] text-muted-foreground">Ajustado</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={cn(CARD_SURFACE_CLASS, "p-3")}>
          <h3 className="text-[12px] font-semibold text-muted-foreground">Pendências abertas</h3>
          {(data?.openEntries ?? []).length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">Nada em aberto.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(data?.openEntries ?? []).map((e) => (
                <li key={e.id} className="text-[13px]">
                  <p className={cn("text-foreground", e.overdue && "font-semibold")}>{e.text}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {e.workItemTitle}
                    {e.overdue ? " · atrasado" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
