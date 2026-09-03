"use client";

import { apiUrl, parseApiResponse } from "@/lib/api";
import type { ChannelProvider, ChannelType } from "@/lib/prisma-enum-types";
import { IconAt as AtSign, IconCheck as Check, IconChevronDown as ChevronDown, IconChevronLeft as ChevronLeft, IconCopy as Copy, IconExternalLink as ExternalLink, IconGlobe as Globe, IconLoader2 as Loader2, IconMail as Mail, IconMessageCircle as MessageCircle, IconQrcode as QrCode, IconShare2 as Share2, IconSparkles as Sparkles, IconWebhook as Webhook } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useEmbeddedSignup } from "@/hooks/use-embedded-signup";
import { useFacebookLogin } from "@/hooks/use-facebook-login";

type Step = 1 | 2 | 3;

const TYPES: {
  type: ChannelType;
  label: string;
  description: string;
  icon: typeof MessageCircle;
  cardClass: string;
}[] = [
  {
    type: "WHATSAPP",
    label: "WhatsApp",
    description: "Mensagens e automações",
    icon: MessageCircle,
    cardClass:
      "border-[var(--channel-whatsapp)]/30 bg-[var(--channel-whatsapp)]/[0.06] hover:border-[var(--channel-whatsapp)]/50",
  },
  {
    type: "INSTAGRAM",
    label: "Instagram",
    description: "Direct e comentários",
    icon: AtSign,
    cardClass:
      "border-[var(--color-pink)]/25 bg-gradient-to-br from-[var(--color-pink)]/10 to-[var(--color-lavender)]/10 hover:border-[var(--color-pink)]/40",
  },
  {
    type: "FACEBOOK",
    label: "Facebook",
    description: "Messenger e páginas",
    icon: Share2,
    cardClass: "border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5 hover:border-[var(--color-primary)]/40",
  },
  {
    type: "EMAIL",
    label: "E-mail",
    description: "Caixa compartilhada",
    icon: Mail,
      cardClass: "border-[var(--glass-border)] hover:border-[var(--brand-primary)]/30",
  },
  {
    type: "WEBCHAT",
    label: "Webchat",
    description: "Widget no site",
    icon: Globe,
    cardClass: "border-[var(--color-cyan)]/25 bg-[var(--color-cyan)]/5 hover:border-[var(--color-cyan)]/40",
  },
];

function providerForType(
  _type: ChannelType,
  selected: ChannelProvider | null
): ChannelProvider {
  return selected ?? "META_CLOUD_API";
}

export type CreateChannelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

export function CreateChannelDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateChannelDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [channelType, setChannelType] = useState<ChannelType | null>(null);
  const [provider, setProvider] = useState<ChannelProvider | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [instagramUserId, setInstagramUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupWarning, setSignupWarning] = useState<string | null>(null);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [showIgCrmLogin, setShowIgCrmLogin] = useState(false);
  // Webhook opcional para clientes que preferem usar o proprio App Meta:
  // "Webhook" gera Callback URL + Verify Token e persiste o token no
  // canal ao clicar "Criar canal" (Channel.config.verifyToken).
  const [webhookInfo, setWebhookInfo] = useState<{
    channelId: string;
    callbackUrl: string;
    verifyToken: string;
    webhookId: string;
    warning?: string | null;
  } | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // App Secret do App Meta proprio do cliente (necessario pra validar
  // assinatura x-hub-signature-256 dos POSTs recebidos). Coletado no modal
  // Webhook porque o fluxo manual usa o App Meta proprio do cliente.
  const [appSecret, setAppSecret] = useState("");
  const [metaAppId, setMetaAppId] = useState("");
  // Estado do fluxo Facebook Login (Messenger / Instagram): armazena o
  // code OAuth, a lista de Paginas devolvida pelo backend e a Pagina
  // selecionada pelo usuario antes de confirmar o provisionamento.
  const [fbLoginCode, setFbLoginCode] = useState<string | null>(null);
  const [fbPages, setFbPages] = useState<{ id: string; name: string }[]>([]);
  const [fbSelectedPageId, setFbSelectedPageId] = useState<string>("");

  const embeddedSignup = useEmbeddedSignup();
  const facebookLogin = useFacebookLogin();
  const [igLoginConfigured, setIgLoginConfigured] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(apiUrl("/api/config/public"))
      .then((res) => res.json())
      .then((data: { instagramLoginConfigured?: boolean }) => {
        if (!cancelled) {
          setIgLoginConfigured(Boolean(data.instagramLoginConfigured));
        }
      })
      .catch(() => {
        if (!cancelled) setIgLoginConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    setStep(1);
    setChannelType(null);
    setProvider(null);
    setName("");
    setPhoneNumber("");
    setAccessToken("");
    setPhoneNumberId("");
    setBusinessAccountId("");
    setInstagramUserId("");
    setError(null);
    setSignupWarning(null);
    setSubmitting(false);
    setShowManualConfig(false);
    setShowIgCrmLogin(false);
    setWebhookInfo(null);
    setWebhookLoading(false);
    setWebhookModalOpen(false);
    setCopiedField(null);
    setAppSecret("");
    setFbLoginCode(null);
    setFbPages([]);
    setFbSelectedPageId("");
    embeddedSignup.reset();
    facebookLogin.reset();
  }

  async function fetchWebhookInfo() {
    // Se ja temos, so reabre o modal.
    if (webhookInfo) {
      setWebhookModalOpen(true);
      return;
    }
    setWebhookLoading(true);
    setError(null);
    try {
      // POST pre-cria o canal em status CONNECTING pra que o handshake
      // Meta encontre o webhookId no banco no "Verify and save".
      const res = await fetch(apiUrl("/api/channels/meta/webhook-info"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const data = await parseApiResponse<{
        channelId?: string;
        callbackUrl?: string;
        verifyToken?: string;
        webhookId?: string;
        warning?: string | null;
      }>(res, "Falha ao gerar dados de webhook.");
      if (
        !data.channelId ||
        !data.callbackUrl ||
        !data.verifyToken ||
        !data.webhookId
      ) {
        throw new Error("Falha ao gerar dados de webhook.");
      }
      setWebhookInfo({
        channelId: data.channelId,
        callbackUrl: data.callbackUrl,
        verifyToken: data.verifyToken,
        webhookId: data.webhookId,
        warning: data.warning ?? null,
      });
      setWebhookModalOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao gerar webhook.");
    } finally {
      setWebhookLoading(false);
    }
  }

  function copyToClipboard(value: string, field: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function canAdvanceFromStep2(): boolean {
    if (!channelType) return false;
    return true;
  }

  async function handleEmbeddedSignup() {
    if (!name.trim()) {
      setError("Preencha o nome do canal antes de conectar.");
      return;
    }
    setError(null);
    setSignupWarning(null);
    setSubmitting(true);
    try {
      const result = await embeddedSignup.launchSignup();
      const res = await fetch(apiUrl("/api/channels/embedded-signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: result.code,
          phoneNumberId: result.phoneNumberId,
          wabaId: result.wabaId,
          name: name.trim(),
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        webhookSubscribed?: boolean;
        phoneRegistered?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "Erro no Embedded Signup.");
      }
      // Canal criado. Se o numero ainda nao foi registrado no WhatsApp
      // Business Platform, avisamos (envio pode falhar ate o registro/PIN)
      // e mantemos o dialog aberto para o usuario ler.
      onCreated?.();
      if (data.phoneRegistered === false) {
        setSignupWarning(
          "Canal criado, mas o número ainda não foi registrado no WhatsApp Business Platform. " +
            "O recebimento de mensagens funciona; para enviar, registre o número (definir PIN de verificação em duas etapas) no painel Meta.",
        );
        return;
      }
      handleOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro no Embedded Signup.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMessagingLogin() {
    if (channelType !== "FACEBOOK") return;
    const platform = "messenger" as const;
    setError(null);
    setSubmitting(true);
    try {
      const { code } = await facebookLogin.launchLogin();
      // Primeiro POST: sem pageId -> backend devolve lista de Paginas.
      const res = await fetch(apiUrl("/api/channels/meta-messaging/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, platform }),
      });
      const data = (await res.json()) as {
        needsPageSelection?: boolean;
        pages?: { id: string; name: string }[];
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "Falha ao conectar com o Facebook.");
      }
      const pages = data.pages ?? [];
      if (pages.length === 0) {
        throw new Error(
          "Nenhuma Pagina do Facebook encontrada na sua conta (verifique permissoes).",
        );
      }
      setFbLoginCode(code);
      setFbPages(pages);
      setFbSelectedPageId(pages[0]?.id ?? "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha no login do Facebook.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleInstagramLogin() {
    // Instagram Login direto: OAuth por REDIRECT em instagram.com,
    // nao via FB SDK. Abrimos popup apontando pra rota /oauth/start
    // do backend, que redireciona (302) pro instagram.com/oauth/authorize.
    if (igLoginConfigured === false) {
      setError(
        "Login direto do Instagram nao esta configurado neste ambiente. Use o fluxo manual: token, Webhook e Criar canal.",
      );
      return;
    }
    setError(null);
    const popup = window.open(
      apiUrl("/api/channels/instagram/oauth/start"),
      "ig-oauth",
      "popup=1,width=560,height=720",
    );
    if (!popup) {
      setError("Popup bloqueado pelo navegador. Libere popups e tente novamente.");
      return;
    }
    const cleanup = () => {
      window.removeEventListener("message", listener);
      clearInterval(closedWatch);
    };
    const listener = (event: MessageEvent) => {
      const raw = typeof event.data === "string" ? event.data : "";
      if (!raw) return;
      let msg: {
        type?: string;
        ok?: boolean;
        channelId?: string;
        username?: string;
        message?: string;
      };
      try {
        // A callback route serializa `{type, ok, ...}` DUAS vezes (postMessage
        // recebe uma string JSON contendo o payload). Fazemos parse duplo
        // defensivo.
        const first = JSON.parse(raw) as unknown;
        msg =
          typeof first === "string"
            ? (JSON.parse(first) as typeof msg)
            : (first as typeof msg);
      } catch {
        return;
      }
      if (msg?.type !== "IG_OAUTH_DONE") return;
      cleanup();
      if (msg.ok) {
        onCreated?.();
        handleOpenChange(false);
      } else {
        setError(
          typeof msg.message === "string" && msg.message.trim()
            ? msg.message
            : "Falha ao conectar Instagram. Tente novamente.",
        );
      }
    };
    const closedWatch = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
    }, 400);
    window.addEventListener("message", listener);
  }

  async function submitMessagingConnect() {
    if (!fbLoginCode || !fbSelectedPageId) {
      setError("Selecione uma Pagina para conectar.");
      return;
    }
    const platform = channelType === "INSTAGRAM" ? "instagram" : "messenger";
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/channels/meta-messaging/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fbLoginCode,
          platform,
          pageId: fbSelectedPageId,
          name: name.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Erro ao conectar canal.");
      }
      onCreated?.();
      handleOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao conectar canal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (!channelType || !name.trim()) {
      setError("Preencha o nome do canal.");
      return;
    }
    const prov = providerForType(channelType, provider);

    if (channelType === "INSTAGRAM") {
      if (!accessToken.trim()) {
        setError("Preencha o Token de acesso do App da empresa.");
        return;
      }
      if (!webhookInfo) {
        setError(
          "Abra o Webhook, cole a URL no App Meta e informe o App Secret. Depois clique em Criar canal.",
        );
        void fetchWebhookInfo();
        return;
      }
      if (!appSecret.trim()) {
        setWebhookModalOpen(true);
        setError(
          "Cole o App Secret do seu App Meta no modal Webhook antes de criar o canal.",
        );
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(apiUrl("/api/channels/instagram/manual"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            accessToken: accessToken.trim(),
            instagramUserId: instagramUserId.trim() || undefined,
            channelId: webhookInfo.channelId,
            verifyToken: webhookInfo.verifyToken,
            webhookId: webhookInfo.webhookId,
            appSecret: appSecret.trim(),
          }),
        });
        const data = (await res.json()) as {
          message?: string;
          webhookSubscribed?: boolean;
        };
        if (!res.ok) {
          throw new Error(data.message ?? "Erro ao conectar Instagram.");
        }
        onCreated?.();
        if (data.webhookSubscribed === false) {
          setSignupWarning(
            "Canal criado, mas a Meta nao assinou o webhook (subscribed_apps). Confira o token e o campo messages no App.",
          );
          return;
        }
        handleOpenChange(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao conectar Instagram.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Meta Cloud API manual: usa a rota dedicada que provisiona o webhook
    // automaticamente (subscribed_apps no App Meta global do CRM) e retorna
    // o canal ja CONNECTED. Sem App Secret e sem passos manuais no painel Meta.
    if (prov === "META_CLOUD_API") {
      if (!accessToken.trim() || !phoneNumberId.trim() || !businessAccountId.trim()) {
        setError(
          "Preencha Token de acesso, ID do número de telefone e WABA ID.",
        );
        return;
      }
      // Se o usuario abriu o modal Webhook (App Meta proprio), o App Secret
      // e obrigatorio pra validar assinatura dos POSTs recebidos.
      if (webhookInfo && !appSecret.trim()) {
        setError(
          "Cole o App Secret do seu App Meta no botão Webhook antes de criar o canal.",
        );
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(apiUrl("/api/channels/manual-cloud"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            accessToken: accessToken.trim(),
            phoneNumberId: phoneNumberId.trim(),
            wabaId: businessAccountId.trim(),
            // Se o usuario abriu o painel Webhook, o canal ja foi
            // pre-criado (status CONNECTING) com webhookId+verifyToken.
            // Passar channelId aqui faz manual-cloud fazer UPDATE em vez
            // de criar duplicado.
            channelId: webhookInfo?.channelId,
            verifyToken: webhookInfo?.verifyToken,
            webhookId: webhookInfo?.webhookId,
            appSecret: appSecret.trim() || undefined,
            appId: metaAppId.trim() || undefined,
          }),
        });
        const data = (await res.json()) as { message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? "Erro ao conectar canal.");
        }
        onCreated?.();
        handleOpenChange(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao conectar canal.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    setError(null);
    const phonePayload =
      prov === "BAILEYS_MD" ? "" : phoneNumber.trim() || "";

    try {
      const res = await fetch(apiUrl("/api/channels"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type: channelType,
          provider: prov,
          phoneNumber: phonePayload || undefined,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Erro ao criar canal.");
      }
      onCreated?.();
      handleOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar canal.");
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveProvider = channelType
    ? providerForType(channelType, provider)
    : null;

  // Embedded Signup e so do WhatsApp Cloud API. Instagram tambem usa
  // provider META_CLOUD_API no wizard, mas o login e OAuth proprio —
  // nao pode herdar essa flag senão o rodape esconde "Criar canal".
  const showEmbeddedSignup =
    channelType === "WHATSAPP" &&
    effectiveProvider === "META_CLOUD_API" &&
    embeddedSignup.isConfigured;

  const sheetFooter = (
    <div className="flex w-full flex-wrap items-center gap-2">
      {step > 1 ? (
        <Button
          type="button"
          variant="outline"
          className="gap-1"
          onClick={() => {
            if (step === 3) {
              if (channelType === "WHATSAPP") setStep(2);
              else setStep(1);
            } else if (step === 2) {
              setStep(1);
            }
          }}
        >
          <ChevronLeft className="size-4" />
          Voltar
        </Button>
      ) : null}
      <div className="flex flex-1 flex-wrap justify-end gap-2">
        {step === 3 &&
        ((effectiveProvider === "META_CLOUD_API" &&
          channelType === "WHATSAPP") ||
          channelType === "INSTAGRAM") ? (
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            disabled={webhookLoading}
            onClick={() => void fetchWebhookInfo()}
          >
            {webhookLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Webhook className="size-3.5" />
            )}
            Webhook
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
          Cancelar
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            disabled={step === 1 ? !channelType : !canAdvanceFromStep2()}
            onClick={() => {
              if (step === 1 && channelType) {
                if (channelType === "WHATSAPP") setStep(2);
                else setStep(3);
              } else if (step === 2) {
                setStep(3);
              }
            }}
          >
            Continuar
          </Button>
        ) : (showEmbeddedSignup && !showManualConfig) ||
          channelType === "FACEBOOK" ? null : (
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Criar canal
          </Button>
        )}
      </div>
    </div>
  );

  const stepDescription =
    step === 1
      ? "Escolha o tipo de canal."
      : step === 2 && channelType === "WHATSAPP"
        ? "Configure o provedor."
        : "Finalize a configuração.";

  return (
    <>
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      busy={submitting}
      size="xl"
      icon={<Sparkles className="size-5 text-[var(--brand-primary)]" />}
      title="Novo canal"
      description={stepDescription}
      footer={sheetFooter}
    >
        <div className="space-y-6">
            {step === 1 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {TYPES.map(({ type, label, description, icon: Icon, cardClass }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setChannelType(type);
                      if (type !== "WHATSAPP") setProvider("META_CLOUD_API");
                    }}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all",
                      cardClass,
                      channelType === type
                        ? "ring-2 ring-[var(--brand-primary)] ring-offset-2"
                        : "opacity-90 hover:opacity-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-8",
                        type === "WHATSAPP" && "text-[var(--channel-whatsapp)]"
                      )}
                    />
                    <span className="font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {description}
                    </span>
                    {channelType === type ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)]">
                        <Check className="size-3.5" />
                        Selecionado
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {step === 2 && channelType === "WHATSAPP" ? (
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => setProvider("META_CLOUD_API")}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-all",
                    "border-[var(--color-brand-primary)]/20 bg-[var(--color-info)]/5 hover:border-[var(--color-brand-primary)]/40",
                    provider === "META_CLOUD_API" &&
                      "ring-2 ring-[var(--brand-primary)] ring-offset-2"
                  )}
                >
                  <p className="font-semibold">Meta Cloud API (Oficial)</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    API oficial do WhatsApp Business. Requer token e IDs do Meta
                    Business. Templates, selo de verificado, cobrança por conversa.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("BAILEYS_MD")}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-all",
                    "border-[var(--channel-whatsapp)]/20 bg-[var(--channel-whatsapp)]/5 hover:border-[var(--channel-whatsapp)]/40",
                    provider === "BAILEYS_MD" &&
                      "ring-2 ring-[var(--brand-primary)] ring-offset-2"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <QrCode className="size-5 text-[var(--channel-whatsapp)]" />
                    <p className="font-semibold">WhatsApp QR Code</p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Conecte qualquer número via QR code. Sem templates, sem
                    verificação Meta. Rápido e direto.
                  </p>
                </button>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ch-name">Nome do canal</Label>
                  <Input
                    id="ch-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: WhatsApp Vendas"
                  />
                </div>

                {channelType === "INSTAGRAM" ? (
                  <div className="space-y-3">
                    <div className="space-y-3 rounded-xl border-2 border-[var(--color-brand-primary)]/20 bg-[var(--color-info)]/5 p-4">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        App da empresa (messages)
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Use o App Meta da DNA. O token e o webhook precisam ser
                        do <span className="font-medium">mesmo</span> app (o
                        produto Instagram, nao outro app do Facebook). Token:
                        Instagram → API setup → Gerar token ao lado da conta
                        Business.
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        1. Cole o token. 2. Clique em Webhook: cole a URL no
                        produto Instagram (campo messages) e a{" "}
                        <span className="font-medium">
                          chave secreta do app do Instagram
                        </span>
                        , nao a de Configurações → Básico. 3. Criar canal.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="ch-ig-token">Access Token</Label>
                        <Input
                          id="ch-ig-token"
                          type="password"
                          autoComplete="off"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder="Token EAA do usuario do sistema"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ch-ig-uid">Instagram User ID</Label>
                        <Input
                          id="ch-ig-uid"
                          value={instagramUserId}
                          onChange={(e) => setInstagramUserId(e.target.value)}
                          placeholder="Opcional — o CRM descobre pela Pagina vinculada"
                        />
                      </div>
                      {signupWarning ? (
                        <p className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-2 text-xs text-[var(--color-warning)]">
                          {signupWarning}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      onClick={() => setShowIgCrmLogin((v) => !v)}
                    >
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform",
                          showIgCrmLogin && "rotate-180",
                        )}
                      />
                      App do CRM (provedor — nao use se o App e so da DNA)
                    </button>
                    {showIgCrmLogin ? (
                      <div className="rounded-lg border bg-[var(--glass-bg-overlay)] p-3">
                        <p className="text-xs text-[var(--text-muted)]">
                          Login OAuth no app do CRM. So faz sentido quando este
                          CRM conecta Instagram de varias empresas. Nao e o
                          fluxo do App proprio.
                        </p>
                        <Button
                          type="button"
                          className="mt-3 w-full gap-2 bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white"
                          disabled={submitting}
                          onClick={() => handleInstagramLogin()}
                        >
                          Entrar com Instagram
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : channelType === "FACEBOOK" ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border-2 border-[var(--color-brand-primary)]/20 bg-[var(--color-info)]/5 p-4">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Conectar com Facebook
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Autorize o acesso as suas Paginas do Facebook. Voce escolhe qual Pagina conectar.
                      </p>
                      {fbPages.length === 0 ? (
                        <Button
                          type="button"
                          className="mt-3 w-full gap-2 bg-[var(--channel-facebook)] text-white hover:bg-[var(--channel-facebook)]"
                          disabled={submitting || !facebookLogin.sdkReady || !facebookLogin.isConfigured}
                          onClick={() => void handleMessagingLogin()}
                        >
                          {submitting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <svg
                              className="size-4"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                          )}
                          Entrar com Facebook
                        </Button>
                      ) : null}
                      {!facebookLogin.isConfigured ? (
                        <p className="mt-2 text-[11px] text-[var(--color-warn-text)]">
                          App Meta nao configurado (NEXT_PUBLIC_META_APP_ID / MESSENGER_CONFIG_ID ausente).
                        </p>
                      ) : null}
                    </div>

                    {fbPages.length > 0 ? (
                      <div className="space-y-2 rounded-lg border bg-[var(--glass-bg-overlay)] p-3">
                        <Label>Escolha a Pagina do Facebook</Label>
                        <div className="max-h-60 space-y-1 overflow-auto">
                          {fbPages.map((p) => (
                            <label
                              key={p.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm",
                                fbSelectedPageId === p.id
                                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                                  : "border-transparent hover:bg-[var(--glass-bg-overlay)]",
                              )}
                            >
                              <input
                                type="radio"
                                name="fb-page"
                                value={p.id}
                                checked={fbSelectedPageId === p.id}
                                onChange={() => setFbSelectedPageId(p.id)}
                              />
                              <span className="flex-1">{p.name}</span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                {p.id}
                              </span>
                            </label>
                          ))}
                        </div>
                        <Button
                          type="button"
                          className="mt-2 w-full gap-2"
                          disabled={submitting || !fbSelectedPageId}
                          onClick={() => void submitMessagingConnect()}
                        >
                          {submitting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Conectar canal
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : effectiveProvider === "META_CLOUD_API" ? (
                  <>
                    {showEmbeddedSignup ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border-2 border-[var(--color-brand-primary)]/20 bg-[var(--color-info)]/5 p-4">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            Conectar via Facebook
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Obtenha credenciais automaticamente com login Meta.
                            Token, Phone ID e WABA ID são configurados de forma segura.
                          </p>
                          <Button
                            type="button"
                            className="mt-3 w-full gap-2 bg-[var(--channel-facebook)] text-white hover:bg-[var(--channel-facebook)]"
                            disabled={submitting || !name.trim()}
                            onClick={() => void handleEmbeddedSignup()}
                          >
                            {submitting ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <svg
                                className="size-4"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                              </svg>
                            )}
                            Conectar com Facebook
                          </Button>
                          {signupWarning ? (
                            <p className="mt-3 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-2 text-xs text-[var(--color-warning)]">
                              {signupWarning}
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className="flex w-full items-center justify-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          onClick={() => setShowManualConfig(!showManualConfig)}
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              showManualConfig && "rotate-180",
                            )}
                          />
                          Ou configure manualmente
                        </button>

                        {showManualConfig ? (
                          <div className="space-y-3 rounded-lg border bg-[var(--glass-bg-overlay)] p-3">
                            <div className="space-y-2">
                              <Label htmlFor="ch-token">Access Token</Label>
                              <Input
                                id="ch-token"
                                type="password"
                                autoComplete="off"
                                value={accessToken}
                                onChange={(e) => setAccessToken(e.target.value)}
                                placeholder="Token permanente ou de sistema"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ch-pnid">Phone Number ID</Label>
                              <Input
                                id="ch-pnid"
                                value={phoneNumberId}
                                onChange={(e) => setPhoneNumberId(e.target.value)}
                                placeholder="ID do número no Meta"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ch-waba">
                                Business Account ID (WABA)
                              </Label>
                              <Input
                                id="ch-waba"
                                value={businessAccountId}
                                onChange={(e) =>
                                  setBusinessAccountId(e.target.value)
                                }
                                placeholder="ID da conta WhatsApp Business"
                              />
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">
                              O webhook é configurado automaticamente pelo CRM ao finalizar. Você não precisa mexer no painel Meta.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="ch-token">Access Token</Label>
                          <Input
                            id="ch-token"
                            type="password"
                            autoComplete="off"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="Token permanente ou de sistema"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ch-pnid">Phone Number ID</Label>
                          <Input
                            id="ch-pnid"
                            value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value)}
                            placeholder="ID do número no Meta"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ch-waba">
                            Business Account ID (WABA)
                          </Label>
                          <Input
                            id="ch-waba"
                            value={businessAccountId}
                            onChange={(e) => setBusinessAccountId(e.target.value)}
                            placeholder="ID da conta WhatsApp Business"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ch-app-id">
                            App ID (Meta App desta org)
                          </Label>
                          <Input
                            id="ch-app-id"
                            value={metaAppId}
                            onChange={(e) => setMetaAppId(e.target.value)}
                            placeholder="Para criar template com header IMAGE"
                            className="font-mono text-xs"
                          />
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                          O webhook é configurado automaticamente pelo CRM ao finalizar. Você não precisa mexer no painel Meta.
                        </p>
                      </>
                    )}
                  </>
                ) : null}

                {effectiveProvider === "BAILEYS_MD" ? (
                  <div className="rounded-lg border border-[var(--channel-whatsapp)]/20 bg-[var(--channel-whatsapp)]/5 p-3">
                    <p className="text-sm text-[var(--text-muted)]">
                      Após criar o canal, clique em <strong>Conectar</strong> e escaneie o QR code
                      com seu WhatsApp. O número será detectado automaticamente.
                    </p>
                  </div>
                ) : null}

                {effectiveProvider !== "META_CLOUD_API" && effectiveProvider !== "BAILEYS_MD" ? (
                  <div className="space-y-2">
                    <Label htmlFor="ch-phone">Telefone (opcional)</Label>
                    <Input
                      id="ch-phone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+55 11 99999-9999"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="text-sm text-[var(--color-danger-text)]" role="alert">
                {error}
              </p>
            ) : null}
        </div>
    </FormDialog>

      <Dialog open={webhookModalOpen} onOpenChange={setWebhookModalOpen}>
        <DialogContent size="md" panelClassName="max-h-[90vh]">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="size-5 text-[var(--brand-primary)]" />
              Webhook
            </DialogTitle>
            <DialogDescription>
              {channelType === "INSTAGRAM"
                ? "No produto Instagram do mesmo app do token: Webhooks → URL + token, campo messages, e a chave secreta do app do Instagram."
                : "Cole a URL e o token no painel Meta. Depois informe o App Secret abaixo."}
            </DialogDescription>
          </DialogHeader>

          {webhookInfo ? (
            <div className="mt-2 space-y-5">
              {webhookInfo.warning ? (
                <div className="rounded-md border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] p-3 text-xs text-[var(--color-warn-text)] dark:text-[var(--color-warning)]/70">
                  <strong>Atenção:</strong> {webhookInfo.warning} Confira se a
                  URL abaixo aponta pro domínio público do backend antes de
                  colar no painel Meta.
                </div>
              ) : null}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Webhook URL
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={webhookInfo.callbackUrl}
                    className="font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="px-3"
                    onClick={() => copyToClipboard(webhookInfo.callbackUrl, "url")}
                    aria-label="Copiar Webhook URL"
                  >
                    {copiedField === "url" ? (
                      <Check className="size-3.5 text-[var(--color-success)]" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Token de verificação
                </Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={webhookInfo.verifyToken}
                    className="font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="px-3"
                    onClick={() => copyToClipboard(webhookInfo.verifyToken, "token")}
                    aria-label="Copiar Token de verificação"
                  >
                    {copiedField === "token" ? (
                      <Check className="size-3.5 text-[var(--color-success)]" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Este token será salvo no canal ao clicar em &quot;Criar canal&quot;.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {channelType === "INSTAGRAM"
                    ? "Chave secreta do app do Instagram"
                    : "App Secret"}
                </Label>
                <Input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={
                    channelType === "INSTAGRAM"
                      ? "Chave secreta do app do Instagram (obrigatório)"
                      : "App Secret do seu App Meta (obrigatório)"
                  }
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-[11px] text-[var(--text-muted)]">
                  {channelType === "INSTAGRAM"
                    ? "Produto Instagram → API setup → Chave secreta do app do Instagram. Não use Configurações → Básico (isso é o App Secret do Facebook e a Meta rejeita a assinatura do Direct)."
                    : "Meta Developers → Configurações → Básico → App Secret → \"Mostrar\". Usado para validar a assinatura dos webhooks recebidos."}
                </p>
              </div>

              <div className="flex justify-center">
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-primary)] hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  Meta Developers
                </a>
              </div>

              <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Com as informações acima, configure:
                </p>
                <ol className="mt-2 ml-5 list-decimal space-y-1 text-xs text-[var(--text-muted)]">
                  {channelType === "INSTAGRAM" ? (
                    <>
                      <li>Abra o App Meta da empresa (DNA) em developers.facebook.com — o mesmo app do token</li>
                      <li>Produto Instagram → Webhooks (API com login do Instagram)</li>
                      <li>Cole a Webhook URL e o Token de verificação e clique em Verificar e salvar</li>
                      <li>Assine o campo <span className="font-mono">messages</span></li>
                      <li>Cole a chave secreta do app do Instagram (produto Instagram), não Configurações → Básico</li>
                    </>
                  ) : (
                    <>
                      <li>Acessar Meta Developers</li>
                      <li>No menu à esquerda, clique em &quot;WhatsApp &gt; Configuração&quot;</li>
                      <li>Clique em &quot;Editar&quot;, na área de Webhook</li>
                      <li>Informe o valor de &quot;Webhook URL&quot; no campo &quot;URL de retorno de chamada&quot;</li>
                      <li>Informe o valor de &quot;Token de verificação&quot; no campo &quot;Verificar token&quot;</li>
                      <li>Clique em &quot;Verificar e salvar&quot; para finalizar a configuração</li>
                    </>
                  )}
                </ol>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-4 flex-row justify-end gap-2 border-t bg-[var(--glass-bg-overlay)] px-6 py-3">
            <Button type="button" onClick={() => setWebhookModalOpen(false)}>
              Voltar
            </Button>
          </DialogFooter>
          <DialogClose />
        </DialogContent>
      </Dialog>
    </>
  );
}
