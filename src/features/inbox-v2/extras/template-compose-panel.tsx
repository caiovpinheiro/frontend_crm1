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
import { toast } from "sonner";
import {
  IconAlertTriangle,
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
import type { OperatorVariableMeta } from "@/lib/meta-whatsapp/operator-template-variables";

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
    metaTemplateId: tpl.metaTemplateId ?? null,
    category: tpl.category ?? null,
    language: tpl.language ?? null,
    operatorVariables: tpl.operatorVariables ?? null,
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

function extractPlaceholders(content: string, vars: OperatorVariableMeta[] | null | undefined): string[] {
  const fromMeta = vars?.map((v) => v.key).filter(Boolean) ?? [];
  if (fromMeta.length) return fromMeta;
  const set = new Set<string>();
  const re = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) set.add(m[1].trim());
  const keys = Array.from(set);
  // Ordena numéricos por valor ({{1}}, {{2}}...), mantém os demais na ordem.
  const numeric = keys.filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  const named = keys.filter((k) => !/^\d+$/.test(k));
  return [...numeric, ...named];
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
  }, [conversationId, template.name]);

  useEffect(() => {
    if (needsChannelPick) setPickOpen(true);
  }, [needsChannelPick]);

  const placeholders = useMemo(
    () => extractPlaceholders(template.content, template.operatorVariables),
    [template],
  );

  // Reseta os valores ao trocar de template (preserva chaves iguais).
  useEffect(() => {
    setVars((prev) => {
      const next: Record<string, string> = {};
      for (const k of placeholders) next[k] = prev[k] ?? "";
      return next;
    });
  }, [placeholders]);

  const renderedPreview = useMemo(
    () =>
      template.content.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
        const k = raw.trim();
        const v = vars[k]?.trim();
        return v ? v : `{{${k}}}`;
      }),
    [template.content, vars],
  );

  const allFilled = placeholders.every((k) => vars[k]?.trim().length);

  const sendMutation = useMutation({
    mutationFn: (channelOverride?: string | null) => {
      const channelId = channelOverride ?? effectiveChannelId;
      const components = placeholders.length
        ? [
            {
              type: "body",
              parameters: placeholders.map((k) => ({
                type: "text",
                text: vars[k] ?? "",
              })),
            },
          ]
        : undefined;
      return sendTemplate(conversationId, {
        templateName: template.name,
        bodyPreview: renderedPreview || template.content,
        languageCode: template.language ?? "pt_BR",
        components,
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
        qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
        qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      } else {
        applyOutboundPreviewToInboxCaches(qc, conversationId, {
          content: renderedPreview || template.content,
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
    if (!effectiveChannelId && (waChannels?.length ?? 0) > 0) {
      pendingSendRef.current = true;
      setPickOpen(true);
      return;
    }
    const outboundId = effectiveChannelId;
    if (
      conversationChannelConnected &&
      isChannelMismatch(outboundId, conversationChannelId) &&
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

          <p className="mt-2 max-h-[160px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-[var(--glass-border)]/60 bg-[var(--glass-bg-strong)] px-2.5 py-2 text-[12.5px] leading-relaxed text-[var(--text-primary)]">
            {renderedPreview || template.content}
          </p>

          {placeholders.length > 0 ? (
            <div className="mt-2.5 space-y-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Preencha e valide as variáveis
              </p>
              {placeholders.map((k) => {
                const meta = template.operatorVariables?.find((v) => v.key === k);
                const label = meta?.label?.trim() || `Variável {{${k}}}`;
                return (
                  <label key={k} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
                      {label}{" "}
                      <code className="font-mono text-[10.5px] text-[var(--text-primary)]">{`{{${k}}}`}</code>
                    </span>
                    <input
                      type="text"
                      value={vars[k] ?? ""}
                      onChange={(e) => setVars((prev) => ({ ...prev, [k]: e.target.value }))}
                      placeholder={meta?.example ? `Ex.: ${meta.example}` : `Valor para {{${k}}}`}
                      className="h-8 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]"
                    />
                  </label>
                );
              })}
            </div>
          ) : null}
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
