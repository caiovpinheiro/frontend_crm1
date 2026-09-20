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
import { PageHeader, pageHeaderPrimaryCtaClass } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BehaviorSelector } from "@/components/agent-settings/behavior-selector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, parseApiResponse, ApiError } from "@/lib/api";
import {
  AGENT_RESPONSE_BEHAVIOR_PRESETS,
  behaviorToTemperature,
  type AgentResponseBehavior,
} from "@/lib/ai-agents/behavior-presets";
import { cn } from "@/lib/utils";

type SimpleAgentRow = {
  id: string;
  userId: string;
  name: string;
  archetype: string;
  model: string;
  autonomyMode: string;
  active: boolean;
  engine: string | null;
  simpleConfig?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type PresetMap = Record<string, Record<string, unknown>>;

async function fetchAgents(): Promise<SimpleAgentRow[]> {
  const res = await apiFetch("/api/ai-agents");
  return parseApiResponse<SimpleAgentRow[]>(res, "Erro ao carregar agentes.");
}

async function fetchPresets(): Promise<PresetMap> {
  const res = await apiFetch("/api/ai-simple/presets");
  const data = await parseApiResponse<{ presets: PresetMap }>(
    res,
    "Erro ao carregar presets.",
  );
  return data.presets;
}

async function createAgent(payload: {
  name: string;
  archetype: string;
  model: string;
  responseBehavior: AgentResponseBehavior;
  temperature: number;
  engine: "simple";
  openaiApiKey?: string;
  simpleConfig: Record<string, unknown>;
}): Promise<{ id: string; userId: string }> {
  const res = await apiFetch("/api/ai-agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{ id: string; userId: string }>(
    res,
    "Erro ao criar agente.",
  );
}

export default function AIAgentsV2ListClientPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["ai-agents-v2"],
    queryFn: fetchAgents,
  });

  const { data: presets = {} } = useQuery({
    queryKey: ["ai-simple-presets"],
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

  const simpleAgents = agents.filter((a) => a.engine === "simple");

  return (
    <AppV2PageShell
      title="Agentes IA v2"
      icon={<IconBrain size={22} />}
      description="Motor simples: configuração declarativa, ações estruturadas e handoff único."
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
        ) : simpleAgents.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum agente v2 criado. Clique em “Novo agente v2” para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {simpleAgents.map((agent) => (
              <Card key={agent.id} className="overflow-hidden">
                <CardContent className="flex flex-col gap-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        <IconRobot size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">
                          {agent.name}
                        </h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {agent.model} · {agent.archetype}
                        </p>
                      </div>
                    </div>
                    <Badge variant={agent.active ? "default" : "outline"}>
                      {agent.active ? "Ativo" : "Desligado"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      asChild
                    >
                      <Link href={`/ai-agents-v2/${agent.id}`}>
                        <IconPencil className="size-3.5" /> Editar
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 gap-1"
                      asChild
                    >
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

      <CreateAgentDialog
        open={creating}
        onOpenChange={setCreating}
        presets={presets}
        onCreate={(values) =>
          createMutation.mutate({
            ...values,
            engine: "simple",
            archetype: "ATENDIMENTO",
            model: values.model || "gpt-4o-mini",
            temperature: behaviorToTemperature(values.responseBehavior),
            openaiApiKey: values.openaiApiKey?.trim(),
          })
        }
        isPending={createMutation.isPending}
        error={
          createMutation.error instanceof ApiError
            ? createMutation.error.message
            : createMutation.error?.message ?? null
        }
      />
    </AppV2PageShell>
  );
}

function CreateAgentDialog({
  open,
  onOpenChange,
  presets,
  onCreate,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presets: PresetMap;
  onCreate: (values: {
    name: string;
    model: string;
    responseBehavior: AgentResponseBehavior;
    openaiApiKey?: string;
    simpleConfig: Record<string, unknown>;
  }) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = React.useState("");
  const [model, setModel] = React.useState("gpt-4o-mini");
  const [responseBehavior, setResponseBehavior] = React.useState<AgentResponseBehavior>("balanced");
  const [openaiApiKey, setOpenaiApiKey] = React.useState("");
  const [presetKey, setPresetKey] = React.useState<string>("blank");

  React.useEffect(() => {
    if (open) {
      setName("");
      setModel("gpt-4o-mini");
      setResponseBehavior("balanced");
      setOpenaiApiKey("");
      setPresetKey("blank");
    }
  }, [open]);

  const presetNames: Record<string, string> = {
    atendimento: "Atendimento",
    sdr: "SDR",
    vendedor: "Vendedor",
    suporte_tecnico: "Suporte técnico",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const base =
      presetKey === "blank"
        ? {
            tone: "neutro",
            rules: "",
            context_fields: { contact: ["name", "phone", "email"], deal: ["title", "stage.name"] },
            confirmation_message: "Oi {{contact.name}}! Como posso ajudar?",
            on_deal_not_found: "ask_identification",
            identification_message: "Para te localizar, pode me passar o e-mail ou telefone cadastrado?",
            knowledge: "",
            modes: [],
            allowed_actions: [],
            allowed_fields: [],
            handoff_message: "Vou te conectar com um atendente humano.",
            handoff_queue: "",
            history_limit: 10,
          }
        : presets[presetKey] ?? {};
    onCreate({
      name: name.trim(),
      model,
      responseBehavior,
      openaiApiKey: openaiApiKey.trim(),
      simpleConfig: base as Record<string, unknown>,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novo agente v2</DialogTitle>
            <DialogDescription>
              Escolha um preset ou comece em branco. A configuração completa é
              editada na próxima tela.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="v2-name">Nome</Label>
              <Input
                id="v2-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Atendimento v2"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Preset</Label>
              <Select value={presetKey} onValueChange={setPresetKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Em branco</SelectItem>
                  {Object.keys(presets).map((key) => (
                    <SelectItem key={key} value={key}>
                      {presetNames[key] ?? key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="v2-model">Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="v2-model">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                  <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                  <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <BehaviorSelector
              label="Comportamento das respostas"
              value={responseBehavior}
              onChange={setResponseBehavior}
            />
            <div className="grid gap-2">
              <Label htmlFor="v2-key">Chave OpenAI do agente</Label>
              <PasswordInput
                id="v2-key"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-... (deixe em branco para herdar/limpar)"
              />
              <p className="text-xs text-muted-foreground">
                Cada agente v2 usa sua própria chave. Sem chave, o motor não consegue chamar o modelo.
              </p>
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Criando..." : "Criar e editar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
