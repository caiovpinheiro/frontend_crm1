"use client";

import { apiUrl, getApiBaseUrl } from "@/lib/api";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { IconCheck as Check, IconCopy as Copy, IconExternalLink as ExternalLink, IconEye as Eye, IconEyeOff as EyeOff, IconLoader2 as Loader2, IconRefresh as RefreshCw, IconShieldCheck as ShieldCheck, IconWebhook as Webhook } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { cn } from "@/lib/utils";
import { useEmbeddedSignup } from "@/hooks/use-embedded-signup";

import { ChannelPipelineSelect } from "./channel-pipeline-select";
import type { ApiChannel } from "./types";
import { parseChannelConfigRecord } from "./types";

function maskSecret(value: string): string {
  const t = value.trim();
  if (t.length <= 8) return "••••••••";
  return `••••••••${t.slice(-4)}`;
}

/**
 * Gera verifyToken random de 40 chars (alfanumerico). Meta aceita ate
 * 256 chars; 40 da entropia mais que suficiente sem ficar gigante na UI.
 */
function generateVerifyToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

const META_DOCS_URL =
  "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started";

type StatusResponse = { status: string; phoneNumber?: string };

async function fetchStatus(channelId: string): Promise<StatusResponse> {
  const res = await fetch(apiUrl(`/api/channels/${channelId}/status`));
  const data = (await res.json()) as StatusResponse & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? "Erro ao testar conexão.");
  }
  return data;
}

export type MetaConfigPanelProps = {
  channel: ApiChannel;
  onSaved?: () => void;
};

export function MetaConfigPanel({ channel, onSaved }: MetaConfigPanelProps) {
  const queryClient = useQueryClient();
  const cfg = useMemo(
    () => parseChannelConfigRecord(channel.config),
    [channel.config]
  );

  const initialToken = typeof cfg.accessToken === "string" ? cfg.accessToken : "";
  const initialPnId =
    typeof cfg.phoneNumberId === "string" ? cfg.phoneNumberId : "";
  const initialWaba =
    typeof cfg.businessAccountId === "string" ? cfg.businessAccountId : "";
  const initialAppName =
    typeof cfg.appName === "string" ? cfg.appName : "";
  const initialAppSecret =
    typeof cfg.appSecret === "string" ? cfg.appSecret : "";
  const initialVerifyToken =
    typeof cfg.verifyToken === "string" ? cfg.verifyToken : "";
  const webhookId =
    typeof cfg.webhookId === "string" ? cfg.webhookId.trim() : "";
  const isInstagram = channel.type === "INSTAGRAM";
  // Confirmação de leitura (visto azul) — default LIGADO (ausente = envia).
  const initialSendReadReceipts = cfg.sendReadReceipts !== false;
  const wasEmbeddedSignup = cfg.embeddedSignup === true;
  // Canal do "App Meta global do CRM" (conexao manual token-based ou embedded
  // signup): a Meta entrega o webhook usando o App Secret / Verify Token
  // globais do CRM — o cliente NAO precisa mexer no painel Meta. Detectamos
  // pela ausencia de appSecret proprio no config (embedded signup nunca grava;
  // canais criados via /api/channels/manual-cloud tambem nao).
  // Instagram da empresa usa o App Secret do produto Instagram — nunca o
  // webhook "automatico" do App do CRM.
  const isGlobalApp = !isInstagram && !initialAppSecret;

  const [channelName, setChannelName] = useState(channel.name);
  const [defaultPipelineId, setDefaultPipelineId] = useState<string | null>(
    channel.defaultPipelineId ?? null,
  );
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState(initialVerifyToken);
  const [phoneNumberId, setPhoneNumberId] = useState(initialPnId);
  const [businessAccountId, setBusinessAccountId] = useState(initialWaba);
  const [appName, setAppName] = useState(initialAppName);
  const [sendReadReceipts, setSendReadReceipts] = useState(
    initialSendReadReceipts,
  );
  const [showTokenHint, setShowTokenHint] = useState(!!initialToken);
  const [revealAccessToken, setRevealAccessToken] = useState(false);
  const [revealAppSecret, setRevealAppSecret] = useState(false);
  const [esReconnecting, setEsReconnecting] = useState(false);
  const [esError, setEsError] = useState<string | null>(null);
  const [esSuccess, setEsSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // Modal de webhook (Callback URL / Verify Token / docs Meta). Antes esse
  // bloco ficava inline e deixava a config verbosa — agora vive atras de um
  // botao "Webhook".
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [manualReconnecting, setManualReconnecting] = useState(false);
  const [manualReconnectError, setManualReconnectError] = useState<string | null>(null);
  const [manualReconnectSuccess, setManualReconnectSuccess] = useState(false);

  const embeddedSignup = useEmbeddedSignup();

  useEffect(() => {
    setChannelName(channel.name);
    setDefaultPipelineId(channel.defaultPipelineId ?? null);
    setPhoneNumberId(initialPnId);
    setBusinessAccountId(initialWaba);
    setAppName(initialAppName);
    setSendReadReceipts(initialSendReadReceipts);
    setAccessToken("");
    setAppSecret("");
    setVerifyToken(initialVerifyToken);
    setShowTokenHint(!!initialToken);
  }, [channel.id, channel.name, channel.defaultPipelineId, initialPnId, initialWaba, initialAppName, initialToken, initialAppSecret, initialVerifyToken, initialSendReadReceipts]);

  // A URL do webhook PRECISA apontar para o backend (não para o frontend).
  // A Meta entrega o callback HTTP direto no backend — o frontend não tem
  // /api/webhooks/meta. Em produção, NEXT_PUBLIC_API_BASE_URL é o domínio
  // público do backend (ex.: https://backend-backend.v74knz.easypanel.host).
  // Em dev sem essa env setada, cai pro window.location.origin (que aí
  // ativa o rewrite do Next pro backend local).
  const webhookBase =
    getApiBaseUrl() ||
    (typeof window !== "undefined" ? window.location.origin : "");

  // URL scoped por org (rota nova multi-tenant). Quando organizationSlug nao
  // veio (channel antigo carregado de cache?), cai pra rota legacy ate o
  // proximo refetch. Apos Deploy 2 a rota legacy sai e isso vira erro
  // visivel — desejavel pra forcar refresh do cache.
  const webhookPathId = webhookId || channel.organizationSlug;
  const webhookUrl = webhookPathId
    ? `${webhookBase}/api/webhooks/meta/${webhookPathId}`
    : `${webhookBase}/api/webhooks/meta`;

  const copyToClipboard = (value: string, fieldName: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  const testQuery = useQuery({
    queryKey: ["channel-status-test", channel.id],
    enabled: false,
    queryFn: () => fetchStatus(channel.id),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextConfig = {
        ...cfg,
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim(),
        appName: appName.trim() || undefined,
        sendReadReceipts,
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
        ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
        ...(verifyToken.trim() ? { verifyToken: verifyToken.trim() } : {}),
        ...(webhookId ? { webhookId } : {}),
      };
      const res = await fetch(apiUrl(`/api/channels/${channel.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: channelName.trim(),
          config: nextConfig,
          defaultPipelineId,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Erro ao salvar.");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
      void queryClient.invalidateQueries({ queryKey: ["channel", channel.id] });
      setAccessToken("");
      setShowTokenHint(true);
      onSaved?.();
    },
  });

  const statusOk = testQuery.data?.status === "CONNECTED";
  const statusBad = testQuery.data?.status === "FAILED";

  const handleManualReconnect = () => {
    setManualReconnectError(null);
    setManualReconnectSuccess(false);
    setManualReconnecting(true);
    const tokenToUse = accessToken.trim() || initialToken;
    if (!tokenToUse) {
      setManualReconnectError(
        "Informe o Token de acesso abaixo para reconectar.",
      );
      setManualReconnecting(false);
      return;
    }
    fetch(
      apiUrl(isInstagram ? "/api/channels/instagram/manual" : "/api/channels/manual-cloud"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isInstagram
            ? {
                channelId: channel.id,
                name: channelName.trim() || channel.name,
                accessToken: tokenToUse,
                appSecret: appSecret.trim() || undefined,
                verifyToken: verifyToken.trim() || undefined,
                webhookId: webhookId || undefined,
              }
            : {
                channelId: channel.id,
                name: channelName.trim() || channel.name,
                accessToken: tokenToUse,
                phoneNumberId: phoneNumberId.trim(),
                wabaId: businessAccountId.trim(),
              },
        ),
      },
    )
      .then(async (res) => {
        const data = (await res.json()) as { message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? "Erro ao reconectar.");
        }
        setManualReconnectSuccess(true);
        setAccessToken("");
        void queryClient.invalidateQueries({ queryKey: ["channels"] });
        void queryClient.invalidateQueries({
          queryKey: ["channel", channel.id],
        });
        onSaved?.();
      })
      .catch((err: unknown) => {
        setManualReconnectError(
          err instanceof Error ? err.message : "Erro ao reconectar.",
        );
      })
      .finally(() => setManualReconnecting(false));
  };

  return (
    <div className="space-y-5">
      {/* Header compacto: origem/status ao inves do "Configuração atual" que
          duplicava os inputs do formulario abaixo. Origem = badge visual. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {isInstagram ? "Instagram Direct" : "Meta Cloud API"}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {isInstagram
              ? "Token e webhook do App da empresa. Valores atuais ficam mascarados."
              : "Credenciais do WhatsApp Business Platform. Valores atuais ficam mascarados."}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            isGlobalApp
              ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]"
              : "border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
          )}
        >
          <ShieldCheck className="size-3" />
          {isGlobalApp
            ? wasEmbeddedSignup
              ? "Embedded Signup"
              : "App CRM (global)"
            : "App próprio"}
        </span>
      </div>

      {isGlobalApp ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-success)]/25 bg-[var(--color-success)]/[0.04] p-3 text-xs">
          <div className="flex items-start gap-2">
            <ShieldCheck className="size-4 shrink-0 text-[var(--color-success)]" />
            <div className="flex-1 space-y-2">
              <p className="text-[var(--text-primary)]">
                <span className="font-semibold">Webhook automático ativo.</span>{" "}
                Assinatura gerenciada pelo App do CRM — nada precisa ser
                configurado no painel Meta.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={manualReconnecting}
                  onClick={handleManualReconnect}
                >
                  {manualReconnecting ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Reassinar webhook
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setWebhookOpen(true)}
                >
                  <Webhook className="size-3" />
                  Webhook manual
                </Button>
                {manualReconnectSuccess && (
                  <span className="text-[11px] font-medium text-[var(--color-success)]">
                    ✓ Webhook reassinado
                  </span>
                )}
              </div>
              {manualReconnectError && (
                <p className="text-[11px] text-[var(--color-danger-text)]">
                  {manualReconnectError}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!isInstagram && embeddedSignup.isConfigured ? (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {wasEmbeddedSignup ? "Reconectar" : "Conectar"} via Facebook
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {wasEmbeddedSignup
                  ? "Atualize o token e credenciais automaticamente."
                  : "Obtenha credenciais automaticamente via Embedded Signup."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={esReconnecting}
              onClick={() => {
                setEsError(null);
                setEsSuccess(false);
                setEsReconnecting(true);
                embeddedSignup
                  .launchSignup()
                  .then(async (result) => {
                    const res = await fetch(apiUrl("/api/channels/embedded-signup"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        code: result.code,
                        phoneNumberId: result.phoneNumberId,
                        wabaId: result.wabaId,
                        channelId: channel.id,
                      }),
                    });
                    const data = (await res.json()) as { message?: string };
                    if (!res.ok) throw new Error(data.message ?? "Erro.");
                    setEsSuccess(true);
                    void queryClient.invalidateQueries({ queryKey: ["channels"] });
                    void queryClient.invalidateQueries({
                      queryKey: ["channel", channel.id],
                    });
                    onSaved?.();
                  })
                  .catch((err: unknown) => {
                    setEsError(
                      err instanceof Error ? err.message : "Erro no Embedded Signup.",
                    );
                  })
                  .finally(() => setEsReconnecting(false));
              }}
            >
              {esReconnecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {wasEmbeddedSignup ? "Reconectar com Facebook" : "Conectar com Facebook"}
            </Button>
            {esError ? (
              <p className="text-sm text-[var(--color-danger-text)]">{esError}</p>
            ) : null}
            {esSuccess ? (
              <p className="text-sm text-[var(--color-success)]">
                Credenciais atualizadas com sucesso.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <Separator />

      {/* Grupo 1: Identificação (Nome do canal, Pipeline, App name).
          Antes cada campo tinha 3 linhas de descrição — agora agrupados
          numa seção enxuta com header uma vez, sem descricao redundante. */}
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Identificação
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meta-channel-name" className="text-xs">
              Nome do canal
            </Label>
            <Input
              id="meta-channel-name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Ex: WhatsApp Vendas"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-app-name" className="text-xs">
              Fonte do contato
            </Label>
            <Input
              id="meta-app-name"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="Ex: WhatsApp Bwipo"
            />
          </div>
        </div>
        <ChannelPipelineSelect
          id="meta-default-pipeline"
          value={defaultPipelineId}
          onChange={setDefaultPipelineId}
        />
      </section>

      {!isInstagram ? (
      <>
      <Separator />

      {/* Comportamento do canal — flags não-credenciais gravadas no config. */}
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Comportamento
        </p>
        <label className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Confirmação de leitura
            </span>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Envia o &quot;visto azul&quot; ao contato quando o operador abre a
              conversa. Desligado, as mensagens não são marcadas como lidas para
              o cliente (o &quot;digitando…&quot; também deixa de ser enviado).
            </p>
          </div>
          <SwitchGlass
            checked={sendReadReceipts}
            onChange={setSendReadReceipts}
            aria-label="Enviar confirmação de leitura"
          />
        </label>
      </section>
      </>
      ) : null}

      <Separator />

      {/* Grupo 2: Credenciais Meta. Header com botão "Testar" inline
          (antes ficava numa linha isolada abaixo do bloco todo).
          Phone Number ID e WABA ID em grid — sao IDs curtos, cabem lado a lado. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Credenciais
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setWebhookOpen(true)}
            >
              <Webhook className="size-3" />
              Webhook
            </Button>
            {isInstagram ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={manualReconnecting}
                onClick={handleManualReconnect}
              >
                {manualReconnecting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Reconectar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void testQuery.refetch()}
              disabled={testQuery.isFetching}
            >
              {testQuery.isFetching ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ShieldCheck className="size-3" />
              )}
              Testar conexão
              {testQuery.data && (
                <span
                  className={cn(
                    "ml-1",
                    statusOk && "text-[var(--color-success)]",
                    statusBad && "text-[var(--color-danger-text)]",
                  )}
                >
                  {statusOk ? "· OK" : statusBad ? "· Falha" : `· ${testQuery.data.status}`}
                </span>
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="meta-access-token" className="text-xs">
            Access Token
          </Label>
          <div className="flex gap-2">
            <Input
              id="meta-access-token"
              name="metaAccessToken"
              type={revealAccessToken ? "text" : "password"}
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              spellCheck={false}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={
                showTokenHint
                  ? initialToken
                    ? `Salvo: ${maskSecret(initialToken)} — deixe em branco para manter`
                    : isInstagram
                      ? "Cole o token gerado no produto Instagram"
                      : "Cole o token (EAA...)"
                  : isInstagram
                    ? "Cole o token gerado no produto Instagram"
                    : "Cole o token (EAA...)"
              }
              className="font-mono text-xs"
            />
            <TooltipGlass label={revealAccessToken ? "Ocultar" : "Mostrar"} side="top">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-3"
                onClick={() => setRevealAccessToken((v) => !v)}
                aria-label={revealAccessToken ? "Ocultar token" : "Mostrar token"}
              >
                {revealAccessToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </TooltipGlass>
          </div>
          {accessToken && !isInstagram && accessToken.length < 50 ? (
            <p className="text-xs text-[var(--color-warning)]">
              Token muito curto ({accessToken.length}). Tokens válidos começam com{" "}
              <span className="font-mono">EAA</span> e têm 200+ caracteres.
            </p>
          ) : null}
        </div>

        {!isInstagram ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meta-pnid" className="text-xs">
              Phone Number ID
            </Label>
            <Input
              id="meta-pnid"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-waba" className="text-xs">
              Business Account ID
            </Label>
            <Input
              id="meta-waba"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>
        ) : null}

        {(!isGlobalApp || isInstagram) && (
          <div className="space-y-1.5">
            <Label htmlFor="meta-app-secret" className="text-xs">
              {isInstagram ? "Chave secreta do app do Instagram" : "App Secret"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="meta-app-secret"
                name="metaAppSecret"
                type={revealAppSecret ? "text" : "password"}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                spellCheck={false}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder={
                  initialAppSecret
                    ? `Salvo: ${maskSecret(initialAppSecret)} — deixe em branco para manter`
                    : isInstagram
                      ? "Produto Instagram → chave secreta do app (não Configurações → Básico)"
                      : "32 chars hex (Configurações → Básico no seu app Meta)"
                }
                className="font-mono text-xs"
              />
              <TooltipGlass label={revealAppSecret ? "Ocultar" : "Mostrar"} side="top">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="px-3"
                  onClick={() => setRevealAppSecret((v) => !v)}
                  aria-label={revealAppSecret ? "Ocultar app secret" : "Mostrar app secret"}
                >
                  {revealAppSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </TooltipGlass>
            </div>
          </div>
        )}
      </section>
      {isInstagram && (manualReconnectError || manualReconnectSuccess) ? (
        <p
          className={
            manualReconnectError
              ? "text-xs text-[var(--color-danger-text)]"
              : "text-xs text-[var(--color-success)]"
          }
        >
          {manualReconnectError ?? "✓ Token revalidado na Meta"}
        </p>
      ) : null}

      {!isInstagram && embeddedSignup.isConfigured && (
        <>
          <Separator />
          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {wasEmbeddedSignup ? "Reconectar via Facebook" : "Conectar via Facebook"}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                {wasEmbeddedSignup
                  ? "Atualiza token e credenciais automaticamente."
                  : "Obtém credenciais via Embedded Signup."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={esReconnecting}
              onClick={() => {
                setEsError(null);
                setEsSuccess(false);
                setEsReconnecting(true);
                embeddedSignup
                  .launchSignup()
                  .then(async (result) => {
                    const res = await fetch(apiUrl("/api/channels/embedded-signup"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        code: result.code,
                        phoneNumberId: result.phoneNumberId,
                        wabaId: result.wabaId,
                        channelId: channel.id,
                      }),
                    });
                    const data = (await res.json()) as { message?: string };
                    if (!res.ok) throw new Error(data.message ?? "Erro.");
                    setEsSuccess(true);
                    void queryClient.invalidateQueries({ queryKey: ["channels"] });
                    void queryClient.invalidateQueries({
                      queryKey: ["channel", channel.id],
                    });
                    onSaved?.();
                  })
                  .catch((err: unknown) => {
                    setEsError(
                      err instanceof Error ? err.message : "Erro no Embedded Signup.",
                    );
                  })
                  .finally(() => setEsReconnecting(false));
              }}
            >
              {esReconnecting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {wasEmbeddedSignup ? "Reconectar" : "Conectar"}
            </Button>
            {(esError || esSuccess) && (
              <p
                className={cn(
                  "w-full text-xs",
                  esError && "text-[var(--color-danger-text)]",
                  esSuccess && "text-[var(--color-success)]",
                )}
              >
                {esError ?? "Credenciais atualizadas com sucesso."}
              </p>
            )}
          </section>
        </>
      )}

      {/* Docs colapsado num details compacto — antes era um card grande sobre
          WhatsApp Calling API que ninguém precisa ler sempre. */}
      {isInstagram ? (
        <details className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Ajuda e documentação
          </summary>
          <div className="mt-2 space-y-1.5 text-[var(--text-muted)]">
            <p>
              Token e webhook precisam ser do mesmo app. No produto Instagram,
              assine <code className="rounded bg-[var(--glass-bg-strong)] px-1">messages</code>{" "}
              e cole a chave secreta do app do Instagram.
            </p>
          </div>
        </details>
      ) : (
      <details className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Ajuda e documentação
        </summary>
        <div className="mt-2 space-y-1.5 text-[var(--text-muted)]">
          <p>
            Para chamadas de voz, subscreva o webhook{" "}
            <code className="rounded bg-[var(--glass-bg-strong)] px-1">calls</code> além de{" "}
            <code className="rounded bg-[var(--glass-bg-strong)] px-1">messages</code> no painel
            Meta.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href={META_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--brand-primary)] hover:underline"
            >
              Cloud API <ExternalLink className="size-3" />
            </a>
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/calling"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--brand-primary)] hover:underline"
            >
              Calling API <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </details>
      )}

      {/* Footer sticky-ish: unico botao salvar (antes tinha dois — este e o
          "Salvar e ativar URL de callback" dentro do bloco avancado; o
          avancado agora chama o mesmo saveMutation, ok manter la porque so
          aparece em canais legacy com app proprio). */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--glass-border)] pt-4">
        {saveMutation.isError ? (
          <p className="text-xs text-[var(--color-danger-text)]">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Erro ao salvar."}
          </p>
        ) : saveMutation.isSuccess ? (
          <p className="text-xs text-[var(--color-success)]">
            ✓ Alterações salvas
          </p>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">
            Tokens são armazenados de forma segura.
          </span>
        )}
        <Button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="gap-2"
        >
          {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>

      <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
        <DialogContent size="md" className="z-(--z-sheet)">
          <DialogClose />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="size-4 text-[var(--brand-primary)]" />
              Webhook
            </DialogTitle>
            <DialogDescription>
              {isInstagram
                ? "No produto Instagram do mesmo app do token: cole a URL e o token, assine o campo messages e use a chave secreta do app do Instagram."
                : isGlobalApp
                ? "A assinatura do webhook é gerenciada pelo App do CRM. Use os dados abaixo apenas se mantém um App Meta próprio."
                : "Configure a URL e o token abaixo no painel Meta (developers.facebook.com → seu app → WhatsApp → Configuração)."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Callback URL
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <TooltipGlass label="Copiar URL" side="top">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 px-3"
                  onClick={() => copyToClipboard(webhookUrl, "url")}
                >
                  {copiedField === "url" ? (
                    <Check className="size-3.5 text-[var(--color-success)]" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </TooltipGlass>
            </div>
            {!webhookPathId ? (
              <p className="text-xs text-[var(--color-warning)]">
                Organization slug ausente — recarregue a página.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Verify Token
            </Label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Clique em 'Gerar' pra criar um token aleatório"
                className="font-mono text-xs"
              />
              <TooltipGlass label="Gerar token aleatório" side="top">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="px-3 text-xs"
                  onClick={() => setVerifyToken(generateVerifyToken())}
                >
                  Gerar
                </Button>
              </TooltipGlass>
              <TooltipGlass label="Copiar token" side="top">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 px-3"
                  disabled={!verifyToken.trim()}
                  onClick={() => copyToClipboard(verifyToken, "token")}
                >
                  {copiedField === "token" ? (
                    <Check className="size-3.5 text-[var(--color-success)]" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </TooltipGlass>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Cole o mesmo valor no campo &quot;Verify Token&quot; do painel Meta.
              Salve aqui ANTES de clicar em &quot;Verify and save&quot; no painel da Meta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={saveMutation.isPending || !webhookPathId}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Webhook className="size-3.5" />
              )}
              Salvar e ativar URL de callback
            </Button>
            {saveMutation.isSuccess ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
                <Check className="size-3.5" />
                URL ativa — verifique no painel Meta.
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                Grava o verifyToken/credenciais para a Meta validar a URL.
              </span>
            )}
          </div>

          <details className="text-xs text-[var(--text-muted)]">
            <summary className="cursor-pointer font-medium hover:text-[var(--text-primary)]">
              Como configurar no painel Meta?
            </summary>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              {isInstagram ? (
                <>
                  <li>Salve o canal aqui — token de verificação e chave secreta precisam estar gravados antes da Meta verificar.</li>
                  <li>No mesmo app do token: produto Instagram → Webhooks.</li>
                  <li>Cole a URL e o token acima e clique em Verificar e salvar.</li>
                  <li>Assine o campo <span className="font-mono">messages</span>.</li>
                  <li>Use a chave secreta do app do Instagram, não Configurações → Básico.</li>
                </>
              ) : (
                <>
              <li>Salve o canal aqui — verifyToken e appSecret precisam estar gravados no banco antes da Meta tentar verificar.</li>
              <li>No painel Meta: <span className="font-mono">developers.facebook.com</span> → seu app → WhatsApp → Configuração.</li>
              <li>Em &quot;Webhook&quot; clique em &quot;Editar&quot;, cole a URL e o token acima e clique em &quot;Verify and save&quot;.</li>
              <li>Subscreva o campo <span className="font-mono">messages</span> (e <span className="font-mono">calls</span> se usar ligações).</li>
                </>
              )}
            </ol>
          </details>
        </DialogContent>
      </Dialog>
    </div>
  );
}
