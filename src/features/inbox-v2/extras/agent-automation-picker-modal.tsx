"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconBolt,
  IconLoader2,
  IconMessage,
  IconPhoto,
  IconFileText,
  IconClick,
  IconShoppingBag,
  IconMail,
  IconHierarchy,
  IconSearch,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  fetchAgentAutomations,
  type AgentAutomationItem,
} from "@/features/automations-v2/api";

// ─────────────────────────────────────────────────────────────────────────────
// AgentAutomationPickerModal — modal central (padrão StepPickerModal) para o
// agente escolher e disparar uma automação manual pela conversa. Agrupa por
// categoria (Mensagens, Mídia, Templates, ...) e mostra o preview da mensagem
// para o agente ver o que vai enviar.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_VISUAL: Record<string, { Icon: TablerIcon; fg: string; bg: string }> = {
  message: { Icon: IconMessage, fg: "text-[var(--color-info)]", bg: "bg-[var(--color-primary)]/8" },
  media: { Icon: IconPhoto, fg: "text-[var(--color-cyan)]", bg: "bg-[var(--color-cyan-soft)]" },
  template: { Icon: IconFileText, fg: "text-[var(--color-success)]", bg: "bg-[var(--color-success-soft,rgba(16,185,129,0.1))]" },
  interactive: { Icon: IconClick, fg: "text-[var(--color-lavender)]", bg: "bg-[var(--color-lavender-soft)]" },
  product: { Icon: IconShoppingBag, fg: "text-[var(--color-warn)]", bg: "bg-[var(--color-warn-bg)]" },
  email: { Icon: IconMail, fg: "text-[var(--color-info)]", bg: "bg-[var(--color-primary)]/8" },
  flow: { Icon: IconHierarchy, fg: "text-[var(--text-muted)]", bg: "bg-[var(--glass-bg-overlay)]" },
};

function visualForCategory(category: string) {
  return CATEGORY_VISUAL[category] ?? CATEGORY_VISUAL.flow;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function runAutomation(
  automationId: string,
  payload: { contactId: string; conversationId?: string | null; dealId?: string | null },
): Promise<{ automationName?: string }> {
  const res = await fetch(apiUrl(`/api/automations/${automationId}/run`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contactId: payload.contactId,
      conversationId: payload.conversationId ?? undefined,
      dealId: payload.dealId ?? undefined,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    automationName?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(typeof json?.message === "string" ? json.message : "Falha ao executar");
  }
  return { automationName: json.automationName };
}

type GroupedAutomations = { category: string; label: string; items: AgentAutomationItem[] };

export function AgentAutomationPickerModal({
  open,
  onClose,
  conversationId,
  contactId,
  dealId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  contactId?: string | null;
  /** Negócio aberto na tela. Sem ele, vários cards abertos não escolhem destino. */
  dealId?: string | null;
}) {
  const [query, setQuery] = React.useState("");
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["agent-automations"],
    queryFn: fetchAgentAutomations,
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
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

  const items = data?.items ?? [];
  const q = normalize(query.trim());

  const groups = React.useMemo<GroupedAutomations[]>(() => {
    const filtered = q
      ? items.filter(
          (a) =>
            normalize(a.name).includes(q) ||
            normalize(a.description ?? "").includes(q) ||
            normalize(a.messagePreview ?? "").includes(q),
        )
      : items;
    const byCat = new Map<string, GroupedAutomations>();
    for (const a of filtered) {
      const g = byCat.get(a.category);
      if (g) g.items.push(a);
      else byCat.set(a.category, { category: a.category, label: a.categoryLabel, items: [a] });
    }
    // Mensagens primeiro, fluxos por último.
    const order = ["message", "media", "template", "interactive", "product", "email", "flow"];
    return Array.from(byCat.values()).sort(
      (x, y) => order.indexOf(x.category) - order.indexOf(y.category),
    );
  }, [items, q]);

  async function handleRun(a: AgentAutomationItem) {
    if (runningId) return;
    if (!contactId) {
      toast.error("Sem contato associado a esta conversa.");
      return;
    }
    setRunningId(a.id);
    try {
      const result = await runAutomation(a.id, { contactId, conversationId, dealId });
      toast.success(`Automação disparada: ${result.automationName ?? a.name}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar automação");
    } finally {
      setRunningId(null);
    }
  }

  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="agent-auto-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-70 bg-black/30 backdrop-blur-sm"
            aria-hidden
          />

          <motion.div
            key="agent-auto-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Executar automação"
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
            {/* Header */}
            <div className="shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-6 pt-6 pb-5 backdrop-blur-md sm:px-7">
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    "bg-linear-to-br from-[var(--brand-primary)] to-[var(--brand-primary-dark)] text-white",
                    "shadow-[var(--glass-shadow)] ring-1 ring-white/40",
                  )}
                >
                  <IconBolt className="size-5" strokeWidth={2.4} />
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[20px] font-bold leading-tight tracking-tighter text-[var(--text-primary)] sm:text-[22px]">
                    Executar automação
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium tracking-tight text-[var(--text-muted)]">
                    Escolha uma automação para disparar nesta conversa.
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

            {/* Body */}
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-14">
                  <IconLoader2 className="size-6 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : isError ? (
                <div className="py-12 text-center">
                  <p className="text-[13px] text-[var(--color-danger)]">
                    Falha ao carregar automações.
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
                    ? `Nenhuma automação encontrada para "${query}".`
                    : "Nenhuma automação habilitada para o agente."}
                  {!query && (
                    <div className="mt-1 text-[11.5px] text-[var(--text-muted)]/70">
                      Crie uma com gatilho “Manual” ou marque “Habilitar para o
                      agente enviar” na automação.
                    </div>
                  )}
                </div>
              ) : (
                groups.map((group, idx) => {
                  const visual = visualForCategory(group.category);
                  const Icon = visual.Icon;
                  return (
                    <section key={group.category} className={cn(idx > 0 && "mt-6")}>
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
                        {group.items.map((a) => (
                          <AutomationCard
                            key={a.id}
                            item={a}
                            running={runningId === a.id}
                            disabled={!!runningId}
                            onClick={() => void handleRun(a)}
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

function AutomationCard({
  item,
  running,
  disabled,
  onClick,
}: {
  item: AgentAutomationItem;
  running: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const visual = visualForCategory(item.category);
  const Icon = visual.Icon;
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
        {running ? (
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
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
            {item.stepCount} passo{item.stepCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11.5px] font-medium leading-snug tracking-tight text-[var(--text-muted)]">
          {item.messagePreview || item.description || "Sem preview de mensagem."}
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
        placeholder="Pesquisar automação..."
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
