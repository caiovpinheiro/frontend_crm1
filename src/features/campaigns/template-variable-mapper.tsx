"use client";

/**
 * Bloco do passo 3 do disparador: só aparece quando o template escolhido
 * tem header IMAGE/VIDEO/DOCUMENT ou placeholders `{{1}}` no corpo/cabeçalho
 * TEXT. Cada slot mapeia para um custom field do negócio (ou campo nativo).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { formLabelClass } from "@/components/ui/form-dialog";
import { apiUrl } from "@/lib/api";
import {
  applyOperatorVariableDefaults,
  buildTemplateComponents,
  countMissingTemplateVariables,
  renderTemplateButtonUrl,
  setTemplateVariableValue,
  templateSlotId,
  templateVariableLabel,
  templateVariableSlots,
  templateVariableValue,
  templateVariablesFromConfig,
  type TemplateVariableInput,
} from "@/components/automations/template-variables";
import type { OperatorVariableMeta } from "@/lib/meta-whatsapp/operator-template-variables";
import type {
  CampaignTemplateComponentsPayload,
  TemplateRow,
} from "@/features/campaigns/types";

type CustomFieldRow = { name: string; label?: string | null };

type FieldOption = { value: string; label: string };

const HEADER_MEDIA = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);

function isHeaderMedia(format: string | null | undefined): boolean {
  return HEADER_MEDIA.has(String(format ?? "").toUpperCase());
}

async function fetchDealCustomFields(): Promise<CustomFieldRow[]> {
  const res = await fetch(apiUrl("/api/custom-fields?entity=deal"));
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function buildFieldOptions(fields: CustomFieldRow[]): FieldOption[] {
  const natives: FieldOption[] = [
    { value: "{{contact.name}}", label: "Nome do contato" },
    {
      value: "{{contact.name|first_name}}",
      label: "Primeiro nome do contato",
    },
    { value: "{{deal.title}}", label: "Título do negócio" },
  ];
  const cfs = fields.map((f) => ({
    value: `{{dealCustomFields.${f.name}}}`,
    label: `Negócio: ${f.label || f.name}`,
  }));
  return [...natives, ...cfs];
}

export function templateNeedsVariableMapping(tpl: TemplateRow | null | undefined): boolean {
  if (!tpl) return false;
  if (isHeaderMedia(tpl.headerFormat)) return true;
  const slots = templateVariableSlots(tpl.bodyPreview, tpl.headerPreview, tpl.buttons);
  return slots.length > 0;
}

export function CampaignTemplateVariableMapper({
  template,
  onChange,
}: {
  template: TemplateRow | null;
  onChange: (payload: CampaignTemplateComponentsPayload | null) => void;
}) {
  const needsMapping = templateNeedsVariableMapping(template);
  const varSlots = useMemo(
    () =>
      template
        ? templateVariableSlots(template.bodyPreview, template.headerPreview, template.buttons)
        : [],
    [template],
  );
  const needsHeaderMedia = isHeaderMedia(template?.headerFormat);

  const fieldsQuery = useQuery({
    queryKey: ["campaign-deal-custom-fields"],
    queryFn: fetchDealCustomFields,
    enabled: needsMapping,
    staleTime: 2 * 60_000,
  });

  const fieldOptions = useMemo(
    () => buildFieldOptions(fieldsQuery.data ?? []),
    [fieldsQuery.data],
  );

  const [vars, setVars] = useState<TemplateVariableInput[]>([]);
  const [headerMediaToken, setHeaderMediaToken] = useState("");
  // Padrão: a mídia que já está no template aprovado na Meta. Campo do
  // negócio só quando cada contato precisa de uma mídia diferente.
  const [headerMediaSource, setHeaderMediaSource] = useState<"template" | "field">("template");

  // Ao trocar de template: reconcilia slots e aplica defaults do operatorVariables.
  useEffect(() => {
    if (!template || !needsMapping) {
      setVars([]);
      setHeaderMediaToken("");
      onChange(null);
      return;
    }
    const next = applyOperatorVariableDefaults(
      templateVariablesFromConfig(varSlots, undefined),
      (template.operatorVariables as OperatorVariableMeta[] | null) ?? null,
    );
    setVars(next);
    setHeaderMediaToken("");
    setHeaderMediaSource("template");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.name, template?.language, needsMapping]);

  // Propaga payload para o create.
  useEffect(() => {
    if (!needsMapping || !template) {
      onChange(null);
      return;
    }
    const components = buildTemplateComponents(vars);
    const hf = String(template.headerFormat ?? "").toUpperCase();
    const headerMediaType =
      hf === "IMAGE" || hf === "VIDEO" || hf === "DOCUMENT"
        ? (hf.toLowerCase() as "image" | "video" | "document")
        : null;
    const payload: CampaignTemplateComponentsPayload = {
      version: 1,
      ...(components.length ? { components } : {}),
      ...(needsHeaderMedia && headerMediaSource === "template"
        ? { headerMediaSource: "template" as const, headerMediaType }
        : needsHeaderMedia && headerMediaToken.trim()
          ? {
              headerMediaSource: "field" as const,
              headerMediaUrl: headerMediaToken.trim(),
              headerMediaType,
            }
          : {}),
    };
    onChange(payload);
  }, [
    vars,
    headerMediaToken,
    headerMediaSource,
    needsMapping,
    needsHeaderMedia,
    template,
    onChange,
  ]);

  if (!template || !needsMapping) return null;

  const missingText = countMissingTemplateVariables(vars);
  const missingHeader =
    needsHeaderMedia && headerMediaSource === "field" && !headerMediaToken.trim();
  const mediaLabel =
    String(template.headerFormat ?? "").toUpperCase() === "VIDEO"
      ? "vídeo"
      : String(template.headerFormat ?? "").toUpperCase() === "DOCUMENT"
        ? "documento"
        : "imagem";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <span className={formLabelClass}>Variáveis do template</span>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Este template tem{" "}
          {needsHeaderMedia ? `cabeçalho de ${mediaLabel}` : ""}
          {needsHeaderMedia && varSlots.length > 0 ? " e " : ""}
          {varSlots.length > 0 ? "variáveis no texto ou no link do botão" : ""}.{" "}
          {varSlots.length > 0
            ? "Mapeie cada variável para um campo do negócio — o valor de cada contato é preenchido no envio."
            : ""}
        </p>
      </div>

      {needsHeaderMedia ? (
        <div>
          <span className={formLabelClass}>
            {mediaLabel.charAt(0).toUpperCase() + mediaLabel.slice(1)} do cabeçalho
          </span>
          <div
            role="radiogroup"
            aria-label={`Origem da ${mediaLabel} do cabeçalho`}
            className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {(
              [
                {
                  value: "template",
                  title: "Mídia original do template",
                  hint: `A ${mediaLabel} cadastrada na Meta — a mesma para todos.`,
                },
                {
                  value: "field",
                  title: "Campo do negócio",
                  hint: `Uma ${mediaLabel} por contato, vinda de um custom field.`,
                },
              ] as const
            ).map((opt) => {
              const active = headerMediaSource === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setHeaderMediaSource(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  <span className="block text-[12.5px] font-medium text-foreground">
                    {opt.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{opt.hint}</span>
                </button>
              );
            })}
          </div>
          {headerMediaSource === "field" ? (
            <div className="mt-2">
              <DropdownGlass
                options={fieldOptions}
                value={headerMediaToken || undefined}
                onValueChange={setHeaderMediaToken}
                placeholder="Campo com a URL da mídia…"
                triggerClassName="w-full"
                searchable
                searchPlaceholder="Buscar campo…"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Use um custom field do negócio que contenha a URL HTTPS da{" "}
                {mediaLabel} de cada lead.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {varSlots.map((slot) => (
        <div key={templateSlotId(slot)}>
          <span className={formLabelClass}>{templateVariableLabel(slot)}</span>
          <DropdownGlass
            options={fieldOptions}
            value={templateVariableValue(vars, slot) || undefined}
            onValueChange={(v) =>
              setVars((prev) => setTemplateVariableValue(prev, slot, v))
            }
            placeholder="Selecione o campo do CRM…"
            triggerClassName="w-full"
            searchable
            searchPlaceholder="Buscar campo…"
          />
          {slot.component === "button" && slot.buttonUrl ? (
            <p className="mt-1 break-all text-[11px] text-muted-foreground">
              Link enviado:{" "}
              {renderTemplateButtonUrl(
                { index: slot.buttonIndex ?? 0, url: slot.buttonUrl },
                vars,
              )}
            </p>
          ) : null}
        </div>
      ))}

      {fieldsQuery.isLoading ? (
        <p className="text-[11.5px] text-muted-foreground">
          Carregando campos do negócio…
        </p>
      ) : null}

      {(missingText > 0 || missingHeader) && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">
          {missingHeader
            ? `Selecione o campo com a URL da ${mediaLabel}.`
            : missingText === 1
              ? "1 variável sem campo — a Meta rejeita o envio."
              : `${missingText} variáveis sem campo — a Meta rejeita o envio.`}
        </p>
      )}
    </div>
  );
}
