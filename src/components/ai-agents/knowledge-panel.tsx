"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";
import { IconAlertCircle as AlertCircle, IconCircleCheck as CheckCircle2, IconFileText as FileText, IconLoader2 as Loader2, IconPlus as Plus, IconRefresh as RefreshCcw, IconTrash as Trash2 } from "@tabler/icons-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";

type KnowledgeDoc = {
  id: string;
  title: string;
  source: string;
  sizeBytes: number;
  status: "PENDING" | "INDEXING" | "READY" | "FAILED";
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
};

/** GET /knowledge devolve envelope `{ items, total, page, perPage }` ou lista crua. */
function unwrapKnowledgeDocs(payload: unknown): KnowledgeDoc[] {
  if (Array.isArray(payload)) return payload as KnowledgeDoc[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown }).items)
  ) {
    return (payload as { items: KnowledgeDoc[] }).items;
  }
  return [];
}

/**
 * Painel de gestão da base de conhecimento do agente.
 *
 * Permite colar texto (playbook, FAQ, roteiro) e acompanhar a
 * indexação em background. Doc em status INDEXING é auto-refeshed a
 * cada 2s até atingir READY ou FAILED.
 */
export function KnowledgePanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const visible = useDocumentVisible();
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["ai-agent-knowledge", agentId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/ai-agents/${agentId}/knowledge`));
      if (!res.ok) throw new Error("Falha ao listar documentos.");
      return unwrapKnowledgeDocs(await res.json());
    },
    refetchInterval: (q) => {
      if (!visible) return false;
      const data = q.state.data;
      if (!data) return false;
      const anyBusy = data.some(
        (d) => d.status === "PENDING" || d.status === "INDEXING",
      );
      return anyBusy ? 2000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await fetch(apiUrl(`/api/ai-agents/${agentId}/knowledge`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Erro.");
      return data;
    },
    onSuccess: () => {
      setTitle("");
      setContent("");
      setAdding(false);
      queryClient.invalidateQueries({
        queryKey: ["ai-agent-knowledge", agentId],
      });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro"),
  });

  const deleteMut = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(apiUrl(`/api/ai-agents/${agentId}/knowledge/${docId}`),
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Erro ao excluir.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ai-agent-knowledge", agentId],
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Base de conhecimento</h4>
          <p className="text-xs text-muted-foreground">
            Cole playbooks, FAQs, scripts ou documentação. O agente consulta
            automaticamente os trechos mais relevantes em cada resposta (RAG).
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={adding ? "outline" : "default"}
          onClick={() => setAdding((v) => !v)}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          {adding ? "Cancelar" : "Novo doc"}
        </Button>
      </div>

      {adding && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="kb-title" className="text-xs">
              Título
            </Label>
            <Input
              id="kb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: FAQ de produto"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kb-content" className="text-xs">
              Conteúdo (texto plano, markdown)
            </Label>
            <Textarea
              id="kb-content"
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Cole aqui o conteúdo do documento..."
              className="resize-none"
            />
            <div className="text-[11px] text-muted-foreground">
              {content.length.toLocaleString("pt-BR")} caracteres • limite 500k
            </div>
          </div>
          {error && (
            <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(false)}
              type="button"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => createMut.mutate()}
              disabled={
                createMut.isPending || !title.trim() || content.trim().length < 10
              }
            >
              {createMut.isPending && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              Indexar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando...
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">
          Nenhum documento ainda. O agente vai responder só com o prompt.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-start gap-3 rounded-xl border bg-card p-3"
            >
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-info-bg)] text-[var(--brand-primary)] dark:bg-indigo-950 dark:text-[var(--color-brand-primary)]">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <StatusBadge status={d.status} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatBytes(d.sizeBytes)} • {d.chunkCount} chunk(s) •{" "}
                  {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                </p>
                {d.status === "FAILED" && d.errorMessage && (
                  <p className="mt-1 text-[11px] text-destructive">
                    {d.errorMessage}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-destructive/70 hover:text-destructive"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Excluir documento "${d.title}"?`,
                    confirmLabel: "Excluir",
                    destructive: true,
                  });
                  if (ok) deleteMut.mutate(d.id);
                }}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}

function StatusBadge({ status }: { status: KnowledgeDoc["status"] }) {
  switch (status) {
    case "READY":
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:bg-[var(--color-success-bg)] dark:bg-emerald-950 dark:text-[var(--color-success)]/50"
        >
          <CheckCircle2 className="size-3" /> Pronto
        </Badge>
      );
    case "FAILED":
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-destructive/15 text-destructive hover:bg-destructive/15"
        >
          <AlertCircle className="size-3" /> Falhou
        </Badge>
      );
    case "INDEXING":
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="size-3 animate-spin" /> Indexando
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <RefreshCcw className="size-3" /> Pendente
        </Badge>
      );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
