"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconPlus,
  IconRobot,
  IconPencil,
  IconPlayerPlay,
  IconBrain,
} from "@tabler/icons-react";

import { AppV2PageShell } from "../_v2-page-shell";
import { pageHeaderPrimaryCtaClass } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

type V2AgentRow = {
  id: string;
  name: string;
  flow: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type V2Preset = { key: string; label: string };

const PRESET_HINTS: Record<string, string> = {
  blank: "Comece do zero e configure cada etapa manualmente.",
  atendimento: "Responde dúvidas frequentes e abre chamados quando precisar.",
  recepcao: "Organiza o atendimento: identifica o cliente e entrega para o especialista certo.",
  vendas: "Acompanha negócios, apresenta produtos e envia propostas.",
  sdr: "Conversa com quem chegou, entende o interesse e passa para o time de vendas.",
};

async function fetchAgents(): Promise<V2AgentRow[]> {
  const res = await apiFetch("/api/ai-agents-v2");
  const data = await parseApiResponse<{ agents: V2AgentRow[] }>(res, "Erro ao carregar agentes v2.");
  return data.agents;
}

async function fetchPresets(): Promise<V2Preset[]> {
  const res = await apiFetch("/api/ai-agents-v2/presets");
  const data = await parseApiResponse<{ presets: V2Preset[] }>(res, "Erro ao carregar presets.");
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

export default function AIAgentsV2ListClientPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPreset, setNewPreset] = React.useState("");

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["ai-agents-v2"],
    queryFn: fetchAgents,
  });

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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), preset: newPreset || "blank" });
  }

  return (
    <AppV2PageShell
      title="Agentes IA v2"
      icon={<IconBrain size={22} />}
      description="Motor declarativo: regras, temas, handoff e ações estruturadas."
    >
      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            onClick={() => setCreating(true)}
            className={cn("w-full gap-2 sm:w-auto", pageHeaderPrimaryCtaClass)}
          >
            <IconPlus className="size-4" /> Novo agente v2
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum agente v2 criado. Clique em “Novo agente v2” para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <Card key={agent.id} className="overflow-hidden">
                <CardContent className="flex flex-col gap-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        <IconRobot size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {agent.flow}
                        </p>
                      </div>
                    </div>
                    <Badge variant={agent.active ? "default" : "outline"}>
                      {agent.active ? "Ativo" : "Desligado"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1" asChild>
                      <Link href={`/ai-agents-v2/${agent.id}`}>
                        <IconPencil className="size-3.5" /> Editar
                      </Link>
                    </Button>
                    <Button variant="secondary" size="sm" className="flex-1 gap-1" asChild>
                      <Link href={`/ai-agents-v2/${agent.id}?tab=test`}>
                        <IconPlayerPlay className="size-3.5" /> Testar
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Novo agente v2</DialogTitle>
              <DialogDescription>
                Escolha um preset para começar. A configuração completa é editada na próxima tela.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do agente</Label>
                <p className="text-xs text-muted-foreground">
                  É o nome que o cliente vê nas mensagens.
                </p>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Ana, da central de atendimento"
                  required
                />
              </div>
                              <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Comece a partir de um modelo</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O modelo só preenche as próximas etapas com sugestões. Nada fica travado.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {presets.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setNewPreset(p.key)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                          newPreset === p.key
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:bg-muted/50"
                        )}
                      >
                        <span className="text-sm font-semibold">{p.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {PRESET_HINTS[p.key] ?? "Preset de configuração."}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !newName.trim() || !newPreset}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppV2PageShell>
  );
}
