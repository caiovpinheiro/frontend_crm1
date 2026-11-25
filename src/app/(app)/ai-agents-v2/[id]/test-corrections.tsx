"use client";

/**
 * Correções de quem testa (`#corrigir` pelo WhatsApp): o que está valendo
 * nas conversas de teste do agente, com a mudança sugerida para aplicar no
 * rascunho ou descartar. A versão publicada só muda quando alguém publica.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconLoader2, IconPencil, IconSparkles, IconTrash } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

import { BlockHeader, Pill, SURFACE } from "./ui";

type Suggestion = { tipo: "regra" | "material"; titulo: string; texto: string; motivo: string };

type Correction = {
  id: string;
  number: number;
  question: string;
  reply: string;
  text: string;
  agentVersion: number | null;
  status: "pending" | "applied" | "discarded" | "undone";
  suggestion: Suggestion | null;
  suggestionError: string | null;
  createdAt: string;
  inEffect: boolean;
  contactName: string | null;
};

const TYPE_LABEL: Record<Suggestion["tipo"], string> = { regra: "Regra geral", material: "Material de consulta" };

async function fetchCorrections(agentId: string): Promise<Correction[]> {
  const res = await apiFetch(`/api/ai-agents-v2/${agentId}/test-corrections`);
  const data = await parseApiResponse<{ corrections: Correction[] }>(res, "Erro ao carregar correções.");
  return data.corrections ?? [];
}

async function send<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseApiResponse<T>(res, fallback);
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function TestCorrections({
  agentId,
  blockApply,
  onApplied,
}: {
  agentId: string;
  /** Rascunho com alteração não salva (ou salvando): aplicar agora perderia o que está na tela. */
  blockApply: boolean;
  onApplied: () => void;
}) {
  const query = useQuery({
    queryKey: ["ai-agents-v2-test-corrections", agentId],
    queryFn: () => fetchCorrections(agentId),
    // A correção chega pelo WhatsApp e a sugestão um pouco depois.
    refetchInterval: 10_000,
  });
  const inEffect = (query.data ?? []).filter((c) => c.inEffect);
  if (inEffect.length === 0) return null;

  return (
    <section className={cn(SURFACE, "space-y-4 p-5 sm:p-6")}>
      <BlockHeader
        icon={IconPencil}
        tone="amber"
        title="Correções de quem testa"
        description="Mandadas com #corrigir pelo WhatsApp. Valem só nas conversas dos números de teste; a versão publicada não muda até você publicar."
      />
      <div className="space-y-3">
        {inEffect.map((c) => (
          <CorrectionCard key={c.id} agentId={agentId} correction={c} blockApply={blockApply} onApplied={onApplied} />
        ))}
      </div>
    </section>
  );
}

function CorrectionCard({
  agentId,
  correction: c,
  blockApply,
  onApplied,
}: {
  agentId: string;
  correction: Correction;
  blockApply: boolean;
  onApplied: () => void;
}) {
  const queryClient = useQueryClient();
  // Sem edição, a tela mostra a sugestão do servidor (ela chega depois da correção, ou é refeita).
  const [draft, setDraft] = React.useState<Pick<Suggestion, "tipo" | "titulo" | "texto"> | null>(null);
  const { tipo, titulo, texto } = draft ?? { tipo: c.suggestion?.tipo ?? "regra", titulo: c.suggestion?.titulo ?? "", texto: c.suggestion?.texto ?? "" };
  const edited = draft !== null;
  const edit = (patch: Partial<Pick<Suggestion, "tipo" | "titulo" | "texto">>) => setDraft({ tipo, titulo, texto, ...patch });

  const base = `/api/ai-agents-v2/${agentId}/test-corrections/${c.id}`;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-test-corrections", agentId] });
    queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-test-logs", agentId] });
  };
  const apply = useMutation({
    mutationFn: () => send(`${base}/apply`, { tipo, titulo, texto }, "Erro ao aplicar a correção."),
    onSuccess: () => {
      refresh();
      onApplied();
    },
  });
  const discard = useMutation({ mutationFn: () => send(`${base}/discard`, {}, "Erro ao descartar a correção."), onSuccess: refresh });
  const suggest = useMutation({
    mutationFn: () => send(`${base}/suggest`, {}, "Erro ao gerar a sugestão."),
    onSuccess: () => {
      setDraft(null);
      refresh();
    },
  });
  const busy = apply.isPending || discard.isPending || suggest.isPending;
  const error = (apply.error ?? discard.error ?? suggest.error) as Error | null;
  const applied = c.status === "applied";

  return (
    <article className="space-y-3 rounded-xl border border-border bg-white p-4 text-sm v2-dark:bg-card">
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Correção nº {c.number}</span>
        {applied ? <Pill tone="emerald" icon={IconCheck}>no rascunho</Pill> : <Pill tone="amber">pendente</Pill>}
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {[c.contactName, dateTime(c.createdAt), c.agentVersion ? `versão ${c.agentVersion}` : null].filter(Boolean).join(" · ")}
        </span>
      </header>

      <dl className="space-y-1 text-[13px]">
        {c.question.trim() && (
          <div>
            <dt className="inline font-medium">Pergunta: </dt>
            <dd className="inline text-muted-foreground">{clip(c.question, 240)}</dd>
          </div>
        )}
        {c.reply.trim() && (
          <div>
            <dt className="inline font-medium">O agente respondeu: </dt>
            <dd className="inline text-muted-foreground">{clip(c.reply, 320)}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium">Correção: </dt>
          <dd className="inline">{c.text}</dd>
        </div>
      </dl>

      {applied ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 v2-dark:bg-emerald-500/10 v2-dark:text-emerald-200">
          Aplicada no rascunho como {TYPE_LABEL[c.suggestion?.tipo ?? "regra"].toLowerCase()}. Continua valendo nos testes até a próxima publicação.
        </p>
      ) : (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 v2-dark:bg-muted/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Mudança sugerida para o rascunho</span>
            {(["regra", "material"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => edit({ tipo: t })}
                aria-pressed={tipo === t}
              >
                <Badge variant={tipo === t ? "indigo" : "outline"}>{TYPE_LABEL[t]}</Badge>
              </button>
            ))}
            {!c.suggestion && !c.suggestionError && !suggest.isPending && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <IconLoader2 className="size-3 animate-spin" /> redigindo…
              </span>
            )}
          </div>
          {c.suggestionError && !c.suggestion && (
            <p className="text-xs text-destructive">Não foi possível redigir a sugestão: {c.suggestionError}</p>
          )}
          {tipo === "material" && (
            <Input
              value={titulo}
              onChange={(e) => edit({ titulo: e.target.value })}
              placeholder="Título do material"
              aria-label="Título do material"
            />
          )}
          <Textarea
            value={texto}
            onChange={(e) => edit({ texto: e.target.value })}
            rows={tipo === "material" ? 4 : 2}
            placeholder={tipo === "material" ? "Pergunta: …\nResposta: …" : "Instrução curta para o agente"}
            aria-label="Texto da mudança"
          />
          {c.suggestion?.motivo && !edited && <p className="text-xs text-muted-foreground">{c.suggestion.motivo}</p>}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error.message}</p>}

      <footer className="flex flex-wrap items-center gap-2">
        {!applied && (
          <>
            <Button size="sm" className="h-8 gap-1" disabled={busy || blockApply || !texto.trim()} onClick={() => apply.mutate()}>
              {apply.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
              Aplicar no rascunho
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" disabled={busy} onClick={() => suggest.mutate()}>
              {suggest.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconSparkles className="size-4" />}
              {c.suggestion ? "Redigir de novo" : "Redigir sugestão"}
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" disabled={busy} onClick={() => discard.mutate()}>
          {discard.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconTrash className="size-4" />}
          {applied ? "Parar de valer nos testes" : "Descartar"}
        </Button>
        {!applied && blockApply && <span className="text-xs text-muted-foreground">Salve o rascunho antes de aplicar.</span>}
      </footer>
    </article>
  );
}
