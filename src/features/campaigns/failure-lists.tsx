"use client";

import type { ReactNode } from "react";
import { Copy, Download, ListFilter } from "lucide-react";

import {
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
} from "@/components/crm/sortable-header";
import {
  extractMetaErrorCode,
  metaErrorReasonPtBr,
} from "@/lib/meta-error-catalog";
import { cn } from "@/lib/utils";

import type { FailureErrorCode } from "./api";
import type { CampaignStats } from "./types";
import { nf } from "./viz";

type FailureReason = CampaignStats["failureReasons"][number];

function reasonKey(reason: FailureReason): FailureErrorCode {
  return reason.code ?? extractMetaErrorCode(reason.reason) ?? "other";
}

function failureTitle(reason: FailureReason): string {
  const code = reason.code ?? extractMetaErrorCode(reason.reason);
  const pt = metaErrorReasonPtBr(code);
  if (pt) {
    const first = pt.match(/^[^.]+(?:\.)?/)?.[0]?.trim();
    return first || pt;
  }
  return reason.reason;
}

function failureAction(reason: FailureReason): string | null {
  if (reason.action) return reason.action;
  const code = reason.code ?? extractMetaErrorCode(reason.reason);
  const pt = metaErrorReasonPtBr(code);
  if (!pt) return null;
  const rest = pt.replace(/^[^.]+(?:\.)?\s*/, "").trim();
  return rest || null;
}

const ELIGIBILITY_CODES = new Set([131047, 131049, 131026, 130472, 131050, 133010]);

function failureKind(reason: FailureReason): "eligibility" | "operational" {
  if (reason.kind) return reason.kind;
  const code = reason.code ?? extractMetaErrorCode(reason.reason);
  return code != null && ELIGIBILITY_CODES.has(code) ? "eligibility" : "operational";
}

export function CampaignFailureLists({
  reasons,
  activeCode,
  busyKey,
  onView,
  onDownload,
  onCopyPhones,
  onDownloadAll,
}: {
  reasons: FailureReason[];
  activeCode?: FailureErrorCode | null;
  busyKey?: string | null;
  onView: (code: FailureErrorCode) => void;
  onDownload: (code: FailureErrorCode) => void;
  onCopyPhones: (code: FailureErrorCode) => void;
  onDownloadAll: () => void;
}) {
  if (reasons.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Listas de falha</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Separadas por motivo da Meta. Baixe, copie os telefones ou veja na lista.
          </p>
        </div>
        <button
          type="button"
          onClick={onDownloadAll}
          disabled={busyKey === "all"}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Baixar todas
        </button>
      </div>

      <div className={LIST_CARD_STACK_CLASS}>
        {reasons.map((reason) => {
          const code = reasonKey(reason);
          const kind = failureKind(reason);
          const actionHint = failureAction(reason);
          const active = activeCode === code;
          const busy = busyKey === String(code);
          return (
            <div
              key={`${code}:${reason.reason}`}
              className={cn(LIST_CARD_ROW_CLASS, active && "border-primary/40")}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{failureTitle(reason)}</p>
                    {typeof code === "number" ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                        cód. {code}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        kind === "eligibility"
                          ? "bg-secondary text-muted-foreground"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {kind === "eligibility" ? "Bloqueio Meta" : "Operacional"}
                    </span>
                  </div>
                  {actionHint ? (
                    <p className="mt-1 text-sm text-muted-foreground">{actionHint}</p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-sm font-bold tabular-nums text-destructive">
                  {nf(reason.count)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ListAction
                  icon={<ListFilter className="size-3.5" />}
                  label={active ? "Vendo lista" : "Ver lista"}
                  active={active}
                  onClick={() => onView(code)}
                />
                <ListAction
                  icon={<Download className="size-3.5" />}
                  label="Baixar CSV"
                  disabled={busy}
                  onClick={() => onDownload(code)}
                />
                <ListAction
                  icon={<Copy className="size-3.5" />}
                  label="Copiar telefones"
                  disabled={busy}
                  onClick={() => onCopyPhones(code)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ListAction({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
