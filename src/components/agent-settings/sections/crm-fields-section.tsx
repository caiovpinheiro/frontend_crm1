"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle as AlertTriangle,
  IconBriefcase as Briefcase,
  IconBuilding as Building2,
  IconDatabase as Database,
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

import { ChipInput } from "../chip-input";
import { FieldHelp, SectionHeader } from "../section-header";

/**
 * Id da tool usado antes da resposta chegar. O valor que vale é o `toolId`
 * do endpoint — este só existe para a chave poder ser lida no primeiro
 * render, e a tela avisa se os dois divergirem.
 */
const FALLBACK_TOOL_ID = "search_crm_records";

/** Espelha `CrmFieldDescriptor` de `GET /api/ai-agents/crm-fields`. */
type CrmFieldDescriptor = {
  key: string;
  entity: string;
  name: string;
  label: string;
  source: "builtin" | "custom";
  type: string | null;
  sensitiveHint: boolean;
  /// Falso = o motor não entrega o valor deste campo hoje. Liberar é inerte.
  valueAvailable: boolean;
};

/** Espelha `CrmEntityGroup`. O agrupamento e os rótulos vêm do backend. */
type CrmEntityGroup = {
  entity: string;
  label: string;
  wildcardKey: string;
  searchable: boolean;
  customValuesSupported: boolean;
  builtinCount: number;
  customCount: number;
  fields: CrmFieldDescriptor[];
};

type CrmFieldsResponse = {
  toolId: string;
  configPath: string;
  wildcardsSupported: boolean;
  guidance: string;
  entities: CrmEntityGroup[];
  fields: CrmFieldDescriptor[];
  /// `null` = a busca foi feita sem `agentId`. NÃO é allowlist vazia.
  selected: string[] | null;
  allowOrgWideSearch: boolean | null;
  sensitiveTerms: string[];
};

/** Ícone por entidade conhecida; entidade criada pela organização cai no genérico. */
const ENTITY_ICONS: Record<string, React.ElementType> = {
  contact: User,
  company: Building2,
  deal: Briefcase,
  product: ShoppingCart,
};

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function sameKeySet(a: string[], b: string[]): boolean {
  const fa = new Set(a.map(fold));
  const fb = new Set(b.map(fold));
  if (fa.size !== fb.size) return false;
  for (const k of fa) if (!fb.has(k)) return false;
  return true;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function CrmFieldsSection({
  agentId,
  enabledTools,
  onToggleTool,
  toolConfig,
  onToolConfigChange,
}: {
  /** `null` em prévia / agente sem id — a busca vai sem `agentId`. */
  agentId: string | null;
  enabledTools: string[];
  onToggleTool: (toolId: string) => void;
  toolConfig: ToolConfigMap;
  onToolConfigChange: (next: ToolConfigMap) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [showGuidance, setShowGuidance] = React.useState(false);
  /// Depois da primeira edição, a tela para de comparar com o banco: o
  /// formulário é a fonte de verdade até o operador salvar.
  const [touched, setTouched] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent-crm-fields", agentId],
    queryFn: async (): Promise<CrmFieldsResponse> => {
      const res = await fetch(
        apiUrl(
          agentId
            ? `/api/ai-agents/crm-fields?agentId=${encodeURIComponent(agentId)}`
            : "/api/ai-agents/crm-fields",
        ),
      );
      if (!res.ok) throw new Error("Erro ao carregar os campos do CRM.");
      const json = (await res.json()) as Record<string, unknown>;
      return {
        toolId:
          typeof json.toolId === "string" ? json.toolId : FALLBACK_TOOL_ID,
        configPath:
          typeof json.configPath === "string" ? json.configPath : "",
        wildcardsSupported: json.wildcardsSupported !== false,
        guidance: typeof json.guidance === "string" ? json.guidance : "",
        entities: Array.isArray(json.entities)
          ? (json.entities as CrmEntityGroup[])
          : [],
        fields: Array.isArray(json.fields)
          ? (json.fields as CrmFieldDescriptor[])
          : [],
        // Preserva a distinção entre "não perguntei" (null) e "nada
        // liberado" ([]). Coagir para [] aqui apagaria a allowlist na tela.
        selected: Array.isArray(json.selected) ? strList(json.selected) : null,
        allowOrgWideSearch:
          typeof json.allowOrgWideSearch === "boolean"
            ? json.allowOrgWideSearch
            : null,
        sensitiveTerms: strList(json.sensitiveTerms),
      };
    },
    // Os avisos de campo sensível são calculados no servidor a partir de
    // `sensitiveTerms`; sem staleTime a tela reflete o que foi salvo.
    staleTime: 0,
  });

  const toolId = data?.toolId ?? FALLBACK_TOOL_ID;
  const toolEnabled = enabledTools.includes(toolId);
  const policy = toolConfig[toolId] ?? emptyToolPolicy();
  const readableFields = policy.readableFields;
  const entities = React.useMemo(() => data?.entities ?? [], [data]);
  const wildcardsSupported = data?.wildcardsSupported ?? true;

  const patchPolicy = (partial: Partial<ToolPolicy>) => {
    setTouched(true);
    const nextPolicy: ToolPolicy = {
      ...emptyToolPolicy(),
      ...policy,
      ...partial,
    };
    const next: ToolConfigMap = { ...toolConfig };
    if (isEmptyToolPolicy(nextPolicy)) delete next[toolId];
    else next[toolId] = nextPolicy;
    onToolConfigChange(next);
  };

  const setReadable = (readableFields: string[]) =>
    patchPolicy({ readableFields });

  const groupOf = React.useMemo(() => {
    const map = new Map<string, CrmEntityGroup>();
    for (const g of entities) map.set(g.entity, g);
    return map;
  }, [entities]);

  const globalWildcard = readableFields.some((k) => fold(k) === "*");

  const entityWildcardOn = (group: CrmEntityGroup) =>
    globalWildcard ||
    readableFields.some((k) => fold(k) === fold(group.wildcardKey));

  const isReadable = (field: CrmFieldDescriptor) => {
    if (globalWildcard) return true;
    const group = groupOf.get(field.entity);
    if (group && readableFields.some((k) => fold(k) === fold(group.wildcardKey))) {
      return true;
    }
    return readableFields.some((k) => fold(k) === fold(field.key));
  };

  /// Por que liberar este campo não teria efeito. `null` = pode liberar.
  const unavailableReason = (field: CrmFieldDescriptor): string | null => {
    if (field.valueAvailable) return null;
    const group = groupOf.get(field.entity);
    if (group && !group.searchable) {
      return "O agente ainda não sabe percorrer registros desta entidade, então este campo nunca responderia.";
    }
    if (group && !group.customValuesSupported) {
      return `O CRM aceita definir campo personalizado em ${group.label}, mas não guarda valor para eles — liberar não teria efeito.`;
    }
    return "O agente não consegue ler o valor deste campo hoje.";
  };

  const toggleField = (field: CrmFieldDescriptor) => {
    if (!field.valueAvailable) return;
    const group = groupOf.get(field.entity);
    if (group && entityWildcardOn(group)) return;
    setReadable(
      readableFields.some((k) => fold(k) === fold(field.key))
        ? readableFields.filter((k) => fold(k) !== fold(field.key))
        : [...readableFields, field.key],
    );
  };

  const toggleEntityWildcard = (group: CrmEntityGroup, on: boolean) => {
    const withoutEntity = readableFields.filter(
      (k) =>
        fold(k) !== fold(group.wildcardKey) &&
        fold(k).split(".")[0] !== fold(group.entity),
    );
    setReadable(on ? [...withoutEntity, group.wildcardKey] : withoutEntity);
  };

  const visibleGroups = React.useMemo(() => {
    const term = fold(search);
    return entities.map((group) => ({
      group,
      matches: group.fields.filter(
        (f) =>
          !term ||
          fold(f.label).includes(term) ||
          fold(f.key).includes(term) ||
          fold(f.name).includes(term),
      ),
    }));
  }, [entities, search]);

  const catalogTotal = entities.reduce(
    (n, g) => n + g.builtinCount + g.customCount,
    0,
  );
  const releasedFields = (data?.fields ?? []).filter(isReadable);
  const effectiveReleased = releasedFields.filter((f) => f.valueAvailable);
  const inertReleased = releasedFields.length - effectiveReleased.length;
  const sensitiveReleased = effectiveReleased.filter(
    (f) => f.sensitiveHint,
  ).length;
  const nothingReleased = readableFields.length === 0;

  const validWildcards = new Set(
    entities.map((g) => fold(g.wildcardKey)).concat("*"),
  );
  const orphanKeys =
    (data?.fields ?? []).length === 0
      ? []
      : readableFields.filter(
          (k) =>
            !validWildcards.has(fold(k)) &&
            !(data?.fields ?? []).some((f) => fold(f.key) === fold(k)),
        );

  // `selected: null` = a busca foi sem `agentId`, não "nada liberado".
  const savedSelection = data?.selected ?? null;
  const savedOrgWide = data?.allowOrgWideSearch;
  const savedTerms = data?.sensitiveTerms ?? [];
  const divergesFromSaved =
    !touched &&
    savedSelection !== null &&
    (!sameKeySet(savedSelection, readableFields) ||
      (typeof savedOrgWide === "boolean" &&
        savedOrgWide !== policy.allowOrgWideSearch) ||
      !sameKeySet(savedTerms, policy.sensitiveTerms));

  const loadSaved = () => {
    if (savedSelection === null) return;
    patchPolicy({
      readableFields: savedSelection,
      allowOrgWideSearch:
        typeof savedOrgWide === "boolean"
          ? savedOrgWide
          : policy.allowOrgWideSearch,
      sensitiveTerms: savedTerms,
    });
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Campos do CRM"
        description="O que o agente pode ler do cadastro de quem está conversando com ele."
      />

      <p className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        A busca do agente varre{" "}
        <span className="text-foreground">todos</span> os campos — é assim que
        alguém que digita o próprio documento encontra o próprio cadastro. Mas
        ele só <span className="text-foreground">lê</span> o que você liberar
        aqui, campo a campo. O resto volta para o agente apenas como rótulo,
        sem valor: ele sabe que o dado existe e encaminha para a equipe, em vez
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
          onCheckedChange={() => onToggleTool(toolId)}
          aria-label="Consultar campos do CRM"
        />
      </div>

      {!toolEnabled && (
        <p className="rounded-xl border border-dashed border-border bg-card p-3 text-xs text-muted-foreground">
          A consulta está desligada. As liberações abaixo continuam guardadas e
          voltam a valer assim que você ligar a chave.
        </p>
      )}

      {divergesFromSaved && (
        <div className="rounded-xl border border-border bg-warning-soft p-3">
          <p className="flex items-start gap-2 text-xs text-warning">
            <AlertTriangle className="mt-px size-4 shrink-0" />
            <span>
              O que está gravado neste agente difere do que este formulário vai
              enviar. Gravado:{" "}
              <span className="font-medium">
                {savedSelection?.length ?? 0}
              </span>{" "}
              {(savedSelection?.length ?? 0) === 1 ? "chave" : "chaves"}. No
              formulário:{" "}
              <span className="font-medium">{readableFields.length}</span>.
              Salvar mantém o formulário.
            </span>
          </p>
          <button
            type="button"
            onClick={loadSaved}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            Carregar o que está gravado
          </button>
        </div>
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
              {catalogTotal > 0 && (
                <>
                  {" "}
                  Há {catalogTotal}{" "}
                  {catalogTotal === 1 ? "campo" : "campos"} no catálogo desta
                  organização à sua disposição.
                </>
              )}
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
                : `${effectiveReleased.length} de ${catalogTotal} ${catalogTotal === 1 ? "campo" : "campos"} liberados para leitura`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sensitiveReleased > 0
                ? `${sensitiveReleased} ${sensitiveReleased === 1 ? "deles tem aviso" : "deles têm aviso"} de dado sensível. O agente poderá dizer esses valores em conversa.`
                : "Os demais campos voltam ao agente só como rótulo, sem valor."}
            </p>
            {inertReleased > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {inertReleased}{" "}
                {inertReleased === 1
                  ? "campo liberado não tem"
                  : "campos liberados não têm"}{" "}
                valor disponível e não vão responder nada.
              </p>
            )}
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
      ) : entities.length === 0 ? (
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
          {visibleGroups.map(({ group, matches }) => {
            const Icon = ENTITY_ICONS[group.entity] ?? Database;
            const wildcardOn = entityWildcardOn(group);
            const total = group.builtinCount + group.customCount;
            return (
              <div key={group.entity} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {group.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {total} {total === 1 ? "campo" : "campos"}
                  </span>
                  {!group.searchable && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-px text-[10px] font-medium text-warning">
                      <AlertTriangle className="size-3" />
                      Busca não suportada
                    </span>
                  )}
                  {wildcardsSupported && (
                    <div className="ms-auto flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Liberar todos ({group.wildcardKey})
                      </span>
                      <Switch
                        checked={wildcardOn}
                        disabled={globalWildcard || !group.searchable}
                        onCheckedChange={(on) =>
                          toggleEntityWildcard(group, on)
                        }
                        aria-label={`Liberar todos os campos de ${group.label}`}
                      />
                    </div>
                  )}
                </div>

                {!group.searchable && (
                  <p className="text-xs text-muted-foreground">
                    Esta entidade existe porque a organização criou campos
                    personalizados nela, mas o agente ainda não sabe percorrer
                    os registros dela. Os campos aparecem para você saber que
                    existem; liberá-los não teria efeito.
                  </p>
                )}

                {wildcardOn && group.searchable && (
                  <p className="text-xs text-muted-foreground">
                    Curinga ligado: o agente lê qualquer campo desta entidade,
                    inclusive os que forem criados depois.
                  </p>
                )}

                <FieldGroup
                  title="Campos fixos"
                  fields={matches.filter((f) => f.source === "builtin")}
                  isReadable={isReadable}
                  unavailableReason={unavailableReason}
                  locked={wildcardOn}
                  onToggle={toggleField}
                />
                <FieldGroup
                  title="Campos personalizados"
                  fields={matches.filter((f) => f.source === "custom")}
                  isReadable={isReadable}
                  unavailableReason={unavailableReason}
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

      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">
          Como esta organização chama os dados sensíveis dela
        </p>
        <FieldHelp>
          O produto já acende o aviso em documento, credencial, dado de contato
          e dado bancário. Aqui você acrescenta o nome que a sua operação usa
          (por exemplo o número que identifica a pessoa no seu sistema). Serve
          só para marcar o campo na lista acima — não bloqueia leitura nem
          busca.
        </FieldHelp>
        <ChipInput
          values={policy.sensitiveTerms}
          onChange={(sensitiveTerms) => patchPolicy({ sensitiveTerms })}
          placeholder="Ex.: prontuário"
        />
        <FieldHelp>
          Quem marca os campos é o servidor, então os avisos da lista acima só
          mudam depois de salvar.
        </FieldHelp>
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
          <>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 font-sans text-xs leading-relaxed text-foreground">
              {data?.guidance?.trim()
                ? data.guidance
                : "A orientação não veio na resposta da API."}
            </pre>
            {data?.configPath && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Gravado em{" "}
                <span className="text-foreground">{data.configPath}</span>.
              </p>
            )}
            {data && data.toolId !== FALLBACK_TOOL_ID && (
              <p className="mt-1 text-[11px] text-warning">
                O endpoint informou a ferramenta{" "}
                <span className="font-medium">{data.toolId}</span>, diferente da
                que esta tela assume por padrão. Confira antes de salvar.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FieldGroup({
  title,
  fields,
  isReadable,
  unavailableReason,
  locked,
  onToggle,
}: {
  title: string;
  fields: CrmFieldDescriptor[];
  isReadable: (field: CrmFieldDescriptor) => boolean;
  unavailableReason: (field: CrmFieldDescriptor) => string | null;
  locked: boolean;
  onToggle: (field: CrmFieldDescriptor) => void;
}) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {fields.map((field) => {
          const reason = unavailableReason(field);
          const disabled = reason !== null || locked;
          const on = reason === null && isReadable(field);
          return (
            <li key={field.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={() => onToggle(field)}
                title={
                  reason ??
                  (locked ? "Liberado pelo curinga da entidade." : undefined)
                }
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors",
                  !disabled && "hover:bg-muted/40",
                  locked && "opacity-70",
                  reason !== null && "opacity-60",
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
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm text-foreground">
                      {field.label}
                    </span>
                    {field.sensitiveHint && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-1.5 py-px text-[10px] font-medium text-warning">
                        <ShieldAlert className="size-3" />
                        Dado sensível
                      </span>
                    )}
                    {reason !== null && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                        Sem valor disponível
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {field.key}
                    {field.type ? ` · ${field.type}` : ""}
                  </span>
                  {reason !== null && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {reason}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
