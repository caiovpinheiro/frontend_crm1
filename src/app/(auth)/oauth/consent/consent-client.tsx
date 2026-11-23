"use client";

import {
  IconAlertTriangle,
  IconCheck,
  IconLock,
  IconPlugConnected,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Parâmetros OAuth repassados como vieram — o backend revalida tudo. */
const OAUTH_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "state",
  "resource",
] as const;

type ConsentInfo = {
  client: { name: string; uri: string | null; logoUri: string | null; redirectHost: string };
  user: { name: string | null; email: string | null };
  organization: string | null;
  canConnect: boolean;
  /** "own" = operador: o assistente só vê os negócios e conversas dele. */
  accessLevel?: "own" | "full";
  cannotConnectReason: string | null;
  scopes: { id: string; label: string; description: string; allowedByOrg: boolean }[];
};

const REASON_TEXT: Record<string, string> = {
  mcp_disabled:
    "A conexão com assistentes de IA está desativada na sua organização. Peça a um administrador para ativá-la em Configurações › Assistentes de IA (MCP).",
  missing_permission:
    "Seu usuário não tem permissão para conectar assistentes de IA. Peça a um administrador.",
  no_scopes: "Nenhuma permissão de leitura está liberada para assistentes de IA na sua organização.",
  no_organization: "Sua sessão não está ligada a uma organização.",
};

export default function ConsentClient() {
  const search = useSearchParams();
  const params = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of OAUTH_PARAMS) {
      const v = search.get(k);
      if (v) out[k] = v;
    }
    return out;
  }, [search]);

  const query = useQuery({
    queryKey: ["mcp-consent", params],
    queryFn: async () =>
      parseApiResponse<ConsentInfo>(
        await apiFetch(`/api/settings/mcp/consent?${new URLSearchParams(params).toString()}`),
        "Não foi possível validar o pedido de conexão.",
      ),
    retry: false,
  });

  // `null` = ainda não mexeu: todos os escopos liberados pela org marcados.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected = useMemo(
    () =>
      picked ??
      new Set((query.data?.scopes ?? []).filter((s) => s.allowedByOrg).map((s) => s.id)),
    [picked, query.data],
  );

  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "allow" : "deny");
    setError(null);
    try {
      const res = await parseApiResponse<{ redirectTo: string }>(
        await apiFetch("/api/settings/mcp/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params, approve, scopes: [...selected] }),
        }),
        "Não foi possível concluir a autorização.",
      );
      window.location.assign(res.redirectTo);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <GlassCard className="w-full max-w-lg space-y-6 p-6 sm:p-8">
        {query.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Validando pedido…</p>
        ) : query.isError || !query.data ? (
          <div className="space-y-3 text-center">
            <IconAlertTriangle className="mx-auto size-10 text-destructive" />
            <h1 className="font-display text-xl font-bold text-foreground">Pedido de conexão inválido</h1>
            <p className="text-sm text-muted-foreground">
              {(query.error as Error | null)?.message ??
                "Volte ao seu assistente de IA e inicie a conexão novamente."}
            </p>
          </div>
        ) : (
          <ConsentBody
            info={query.data}
            selected={selected}
            onToggle={(id) =>
              setPicked(() => {
                const next = new Set(selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            busy={busy}
            error={error}
            onDecide={decide}
          />
        )}
      </GlassCard>
    </main>
  );
}

function ConsentBody({
  info,
  selected,
  onToggle,
  busy,
  error,
  onDecide,
}: {
  info: ConsentInfo;
  selected: Set<string>;
  onToggle: (id: string) => void;
  busy: "allow" | "deny" | null;
  error: string | null;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <>
      <header className="space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconPlugConnected className="size-6" />
        </div>
        <h1 className="font-display text-xl font-bold leading-tight text-foreground">
          <span className="break-words">{info.client.name}</span> quer acessar seu CRM
        </h1>
        <p className="text-sm text-muted-foreground">
          Conectando como <strong className="text-foreground">{info.user.name ?? info.user.email}</strong>
          {info.organization ? (
            <>
              {" "}em <strong className="text-foreground">{info.organization}</strong>
            </>
          ) : null}
          .
        </p>
        <p className="text-xs text-muted-foreground">
          Após autorizar, você volta para <code className="rounded bg-muted px-1">{info.client.redirectHost}</code>.
          Só continue se foi você quem iniciou esta conexão.
        </p>
      </header>

      {!info.canConnect ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm text-foreground">
            <IconLock className="size-5 shrink-0 text-muted-foreground" />
            <p>{REASON_TEXT[info.cannotConnectReason ?? ""] ?? "Conexão indisponível."}</p>
          </div>
          <div className="flex justify-end">
            <ButtonGlass variant="glass" disabled={busy !== null} onClick={() => onDecide(false)}>
              Voltar ao assistente
            </ButtonGlass>
          </div>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">O assistente poderá apenas consultar:</h2>
            <ul className="space-y-2">
              {info.scopes.map((s) => {
                const disabled = !s.allowedByOrg;
                const checked = selected.has(s.id);
                return (
                  <li key={s.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors",
                        checked && "border-primary/40 bg-primary/5",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--brand-primary)]"
                        checked={checked}
                        disabled={disabled || busy !== null}
                        onChange={() => onToggle(s.id)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{s.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {disabled ? "Não liberado pela sua organização." : s.description}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="flex gap-3 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <IconShieldCheck className="size-5 shrink-0 text-primary" />
            <p>
              Somente leitura: o assistente não altera dados e não envia mensagens.{" "}
              {info.accessLevel === "own"
                ? "Ele vê apenas os negócios em que você é o responsável e as conversas desses clientes ou atribuídas a você."
                : "Ele só vê o que você já pode ver no CRM."}{" "}
              Você pode revogar o acesso a qualquer momento em Configurações › Assistentes de IA.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ButtonGlass variant="glass" disabled={busy !== null} onClick={() => onDecide(false)}>
              {busy === "deny" ? "Cancelando…" : "Cancelar"}
            </ButtonGlass>
            <ButtonGlass
              variant="primary"
              disabled={busy !== null || selected.size === 0}
              onClick={() => onDecide(true)}
            >
              <IconCheck className="size-4" />
              {busy === "allow" ? "Autorizando…" : "Permitir acesso"}
            </ButtonGlass>
          </div>
        </>
      )}
    </>
  );
}
