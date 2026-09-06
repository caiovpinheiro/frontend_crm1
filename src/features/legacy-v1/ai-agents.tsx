"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { IconAlertTriangle as AlertTriangle, IconRobot as Bot, IconAlertCircle as CircleAlert, IconPencil as Pencil, IconPlayerPlay as Play, IconPlus as Plus, IconPower as Power, IconAdjustments as Settings2, IconTrash as Trash2 } from "@tabler/icons-react";
import * as React from "react";

import { AgentSettingsDialog } from "@/components/agent-settings/agent-settings-dialog";
import {
  PREVIEW_AGENT_ROW,
  isPreviewAgentId,
} from "@/components/agent-settings/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, pageHeaderPrimaryCtaClass } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentPlayground } from "@/components/ai-agents/agent-playground";
import { AgentWizard } from "@/components/ai-agents/agent-wizard";
import { StudentDataPanel } from "@/components/ai-agents/student-data-panel";
import { ARCHETYPES } from "@/lib/ai-agents/archetypes";
import { cn, getInitials } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type AgentRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  archetype: "SDR" | "ATENDIMENTO" | "VENDEDOR" | "SUPORTE";
  model: string;
  autonomyMode: "AUTONOMOUS" | "DRAFT";
  enabledTools: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  knowledgeDocsCount: number;
};

async function fetchAgents(): Promise<AgentRow[]> {
  const res = await fetch(apiUrl("/api/ai-agents"));
  if (!res.ok) throw new Error("Erro ao carregar agentes.");
  return res.json();
}

type AiStatus = {
  configured: boolean;
  source?: "database" | "env" | "none";
  preview?: string | null;
  /** Backend pós chave-por-agente: sempre true; não há chave global. */
  perAgent?: boolean;
};

async function fetchAiStatus(): Promise<AiStatus> {
  const res = await fetch(apiUrl("/api/settings/ai"));
  if (!res.ok) return { configured: false };
  return (await res.json()) as AiStatus;
}

const ARCHETYPE_MAP = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a])) as Record<
  string,
  (typeof ARCHETYPES)[number]
>;

const AUTONOMY_LABEL: Record<AgentRow["autonomyMode"], string> = {
  AUTONOMOUS: "Autônomo",
  DRAFT: "Rascunho",
};

export default function AIAgentsPage({
  embedded = false,
}: {
  /** Quando true, omite o `PageHeader` legado (título/descrição já vêm do shell v2). */
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { confirm, dialog } = useConfirm();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["ai-agents"],
    queryFn: fetchAgents,
  });

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-settings-status"],
    queryFn: fetchAiStatus,
    staleTime: 30_000,
  });
  // Chave OpenAI é por agente (`perAgent`). O GET global sempre vem
  // `configured: false` — não pode bloquear criar/editar/testar, senão a
  // lista vazia só mostra o card `__preview__` e o Salvar não grava.
  const aiDisabled = aiStatus
    ? !aiStatus.perAgent && !aiStatus.configured
    : false;

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/ai-agents/${id}/toggle-active`), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erro ao alternar status.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/ai-agents/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Excluir agente "${name}"?`,
      description: "Atenção: essa ação é definitiva.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(id);
  };

  const newAgentButton = (
    <Button
      onClick={() => setCreating(true)}
      className={cn("w-full gap-2 sm:w-auto", pageHeaderPrimaryCtaClass)}
      disabled={aiDisabled}
      title={aiDisabled ? "IA desativada — configure a chave da OpenAI" : undefined}
    >
      <Plus className="size-4" /> Novo agente
    </Button>
  );

  if (editingId) {
    return (
      <div className="w-full min-w-0">
        <AgentSettingsDialog
          id={editingId}
          onOpenChange={(v) => {
            if (!v) setEditingId(null);
          }}
          onSaved={() => {
            setEditingId(null);
            queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
          }}
        />
        {dialog}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      {embedded ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {newAgentButton}
        </div>
      ) : (
        <PageHeader
          title="Agentes IA"
          description="Operadores virtuais que atendem leads, qualificam oportunidades e escalam pra humanos quando necessário."
          icon={<Bot />}
          className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          actions={newAgentButton}
        />
      )}

      {aiDisabled ? (
        <div className="rounded-xl border border-[var(--color-warning)]/70 bg-[var(--color-amber-soft)]/60 p-4 text-sm text-[var(--color-amber-text)] dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-[var(--color-amber-muted)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1 break-words">
              <p className="font-semibold">IA desativada — configure a chave da OpenAI</p>
              <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">
                Nenhuma chave configurada. Os agentes de IA e o playground
                ficam indisponíveis até que um administrador cadastre a
                credencial em Configurações → IA.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/settings/ai">
                  <Button size="sm" className="gap-2">
                    <Settings2 className="size-3.5" />
                    Configurar agora
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--color-warning)]/60 bg-[var(--color-amber-soft)]/40 p-4 text-sm text-[var(--color-amber-text)] dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-[var(--color-amber-muted)]">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1 break-words">
              <p className="font-medium">
                Chave OpenAI por agente — cadastre no editor (Identidade)
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">
                Cada agente usa a própria conta OpenAI (cifrada no banco). Crie
                o agente, cole a chave em Identidade e teste pelo botão{" "}
                <Play className="inline size-3.5 -translate-y-0.5" /> Testar.
                Sem chave global em Configurações → IA.
              </p>
            </div>
          </div>
        </div>
      )}

      <StudentDataPanel />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {agents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum agente no banco. Prévia abaixo só para navegar o modal —
              o lápis não grava.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(agents.length === 0 ? [PREVIEW_AGENT_ROW] : agents).map((a) => (
              <AgentListCard
                key={a.id}
                agent={a}
                preview={isPreviewAgentId(a.id)}
                aiDisabled={aiDisabled}
                togglePending={toggleMutation.isPending}
                deletePending={deleteMutation.isPending}
                onTest={() => setTesting({ id: a.id, name: a.name })}
                onToggle={() => toggleMutation.mutate(a.id)}
                onEdit={() => setEditingId(a.id)}
                onDelete={() => handleDelete(a.id, a.name)}
              />
            ))}
          </div>
        </div>
      )}

      <AgentWizard
        open={creating}
        onOpenChange={(v) => setCreating(v)}
        onCreated={() => {
          setCreating(false);
          queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
        }}
      />

      <AgentPlayground
        agentId={testing?.id ?? null}
        agentName={testing?.name ?? ""}
        open={testing !== null}
        onOpenChange={(v) => {
          if (!v) setTesting(null);
        }}
      />

      {dialog}
    </div>
  );
}

function AgentListCard({
  agent: a,
  preview,
  aiDisabled,
  togglePending,
  deletePending,
  onTest,
  onToggle,
  onEdit,
  onDelete,
}: {
  agent: AgentRow;
  preview: boolean;
  aiDisabled: boolean;
  togglePending: boolean;
  deletePending: boolean;
  onTest: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const arch = ARCHETYPE_MAP[a.archetype];
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
        !a.active && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-11">
          <AvatarImage src={a.avatarUrl ?? undefined} />
          <AvatarFallback className="bg-[var(--color-indigo-soft)] text-[var(--color-purple-text)] dark:bg-indigo-950 dark:text-indigo-200">
            {getInitials(a.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{a.name}</h3>
            {a.active ? (
              <Badge
                variant="secondary"
                className="bg-[var(--color-success-subtle)] text-emerald-700 hover:bg-[var(--color-success-subtle)] dark:bg-emerald-950 dark:text-emerald-200"
              >
                Ativo
              </Badge>
            ) : (
              <Badge variant="outline">Desligado</Badge>
            )}
            {preview && <Badge variant="outline">Prévia</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {arch?.label ?? a.archetype}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <div>
          <div className="font-medium text-foreground/80">Modo</div>
          <div className="mt-0.5 normal-case">
            {AUTONOMY_LABEL[a.autonomyMode]}
          </div>
        </div>
        <div>
          <div className="font-medium text-foreground/80">Modelo</div>
          <div className="mt-0.5 truncate normal-case">{a.model}</div>
        </div>
        <div>
          <div className="font-medium text-foreground/80">Conhec.</div>
          <div className="mt-0.5 normal-case">
            {a.knowledgeDocsCount} docs
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex flex-wrap gap-1">
          {a.enabledTools.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
          {a.enabledTools.length > 3 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              +{a.enabledTools.length - 3}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-[var(--color-brand-primary)] hover:text-[var(--color-purple-text)] dark:text-[var(--color-brand-primary)]"
            title={
              preview
                ? "Playground indisponível na prévia"
                : aiDisabled
                  ? "IA desativada — cadastre a chave OpenAI no agente"
                  : "Testar no playground"
            }
            onClick={onTest}
            disabled={preview || aiDisabled}
          >
            <Play className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title={preview ? "Prévia — não liga no banco" : a.active ? "Desligar" : "Ligar"}
            onClick={onToggle}
            disabled={preview || togglePending}
          >
            <Power className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title="Editar"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-destructive/70 hover:text-destructive"
            title={preview ? "Prévia — não exclui" : "Excluir"}
            onClick={onDelete}
            disabled={preview || deletePending}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
