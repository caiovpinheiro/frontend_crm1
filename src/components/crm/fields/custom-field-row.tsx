"use client";

/**
 * Linha de campo personalizado da aside — extraída para reuso pelas duas
 * seções (`DealCustomFieldsSection` e `CustomFieldsSection`) e pelo view
 * agrupado (`CustomFieldsGroupedView`). Mantém 1:1 o markup do "default
 * variant" original das seções: label à esquerda (40%), valor/input à
 * direita. Sem estilos novos.
 */

import * as React from "react";

import { DelayedHoverLegend } from "@/components/crm/delayed-hover-legend";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";

export type FieldWithValue = {
  fieldId: string;
  name: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  value: string | null;
};

export function CustomFieldRow({
  field: f,
  editing,
  draft,
  onChange,
  isLast,
}: {
  field: FieldWithValue;
  editing: boolean;
  draft: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  isLast: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-2.5 ${isLast ? "" : "border-b border-border/80"}`}
    >
      <Label className="w-[40%] shrink-0 text-xs font-medium text-[var(--text-muted)]">
        {f.label}
      </Label>
      {editing ? (
        <div className="min-w-0 flex-1">
          {f.type === "SELECT" && f.options.length > 0 ? (
            <SelectNative
              value={draft[f.fieldId] ?? ""}
              onChange={(e) => onChange(f.fieldId, e.target.value)}
              className="h-8 w-full rounded-lg border-border bg-white text-sm"
            >
              <option value="">—</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </SelectNative>
          ) : f.type === "BOOLEAN" ? (
            <SelectNative
              value={draft[f.fieldId] ?? ""}
              onChange={(e) => onChange(f.fieldId, e.target.value)}
              className="h-8 w-full rounded-lg border-border bg-white text-sm"
            >
              <option value="">—</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </SelectNative>
          ) : f.type === "DATE" ? (
            <DatePicker
              value={draft[f.fieldId] ?? ""}
              onChange={(value) => onChange(f.fieldId, value)}
            />
          ) : (
            <Input
              type={
                f.type === "NUMBER"
                  ? "number"
                  : f.type === "EMAIL"
                    ? "email"
                    : f.type === "URL"
                      ? "url"
                      : "text"
              }
              value={draft[f.fieldId] ?? ""}
              onChange={(e) => onChange(f.fieldId, e.target.value)}
              className="h-8 w-full rounded-lg border-border bg-white text-sm"
            />
          )}
        </div>
      ) : (
        f.value ? (
          <DelayedHoverLegend text={f.value} className="min-w-0 flex-1">
            <span
              data-legend-measure
              className="block min-w-0 truncate text-sm font-medium text-[var(--text-primary)]"
            >
              {f.value}
            </span>
          </DelayedHoverLegend>
        ) : (
          <span className="min-w-0 flex-1 text-sm font-normal text-[var(--color-ink-muted)]">
            —
          </span>
        )
      )}
    </div>
  );
}
