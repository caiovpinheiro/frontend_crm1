"use client";

/*
 * Painel de validação de template do WhatsApp (DS v2).
 *
 * Comportamento (alinhado ao /inbox v1, porém no padrão visual v2):
 *  - O corpo do template NÃO é editável (canal exige modelo aprovado).
 *  - As variáveis `{{1}}`, `{{nome}}`... viram inputs que o agente preenche
 *    e valida antes do envio.
 *  - O preview mostra o corpo já com os valores substituídos em tempo real.
 *  - O envio é feito pelo botão "Enviar template" (não por clique no item),
 *    montando `components` no formato da Cloud API (evita code=132000).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refreshInboxLists } from "@/features/inbox-v2/hooks/inbox-list-refresh";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconLock,
  IconSend,
  IconX,
} from "@tabler/icons-react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { sendTemplate, type WhatsappTemplate } from "@/features/inbox-v2/api";
import {
  applyOutboundPreviewToInboxCaches,
  emitConversationReopened,
  messagesKey,
} from "@/features/inbox-v2/hooks";
import type { OutboundChannelOption } from "@/features/inbox-v2/hooks/use-channels";
import { buildTemplateComponents } from "@/lib/meta-whatsapp/build-template-components";
import type { OperatorVariableMeta } from "@/lib/meta-whatsapp/operator-template-variables";
import { chatTemplateSlots } from "@/components/automations/template-variables";

import { ChannelPickModal } from "./channel-pick-modal";
import {
  channelSwitchConfirmOptions,
  isChannelMismatch,
  isDisconnectedChannelError,
} from "./channel-switch-confirm";
import { ChannelSelector } from "./channel-selector";

/** Template selecionado, pronto para validação/envio. */
export interface PendingTemplate {
  /** Nome canônico WABA — vai em `templateName` no POST. */
  name: string;
  /** Rótulo de exibição (quando diferente do nome canônico). */
  label?: string;
  /** Corpo com placeholders `{{N}}`. */
  content: string;
  /** Cabeçalho de texto aprovado, quando existir. */
  headerText?: string;
  /** Id na Graph (Cloud API). */
  metaTemplateId?: string | null;
  /** Categoria WABA (MARKETING / UTILITY / AUTHENTICATION) — informativa. */
  category?: string | null;
  /** Idioma do template (ex.: pt_BR). */
  language?: string | null;
  /** Metadados das variáveis (rótulos/exemplos). */
  operatorVariables?: OperatorVariableMeta[] | null;
}

/** Normaliza um `WhatsappTemplate` (picker) em `PendingTemplate`. */
export function whatsappTemplateToPending(tpl: WhatsappTemplate): PendingTemplate {
  return {
    name: tpl.metaTemplateName ?? tpl.name,
    label: tpl.name,
    content: tpl.body ?? "",
    headerText: tpl.headerText ?? "",
    metaTemplateId: tpl.metaTemplateId ?? null,
    category: tpl.category ?? null,
    language: tpl.language ?? null,
    operatorVariables: tpl.operatorVariables ?? null,
  };
}

/**
 * Normaliza um template Meta escolhido no menu "/" em `PendingTemplate`.
 * O cabeçalho vai junto: sem ele o painel não pede a variável do HEADER e a
 * Meta recusa o envio por parâmetro faltando.
 */
export function slashTemplateToPending(item: {
  id: string;
  name: string;
  label?: string | null;
  bodyPreview: string;
  headerPreview?: string | null;
  operatorVariables?: OperatorVariableMeta[] | null;
}): PendingTemplate {
  return {
    name: item.name,
    label: item.label || undefined,
    content: item.bodyPreview,
    headerText: item.headerPreview ?? "",
    metaTemplateId: item.id,
    operatorVariables: item.operatorVariables ?? null,
  };
}

/** Metadados visuais da categoria WABA — mesma paleta do picker. */
function categoryMeta(category?: string | null): { label: string; color: string } | null {
  const c = (category ?? "").toUpperCase();
  if (c === "MARKETING") return { label: "Marketing", color: "#a855f7" };
  if (c === "UTILITY") return { label: "Utility", color: "#0ea5e9" };
  if (c === "AUTHENTICATION") return { label: "Autenticação", color: "#f59e0b" };
  return null;
}

function slotId(component: string, key: string): string {
  return `${component}::${key}`;
}

function fillComponentText(
  text: string,
  component: "header" | "body",
  values: Record<string, string>,
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
    const key = raw.trim();
    const value = values[slotId(component, key)]?.trim();
    return value ? value : `{{${key}}}`;
  });
}

const fieldClass =
  "h-8 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]";

export type FlowActionDataParse =
  | { ok: true; data: Record<string, unknown> | null }
  | { ok: false; error: string };

/**
 * JSON inicial do Flow (`flowActionData`): vazio = sem dados; senão precisa
 * ser um objeto. Mesmas mensagens do painel legado do ChatWindow.
 */
export function parseFlowActionData(raw: string): FlowActionDataParse {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, data: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "JSON inválido. Corrija ou deixe em branco." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "O JSON deve ser um objeto {...}, não lista ou primitivo.",
    };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}

export function TemplateComposePanel({
  conversationId,
  template,
  onCancel,
  onSent,
  availableChannels,
  selectedChannelId,
  conversationChannelId,
  lastMessageChannelId,
  onSelectChannel,
}: {
  conversationId: string;
  template: PendingTemplate;
  onCancel: () => void;
  onSent?: () => void;
  /**
   * Canais WhatsApp CONNECTED da org. Quando presente, o painel exibe um
   * seletor para o operador escolher por qual número enviar — importante
   * quando o canal original da conversa está DISCONNECTED (a Meta pode
   * invalidar o token do lado dela).
   */
  availableChannels?: OutboundChannelOption[];
  /** Canal escolhido para envio (controlado pelo pai). */
  selectedChannelId?: string | null;
  /** Canal "atual" da conversa (último inbound) — destacado como referência. */
  conversationChannelId?: string | null;
  /** Canal da última mensagem pública — pré-seleção se ainda CONNECTED. */
  lastMessageChannelId?: string | null;
  onSelectChannel?: (channelId: string) => void;
}) {
  const qc = useQueryClient();
  const [vars, setVars] = useState<Record<string, string>>({});
  const [pickOpen, setPickOpen] = useState(false);
  const [confirmedChannelId, setConfirmedChannelId] = useState<string | null>(null);
  const retryAfterPickRef = useRef(false);
  const pendingSendRef = useRef(false);
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirm();
  // Flow (templates com botão Flow): token opcional (vazio = UUID gerado no
  // backend) e JSON de dados iniciais. Campos recolhidos por padrão.
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowToken, setFlowToken] = useState("");
  const [flowJson, setFlowJson] = useState("");
  const [flowJsonError, setFlowJsonError] = useState<string | null>(null);
  const waChannels = availableChannels?.filter((c) => c.type === "WHATSAPP");

  // Canal gravado na conversa ausente ou fora da lista CONNECTED.
  // Não bloqueia o envio se o composer já tem um WhatsApp CONNECTED
  // selecionado (sessão 24h encerrada cai exatamente neste caso).
  const channelsReady = waChannels !== undefined;
  const conversationChannelConnected = Boolean(
    conversationChannelId &&
      waChannels?.some((c) => c.id === conversationChannelId),
  );
  const channelUnidentified = channelsReady && !conversationChannelConnected;
  const selectedIsConnected = Boolean(
    selectedChannelId && waChannels?.some((c) => c.id === selectedChannelId),
  );
  const effectiveChannelId =
    confirmedChannelId ?? (selectedIsConnected ? selectedChannelId : null);
  const needsChannelPick =
    channelUnidentified && (waChannels?.length ?? 0) > 0 && !effectiveChannelId;

  const suggestedChannelId = useMemo(() => {
    if (!waChannels?.length) return null;
    if (lastMessageChannelId && waChannels.some((c) => c.id === lastMessageChannelId)) {
      return lastMessageChannelId;
    }
    if (selectedIsConnected) return selectedChannelId ?? null;
    return null;
  }, [waChannels, lastMessageChannelId, selectedIsConnected, selectedChannelId]);

  const showChannelSelector = Boolean(
    !channelUnidentified &&
      waChannels &&
      waChannels.length > 0 &&
      onSelectChannel,
  );

  useEffect(() => {
    setConfirmedChannelId(null);
    retryAfterPickRef.current = false;
    pendingSendRef.current = false;
    setFlowOpen(false);
    setFlowToken("");
    setFlowJson("");
    setFlowJsonError(null);
  }, [conversationId, template.name]);

  useEffect(() => {
    if (needsChannelPick) setPickOpen(true);
  }, [needsChannelPick]);

  const slots = useMemo(
    () => chatTemplateSlots(template.content, template.headerText, template.operatorVariables),
    [template],
  );

  // Reseta os valores ao trocar de template (preserva o mesmo componente+chave).
  useEffect(() => {
    setVars((prev) => {
      const next: Record<string, string> = {};
      for (const slot of slots) {
        const id = slotId(slot.component, slot.key);
        next[id] = prev[id] ?? "";
      }
      return next;
    });
  }, [slots]);

  const renderedHeader = useMemo(
    () => fillComponentText(template.headerText ?? "", "header", vars),
    [template.headerText, vars],
  );
  const renderedPreview = useMemo(
    () => fillComponentText(template.content, "body", vars),
    [template.content, vars],
  );

  const allFilled = slots.every((slot) => vars[slotId(slot.component, slot.key)]?.trim().length);

  const sendMutation = useMutation({
    mutationFn: (channelOverride?: string | null) => {
      const channelId = channelOverride ?? effectiveChannelId;
      const components = slots.length
        ? buildTemplateComponents(
            slots.map((slot) => ({
              component: slot.component,
              key: slot.key,
              value: vars[slotId(slot.component, slot.key)] ?? "",
            })),
          )
        : undefined;
      // `handleSendClick` já validou o JSON; aqui só monta o payload
      // (o caminho "reenviar após escolher canal" também passa por aqui).
      const flow = parseFlowActionData(flowJson);
      if (!flow.ok) throw new Error(flow.error);
      const headerLine = renderedHeader.trim();
      const bodyLine = renderedPreview || template.content;
      return sendTemplate(conversationId, {
        templateName: template.name,
        bodyPreview: headerLine ? `${headerLine}\n${bodyLine}` : bodyLine,
        languageCode: template.language ?? "pt_BR",
        components,
        flowToken: flowToken.trim() || null,
        flowActionData: flow.data,
        templateGraphId: template.metaTemplateId ?? null,
        // Sempre manda o canal CONNECTED escolhido. Omitir faz o backend
        // cair no `conv.channelRef` da conversa — que nesta tela costuma
        // estar desconectado (sessão 24h já fechou).
        channelId: channelId ?? null,
      });
    },
    onSuccess: (data) => {
      toast.success("Template enviado");
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
      // Conversa encerrada reaberta como novo ticket → troca o chat ativo.
      if (data.reopenedConversationId) {
        qc.invalidateQueries({ queryKey: messagesKey(data.reopenedConversationId) });
        emitConversationReopened(data.reopenedConversationId);
        void refreshInboxLists(qc);
        qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      } else {
        const headerLine = renderedHeader.trim();
        const bodyLine = renderedPreview || template.content;
        applyOutboundPreviewToInboxCaches(qc, conversationId, {
          content: headerLine ? `${headerLine}\n${bodyLine}` : bodyLine,
          messageType: "template",
        });
      }
      onSent?.();
    },
    onError: (err: Error) => {
      if (isDisconnectedChannelError(err) && (waChannels?.length ?? 0) > 0) {
        toast.error(err.message || "Canal desconectado");
        retryAfterPickRef.current = true;
        setConfirmedChannelId(null);
        setPickOpen(true);
        return;
      }
      toast.error(err.message || "Falha ao enviar template");
    },
  });

  function handleConfirmChannel(id: string) {
    onSelectChannel?.(id);
    setConfirmedChannelId(id);
    setPickOpen(false);
    const shouldSend = retryAfterPickRef.current || pendingSendRef.current;
    retryAfterPickRef.current = false;
    pendingSendRef.current = false;
    if (shouldSend) sendMutation.mutate(id);
  }

  async function handleSendClick() {
    const flow = parseFlowActionData(flowJson);
    if (!flow.ok) {
      setFlowJsonError(flow.error);
      setFlowOpen(true);
      return;
    }
    setFlowJsonError(null);
    if (!effectiveChannelId && (waChannels?.length ?? 0) > 0) {
      pendingSendRef.current = true;
      setPickOpen(true);
      return;
    }
    const outboundId = effectiveChannelId;
    if (
      conversationChannelConnected &&
      isChannelMismatch(outboundId, conversationChannelId, waChannels) &&
      outboundId &&
      conversationChannelId
    ) {
      const ok = await confirmDialog(
        channelSwitchConfirmOptions(
          waChannels,
          outboundId,
          conversationChannelId,
        ),
      );
      if (!ok) return;
    }
    sendMutation.mutate(outboundId);
  }

  const selectedLabel = useMemo(() => {
    const id = confirmedChannelId ?? selectedChannelId;
    const ch = waChannels?.find((c) => c.id === id);
    if (!ch) return null;
    return ch.phoneNumber ? `${ch.name} · ${ch.phoneNumber}` : ch.name;
  }, [waChannels, confirmedChannelId, selectedChannelId]);

  const sendBlockedByChannel =
    channelsReady && (waChannels?.length ?? 0) > 0 && !effectiveChannelId;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-full rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)] p-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      {confirmDialogNode}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/12 text-[var(--color-success-text)]">
          <IconLock size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
              {template.label || template.name}
            </p>
            {(() => {
              const meta = categoryMeta(template.category);
              return meta ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide"
                  style={{
                    background: `color-mix(in srgb, ${meta.color} 14%, white)`,
                    color: `color-mix(in srgb, ${meta.color} 78%, black)`,
                    borderColor: `color-mix(in srgb, ${meta.color} 38%, transparent)`,
                  }}
                  title={`Categoria WhatsApp: ${meta.label}`}
                >
                  {meta.label}
                </span>
              ) : null;
            })()}
            {template.language && (
              <span className="shrink-0 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {template.language}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
            Template do WhatsApp — corpo não editável
          </p>

          <div className="mt-2 max-h-[160px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-[var(--glass-border)]/60 bg-[var(--glass-bg-strong)] px-2.5 py-2 text-[12.5px] leading-relaxed text-[var(--text-primary)]">
            {renderedHeader.trim() ? (
              <p className="font-semibold">{renderedHeader}</p>
            ) : null}
            <p>{renderedPreview || template.content}</p>
          </div>

          {slots.length > 0 ? (
            <div className="mt-2.5 space-y-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Preencha e valide as variáveis
              </p>
              {slots.map((slot) => {
                const id = slotId(slot.component, slot.key);
                const meta = template.operatorVariables?.find(
                  (v) =>
                    (v.component === "header" ? "header" : "body") === slot.component &&
                    String(v.key ?? "").trim() === slot.key,
                );
                const custom = meta?.label?.trim();
                const label =
                  custom && custom !== slot.key
                    ? custom
                    : slot.component === "header"
                      ? "Cabeçalho"
                      : "Corpo";
                return (
                  <label key={id} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
                      {label}{" "}
                      <code className="font-mono text-[10.5px] text-[var(--text-primary)]">{`{{${slot.key}}}`}</code>
                    </span>
                    <input
                      type="text"
                      value={vars[id] ?? ""}
                      onChange={(e) => setVars((prev) => ({ ...prev, [id]: e.target.value }))}
                      placeholder={meta?.example ? `Ex.: ${meta.example}` : `Valor para {{${slot.key}}}`}
                      className={fieldClass}
                    />
                  </label>
                );
              })}
            </div>
          ) : null}

          {/* Flow (opcional) — recolhido; abre sozinho se o JSON estiver inválido */}
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setFlowOpen((v) => !v)}
              aria-expanded={flowOpen}
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              {flowOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
              Flow (opcional)
            </button>
            {flowOpen ? (
              <div className="mt-2 space-y-2">
                <p className="text-[10.5px] leading-snug text-[var(--text-muted)]">
                  Para templates com botão Flow: deixe em branco para o CRM gerar um{" "}
                  <code className="font-mono text-[10px]">flow_token</code> (UUID) por
                  envio, ou informe o JSON de dados iniciais conforme a{" "}
                  <a
                    className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
                    href="https://developers.facebook.com/docs/whatsapp/flows"
                    target="_blank"
                    rel="noreferrer"
                  >
                    documentação Meta (Flows)
                  </a>
                  .
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">
                    Token do Flow (opcional)
                  </span>
                  <input
                    type="text"
                    value={flowToken}
                    onChange={(e) => setFlowToken(e.target.value)}
                    placeholder="Vazio = UUID gerado automaticamente no envio"
                    className={`${fieldClass} font-mono text-[12px]`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">
                    JSON inicial do Flow
                  </span>
                  <textarea
                    value={flowJson}
                    onChange={(e) => {
                      setFlowJson(e.target.value);
                      setFlowJsonError(null);
                    }}
                    placeholder='Ex.: {"screen":"NOME_DA_TELA","data":{"campo":"valor"}}'
                    rows={3}
                    aria-invalid={flowJsonError ? true : undefined}
                    className="resize-y rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] aria-invalid:border-[var(--color-destructive)]"
                  />
                </label>
                {flowJsonError ? (
                  <p role="alert" className="text-[11px] text-[var(--color-destructive)]">
                    {flowJsonError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar template"
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
        >
          <IconX size={15} />
        </button>
      </div>

      {channelUnidentified ? (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-2.5 py-2 text-[11.5px] leading-snug text-[var(--text-primary)]">
          <IconAlertTriangle size={14} className="mt-px shrink-0 text-[var(--color-warn)]" />
          <p>
            O canal desta conversa não está identificado ou está{" "}
            <span className="font-semibold">desconectado</span>.
            {effectiveChannelId
              ? " O template será enviado pelo WhatsApp selecionado."
              : " Escolha um WhatsApp conectado da organização para enviar o template."}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {channelUnidentified && (waChannels?.length ?? 0) > 0 ? (
          <button
            type="button"
            onClick={() => setPickOpen(true)}
            disabled={sendMutation.isPending}
            className="mr-auto inline-flex max-w-none items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {selectedLabel ?? "Escolher canal"}
          </button>
        ) : showChannelSelector ? (
          <ChannelSelector
            channels={waChannels ?? []}
            selectedChannelId={selectedChannelId ?? null}
            conversationChannelId={conversationChannelId ?? null}
            onSelect={onSelectChannel!}
            disabled={sendMutation.isPending}
            className="mr-auto"
          />
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={sendMutation.isPending || !allFilled || sendBlockedByChannel}
          title={
            sendBlockedByChannel
              ? "Escolha um canal conectado para enviar"
              : !allFilled
                ? "Preencha todas as variáveis primeiro"
                : "Enviar template"
          }
          onClick={() => void handleSendClick()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-1.5 text-[12px] font-semibold text-white shadow-[var(--glass-shadow-sm)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <IconSend size={14} />
          {sendMutation.isPending ? "Enviando…" : "Enviar template"}
        </button>
      </div>

      {channelUnidentified || pickOpen ? (
        <ChannelPickModal
          open={pickOpen}
          onOpenChange={setPickOpen}
          channels={waChannels ?? []}
          selectedChannelId={confirmedChannelId ?? selectedChannelId ?? null}
          suggestedChannelId={suggestedChannelId}
          onConfirm={handleConfirmChannel}
        />
      ) : null}
    </div>
  );
}
