"use client";

import {
  IconActivity,
  IconAlertTriangle,
  IconCopy,
  IconHistory,
  IconPencil,
  IconPlugConnected,
  IconPlugConnectedX,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { KpiCard } from "@/components/crm/kpi-card";
import { CARD_SURFACE_CLASS, LIST_CARD_ROW_CLASS, LIST_CARD_STACK_CLASS } from "@/components/crm/sortable-header";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  FormDialog,
  FormDialogIcon,
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { Switch } from "@/components/ui/switch";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

type ScopeInfo = { id: string; label: string; description: string };

type McpSettingsResponse = {
  config: { enabled: boolean; allowedScopes: string[]; allowAllUsers: boolean; exposeContactPii: boolean };
  canManage: boolean;
  canConnect: boolean;
  cannotConnectReason: string | null;
  /** `null` quando o servidor MCP ainda não tem URL pública configurada. */
  connectionUrl: string | null;
  configError?: string | null;
  scopes: ScopeInfo[];
  status: {
    activeConnections: number;
    calls24h: number;
    errors24h: number;
    lastCallAt: string | null;
    lastError: { createdAt: string; tool: string; errorCode: string | null } | null;
  } | null;
};

type Connection = {
  id: string;
  clientName: string;
  redirectHost: string | null;
  scopes: string[];
  consentedScopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  revokedAt: string | null;
  user: { id: string; name: string; email: string };
  isMine: boolean;
};

type AuditItem = {
  id: string;
  tool: string;
  status: string;
  resultCount: number | null;
  durationMs: number | null;
  errorCode: string | null;
  createdAt: string;
  clientName: string | null;
  userName: string | null;
};

const TOOL_LABEL: Record<string, string> = {
  list_leads: "Listar leads",
  get_lead: "Detalhes do lead",
  list_conversations: "Listar conversas",
  get_conversation_messages: "Mensagens da conversa",
  get_sales_metrics: "Resultados de vendas",
  get_team_performance: "Desempenho da equipe",
  get_campaign_results: "Resultados de campanhas",
  get_pipeline_metrics: "Métricas do funil",
  "oauth.consent": "Conexão autorizada",
  "oauth.revoke": "Conexão revogada",
};

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "muted" }> = {
  ok: { label: "OK", variant: "success" },
  denied: { label: "Negado", variant: "warning" },
  invalid: { label: "Inválido", variant: "warning" },
  rate_limited: { label: "Limite", variant: "warning" },
  error: { label: "Erro", variant: "destructive" },
};

const REASON_TEXT: Record<string, string> = {
  mcp_disabled: "A conexão com assistentes de IA está desativada nesta organização.",
  missing_permission:
    "Seu usuário não tem a permissão “Conectar assistentes de IA”. Peça a um administrador.",
  no_scopes: "Nenhuma permissão de leitura está liberada para assistentes de IA.",
  no_organization: "Sua sessão não está ligada a uma organização.",
};

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function api<T>(path: string, init?: RequestInit, fallback = "Erro na requisição."): Promise<T> {
  return parseApiResponse<T>(await apiFetch(path, init), fallback);
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export default function McpSettings() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["mcp-settings"],
    queryFn: () => api<McpSettingsResponse>("/api/settings/mcp", undefined, "Erro ao carregar a integração."),
  });

  const save = useMutation({
    mutationFn: (patch: Partial<McpSettingsResponse["config"]>) =>
      api<{ config: McpSettingsResponse["config"] }>("/api/settings/mcp", jsonInit("PATCH", patch), "Erro ao salvar."),
    onSuccess: () => {
      toast.success("Configuração salva");
      void qc.invalidateQueries({ queryKey: ["mcp-settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (settings.isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  }
  if (settings.isError || !settings.data) {
    return (
      <div className={cn(CARD_SURFACE_CLASS, "p-6 text-sm text-destructive")}>
        {(settings.error as Error | null)?.message ?? "Erro ao carregar a integração."}
      </div>
    );
  }
  const data = settings.data;

  return (
    <div className="space-y-6">
      <StatusSection data={data} />
      <ConnectSection data={data} />
      {data.canManage ? (
        <AdminSection data={data} saving={save.isPending} onSave={(patch) => save.mutate(patch)} />
      ) : null}
      <ConnectionsSection data={data} />
      <HistorySection canManage={data.canManage} />
    </div>
  );
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <h2 className="font-display text-base font-bold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

function StatusSection({ data }: { data: McpSettingsResponse }) {
  const enabled = data.config.enabled;
  return (
    <section>
      <div className={cn(CARD_SURFACE_CLASS, "flex flex-wrap items-center gap-3 p-4")}>
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full",
            enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {enabled ? <IconPlugConnected className="size-5" /> : <IconPlugConnectedX className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {enabled ? "Integração ativa" : "Integração desativada"}
          </p>
          <p className="text-xs text-muted-foreground">
            Acesso somente leitura, limitado às permissões de cada usuário no CRM.
          </p>
        </div>
        <Badge variant={enabled ? "success" : "muted"}>{enabled ? "Ativo" : "Desativado"}</Badge>
      </div>
      {data.status ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Conexões ativas" value={data.status.activeConnections} icon={<IconPlugConnected className="size-4" />} />
            <KpiCard label="Consultas (24h)" value={data.status.calls24h} icon={<IconActivity className="size-4" />} />
            <KpiCard label="Erros (24h)" value={data.status.errors24h} icon={<IconAlertTriangle className="size-4" />} />
            <KpiCard label="Última consulta" value={fmt(data.status.lastCallAt)} icon={<IconHistory className="size-4" />} wrapValue />
          </div>
          {data.status.lastError ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Último erro: {TOOL_LABEL[data.status.lastError.tool] ?? data.status.lastError.tool} em{" "}
              {fmt(data.status.lastError.createdAt)}
              {data.status.lastError.errorCode ? ` (${data.status.lastError.errorCode})` : ""}.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const CLIENT_GUIDES: { id: string; label: string; steps: (url: string) => React.ReactNode[] }[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: () => [
      <>No ChatGPT, abra <b>Configurações › Apps e conectores</b>.</>,
      <>Em <b>Configurações avançadas</b>, ative o <b>Modo de desenvolvedor</b> (necessário para conectores personalizados).</>,
      <>Clique em <b>Criar</b>, dê um nome (ex.: “CRM Bwipo”), cole a URL acima e escolha autenticação <b>OAuth</b>.</>,
      <>Clique em <b>Conectar</b>: você será levado ao CRM para entrar e autorizar o acesso.</>,
    ],
  },
  {
    id: "claude",
    label: "Claude",
    steps: () => [
      <>No Claude, abra <b>Configurações › Conectores</b>.</>,
      <>Clique em <b>Adicionar conector personalizado</b>, dê um nome e cole a URL acima.</>,
      <>Clique em <b>Conectar</b>, entre no CRM e autorize o acesso.</>,
    ],
  },
  {
    id: "outros",
    label: "Cursor e outros",
    steps: (url) => [
      <>Adicione um servidor MCP remoto (HTTP) com a URL acima. No Cursor, em <code className="rounded bg-muted px-1">mcp.json</code>:</>,
      <pre key="cfg" className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`{\n  "mcpServers": {\n    "bwipo-crm": { "url": "${url}" }\n  }\n}`}</pre>,
      <>Na primeira conexão o cliente abre o navegador para você entrar no CRM e autorizar.</>,
    ],
  },
];

function ConnectSection({ data }: { data: McpSettingsResponse }) {
  const [guide, setGuide] = useState(CLIENT_GUIDES[0].id);
  const current = CLIENT_GUIDES.find((g) => g.id === guide) ?? CLIENT_GUIDES[0];
  if (!data.connectionUrl) {
    return (
      <section>
        <SectionTitle icon={<IconPlugConnected className="size-5" />} title="Como conectar" />
        <div className={cn(CARD_SURFACE_CLASS, "flex gap-3 p-4 text-sm text-foreground")}>
          <IconAlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">O endereço do servidor MCP ainda não foi configurado.</p>
            <p className="text-muted-foreground">
              {data.canManage ? (
                <>
                  Defina a variável <code className="rounded bg-muted px-1">MCP_PUBLIC_URL</code> (ex.:{" "}
                  <code className="rounded bg-muted px-1">https://mcp.seudominio.com</code>) no serviço da API e no
                  serviço MCP, e reinicie-os. Sem ela, os assistentes não conseguem se conectar.
                </>
              ) : (
                "Peça a um administrador para concluir a configuração da integração."
              )}
            </p>
          </div>
        </div>
      </section>
    );
  }
  const connectionUrl = data.connectionUrl;
  return (
    <section>
      <SectionTitle
        icon={<IconPlugConnected className="size-5" />}
        title="Como conectar"
        description="Não é preciso copiar senhas ou chaves: a conexão usa o seu login do CRM."
      />
      <div className={cn(CARD_SURFACE_CLASS, "space-y-4 p-4")}>
        <div>
          <span className="text-xs font-medium text-muted-foreground">URL de conexão</span>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              {connectionUrl}
            </code>
            <ButtonGlass
              variant="glass"
              onClick={() =>
                void navigator.clipboard.writeText(connectionUrl).then(
                  () => toast.success("URL copiada"),
                  () => toast.error("Falha ao copiar"),
                )
              }
            >
              <IconCopy className="size-4" />
              <span className="hidden sm:inline">Copiar</span>
            </ButtonGlass>
          </div>
        </div>
        {!data.canConnect ? (
          <p className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
            <IconShieldLock className="size-5 shrink-0 text-muted-foreground" />
            {REASON_TEXT[data.cannotConnectReason ?? ""] ?? "Você ainda não pode conectar assistentes."}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2" role="tablist">
          {CLIENT_GUIDES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === guide}
              onClick={() => setGuide(g.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                g.id === guide
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
          {current.steps(connectionUrl).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ScopeCheckboxes({
  scopes,
  value,
  onChange,
  disabled,
  only,
}: {
  scopes: ScopeInfo[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  only?: string[];
}) {
  const list = only ? scopes.filter((s) => only.includes(s.id)) : scopes;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {list.map((s) => {
        const checked = value.includes(s.id);
        return (
          <li key={s.id}>
            <label
              className={cn(
                "flex h-full cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3",
                checked && "border-primary/40 bg-primary/5",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--brand-primary)]"
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(checked ? value.filter((v) => v !== s.id) : [...value, s.id])}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.description}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function AdminSection({
  data,
  saving,
  onSave,
}: {
  data: McpSettingsResponse;
  saving: boolean;
  onSave: (patch: Partial<McpSettingsResponse["config"]>) => void;
}) {
  const cfg = data.config;
  return (
    <section>
      <SectionTitle
        icon={<IconShieldLock className="size-5" />}
        title="Configuração da organização"
        description="Somente administradores. As mudanças valem na próxima consulta de cada assistente."
      />
      <div className={cn(CARD_SURFACE_CLASS, "divide-y divide-border px-4")}>
        <SwitchRow
          title="Permitir assistentes de IA (MCP)"
          description="Desligar bloqueia imediatamente todas as conexões da organização."
          checked={cfg.enabled}
          disabled={saving}
          onChange={(v) => onSave({ enabled: v })}
        />
        <SwitchRow
          title="Todos os usuários podem conectar"
          description="Desligado: só quem tem a permissão “Conectar assistentes de IA” (Permissões e funções). Operadores acessam apenas os negócios em que são responsáveis e as conversas deles; gestores e administradores, o que já veem no CRM."
          checked={cfg.allowAllUsers}
          disabled={saving}
          onChange={(v) => onSave({ allowAllUsers: v })}
        />
        <SwitchRow
          title="Mostrar telefone e e-mail completos"
          description="Desligado (recomendado): os assistentes recebem esses dados mascarados."
          checked={cfg.exposeContactPii}
          disabled={saving}
          onChange={(v) => onSave({ exposeContactPii: v })}
        />
        <div className="py-3">
          <p className="mb-2 text-sm font-medium text-foreground">Dados que podem ser consultados</p>
          <ScopeCheckboxes
            scopes={data.scopes}
            value={cfg.allowedScopes}
            disabled={saving}
            onChange={(next) => onSave({ allowedScopes: next })}
          />
        </div>
      </div>
    </section>
  );
}

function ConnectionsSection({ data }: { data: McpSettingsResponse }) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const { confirm, dialog } = useConfirm();
  const scopeLabel = new Map(data.scopes.map((s) => [s.id, s.label]));

  const list = useQuery({
    queryKey: ["mcp-connections", showAll],
    queryFn: () =>
      api<{ items: Connection[] }>(
        `/api/settings/mcp/connections${showAll ? "?all=1" : ""}`,
        undefined,
        "Erro ao listar conexões.",
      ),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["mcp-connections"] });
    void qc.invalidateQueries({ queryKey: ["mcp-settings"] });
  };

  const updateScopes = useMutation({
    mutationFn: ({ id, scopes }: { id: string; scopes: string[] }) =>
      api(`/api/settings/mcp/connections/${id}`, jsonInit("PATCH", { scopes }), "Erro ao salvar."),
    onSuccess: () => {
      toast.success("Permissões da conexão atualizadas");
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const revoke = (c: Connection) =>
    void confirm({
      title: "Revogar conexão?",
      description: `${c.clientName} perde o acesso ao CRM imediatamente. Para usar de novo, será preciso conectar e autorizar outra vez.`,
      confirmLabel: "Revogar",
      pendingLabel: "Revogando…",
      destructive: true,
      action: async () => {
        try {
          await api(`/api/settings/mcp/connections/${c.id}`, { method: "DELETE" }, "Erro ao revogar.");
          toast.success("Conexão revogada");
          refresh();
        } catch (e) {
          toast.error((e as Error).message);
          throw e;
        }
      },
    });

  const items = list.data?.items ?? [];
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          icon={<IconPlugConnected className="size-5" />}
          title="Conexões autorizadas"
          description="Assistentes com acesso ao CRM. Revogue o que não reconhecer."
        />
        {data.canManage ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showAll} onCheckedChange={setShowAll} />
            Todas da organização
          </label>
        ) : null}
      </div>
      {list.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : list.isError ? (
        <div className={cn(CARD_SURFACE_CLASS, "p-4 text-sm text-destructive")}>
          {(list.error as Error).message}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconPlugConnectedX className="size-6" />}
          title="Nenhuma conexão"
          description="Quando você conectar o ChatGPT, o Claude ou outro assistente, ele aparece aqui."
          className={CARD_SURFACE_CLASS}
        />
      ) : (
        <ul className={LIST_CARD_STACK_CLASS}>
          {items.map((c) => (
            <li key={c.id} className={cn(LIST_CARD_ROW_CLASS, "flex flex-col gap-3 sm:flex-row sm:items-center")}>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{c.clientName}</span>
                  {c.redirectHost ? (
                    <span className="text-xs text-muted-foreground">({c.redirectHost})</span>
                  ) : null}
                  {c.lastError ? <Badge variant="warning">Erro recente</Badge> : null}
                </div>
                {showAll ? (
                  <p className="text-xs text-muted-foreground">Usuário: {c.user.name || c.user.email}</p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {c.scopes.map((s) => (
                    <Badge key={s} variant="secondary">{scopeLabel.get(s) ?? s}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Autorizada em {fmt(c.createdAt)} · Último acesso {fmt(c.lastUsedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ButtonGlass
                  variant="glass"
                  onClick={() => {
                    setEditing(c);
                    setDraft(c.scopes);
                  }}
                >
                  <IconPencil className="size-4" />
                  Permissões
                </ButtonGlass>
                <ButtonGlass variant="danger" onClick={() => revoke(c)}>
                  <IconTrash className="size-4" />
                  Revogar
                </ButtonGlass>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        busy={updateScopes.isPending}
        title="Permissões da conexão"
        description="Reduza o que este assistente pode consultar. Para ampliar, conecte de novo pelo assistente."
        icon={
          <FormDialogIcon>
            <IconShieldLock className="size-4" />
          </FormDialogIcon>
        }
        footer={
          <>
            <ButtonGlass variant="glass" className={formDialogCancelClass} onClick={() => setEditing(null)}>
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              variant="primary"
              className={formDialogPrimaryClass}
              disabled={draft.length === 0 || updateScopes.isPending}
              onClick={() => editing && updateScopes.mutate({ id: editing.id, scopes: draft })}
            >
              {updateScopes.isPending ? "Salvando…" : "Salvar"}
            </ButtonGlass>
          </>
        }
      >
        {editing ? (
          <ScopeCheckboxes scopes={data.scopes} only={editing.consentedScopes} value={draft} onChange={setDraft} />
        ) : null}
      </FormDialog>
      {dialog}
    </section>
  );
}

function HistorySection({ canManage }: { canManage: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ["mcp-audit", showAll],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ limit: "30" });
      if (showAll) sp.set("all", "1");
      if (pageParam) sp.set("cursor", pageParam);
      return api<{ items: AuditItem[]; nextCursor: string | null }>(
        `/api/settings/mcp/audit?${sp.toString()}`,
        undefined,
        "Erro ao carregar o histórico.",
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          icon={<IconHistory className="size-5" />}
          title="Histórico de consultas"
          description="O que os assistentes consultaram. O conteúdo retornado não é armazenado."
        />
        {canManage ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showAll} onCheckedChange={setShowAll} />
            Todas da organização
          </label>
        ) : null}
      </div>
      {history.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconHistory className="size-6" />}
          title="Nenhuma consulta ainda"
          description="As consultas feitas pelos assistentes aparecem aqui."
          className={CARD_SURFACE_CLASS}
        />
      ) : (
        <>
          <ul className={LIST_CARD_STACK_CLASS}>
            {items.map((it) => {
              const badge = STATUS_BADGE[it.status] ?? { label: it.status, variant: "muted" as const };
              return (
                <li key={it.id} className={cn(LIST_CARD_ROW_CLASS, "flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5")}>
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmt(it.createdAt)}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                    {TOOL_LABEL[it.tool] ?? it.tool}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {[it.clientName, showAll ? it.userName : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {it.resultCount !== null ? `${it.resultCount} resultado(s)` : ""}
                    {it.durationMs !== null ? ` · ${it.durationMs} ms` : ""}
                  </span>
                  <Badge variant={badge.variant} title={it.errorCode ?? undefined}>
                    {badge.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
          {history.hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <ButtonGlass
                variant="glass"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                {history.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
              </ButtonGlass>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
