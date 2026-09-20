"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { IconBrain, IconTrash, IconSend } from "@tabler/icons-react";

import { AppV2PageShell } from "../../_v2-page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { useConfirm } from "@/hooks/use-confirm";

type AgentDetail = {
  id: string;
  name: string;
  active: boolean;
  simpleConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type TestResult = {
  userMessage: string;
  output: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

type LogRow = {
  id: string;
  inboundText: string;
  reply?: string | null;
  handoff?: boolean;
  createdAt: string;
  prompt?: string;
  llmOutput?: Record<string, unknown> | null;
};

async function fetchAgent(id: string): Promise<AgentDetail> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`);
  return parseApiResponse<AgentDetail>(res, "Erro ao carregar agente v2.");
}

async function updateAgent(id: string, payload: { name?: string; active?: boolean; config?: unknown }) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<AgentDetail>(res, "Erro ao salvar agente v2.");
}

async function deleteAgent(id: string) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`, { method: "DELETE" });
  return parseApiResponse<{ ok: boolean }>(res, "Erro ao deletar agente v2.");
}

async function testAgent(id: string, userMessage: string): Promise<TestResult> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userMessage }),
  });
  return parseApiResponse<TestResult>(res, "Erro ao testar agente v2.");
}

async function fetchLogs(id: string, conversationId?: string): Promise<LogRow[]> {
  const qs = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
  const res = await apiFetch(`/api/ai-agents-v2/${id}/logs${qs}`);
  const data = await parseApiResponse<{ logs: LogRow[] }>(res, "Erro ao carregar logs.");
  return data.logs;
}

export default function AIAgentV2EditClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const defaultTab = searchParams.get("tab") === "test" ? "test" : "config";
  const [activeTab, setActiveTab] = React.useState(defaultTab);
  const confirmDelete = useConfirm();

  const { data: agent, isLoading } = useQuery({
    queryKey: ["ai-agents-v2", id],
    queryFn: () => fetchAgent(id),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { name?: string; active?: boolean; config?: unknown }) => updateAgent(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2"] });
      router.push("/ai-agents-v2");
    },
  });

  const [configText, setConfigText] = React.useState("");
  const [configError, setConfigError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (agent) {
      setConfigText(JSON.stringify(agent.simpleConfig, null, 2));
      setConfigError(null);
    }
  }, [agent]);

  function handleSaveConfig() {
    setConfigError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(configText);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "JSON inválido");
      return;
    }
    updateMutation.mutate({ config: parsed });
  }

  return (
    <AppV2PageShell
      title={agent ? agent.name : "Agente v2"}
      icon={<IconBrain size={22} />}
      description="Edite a configuração declarativa, teste respostas e consulte logs."
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 space-y-4">
        <TabsList>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="test">Testar</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          {isLoading || !agent ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração JSON</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    defaultValue={agent.name}
                    onBlur={(e) => updateMutation.mutate({ name: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="active"
                    checked={agent.active}
                    onCheckedChange={(checked) => updateMutation.mutate({ active: checked })}
                  />
                  <Label htmlFor="active">Ativo</Label>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="config">simpleConfig</Label>
                  <Textarea
                    id="config"
                    value={configText}
                    onChange={(e) => setConfigText(e.target.value)}
                    rows={24}
                    className="font-mono text-xs"
                  />
                  {configError && <p className="text-sm text-red-500">{configError}</p>}
                  {updateMutation.error && (
                    <p className="text-sm text-red-500">
                      {updateMutation.error instanceof Error ? updateMutation.error.message : "Erro ao salvar"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={handleSaveConfig} disabled={updateMutation.isPending}>
                    Salvar configuração
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      const ok = await confirmDelete({
                        description: "Deletar este agente v2? Esta ação não pode ser desfeita.",
                        variant: "destructive",
                      });
                      if (ok) deleteMutation.mutate();
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <IconTrash className="size-4" /> Deletar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="test">
          <TestTab agentId={id} />
        </TabsContent>

        <TabsContent value="logs">
          <LogsTab agentId={id} />
        </TabsContent>
      </Tabs>
    </AppV2PageShell>
  );
}

function TestTab({ agentId }: { agentId: string }) {
  const [message, setMessage] = React.useState("oi");
  const [result, setResult] = React.useState<TestResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSend() {
    setLoading(true);
    setError(null);
    try {
      const r = await testAgent(agentId, message);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no teste");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Teste de resposta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite uma mensagem..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <Button onClick={handleSend} disabled={loading}>
            <IconSend className="size-4" /> Enviar
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {result && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Tokens: {result.inputTokens} in / {result.outputTokens} out · {result.latencyMs}ms
            </p>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogsTab({ agentId }: { agentId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["ai-agents-v2", agentId, "logs"],
    queryFn: () => fetchLogs(agentId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logs de turnos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum log encontrado.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <Card key={log.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                  <p className="text-sm font-medium">Inbound: {log.inboundText}</p>
                  {log.reply && <p className="text-sm">Reply: {log.reply}</p>}
                  {log.handoff && <p className="text-sm text-amber-600">Handoff</p>}
                  {log.llmOutput && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
                      {JSON.stringify(log.llmOutput, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
