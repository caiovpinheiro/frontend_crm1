"use client";

/**
 * Bloco de configuração do step "Webhook" — usado pela edição inline do
 * canvas (`inline-editor.tsx`).
 *
 * Em 03/jun/26 a tela foi reescrita: o usuário NÃO escreve mais JSON
 * manualmente no Body. No lugar, ele monta um construtor visual de
 * campos onde cada linha mapeia uma chave (que aparece no payload) a
 * um campo do catálogo (que vira `{{token}}` no body salvo). O JSON
 * gerado segue o mesmo formato consumido por `interpolateWebhookString`
 * no backend — então o motor de disparo não muda.
 *
 * Compatibilidade com config legado:
 *   - URL e método continuam idênticos.
 *   - Headers seguem como array `[{ key, value }]`. Picker de
 *     variáveis insere tokens na URL e nos values dos headers.
 *   - `body` é uma string JSON. Quando o draft já tinha um body salvo
 *     manualmente, o parser tenta hidratar o construtor visual; tokens
 *     desconhecidos (ou valores literais) viram entries marcadas como
 *     "não reconhecida" e bloqueiam o save até o operador corrigir.
 *   - Body vazio = backend mantém o payload legado (compat).
 *
 * Custom fields de contato/negócio são carregados via
 * `/api/custom-fields?entity=...` e injetados como opções dinâmicas no
 * catálogo. O backend (`buildWebhookRoot`) expõe `contactCustomFields`
 * e `dealCustomFields` no root pra resolução dos tokens.
 */

import * as React from "react";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { useQuery } from "@tanstack/react-query";
import { IconChevronDown as ChevronDown, IconCode as Code2, IconEye as Eye, IconPlus as Plus, IconSearch as Search, IconTrash as Trash2, IconVariable as Variable } from "@tabler/icons-react";

import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import {
  WEBHOOK_VARIABLE_GROUPS,
  WEBHOOK_VARIABLE_OPTIONS,
  buildCustomFieldOptions,
  defaultKeyPathFor,
  type WebhookVariableGroup,
  type WebhookVariableOption,
} from "@/lib/automation-webhook-variables";
import {
  entriesToBodyString,
  makeEntry,
  parseBodyToEntries,
  validateEntries,
  type WebhookBodyEntry,
} from "@/lib/webhook-body-builder";
import { cn } from "@/lib/utils";

export type WebhookHeaderEntry = { key: string; value: string };
export type WebhookQueryParamEntry = { key: string; value: string };

type Draft = Record<string, unknown>;

type Props = {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
};

type CustomFieldApiOption = {
  id: string;
  name: string;
  label: string;
  entity: string;
};

function readHeadersFromDraft(draft: Draft): WebhookHeaderEntry[] {
  const raw = draft.headers;
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (h): h is WebhookHeaderEntry =>
          h !== null &&
          typeof h === "object" &&
          "key" in h &&
          "value" in h &&
          typeof (h as { key: unknown }).key === "string" &&
          typeof (h as { value: unknown }).value === "string",
      )
      .map((h) => ({ key: h.key, value: h.value }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => ({ key: k, value: String(v) }));
  }
  return [];
}

// Aceita `queryParams` como array `[{key,value}]` (formato canônico da UI)
// ou como Record<string,string> (compat com configs escritas à mão). Configs
// legadas sem `queryParams` retornam array vazio.
function readQueryParamsFromDraft(draft: Draft): WebhookQueryParamEntry[] {
  const raw = draft.queryParams;
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (p): p is WebhookQueryParamEntry =>
          p !== null &&
          typeof p === "object" &&
          "key" in p &&
          "value" in p &&
          typeof (p as { key: unknown }).key === "string" &&
          typeof (p as { value: unknown }).value === "string",
      )
      .map((p) => ({ key: p.key, value: p.value }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => ({ key: k, value: String(v) }));
  }
  return [];
}

export function WebhookStepConfig({ draft, setDraft }: Props) {
  const url = String(draft.url ?? "");
  const method = String(draft.method ?? "POST");
  const bodyFromDraft = String(draft.body ?? "");
  const headers = React.useMemo<WebhookHeaderEntry[]>(
    () => readHeadersFromDraft(draft),
    [draft],
  );
  const queryParams = React.useMemo<WebhookQueryParamEntry[]>(
    () => readQueryParamsFromDraft(draft),
    [draft],
  );

  // Custom fields dinâmicos — carregados em paralelo. Enquanto não
  // chega, o catálogo só tem o estático; entries vindas de bodies
  // legados que referenciem custom fields ficam marcadas como unknown
  // até a query resolver (re-parse abaixo).
  const customFieldsQuery = useQuery({
    queryKey: ["webhook-custom-fields"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [contactRes, dealRes] = await Promise.all([
        fetch(apiUrl("/api/custom-fields?entity=contact")),
        fetch(apiUrl("/api/custom-fields?entity=deal")),
      ]);
      const contacts = contactRes.ok
        ? ((await contactRes.json()) as CustomFieldApiOption[])
        : [];
      const deals = dealRes.ok
        ? ((await dealRes.json()) as CustomFieldApiOption[])
        : [];
      return [...contacts, ...deals];
    },
  });

  const allOptions = React.useMemo<WebhookVariableOption[]>(() => {
    const dyn = buildCustomFieldOptions(customFieldsQuery.data ?? []);
    return [...WEBHOOK_VARIABLE_OPTIONS, ...dyn];
  }, [customFieldsQuery.data]);

  // Entries do construtor visual. Persistimos `draft.body` como JSON
  // serializado (formato consumido pelo backend); `entries` é a
  // representação da UI que regeneramos a cada mudança.
  const [entries, setEntries] = React.useState<WebhookBodyEntry[]>(() =>
    parseBodyToEntries(bodyFromDraft, allOptions),
  );
  const lastEmittedRef = React.useRef<string>("");

  // Re-parseia quando `draft.body` mudou de fora (ex.: parent setou
  // outro step). Também re-parseia quando o catálogo cresce (custom
  // fields chegaram), pra resolver entries que estavam unknown.
  React.useEffect(() => {
    if (lastEmittedRef.current === bodyFromDraft) return;
    setEntries(parseBodyToEntries(bodyFromDraft, allOptions));
    lastEmittedRef.current = bodyFromDraft;
  }, [bodyFromDraft, allOptions]);

  React.useEffect(() => {
    setEntries((prev) => {
      if (!prev.some((e) => e.unknownToken || e.literalValue !== undefined)) return prev;
      return parseBodyToEntries(bodyFromDraft, allOptions);
    });
    // Disparamos só quando o número de opções dinâmicas muda (custom
    // fields chegaram). Body string é cuidado no efeito acima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOptions.length]);

  // Sempre que `entries` muda, regeneramos o JSON e propagamos para
  // o draft. Marcamos `lastEmittedRef` pra não re-parsear o que nós
  // mesmos emitimos.
  const commitEntries = React.useCallback(
    (next: WebhookBodyEntry[]) => {
      setEntries(next);
      const nextBody = next.length === 0 ? "" : entriesToBodyString(next, allOptions);
      lastEmittedRef.current = nextBody;
      setDraft((d) => ({ ...d, body: nextBody, __webhookBodyEntries: next }));
    },
    [allOptions, setDraft],
  );

  const validationErrors = React.useMemo(
    () => validateEntries(entries),
    [entries],
  );
  const errorByEntry = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const err of validationErrors) {
      const list = map.get(err.entryId) ?? [];
      list.push(err.message);
      map.set(err.entryId, list);
    }
    return map;
  }, [validationErrors]);

  // Index do catálogo por key — usado pra exibir o token interno e
  // resolver o campo selecionado em cada linha.
  const optionByKey = React.useMemo(
    () => new Map(allOptions.map((o) => [o.key, o] as const)),
    [allOptions],
  );

  // Catálogo agrupado pra os selects da linha (categoria → campo).
  const optionsByGroup = React.useMemo(() => {
    const map = new Map<WebhookVariableGroup, WebhookVariableOption[]>();
    for (const opt of allOptions) {
      const list = map.get(opt.group) ?? [];
      list.push(opt);
      map.set(opt.group, list);
    }
    return map;
  }, [allOptions]);

  const visibleGroups = React.useMemo(
    () => WEBHOOK_VARIABLE_GROUPS.filter((g) => (optionsByGroup.get(g)?.length ?? 0) > 0),
    [optionsByGroup],
  );

  // ─── Headers/URL state ───────────────────────────────────
  const urlRef = React.useRef<HTMLInputElement | null>(null);
  const headerValueRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
  const queryParamValueRefs = React.useRef<Record<number, HTMLInputElement | null>>({});

  type FocusTarget =
    | { type: "url" }
    | { type: "header-value"; index: number }
    | { type: "query-param-value"; index: number };
  const [focusTarget, setFocusTarget] = React.useState<FocusTarget>({ type: "url" });

  const setHeaders = (next: WebhookHeaderEntry[]) => {
    setDraft((d) => ({ ...d, headers: next }));
  };

  const updateHeader = (index: number, patch: Partial<WebhookHeaderEntry>) => {
    setHeaders(headers.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  };

  const addHeader = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  // ─── Query params (mesma mecânica dos headers) ──────────
  const setQueryParams = (next: WebhookQueryParamEntry[]) => {
    setDraft((d) => ({ ...d, queryParams: next }));
  };
  const updateQueryParam = (index: number, patch: Partial<WebhookQueryParamEntry>) => {
    setQueryParams(queryParams.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const addQueryParam = () => {
    setQueryParams([...queryParams, { key: "", value: "" }]);
  };
  const removeQueryParam = (index: number) => {
    setQueryParams(queryParams.filter((_, i) => i !== index));
  };

  const insertTokenAt = (target: FocusTarget, token: string) => {
    if (target.type === "url") {
      const el = urlRef.current;
      const start = el?.selectionStart ?? url.length;
      const end = el?.selectionEnd ?? url.length;
      const next = url.slice(0, start) + token + url.slice(end);
      setDraft((d) => ({ ...d, url: next }));
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + token.length;
        el?.setSelectionRange(pos, pos);
      });
      return;
    }
    if (target.type === "header-value") {
      const i = target.index;
      const el = headerValueRefs.current[i];
      const current = headers[i]?.value ?? "";
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + token + current.slice(end);
      updateHeader(i, { value: next });
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + token.length;
        el?.setSelectionRange(pos, pos);
      });
      return;
    }
    if (target.type === "query-param-value") {
      const i = target.index;
      const el = queryParamValueRefs.current[i];
      const current = queryParams[i]?.value ?? "";
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + token + current.slice(end);
      updateQueryParam(i, { value: next });
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + token.length;
        el?.setSelectionRange(pos, pos);
      });
    }
  };

  const focusLabel: string =
    focusTarget.type === "url"
      ? "URL"
      : focusTarget.type === "header-value"
        ? `Header #${focusTarget.index + 1}`
        : `Parâmetro #${focusTarget.index + 1}`;

  // ─── Body builder handlers ───────────────────────────────
  const addEntry = (preset?: Partial<WebhookBodyEntry>) => {
    commitEntries([...entries, makeEntry(preset)]);
  };

  const updateEntry = (id: string, patch: Partial<WebhookBodyEntry>) => {
    commitEntries(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const removeEntry = (id: string) => {
    commitEntries(entries.filter((e) => e.id !== id));
  };

  // Categoria é estado de UI separado de `optionKey` (em
  // `selectedGroupByEntry`). Trocar a categoria limpa o campo
  // selecionado e qualquer flag legada (unknown/literal).
  const handleCategoryChange = (id: string, group: WebhookVariableGroup) => {
    const current = entries.find((e) => e.id === id);
    if (!current) return;
    commitEntries(
      entries.map((e) =>
        e.id === id
          ? { ...e, optionKey: "", unknownToken: undefined, literalValue: undefined }
          : e,
      ),
    );
    setSelectedGroupByEntry((prev) => ({ ...prev, [id]: group }));
  };

  const handleOptionChange = (id: string, optionKey: string) => {
    const opt = optionByKey.get(optionKey);
    const current = entries.find((e) => e.id === id);
    if (!current) return;
    const nextKeyPath = current.keyPath.trim()
      ? current.keyPath
      : opt
        ? defaultKeyPathFor(opt)
        : "";
    commitEntries(
      entries.map((e) =>
        e.id === id
          ? {
              ...e,
              optionKey,
              keyPath: nextKeyPath,
              unknownToken: undefined,
              literalValue: undefined,
            }
          : e,
      ),
    );
  };

  // Categoria selecionada por linha (memória local da UI). Quando a
  // entry tem `optionKey` válida, derivamos do catálogo. Quando é
  // unknown/literal/incompleta, lembramos a última seleção do usuário.
  const [selectedGroupByEntry, setSelectedGroupByEntry] = React.useState<
    Record<string, WebhookVariableGroup>
  >({});

  const groupForEntry = (entry: WebhookBodyEntry): WebhookVariableGroup | "" => {
    if (entry.optionKey) {
      const opt = optionByKey.get(entry.optionKey);
      if (opt) return opt.group;
    }
    return selectedGroupByEntry[entry.id] ?? "";
  };

  const tokenForEntry = (entry: WebhookBodyEntry): string => {
    if (entry.unknownToken) return entry.unknownToken;
    if (entry.optionKey) {
      const opt = optionByKey.get(entry.optionKey);
      if (opt) return opt.token;
    }
    return "—";
  };

  // ─── Search box (catálogo geral) ────────────────────────
  const [search, setSearch] = React.useState("");
  const searchResults = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as WebhookVariableOption[];
    return allOptions
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.token.toLowerCase().includes(q) ||
          o.key.toLowerCase().includes(q) ||
          (o.hint?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 30);
  }, [search, allOptions]);

  // ─── Preview ────────────────────────────────────────────
  const previewJson = React.useMemo(() => {
    if (entries.length === 0) {
      return "// Nenhum campo configurado — body vazio (payload legado será enviado).";
    }
    if (validationErrors.length > 0) {
      return "// Corrija os erros sinalizados acima para gerar o preview.";
    }
    return entriesToBodyString(entries, allOptions);
  }, [entries, allOptions, validationErrors]);

  return (
    <div className="space-y-5">
      {/* URL */}
      <div className="space-y-2">
        <Label htmlFor="sc-wh-url">URL</Label>
        <Input
          id="sc-wh-url"
          ref={urlRef}
          value={url}
          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
          onFocus={() => setFocusTarget({ type: "url" })}
          placeholder="https://exemplo.com/hooks/n8n-id"
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground">
          Aceita variáveis também na URL — útil pra rotas com IDs (ex.:
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]">
            /api/leads/{"{{contact.id}}"}
          </code>
          ).
        </p>
      </div>

      {/* Método */}
      <div className="space-y-2">
        <Label htmlFor="sc-wh-method">Método</Label>
        <DropdownGlass
          triggerClassName="w-full"
          value={method}
          options={[
            { value: "GET", label: "GET" },
            { value: "POST", label: "POST" },
            { value: "PUT", label: "PUT" },
            { value: "PATCH", label: "PATCH" },
            { value: "DELETE", label: "DELETE" },
          ]}
          onValueChange={(v) => setDraft((d) => ({ ...d, method: v }))}
        />
      </div>

      {/* Configurações avançadas — abas Cabeçalho / Parâmetros / Corpo
          (layout inspirado no editor de webhook do Digisac). O picker de
          variáveis lá embaixo continua servindo URL + qualquer value focado
          dentro das abas de Cabeçalho e Parâmetros. */}
      <Tabs defaultValue="headers" className="space-y-3">
        <div className="space-y-2">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Configurações avançadas
          </Label>
          <TabsList>
            <TabsTrigger value="headers">Cabeçalho</TabsTrigger>
            <TabsTrigger value="params">Parâmetros</TabsTrigger>
            <TabsTrigger value="body">Corpo</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Cabeçalho ─────────────────────────────────── */}
        <TabsContent value="headers" className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Headers</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={addHeader}
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>
          {headers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Nenhum header customizado.{" "}
              <code className="rounded bg-muted px-1">Content-Type: application/json</code> é
              setado automaticamente quando há body.
            </p>
          ) : (
            <div className="space-y-1.5">
              {headers.map((h, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <Input
                    value={h.key}
                    onChange={(e) => updateHeader(i, { key: e.target.value })}
                    placeholder="Authorization"
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <Input
                    ref={(el) => {
                      headerValueRefs.current[i] = el;
                    }}
                    value={h.value}
                    onChange={(e) => updateHeader(i, { value: e.target.value })}
                    onFocus={() => setFocusTarget({ type: "header-value", index: i })}
                    placeholder="Bearer ..."
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeHeader(i)}
                    aria-label={`Remover header ${h.key || i + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Parâmetros de query ────────────────────────
            Persistidos em `draft.queryParams` (array). O executor
            interpola os values com `interpolateWebhookString` e anexa
            à URL via `URLSearchParams` antes do fetch. */}
        <TabsContent value="params" className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Parâmetros (query string)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={addQueryParam}
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>
          {queryParams.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Nenhum parâmetro. Se a URL já tiver query (ex.:{" "}
              <code className="rounded bg-muted px-1">?tenant=abc</code>), os parâmetros
              adicionados aqui são anexados sem sobrescrever.
            </p>
          ) : (
            <div className="space-y-1.5">
              {queryParams.map((p, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <Input
                    value={p.key}
                    onChange={(e) => updateQueryParam(i, { key: e.target.value })}
                    placeholder="tenant"
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <Input
                    ref={(el) => {
                      queryParamValueRefs.current[i] = el;
                    }}
                    value={p.value}
                    onChange={(e) => updateQueryParam(i, { value: e.target.value })}
                    onFocus={() => setFocusTarget({ type: "query-param-value", index: i })}
                    placeholder="{{contact.id}}"
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeQueryParam(i)}
                    aria-label={`Remover parâmetro ${p.key || i + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Use tokens como <code className="rounded bg-muted px-1">{"{{contact.id}}"}</code>
            {" "}ou <code className="rounded bg-muted px-1">{"{{deal.id}}"}</code> no valor —
            eles são interpolados em runtime.
          </p>
        </TabsContent>

        {/* ─── Corpo (construtor visual) ─────────────────── */}
        <TabsContent value="body" className="space-y-3">
        <div className="space-y-1">
          <Label>Body do Webhook</Label>
          <p className="text-[11px] text-muted-foreground">
            Configure quais dados serão enviados. Cada linha vira uma chave no JSON do
            disparo. Use ponto na chave (ex.:{" "}
            <code className="rounded bg-muted px-1">ad.headline</code>) para criar objetos
            aninhados.
          </p>
        </div>

        {/* Header da tabela — só aparece quando há entries pra evitar
            ruído visual no estado inicial. */}
        {entries.length > 0 && (
          <div className="grid grid-cols-[1.4fr_1.2fr_1.6fr_1.4fr_auto] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Chave enviada</span>
            <span>Categoria</span>
            <span>Campo</span>
            <span>Valor interno</span>
            <span aria-hidden="true" />
          </div>
        )}

        <div className="space-y-2">
          {entries.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhum campo configurado. Clique em{" "}
              <strong className="text-foreground">+ Adicionar campo</strong> para começar.
            </div>
          )}
          {entries.map((entry) => {
            const group = groupForEntry(entry);
            const groupOptions = group ? optionsByGroup.get(group) ?? [] : [];
            const errs = errorByEntry.get(entry.id) ?? [];
            const hasError = errs.length > 0;
            const isUnknown = !!entry.unknownToken;
            const isLiteral = entry.literalValue !== undefined;
            return (
              <div
                key={entry.id}
                className={cn(
                  "rounded-xl border bg-background/60 p-2",
                  hasError ? "border-destructive/60 bg-destructive/5" : "border-border/60",
                )}
              >
                <div className="grid grid-cols-[1.4fr_1.2fr_1.6fr_1.4fr_auto] items-center gap-2">
                  <Input
                    value={entry.keyPath}
                    onChange={(e) => updateEntry(entry.id, { keyPath: e.target.value })}
                    placeholder="ex.: dealId, ad.headline"
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <DropdownGlass
                    triggerClassName="text-xs w-full"
                    placeholder="Selecione…"
                    value={group}
                    options={[
                      { value: "", label: "Selecione…" },
                      ...visibleGroups.map((g) => ({ value: g, label: g })),
                    ]}
                    onValueChange={(v) =>
                      handleCategoryChange(entry.id, v as WebhookVariableGroup)
                    }
                  />
                  <DropdownGlass
                    triggerClassName="text-xs w-full"
                    placeholder={group ? "Selecione um campo…" : "Escolha a categoria primeiro"}
                    value={entry.optionKey}
                    disabled={!group}
                    options={groupOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
                    onValueChange={(v) => handleOptionChange(entry.id, v)}
                  />
                  <TooltipGlass label={tokenForEntry(entry)} side="top">
                    <code
                      className={cn(
                        "block truncate rounded-md border border-border/40 bg-muted/40 px-2 py-1.5 font-mono text-[11px]",
                        (isUnknown || isLiteral) && "border-destructive/60 bg-destructive/10 text-destructive",
                      )}
                    >
                      {isLiteral ? `literal: ${entry.literalValue}` : tokenForEntry(entry)}
                    </code>
                  </TooltipGlass>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeEntry(entry.id)}
                    aria-label="Remover campo"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {hasError && (
                  <ul className="mt-1.5 ml-1 space-y-0.5 text-[11px] text-destructive">
                    {errs.map((msg, idx) => (
                      <li key={idx}>• {msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => addEntry()}
          >
            <Plus className="size-3.5" />
            Adicionar campo
          </Button>
          {customFieldsQuery.isLoading && (
            <span className="text-[10px] text-muted-foreground">
              Carregando campos customizados…
            </span>
          )}
        </div>

        {/* Busca rápida — atalho pra adicionar entries */}
        <FieldQuickSearch
          value={search}
          onChange={setSearch}
          results={searchResults}
          onPick={(opt) =>
            addEntry({
              optionKey: opt.key,
              keyPath: defaultKeyPathFor(opt),
            })
          }
        />

        {/* Preview readonly */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Eye className="size-3.5" />
            <span className="font-semibold uppercase tracking-wider">
              Preview do payload
            </span>
            <span>(somente leitura)</span>
          </div>
          <pre className="max-h-64 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {previewJson}
          </pre>
        </div>
        </TabsContent>
      </Tabs>

      {/* Picker — atalha tokens pra URL, Cabeçalho ou Parâmetros
          (Body usa o construtor visual acima). */}
      <VariablePickerForUrlAndHeaders
        focusLabel={focusLabel}
        options={allOptions}
        onSelect={(token) => insertTokenAt(focusTarget, token)}
      />
    </div>
  );
}

function FieldQuickSearch({
  value,
  onChange,
  results,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  results: WebhookVariableOption[];
  onPick: (opt: WebhookVariableOption) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">Buscar campo</span>
        <span className="text-[11px] text-muted-foreground">
          (clique no resultado para adicionar)
        </span>
      </div>
      <div className="space-y-2 border-t border-border/60 p-3">
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex.: telefone, ctwa, campaign, custom"
          className="w-full rounded-lg border border-border bg-background py-1.5 px-2.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        {value.trim() === "" ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground">
            Digite para buscar entre todos os campos disponíveis.
          </p>
        ) : results.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground">
            Nada encontrado para &quot;{value}&quot;.
          </p>
        ) : (
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {results.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onPick(opt)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
              >
                <span className="mt-0.5 shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {opt.group}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {opt.label}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {opt.token}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VariablePickerForUrlAndHeaders({
  focusLabel,
  options,
  onSelect,
}: {
  focusLabel: string;
  options: WebhookVariableOption[];
  onSelect: (token: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const grouped = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return WEBHOOK_VARIABLE_GROUPS.map((group) => ({
      group,
      items: options.filter(
        (opt) =>
          opt.group === group &&
          (q === "" ||
            opt.label.toLowerCase().includes(q) ||
            opt.token.toLowerCase().includes(q) ||
            (opt.hint?.toLowerCase().includes(q) ?? false)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [search, options]);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Variable className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Variáveis para URL e Headers</span>
          <span className="truncate text-[11px] text-muted-foreground">
            · inserir em <span className="font-mono">{focusLabel}</span>
          </span>
        </div>
        <ChevronDown
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 p-3">
          <div className="relative">
            <Code2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar variável (ex.: ctwa, campaign, telefone)"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {grouped.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              Nada encontrado para &quot;{search}&quot;.
            </p>
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {grouped.map((g) => (
                <div key={g.group}>
                  <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.group}
                  </div>
                  <div className="grid gap-1">
                    {g.items.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelect(opt.token)}
                        className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                      >
                        <code className="mt-0.5 shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow-sm">
                          {opt.token}
                        </code>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground">
                            {opt.label}
                          </span>
                          {opt.hint && (
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {opt.hint}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
