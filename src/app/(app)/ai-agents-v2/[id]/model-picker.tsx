"use client";

/**
 * Escolha do modelo do agente: o modelo em uso fica à vista e a troca é um
 * seletor compacto com busca (a lista cresce com o "Atualizar modelos"),
 * agrupado por provedor e do mais novo ao mais antigo. Cada modelo mostra
 * preço e, com histórico, o custo estimado por conversa deste agente. A
 * consulta aos provedores sai do servidor com a chave gravada; nada de
 * chave passa por aqui.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconCheck, IconChevronDown, IconLoader2, IconPencil, IconRefresh } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  PROVIDER_LABEL,
  conversationCostLabel,
  priceSourceLabel,
  filterModels,
  formatPrice,
  lastRefreshLabel,
  modelCostNotice,
  modelPriceLabel,
  refreshSummaryLines,
  usageBasisLabel,
  type AgentTokenUsage,
  type CatalogModelOption,
  type LastRefresh,
  type ModelProvider,
  type RefreshResult,
} from "./model-catalog-ui";
import { Pill } from "./ui";

/** Texto de aviso (preço desconhecido, provedor com erro). */
const WARN_TEXT = "text-amber-700 v2-dark:text-amber-400";
const OK_TEXT = "text-emerald-700 v2-dark:text-emerald-400";

type CatalogResponse = { models: CatalogModelOption[]; lastRefresh: LastRefresh | null; canManage?: boolean; usage?: AgentTokenUsage | null };

const CATALOGS_KEY = ["ai-agents-v2-catalogs"];
const MODELS_KEY = "ai-agents-v2-models";

async function fetchModelCatalog(agentId?: string): Promise<CatalogResponse> {
  const res = await apiFetch(`/api/ai-agents-v2/models${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ""}`);
  return parseApiResponse<CatalogResponse>(res, "Erro ao carregar os modelos.");
}

async function refreshModels(agentId?: string): Promise<CatalogResponse & { result: RefreshResult }> {
  const res = await apiFetch("/api/ai-agents-v2/models/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agentId ? { agentId } : {}),
  });
  return parseApiResponse<CatalogResponse & { result: RefreshResult }>(res, "Não foi possível atualizar os modelos.");
}

async function saveModelPrice(body: { modelId: string; inputPer1M: string; outputPer1M: string }): Promise<{ models: CatalogModelOption[] }> {
  const res = await apiFetch("/api/ai-agents-v2/models/price", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ models: CatalogModelOption[] }>(res, "Erro ao salvar o preço.");
}

const GROUPS: Array<[ModelProvider, string]> = [
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic (Claude)"],
];

export function ModelPicker({
  value,
  models,
  agentId,
  onChange,
}: {
  value: string;
  models: CatalogModelOption[];
  agentId?: string;
  onChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const modelsKey = [MODELS_KEY, agentId ?? ""];
  const catalog = useQuery({ queryKey: modelsKey, queryFn: () => fetchModelCatalog(agentId), staleTime: 60_000 });
  const canManage = Boolean(catalog.data?.canManage);
  const usage = catalog.data?.usage ?? null;
  const [summary, setSummary] = React.useState<Array<{ ok: boolean; text: string }>>([]);
  const [editing, setEditing] = React.useState<CatalogModelOption | null>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const refresh = useMutation({
    mutationFn: () => refreshModels(agentId),
    onSuccess: (data) => {
      queryClient.setQueryData<CatalogResponse>(modelsKey, (old) => ({ ...old, models: data.models, lastRefresh: data.lastRefresh, canManage: true }));
      void queryClient.invalidateQueries({ queryKey: CATALOGS_KEY });
      const names = new Map(data.models.map((m) => [m.id, m.name]));
      const lines = refreshSummaryLines(data.result, names);
      setSummary(lines);
      if (lines.every((l) => l.ok)) toast.success("Lista de modelos atualizada.");
      else toast.warning("Lista atualizada em parte. Veja o aviso abaixo.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível atualizar os modelos."),
  });

  const selected = models.find((m) => m.id === value);
  const notice = modelCostNotice(selected);
  const lastSummary = summary.length ? summary : refreshSummaryLines(catalog.data?.lastRefresh?.result).filter((l) => !l.ok);
  const visible = filterModels(models, query);
  const selectedCost = selected ? conversationCostLabel(selected, usage) : "";

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  const editPrice = (m: CatalogModelOption) => {
    setOpen(false);
    setEditing(m);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border px-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modelo em uso</p>
          {selected ? (
            <>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                {selected.name}
                <span className="font-mono text-[11px] font-normal text-muted-foreground">{selected.id}</span>
                <ModelBadges m={selected} />
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {PROVIDER_LABEL[selected.provider ?? "openai"]} · {modelPriceLabel(selected) || "—"}
                {selected.priceSource !== "unknown" && ` por 1M tokens (entrada / saída), ${priceSourceLabel(selected)}`}
                {selectedCost && ` · ${selectedCost}`}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">{value ? `${value} (fora da lista)` : "Nenhum modelo escolhido"}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canManage && selected && (
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setEditing(selected)}>
              <IconPencil className="size-3.5" /> Preço
            </Button>
          )}
          <DropdownMenu
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setQuery("");
            }}
          >
            <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
              Trocar modelo <IconChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[min(560px,calc(100vw-32px))] p-0">
              <div className="border-b border-border p-2">
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && visible[0]) {
                      e.preventDefault();
                      pick(visible[0].id);
                    }
                  }}
                  placeholder={`Buscar entre ${models.length} modelos (nome ou id)`}
                  aria-label="Buscar modelo"
                  className="h-9"
                />
              </div>
              <div className="max-h-[min(420px,60vh)] overflow-y-auto p-1">
                {visible.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhum modelo com “{query.trim()}”.</p>}
                {GROUPS.map(([provider, label]) => {
                  const list = visible.filter((m) => (m.provider ?? "openai") === provider);
                  if (list.length === 0) return null;
                  return (
                    <div key={provider} role="group" aria-label={label}>
                      <DropdownMenuLabel className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {label} · {list.length}
                      </DropdownMenuLabel>
                      {list.map((m) => (
                        <ModelOption key={m.id} m={m} on={m.id === value} usage={usage} canManage={canManage} onPick={pick} onEditPrice={editPrice} />
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                Preço em US$ por 1 milhão de tokens (entrada / saída). {usageBasisLabel(usage)}
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {notice && (
        <p className={cn("flex items-start gap-1.5 text-xs", WARN_TEXT)}>
          <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {catalog.isLoading ? "Carregando…" : `${models.length} modelos na lista. ${lastRefreshLabel(catalog.data?.lastRefresh)}`}
        </p>
        {canManage && (
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />}
            Atualizar modelos
          </Button>
        )}
      </div>
      {lastSummary.length > 0 && (
        <ul className="space-y-1 rounded-xl border px-3 py-2 text-xs">
          {lastSummary.map((l) => (
            <li key={l.text} className={cn("flex items-start gap-1.5", l.ok ? OK_TEXT : WARN_TEXT)}>
              {l.ok ? <IconCheck className="mt-0.5 size-3.5 shrink-0" /> : <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />}
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PriceDialog
          model={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            queryClient.setQueryData<CatalogResponse | undefined>(modelsKey, (old) => (old ? { ...old, models: next } : old));
            void queryClient.invalidateQueries({ queryKey: CATALOGS_KEY });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ModelOption({
  m,
  on,
  usage,
  canManage,
  onPick,
  onEditPrice,
}: {
  m: CatalogModelOption;
  on: boolean;
  usage: AgentTokenUsage | null;
  canManage: boolean;
  onPick: (id: string) => void;
  onEditPrice: (m: CatalogModelOption) => void;
}) {
  const cost = conversationCostLabel(m, usage);
  const edit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEditPrice(m);
  };
  return (
    <DropdownMenuItem onClick={() => onPick(m.id)} aria-current={on ? "true" : undefined} className="items-start gap-2 py-2">
      <IconCheck className={cn("mt-0.5 size-4 shrink-0", on ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn("text-sm", on ? "font-semibold" : "font-medium")}>{m.name}</span>
          <ModelBadges m={m} />
        </span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">{m.id}</span>
      </span>
      <span className="shrink-0 text-right text-xs tabular-nums">
        <span
          className={cn("block", m.priceSource === "unknown" ? WARN_TEXT : "text-muted-foreground")}
          title={m.priceSource === "unknown" ? "A página de preços do provedor não lista este modelo." : priceSourceLabel(m)}
        >
          {modelPriceLabel(m) || "—"}
        </span>
        {cost && <span className="block text-[11px] text-muted-foreground">{cost}</span>}
      </span>
      {canManage && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Editar preço de ${m.name}`}
          title="Editar preço"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={edit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") edit(e);
          }}
        >
          <IconPencil className="size-3.5" />
        </span>
      )}
    </DropdownMenuItem>
  );
}

function ModelBadges({ m }: { m: CatalogModelOption }) {
  return (
    <>
      {m.source === "discovered" && !m.missing && <Pill tone="emerald">Novo</Pill>}
      {m.missing && (
        <Pill tone="amber" title="Na última atualização, o provedor não listou este modelo. Ele pode ter sido aposentado ou a chave não tem acesso.">
          Fora da lista do provedor
        </Pill>
      )}
    </>
  );
}

function PriceDialog({ model, onClose, onSaved }: { model: CatalogModelOption; onClose: () => void; onSaved: (models: CatalogModelOption[]) => void }) {
  const [input, setInput] = React.useState(model.inputPer1M != null ? String(model.inputPer1M) : "");
  const [output, setOutput] = React.useState(model.outputPer1M != null ? String(model.outputPer1M) : "");
  const save = useMutation({
    mutationFn: (body: { inputPer1M: string; outputPer1M: string }) => saveModelPrice({ modelId: model.id, ...body }),
    onSuccess: (data) => {
      toast.success("Preço salvo.");
      onSaved(data.models);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao salvar o preço."),
  });
  const provider = PROVIDER_LABEL[model.provider ?? "openai"];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preço de {model.name}</DialogTitle>
          <DialogDescription>
            US$ por 1 milhão de tokens, como na página de preços da {provider}. Vale para a estimativa de gasto e o limite de gasto de todos os agentes da
            organização e vence o preço oficial. Deixe os dois vazios para voltar ao preço oficial lido no “Atualizar modelos”
            {model.source === "builtin" ? " (ou à tabela do CRM)" : " (ou a “preço desconhecido”)"}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ inputPer1M: input.trim(), outputPer1M: output.trim() });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Entrada</span>
              <Input inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex.: 1" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Saída</span>
              <Input inputMode="decimal" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="Ex.: 5" />
            </label>
          </div>
          {model.priceSource === "unknown" && (
            <p className="text-xs text-muted-foreground">
              Hoje a estimativa usa US$ {formatPrice(model.estimateInputPer1M)} / {formatPrice(model.estimateOutputPer1M)} (o mais caro do provedor).
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending} className="gap-1">
              {save.isPending && <IconLoader2 className="size-4 animate-spin" />}
              Salvar preço
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
