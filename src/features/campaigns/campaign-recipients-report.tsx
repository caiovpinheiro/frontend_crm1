"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Users } from "lucide-react";
import { toast } from "sonner";

import { DataRow, DataView } from "@/components/automations/data-view";
import { EmptyState } from "@/components/crm/empty-state";
import { MobileTableScroll } from "@/components/crm/mobile-table-scroll";
import { LIST_PAGE_STACK_CLASS, PaginationGlass } from "@/components/crm/pagination-glass";
import { CARD_SURFACE_CLASS, ListColumnLabel } from "@/components/crm/sortable-header";
import { downloadTextCsv } from "@/features/data-io/download-csv";
import { cn } from "@/lib/utils";

import { fetchAllRecipients } from "./api";
import {
  RECIPIENT_CHIP_CLASS,
  RECIPIENT_META,
  RECIPIENT_REPORT_FILTERS,
} from "./constants";
import { useCampaignRecipients } from "./hooks";
import { recipientReportFilename, recipientsToCsv } from "./recipients-report-csv";
import { fmtDateTimeBR, nf } from "./viz";

const RECIPIENT_PER_PAGE = 25;

const COLUMN_CLASS =
  "grid min-w-0 grid-cols-[minmax(0,1.5fr)_minmax(140px,0.9fr)_110px_minmax(0,1.3fr)_150px_40px] items-center gap-4";

export function CampaignRecipientsReport({
  campaignId,
  campaignName,
  filter,
  onFilterChange,
  page,
  onPageChange,
  enabled,
  counts,
}: {
  campaignId: string;
  campaignName: string;
  filter: string;
  onFilterChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  enabled: boolean;
  counts: {
    total: number;
    delivered: number;
    pending: number;
    failed: number;
    sent: number;
    read: number;
  };
}) {
  const [exporting, setExporting] = useState(false);
  const recipientsQuery = useCampaignRecipients(
    campaignId,
    { status: filter || undefined, page, perPage: RECIPIENT_PER_PAGE },
    enabled,
  );

  const recipients = recipientsQuery.data?.items ?? [];
  const recipientTotal = recipientsQuery.data?.total ?? 0;
  const recipientPages = Math.max(1, recipientsQuery.data?.totalPages ?? 1);

  const countFor = (value: string): number | undefined => {
    if (value === "") return counts.total;
    if (value === "DELIVERED") return counts.delivered;
    if (value === "PENDING") return counts.pending;
    if (value === "FAILED") return counts.failed;
    if (value === "SENT") return counts.sent;
    if (value === "READ") return counts.read;
    return undefined;
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const { items, truncated } = await fetchAllRecipients(campaignId, {
        status: filter || undefined,
      });
      if (items.length === 0) {
        toast.error("Nenhum destinatário neste filtro para exportar.");
        return;
      }
      downloadTextCsv(
        recipientReportFilename(campaignName, filter),
        recipientsToCsv(items),
      );
      toast.success(
        truncated
          ? `Relatório exportado com os primeiros ${nf(items.length)} registros.`
          : `Relatório exportado (${nf(items.length)} destinatários).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao exportar relatório.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className={cn(CARD_SURFACE_CLASS, "flex min-h-[420px] flex-col p-5")}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">Relatório de destinatários</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Filtre por sucesso, pendentes, erros e demais status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportReport()}
          disabled={exporting || recipientTotal === 0}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          <Download className="size-4" aria-hidden="true" />
          {exporting ? "Exportando…" : "Exportar CSV"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1 rounded-full border border-border p-1">
        {RECIPIENT_REPORT_FILTERS.map((item) => {
          const count = countFor(item.value);
          return (
            <button
              key={item.value || "all"}
              type="button"
              onClick={() => onFilterChange(item.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                filter === item.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              {typeof count === "number" ? (
                <span className="ml-1.5 tabular-nums opacity-80">{nf(count)}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        {recipientsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : recipients.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <EmptyState
              icon={<Users size={28} />}
              title="Nenhum destinatário"
              description={
                counts.total > 0
                  ? "Nenhum contato com esse status."
                  : "Esta campanha ainda não tem destinatários."
              }
            />
          </div>
        ) : (
          <MobileTableScroll minWidth={860}>
            <DataView
              view="cards"
              columnClass={COLUMN_CLASS}
              className={LIST_PAGE_STACK_CLASS}
              header={
                <>
                  <ListColumnLabel>Contato</ListColumnLabel>
                  <ListColumnLabel>Telefone</ListColumnLabel>
                  <ListColumnLabel>Status</ListColumnLabel>
                  <ListColumnLabel>Erro</ListColumnLabel>
                  <ListColumnLabel>Enviado em</ListColumnLabel>
                  <ListColumnLabel align="right">Lead</ListColumnLabel>
                </>
              }
            >
              {recipients.map((recipient) => {
                const rmeta = RECIPIENT_META[recipient.status] ?? RECIPIENT_META.PENDING;
                return (
                  <DataRow key={recipient.id}>
                    <Link
                      href={`/contacts/${recipient.contact.id}`}
                      className="min-w-0 rounded-lg outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                      title="Abrir lead"
                    >
                      <p className="truncate font-semibold text-foreground hover:text-primary">
                        {recipient.contact.name}
                      </p>
                      {recipient.repliedAt ? (
                        <span className="mt-0.5 inline-flex rounded-full bg-chip-violet-soft px-2 py-0.5 text-xs font-bold text-chip-violet">
                          Respondeu
                        </span>
                      ) : null}
                    </Link>
                    <p className="truncate text-sm tabular-nums text-muted-foreground">
                      {recipient.contact.phone ?? "—"}
                    </p>
                    <span
                      className={cn(
                        "w-fit rounded-full px-2 py-0.5 text-xs font-bold",
                        RECIPIENT_CHIP_CLASS[recipient.status],
                      )}
                    >
                      {rmeta.label}
                    </span>
                    <p
                      className={cn(
                        "truncate text-sm",
                        recipient.errorMessage
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                      title={recipient.errorMessage ?? undefined}
                    >
                      {recipient.errorMessage ?? "—"}
                    </p>
                    <p className="truncate text-sm tabular-nums text-muted-foreground">
                      {fmtDateTimeBR(recipient.sentAt)}
                    </p>
                    <div className="flex justify-end">
                      <Link
                        href={`/contacts/${recipient.contact.id}`}
                        className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        title="Abrir lead"
                        aria-label={`Abrir lead ${recipient.contact.name}`}
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                  </DataRow>
                );
              })}
            </DataView>
          </MobileTableScroll>
        )}
      </div>

      {recipientPages > 1 ? (
        <PaginationGlass
          className="mt-4"
          total={recipientTotal}
          entityLabel="destinatários"
          page={page}
          lastPage={recipientPages}
          canPrev={page > 1}
          canNext={page < recipientPages}
          onPrev={() => onPageChange(Math.max(1, page - 1))}
          onNext={() => onPageChange(Math.min(recipientPages, page + 1))}
          perPage={RECIPIENT_PER_PAGE}
        />
      ) : null}
    </section>
  );
}
