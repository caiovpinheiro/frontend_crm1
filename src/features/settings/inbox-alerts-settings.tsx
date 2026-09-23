"use client";

/**
 * Configurações > Notificações > Alertas do inbox (só ADMIN).
 *
 * Por departamento e por usuário: para cada tipo de conversa (minhas,
 * fila do departamento, outras visíveis), quais canais avisam (som,
 * toast, Windows — página e push —, ícone da aba).
 *
 * Resolução (igual ao backend `lib/inbox-alert-config.ts`): config do
 * usuário vale inteira; senão soma (OR) dos departamentos configurados
 * dele; senão o padrão.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconChevronDown as ChevronDown, IconLoader2 as Loader2 } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  INBOX_ALERT_CHANNELS,
  INBOX_ALERT_KINDS,
  type InboxAlertChannel,
  type InboxAlertConfig,
  type InboxAlertKind,
} from "@/features/inbox-v2/inbox-alert-audience";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; config: InboxAlertConfig | null };
type UserRow = Row & { email?: string | null; departmentIds: string[] };
type SettingsData = {
  defaults: InboxAlertConfig;
  departments: Row[];
  users: UserRow[];
};
type Scope = "department" | "user";

const QUERY_KEY = ["settings", "inbox-alerts"];

const KIND_LABEL: Record<InboxAlertKind, { title: string; hint: string }> = {
  mine: { title: "Minhas conversas", hint: "Atribuídas ao usuário" },
  queue: { title: "Fila do departamento", hint: "Sem responsável, num departamento dele" },
  others: { title: "Outras que ele vê", hint: "Outro agente, fila da IA, sem departamento" },
};

const CHANNEL_LABEL: Record<InboxAlertChannel, string> = {
  sound: "Som",
  toast: "Toast",
  native: "Windows",
  tab: "Aba",
};

async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch(apiUrl("/api/settings/inbox-alerts"));
  if (!res.ok) throw new Error(`inbox-alerts ${res.status}`);
  return (await res.json()) as SettingsData;
}

async function saveConfig(body: { scope: Scope; id: string; config: InboxAlertConfig | null }) {
  const res = await fetch(apiUrl("/api/settings/inbox-alerts"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "Não foi possível salvar.");
  }
}

function orConfigs(configs: InboxAlertConfig[]): InboxAlertConfig {
  const out = structuredClone(configs[0]);
  for (const cfg of configs.slice(1)) {
    for (const kind of INBOX_ALERT_KINDS) {
      for (const ch of INBOX_ALERT_CHANNELS) out[kind][ch] ||= cfg[kind][ch];
    }
  }
  return out;
}

/** Config herdada pelo usuário sem config própria (e de onde vem). */
function inheritedForUser(
  user: UserRow,
  departments: Row[],
  defaults: InboxAlertConfig,
): { config: InboxAlertConfig; source: string } {
  const configured = departments.filter((d) => d.config && user.departmentIds.includes(d.id));
  if (configured.length === 0) return { config: defaults, source: "Padrão" };
  return {
    config: orConfigs(configured.map((d) => d.config!)),
    source: `Departamento: ${configured.map((d) => d.name).join(", ")}`,
  };
}

function summary(config: InboxAlertConfig): string {
  const parts = INBOX_ALERT_KINDS.map((kind) => {
    const on = INBOX_ALERT_CHANNELS.filter((ch) => config[kind][ch]).map((ch) => CHANNEL_LABEL[ch]);
    return on.length ? `${KIND_LABEL[kind].title}: ${on.join(", ")}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nenhum alerta";
}

export function InboxAlertsSettings() {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 30_000,
  });

  return (
    // Âncora do atalho "Alertas do inbox" em Configurações > Comunicação.
    <div id="alertas-do-inbox" className="min-w-0 scroll-mt-4">
      <GlassCard variant="overlay" className="min-w-0 overflow-hidden p-3.5 sm:p-6">
        <h2 className="text-pretty font-display text-base font-extrabold tracking-tight text-[var(--text-primary)] sm:text-lg">
          Alertas do inbox
        </h2>
        <p className="mt-1 text-pretty break-words text-sm text-[var(--text-muted)]">
          Como cada pessoa é avisada de mensagem recebida. A configuração do usuário vale
          inteira; sem ela, vale a soma dos departamentos configurados dele; sem nenhuma,
          o padrão. &quot;Windows&quot; inclui o push com o navegador fechado. &quot;Aba&quot; é o
          ícone da aba onde a conversa está aberta, que vira um balão verde com "(1)" no título fora de foco. O agente
          ainda pode silenciar o som no próprio computador.
        </p>

        {isLoading ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : error || !data ? (
          <p className="mt-5 text-sm text-[var(--color-destructive)]">
            Não foi possível carregar as configurações.
          </p>
        ) : (
          <Tabs defaultValue="departments" className="mt-5">
            <TabsList>
              <TabsTrigger value="departments">Departamentos</TabsTrigger>
              <TabsTrigger value="users">Usuários</TabsTrigger>
            </TabsList>
            <TabsContent value="departments" className="mt-3 flex flex-col gap-2">
              {data.departments.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Nenhum departamento.</p>
              ) : (
                data.departments.map((d) => (
                  <ConfigRow
                    key={d.id}
                    scope="department"
                    id={d.id}
                    name={d.name}
                    config={d.config}
                    inherited={{ config: data.defaults, source: "Padrão" }}
                  />
                ))
              )}
            </TabsContent>
            <TabsContent value="users" className="mt-3">
              <UsersList data={data} />
            </TabsContent>
          </Tabs>
        )}
      </GlassCard>
    </div>
  );
}

function UsersList({ data }: { data: SettingsData }) {
  const [query, setQuery] = useState("");
  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q),
    );
  }, [data.users, query]);

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar usuário…"
        className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40"
      />
      {users.map((u) => (
        <ConfigRow
          key={u.id}
          scope="user"
          id={u.id}
          name={u.name}
          subtitle={u.email ?? undefined}
          config={u.config}
          inherited={inheritedForUser(u, data.departments, data.defaults)}
        />
      ))}
    </div>
  );
}

function ConfigRow({
  scope,
  id,
  name,
  subtitle,
  config,
  inherited,
}: {
  scope: Scope;
  id: string;
  name: string;
  subtitle?: string;
  config: InboxAlertConfig | null;
  inherited: { config: InboxAlertConfig; source: string };
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<InboxAlertConfig>(config ?? inherited.config);

  const mutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: (_d, vars) => {
      toast.success(vars.config ? "Alertas salvos." : "Voltou a herdar.");
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      if (!vars.config) setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const effective = config ?? inherited.config;
  const toggle = () => {
    if (!open) setDraft(structuredClone(effective));
    setOpen((v) => !v);
  };
  const setChannel = (kind: InboxAlertKind, ch: InboxAlertChannel, value: boolean) =>
    setDraft((prev) => ({ ...prev, [kind]: { ...prev[kind], [ch]: value } }));

  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{name}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                config
                  ? "bg-primary/10 text-primary"
                  : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
              )}
            >
              {config ? "Personalizado" : `Herda · ${inherited.source}`}
            </span>
          </div>
          {subtitle ? (
            <p className="truncate text-xs text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{summary(effective)}</p>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="border-t border-[var(--glass-border)] px-4 py-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-1.5 pr-3 font-medium">Conversa</th>
                  {INBOX_ALERT_CHANNELS.map((ch) => (
                    <th key={ch} className="px-2 py-1.5 text-center font-medium">
                      {CHANNEL_LABEL[ch]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INBOX_ALERT_KINDS.map((kind) => (
                  <tr key={kind} className="border-t border-[var(--glass-border)]/60">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {KIND_LABEL[kind].title}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">{KIND_LABEL[kind].hint}</div>
                    </td>
                    {INBOX_ALERT_CHANNELS.map((ch) => (
                      <td key={ch} className="px-2 py-2 text-center">
                        <Switch
                          checked={draft[kind][ch]}
                          onCheckedChange={(v) => setChannel(kind, ch, v)}
                          aria-label={`${KIND_LABEL[kind].title}: ${CHANNEL_LABEL[ch]}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {config ? (
              <ButtonGlass
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ scope, id, config: null })}
              >
                Voltar a herdar
              </ButtonGlass>
            ) : null}
            <ButtonGlass
              size="sm"
              variant="primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ scope, id, config: draft })}
            >
              {mutation.isPending ? "Salvando…" : "Salvar"}
            </ButtonGlass>
          </div>
        </div>
      ) : null}
    </div>
  );
}
