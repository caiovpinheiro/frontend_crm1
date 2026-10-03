"use client";

/*
 * TagsPopover (Inbox v2) — versão portal.
 *
 * Histórico: a versão anterior usava `position: absolute` no popover,
 * que ficava cortado quando o trigger estava dentro de containers
 * com `overflow: hidden/auto` — caso dos cards na lista de conversas.
 * Agora usa createPortal + posição calculada a partir do rect do
 * trigger (mesma estratégia dos popovers do pipeline-v2).
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshInboxLists } from "@/features/inbox-v2/hooks/inbox-list-refresh";
import { toast } from "sonner";

import { Chip } from "@/components/crm/chip";
import { TagChipOptionsList } from "@/components/crm/tag-chip-options-list";
import {
  addConversationTag,
  createTag,
  listTags,
  removeConversationTag,
  type Tag,
} from "@/features/inbox-v2/api";

import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";

interface TagsPopoverProps {
  conversationId: string | null;
  currentTags: Tag[];
  disabled?: boolean;
  /** Aparência do trigger. `chip` = "+Tag" ghost. `icon` = botão "+" minimalista. */
  triggerVariant?: "chip" | "icon";
}

export function TagsPopover({
  conversationId,
  currentTags,
  disabled,
  triggerVariant = "chip",
}: TagsPopoverProps) {
  const qc = useQueryClient();
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const [filter, setFilter] = useState("");

  const tagsQuery = useQuery<Tag[]>({
    queryKey: ["inbox-v2-tags"],
    queryFn: listTags,
    enabled: open,
    staleTime: 60_000,
  });

  const selectedIds = useMemo(
    () => new Set(currentTags.map((t) => t.id)),
    [currentTags],
  );

  // Invalida tanto o inbox quanto o Kanban/pipeline: como o backend
  // replica a tag no deal OPEN do contato, a mudança precisa refletir
  // nas duas telas imediatamente.
  function invalidateAfterTagChange() {
    void refreshInboxLists(qc);
    qc.invalidateQueries({ queryKey: ["contact-detail"] });
    // Pipeline v2 — match por prefixo: board é
    // ["pipeline-board", pipelineId, status] e o detalhe é
    // ["deal-detail-v2", dealId]. Ambos refletem a tag replicada no deal.
    qc.invalidateQueries({ queryKey: ["pipeline-board"] });
    qc.invalidateQueries({ queryKey: ["deal-detail-v2"] });
    qc.invalidateQueries({ queryKey: ["deal-tags-v2"] });
  }

  const setTagsMutation = useMutation<
    unknown,
    Error,
    { conversationId: string; tagId: string; action: "add" | "remove" }
  >({
    mutationFn: (vars) =>
      vars.action === "add"
        ? addConversationTag(vars.conversationId, vars.tagId)
        : removeConversationTag(vars.conversationId, vars.tagId),
    onSuccess: invalidateAfterTagChange,
    onError: (err) => toast.error(err.message || "Falha ao salvar tag"),
  });

  const createTagMutation = useMutation<Tag, Error, string>({
    mutationFn: (name) => createTag({ name }),
    onSuccess: (newTag) => {
      qc.setQueryData<Tag[]>(["inbox-v2-tags"], (old) =>
        old ? [...old, newTag] : [newTag],
      );
      // Tag recém-criada já entra aplicada na conversa (add).
      if (conversationId) {
        setTagsMutation.mutate({
          conversationId,
          tagId: newTag.id,
          action: "add",
        });
      }
      setFilter("");
    },
    onError: (err) => toast.error(err.message || "Falha ao criar tag"),
  });

  function toggleTag(tagId: string) {
    if (!conversationId) return;
    const action = selectedIds.has(tagId) ? "remove" : "add";
    setTagsMutation.mutate({ conversationId, tagId, action });
  }

  const allTags = tagsQuery.data ?? [];
  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const canCreate =
    filter.trim().length > 0 &&
    !allTags.some(
      (t) => t.name.trim().toLowerCase() === filter.trim().toLowerCase(),
    );

  const pos = computePopoverPosition(rect, 280, 256);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || !conversationId}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {triggerVariant === "icon" ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] text-[12px] font-bold leading-none text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)]">
            +
          </span>
        ) : (
          <Chip variant="ghost">+Tag</Chip>
        )}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="listbox"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: 256,
                isolation: "isolate",
              }}
              className="z-(--z-popover) rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-2 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
            >
              <input
                autoFocus
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar ou criar…"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    close();
                    return;
                  }
                  if (
                    e.key === "Enter" &&
                    canCreate &&
                    !createTagMutation.isPending
                  ) {
                    e.preventDefault();
                    createTagMutation.mutate(filter.trim());
                  }
                }}
                className="mb-1.5 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]/40"
              />
              <TagChipOptionsList
                tags={filtered}
                selectedIds={selectedIds}
                onToggle={toggleTag}
                disabled={setTagsMutation.isPending}
                isLoading={tagsQuery.isLoading}
                createLabel={
                  canCreate ? `Criar “${filter.trim()}”` : null
                }
                onCreate={() => createTagMutation.mutate(filter.trim())}
                createDisabled={createTagMutation.isPending}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
