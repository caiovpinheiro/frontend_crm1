"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshInboxLists } from "@/features/inbox-v2/hooks/inbox-list-refresh";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconCopy,
  IconFileText,
  IconSend,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";

import { apiUrl } from "@/lib/api";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { FormDialog } from "@/components/ui/form-dialog";
import {
  listAgentEnabledTemplates,
  sendTemplate,
  type WhatsappTemplate,
} from "@/features/inbox-v2/api";
import {
  applyOutboundPreviewToInboxCaches,
  emitConversationReopened,
  messagesKey,
  useMessages,
} from "@/features/inbox-v2/hooks";
import type { InboxMessageDto } from "@/features/inbox-v2/api/types";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | "UTILITY" | "MARKETING" | "FAVORITES";

type ShortcutRow = {
  itemKind: string;
  itemId: string;
  favorite: boolean;
  useCount: number;
};

async function fetchAgentShortcuts(): Promise<ShortcutRow[]> {
  const r = await fetch(apiUrl("/api/slash-shortcuts"));
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return list as ShortcutRow[];
}

function favoriteMetaIds(rows: ShortcutRow[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    if (row.itemKind === "meta-template" && row.favorite && row.itemId.trim()) {
      ids.add(row.itemId);
    }
  }
  return ids;
}

interface PriorSend {
  sentAt: string;
  author: string;
  repliedAt?: string;
}

function usePriorSend(conversationId: string | null, templateName: string): PriorSend | null {
  const { data } = useMessages(conversationId);
  return useMemo(() => {
    const msgs = data?.messages ?? [];
    const outMatch = [...msgs]
      .reverse()
      .find(
        (m: InboxMessageDto) =>
          m.direction === "out" &&
          m.messageType === "template" &&
          !!(m.content ?? "").match(
            new RegExp(`\\*${templateName}\\*|📋 \\*${templateName}\\*`, "i"),
          ),
      );
    if (!outMatch) return null;

    const sentAt = outMatch.createdAt;
    const author =
      outMatch.senderName === "Automação" || !outMatch.senderName
        ? "Automação"
        : outMatch.senderName;
    const repliedMsg = msgs.find(
      (m: InboxMessageDto) =>
        m.direction === "in" &&
        (m.messageType === "interactive" ||
          (m.content ?? "").includes("Resposta do formulário")) &&
        m.createdAt > sentAt,
    );
    return { sentAt, author, repliedAt: repliedMsg?.createdAt };
  }, [data?.messages, templateName]);
}

function categoryMeta(category?: string | null): { id: "UTILITY" | "MARKETING" | "AUTHENTICATION"; label: string; color: string } | null {
  const c = (category ?? "").toUpperCase();
  if (c === "MARKETING") return { id: "MARKETING", label: "Marketing", color: "#a855f7" };
  if (c === "UTILITY") return { id: "UTILITY", label: "Utilidade", color: "#0ea5e9" };
  if (c === "AUTHENTICATION") return { id: "AUTHENTICATION", label: "Autenticação", color: "#f59e0b" };
  return null;
}

function CategoryChip({ category }: { category?: string | null }) {
  const meta = categoryMeta(category);
  if (!meta) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide"
      style={{
        background: `color-mix(in srgb, ${meta.color} 14%, white)`,
        color: `color-mix(in srgb, ${meta.color} 78%, black)`,
        borderColor: `color-mix(in srgb, ${meta.color} 38%, transparent)`,
      }}
      title={`Categoria WhatsApp: ${meta.label}`}
    >
      {meta.id === "UTILITY" ? "UTILITY" : meta.id}
    </span>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function matchesQuery(tpl: WhatsappTemplate, q: string) {
  if (!q) return true;
  const hay = `${tpl.name} ${tpl.metaTemplateName ?? ""} ${tpl.body ?? ""}`.toLowerCase();
  return hay.includes(q);
}

function TemplateCard({
  tpl,
  conversationId,
  selected,
  favorite,
  onToggleFavorite,
  onSelect,
}: {
  tpl: WhatsappTemplate;
  conversationId: string;
  selected: boolean;
  favorite: boolean;
  onToggleFavorite?: () => void;
  onSelect: () => void;
}) {
  const prior = usePriorSend(conversationId, tpl.metaTemplateName ?? tpl.name);
  const metaId = tpl.metaTemplateId?.trim() ?? "";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[var(--radius-lg)] border px-3.5 py-3 text-left transition-colors",
        selected
          ? "border-[var(--brand-primary)]/45 bg-[var(--brand-primary)]/[0.06]"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-modal)] hover:border-[var(--brand-primary)]/30",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
              {tpl.name}
            </span>
            <CategoryChip category={tpl.category} />
            {tpl.language ? (
              <span className="shrink-0 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {tpl.language}
              </span>
            ) : null}
            {prior ? (
              <TooltipGlass
                label={`Enviado por ${prior.author} em ${fmtDate(prior.sentAt)}${prior.repliedAt ? " · Respondido" : ""}`}
                side="top"
              >
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] px-1.5 py-px text-[9.5px] font-semibold text-[var(--color-warning)]">
                  <IconAlertTriangle size={10} />
                  {prior.repliedAt ? "respondido" : "enviado"}
                </span>
              </TooltipGlass>
            ) : null}
          </div>
          {tpl.body ? (
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              {tpl.body}
            </p>
          ) : null}
        </div>
        {metaId && onToggleFavorite ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            aria-pressed={favorite}
            title={favorite ? "Remover dos favoritos" : "Favoritar"}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              "mt-0.5 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors",
              favorite
                ? "text-[var(--color-warn,#f59e0b)]"
                : "text-[var(--text-muted)] hover:text-[var(--color-warn,#f59e0b)]",
            )}
          >
            {favorite ? (
              <IconStarFilled className="size-3.5" />
            ) : (
              <IconStar className="size-3.5" strokeWidth={2.2} />
            )}
          </span>
        ) : null}
        <span
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2",
            selected ? "border-[var(--brand-primary)]" : "border-[var(--text-muted)]/35",
          )}
          aria-hidden
        >
          {selected ? <span className="size-2 rounded-full bg-[var(--brand-primary)]" /> : null}
        </span>
      </div>
    </button>
  );
}

/**
 * Lista pesquisável de templates WhatsApp (corpo do modal).
 */
export function TemplatePickerList({
  conversationId,
  channelId,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  category,
  onCategoryChange,
}: {
  conversationId: string;
  channelId?: string | null;
  selectedId: string | null;
  onSelect: (tpl: WhatsappTemplate) => void;
  query: string;
  onQueryChange: (q: string) => void;
  category: CategoryFilter;
  onCategoryChange: (c: CategoryFilter) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error, isError } = useQuery<WhatsappTemplate[]>({
    queryKey: ["whatsapp-templates", "agent-enabled", channelId ?? "default"],
    queryFn: () => listAgentEnabledTemplates(channelId),
    staleTime: 5 * 60_000,
    retry: 1,
    enabled: !!conversationId,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const shortcutsQ = useQuery({
    queryKey: ["slash-shortcuts"],
    queryFn: fetchAgentShortcuts,
    enabled: !!conversationId,
    staleTime: 30_000,
  });
  const favorites = useMemo(() => favoriteMetaIds(shortcutsQ.data), [shortcutsQ.data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((tpl) => {
      if (category === "FAVORITES") {
        const metaId = tpl.metaTemplateId?.trim() ?? "";
        if (!metaId || !favorites.has(metaId)) return false;
      } else if (category !== "all" && (tpl.category ?? "").toUpperCase() !== category) {
        return false;
      }
      return matchesQuery(tpl, q);
    });
  }, [data, query, category, favorites]);

  function toggleFavorite(tpl: WhatsappTemplate) {
    const metaId = tpl.metaTemplateId?.trim() ?? "";
    if (!metaId) return;
    const nextFav = !favorites.has(metaId);
    qc.setQueryData<ShortcutRow[]>(["slash-shortcuts"], (old) => {
      const list = Array.isArray(old) ? [...old] : [];
      const idx = list.findIndex((s) => s.itemKind === "meta-template" && s.itemId === metaId);
      if (idx >= 0) list[idx] = { ...list[idx], favorite: nextFav };
      else list.push({ itemKind: "meta-template", itemId: metaId, favorite: nextFav, useCount: 0 });
      return list;
    });
    void fetch(apiUrl("/api/slash-shortcuts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "favorite",
        itemKind: "meta-template",
        itemId: metaId,
        favorite: nextFav,
      }),
    })
      .catch(() => undefined)
      .finally(() => {
        void qc.invalidateQueries({ queryKey: ["slash-shortcuts"] });
      });
  }

  const chips: { id: CategoryFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "UTILITY", label: "Utilidade" },
    { id: "MARKETING", label: "Marketing" },
    { id: "FAVORITES", label: "Favoritos" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <InputGlass
        withSearch
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar por nome ou conteúdo..."
      />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const on = category === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onCategoryChange(chip.id)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                on
                  ? "bg-[var(--brand-primary)] text-white"
                  : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-[var(--text-muted)]">Carregando…</p>
        ) : isError ? (
          <div className="py-6 text-center text-xs text-[var(--color-danger)]">
            Falha ao carregar templates
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {(error as Error)?.message ?? "Tente novamente."}
            </p>
          </div>
        ) : !data?.length ? (
          <p className="py-6 text-center text-xs text-[var(--text-muted)]">
            Nenhum template habilitado para este agente.
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]/70">
              Habilite em Configurações &gt; Templates do WhatsApp.
            </span>
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-muted)]">
            {category === "FAVORITES" && !query.trim()
              ? "Nenhum template favorito."
              : "Nenhum modelo nesta busca."}
          </p>
        ) : (
          visible.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              conversationId={conversationId}
              selected={selectedId === tpl.id}
              favorite={favorites.has(tpl.metaTemplateId?.trim() ?? "")}
              onToggleFavorite={() => toggleFavorite(tpl)}
              onSelect={() => onSelect(tpl)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Modal do picker de templates WhatsApp — busca, filtro de categoria,
 * seleção e rodapé Copiar / Usar template.
 */
export function WhatsappTemplatePickerModal({
  open,
  onClose,
  conversationId,
  channelId,
  contactName,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  channelId?: string | null;
  contactName?: string | null;
  onPick?: (tpl: WhatsappTemplate) => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selected, setSelected] = useState<WhatsappTemplate | null>(null);

  const { data } = useQuery<WhatsappTemplate[]>({
    queryKey: ["whatsapp-templates", "agent-enabled", channelId ?? "default"],
    queryFn: () => listAgentEnabledTemplates(channelId),
    staleTime: 5 * 60_000,
    enabled: open && !!conversationId,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (open) return;
    setQuery("");
    setCategory("all");
    setSelected(null);
  }, [open]);

  const sendMutation = useMutation({
    mutationFn: (tpl: WhatsappTemplate) =>
      sendTemplate(conversationId as string, {
        templateName: tpl.metaTemplateName ?? tpl.name,
        bodyPreview: tpl.body,
        languageCode: tpl.language ?? "pt_BR",
        templateGraphId: tpl.metaTemplateId ?? null,
      }),
    onSuccess: (res, tpl) => {
      toast.success("Template enviado");
      if (conversationId) {
        qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
        if (res.reopenedConversationId) {
          qc.invalidateQueries({ queryKey: messagesKey(res.reopenedConversationId) });
          emitConversationReopened(res.reopenedConversationId);
          void refreshInboxLists(qc);
          qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
        } else {
          applyOutboundPreviewToInboxCaches(qc, conversationId, {
            content: tpl.body,
            messageType: "template",
          });
        }
      }
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || "Falha ao enviar template"),
  });

  const count = data?.length ?? 0;
  const countLabel =
    count === 1 ? "1 modelo aprovado" : `${count} modelos aprovados`;
  const who = contactName?.trim();
  const description = who ? `${countLabel} · enviar para ${who}` : countLabel;

  function useSelected() {
    if (!selected) return;
    if (onPick) {
      onPick(selected);
      onClose();
      return;
    }
    sendMutation.mutate(selected);
  }

  async function copySelected() {
    const text = selected?.body?.trim();
    if (!text) {
      toast.error("Este modelo não tem texto para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto do template copiado");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <FormDialog
      open={open && !!conversationId}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      size="lg"
      busy={sendMutation.isPending}
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,#25d366_18%,white)] text-[#128c4a]">
            <IconFileText size={16} stroke={2} />
          </span>
          Templates do WhatsApp
        </span>
      }
      description={description}
      bodyClassName="flex min-h-[min(52vh,420px)] flex-col gap-0 space-y-0 overflow-hidden px-6 py-4"
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <ButtonGlass
              type="button"
              variant="glass"
              disabled={!selected?.body || sendMutation.isPending}
              onClick={() => void copySelected()}
            >
              <IconCopy size={15} />
              Copiar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              disabled={!selected || sendMutation.isPending}
              onClick={useSelected}
            >
              <IconSend size={15} />
              {sendMutation.isPending ? "Enviando…" : "Usar template"}
            </ButtonGlass>
          </div>
          <p className="text-center text-[11px] text-[var(--text-muted)]">
            A variável {"{{1}}"} é preenchida com o nome do contato
          </p>
        </div>
      }
    >
      {open && conversationId ? (
        <TemplatePickerList
          conversationId={conversationId}
          channelId={channelId}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          query={query}
          onQueryChange={setQuery}
          category={category}
          onCategoryChange={setCategory}
        />
      ) : null}
    </FormDialog>
  );
}
