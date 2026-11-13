"use client";

/**
 * Escolha do modelo do agente: lista por provedor (fixos do CRM + os que o
 * botão "Atualizar modelos" descobriu), com preço, aviso de preço
 * desconhecido e edição do preço pelo admin. A consulta aos provedores sai
 * do servidor com a chave gravada; nada de chave passa por aqui.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconCheck, IconLoader2, IconPencil, IconRefresh } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  PROVIDER_LABEL,
  formatPrice,
  lastRefreshLabel,
  modelCostNotice,
  modelPriceLabel,
  refreshSummaryLines,
  type CatalogModelOption,
  type LastRefresh,
  type ModelProvider,
  type RefreshResult,
} from "./model-catalog-ui";
import { Pill } from "./ui";

/** Texto de aviso (preço desconhecido, provedor com erro). */
const WARN_TEXT = "text-amber-700 v2-dark:text-amber-400";
const OK_TEXT = "text-emerald-700 v2-dark:text-emerald-400";

type CatalogResponse = { models: CatalogModelOption[]; lastRefresh: LastRefresh | null; canManage?: boolean };

const CATALOGS_KEY = ["ai-agents-v2-catalogs"];
const MODELS_KEY = ["ai-agents-v2-models"];

async function fetchModelCatalog(): Promise<CatalogResponse> {
  const res = await apiFetch("/api/ai-agents-v2/models");
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
  const catalog = useQuery({ queryKey: MODELS_KEY, queryFn: fetchModelCatalog, staleTime: 60_000 });
  const canManage = Boolean(catalog.data?.canManage);
  const [summary, setSummary] = React.useState<Array<{ ok: boolean; text: string }>>([]);
  const [editing, setEditing] = React.useState<CatalogModelOption | null>(null);

  const refresh = useMutation({
    mutationFn: () => refreshModels(agentId),
    onSuccess: (data) => {
      queryClient.setQueryData(MODELS_KEY, { models: data.models, lastRefresh: data.lastRefresh, canManage: true });
      void queryClient.invalidateQueries({ queryKey: CATALOGS_KEY });
      const names = new Map(data.models.map((m) => [m.id, m.name]));
      const lines = refreshSummaryLines(data.result, names);
      setSummary(lines);
      if (lines.every((l) => l.ok)) toast.success("Lista de modelos atualizada.");
      else toast.warning("Lista atualizada em parte. Veja o aviso abaixo.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível atualizar os modelos."),
  });

  const groups: Array<[ModelProvider, string]> = [
    ["openai", "OpenAI"],
    ["anthropic", "Anthropic (Claude)"],
  ];
  const selected = models.find((m) => m.id === value);
  const notice = modelCostNotice(selected);
  const lastSummary = summary.length ? summary : refreshSummaryLines(catalog.data?.lastRefresh?.result).filter((l) => !l.ok);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {catalog.isLoading ? "Carregando…" : lastRefreshLabel(catalog.data?.lastRefresh)}
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

      {groups.map(([provider, label]) => {
        const list = models.filter((m) => (m.provider ?? "openai") === provider);
        if (list.length === 0) return null;
        return (
          <div key={provider} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div role="radiogroup" aria-label={`Modelos ${label}`} className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
              {list.map((m) => {
                const on = m.id === value;
                const price = modelPriceLabel(m);
                const unknown = m.priceSource === "unknown";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 transition-colors",
                      on ? "bg-blue-50/70 v2-dark:bg-primary/10" : "hover:bg-slate-50 v2-dark:hover:bg-muted/40",
                    )}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="radio" name="agent-model" checked={on} onChange={() => onChange(m.id)} className="peer sr-only" />
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border-2 bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 v2-dark:bg-card",
                          on ? "border-primary" : "border-slate-300 v2-dark:border-border",
                        )}
                      >
                        {on && <span className="size-2 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("text-sm", on ? "font-semibold" : "font-medium")}>{m.name}</span>
                          {m.source === "discovered" && !m.missing && <Pill tone="emerald">Novo</Pill>}
                          {m.missing && (
                            <Pill tone="amber" title="Na última atualização, o provedor não listou este modelo. Ele pode ter sido aposentado ou a chave não tem acesso.">
                              Fora da lista do provedor
                            </Pill>
                          )}
                        </span>
                        {m.hint && <span className="block text-xs text-muted-foreground">{m.hint}</span>}
                        <span className="block font-mono text-[10px] text-muted-foreground/80">{m.id}</span>
                      </span>
                    </label>
                    {price && (
                      <span
                        className={cn("shrink-0 text-right text-xs tabular-nums", unknown ? WARN_TEXT : "text-muted-foreground")}
                        title={
                          unknown
                            ? "A API do provedor não informa preço. Até alguém preencher, o gasto é estimado pelo preço mais caro do provedor."
                            : m.priceSource === "org"
                              ? "Preço informado pela organização (US$ por 1 milhão de tokens: entrada / saída)"
                              : "US$ por 1 milhão de tokens: entrada / saída"
                        }
                      >
                        {price}
                        {m.priceSource === "org" && <span className="block text-[10px]">informado pela organização</span>}
                      </span>
                    )}
                    {canManage && (
                      <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Editar preço de ${m.name}`} onClick={() => setEditing(m)}>
                        <IconPencil className="size-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {notice && (
        <p className={cn("flex items-start gap-1.5 text-xs", WARN_TEXT)}>
          <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {notice}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Preço em US$ por 1 milhão de tokens (entrada / saída). A lista dos provedores não traz preço: modelo novo aparece como “Preço desconhecido” até o admin preencher.
      </p>
      {editing && (
        <PriceDialog
          model={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            queryClient.setQueryData<CatalogResponse | undefined>(MODELS_KEY, (old) => (old ? { ...old, models: next } : old));
            void queryClient.invalidateQueries({ queryKey: CATALOGS_KEY });
            setEditing(null);
          }}
        />
      )}
    </div>
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
            organização. Deixe os dois vazios para voltar {model.source === "builtin" ? "ao preço da tabela do CRM" : "a “preço desconhecido”"}.
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
