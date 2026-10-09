"use client";

/**
 * Auditoria do motor: defeitos objetivos por conversa, medidos do rastro
 * (sem resposta, transferência sem aviso, cadeia/ping-pong, duplicadas,
 * fluxo em cima do agente, canal errado…) e o índice do motor — conversas
 * sem defeito sobre conversas atendidas. Meta: 100%.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { IconExternalLink, IconShieldCheck } from "@tabler/icons-react";

import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, Pill, SURFACE, Segmented, type Tone } from "./ui";

type Flag =
  | "sem_resposta"
  | "resposta_descartada"
  | "transferencia_muda"
  | "transferencia_em_cadeia"
  | "ping_pong"
  | "apresentacao_apos_transferencia"
  | "resposta_duplicada"
  | "pergunta_repetida"
  | "fluxo_em_cima_do_agente"
  | "canal_errado"
  | "ia_apos_pessoa"
  | "erro_no_turno";

type AuditData = {
  from: string;
  to: string;
  turns: number;
  truncated: boolean;
  conversations: number;
  withDefects: number;
  engineIndex: number;
  byFlag: Partial<Record<Flag, number>>;
  items: Array<{ conversationId: string; number: number | null; contactName: string | null; findings: Array<{ flag: Flag; at: string; detail: string }> }>;
};

const FLAG: Record<Flag, { label: string; what: string; tone: Tone }> = {
  sem_resposta: { label: "Sem resposta", what: "O cliente escreveu, o turno rodou e nada saiu, sem motivo legítimo.", tone: "rose" },
  resposta_descartada: { label: "Resposta descartada", what: "A resposta foi descartada por mensagem nova e o turno seguinte não cobriu.", tone: "rose" },
  transferencia_muda: { label: "Transferência sem aviso", what: "Transferiu e o cliente não recebeu aviso.", tone: "orange" },
  transferencia_em_cadeia: { label: "Transferência em cadeia", what: "Duas transferências em menos de 3 min sem resposta no meio.", tone: "orange" },
  ping_pong: { label: "Ping-pong entre agentes", what: "Devolveu a conversa ao agente que acabou de passá-la.", tone: "orange" },
  apresentacao_apos_transferencia: { label: "Apresentação após transferência", what: "Boas-vindas ou confirmação de cadastro em vez de responder.", tone: "amber" },
  resposta_duplicada: { label: "Resposta duplicada", what: "Duas mensagens quase iguais em menos de 90 s.", tone: "amber" },
  pergunta_repetida: { label: "Pergunta repetida", what: "A mesma pergunta duas vezes seguidas.", tone: "amber" },
  fluxo_em_cima_do_agente: { label: "Fluxo em cima do agente", what: "Um fluxo de automação falou numa conversa do agente.", tone: "violet" },
  canal_errado: { label: "Envio por outro canal", what: "Mensagem por um canal diferente do da conversa.", tone: "violet" },
  ia_apos_pessoa: { label: "IA depois de pessoa", what: "Ticket até 60 min depois de atendimento de pessoa foi para a IA.", tone: "sky" },
  erro_no_turno: { label: "Erro no turno", what: "O turno terminou com erro do motor.", tone: "slate" },
};

type Period = "today" | "7" | "30";

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function range(period: Period): { from: string; to: string } {
  const today = new Date();
  if (period === "today") return { from: isoDay(today), to: isoDay(today) };
  const from = new Date(today);
  from.setDate(from.getDate() - (Number(period) - 1));
  return { from: isoDay(from), to: isoDay(today) };
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function EngineAudit({ agentId }: { agentId: string }) {
  const [period, setPeriod] = React.useState<Period>("today");
  const [only, setOnly] = React.useState<Flag | "all">("all");
  const r = range(period);
  const key = `from=${r.from}&to=${r.to}`;
  const q = useQuery({
    queryKey: ["ai-agents-v2-audit", agentId, key],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/audit?${key}`);
      return parseApiResponse<AuditData>(res, "Erro ao carregar a auditoria.");
    },
    placeholderData: (prev) => prev,
  });
  const data = q.data;
  const flags = (Object.keys(FLAG) as Flag[]).map((f) => ({ f, n: data?.byFlag[f] ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const items = (data?.items ?? []).filter((it) => only === "all" || it.findings.some((f) => f.flag === only));
  const index = data?.engineIndex ?? null;
  const indexTone = index === null ? "text-muted-foreground" : index >= 99.5 ? "text-emerald-600" : index >= 90 ? "text-amber-600" : "text-rose-600";

  return (
    <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
      <BlockHeader
        icon={IconShieldCheck}
        tone="emerald"
        title="Auditoria do motor"
        description="O que o motor fez de errado, medido do rastro de cada conversa — sem depender de alguém reparar. Meta: 100%."
        actions={
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: "today", label: "Hoje" },
              { value: "7", label: "7 dias" },
              { value: "30", label: "30 dias" },
            ]}
            size="sm"
          />
        }
      />

      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!data && !q.isError && <Skeleton className="h-24 w-full" />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Índice do motor</div>
              <div className={cn("mt-1 text-3xl font-semibold tabular-nums", indexTone)}>{index === null ? "—" : `${index.toFixed(1).replace(".0", "")}%`}</div>
              <div className="mt-1 text-xs text-muted-foreground">conversas sem defeito do motor</div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Conversas atendidas</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{data.conversations}</div>
              <div className="mt-1 text-xs text-muted-foreground">{data.turns} turno{data.turns === 1 ? "" : "s"}{data.truncated ? " (período truncado)" : ""}</div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Com defeito</div>
              <div className={cn("mt-1 text-3xl font-semibold tabular-nums", data.withDefects > 0 ? "text-rose-600" : "text-emerald-600")}>{data.withDefects}</div>
              <div className="mt-1 text-xs text-muted-foreground">{flags.length === 0 ? "nenhum defeito no período" : `${flags.length} tipo${flags.length === 1 ? "" : "s"} de defeito`}</div>
            </div>
          </div>

          {flags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setOnly("all")} className={cn("rounded-full px-2.5 py-1 text-xs ring-1", only === "all" ? "bg-foreground text-background ring-foreground" : "bg-white text-muted-foreground ring-border v2-dark:bg-card")}>
                Todas
              </button>
              {flags.map(({ f, n }) => (
                <button key={f} type="button" onClick={() => setOnly(only === f ? "all" : f)} title={FLAG[f].what} className={cn("rounded-full", only === f && "ring-2 ring-offset-1 ring-foreground/40")}>
                  <Pill tone={FLAG[f].tone}>{FLAG[f].label} · {n}</Pill>
                </button>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {items.slice(0, 100).map((it) => (
                <li key={it.conversationId} className="space-y-1.5 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <a href={`/inbox?c=${it.number ?? ""}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                      Conversa {it.number ?? "—"} <IconExternalLink className="size-3.5" />
                    </a>
                    {it.contactName && <span className="text-muted-foreground">{it.contactName}</span>}
                  </div>
                  <ul className="space-y-1">
                    {it.findings.map((f, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                        <Pill tone={FLAG[f.flag].tone}>{FLAG[f.flag].label}</Pill>
                        <span className="text-muted-foreground">{hhmm(f.at)}</span>
                        <span className="text-foreground/80">{f.detail}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
