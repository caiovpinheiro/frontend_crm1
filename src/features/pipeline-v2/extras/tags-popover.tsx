"use client";

/*
 * Popover de Tags do Deal — renderizado via createPortal em
 * document.body para escapar dos stacking contexts do Draggable.
 *
 * Fluxo rascunho → Salvar: ao abrir, copia `currentTags` para
 * seleção local; cliques nas chips só alteram o rascunho (UI).
 * Mutations de add/remove disparam apenas no botão Salvar.
 * Criar tag nova ainda persiste na hora e já marca selected.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { TagChip } from "@/components/crm/tag-chip";
import { TagChipOptionsList } from "@/components/crm/tag-chip-options-list";
import {
  useAddDealTag,
  useDealTags,
  useRemoveDealTag,
} from "@/features/pipeline-v2/hooks";
import type { StatusFilter } from "@/features/pipeline-v2/api";
import { cn } from "@/lib/utils";

import { computePopoverPosition, usePortalPopover } from "./use-portal-popover";

/**
 * Trigger compacto do TagsPopover nos DealCards (kanban / Flow).
 * Sempre `+` (canto direito da linha de tags); tooltip muda se já há tags.
 */
export function DealCardTagsTrigger({ hasTags }: { hasTags: boolean }) {
  return (
    <TooltipGlass
      label={hasTags ? "Gerenciar tags" : "Adicionar tag"}
      side="top"
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center",
          "rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)]",
          "font-display text-[12px] font-bold leading-none text-[var(--text-muted)]",
          "transition-colors hover:border-[var(--brand-primary)]/40 hover:text-[var(--brand-primary)]",
        )}
      >
        +
      </span>
    </TooltipGlass>
  );
}

interface TagsPopoverProps {
  dealId: string | null;
  currentTags: { id: string; name: string; color?: string | null }[];
  pipelineId: string | null;
  statusFilter?: StatusFilter;
  disabled?: boolean;
  trigger: ReactNode;
}

function idsFromTags(tags: { id: string }[]): Set<string> {
  return new Set(tags.map((t) => t.id));
}

export function TagsPopover({
  dealId,
  currentTags,
  pipelineId,
  statusFilter = "OPEN",
  disabled,
  trigger,
}: TagsPopoverProps) {
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const [filter, setFilter] = useState("");
  /** Seleção espelhada ao abrir; toggles atualizam só este Set. */
  const [localSelected, setLocalSelected] = useState<Set<string>>(() =>
    idsFromTags(currentTags),
  );
  const [isSaving, setIsSaving] = useState(false);
  const wasOpenRef = useRef(false);
  const syncedDealIdRef = useRef<string | null>(null);
  /** Snapshot dos ids do deal no momento da abertura (base do diff). */
  const baselineIdsRef = useRef<Set<string>>(idsFromTags(currentTags));

  const tagsQuery = useDealTags(open);
  const addMutation = useAddDealTag(pipelineId, statusFilter);
  const removeMutation = useRemoveDealTag(pipelineId, statusFilter);

  // Sincroniza com o board só ao abrir (ou ao trocar de deal).
  // NÃO re-sincroniza quando `currentTags` muda por update otimista.
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      syncedDealIdRef.current = null;
      return;
    }
    const justOpened = !wasOpenRef.current;
    const dealChanged = dealId !== syncedDealIdRef.current;
    wasOpenRef.current = true;
    if (justOpened || dealChanged) {
      syncedDealIdRef.current = dealId;
      const baseline = idsFromTags(currentTags);
      baselineIdsRef.current = baseline;
      setLocalSelected(baseline);
      setIsSaving(false);
      setFilter("");
    }
  }, [open, dealId, currentTags]);

  const filtered = (tagsQuery.data ?? []).filter((t) =>
    t.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const canCreate =
    filter.trim().length > 0 &&
    !(tagsQuery.data ?? []).some(
      (t) => t.name.toLowerCase() === filter.trim().toLowerCase(),
    );

  const hasChanges = useMemo(() => {
    const baseline = baselineIdsRef.current;
    if (localSelected.size !== baseline.size) return true;
    for (const id of localSelected) {
      if (!baseline.has(id)) return true;
    }
    return false;
  }, [localSelected]);

  function handleToggle(tagId: string) {
    if (!dealId || isSaving) return;
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function handleSave() {
    if (!dealId || isSaving || !hasChanges) return;

    const baseline = baselineIdsRef.current;
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const id of localSelected) {
      if (!baseline.has(id)) toAdd.push(id);
    }
    for (const id of baseline) {
      if (!localSelected.has(id)) toRemove.push(id);
    }
    if (toAdd.length === 0 && toRemove.length === 0) return;

    setIsSaving(true);
    try {
      // Sequencial: evita corrida de onMutate/onSettled no mesmo
      // useMutation ao disparar vários mutateAsync em paralelo.
      for (const tagId of toRemove) {
        await removeMutation.mutateAsync({ dealId, tagId });
      }
      for (const tagId of toAdd) {
        await addMutation.mutateAsync({ dealId, tagId });
      }
      baselineIdsRef.current = new Set(localSelected);
      close();
    } catch {
      // Mantém popover aberto com o rascunho para o usuário tentar de novo.
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (isSaving) return;
    setLocalSelected(new Set(baselineIdsRef.current));
    setFilter("");
    close();
  }

  async function handleCreate() {
    if (!dealId || isSaving) return;
    const name = filter.trim();
    if (!name) return;
    try {
      await addMutation.mutateAsync({ dealId, tagName: name });
      setFilter("");
      const refreshed = await tagsQuery.refetch();
      const created = (refreshed.data ?? []).find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );
      if (created) {
        setLocalSelected((prev) => new Set(prev).add(created.id));
        // Já persistido no servidor — entra na baseline também.
        baselineIdsRef.current = new Set(baselineIdsRef.current).add(created.id);
      }
    } catch {
      // toast já vem do hook
    }
  }

  /**
   * Tags do rascunho, no topo do popover. Substitui o antigo chip "+N" do
   * card: a lista completa (inclusive as que não cabem no card) fica aqui,
   * onde também dá para removê-las com um clique.
   */
  const selectedTags = useMemo(() => {
    const known = tagsQuery.data ?? [];
    return Array.from(localSelected).map((id) => {
      const hit = known.find((t) => t.id === id) ?? currentTags.find((t) => t.id === id);
      return { id, name: hit?.name ?? "Tag", color: hit?.color ?? null };
    });
  }, [localSelected, tagsQuery.data, currentTags]);

  // Altura estimada só alimenta o auto-flip; a seção "Selecionadas" cresce
  // até ~100px e sem isso o popover abriria para baixo e vazaria a viewport.
  const position = computePopoverPosition(
    rect,
    selectedTags.length > 0 ? 420 : 320,
    328,
  );
  const saveDisabled = !hasChanges || isSaving || !dealId;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || !dealId}
        onClick={toggle}
        className="inline-flex shrink-0"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {trigger}
      </button>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-2 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: 288,
              zIndex: "var(--z-popover)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {selectedTags.length > 0 && (
              <div className="mb-1.5 border-b border-[var(--glass-border-subtle)] pb-1.5">
                <p className="mb-1 px-0.5 font-display text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Selecionadas ({selectedTags.length})
                </p>
                <div className="flex max-h-[74px] flex-wrap content-start gap-1.5 overflow-y-auto px-0.5">
                  {selectedTags.map((t) => (
                    <TagChip
                      key={t.id}
                      name={t.name}
                      color={t.color}
                      selected
                      title={`Remover ${t.name}`}
                      onClick={() => handleToggle(t.id)}
                      className={cn(
                        "max-w-[8.5rem] min-w-0",
                        isSaving && "pointer-events-none opacity-60",
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar ou criar tag…"
              disabled={isSaving}
              className="mb-1.5 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
            />
            <TagChipOptionsList
              tags={filtered}
              selectedIds={localSelected}
              onToggle={handleToggle}
              disabled={isSaving}
              isLoading={tagsQuery.isLoading}
              createLabel={canCreate ? `+ Criar “${filter.trim()}”` : null}
              onCreate={() => void handleCreate()}
              createDisabled={addMutation.isPending || isSaving}
            />
            <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-[var(--glass-border-subtle)] pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="rounded-[var(--radius-md)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saveDisabled}
                className="rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-2.5 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
