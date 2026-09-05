"use client";

/**
 * Seção colapsável "Informação rastreada" (estilo Kommo) — UTMs e click IDs
 * no card Contato do aside.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { InlineNativeEditor } from "@/components/crm/fields/inline-native-editor";

export type TrackedAttribution = {
  adUtmSource?: string | null;
  adUtmMedium?: string | null;
  adUtmCampaign?: string | null;
  adUtmContent?: string | null;
  adUtmTerm?: string | null;
  utmId?: string | null;
  utmReferrer?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  googleClientId?: string | null;
  ttadId?: string | null;
  ttadName?: string | null;
  /** Meta CTWA (somente leitura no painel — preenchidos pelo webhook). */
  adCtwaClid?: string | null;
  adSourceId?: string | null;
  adResolvedId?: string | null;
  adResolvedName?: string | null;
  adHeadline?: string | null;
  adResolvedAdsetName?: string | null;
  adResolvedCampaignName?: string | null;
};

/** Campos editáveis no estilo Kommo (13). */
export const TRACKED_EDITABLE_FIELDS: Array<{
  key: keyof TrackedAttribution;
  label: string;
}> = [
  { key: "ttadId", label: "ttad_id" },
  { key: "ttadName", label: "ttad_name" },
  { key: "utmId", label: "utm_id" },
  { key: "adUtmContent", label: "utm_content" },
  { key: "adUtmMedium", label: "utm_medium" },
  { key: "adUtmCampaign", label: "utm_campaign" },
  { key: "adUtmSource", label: "utm_source" },
  { key: "adUtmTerm", label: "utm_term" },
  { key: "utmReferrer", label: "utm_referrer" },
  { key: "referrer", label: "referrer" },
  { key: "googleClientId", label: "gclientid" },
  { key: "gclid", label: "gclid" },
  { key: "fbclid", label: "fbclid" },
];

const META_READONLY_FIELDS: Array<{
  key: keyof TrackedAttribution;
  label: string;
}> = [
  { key: "adCtwaClid", label: "ctwa_clid" },
  { key: "adResolvedCampaignName", label: "ad_campaign" },
  { key: "adResolvedAdsetName", label: "ad_adset" },
  { key: "adResolvedName", label: "ad_name" },
  { key: "adHeadline", label: "ad_headline" },
  { key: "adResolvedId", label: "ad_id" },
  { key: "adSourceId", label: "ad_source_id" },
];

function isFilled(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

type Props = {
  values: TrackedAttribution;
  contactId: string;
  editMode?: boolean;
  invalidateKeys?: unknown[][];
  compact?: boolean;
  onSaved?: (key: keyof TrackedAttribution, value: string) => void;
};

export function TrackedInfoSection({
  values,
  contactId,
  editMode = false,
  invalidateKeys,
  compact = false,
  onSaved,
}: Props) {
  const [open, setOpen] = React.useState(true);

  const editableFilled = TRACKED_EDITABLE_FIELDS.filter((f) =>
    isFilled(values[f.key]),
  ).length;
  const metaFilled = META_READONLY_FIELDS.filter((f) =>
    isFilled(values[f.key]),
  ).length;
  const total = TRACKED_EDITABLE_FIELDS.length;
  const anyMeta = META_READONLY_FIELDS.some((f) => isFilled(values[f.key]));

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <p className="font-display text-[12px] font-bold text-[var(--text-primary)]">
            Informação rastreada:
          </p>
          <p className="text-[11px] text-slate-400">
            Preenchida {editableFilled} de {total}
            {metaFilled > 0 ? ` · Meta ${metaFilled}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-[11px] font-medium text-slate-400 hover:text-[var(--brand-primary)]"
        >
          {open ? "ocultar" : "mostrar"}
        </button>
      </div>

      {open && (
        <div className="space-y-0">
          {TRACKED_EDITABLE_FIELDS.map((f, i) => (
            <div
              key={f.key}
              className={cn(
                "flex min-w-0 items-center justify-between gap-2 text-sm",
                compact ? "py-1" : "py-1.5",
                i > 0 && "border-t border-slate-50",
              )}
            >
              <span
                className={cn(
                  "shrink-0 font-medium text-slate-500",
                  compact ? "w-[42%] text-[10px]" : "w-[40%] text-[11px]",
                )}
              >
                {f.label}
              </span>
              <div className="min-w-0 flex-1">
                <InlineNativeEditor
                  value={values[f.key] ?? ""}
                  entityType="contact"
                  entityId={contactId}
                  fieldKey={f.key}
                  editMode={editMode}
                  invalidateKeys={invalidateKeys}
                  placeholder="..."
                  emptyClassName="text-right text-[12px] text-slate-300"
                  textClassName={cn(
                    "text-right font-display font-semibold text-[var(--text-primary)]",
                    compact ? "text-[11px]" : "text-[12px]",
                  )}
                  onSaved={(v) => onSaved?.(f.key, v)}
                />
              </div>
            </div>
          ))}

          {anyMeta && (
            <>
              <p className="mt-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Meta / CTWA
              </p>
              {META_READONLY_FIELDS.filter((f) => isFilled(values[f.key])).map(
                (f, i) => (
                  <div
                    key={f.key}
                    className={cn(
                      "flex min-w-0 items-center justify-between gap-2 text-sm",
                      compact ? "py-1" : "py-1.5",
                      i > 0 && "border-t border-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 font-medium text-slate-500",
                        compact ? "w-[42%] text-[10px]" : "w-[40%] text-[11px]",
                      )}
                    >
                      {f.label}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 break-all text-right font-display font-semibold text-[var(--text-primary)]",
                        compact ? "text-[11px]" : "text-[12px]",
                      )}
                      title={values[f.key] ?? undefined}
                    >
                      {values[f.key]}
                    </span>
                  </div>
                ),
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
