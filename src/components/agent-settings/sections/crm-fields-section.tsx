"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  IconBriefcase as Briefcase,
  IconBuilding as Building2,
  IconLoader2 as Loader2,
  IconSearch as Search,
  IconShieldExclamation as ShieldAlert,
  IconShoppingCart as ShoppingCart,
  IconUser as User,
} from "@tabler/icons-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formControlClass } from "@/components/ui/form-dialog";
import {
  emptyToolPolicy,
  isEmptyToolPolicy,
  type ToolConfigMap,
  type ToolPolicy,
} from "@/lib/ai-agents/steering";
import { cn } from "@/lib/utils";

import { FieldHelp, SectionHeader } from "../section-header";

const TOOL_ID = "search_crm_records";

type CrmSearchEntity = "contact" | "company" | "deal" | "product";

/** Espelha `CrmFieldDescriptor` de `GET /api/ai-agents/crm-fields`. */
type CrmFieldDescriptor = {
  key: string;
  entity: CrmSearchEntity;
  name: string;
  label: string;
  source: "builtin" | "custom";
  type: string | null;
  sensitiveHint: boolean;
};

const ENTITY_ORDER: CrmSearchEntity[] = [
  "contact",
  "company",
  "deal",
  "product",
];

const ENTITY_META: Record<
  CrmSearchEntity,
  { label: string; wildcardLabel: string; icon: React.ElementType }
> = {
  contact: {
    label: "Contato",
    wildcardLabel: "todos os campos de contato",
    icon: User,
  },
  company: {
    label: "Empresa",
    wildcardLabel: "todos os campos de empresa",
    icon: Building2,
  },
  deal: {
    label: "Negócio",
    wildcardLabel: "todos os campos de negócio",
    icon: Briefcase,
  },
  product: {
    label: "Catálogo de produtos",
    wildcardLabel: "todos os campos do catálogo",
    icon: ShoppingCart,
  },
};

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function CrmFieldsSection({
  enabledTools,
  onToggleTool,
  toolConfig,
  onToolConfigChange,
}: {
  enabledTools: string[];
  onToggleTool: (toolId: string) => void;
  toolConfig: ToolConfigMap;
  onToolConfigChange: (next: ToolConfigMap) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [showGuidance, setShowGuidance] = React.useState(false);

  const toolEnabled = enabledTools.includes(TOOL_ID);
  const policy = toolConfig[TOOL_ID] ?? emptyToolPolicy();
  const readableFields = policy.readableFields;

  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent-crm-fields"],
    queryFn: async (): Promise<{
      fields: CrmFieldDescriptor[];
      guidance: string;
    }> => {
      const res = await fetch(apiUrl("/api/ai-agents/crm-fields"));
      if (!res.ok) throw new Error("Erro ao carregar os campos do CRM.");
      const json = (await res.json()) as {
        fields?: CrmFieldDescriptor[];
        guidance?: string;
      };
      return {
        fields: Array.isArray(json.fields) ? json.fields : [],
        guidance: typeof json.guidance === "string" ? json.guidance : "",
      };
    },
    staleTime: 60_000,
  });

  const fields = React.useMemo(() => data?.fields ?? [], [data]);

  const patchPolicy = (partial: Partial<ToolPolicy>) => {
    const nextPolicy: ToolPolicy = {
      ...emptyToolPolicy(),
      ...policy,
      ...partial,
    };
    const next: ToolConfigMap = { ...toolConfig };
    if (isEmptyToolPolicy(nextPolicy)) delete next[TOOL_ID];
    else next[TOOL_ID] = nextPolicy;
    onToolConfigChange(next);
  };

  const setReadable = (readableFields: string[]) =>
    patchPolicy({ readableFields });

  const globalWildcard = readableFields.some((k) => fold(k) === "*");
  const entityWildcard = (entity: CrmSearchEntity) =>
    globalWildcard || readableFields.some((k) => fold(k) === `${entity}.*`);

  const isReadable = (field: CrmFieldDescriptor) =>
    entityWildcard(field.entity) ||
    readableFields.some((k) => fold(k) === fold(field.key));

  const toggleField = (field: CrmFieldDescriptor) => {
    if (entityWildcard(field.entity)) return;
    setReadable(
      readableFields.some((k) => fold(k) === fold(field.key))
        ? readableFields.filter((k) => fold(k) !== fold(field.key))
        : [...readableFields, field.key],
    );
  };

  const toggleEntityWildcard = (entity: CrmSearchEntity, on: boolean) => {
    const withoutEntity = readableFields.filter(
      (k) => fold(k).split(".")[0] !== entity,
    );
    setReadable(on ? [...withoutEntity, `${entity}.*`] : withoutEntity);
  };

  const grouped = React.useMemo(() => {
    const term = fold(search);
    const match = (f: CrmFieldDescriptor) =>
      !term ||
      fold(f.label).includes(term) ||
      fold(f.key).includes(term) ||
      fold(f.name).includes(term);
    return ENTITY_ORDER.map((entity) => {
      const all = fields.filter((f) => f.entity === entity);
      const visible = all.filter(match);
      return {
        entity,
        total: all.length,
        builtin: visible.filter((f) => f.source === "builtin"),
        custom: visible.filter((f) => f.source === "custom"),
      };
    }).filter((g) => g.total > 0);
  }, [fields, search]);

  const releasedFields = fields.filter(isReadable);
  const sensitiveReleased = releasedFields.filter((f) => f.sensitiveHint).length;
  const nothingReleased = readableFields.length === 0;

  /// Chaves salvas que não existem mais no catálogo (campo personalizado
  /// apagado depois de liberado). Só avisa — quem remove é o operador.
  const orphanKeys =
    fields.length === 0
      ? []
      : readableFields.filter(
          (k) =>
            !k.includes("*") &&
            !fields.some((f) => fold(f.key) === fold(k)),
        );

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Campos do CRM"
        description="O que o agente pode ler do cadastro de quem está conversando com ele."
      />

      <p className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        A busca do agente varre{" "}
        <span className="text-foreground">todos</span> os campos — é assim que
        alguém que digita o próprio CPF encontra o próprio cadastro. Mas ele só{" "}
        <span className="text-foreground">lê</span> o que você liberar aqui,
        campo a campo. O resto volta para o agente apenas como rótulo, sem
        valor: ele sabe que o dado existe e encaminha para um consultor, em vez
        de negar que exista.
      </p>

      <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Deixar o agente consultar os campos do CRM
          </p>
          <FieldHelp>
            Desligado, o agente não procura nada no cadastro e responde só com
            a base de conhecimento.
          </FieldHelp>
        </div>
        <Switch
          checked={toolEnabled}
          onCheckedChange={() => onToggleTool(TOOL_ID)}
          aria-label="Consultar campos do CRM"
        />
      </div>

      {!toolEnabled && (
        <p className="rounded-xl border border-dashed border-border bg-card p-3 text-xs text-muted-foreground">
          A consulta está desligada. As liberações abaixo continuam guardadas e
          voltam a valer assim que você ligar a chave.
        </p>
      )}

      <div
        className={cn(
          "rounded-xl border p-4",
          nothingReleased
            ? "border-border bg-card"
            : "border-primary/40 bg-primary/5",
        )}
      >
        {nothingReleased ? (
          <>
            <p className="text-sm font-medium text-foreground">
              Nenhum campo liberado — este é o padrão
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              O agente confirma que localizou o cadastro e encaminha a pessoa a
              um consultor. Nenhum valor de campo chega ao modelo. Não está
              quebrado: é a configuração inicial de todo agente.
            </p>
          </>
        ) : isLoading ? (
          <p className="text-sm font-medium text-foreground">
            Carregando os campos liberados…
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              {globalWildcard
                ? "Todos os campos estão liberados para leitura"
                : `${releasedFields.length} ${releasedFields.length === 1 ? "campo liberado" : "campos liberados"} para leitura`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sensitiveReleased > 0
                ? `${sensitiveReleased} ${sensitiveReleased === 1 ? "deles é marcado" : "deles são marcados"} como possível dado pessoal. O agente poderá dizer esses valores em conversa.`
                : "Os demais campos voltam ao agente só como rótulo, sem valor."}
            </p>
            {orphanKeys.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Sem correspondência no CRM (campo apagado depois de liberado):{" "}
                <span className="text-foreground">
                  {orphanKeys.join(", ")}
                </span>
                .
              </p>
            )}
          </>
        )}
        {readableFields.length > 0 && (
          <button
            type="button"
            onClick={() => setReadable([])}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            Revogar tudo
          </button>
        )}
      </div>

      {globalWildcard && (
        <p className="rounded-xl border border-border bg-warning-soft p-3 text-xs text-warning">
          Existe um curinga <span className="font-medium">*</span> salvo nesta
          configuração: qualquer campo, inclusive os criados no futuro, fica
          legível. Use &quot;Revogar tudo&quot; para removê-lo e escolher campo
          a campo.
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar um campo pelo nome"
          className={cn(formControlClass, "pl-10")}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-foreground">
            Nenhum campo disponível para consulta.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre campos personalizados em Configurações para o agente poder
            lê-los.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => {
            const meta = ENTITY_META[group.entity];
            const Icon = meta.icon;
            const wildcardOn = entityWildcard(group.entity);
            return (
              <div key={group.entity} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {meta.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {group.total}{" "}
                    {group.total === 1 ? "campo" : "campos"}
                  </span>
                  <div className="ms-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Liberar {meta.wildcardLabel}
                    </span>
                    <Switch
                      checked={wildcardOn}
                      disabled={globalWildcard}
                      onCheckedChange={(on) =>
                        toggleEntityWildcard(group.entity, on)
                      }
                      aria-label={`Liberar ${meta.wildcardLabel}`}
                    />
                  </div>
                </div>

                {wildcardOn && (
                  <p className="text-xs text-muted-foreground">
                    Curinga ligado: o agente lê qualquer campo desta entidade,
                    inclusive os que forem criados depois.
                  </p>
                )}

                <FieldGroup
                  title="Campos fixos"
                  fields={group.builtin}
                  isReadable={isReadable}
                  locked={wildcardOn}
                  onToggle={toggleField}
                />
                <FieldGroup
                  title="Campos personalizados"
                  fields={group.custom}
                  isReadable={isReadable}
                  locked={wildcardOn}
                  onToggle={toggleField}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Deixar o agente consultar o cadastro de outras pessoas
          </p>
          <FieldHelp>
            Ligado, quem estiver na conversa consegue puxar o cadastro de
            terceiros informando um dado deles. Desligado, o agente só lê o
            cadastro de quem está falando com ele.
          </FieldHelp>
        </div>
        <Switch
          checked={policy.allowOrgWideSearch}
          onCheckedChange={(allowOrgWideSearch) =>
            patchPolicy({ allowOrgWideSearch })
          }
          aria-label="Consultar cadastro de outras pessoas"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Como orientamos o agente a buscar
            </p>
            <FieldHelp>
              Texto exato que o agente recebe junto da ferramenta. Só leitura.
            </FieldHelp>
          </div>
          <button
            type="button"
            onClick={() => setShowGuidance((v) => !v)}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            {showGuidance ? "Ocultar" : "Ver orientação"}
          </button>
        </div>
        {showGuidance && (
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 font-sans text-xs leading-relaxed text-foreground">
            {data?.guidance?.trim()
              ? data.guidance
              : "A orientação não veio na resposta da API."}
          </pre>
        )}
      </div>
    </div>
  );
}

function FieldGroup({
  title,
  fields,
  isReadable,
  locked,
  onToggle,
}: {
  title: string;
  fields: CrmFieldDescriptor[];
  isReadable: (field: CrmFieldDescriptor) => boolean;
  locked: boolean;
  onToggle: (field: CrmFieldDescriptor) => void;
}) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {fields.map((field) => {
          const on = isReadable(field);
          return (
            <li key={field.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={locked}
                onClick={() => onToggle(field)}
                title={
                  locked
                    ? "Liberado pelo curinga da entidade."
                    : undefined
                }
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors",
                  !locked && "hover:bg-muted/40",
                  locked && "opacity-70",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {on && <span className="text-[10px]">✓</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-foreground">
                      {field.label}
                    </span>
                    {field.sensitiveHint && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-1.5 py-px text-[10px] font-medium text-warning">
                        <ShieldAlert className="size-3" />
                        Dado pessoal
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {field.key}
                    {field.type ? ` · ${field.type}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
