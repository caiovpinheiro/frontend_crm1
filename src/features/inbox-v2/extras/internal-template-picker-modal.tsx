"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconClick,
  IconFileText,
  IconHeadset,
  IconHierarchy,
  IconLoader2,
  IconMail,
  IconMessage,
  IconMessageCode,
  IconPaperclip,
  IconPhoto,
  IconSearch,
  IconShoppingBag,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

import { sendInternalTemplateSequence } from "@/features/inbox-v2/api";
import { applyOutboundPreviewToInboxCaches, messagesKey } from "@/features/inbox-v2/hooks";
import {
  interpolateInternalTemplate,
  type InternalTemplateContext,
} from "@/lib/internal-template-variables";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// InternalTemplatePickerModal — mesmo chrome da AgentAutomationPickerModal
// (portal central, header ícone+título+busca, seções por categoria, grid 2 col).
// Comportamento inalterado: onPick insere no composer; sem onPick envia na hora.
// ─────────────────────────────────────────────────────────────────────────────

type CategoryVisual = { Icon: TablerIcon; fg: string; bg: string };

const CATEGORY_VISUAL: Record<string, CategoryVisual> = {
  message: { Icon: IconMessage, fg: "text-[var(--color-info)]", bg: "bg-[var(--color-primary)]/8" },
  support: { Icon: IconHeadset, fg: "text-[var(--color-info)]", bg: "bg-[var(--color-primary)]/8" },
  media: { Icon: IconPhoto, fg: "text-[var(--color-cyan)]", bg: "bg-[var(--color-cyan-soft)]" },
  template: { Icon: IconFileText, fg: "text-[var(--color-success)]", bg: "bg-[var(--color-success-soft,rgba(16,185,129,0.1))]" },
  interactive: { Icon: IconClick, fg: "text-[var(--color-lavender)]", bg: "bg-[var(--color-lavender-soft)]" },
  product: { Icon: IconShoppingBag, fg: "text-[var(--color-warn)]", bg: "bg-[var(--color-warn-bg)]" },
  email: { Icon: IconMail, fg: "text-[var(--color-info)]", bg: "bg-[var(--color-primary)]/8" },
  flow: { Icon: IconHierarchy, fg: "text-[var(--text-muted)]", bg: "bg-[var(--glass-bg-overlay)]" },
};

const CATEGORY_ALIASES: Record<string, keyof typeof CATEGORY_VISUAL> = {
  suporte: "support",
  support: "support",
  atendimento: "support",
  help: "support",
  mensagem: "message",
  mensagens: "message",
  midia: "media",
  media: "media",
  imagem: "media",
  foto: "media",
  vendas: "product",
  comercial: "product",
  sales: "product",
  onboarding: "template",
  "boas-vindas": "template",
  welcome: "template",
  fluxo: "flow",
  fluxos: "flow",
  "follow-up": "flow",
  followup: "flow",
  email: "email",
  "e-mail": "email",
  botoes: "interactive",
  botões: "interactive",
  geral: "flow",
  "sem categoria": "flow",
};

const PALETTE = Object.values(CATEGORY_VISUAL);

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function visualForCategory(label: string): CategoryVisual {
  const key = CATEGORY_ALIASES[normalize(label.trim())];
  if (key) return CATEGORY_VISUAL[key];
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? CATEGORY_VISUAL.flow;
}

interface InternalTemplateAttachment {
  url: string;
  mimeType?: string | null;
  name?: string | null;
  messageBefore?: string | null;
}

interface InternalTemplate {
  id: string;
  name: string;
  content: string;
  category: string | null;
  channelType: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaName?: string | null;
  attachments?: InternalTemplateAttachment[] | null;
}

async function fetchInternalTemplates(): Promise<InternalTemplate[]> {
  const res = await fetch(apiUrl("/api/templates"));
  if (!res.ok) throw new Error("Falha ao carregar modelos");
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function getTemplateAttachments(
  tpl: InternalTemplate,
): Array<{ url: string; name: string | null; messageBefore: string | null }> {
  if (Array.isArray(tpl.attachments) && tpl.attachments.length > 0) {
    return tpl.attachments.map((a) => ({
      url: a.url,
      name: a.name ?? null,
      messageBefore: a.messageBefore ?? null,
    }));
  }
  if (tpl.mediaUrl) return [{ url: tpl.mediaUrl, name: tpl.mediaName ?? null, messageBefore: null }];
  return [];
}

type GroupedTemplates = { label: string; items: InternalTemplate[] };

export function InternalTemplatePickerModal({
  open,
  onClose,
  conversationId,
  templateContext,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  templateContext?: InternalTemplateContext;
  onPick?: (
    text: string,
    media?: Array<{ url: string; name: string | null; messageBefore: string | null }> | null,
  ) => void;
}) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);
  const qc = useQueryClient();

  React.useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery<InternalTemplate[]>({
    queryKey: ["internal-templates"],
    queryFn: fetchInternalTemplates,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sendMutation = useMutation({
    mutationFn: async (tpl: InternalTemplate) => {
      const text = interpolateInternalTemplate(tpl.content, templateContext ?? {});
      const attachments = getTemplateAttachments(tpl);
      await sendInternalTemplateSequence({ conversationId, content: text, attachments });
      return text;
    },
    onSuccess: (text) => {
      toast.success("Modelo enviado");
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
      applyOutboundPreviewToInboxCaches(qc, conversationId, { content: text });
      onClose();
    },
    onError: (err: Error & { toasted?: boolean }) => {
      if (err.toasted) return;
      toast.error(err.message || "Falha ao enviar modelo");
    },
  });

  const items = data ?? [];
  const q = normalize(query.trim());

  const groups = React.useMemo<GroupedTemplates[]>(() => {
    const filtered = q
      ? items.filter(
          (t) =>
            normalize(t.name).includes(q) ||
            normalize(t.content ?? "").includes(q) ||
            normalize(t.category ?? "").includes(q),
        )
      : items;
    const byCat = new Map<string, InternalTemplate[]>();
    for (const t of filtered) {
      const label = t.category?.trim() || "Geral";
      const list = byCat.get(label);
      if (list) list.push(t);
      else byCat.set(label, [t]);
    }
    return Array.from(byCat.entries()).map(([label, groupItems]) => ({
      label,
      items: groupItems,
    }));
  }, [items, q]);

  function handlePick(tpl: InternalTemplate) {
    if (sendMutation.isPending) return;
    if (onPick) {
      const media = getTemplateAttachments(tpl);
      onPick(
        interpolateInternalTemplate(tpl.content, templateContext ?? {}),
        media.length > 0 ? media : null,
      );
      onClose();
      return;
    }
    sendMutation.mutate(tpl);
  }

  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="internal-tpl-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-70 bg-black/30 backdrop-blur-sm"
            aria-hidden
          />

          <motion.div
            key="internal-tpl-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Modelos internos"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              "fixed left-1/2 top-1/2 z-71 -translate-x-1/2 -translate-y-1/2",
              "w-[min(720px,calc(100vw-32px))] max-h-[min(80vh,720px)]",
              "flex flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--glass-border)]",
              "bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-6 pt-6 pb-5 backdrop-blur-md sm:px-7">
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    "bg-linear-to-br from-[var(--brand-primary)] to-[var(--brand-primary-dark)] text-white",
                    "shadow-[var(--glass-shadow)] ring-1 ring-white/40",
                  )}
                >
                  <IconMessageCode className="size-5" strokeWidth={2.4} />
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[20px] font-bold leading-tight tracking-tighter text-[var(--text-primary)] sm:text-[22px]">
                    Modelos internos
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium tracking-tight text-[var(--text-muted)]">
                    Escolha um modelo para inserir nesta conversa.
                  </p>
                </div>

                <div className="hidden items-center gap-2 sm:flex">
                  <SearchInput inputRef={inputRef} value={query} onChange={setQuery} />
                  <CloseButton onClose={onClose} />
                </div>
                <div className="sm:hidden">
                  <CloseButton onClose={onClose} />
                </div>
              </div>

              <div className="mt-3 sm:hidden">
                <SearchInput inputRef={inputRef} value={query} onChange={setQuery} />
              </div>
            </div>

            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-14">
                  <IconLoader2 className="size-6 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : isError ? (
                <div className="py-12 text-center">
                  <p className="text-[13px] text-[var(--color-danger)]">
                    Falha ao carregar modelos.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="mt-2 text-[12px] font-semibold text-[var(--brand-primary)] hover:underline"
                  >
                    Tentar de novo
                  </button>
                </div>
              ) : groups.length === 0 ? (
                <div className="py-12 text-center text-[13px] tracking-tight text-[var(--text-muted)]">
                  {query
                    ? `Nenhum modelo encontrado para "${query}".`
                    : "Nenhum modelo interno cadastrado."}
                </div>
              ) : (
                groups.map((group, idx) => {
                  const visual = visualForCategory(group.label);
                  const Icon = visual.Icon;
                  return (
                    <section key={group.label} className={cn(idx > 0 && "mt-6")}>
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex size-5 shrink-0 items-center justify-center rounded-md",
                            visual.bg,
                            visual.fg,
                          )}
                        >
                          <Icon className="size-3" strokeWidth={2.6} />
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-widest",
                            visual.fg,
                          )}
                        >
                          {group.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {group.items.map((tpl) => (
                          <TemplateCard
                            key={tpl.id}
                            item={tpl}
                            pending={sendMutation.isPending && sendMutation.variables?.id === tpl.id}
                            disabled={sendMutation.isPending}
                            onClick={() => handlePick(tpl)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    portalTarget,
  );
}

function TemplateCard({
  item,
  pending,
  disabled,
  onClick,
}: {
  item: InternalTemplate;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const category = item.category?.trim() || "Geral";
  const visual = visualForCategory(category);
  const Icon = visual.Icon;
  const attachments = getTemplateAttachments(item);
  const attachmentLabel =
    attachments.length === 0
      ? null
      : attachments.length === 1
        ? "com anexo"
        : `${attachments.length} anexos`;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -1 }}
      className={cn(
        "group/card flex w-full items-start gap-3 rounded-2xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)]",
        "px-3.5 py-3 text-left transition-all duration-150",
        "hover:border-[var(--brand-primary)]/30 hover:shadow-[var(--glass-shadow)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          "ring-1 ring-[var(--glass-border-subtle)] transition-all",
          visual.bg,
          visual.fg,
        )}
      >
        {pending ? (
          <IconLoader2 className="size-[18px] animate-spin" />
        ) : (
          <Icon className="size-[18px]" strokeWidth={2.2} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold tracking-tight text-[var(--text-primary)]">
            {item.name}
          </p>
          {attachmentLabel ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
              <IconPaperclip className="size-3" strokeWidth={2.2} />
              {attachmentLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11.5px] font-medium leading-snug tracking-tight text-[var(--text-muted)]">
          {item.content || "Sem preview."}
        </p>
      </div>
    </motion.button>
  );
}

function SearchInput({
  inputRef,
  value,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className={cn(
        "relative flex h-9 items-center gap-1.5 rounded-full border border-[var(--glass-border)]",
        "bg-[var(--input-bg)] pl-3 pr-1 transition-colors",
        "focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/20",
      )}
    >
      <IconSearch className="size-3.5 shrink-0 text-[var(--text-muted)]" strokeWidth={2.2} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pesquisar modelo..."
        className={cn(
          "h-full min-w-0 flex-1 border-0 bg-transparent text-[13px]",
          "tracking-tight text-[var(--text-primary)] outline-none",
          "placeholder:font-medium placeholder:text-[var(--text-muted)]",
          "w-[200px]",
        )}
      />
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Fechar"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full",
        "border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
        "transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] active:scale-95",
      )}
    >
      <IconX className="size-4" strokeWidth={2.2} />
    </button>
  );
}
