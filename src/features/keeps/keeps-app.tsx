"use client";

import { useMemo, useRef, useState } from "react";
import { LayoutGrid, Lightbulb, List, Menu, SlidersHorizontal, Upload } from "lucide-react";

import { EmptyState } from "@/components/crm/empty-state";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { AppLoading } from "@/components/crm/app-loading";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { KeepBoard } from "./keep-board";
import { useKeepMutations, useKeepNotes } from "./hooks";
import { noteMatchesQuery } from "./helpers";
import { KeepsSidebar, type KeepsView } from "./keeps-sidebar";
import { isChecklistDoc } from "./keep-checklist";
import { NoteCard } from "./note-card";
import { NoteComposer } from "./note-composer";
import { NoteDetailDialog } from "./note-detail-dialog";
import { useKeepOrg } from "./org-store";
import { KEEP_COLOR_LABEL, KEEP_NOTE_COLORS } from "./palette";
import { EMPTY_KEEP_DOC, type KeepLayout, type KeepNote, type KeepNoteColor } from "./types";

type ExtraFilters = {
  colors: KeepNoteColor[];
  hasAttachment: boolean;
  checklist: boolean;
};

const EMPTY_FILTERS: ExtraFilters = { colors: [], hasAttachment: false, checklist: false };

function contextualTitle(view: KeepsView, labelName: string | undefined): string {
  if (view.labelId && labelName) return `Notas com a etiqueta ${labelName}`;
  if (view.folder === "archive") return "Arquivadas";
  if (view.folder === "trash") return "Lixeira — itens expiram em 7 dias";
  return "Notas";
}

export function KeepsApp() {
  const [view, setView] = useState<KeepsView>({ folder: "notes", labelId: null });
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState<KeepLayout>("grid");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ExtraFilters>(EMPTY_FILTERS);
  const [mobileNav, setMobileNav] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const org = useKeepOrg();
  const { confirm, dialog } = useConfirm();

  const notesQuery = useKeepNotes("notes", "");
  const archiveQuery = useKeepNotes("archive", "");
  const trashQuery = useKeepNotes("trash", "");
  const mut = useKeepMutations(view.folder, "");

  const notes = notesQuery.data?.items ?? [];
  const archived = archiveQuery.data?.items ?? [];
  const trashed = trashQuery.data?.items ?? [];
  const labeledPool = [...notes, ...archived];
  const labelCounts = org.labelCounts(labeledPool.map((n) => n.id));

  const source = view.folder === "archive" ? archived : view.folder === "trash" ? trashed : notes;
  const sourceLoading =
    view.folder === "archive"
      ? archiveQuery.isLoading
      : view.folder === "trash"
        ? trashQuery.isLoading
        : notesQuery.isLoading;

  const filtered = useMemo(() => {
    return source.filter((note) => {
      if (view.labelId && !org.labelIdsOf(note.id).includes(view.labelId)) return false;
      if (!noteMatchesQuery(note, q, org.labelsOf(note.id))) return false;
      if (filters.colors.length > 0 && !filters.colors.includes(org.colorOf(note.id))) return false;
      if (filters.hasAttachment && note.attachments.length === 0) return false;
      if (filters.checklist && !isChecklistDoc(note.content)) return false;
      return true;
    });
  }, [source, view.labelId, q, filters, org]);

  const pinned = useMemo(() => filtered.filter((n) => n.pinned), [filtered]);
  const rest = useMemo(() => filtered.filter((n) => !n.pinned), [filtered]);
  const allKnown = useMemo(() => [...notes, ...archived, ...trashed], [notes, archived, trashed]);
  const activeNote = allKnown.find((n) => n.id === activeId) ?? null;
  const activeLabel = org.labels.find((l) => l.id === view.labelId);
  const extraFilterCount =
    filters.colors.length + Number(filters.hasAttachment) + Number(filters.checklist);
  const totalCount = notes.length + archived.length;

  function openImport() {
    importRef.current?.click();
  }

  function renderNote(note: KeepNote) {
    const folder = view.folder;
    return (
      <NoteCard
        note={note}
        color={org.colorOf(note.id)}
        labels={org.labelsOf(note.id)}
        allLabels={org.labels}
        layout={layout}
        onOpen={() => setActiveId(note.id)}
        onPin={folder === "notes" ? () => mut.patch.mutate({ id: note.id, patch: { pinned: !note.pinned } }) : undefined}
        onArchive={
          folder === "trash"
            ? undefined
            : () => mut.patch.mutate({ id: note.id, patch: { archived: !note.archived } })
        }
        onRestore={
          folder === "trash"
            ? () => mut.patch.mutate({ id: note.id, patch: { trashed: false } })
            : undefined
        }
        onTrash={() => {
          if (folder === "trash") {
            void confirm({
              title: "Excluir permanentemente?",
              description: "Essa ação não pode ser desfeita.",
              confirmLabel: "Excluir",
              destructive: true,
              action: () => mut.remove.mutateAsync({ id: note.id, forever: true }),
            });
            return;
          }
          mut.remove.mutate({ id: note.id });
        }}
        onColor={(color) => org.setNoteColor(note.id, color)}
        onToggleLabel={(id) => org.toggleNoteLabel(note.id, id)}
        onCreateLabel={(name) => org.createLabel(name).id}
      />
    );
  }

  const sidebar = (
    <KeepsSidebar
      view={view}
      onViewChange={(next) => {
        setView(next);
        setMobileNav(false);
      }}
      labels={org.labels}
      labelCounts={labelCounts}
      notesCount={notes.length}
      archiveCount={archived.length}
      trashCount={trashed.length}
      onCreateLabel={(name) => org.createLabel(name).id}
      onRenameLabel={org.renameLabel}
      onDeleteLabel={org.deleteLabel}
    />
  );

  return (
    <div className="v2-screen v2-screen-fill grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-hidden bg-background">
      <NavRailSpacer />
      <div className="flex min-h-0 min-w-0">
        <div className="hidden md:block">{sidebar}</div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <input
            ref={importRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              mut.importZip.mutate(file, {
                onSuccess: (r) => toast.success(`${r.imported} notas importadas`),
                onError: (err) => toast.error(err instanceof Error ? err.message : "Falha na importação"),
              });
            }}
          />
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary md:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu className="size-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Lightbulb className="size-4" />
              </span>
              <h1 className="font-display text-[15px] font-bold leading-none tracking-tight text-foreground">
                Keeps
              </h1>
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-primary">
                {totalCount}
              </span>
            </div>
            <div className="mx-auto hidden min-w-0 max-w-xl flex-1 md:block">
              <SearchFilterBar
                value={q}
                onChange={setQ}
                placeholder="Pesquisar notas..."
                filterOpen={filterOpen}
                activeCount={extraFilterCount}
                onFilterClick={() => setFilterOpen((v) => !v)}
                className="w-full"
              >
                {filterOpen ? <KeepsFilterPanel filters={filters} onChange={setFilters} /> : null}
              </SearchFilterBar>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <div className="flex h-8 items-center rounded-full border border-border bg-card p-0.5">
                <button
                  type="button"
                  aria-label="Grade"
                  onClick={() => setLayout("grid")}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-full",
                    layout === "grid"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Lista"
                  onClick={() => setLayout("list")}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-full",
                    layout === "list"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <List className="size-3.5" />
                </button>
              </div>
              <PageActionsMenu
                tooltip="Mais"
                items={[
                  {
                    icon: <Upload size={14} />,
                    label: "Importar do Google Keep",
                    onClick: openImport,
                  },
                ]}
              />
            </div>
          </header>
          <div className="border-b border-border px-3 py-1.5 md:hidden">
            <SearchFilterBar
              value={q}
              onChange={setQ}
              placeholder="Pesquisar notas..."
              filterOpen={filterOpen}
              activeCount={extraFilterCount}
              onFilterClick={() => setFilterOpen((v) => !v)}
              className="w-full"
            >
              {filterOpen ? <KeepsFilterPanel filters={filters} onChange={setFilters} /> : null}
            </SearchFilterBar>
          </div>

          <div data-page-scroll="" className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
            {view.folder === "notes" ? (
              <NoteComposer
                labels={org.labels}
                pending={mut.create.isPending}
                onCreateLabel={(name) => org.createLabel(name).id}
                onImportZip={openImport}
                onCreate={async ({ title, content, file, color, labelIds, pinned, archived }) => {
                  try {
                    const created = await mut.create.mutateAsync({
                      title,
                      content: content ?? EMPTY_KEEP_DOC,
                    });
                    org.setNoteColor(created.note.id, color);
                    org.setNoteLabels(
                      created.note.id,
                      view.labelId ? [...new Set([...labelIds, view.labelId])] : labelIds,
                    );
                    if (file) await mut.attach.mutateAsync({ noteId: created.note.id, file });
                    if (pinned) await mut.patch.mutateAsync({ id: created.note.id, patch: { pinned: true } });
                    if (archived) await mut.patch.mutateAsync({ id: created.note.id, patch: { archived: true } });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Não foi possível salvar a nota.");
                    throw err;
                  }
                }}
              />
            ) : null}

            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {contextualTitle(view, activeLabel?.name)}
            </p>

            {sourceLoading ? (
              <AppLoading variant="inline" className="min-h-0 flex-1" />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Lightbulb className="size-6" />}
                title={
                  q || extraFilterCount || view.labelId
                    ? "Nenhuma nota encontrada"
                    : view.folder === "trash"
                      ? "Lixeira vazia"
                      : view.folder === "archive"
                        ? "Nada no arquivo"
                        : "Nenhuma nota ainda"
                }
                description={
                  q || extraFilterCount || view.labelId
                    ? "Tente outro termo ou limpe os filtros."
                    : "Crie uma nota ou importe o ZIP do Google Keep."
                }
              />
            ) : (
              <KeepBoard pinned={pinned} rest={rest} layout={layout} renderNote={renderNote} />
            )}
          </div>
        </div>
      </div>

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        {mobileNav ? (
          <SheetContent side="left" className="w-52 max-w-[80vw] border-0 bg-sidebar p-0">
            {sidebar}
          </SheetContent>
        ) : null}
      </Sheet>

      <NoteDetailDialog
        note={activeNote}
        open={!!activeNote}
        color={activeNote ? org.colorOf(activeNote.id) : "default"}
        labels={activeNote ? org.labelsOf(activeNote.id) : []}
        allLabels={org.labels}
        onOpenChange={(next) => {
          if (!next) setActiveId(null);
        }}
        onSave={async (patch) => {
          if (!activeNote) return;
          await mut.patch.mutateAsync({ id: activeNote.id, patch });
        }}
        onAttach={async (file) => {
          if (!activeNote) return;
          await mut.attach.mutateAsync({ noteId: activeNote.id, file });
        }}
        onPin={
          activeNote && !activeNote.trashed
            ? () => mut.patch.mutate({ id: activeNote.id, patch: { pinned: !activeNote.pinned } })
            : undefined
        }
        onArchive={
          activeNote && !activeNote.trashed
            ? () => mut.patch.mutate({ id: activeNote.id, patch: { archived: !activeNote.archived } })
            : undefined
        }
        onRestore={
          activeNote?.trashed
            ? () => mut.patch.mutate({ id: activeNote.id, patch: { trashed: false } })
            : undefined
        }
        onTrash={
          activeNote
            ? () => {
                if (activeNote.trashed) {
                  void confirm({
                    title: "Excluir permanentemente?",
                    description: "Essa ação não pode ser desfeita.",
                    confirmLabel: "Excluir",
                    destructive: true,
                    action: async () => {
                      await mut.remove.mutateAsync({ id: activeNote.id, forever: true });
                      setActiveId(null);
                    },
                  });
                  return;
                }
                mut.remove.mutate({ id: activeNote.id });
                setActiveId(null);
              }
            : undefined
        }
        onColor={(color) => {
          if (activeNote) org.setNoteColor(activeNote.id, color);
        }}
        onToggleLabel={(id) => {
          if (activeNote) org.toggleNoteLabel(activeNote.id, id);
        }}
        onCreateLabel={(name) => org.createLabel(name).id}
      />
      {dialog}
    </div>
  );
}

function KeepsFilterPanel({
  filters,
  onChange,
}: {
  filters: ExtraFilters;
  onChange: (next: ExtraFilters) => void;
}) {
  return (
    <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 rounded-2xl border border-border bg-card p-3 shadow-lg">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <SlidersHorizontal className="size-3" />
        Filtros
      </p>
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Cor</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {KEEP_NOTE_COLORS.map((color) => {
          const on = filters.colors.includes(color);
          return (
            <button
              key={color}
              type="button"
              title={KEEP_COLOR_LABEL[color]}
              aria-pressed={on}
              onClick={() =>
                onChange({
                  ...filters,
                  colors: on ? filters.colors.filter((c) => c !== color) : [...filters.colors, color],
                })
              }
              className={cn(
                "size-6 rounded-full border border-border",
                on && "ring-2 ring-primary ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: `var(--keep-swatch-${color})` }}
            />
          );
        })}
      </div>
      <label className="flex h-8 items-center gap-2 text-[13px] text-foreground">
        <input
          type="checkbox"
          checked={filters.hasAttachment}
          onChange={(e) => onChange({ ...filters, hasAttachment: e.target.checked })}
          className="size-3.5 accent-primary"
        />
        Com anexo
      </label>
      <label className="flex h-8 items-center gap-2 text-[13px] text-foreground">
        <input
          type="checkbox"
          checked={filters.checklist}
          onChange={(e) => onChange({ ...filters, checklist: e.target.checked })}
          className="size-3.5 accent-primary"
        />
        Checklist
      </label>
      {filters.colors.length || filters.hasAttachment || filters.checklist ? (
        <button
          type="button"
          className="mt-2 text-[12px] font-semibold text-primary"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}
