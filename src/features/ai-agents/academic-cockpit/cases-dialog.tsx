"use client";

import * as React from "react";
import { IconInbox, IconMessageCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { fetchAcademicCockpitCases } from "./api";
import type { AcademicCaseKey } from "./types";

export type CasesOpen = { key: AcademicCaseKey; title: string };

export function useCockpitCases() {
  const [open, setOpen] = React.useState<CasesOpen | null>(null);
  return {
    open,
    show: (key: AcademicCaseKey, title: string) => setOpen({ key, title }),
    close: () => setOpen(null),
  };
}

function inboxHref(number: number | null, id: string): string {
  if (number != null) return `/inbox?c=${encodeURIComponent(String(number))}`;
  return `/inbox?c=${encodeURIComponent(id)}`;
}

/**
 * KPIs cuja lista é a mesma população de uma fila da Inbox — o modal ganha um
 * atalho para a aba em vez de deixar o operador atender caso a caso daqui.
 * `attending_now` usa o predicado da aba `agente_ia` (OPEN, sem erro, dono IA).
 */
const QUEUE_TAB_BY_KEY: Partial<
  Record<AcademicCaseKey, { href: string; label: string }>
> = {
  attending_now: {
    href: "/inbox?tab=agente_ia",
    label: "Abrir aba Agente IA na Inbox",
  },
};

export function CockpitCasesDialog({
  open,
  onClose,
}: {
  open: CasesOpen | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    setPage(1);
  }, [open?.key]);

  const query = useQuery({
    queryKey: ["academic-cockpit-cases", open?.key, page],
    queryFn: () => fetchAcademicCockpitCases(open!.key, page),
    enabled: Boolean(open),
    staleTime: 15 * 1000,
    retry: 1,
  });
  const total = query.data?.total ?? 0;
  const pageSize = query.data?.pageSize ?? 50;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const cases = query.data?.cases ?? [];
  const queueTab = open ? QUEUE_TAB_BY_KEY[open.key] : undefined;

  return (
    <Dialog open={Boolean(open)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{open?.title ?? "Casos"}</DialogTitle>
        </DialogHeader>
        {queueTab && (
          <ButtonGlass
            size="sm"
            className="inline-flex w-fit items-center gap-1.5"
            onClick={() => {
              onClose();
              router.push(queueTab.href);
            }}
          >
            <IconInbox size={16} />
            {queueTab.label}
          </ButtonGlass>
        )}
        {query.isPending && (
          <p className="font-body text-[13px] text-[var(--text-muted)]">
            Carregando casos…
          </p>
        )}
        {query.isError && (
          <p className="font-body text-[13px] text-[var(--color-warning-text)]">
            {query.error instanceof Error
              ? query.error.message
              : "Não foi possível carregar os casos."}
          </p>
        )}
        {query.isSuccess && cases.length === 0 && (
          <p className="font-body text-[13px] text-[var(--text-muted)]">
            Nenhum caso neste KPI hoje.
          </p>
        )}
        {query.isSuccess && cases.length > 0 && (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {cases.map((c) => (
              <li
                key={c.conversationId}
                className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                    {c.contactName}
                  </p>
                  <p className="truncate font-body text-[12.5px] text-[var(--text-muted)]">
                    {c.phone ?? "Sem telefone"}
                    {c.conversationNumber != null
                      ? ` · #${c.conversationNumber}`
                      : ""}
                  </p>
                </div>
                <ButtonGlass
                  size="sm"
                  className="inline-flex shrink-0 items-center gap-1.5"
                  onClick={() =>
                    router.push(inboxHref(c.conversationNumber, c.conversationId))
                  }
                >
                  <IconMessageCircle size={16} />
                  Chat
                </ButtonGlass>
              </li>
            ))}
          </ul>
        )}
        {query.isSuccess && total > pageSize && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <ButtonGlass
              size="sm"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </ButtonGlass>
            <p className="font-body text-[12.5px] text-[var(--text-muted)]">
              Página {page} de {pageCount} · {total} pessoas
            </p>
            <ButtonGlass
              size="sm"
              disabled={page >= pageCount || query.isFetching}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Próxima
            </ButtonGlass>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
