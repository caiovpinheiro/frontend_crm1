"use client";

/**
 * Validação da configuração: achados determinísticos (sem IA) sobre a
 * configuração do agente e da organização — destinos de transferência,
 * gatilhos de assunto, calendário, campos nas mensagens, tabulação e fluxos
 * de automação no encerramento. Roda a cada salvamento; o que "bloqueia"
 * barra a publicação (dá para publicar mesmo assim). Também mostra o mapa de
 * roteamento da organização: agente → assunto → destino.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { IconAlertOctagon, IconAlertTriangle, IconArrowRight, IconArrowsSplit, IconChecklist, IconCircleCheck, IconLoader2, IconRefresh } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { FINDING_LABEL, pathTarget, type ValidationFinding, type ValidationSeverity, type ValidationTarget } from "./config-validation-target";
import { BlockHeader, Pill, SURFACE, Segmented, type Tone } from "./ui";

export type ValidationData = { findings: ValidationFinding[]; blocking: number };

const SEVERITY: Record<ValidationSeverity, { label: string; tone: Tone }> = {
  bloqueia: { label: "Bloqueia", tone: "rose" },
  avisa: { label: "Aviso", tone: "amber" },
};

export function useConfigValidation(agentId: string, refreshKey: number | null) {
  return useQuery({
    queryKey: ["ai-agents-v2-validate", agentId, refreshKey ?? 0],
    queryFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/validate`);
      return parseApiResponse<ValidationData>(res, "Erro ao validar a configuração.");
    },
    placeholderData: (prev) => prev,
  });
}

export function FindingList({
  findings,
  config,
  onGoTo,
  compact,
}: {
  findings: ValidationFinding[];
  config: Record<string, unknown> | null | undefined;
  onGoTo?: (t: ValidationTarget) => void;
  compact?: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {findings.map((f, i) => {
        const target = pathTarget(f.path, config);
        return (
          <li key={`${f.path}-${f.code}-${i}`} className={cn("space-y-1.5", compact ? "p-2.5" : "p-3")}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill tone={SEVERITY[f.severity].tone}>{SEVERITY[f.severity].label}</Pill>
              <span className="font-medium text-foreground">{FINDING_LABEL[f.code] ?? f.code}</span>
              {onGoTo ? (
                <button type="button" onClick={() => onGoTo(target)} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
                  {target.label} <IconArrowRight className="size-3.5" />
                </button>
              ) : (
                <span className="ml-auto text-muted-foreground">{target.label}</span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-foreground/85">{f.message}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{f.path}{f.evidence ? ` · ${f.evidence}` : ""}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function ConfigValidation({
  config,
  query,
  onGoTo,
}: {
  config: Record<string, unknown> | null;
  query: ReturnType<typeof useConfigValidation>;
  onGoTo: (t: ValidationTarget) => void;
}) {
  const [only, setOnly] = React.useState<ValidationSeverity | "all">("all");
  const data = query.data;
  const findings = data?.findings ?? [];
  const blocking = findings.filter((f) => f.severity === "bloqueia").length;
  const warnings = findings.length - blocking;
  const shown = findings.filter((f) => only === "all" || f.severity === only);

  return (
    <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
      <BlockHeader
        icon={IconChecklist}
        tone="emerald"
        title="Validação da configuração"
        description="Conferida a cada salvamento, sem IA: para quem ele transfere, gatilhos dos assuntos, calendário, campos nas mensagens, tabulação e fluxos de automação no encerramento. O que bloqueia impede publicar (dá para publicar mesmo assim)."
        actions={
          <Button variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} className="gap-1">
            {query.isFetching ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />}
            Conferir agora
          </Button>
        }
      />

      {query.isError && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}
      {!data && !query.isError && <Skeleton className="h-24 w-full" />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Bloqueiam a publicação</div>
              <div className={cn("mt-1 text-3xl font-semibold tabular-nums", blocking > 0 ? "text-rose-600" : "text-emerald-600")}>{blocking}</div>
              <div className="mt-1 text-xs text-muted-foreground">{blocking === 0 ? "nada impede publicar" : "corrija ou publique mesmo assim"}</div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Avisos</div>
              <div className={cn("mt-1 text-3xl font-semibold tabular-nums", warnings > 0 ? "text-amber-600" : "text-emerald-600")}>{warnings}</div>
              <div className="mt-1 text-xs text-muted-foreground">não impedem publicar</div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Resultado</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                {findings.length === 0 ? (
                  <>
                    <IconCircleCheck className="size-5 text-emerald-600" /> Nenhum achado
                  </>
                ) : blocking > 0 ? (
                  <>
                    <IconAlertOctagon className="size-5 text-rose-600" /> Publicação barrada
                  </>
                ) : (
                  <>
                    <IconAlertTriangle className="size-5 text-amber-600" /> Só avisos
                  </>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{findings.length} achado{findings.length === 1 ? "" : "s"} no rascunho salvo</div>
            </div>
          </div>

          {findings.length > 0 && (
            <Segmented
              value={only}
              onChange={setOnly}
              size="sm"
              options={[
                { value: "all", label: "Todos", count: findings.length },
                { value: "bloqueia", label: "Bloqueiam", count: blocking, tone: "danger" },
                { value: "avisa", label: "Avisos", count: warnings, tone: "warning" },
              ]}
            />
          )}

          {shown.length > 0 && <FindingList findings={shown} config={config} onGoTo={onGoTo} />}
        </>
      )}
    </section>
  );
}

/** Publicação barrada: lista o que bloqueia e deixa publicar mesmo assim. */
export function PublishBlockedDialog({
  findings,
  config,
  publishing,
  onCancel,
  onForce,
  onGoTo,
}: {
  findings: ValidationFinding[];
  config: Record<string, unknown> | null;
  publishing: boolean;
  onCancel: () => void;
  onForce: () => void;
  onGoTo: (t: ValidationTarget) => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>A publicação foi barrada</DialogTitle>
          <DialogDescription>
            {findings.length === 1 ? "Um ponto da configuração" : `${findings.length} pontos da configuração`} vão dar errado no atendimento. Corrija e publique de novo — ou publique mesmo assim, por sua conta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            <FindingList
              findings={findings}
              config={config}
              compact
              onGoTo={(t) => {
                onCancel();
                onGoTo(t);
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onForce} disabled={publishing} className="gap-1">
              {publishing && <IconLoader2 className="size-4 animate-spin" />}
              Publicar mesmo assim
            </Button>
            <Button onClick={onCancel} disabled={publishing}>
              Corrigir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mapa de roteamento ──────────────────────────────────────────────────

type RoutingNodeKind = "ai_agent" | "department" | "user" | "distribution_rule" | "queue";
type RoutingNode = { id: string; kind: RoutingNodeKind; name: string; active?: boolean; firstAttendance?: boolean; channelCount?: number; missing?: boolean };
type RoutingEdgeKind = "default" | "theme" | "rule" | "scope" | "onboarding" | "answer_by";
type RoutingEdge = { from: string; to: string; kind: RoutingEdgeKind; label: string; path: string; direct: boolean; themeId?: string };
type RoutingMapData = { nodes: RoutingNode[]; edges: RoutingEdge[] };

const EDGE_KIND: Record<RoutingEdgeKind, { label: string; tone: Tone }> = {
  default: { label: "Destino padrão", tone: "slate" },
  theme: { label: "Assunto", tone: "emerald" },
  rule: { label: "Atalho", tone: "violet" },
  scope: { label: "Fora do escopo", tone: "orange" },
  onboarding: { label: "Cadastro", tone: "sky" },
  answer_by: { label: "Quem responde", tone: "teal" },
};
const NODE_KIND: Record<RoutingNodeKind, string> = {
  ai_agent: "agente de IA",
  department: "departamento",
  user: "pessoa",
  distribution_rule: "regra de distribuição",
  queue: "fila",
};
const nodeKey = (n: { kind: string; id: string }) => `${n.kind}:${n.id}`;

export function RoutingMap({ currentAgentId }: { currentAgentId: string }) {
  const q = useQuery({
    queryKey: ["ai-agents-v2-routing-map"],
    queryFn: async () => {
      const res = await apiFetch("/api/ai-agents-v2/routing-map");
      return parseApiResponse<RoutingMapData>(res, "Erro ao montar o mapa de roteamento.");
    },
  });
  const data = q.data;
  const nodes = React.useMemo(() => new Map((data?.nodes ?? []).map((n) => [nodeKey(n), n])), [data]);
  const agents = (data?.nodes ?? [])
    .filter((n) => n.kind === "ai_agent" && !n.missing)
    .sort((a, b) => (a.id === currentAgentId ? -1 : b.id === currentAgentId ? 1 : a.name.localeCompare(b.name)));

  return (
    <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
      <BlockHeader
        icon={IconArrowsSplit}
        tone="indigo"
        title="Mapa de roteamento"
        description="Para onde cada agente da organização manda a conversa, por assunto e atalho, e quem recebe conversa nova. Vale a versão publicada de cada agente."
        actions={
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} className="gap-1">
            {q.isFetching ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />}
            Atualizar
          </Button>
        }
      />
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!data && !q.isError && <Skeleton className="h-24 w-full" />}
      {data && agents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agente publicado na organização.</p>}
      {data && agents.length > 0 && (
        <div className="space-y-3">
          {agents.map((a) => {
            const key = nodeKey(a);
            const out = data.edges.filter((e) => e.from === key);
            const incoming = data.edges.filter((e) => e.to === key).map((e) => ({ from: nodes.get(e.from), label: e.label }));
            const current = a.id === currentAgentId;
            return (
              <div key={key} className={cn("overflow-hidden rounded-xl border", current ? "border-foreground/30" : "border-border")}>
                <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-slate-50 px-4 py-2.5 v2-dark:bg-muted/40">
                  <span className="text-[13.5px] font-semibold">{a.name}</span>
                  {current && <Pill tone="blue">este agente</Pill>}
                  {a.active === false && <Pill tone="rose">desligado</Pill>}
                  {a.firstAttendance && <Pill tone="emerald">recebe conversa nova</Pill>}
                  {(a.channelCount ?? 0) > 0 && <Pill tone="slate">{a.channelCount} número{a.channelCount === 1 ? "" : "s"}</Pill>}
                  {incoming.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      recebe de {incoming.map((i, idx) => `${i.from?.name ?? "?"} (${i.label})${idx < incoming.length - 1 ? ", " : ""}`).join("")}
                    </span>
                  )}
                </div>
                {out.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma transferência configurada.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {out.map((e, i) => {
                      const to = nodes.get(e.to);
                      return (
                        <li key={`${e.path}-${i}`} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
                          <Pill tone={EDGE_KIND[e.kind].tone}>{EDGE_KIND[e.kind].label}</Pill>
                          <span className="font-medium">{e.label}</span>
                          {e.direct && e.kind === "theme" && <Pill tone="slate">direto</Pill>}
                          <IconArrowRight className="size-3.5 text-muted-foreground" />
                          <span>{to?.name ?? e.to}</span>
                          <span className="text-xs text-muted-foreground">{to ? NODE_KIND[to.kind] : ""}</span>
                          {to?.missing && <Pill tone="rose">não existe</Pill>}
                          {to?.kind === "ai_agent" && to.active === false && <Pill tone="rose">desligado</Pill>}
                          {to?.kind === "ai_agent" && to.id === a.id && <Pill tone="rose">ele mesmo</Pill>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
