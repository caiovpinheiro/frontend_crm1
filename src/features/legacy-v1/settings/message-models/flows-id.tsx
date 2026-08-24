"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft as ArrowLeft, IconLoader2 as Loader2, IconPlus as Plus, IconRefresh as RefreshCw, IconDeviceFloppy as Save, IconSend as Send, IconTrash as Trash2, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import { InputGlass } from "@/components/crm/input-glass";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { Label } from "@/components/ui/label";
import { DropdownGlass, type DropdownOption } from "@/components/crm/dropdown-glass";
import { Skeleton } from "@/components/ui/skeleton";
import type { FlowDefinitionUpsertInput } from "@/services/whatsapp-flow-definitions";
import { cn } from "@/lib/utils";

type FlowMapping = {
  targetKind: string;
  nativeKey: string | null;
  customFieldId: string | null;
} | null;

type FlowFieldRow = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  options: string[];
  required: boolean;
  sortOrder: number;
  mapping: FlowMapping;
};

type FlowScreenRow = {
  id: string;
  title: string;
  sortOrder: number;
  fields: FlowFieldRow[];
};

type FlowDefDetail = {
  id: string;
  name: string;
  status: string;
  flowCategory: string;
  metaFlowId: string | null;
  screens: FlowScreenRow[];
};

type CustomFieldOpt = { id: string; label: string; name: string; type?: string };

const FIELD_TYPE_OPTIONS = [
  { value: "TEXT", label: "Texto curto" },
  { value: "TEXTAREA", label: "Resposta longa" },
  { value: "EMAIL", label: "E-mail" },
  { value: "PHONE", label: "Telefone" },
  { value: "DROPDOWN", label: "Lista (seleção única)" },
  { value: "RADIO", label: "Seleção única (botões)" },
  { value: "MULTI_SELECT", label: "Seleção múltipla" },
  { value: "DATE", label: "Data" },
] as const;

const FLOW_CATEGORY_OPTIONS = [
  "LEAD_GENERATION",
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
] as const;

const FIELD_TYPES_WITH_OPTIONS = new Set(["DROPDOWN", "RADIO", "MULTI_SELECT", "SELECT"]);

type MappingNativeOpt = { key: string; label: string };

const DEFAULT_DEAL_NATIVE_FIELDS: MappingNativeOpt[] = [
  { key: "title", label: "Título do negócio" },
  { key: "value", label: "Valor do negócio" },
  { key: "expectedClose", label: "Previsão de fechamento" },
];

function fieldTypeNeedsOptions(fieldType: string): boolean {
  return FIELD_TYPES_WITH_OPTIONS.has(fieldType.toUpperCase());
}

function FlowFieldOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");

  function addOption() {
    const value = draft.trim();
    if (!value || options.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...options, value]);
    setDraft("");
  }

  function removeOption(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <Label className="text-xs text-[var(--text-secondary)]">Alternativas</Label>
      <p className="-mt-0.5 font-body text-[11.5px] text-[var(--text-muted)]">
        Opções exibidas na lista de seleção
      </p>

      {options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt, i) => (
            <span
              key={`${opt}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] pl-3 pr-1.5 py-1 font-body text-[12.5px] text-[var(--text-primary)]"
            >
              {opt}
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                title={`Remover "${opt}"`}
              >
                <IconX size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="font-body text-[12px] text-[var(--text-muted)]/80">
          Adicione pelo menos uma alternativa
        </p>
      )}

      <div className="flex gap-2">
        <InputGlass
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOption();
            }
          }}
          placeholder="Nova alternativa"
          className="flex-1"
        />
        <ButtonGlass type="button" variant="glass" size="sm" onClick={addOption}>
          Adicionar
        </ButtonGlass>
      </div>
    </div>
  );
}

/** Link "voltar" em pill glass — reusado nos três estados do editor. */
function BackToFlows() {
  return (
    <Link
      href="/settings/message-models?tab=flows"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--input-border-focus)] hover:text-[var(--brand-primary)]"
    >
      <ArrowLeft className="size-4" /> Modelos de mensagem
    </Link>
  );
}

function DealMappingSelect({
  value,
  onChange,
  nativeFields,
  customFields,
  customFieldsHint,
}: {
  value: string;
  onChange: (value: string) => void;
  nativeFields: MappingNativeOpt[];
  customFields: CustomFieldOpt[];
  customFieldsHint?: React.ReactNode;
}) {
  const options = React.useMemo<DropdownOption[]>(() => {
    const out: DropdownOption[] = [{ value: "", label: "— Não mapear —" }];
    for (const o of nativeFields) {
      out.push({ value: `d:${o.key}`, label: o.label, description: "Campo padrão do negócio" });
    }
    for (const cf of customFields) {
      out.push({ value: `cf:${cf.id}`, label: cf.label, description: "Campo personalizado" });
    }
    return out;
  }, [nativeFields, customFields]);

  return (
    <>
      <DropdownGlass
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder="— Não mapear —"
        triggerClassName="w-full"
      />
      {customFieldsHint}
    </>
  );
}

function toUpsertInput(d: FlowDefDetail): FlowDefinitionUpsertInput {
  return {
    name: d.name,
    flowCategory: d.flowCategory,
    screens: d.screens.map((s, si) => ({
      title: s.title,
      sortOrder: si,
      fields: s.fields.map((f, fi) => ({
        fieldKey: f.fieldKey,
        label: f.label,
        fieldType: f.fieldType,
        options: f.options ?? [],
        required: f.required,
        sortOrder: fi,
        mapping: f.mapping
          ? {
              targetKind: f.mapping.targetKind as
                | "CONTACT_NATIVE"
                | "DEAL_NATIVE"
                | "CUSTOM_FIELD",
              nativeKey: f.mapping.nativeKey,
              customFieldId: f.mapping.customFieldId,
            }
          : null,
      })),
    })),
  };
}

function newScreen(sortOrder: number): FlowScreenRow {
  return {
    id: `local-${Date.now()}-${sortOrder}`,
    title: `Tela ${sortOrder + 1}`,
    sortOrder,
    fields: [],
  };
}

function newField(screen: FlowScreenRow): FlowFieldRow {
  const n = screen.fields.length + 1;
  return {
    id: `local-f-${Date.now()}-${n}`,
    fieldKey: `campo_${n}`,
    label: `Campo ${n}`,
    fieldType: "TEXT",
    options: [],
    required: false,
    sortOrder: n - 1,
    mapping: null,
  };
}

function mappingSelectValue(f: FlowFieldRow): string {
  if (f.mapping?.targetKind === "CUSTOM_FIELD" && f.mapping.customFieldId) {
    return `cf:${f.mapping.customFieldId}`;
  }
  if (f.mapping?.targetKind === "DEAL_NATIVE" && f.mapping.nativeKey) {
    return `d:${f.mapping.nativeKey}`;
  }
  if (f.mapping?.targetKind === "CONTACT_NATIVE" && f.mapping.nativeKey) {
    return `n:${f.mapping.nativeKey}`;
  }
  return "";
}

export default function FlowDefinitionEditorPage({
  hideBackLink = false,
}: {
  hideBackLink?: boolean;
}) {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const queryClient = useQueryClient();

  const { data: mappingFields, isError: mappingFieldsError, isLoading: mappingFieldsLoading } =
    useQuery({
      queryKey: ["whatsapp-flow-deal-mapping-fields"],
      queryFn: async () => {
        const r = await fetch(apiUrl("/api/whatsapp-flow-definitions/lead-mapping-fields"));
        if (r.ok) {
          return r.json() as Promise<{
            nativeFields: MappingNativeOpt[];
            customFields: CustomFieldOpt[];
          }>;
        }
        const fallback = await fetch(apiUrl("/api/custom-fields?entity=deal"));
        if (fallback.ok) {
          const j: unknown = await fallback.json();
          const list = Array.isArray(j) ? (j as CustomFieldOpt[]) : [];
          return { nativeFields: DEFAULT_DEAL_NATIVE_FIELDS, customFields: list };
        }
        throw new Error("Não foi possível carregar os campos do negócio.");
      },
      staleTime: 0,
    });
  const nativeFields = mappingFields?.nativeFields ?? DEFAULT_DEAL_NATIVE_FIELDS;
  const customFields = mappingFields?.customFields ?? [];
  const customFieldsHint =
    mappingFieldsLoading ? (
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">Carregando campos do negócio…</p>
    ) : customFields.length === 0 ? (
      <p className="mt-1 rounded-[var(--radius-md)] border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-2 py-1.5 text-[10px] leading-snug text-[var(--text-secondary)]">
        Nenhum campo personalizado de <strong className="font-bold">negócio</strong> nesta organização — só aparecem
        Título, Valor e Previsão de fechamento.{" "}
        <Link href="/settings/custom-fields?entity=deal" className="font-bold text-[var(--brand-primary)] underline">
          Criar campos do negócio
        </Link>
        {mappingFieldsError ? " (falha ao carregar a lista)" : null}
      </p>
    ) : null;

  const { data: loaded, isLoading } = useQuery({
    queryKey: ["whatsapp-flow-definition", id],
    queryFn: async () => {
      const r = await fetch(apiUrl(`/api/whatsapp-flow-definitions/${encodeURIComponent(id)}`));
      if (!r.ok) throw new Error("Flow não encontrado.");
      return r.json() as Promise<FlowDefDetail>;
    },
    enabled: Boolean(id),
  });

  const [draft, setDraft] = React.useState<FlowDefDetail | null>(null);
  const [selectedScreenIdx, setSelectedScreenIdx] = React.useState(0);

  React.useEffect(() => {
    if (!loaded) return;
    queueMicrotask(() => {
      setDraft({
        ...loaded,
        screens: loaded.screens.map((s) => ({
          ...s,
          fields: s.fields.map((f) => ({
            ...f,
            options: Array.isArray(f.options) ? f.options : [],
          })),
        })),
      });
      setSelectedScreenIdx(0);
    });
  }, [loaded]);

  const saveMutation = useMutation({
    mutationFn: async (input: FlowDefinitionUpsertInput) => {
      const r = await fetch(apiUrl(`/api/whatsapp-flow-definitions/${encodeURIComponent(id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j?.message === "string" ? j.message : "Erro ao guardar.");
      return j as FlowDefDetail;
    },
    onSuccess: (row) => {
      setDraft(row);
      queryClient.setQueryData(["whatsapp-flow-definition", id], row);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-flow-definitions"] });
      toast.success(
        row.status === "PUBLISHED" ? "Mapeamento guardado." : "Rascunho guardado.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(apiUrl(`/api/whatsapp-flow-definitions/${encodeURIComponent(id)}/publish`), {
        method: "POST",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const ve = Array.isArray(j.validationErrors) ? j.validationErrors : [];
        const extra = ve.length ? ` (${JSON.stringify(ve).slice(0, 400)})` : "";
        throw new Error((typeof j?.message === "string" ? j.message : "Erro ao publicar.") + extra);
      }
      return j as { metaFlowId: string };
    },
    onSuccess: (out) => {
      toast.success(`Publicado. flow_id: ${out.metaFlowId}`);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-flow-definition", id] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-flow-definitions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncFromMetaMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(
        apiUrl(`/api/whatsapp-flow-definitions/${encodeURIComponent(id)}/sync-from-meta`),
        { method: "POST" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j?.message === "string" ? j.message : "Erro ao sincronizar.");
      return j as FlowDefDetail;
    },
    onSuccess: (row) => {
      setDraft(row);
      queryClient.setQueryData(["whatsapp-flow-definition", id], row);
      toast.success("Perguntas atualizadas a partir da Meta.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDraft = React.useCallback((updater: (d: FlowDefDetail) => FlowDefDetail) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const base = JSON.parse(JSON.stringify(prev)) as FlowDefDetail;
      return updater(base);
    });
  }, []);

  const setFieldMapping = React.useCallback(
    (fieldId: string, screenIdx: number, value: string) => {
      updateDraft((d) => {
        const screens = d.screens.map((s, i) => {
          if (i !== screenIdx) return s;
          const fields = s.fields.map((x) => {
            if (x.id !== fieldId) return x;
            if (!value) return { ...x, mapping: null };
            if (value.startsWith("cf:")) {
              return {
                ...x,
                mapping: {
                  targetKind: "CUSTOM_FIELD",
                  nativeKey: null,
                  customFieldId: value.slice(3),
                },
              };
            }
            if (value.startsWith("d:")) {
              return {
                ...x,
                mapping: {
                  targetKind: "DEAL_NATIVE",
                  nativeKey: value.slice(2),
                  customFieldId: null,
                },
              };
            }
            if (value.startsWith("n:")) {
              return {
                ...x,
                mapping: {
                  targetKind: "CONTACT_NATIVE",
                  nativeKey: value.slice(2),
                  customFieldId: null,
                },
              };
            }
            return x;
          });
          return { ...s, fields };
        });
        return { ...d, screens };
      });
    },
    [updateDraft],
  );

  const activeScreen =
    draft && draft.screens.length > 0
      ? draft.screens[selectedScreenIdx] ?? draft.screens[0]
      : null;

  if (!id) {
    return <p className="text-sm text-[var(--text-muted)]">ID inválido.</p>;
  }

  if (isLoading || !draft) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-8 w-48 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-64 w-full rounded-[var(--radius-xl)]" />
      </div>
    );
  }

  const isImportedFromMeta = Boolean(draft.metaFlowId?.trim());

  if (isImportedFromMeta) {
    return (
      <div className="w-full space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow)] backdrop-blur-md">
          {!hideBackLink ? <BackToFlows /> : null}
          <div className="flex flex-wrap gap-2">
            <ButtonGlass
              type="button"
              size="sm"
              variant="glass"
              disabled={syncFromMetaMutation.isPending || saveMutation.isPending}
              onClick={() => syncFromMetaMutation.mutate()}
            >
              {syncFromMetaMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="ml-2">Atualizar perguntas da Meta</span>
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              size="sm"
              disabled={saveMutation.isPending || syncFromMetaMutation.isPending}
              onClick={() => saveMutation.mutate(toUpsertInput(draft))}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              <span className="ml-2">Guardar mapeamento</span>
            </ButtonGlass>
          </div>
        </header>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-4 py-3 text-sm" role="note">
          <p className="font-bold text-[var(--text-primary)]">{draft.name}</p>
          <p className="mt-1 text-[var(--text-secondary)]">
            Flow vinculado à Meta (
            <code className="font-mono text-xs text-[var(--text-primary)]">{draft.metaFlowId}</code>). Abaixo estão as{" "}
            <strong className="font-bold">perguntas do formulário</strong> — escolha em qual campo do lead cada resposta será gravada.
            Se faltar pergunta, use <strong className="font-bold">Atualizar perguntas da Meta</strong>.
          </p>
        </div>

        <div className="space-y-4">
          {draft.screens.map((screen, si) => (
            <GlassCard
              key={screen.id}
              variant="panel"
              className="p-4"
            >
              <p className="mb-3 text-sm font-bold text-[var(--text-primary)]">{screen.title || `Tela ${si + 1}`}</p>
              {screen.fields.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Nenhum campo nesta tela.</p>
              ) : (
                <div className="space-y-3">
                  {screen.fields.map((f) => (
                    <div
                      key={f.id}
                      className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-3 sm:grid-cols-[1fr_1fr]"
                    >
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Pergunta no WhatsApp
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">{f.label}</p>
                        {f.required ? (
                          <p className="mt-0.5 text-[10px] font-semibold text-[var(--color-warn)]">Obrigatória no formulário</p>
                        ) : null}
                      </div>
                      <div>
                        <Label className="text-xs text-[var(--text-secondary)]">Gravar no campo do negócio</Label>
                        <div className="mt-1">
                          <DealMappingSelect
                            value={mappingSelectValue(f)}
                            onChange={(v) => setFieldMapping(f.id, si, v)}
                            nativeFields={nativeFields}
                            customFields={customFields}
                            customFieldsHint={customFieldsHint}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      </div>
    );
  }

  if (draft.status !== "DRAFT") {
    return (
      <div className="w-full space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow)] backdrop-blur-md">
          {!hideBackLink ? <BackToFlows /> : null}
        </header>
        <p className="text-sm text-[var(--text-muted)]">
          Este flow está <strong className="font-bold text-[var(--text-secondary)]">{draft.status}</strong> e não pode ser editado.
        </p>
      </div>
    );
  }

  const canPublish = draft.screens.some((s) => s.fields.length > 0);

  return (
    <div className="w-full space-y-6">
      {/* Top bar glass: voltar + Guardar rascunho + Publicar na Meta */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow)] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          {!hideBackLink ? <BackToFlows /> : null}
          <span className="hidden truncate text-[13px] font-bold text-[var(--text-primary)] sm:block">
            {draft.name || "Editor de Flow"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonGlass
            type="button"
            variant="glass"
            size="sm"
            disabled={saveMutation.isPending || publishMutation.isPending}
            onClick={() => saveMutation.mutate(toUpsertInput(draft))}
          >
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span className="ml-2">Guardar rascunho</span>
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            size="sm"
            disabled={publishMutation.isPending || saveMutation.isPending || !canPublish}
            onClick={async () => {
              try {
                await saveMutation.mutateAsync(toUpsertInput(draft));
                await publishMutation.mutateAsync();
              } catch {
                /* toasts handled by mutations */
              }
            }}
          >
            {publishMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="ml-2">Publicar na Meta</span>
          </ButtonGlass>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* Coluna 1 — TELAS */}
        <nav
          aria-label="Telas do flow"
          className="space-y-2 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] p-3 shadow-[var(--glass-shadow)] backdrop-blur-md"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Telas</p>
            <button
              type="button"
              aria-label="Adicionar tela"
              className="flex size-7 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)] transition-colors hover:border-[var(--input-border-focus)] hover:bg-[var(--color-enterprise-bg)]"
              onClick={() => {
                setDraft((prev) => {
                  if (!prev) return prev;
                  const next = newScreen(prev.screens.length);
                  const screens = [...prev.screens, next];
                  setSelectedScreenIdx(screens.length - 1);
                  return { ...prev, screens };
                });
              }}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <ul className="space-y-1">
            {draft.screens.map((s, idx) => (
              <li key={s.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm transition-colors",
                    idx === selectedScreenIdx
                      ? "bg-[var(--color-enterprise-bg)] font-bold text-[var(--brand-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]",
                  )}
                  onClick={() => setSelectedScreenIdx(idx)}
                >
                  <span className="truncate">{s.title || `Tela ${idx + 1}`}</span>
                </button>
                {draft.screens.length > 1 ? (
                  <button
                    type="button"
                    className="flex shrink-0 items-center justify-center rounded-[var(--radius-md)] px-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                    aria-label="Remover tela"
                    onClick={() => {
                      const prevLen = draft.screens.length;
                      setDraft((prev) => {
                        if (!prev) return prev;
                        const screens = prev.screens.filter((_, i) => i !== idx);
                        return { ...prev, screens: screens.length ? screens : [newScreen(0)] };
                      });
                      setSelectedScreenIdx((cur) => {
                        const newLen = Math.max(1, prevLen - 1);
                        let next = cur;
                        if (idx < cur) next = cur - 1;
                        else if (idx === cur) next = Math.min(cur, newLen - 1);
                        return Math.max(0, Math.min(next, newLen - 1));
                      });
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        {/* Coluna 2 — Formulário + CAMPOS */}
        <GlassCard variant="panel" className="space-y-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="flow-name" className="text-[var(--text-secondary)]">Título do flow</Label>
            <InputGlass
              id="flow-name"
              value={draft.name}
              onChange={(e) => updateDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-[var(--text-secondary)]">Categoria Meta</Label>
            <DropdownGlass
              options={FLOW_CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
              value={draft.flowCategory || "LEAD_GENERATION"}
              onValueChange={(v) => updateDraft((d) => ({ ...d, flowCategory: v }))}
              triggerClassName="w-full font-mono"
            />
          </div>
          {activeScreen ? (
            <>
              <div className="grid gap-2">
                <Label className="text-[var(--text-secondary)]">Título da tela (CRM)</Label>
                <InputGlass
                  value={activeScreen.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateDraft((d) => {
                      const screens = d.screens.map((s, i) =>
                        i === selectedScreenIdx ? { ...s, title: v } : s,
                      );
                      return { ...d, screens };
                    });
                  }}
                />
              </div>
              <div className="flex items-center justify-between border-t border-[var(--glass-border-subtle)] pt-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Campos</p>
                <ButtonGlass
                  type="button"
                  variant="glass"
                  size="sm"
                  onClick={() => {
                    updateDraft((d) => {
                      const screens = d.screens.map((s, i) => {
                        if (i !== selectedScreenIdx) return s;
                        return { ...s, fields: [...s.fields, newField(s)] };
                      });
                      return { ...d, screens };
                    });
                  }}
                >
                  <Plus className="size-3.5" /> Campo
                </ButtonGlass>
              </div>
              <div className="space-y-3">
                {activeScreen.fields.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">Adicione pelo menos um campo antes de publicar.</p>
                ) : (
                  activeScreen.fields.map((f, fi) => (
                    <div
                      key={f.id}
                      className="rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--text-muted)]">Campo {fi + 1}</span>
                        <button
                          type="button"
                          aria-label={`Remover campo ${fi + 1}`}
                          className="flex size-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-bg)]"
                          onClick={() => {
                            updateDraft((d) => {
                              const screens = d.screens.map((s, i) => {
                                if (i !== selectedScreenIdx) return s;
                                return { ...s, fields: s.fields.filter((x) => x.id !== f.id) };
                              });
                              return { ...d, screens };
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label className="text-xs text-[var(--text-secondary)]">Chave (slug)</Label>
                          <InputGlass
                            value={f.fieldKey}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^a-zA-Z0-9_]/g, "_");
                              updateDraft((d) => {
                                const screens = d.screens.map((s, i) => {
                                  if (i !== selectedScreenIdx) return s;
                                  const fields = s.fields.map((x) => (x.id === f.id ? { ...x, fieldKey: v } : x));
                                  return { ...s, fields };
                                });
                                return { ...d, screens };
                              });
                            }}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs text-[var(--text-secondary)]">Rótulo</Label>
                          <InputGlass
                            value={f.label}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateDraft((d) => {
                                const screens = d.screens.map((s, i) => {
                                  if (i !== selectedScreenIdx) return s;
                                  const fields = s.fields.map((x) => (x.id === f.id ? { ...x, label: v } : x));
                                  return { ...s, fields };
                                });
                                return { ...d, screens };
                              });
                            }}
                            className="text-sm"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs text-[var(--text-secondary)]">Tipo</Label>
                          <DropdownGlass
                            options={FIELD_TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
                            value={f.fieldType}
                            onValueChange={(v) => {
                              updateDraft((d) => {
                                const screens = d.screens.map((s, i) => {
                                  if (i !== selectedScreenIdx) return s;
                                  const fields = s.fields.map((x) => {
                                    if (x.id !== f.id) return x;
                                    const next = { ...x, fieldType: v };
                                    if (!fieldTypeNeedsOptions(v)) next.options = [];
                                    return next;
                                  });
                                  return { ...s, fields };
                                });
                                return { ...d, screens };
                              });
                            }}
                            triggerClassName="w-full"
                          />
                        </div>
                        <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-[var(--text-secondary)] cursor-pointer">
                          <CheckboxGlass
                            checked={f.required}
                            onChange={(checked) => {
                              updateDraft((d) => {
                                const screens = d.screens.map((s, i) => {
                                  if (i !== selectedScreenIdx) return s;
                                  const fields = s.fields.map((x) =>
                                    x.id === f.id ? { ...x, required: checked } : x,
                                  );
                                  return { ...s, fields };
                                });
                                return { ...d, screens };
                              });
                            }}
                            aria-label="Obrigatório"
                          />
                          Obrigatório
                        </label>
                        {fieldTypeNeedsOptions(f.fieldType) ? (
                          <FlowFieldOptionsEditor
                            options={f.options ?? []}
                            onChange={(options) => {
                              updateDraft((d) => {
                                const screens = d.screens.map((s, i) => {
                                  if (i !== selectedScreenIdx) return s;
                                  const fields = s.fields.map((x) =>
                                    x.id === f.id ? { ...x, options } : x,
                                  );
                                  return { ...s, fields };
                                });
                                return { ...d, screens };
                              });
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </GlassCard>

        {/* Coluna 3 — Pré-visualização do telefone + Mapeamento CRM */}
        <GlassCard variant="panel" className="space-y-3 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Pré-visualização</p>

          {/* Mock WhatsApp — cores ISOLADAS em --wa-* (não tokens globais) */}
          <div
            className="mx-auto w-full max-w-[260px] overflow-hidden rounded-3xl border-[6px] shadow-[var(--glass-shadow-lg)]"
            style={{ borderColor: "var(--wa-frame)", background: "var(--wa-bg)" }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ background: "var(--wa-header)" }}
            >
              <span className="text-[11px] font-bold text-white">WhatsApp</span>
            </div>
            <div className="max-h-[320px] space-y-2 overflow-y-auto p-3 text-xs">
              {draft.screens.map((s, si) => (
                <div key={s.id} className={cn("space-y-1.5", si !== selectedScreenIdx && "opacity-40")}>
                  {s.title ? (
                    <p className="font-bold" style={{ color: "var(--wa-text)" }}>{s.title}</p>
                  ) : null}
                  {s.fields.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-[var(--radius-input)] px-2 py-1.5"
                      style={{ background: "var(--wa-bubble)", border: "1px solid var(--wa-field-border)" }}
                    >
                      <span className="text-[10px]" style={{ color: "var(--wa-text-muted)" }}>{f.label}</span>
                      <div
                        className="mt-0.5 h-6 rounded-md"
                        style={{ background: "var(--wa-field-bg)", border: "1px solid var(--wa-field-border)" }}
                      />
                    </div>
                  ))}
                </div>
              ))}
              <div className="pt-2">
                <div
                  className="rounded-full py-1.5 text-center text-[11px] font-bold text-white"
                  style={{ background: "var(--wa-accent-strong)" }}
                >
                  Concluir
                </div>
              </div>
            </div>
          </div>

          {draft.screens.some((s) => s.fields.length > 0) ? (
            <div className="space-y-2 border-t border-[var(--glass-border-subtle)] pt-3">
              <p className="text-xs font-bold text-[var(--text-secondary)]">Mapeamento (CRM)</p>
              <div className="rounded-[var(--radius-md)] border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-2.5 py-2 text-[10px] leading-snug text-[var(--text-secondary)]" role="note">
                Cada resposta do Flow no WhatsApp é gravada no negócio aberto do contato (campo mapeado abaixo).
              </div>
              {customFieldsHint}
              {draft.screens.flatMap((screen, si) =>
                screen.fields.map((f) => ({ f, si, screenTitle: screen.title })),
              ).map(({ f, si, screenTitle }) => (
                <div
                  key={`map-${f.id}`}
                  className="rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] p-2"
                >
                  <p className="mb-0.5 truncate text-[11px] font-bold text-[var(--text-primary)]">{f.label}</p>
                  {screenTitle ? (
                    <p className="mb-1 text-[10px] text-[var(--text-muted)]">{screenTitle}</p>
                  ) : null}
                  <DealMappingSelect
                    value={mappingSelectValue(f)}
                    onChange={(v) => setFieldMapping(f.id, si, v)}
                    nativeFields={nativeFields}
                    customFields={customFields}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
}
