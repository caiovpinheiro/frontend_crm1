"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck as Check, IconPencil as Pencil, IconX as X } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { SidebarSection } from "@/components/pipeline/deal-detail/shared";
import { cn } from "@/lib/utils";
import { CustomFieldsGroupedView } from "@/components/crm/fields/custom-fields-grouped-view";
import { CustomFieldValueView, resolveStoredFieldFile } from "@/components/crm/fields/custom-field-row";
import { useFieldLayout, type FieldLayoutContext } from "@/hooks/use-field-layout";
import { resolveCustomFieldGroups } from "@/lib/field-layout";

type FieldWithValue = {
  fieldId: string;
  name: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  value: string | null;
};

async function fetchFieldValues(dealId: string): Promise<FieldWithValue[]> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}/custom-fields`));
  if (!res.ok) throw new Error("Erro ao carregar campos");
  return res.json();
}

async function saveFieldValues(dealId: string, values: { fieldId: string; value: string }[]) {
  const res = await fetch(apiUrl(`/api/deals/${dealId}/custom-fields`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error("Erro ao salvar campos");
  return res.json();
}

const compactDlToolbarBtn =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-foreground";

export function DealCustomFieldsSection({
  dealId,
  variant = "default",
  layoutContext,
}: {
  dealId: string;
  /** Linha de grupo `<dl>` com ações à direita (workspace sidebar compacto). */
  /** `kompact` — linhas flat estilo Kommo (sidebar workspace). */
  variant?: "default" | "compactDl" | "compactCards" | "kompact";
  /**
   * Contexto de layout usado para resolver grupos de campos personalizados
   * na aside (PRD Agrupamento de Campos). Só afeta o variant `default`;
   * quando não informado (ou sem grupos configurados), renderiza flat
   * como antes.
   */
  layoutContext?: FieldLayoutContext;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ["deal-custom-fields", dealId],
    queryFn: () => fetchFieldValues(dealId),
  });

  // Layout de grupos (PRD Agrupamento de Campos na Aside). Só afeta o
  // variant `default`; para os variants compactos permanecemos flat.
  // Hooks precisam ficar no topo, então lemos aqui — passamos um
  // contexto "fallback" quando prop não foi informada; nesse caso os
  // resultados são ignorados pelo branching abaixo.
  const effectiveLayoutContext: FieldLayoutContext = layoutContext ?? "deal_panel_v2";
  const { sections: layoutSections } = useFieldLayout(effectiveLayoutContext);
  const hasRealGroups = React.useMemo(() => {
    if (!layoutContext) return false;
    const groups = resolveCustomFieldGroups(
      layoutSections,
      fields.map((f) => ({
        id: f.fieldId,
        name: f.name,
        label: f.label,
        type: f.type,
        options: f.options,
        required: f.required,
      })),
      "deal",
    );
    return groups.some((g) => g.group !== null);
  }, [layoutContext, layoutSections, fields]);

  const saveMutation = useMutation({
    mutationFn: (values: { fieldId: string; value: string }[]) =>
      saveFieldValues(dealId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal-custom-fields", dealId] });
      setEditing(false);
    },
  });

  const startEdit = () => {
    const d: Record<string, string> = {};
    fields.forEach((f) => { d[f.fieldId] = f.value ?? ""; });
    setDraft(d);
    setEditing(true);
  };

  const onSave = () => {
    const values = Object.entries(draft).map(([fieldId, value]) => ({ fieldId, value }));
    saveMutation.mutate(values);
  };

  const fieldsTable = (
    <div className="rounded-lg border border-border bg-[var(--color-bg-subtle)]/80">
      {fields.map((f, i) => (
        <div
          key={f.fieldId}
          className={`flex items-center gap-3 px-3.5 py-2.5 ${i < fields.length - 1 ? "border-b border-border/80" : ""}`}
        >
          <Label className="w-[40%] shrink-0 text-xs font-medium text-[var(--text-muted)]">{f.label}</Label>
          {editing ? (
            <div className="min-w-0 flex-1">
              {f.type === "SELECT" && f.options.length > 0 ? (
                <SelectNative
                  value={draft[f.fieldId] ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, [f.fieldId]: e.target.value }))}
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
                  onChange={(e) => setDraft((p) => ({ ...p, [f.fieldId]: e.target.value }))}
                  className="h-8 w-full rounded-lg border-border bg-white text-sm"
                >
                  <option value="">—</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </SelectNative>
              ) : f.type === "DATE" ? (
                <DatePicker
                  value={draft[f.fieldId] ?? ""}
                  onChange={(value) => setDraft((p) => ({ ...p, [f.fieldId]: value }))}
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
                  onChange={(e) => setDraft((p) => ({ ...p, [f.fieldId]: e.target.value }))}
                  className="h-8 w-full rounded-lg border-border bg-white text-sm"
                />
              )}
            </div>
          ) : resolveStoredFieldFile(f.value) ? (
            <div className="min-w-0 flex-1">
              <CustomFieldValueView value={f.value} />
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
              {f.value || <span className="font-normal text-[var(--color-ink-muted)]">—</span>}
            </span>
          )}
        </div>
      ))}
    </div>
  );

  if (variant === "compactCards") {
    if (isLoading) {
      return (
        <div className="rounded-lg border border-border bg-white px-3 py-2.5">
          <span className="text-[11px] text-[var(--color-ink-muted)]">Carregando campos…</span>
        </div>
      );
    }
    if (fields.length === 0) return null;

    const compactAction = !editing ? (
      <button type="button" className={compactDlToolbarBtn} onClick={startEdit} aria-label="Editar campos do negócio">
        <Pencil className="size-3" strokeWidth={2.2} />
      </button>
    ) : (
      <div className="flex shrink-0 gap-0.5">
        <button type="button" className={compactDlToolbarBtn} onClick={() => setEditing(false)} aria-label="Cancelar edição">
          <X className="size-3" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className={cn(compactDlToolbarBtn, "text-[var(--color-success-text)] hover:text-[var(--color-success-text)]")}
          onClick={onSave}
          disabled={saveMutation.isPending}
          aria-label="Salvar campos"
        >
          <Check className="size-3" strokeWidth={2.2} />
        </button>
      </div>
    );

    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-white px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-[var(--color-ink-soft)]">Campos do negócio</span>
          {compactAction}
        </div>
        {editing ? (
          fieldsTable
        ) : (
          fields.map((f) => (
            <div key={f.fieldId} className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-[11px] text-[var(--color-ink-muted)]">{f.label}</span>
              {resolveStoredFieldFile(f.value) ? (
                <CustomFieldValueView value={f.value} align="right" />
              ) : (
                <span className="truncate text-right text-[12px] text-foreground">
                  {f.value || <span className="text-[var(--color-ink-muted)]">—</span>}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  if (variant === "kompact") {
    if (isLoading) {
      return (
        <div className="border-b border-border px-4 py-2.5 text-[12px] text-[var(--color-ink-muted)]">
          Carregando campos…
        </div>
      );
    }
    if (fields.length === 0) return null;

    const kommoRow =
      "flex items-center justify-between border-b border-border px-4 py-2.5 transition-colors hover:bg-[var(--color-bg-subtle)]";
    const kompactToolbar = !editing ? (
      <button type="button" className={compactDlToolbarBtn} onClick={startEdit} aria-label="Editar campos do negócio">
        <Pencil className="size-3" strokeWidth={2.2} />
      </button>
    ) : (
      <div className="flex shrink-0 gap-0.5">
        <button type="button" className={compactDlToolbarBtn} onClick={() => setEditing(false)} aria-label="Cancelar edição">
          <X className="size-3" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className={cn(compactDlToolbarBtn, "text-[var(--color-success-text)] hover:text-[var(--color-success-text)]")}
          onClick={onSave}
          disabled={saveMutation.isPending}
          aria-label="Salvar campos"
        >
          <Check className="size-3" strokeWidth={2.2} />
        </button>
      </div>
    );

    return (
      <>
        <div className={kommoRow}>
          <span className="text-[12px] text-[var(--color-ink-muted)]">Campos do negócio</span>
          {kompactToolbar}
        </div>
        {editing ? (
          <div className="border-b border-border px-4 py-2">{fieldsTable}</div>
        ) : (
          fields.map((f) => (
            <div key={f.fieldId} className={kommoRow}>
              <span className="text-[12px] text-[var(--color-ink-muted)]">{f.label}</span>
              {resolveStoredFieldFile(f.value) ? (
                <CustomFieldValueView value={f.value} align="right" />
              ) : (
                <span className="max-w-[65%] truncate text-right text-[12px] font-medium text-[var(--color-ink-soft)]">
                  {f.value || <span className="font-normal text-[var(--color-ink-muted)]">—</span>}
                </span>
              )}
            </div>
          ))
        )}
      </>
    );
  }

  if (variant === "compactDl") {
    if (isLoading) {
      return (
        <>
          <dt className="col-span-2 flex items-center justify-between bg-[var(--color-bg-subtle)] px-3 py-1.5 text-[12px] text-[var(--color-ink-soft)]">
            <span>Campos do negócio</span>
          </dt>
          <dd className="col-span-2 px-2.5 py-1.5 text-[12px] text-[var(--color-ink-muted)]">
            Carregando campos…
          </dd>
        </>
      );
    }
    if (fields.length === 0) return null;

    const compactActionDl = !editing ? (
      <button type="button" className={compactDlToolbarBtn} onClick={startEdit} aria-label="Editar campos do negócio">
        <Pencil className="size-3" strokeWidth={2.2} />
      </button>
    ) : (
      <div className="flex shrink-0 gap-0.5">
        <button type="button" className={compactDlToolbarBtn} onClick={() => setEditing(false)} aria-label="Cancelar edição">
          <X className="size-3" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className={cn(compactDlToolbarBtn, "text-[var(--color-success-text)] hover:text-[var(--color-success-text)]")}
          onClick={onSave}
          disabled={saveMutation.isPending}
          aria-label="Salvar campos"
        >
          <Check className="size-3" strokeWidth={2.2} />
        </button>
      </div>
    );

    return (
      <>
        <dt className="col-span-2 flex items-center justify-between bg-[var(--color-bg-subtle)] px-3 py-1.5 text-[12px] text-[var(--color-ink-soft)]">
          <span>Campos do negócio</span>
          {compactActionDl}
        </dt>
        <dd className="col-span-2 px-2.5 py-1.5">{fieldsTable}</dd>
      </>
    );
  }

  if (isLoading) return <div className="py-3 text-xs text-muted-foreground">Carregando campos…</div>;
  if (fields.length === 0) return null;

  if (layoutContext && hasRealGroups) {
    return (
      <CustomFieldsGroupedView
        fields={fields}
        entity="deal"
        layoutContext={layoutContext}
        editing={editing}
        draft={draft}
        onDraftChange={(fieldId, value) =>
          setDraft((p) => ({ ...p, [fieldId]: value }))
        }
        onStartEdit={startEdit}
        onCancelEdit={() => setEditing(false)}
        onSave={onSave}
        savePending={saveMutation.isPending}
      />
    );
  }

  return (
    <SidebarSection
      title="Campos do negócio"
      action={
        !editing ? (
          <Button type="button" variant="ghost" size="icon" className="size-7 rounded-xl" onClick={startEdit}>
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon" className="size-7 rounded-xl" onClick={() => setEditing(false)}>
              <X className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-xl text-[var(--color-success-text)]"
              onClick={onSave}
              disabled={saveMutation.isPending}
            >
              <Check className="size-3.5" />
            </Button>
          </div>
        )
      }
    >
      {fieldsTable}
    </SidebarSection>
  );
}
