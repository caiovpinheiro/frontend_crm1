"use client";

/**
 * "Revisar com IA": um modelo escolhido aqui lê a ficha do agente, a
 * configuração e (se marcado) os atendimentos recentes e devolve sugestões
 * com a alteração exata. Quem configura escolhe quais aplicar — sempre no
 * rascunho; a versão publicada só muda ao publicar.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconCheck, IconChevronDown, IconLoader2, IconWand } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { IconChip, Pill, SURFACE, Segmented, type Tone } from "./ui";

type Model = { id: string; name: string; provider?: "openai" | "anthropic"; hint?: string };

type Change = { path: string; op: "set" | "add" | "remove"; value?: unknown; before?: unknown };

type Suggestion = {
  id: string;
  titulo: string;
  gravidade: "alta" | "media" | "baixa";
  area: string;
  problema: string;
  evidencia: string;
  correcao: string;
  alteracoes: Change[];
  aplicavel: boolean;
  erro?: string;
  aplicada?: boolean;
};

type Run = {
  id: string;
  status: "running" | "done" | "error";
  params: { model: string; includeTurns: boolean; days: number };
  resumo: string | null;
  suggestions: Suggestion[];
  error: string | null;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
};

const SEVERITY: Record<Suggestion["gravidade"], { label: string; tone: Tone }> = {
  alta: { label: "Alta", tone: "rose" },
  media: { label: "Média", tone: "amber" },
  baixa: { label: "Baixa", tone: "slate" },
};

const OP_LABEL: Record<Change["op"], string> = { set: "trocar", add: "acrescentar", remove: "tirar" };

async function send<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseApiResponse<T>(res, fallback);
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "(vazio)";
  const plainList = Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number");
  const s = typeof v === "string" ? v : plainList ? (v as unknown[]).map((x) => `• ${x}`).join("\n") : JSON.stringify(v, null, 1);
  return s.length > 600 ? `${s.slice(0, 600)}…` : s;
}

export function ConfigReviewCard({
  agentId,
  models,
  defaultModel,
  dirty,
  saving,
  onApplied,
}: {
  agentId: string;
  models: Model[];
  defaultModel: string;
  /** Há alterações na tela ainda não salvas no rascunho. */
  dirty: boolean;
  saving: boolean;
  /** Recarrega a configuração do servidor depois de aplicar. */
  onApplied: () => void;
}) {
  const queryClient = useQueryClient();
  const [model, setModel] = React.useState(() => (models.some((m) => m.id === defaultModel) ? defaultModel : models[0]?.id ?? ""));
  const [includeTurns, setIncludeTurns] = React.useState(true);
  const [days, setDays] = React.useState<"7" | "15" | "30">("7");
  const [runId, setRunId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  const runs = useQuery({
    queryKey: ["ai-agents-v2-review", agentId],
    queryFn: async () => (await parseApiResponse<{ runs: Run[] }>(await apiFetch(`/api/ai-agents-v2/${agentId}/review`), "Erro ao carregar as revisões.")).runs,
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? 4000 : false),
  });
  const list = runs.data ?? [];
  const current = list.find((r) => r.id === runId) ?? list[0] ?? null;
  const running = list.some((r) => r.status === "running");

  // Ao trocar de revisão (ou ela terminar), pré-marca as graves que dá para aplicar.
  const currentKey = current ? `${current.id}:${current.status}` : "";
  const [pickedFor, setPickedFor] = React.useState("");
  if (pickedFor !== currentKey) {
    setPickedFor(currentKey);
    setSelected(
      current?.status === "done"
        ? new Set(current.suggestions.filter((s) => s.aplicavel && !s.aplicada && s.gravidade === "alta").map((s) => s.id))
        : new Set(),
    );
  }

  const start = useMutation({
    mutationFn: () => send<{ runId: string }>(`/api/ai-agents-v2/${agentId}/review`, { model, includeTurns, days: Number(days) }, "Erro ao iniciar a revisão."),
    onSuccess: (r) => {
      setRunId(r.runId);
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-review", agentId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao iniciar a revisão."),
  });

  const apply = useMutation({
    mutationFn: (ids: string[]) =>
      send<{ applied: string[]; failed: Array<{ id: string; erro: string }> }>(`/api/ai-agents-v2/${agentId}/review/${current!.id}/apply`, { suggestionIds: ids }, "Erro ao aplicar."),
    onSuccess: (r) => {
      if (r.applied.length > 0) {
        toast.success(`${r.applied.length} ${r.applied.length === 1 ? "sugestão aplicada" : "sugestões aplicadas"} no rascunho. Teste antes de publicar.`);
        onApplied();
      }
      for (const f of r.failed) toast.error(`${f.id}: ${f.erro}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-review", agentId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao aplicar."),
  });

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const groups: Array<["openai" | "anthropic", string]> = [
    ["openai", "OpenAI"],
    ["anthropic", "Anthropic (Claude)"],
  ];
  const suggestions = current?.status === "done" ? current.suggestions : [];
  const applicable = suggestions.filter((s) => s.aplicavel && !s.aplicada);
  const blockApply = dirty || saving;

  return (
    <section className={cn(SURFACE, "space-y-4 p-5")}>
      <div className="flex items-start gap-3">
        <IconChip icon={IconWand} tone="violet" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight">Revisar com IA</h3>
          <p className="text-[13px] text-muted-foreground">
            Um modelo lê as regras do agente e os atendimentos recentes e sugere ajustes. Você escolhe o que aplicar — só no rascunho.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Modelo que revisa</span>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Escolha o modelo" />
            </SelectTrigger>
            <SelectContent>
              {groups.flatMap(([provider, label]) =>
                models
                  .filter((m) => (m.provider ?? "openai") === provider)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} · {label}
                    </SelectItem>
                  )),
              )}
            </SelectContent>
          </Select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={includeTurns} onChange={(e) => setIncludeTurns(e.target.checked)} className="size-4 accent-primary" />
          Incluir atendimentos dos últimos
        </label>
        <Segmented
          size="sm"
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "7 dias" },
            { value: "15", label: "15 dias" },
            { value: "30", label: "30 dias" },
          ]}
          className={cn(!includeTurns && "pointer-events-none opacity-50")}
        />
        <Button size="sm" className="gap-1.5" disabled={!model || running || start.isPending} onClick={() => start.mutate()}>
          {running || start.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconWand className="size-4" />}
          {running ? "Revisando…" : "Revisar"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Usa a chave do agente (a mesma de Publicação). Modelos maiores revisam melhor e custam mais; a revisão leva de 30 s a 3 min.
      </p>

      {list.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRunId(r.id)}
              className={cn(
                "rounded-lg border px-2 py-1 text-xs",
                r.id === current?.id ? "border-primary bg-primary/5 font-medium" : "border-border text-muted-foreground hover:bg-muted/40",
              )}
            >
              {dateTime(r.createdAt)} · {models.find((m) => m.id === r.params.model)?.name ?? r.params.model}
              {r.status === "running" ? " · em andamento" : r.status === "error" ? " · falhou" : ""}
            </button>
          ))}
        </div>
      )}

      {current?.status === "running" && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" /> Revisando a configuração com {models.find((m) => m.id === current.params.model)?.name ?? current.params.model}…
        </div>
      )}
      {current?.status === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 v2-dark:border-rose-500/30 v2-dark:bg-rose-500/10 v2-dark:text-rose-300">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" /> {current.error ?? "A revisão falhou."}
        </div>
      )}

      {current?.status === "done" && (
        <div className="space-y-3">
          {current.resumo && <p className="rounded-xl bg-slate-50 p-3 text-sm v2-dark:bg-muted/40">{current.resumo}</p>}
          <p className="text-xs text-muted-foreground">
            {suggestions.length} {suggestions.length === 1 ? "sugestão" : "sugestões"} · {applicable.length} com alteração pronta para aplicar
            {current.costUsd > 0 && ` · custo ~US$ ${current.costUsd.toFixed(3).replace(".", ",")}`}
          </p>
          {suggestions.length === 0 && <p className="text-sm text-muted-foreground">O modelo não encontrou ajustes a fazer.</p>}

          <ul className="space-y-2">
            {suggestions.map((s) => {
              const sev = SEVERITY[s.gravidade];
              const expanded = open.has(s.id);
              const canPick = s.aplicavel && !s.aplicada;
              return (
                <li key={s.id} className="rounded-xl border border-border">
                  <div className="flex items-start gap-3 p-3">
                    <input
                      type="checkbox"
                      aria-label={`Aplicar ${s.titulo}`}
                      disabled={!canPick}
                      checked={selected.has(s.id)}
                      onChange={() => setSelected((cur) => toggle(cur, s.id))}
                      className="mt-1 size-4 accent-primary disabled:opacity-40"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{s.id}</span>
                        <span className="text-sm font-medium">{s.titulo}</span>
                        <Pill tone={sev.tone}>{sev.label}</Pill>
                        {s.area && <Pill tone="slate">{s.area}</Pill>}
                        {s.aplicada && (
                          <Pill tone="emerald" icon={IconCheck}>
                            aplicada
                          </Pill>
                        )}
                        {!s.aplicavel && s.alteracoes.length === 0 && <Pill tone="sky">fazer à mão</Pill>}
                        {!s.aplicavel && s.alteracoes.length > 0 && <Pill tone="rose">não aplicável</Pill>}
                      </div>
                      {s.problema && <p className="text-[13px]">{s.problema}</p>}
                      {s.correcao && (
                        <p className="text-[13px] text-muted-foreground">
                          <span className="font-medium text-foreground">Correção: </span>
                          {s.correcao}
                        </p>
                      )}
                      {s.erro && <p className="text-xs text-rose-600 v2-dark:text-rose-300">{s.erro}</p>}
                    </div>
                    {(s.evidencia || s.alteracoes.length > 0) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 gap-1 text-xs"
                        onClick={() => setOpen((cur) => toggle(cur, s.id))}
                        aria-expanded={expanded}
                      >
                        Detalhes <IconChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <div className="space-y-2 border-t border-border p-3 text-xs">
                      {s.evidencia && (
                        <p>
                          <span className="font-medium">Evidência: </span>
                          <span className="text-muted-foreground">{s.evidencia}</span>
                        </p>
                      )}
                      {s.alteracoes.map((a, i) => (
                        <div key={i} className="space-y-1 rounded-lg bg-slate-50 p-2 v2-dark:bg-muted/40">
                          <p className="font-mono text-[11px]">
                            {OP_LABEL[a.op]} · {a.path}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-rose-50 p-1.5 text-[11px] v2-dark:bg-rose-500/10">
                              {show(a.before)}
                            </pre>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-emerald-50 p-1.5 text-[11px] v2-dark:bg-emerald-500/10">
                              {a.op === "remove" && a.value === undefined ? "(remover o item)" : `${a.op === "set" ? "" : a.op === "add" ? "+ " : "− "}${show(a.value)}`}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {applicable.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={selected.size === 0 || blockApply || apply.isPending}
                onClick={() => apply.mutate([...selected])}
                className="gap-1.5"
              >
                {apply.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
                Aplicar {selected.size > 0 ? `${selected.size} ` : ""}no rascunho
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setSelected(selected.size === applicable.length ? new Set() : new Set(applicable.map((s) => s.id)))}
              >
                {selected.size === applicable.length ? "Desmarcar todas" : "Marcar todas"}
              </button>
              <span className="text-xs text-muted-foreground">
                {blockApply ? "Aguarde salvar as alterações da tela." : "A versão publicada não muda; teste e publique depois."}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
