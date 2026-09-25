"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowsExchange,
  IconCircleDot,
  IconMessages,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconRobot,
  IconTrash,
} from "@tabler/icons-react";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageChrome } from "@/components/crm/page-header";
import { SectionHeader } from "@/components/crm/section-header";
import { KpiCard } from "@/components/crm/kpi-card";
import { EmptyState } from "@/components/crm/empty-state";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { ListColumnLabel } from "@/components/crm/sortable-header";
import { LIST_PAGE_PANE_CLASS } from "@/components/crm/pagination-glass";
import { DataRow, DataView } from "@/components/automations/data-view";
import { AppLoading } from "@/components/crm/app-loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/hooks/use-confirm";

type V2AgentRow = {
  id: string;
  name: string;
  flow: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastVersionNumber?: number;
  hasUnpublishedChanges?: boolean;
  channelCount?: number;
  testPhoneCount?: number;
  autonomyMode?: string;
  themeCount?: number;
  conversationsToday?: number;
  handoffsToday?: number;
};

type V2Preset = { key: string; label: string };

// Chaves iguais às do backend (listV2Presets).
const PRESET_HINTS: Record<string, string> = {
  reception: "Identifica o cliente e o assunto e entrega para a pessoa certa.",
  full: "Responde dúvidas com os seus materiais e passa para a equipe quando precisar.",
  sales: "Apresenta produtos, tira dúvidas e leva o interesse para o time de vendas.",
  support: "Ajuda com problemas de uso passo a passo e abre o atendimento com a equipe.",
  blank: "Comece do zero e configure tudo do seu jeito.",
};
// "Primeiros dias" cria etapas de acompanhamento que a tela ainda não edita.
const HIDDEN_PRESETS = new Set(["onboarding"]);

async function fetchAgents(): Promise<V2AgentRow[]> {
  const res = await apiFetch("/api/ai-agents-v2");
  const data = await parseApiResponse<{ agents: V2AgentRow[] }>(res, "Erro ao carregar agentes.");
  return data.agents;
}

async function fetchPresets(): Promise<V2Preset[]> {
  const res = await apiFetch("/api/ai-agents-v2/presets");
  const data = await parseApiResponse<{ presets: V2Preset[] }>(res, "Erro ao carregar os modelos.");
  return data.presets;
}

async function createAgent(payload: { name: string; preset: string }) {
  const res = await apiFetch("/api/ai-agents-v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{ id: string }>(res, "Erro ao criar agente.");
}

async function setAgentActive(id: string, active: boolean) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  return parseApiResponse<unknown>(res, "Erro ao ligar/desligar o agente.");
}

async function deleteAgent(id: string) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`, { method: "DELETE" });
  return parseApiResponse<{ ok: true }>(res, "Erro ao excluir agente.");
}

function foldText(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "IA"
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

type Filter = "all" | "on" | "off";

const columnClass =
  "grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(240px,1.5fr)_minmax(150px,1fr)_minmax(150px,1fr)_130px_120px_96px]";

export default function AIAgentsV2ListClientPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPreset, setNewPreset] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const agentsQuery = useQuery({ queryKey: ["ai-agents-v2"], queryFn: fetchAgents });
  const agents = React.useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  const { data: presets = [] } = useQuery({
    queryKey: ["ai-agents-v2-presets"],
    queryFn: fetchPresets,
    enabled: creating,
  });

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2"] });
      setCreating(false);
      router.push(`/ai-agents-v2/${result.id}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setAgentActive(id, active),
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: ["ai-agents-v2"] });
      const prev = queryClient.getQueryData<V2AgentRow[]>(["ai-agents-v2"]);
      queryClient.setQueryData<V2AgentRow[]>(["ai-agents-v2"], (rows) => rows?.map((r) => (r.id === id ? { ...r, active } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["ai-agents-v2"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2"] }),
  });

  async function handleDelete(agent: V2AgentRow) {
    const ok = await confirm({
      title: "Excluir agente?",
      description: `O agente "${agent.name}" será excluído permanentemente. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(agent.id);
  }

  async function handleToggle(agent: V2AgentRow) {
    if (agent.active) {
      const ok = await confirm({
        title: `Desligar ${agent.name}?`,
        description: "As conversas dos números dele passam para a distribuição normal até você ligar de novo.",
        confirmLabel: "Desligar",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }
    toggleMutation.mutate({ id: agent.id, active: !agent.active });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), preset: newPreset || "blank" });
  }

  const summary = React.useMemo(
    () => ({
      total: agents.length,
      on: agents.filter((a) => a.active).length,
      off: agents.filter((a) => !a.active).length,
      conversations: agents.reduce((n, a) => n + (a.conversationsToday ?? 0), 0),
      handoffs: agents.reduce((n, a) => n + (a.handoffsToday ?? 0), 0),
    }),
    [agents],
  );

  const q = foldText(query.trim());
  const visible = agents.filter(
    (a) => (filter === "all" || (filter === "on" ? a.active : !a.active)) && (!q || foldText(a.name).includes(q)),
  );

  return (
    <div className="v2-screen v2-screen-fill grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-hidden bg-background">
      <NavRailSpacer />
      <PageChrome
        className="px-4 py-5"
        header={
          <SectionHeader
            icon={<IconRobot size={22} />}
            title="Agentes de IA"
            stackSearchOnMobile
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Pesquisar agente…"
            withFilter={false}
            menu={false}
            actions={
              <Button onClick={() => setCreating(true)} className="gap-1.5">
                <IconPlus className="size-4" /> Novo agente
              </Button>
            }
          />
        }
        bodyClassName="gap-4"
      >
        {agentsQuery.isLoading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : (
          <>
            <section className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
              <KpiCard
                label="Ligados"
                value={summary.on.toLocaleString("pt-BR")}
                hint={`de ${summary.total.toLocaleString("pt-BR")}`}
                icon={<IconRobot size={20} stroke={2} />}
                tone="brand"
                active={filter === "on"}
                onClick={() => setFilter(filter === "on" ? "all" : "on")}
              />
              <KpiCard
                label="Conversas hoje"
                value={summary.conversations.toLocaleString("pt-BR")}
                icon={<IconMessages size={20} stroke={2} />}
                tone="violet"
              />
              <KpiCard
                label="Passaram para a equipe hoje"
                value={summary.handoffs.toLocaleString("pt-BR")}
                icon={<IconArrowsExchange size={20} stroke={2} />}
                tone="orange"
              />
              <KpiCard
                label="Desligados"
                value={summary.off.toLocaleString("pt-BR")}
                icon={<IconCircleDot size={20} stroke={2} />}
                tone="neutral"
                active={filter === "off"}
                onClick={() => setFilter(filter === "off" ? "all" : "off")}
              />
            </section>

            <div className={LIST_PAGE_PANE_CLASS}>
              {agentsQuery.isError ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center text-sm text-destructive">
                  {agentsQuery.error instanceof Error ? agentsQuery.error.message : "Erro ao carregar agentes."}
                </div>
              ) : agents.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
                  <EmptyState
                    icon={<IconRobot size={28} />}
                    title="Nenhum agente ainda"
                    description="Crie um agente, ensine o que ele precisa saber e teste antes de colocar no ar."
                    action={
                      <Button onClick={() => setCreating(true)} className="gap-1.5">
                        <IconPlus className="size-4" /> Novo agente
                      </Button>
                    }
                  />
                </div>
              ) : visible.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
                  <EmptyState
                    icon={<IconRobot size={28} />}
                    title="Nenhum resultado"
                    description={q ? `Nenhum agente com "${query.trim()}".` : "Nenhum agente neste filtro."}
                  />
                </div>
              ) : (
                <DataView
                  view="cards"
                  columnClass={columnClass}
                  fitViewport
                  header={
                    <>
                      <ListColumnLabel>Agente</ListColumnLabel>
                      <ListColumnLabel>Onde atende</ListColumnLabel>
                      <ListColumnLabel>Versão</ListColumnLabel>
                      <ListColumnLabel>Hoje</ListColumnLabel>
                      <ListColumnLabel>Alterado</ListColumnLabel>
                      <ListColumnLabel align="right">Status</ListColumnLabel>
                    </>
                  }
                >
                  {visible.map((a) => (
                    <AgentRow
                      key={a.id}
                      agent={a}
                      onToggle={() => handleToggle(a)}
                      onDelete={() => handleDelete(a)}
                      toggling={toggleMutation.isPending && toggleMutation.variables?.id === a.id}
                    />
                  ))}
                </DataView>
              )}
            </div>
          </>
        )}
      </PageChrome>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Novo agente</DialogTitle>
              <DialogDescription>Escolha um ponto de partida. Você pode mudar tudo depois.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do agente</Label>
                <p className="text-xs text-muted-foreground">É o nome que o cliente vê nas mensagens.</p>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Ana, da central de atendimento"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Comece a partir de um modelo</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {presets
                    .filter((p) => !HIDDEN_PRESETS.has(p.key))
                    .map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setNewPreset(p.key)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                          newPreset === p.key ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50",
                        )}
                      >
                        <span className="text-sm font-semibold">{p.label}</span>
                        <span className="text-xs text-muted-foreground">{PRESET_HINTS[p.key] ?? ""}</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !newName.trim() || !newPreset}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentRow({
  agent,
  onToggle,
  onDelete,
  toggling,
}: {
  agent: V2AgentRow;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
}) {
  const version = agent.lastVersionNumber ?? 0;
  const channels = agent.channelCount ?? 0;
  const testPhones = agent.testPhoneCount ?? 0;

  return (
    <DataRow className="group relative cursor-pointer">
      <Link
        href={`/ai-agents-v2/${agent.id}`}
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir ${agent.name}`}
      >
        <span className="sr-only">Abrir</span>
      </Link>

      <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-3">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-chip-blue-soft text-sm font-bold text-chip-blue">
          {initialsOf(agent.name)}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card",
              agent.active ? "bg-success" : "bg-muted-foreground/40",
            )}
            aria-label={agent.active ? "Ligado" : "Desligado"}
          />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{agent.name || "Agente sem nome"}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {agent.autonomyMode === "auto" ? "Responde sozinho" : "Sugere para a equipe aprovar"}
            {agent.themeCount ? ` · ${agent.themeCount} assunto${agent.themeCount > 1 ? "s" : ""}` : ""}
          </p>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 min-w-0">
        <span className="mb-1 block text-xs text-muted-foreground lg:hidden">Onde atende</span>
        <p className="truncate text-sm">
          {channels === 0 ? (
            <span className="text-muted-foreground">Nenhum número</span>
          ) : (
            `${channels} número${channels > 1 ? "s" : ""} de WhatsApp`
          )}
        </p>
        {testPhones > 0 && (
          <span className="mt-1 inline-flex rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
            fase de teste · {testPhones}
          </span>
        )}
      </div>

      <div className="pointer-events-none relative z-10 min-w-0">
        <span className="mb-1 block text-xs text-muted-foreground lg:hidden">Versão</span>
        {version === 0 ? (
          <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            Nunca publicado
          </span>
        ) : agent.hasUnpublishedChanges ? (
          <span className="inline-flex rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">
            v{version} · com alterações
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
            v{version} publicada
          </span>
        )}
      </div>

      <div className="pointer-events-none relative z-10 flex items-center gap-2 lg:block">
        <span className="text-xs text-muted-foreground lg:hidden">Hoje</span>
        <p className="text-sm font-semibold tabular-nums">{(agent.conversationsToday ?? 0).toLocaleString("pt-BR")} conversas</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {(agent.handoffsToday ?? 0).toLocaleString("pt-BR")} para a equipe
        </p>
      </div>

      <div className="pointer-events-none relative z-10 flex items-center gap-2 lg:block">
        <span className="text-xs text-muted-foreground lg:hidden">Alterado</span>
        <span className="text-sm text-muted-foreground">{relativeTime(agent.updatedAt)}</span>
      </div>

      <div className="relative z-10 flex items-center gap-1 lg:justify-end">
        <Link
          href={`/ai-agents-v2/${agent.id}?tab=test`}
          aria-label={`Testar ${agent.name}`}
          title="Testar"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-100 transition-colors hover:bg-muted hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <IconPlayerPlay size={15} stroke={2} />
        </Link>
        <Link
          href={`/ai-agents-v2/${agent.id}`}
          aria-label={`Editar ${agent.name}`}
          title="Editar"
          className="hidden size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <IconPencil size={15} stroke={2} />
        </Link>
        <SwitchGlass
          checked={agent.active}
          onChange={onToggle}
          disabled={toggling}
          size="list"
          className="shrink-0"
          aria-label={`${agent.active ? "Desligar" : "Ligar"} ${agent.name}`}
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Excluir ${agent.name}`}
          title="Excluir agente"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            "text-muted-foreground transition-colors",
            "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
            "hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          <IconTrash size={15} stroke={2} />
        </button>
      </div>
    </DataRow>
  );
}
