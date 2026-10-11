"use client";

/**
 * Qualidade da resposta: o que saiu para o cliente sem fonte (alucinação)
 * e como o agente lidou com a conversa, medidos depois sobre uma amostra
 * do período. Complementa a Auditoria do motor, que só vê defeitos
 * objetivos do rastro. A análise roda em segundo plano; o que já foi
 * conferido não é pago de novo.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconExternalLink, IconLoader2, IconMessageExclamation, IconPlayerPlay } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, Pill, SURFACE, Segmented, type Tone } from "./ui";

type ClaimKind = "contato" | "valor" | "prazo" | "procedimento" | "outro";
type HandlingCategory = "nao_respondeu" | "pediu_dado_ja_informado" | "assumiu" | "contradisse" | "insistiu" | "tom";
type LiveCheck = "model" | "rules" | "none";

type QualityResult = {
  claims: {
    eligible: number;
    checked: number;
    notChecked: number;
    withUnsupported: number;
    rate: number;
    byTheme: Array<{ theme: string; checked: number; flagged: number }>;
    byKind: Record<ClaimKind, number>;
    byLiveCheck: Record<LiveCheck, { checked: number; flagged: number }>;
    examples: Array<{ conversationId: string; number: number | null; at: string; theme: string; kind: ClaimKind; claim: string; liveCheck: LiveCheck }>;
  };
  handling: {
    eligible: number;
    reviewed: number;
    notReviewed: number;
    withIssue: number;
    rate: number;
    byCategory: Record<HandlingCategory, number>;
    examples: Array<{ conversationId: string; number: number | null; category: HandlingCategory; excerpt: string; why: string }>;
  };
};

type Run = {
  id: string;
  status: "running" | "done" | "error";
  params: { from: string; to: string; claimSample: number; handlingSample: number };
  progress: { done: number; total: number; stage: "claims" | "handling" | "done" };
  result: QualityResult | null;
  error: string | null;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
};

type Estimate = { turns: number; conversations: number; claimItems: number; handlingItems: number; cached: number; costUsd: number };

const KIND: Record<ClaimKind, { label: string; tone: Tone }> = {
  contato: { label: "Contato (e-mail, telefone, link)", tone: "rose" },
  valor: { label: "Valor", tone: "orange" },
  prazo: { label: "Prazo ou data", tone: "amber" },
  procedimento: { label: "Passo a passo", tone: "violet" },
  outro: { label: "Outro", tone: "slate" },
};

const CATEGORY: Record<HandlingCategory, { label: string; tone: Tone }> = {
  nao_respondeu: { label: "Não respondeu o que foi perguntado", tone: "rose" },
  pediu_dado_ja_informado: { label: "Pediu dado já informado", tone: "orange" },
  assumiu: { label: "Assumiu algo não dito", tone: "orange" },
  contradisse: { label: "Contradisse o que disse antes", tone: "amber" },
  insistiu: { label: "Insistiu sem mudar de caminho", tone: "amber" },
  tom: { label: "Tom inadequado", tone: "violet" },
};

const SIZES = {
  rapida: { label: "Rápida", claimSample: 100, handlingSample: 30 },
  padrao: { label: "Padrão", claimSample: 300, handlingSample: 60 },
  ampla: { label: "Ampla", claimSample: 600, handlingSample: 150 },
} as const;
type Size = keyof typeof SIZES;
type Period = "7" | "15" | "30";

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function range(period: Period): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - (Number(period) - 1));
  return { from: isoDay(from), to: isoDay(today) };
}
function br(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}
function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${(Math.round((n / d) * 1000) / 10).toString().replace(".", ",")}%`;
}
function usd(v: number): string {
  return v < 0.01 ? "menos de US$ 0,01" : `≈ US$ ${v.toFixed(2).replace(".", ",")}`;
}

async function send<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseApiResponse<T>(res, fallback);
}

function Ticket({ number }: { number: number | null }) {
  return (
    <a href={`/inbox?c=${number ?? ""}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline">
      Conversa {number ?? "—"} <IconExternalLink className="size-3.5" />
    </a>
  );
}

export function ReplyQuality({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = React.useState<Period>("7");
  const [size, setSize] = React.useState<Size>("padrao");
  const [kindFilter, setKindFilter] = React.useState<ClaimKind | "all">("all");
  const [catFilter, setCatFilter] = React.useState<HandlingCategory | "all">("all");
  const r = range(period);
  const sample = SIZES[size];

  const runs = useQuery({
    queryKey: ["ai-agents-v2-quality", agentId],
    queryFn: () => apiFetch(`/api/ai-agents-v2/${agentId}/audit/quality`).then((res) => parseApiResponse<{ runs: Run[] }>(res, "Erro ao carregar as análises.")),
    refetchInterval: (q) => ((q.state.data?.runs ?? []).some((x) => x.status === "running") ? 4000 : false),
  });
  const estimateKey = `from=${r.from}&to=${r.to}&claimSample=${sample.claimSample}&handlingSample=${sample.handlingSample}`;
  const estimate = useQuery({
    queryKey: ["ai-agents-v2-quality-estimate", agentId, estimateKey],
    queryFn: () => apiFetch(`/api/ai-agents-v2/${agentId}/audit/quality/estimate?${estimateKey}`).then((res) => parseApiResponse<Estimate>(res, "Erro ao estimar.")),
    placeholderData: (prev) => prev,
  });
  const start = useMutation({
    mutationFn: () => send<{ runId: string }>(`/api/ai-agents-v2/${agentId}/audit/quality`, { ...r, claimSample: sample.claimSample, handlingSample: sample.handlingSample }, "Erro ao iniciar a análise."),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-quality", agentId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao iniciar a análise."),
  });

  const list = runs.data?.runs ?? [];
  const running = list.find((x) => x.status === "running") ?? null;
  const shown = list.find((x) => x.status === "done") ?? null;
  const lastError = list[0]?.status === "error" ? list[0] : null;
  const est = estimate.data;
  const res = shown?.result ?? null;

  const claimExamples = (res?.claims.examples ?? []).filter((e) => kindFilter === "all" || e.kind === kindFilter);
  const handlingExamples = (res?.handling.examples ?? []).filter((e) => catFilter === "all" || e.category === catFilter);
  const live = res?.claims.byLiveCheck;

  return (
    <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
      <BlockHeader
        icon={IconMessageExclamation}
        tone="violet"
        title="Qualidade da resposta"
        description="O que saiu para o cliente sem estar nos materiais e como o agente conduziu a conversa — numa amostra do período, conferida por um modelo. É estimativa: confira os exemplos."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
        <Segmented value={period} onChange={setPeriod} size="sm" options={[{ value: "7", label: "7 dias" }, { value: "15", label: "15 dias" }, { value: "30", label: "30 dias" }]} />
        <Segmented value={size} onChange={setSize} size="sm" options={(Object.keys(SIZES) as Size[]).map((k) => ({ value: k, label: SIZES[k].label }))} />
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          {est ? (
            <>
              {br(r.from)} a {br(r.to)}: {est.turns} resposta{est.turns === 1 ? "" : "s"} do modelo em {est.conversations} conversa{est.conversations === 1 ? "" : "s"}. Confere {est.claimItems} respostas e {est.handlingItems} conversas
              {est.cached > 0 ? ` (${est.cached} já conferidas antes, sem custo)` : ""} · {usd(est.costUsd)}
            </>
          ) : estimate.isError ? (
            <span className="text-destructive">{(estimate.error as Error).message}</span>
          ) : (
            "Calculando o tamanho do período…"
          )}
        </div>
        <Button className="h-9 gap-1.5" disabled={!!running || start.isPending || !est || est.turns === 0} onClick={() => start.mutate()}>
          {running || start.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlayerPlay className="size-4" />}
          Analisar período
        </Button>
      </div>

      {running && (
        <div className="space-y-1.5 rounded-xl border border-border p-3 text-sm">
          <div className="flex items-center gap-2">
            <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
            {running.progress.stage === "handling" ? "Avaliando como o agente conduziu as conversas…" : "Conferindo as respostas com os materiais…"}
            <span className="tabular-nums text-muted-foreground">
              {running.progress.done}/{running.progress.total || "…"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 v2-dark:bg-muted">
            <div className="h-full bg-violet-500 transition-all" style={{ width: `${running.progress.total ? Math.round((running.progress.done / running.progress.total) * 100) : 3}%` }} />
          </div>
        </div>
      )}
      {lastError && !running && <p className="text-sm text-destructive">{lastError.error ?? "A análise falhou."}</p>}
      {runs.isError && <p className="text-sm text-destructive">{(runs.error as Error).message}</p>}
      {runs.isLoading && <Skeleton className="h-24 w-full" />}
      {!runs.isLoading && !shown && !running && <p className="text-sm text-muted-foreground">Nenhuma análise ainda. Escolha o período e clique em Analisar período.</p>}

      {shown && res && (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Análise de {br(shown.params.from)} a {br(shown.params.to)}, feita em {dateTime(shown.createdAt)} · custo {usd(shown.costUsd)}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Respostas com afirmação sem fonte</div>
              <div className={cn("mt-1 text-3xl font-semibold tabular-nums", res.claims.rate === 0 ? "text-emerald-600" : res.claims.rate < 5 ? "text-amber-600" : "text-rose-600")}>
                {pct(res.claims.withUnsupported, res.claims.checked)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {res.claims.withUnsupported} de {res.claims.checked} conferidas ({res.claims.eligible} no período){res.claims.notChecked > 0 ? ` · ${res.claims.notChecked} sem conferência (falha do modelo)` : ""}
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Conversas com problema na condução</div>
              <div className={cn("mt-1 text-3xl font-semibold tabular-nums", res.handling.rate === 0 ? "text-emerald-600" : res.handling.rate < 10 ? "text-amber-600" : "text-rose-600")}>
                {pct(res.handling.withIssue, res.handling.reviewed)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {res.handling.withIssue} de {res.handling.reviewed} avaliadas ({res.handling.eligible} no período)
              </div>
            </div>
          </div>

          {live && (live.rules.checked > 0 || live.model.checked > 0) && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground v2-dark:bg-muted">
              Com a checagem por modelo ligada no atendimento: {pct(live.model.flagged, live.model.checked)} das respostas ainda tinham afirmação sem fonte ({live.model.checked} conferidas). Só com as regras fixas: {pct(live.rules.flagged, live.rules.checked)} ({live.rules.checked} conferidas).
            </p>
          )}

          {res.claims.checked > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Afirmações sem fonte</h4>
              {res.claims.byTheme.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-muted-foreground v2-dark:bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Assunto</th>
                        <th className="px-3 py-2 text-right font-medium">Conferidas</th>
                        <th className="px-3 py-2 text-right font-medium">Com afirmação sem fonte</th>
                        <th className="px-3 py-2 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {res.claims.byTheme.slice(0, 20).map((t) => (
                        <tr key={t.theme}>
                          <td className="px-3 py-1.5">{t.theme}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.checked}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.flagged}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{pct(t.flagged, t.checked)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setKindFilter("all")} className={cn("rounded-full px-2.5 py-1 text-xs ring-1", kindFilter === "all" ? "bg-foreground text-background ring-foreground" : "bg-white ring-border v2-dark:bg-card")}>
                  Todas
                </button>
                {(Object.keys(KIND) as ClaimKind[])
                  .filter((k) => res.claims.byKind[k] > 0)
                  .map((k) => (
                    <button key={k} type="button" onClick={() => setKindFilter(kindFilter === k ? "all" : k)} className={cn("rounded-full", kindFilter === k && "ring-2 ring-offset-1 ring-foreground/40")}>
                      <Pill tone={KIND[k].tone}>
                        {KIND[k].label} · {res.claims.byKind[k]}
                      </Pill>
                    </button>
                  ))}
              </div>
              {claimExamples.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {claimExamples.map((e, i) => (
                    <li key={`${e.conversationId}-${i}`} className="space-y-1 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Ticket number={e.number} />
                        <span className="text-muted-foreground">{dateTime(e.at)}</span>
                        <span className="text-muted-foreground">{e.theme}</span>
                        <Pill tone={KIND[e.kind].tone}>{KIND[e.kind].label}</Pill>
                        {e.liveCheck === "rules" && <Pill tone="slate">checagem por modelo desligada</Pill>}
                      </div>
                      <p className="text-foreground/90">“{e.claim}”</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {res.handling.reviewed > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Condução da conversa</h4>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setCatFilter("all")} className={cn("rounded-full px-2.5 py-1 text-xs ring-1", catFilter === "all" ? "bg-foreground text-background ring-foreground" : "bg-white ring-border v2-dark:bg-card")}>
                  Todas
                </button>
                {(Object.keys(CATEGORY) as HandlingCategory[])
                  .filter((c) => res.handling.byCategory[c] > 0)
                  .sort((a, b) => res.handling.byCategory[b] - res.handling.byCategory[a])
                  .map((c) => (
                    <button key={c} type="button" onClick={() => setCatFilter(catFilter === c ? "all" : c)} className={cn("rounded-full", catFilter === c && "ring-2 ring-offset-1 ring-foreground/40")}>
                      <Pill tone={CATEGORY[c].tone}>
                        {CATEGORY[c].label} · {res.handling.byCategory[c]}
                      </Pill>
                    </button>
                  ))}
              </div>
              {handlingExamples.length > 0 ? (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {handlingExamples.map((e, i) => (
                    <li key={`${e.conversationId}-${i}`} className="space-y-1 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Ticket number={e.number} />
                        <Pill tone={CATEGORY[e.category].tone}>{CATEGORY[e.category].label}</Pill>
                      </div>
                      {e.excerpt && <p className="text-foreground/90">“{e.excerpt}”</p>}
                      {e.why && <p className="text-xs text-muted-foreground">{e.why}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum problema de condução nas conversas avaliadas.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
