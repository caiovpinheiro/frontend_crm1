"use client";

import { useKeepCategories, useKeepMutations, useKeepNotes } from "@/features/keeps/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, CirclePlay, FolderPlus, Lightbulb, Palette, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/crm/empty-state";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { PageChrome } from "@/components/crm/page-header";
import { HeaderPillToggle, SectionHeader } from "@/components/crm/section-header";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { AppLoading } from "@/components/crm/app-loading";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { KeepCard } from "@/features/keeps/keep-card";
import { KeepBoard, type KeepBoardSection } from "@/features/keeps/keep-board";
import { KeepComposer } from "@/features/keeps/keep-composer";
import { KeepEditorDialog } from "@/features/keeps/keep-editor-dialog";
import { GOOGLE_KEEP_TUTORIAL_PLAYER } from "@/features/keeps/keep-import-tutorial";
import { KeepCategoryDialog } from "@/features/keeps/keep-category-dialog";
import { PageTourButton } from "@/features/product-tour";
import {
  registerKeepsFolderTourBridge,
  registerKeepsSceneTourBridge,
} from "@/features/product-tour/keeps-tour-bridge";
import { KeepsTourDemo, type KeepsTourScene } from "@/features/product-tour/keeps-tour-demo";
import { KeepColorSwatches } from "@/features/keeps/keep-color-swatches";
import {
  KEEP_CATEGORY_COLOR_LABELS,
  KEEP_CATEGORY_COLORS,
  KEEP_NOTE_COLORS,
  type KeepNoteColorId,
} from "@/features/keeps/colors";
import {
  EMPTY_KEEP_DOC,
  type KeepCategory,
  type KeepFolder,
  type KeepNote,
  type KeepViewMode,
} from "@/features/keeps/types";

function CategorySectionHeader({
  category,
  onRename,
  onDelete,
  onAddNote,
  onColor,
}: {
  category: KeepCategory;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddNote: () => void;
  onColor: (color: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex w-full min-w-0 items-center gap-2">
        <span
          data-keep-color={category.color}
          className="keep-color-dot size-3.5 shrink-0 rounded-full border border-border/60"
          aria-hidden
        />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const next = name.trim();
              setEditing(false);
              if (!next || next === category.name) {
                setName(category.name);
                return;
              }
              onRename(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(category.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground"
          />
        ) : (
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">{category.name}</p>
        )}
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Criar nota nesta categoria"
          onClick={onAddNote}
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Cor da categoria"
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen((v) => !v)}
        >
          <Palette className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Renomear categoria"
          onClick={() => {
            setName(category.name);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
          aria-label="Excluir categoria"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {paletteOpen ? (
        <KeepColorSwatches
          value={category.color}
          showDefault={false}
          colors={[...KEEP_CATEGORY_COLORS]}
          labels={{ ...KEEP_CATEGORY_COLOR_LABELS }}
          onChange={(next) => {
            if (!next) return;
            onColor(next);
            setPaletteOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export default function BwipoKeepsClientPage() {
  const isMobile = useIsMobile();
  const [folder, setFolder] = useState<KeepFolder>("notes");
  const [viewMode, setViewMode] = useState<KeepViewMode>("normal");
  const [q, setQ] = useState("");
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [active, setActive] = useState<KeepNote | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [tourScene, setTourScene] = useState<KeepsTourScene | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const notesQuery = useKeepNotes(folder, q, colorFilter);
  const categoriesQuery = useKeepCategories();
  const mut = useKeepMutations(folder, q, colorFilter);

  useEffect(() => {
    registerKeepsFolderTourBridge({
      setFolder,
      setViewMode,
    });
    registerKeepsSceneTourBridge(setTourScene);
    return () => {
      registerKeepsFolderTourBridge(null);
      registerKeepsSceneTourBridge(null);
    };
  }, []);

  const items = notesQuery.data?.items ?? [];
  const categories = categoriesQuery.data?.items ?? [];
  const usedColors = (notesQuery.data?.usedColors ?? []).filter((c): c is KeepNoteColorId =>
    KEEP_NOTE_COLORS.includes(c as KeepNoteColorId),
  );
  const hasUncolored = Boolean(notesQuery.data?.hasUncolored);
  const showColorFilter = usedColors.length > 0 || hasUncolored;
  const pinned = useMemo(() => items.filter((n) => n.pinned), [items]);
  const rest = useMemo(() => items.filter((n) => !n.pinned), [items]);

  const categoriesMode = folder === "notes" && viewMode === "categories";

  const normalSections = useMemo<KeepBoardSection[]>(
    () => [
      {
        key: "pinned",
        label: "Fixadas",
        notes: pinned,
        showLabel: pinned.length > 0,
      },
      {
        key: "others",
        label: "Outras",
        notes: rest,
        showLabel: pinned.length > 0,
      },
    ],
    [pinned, rest],
  );

  const categorySections = useMemo<KeepBoardSection[]>(() => {
    const byCat = new Map<string, KeepNote[]>();
    const uncategorized: KeepNote[] = [];
    for (const note of items) {
      if (note.categoryId) {
        const list = byCat.get(note.categoryId) ?? [];
        list.push(note);
        byCat.set(note.categoryId, list);
      } else {
        uncategorized.push(note);
      }
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    uncategorized.sort((a, b) => a.position - b.position);

    const sections: KeepBoardSection[] = categories.map((cat) => ({
      key: cat.id,
      label: cat.name,
      notes: byCat.get(cat.id) ?? [],
      alwaysShowLabel: true,
      header: (
        <CategorySectionHeader
          category={cat}
          onRename={(name) =>
            mut.patchCategory.mutate(
              { id: cat.id, patch: { name } },
              {
                onError: (err) =>
                  toast.error(err instanceof Error ? err.message : "Não foi possível renomear."),
              },
            )
          }
          onDelete={() => {
            if (!window.confirm(`Excluir a categoria "${cat.name}"? As notas vão para Sem categoria.`)) {
              return;
            }
            mut.removeCategory.mutate(cat.id, {
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Não foi possível excluir."),
            });
          }}
          onAddNote={() => {
            void (async () => {
              try {
                const created = await mut.create.mutateAsync({
                  content: EMPTY_KEEP_DOC,
                  categoryId: cat.id,
                });
                setActive(created.note);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Não foi possível criar a nota.");
              }
            })();
          }}
          onColor={(color) =>
            mut.patchCategory.mutate(
              { id: cat.id, patch: { color } },
              {
                onError: (err) =>
                  toast.error(err instanceof Error ? err.message : "Não foi possível alterar a cor."),
              },
            )
          }
        />
      ),
    }));

    sections.push({
      key: "none",
      label: "Sem categoria",
      notes: uncategorized,
      alwaysShowLabel: true,
      header: (
        <div className="flex w-full min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
            Sem categoria
          </p>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Criar nota sem categoria"
            onClick={() => {
              void (async () => {
                try {
                  const created = await mut.create.mutateAsync({
                    content: EMPTY_KEEP_DOC,
                    categoryId: null,
                  });
                  setActive(created.note);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Não foi possível criar a nota.");
                }
              })();
            }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      ),
    });

    return sections;
  }, [categories, items, mut]);

  function handleNormalReorder(secs: Array<{ key: string; notes: KeepNote[] }>) {
    const pinnedIds = secs.find((s) => s.key === "pinned")?.notes.map((n) => n.id) ?? [];
    const restIds = secs.find((s) => s.key === "others")?.notes.map((n) => n.id) ?? [];
    mut.reorder.mutate(
      [
        ...pinnedIds.map((id, i) => ({ id, pinned: true, position: (i + 1) * 1000 })),
        ...restIds.map((id, i) => ({ id, pinned: false, position: (i + 1) * 1000 })),
      ],
      {
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível reordenar."),
      },
    );
  }

  function handleCategoryReorder(secs: Array<{ key: string; notes: KeepNote[] }>) {
    const payload = secs.flatMap((s) =>
      s.notes.map((n, i) => ({
        id: n.id,
        position: (i + 1) * 1000,
        categoryId: s.key === "none" ? null : s.key,
      })),
    );
    mut.reorder.mutate(payload, {
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Não foi possível reordenar."),
    });
  }

  return (
    <div className={cn("v2-screen v2-screen-fill grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-hidden bg-background")}>
      <NavRailSpacer />
      <PageChrome
        className="px-4 py-5"
        header={
          <>
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
            <SectionHeader
              icon={Lightbulb}
              title="Bwipo Keeps"
              stackSearchOnMobile
              searchBelowClassName="-mt-2 mb-3"
              pinAccessoryEnd={isMobile && folder === "notes"}
              titleAccessory={
                isMobile && folder === "notes" ? (
                  <div data-tour="keeps-view-mode">
                    <HeaderPillToggle
                      value={viewMode}
                      onChange={setViewMode}
                      options={[
                        { key: "normal", label: "Keeps" },
                        { key: "categories", label: "Categorias" },
                      ]}
                    />
                  </div>
                ) : null
              }
              searchSlot={
                <div data-tour="keeps-search" className="w-full">
                <SearchFilterBar
                  value={q}
                  onChange={setQ}
                  placeholder="Pesquisar notas..."
                  withFilter={showColorFilter}
                  filterOpen={filterOpen}
                  activeCount={colorFilter.length}
                  onFilterClick={() => setFilterOpen((v) => !v)}
                  className="w-full"
                >
                  {filterOpen && showColorFilter ? (
                    <div className="absolute right-0 top-12 z-30 w-[min(100%,20rem)] rounded-2xl border border-border bg-card p-3 shadow-lg">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">Cor</p>
                      <KeepColorSwatches
                        selected={colorFilter}
                        showDefault={hasUncolored}
                        colors={usedColors}
                        onChange={(color) => {
                          const key = color ?? "none";
                          setColorFilter((prev) =>
                            prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
                          );
                        }}
                      />
                      {colorFilter.length > 0 ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold text-primary"
                          onClick={() => setColorFilter([])}
                        >
                          Limpar cores
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </SearchFilterBar>
                </div>
              }
              actions={
                <div className="flex min-w-0 flex-nowrap items-center gap-2 md:flex-wrap md:justify-end">
                  {folder === "notes" && !isMobile ? (
                    <div data-tour="keeps-view-mode">
                    <HeaderPillToggle
                      value={viewMode}
                      onChange={setViewMode}
                      options={[
                        { key: "normal", label: "Keeps" },
                        { key: "categories", label: "Categorias" },
                      ]}
                    />
                    </div>
                  ) : null}
                  <div data-tour="keeps-folders" className="min-w-0">
                  <HeaderPillToggle
                    value={folder}
                    onChange={setFolder}
                    options={[
                      { key: "notes", label: "Notas", icon: Lightbulb },
                      { key: "archive", label: "Arquivo", icon: Archive },
                      { key: "trash", label: "Lixeira", icon: Trash2 },
                    ]}
                    />
                  </div>
                </div>
              }
              menuSlot={
                <div className={cn("flex shrink-0 items-center gap-1", isMobile && "ml-auto")}>
                <PageTourButton tourId="bwipo-keeps" />
                <div data-tour="keeps-actions">
                <PageActionsMenu
                  tooltip="Keeps"
                  items={[
                    {
                      icon: <Upload size={14} />,
                      label: "Importar Keeps",
                      tourId: "keeps-import",
                      onClick: () => importRef.current?.click(),
                    },
                    {
                      icon: <CirclePlay size={14} />,
                      label: "Como importar Keeps",
                      tourId: "keeps-import-help",
                      onClick: () => {
                        window.open(GOOGLE_KEEP_TUTORIAL_PLAYER, "_blank", "noopener,noreferrer");
                      },
                    },
                  ]}
                />
                </div>
                </div>
              }
            />
          </>
        }
        bodyClassName="gap-4"
      >
        {folder === "notes" ? (
          <KeepComposer
            pending={mut.create.isPending}
            categories={categoriesMode ? categories : undefined}
            onCreate={async ({ title, content, file, categoryId }) => {
              try {
                const created = await mut.create.mutateAsync({
                  title,
                  content: content ?? EMPTY_KEEP_DOC,
                  ...(categoriesMode ? { categoryId: categoryId ?? null } : {}),
                });
                if (file) await mut.attach.mutateAsync({ noteId: created.note.id, file });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Não foi possível salvar a nota.");
                throw err;
              }
            }}
          />
        ) : null}

        {notesQuery.isLoading || (categoriesMode && categoriesQuery.isLoading) ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : items.length === 0 && !categoriesMode ? (
          <div data-tour="keeps-board">
          <EmptyState
            icon={<Lightbulb className="size-7" />}
            title={q || colorFilter.length ? "Nenhuma nota encontrada" : folder === "trash" ? "Lixeira vazia" : folder === "archive" ? "Nada no arquivo" : "Nenhuma nota ainda"}
            description={q || colorFilter.length ? "Tente outro termo ou limpe o filtro de cor." : "Crie uma nota ou importe o ZIP do Google Keep."}
          />
          </div>
        ) : folder === "notes" && categoriesMode ? (
          <div className="space-y-4">
            <button
              type="button"
              data-tour="keeps-new-category"
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-foreground"
              onClick={() => setCategoryOpen(true)}
            >
              <FolderPlus className="size-4" />
              Nova categoria
            </button>
          <div data-tour="keeps-board">
            <KeepBoard
              sections={categorySections}
              onOpen={setActive}
              onPin={(note) => mut.patch.mutate({ id: note.id, patch: { pinned: !note.pinned } })}
              onArchive={(note) => mut.patch.mutate({ id: note.id, patch: { archived: true } })}
              onTrash={(note) => mut.remove.mutate({ id: note.id })}
              onColor={(note, color) => {
                if (note.categoryId) return;
                mut.patch.mutate({ id: note.id, patch: { color } });
              }}
              onReorder={handleCategoryReorder}
            />
          </div>
          </div>
        ) : folder === "notes" ? (
          <div data-tour="keeps-board">
          <KeepBoard
            sections={normalSections}
            onOpen={setActive}
            onPin={(note) => mut.patch.mutate({ id: note.id, patch: { pinned: !note.pinned } })}
            onArchive={(note) => mut.patch.mutate({ id: note.id, patch: { archived: true } })}
            onTrash={(note) => mut.remove.mutate({ id: note.id })}
              onColor={(note, color) => {
                if (note.categoryId) return;
                mut.patch.mutate({ id: note.id, patch: { color } });
              }}
            onReorder={handleNormalReorder}
          />
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((note) => (
                  <KeepCard
                    key={note.id}
                    note={note}
                    onOpen={() => setActive(note)}
                    onArchive={
                      folder === "archive"
                        ? () => mut.patch.mutate({ id: note.id, patch: { archived: false } })
                        : undefined
                    }
                    onRestore={
                      folder === "trash"
                        ? () => mut.patch.mutate({ id: note.id, patch: { trashed: false } })
                        : undefined
                    }
                    onTrash={
                      folder === "trash"
                        ? () => mut.remove.mutate({ id: note.id, forever: true })
                        : () => mut.remove.mutate({ id: note.id })
                    }
                    onColor={
                      note.categoryId
                        ? undefined
                        : (color) => mut.patch.mutate({ id: note.id, patch: { color } })
                    }
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </PageChrome>

      <KeepCategoryDialog
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        pending={mut.createCategory.isPending}
        onSubmit={async ({ name, color }) => {
          try {
            await mut.createCategory.mutateAsync({ name, color });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Não foi possível criar.");
            throw err;
          }
        }}
      />
      <KeepEditorDialog
        note={active}
        open={!!active}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
        onSave={async (patch) => {
          if (!active) return;
          await mut.patch.mutateAsync({ id: active.id, patch });
        }}
        onColor={(color) => {
          if (!active) return;
          mut.patch.mutate({ id: active.id, patch: { color } });
          setActive((prev) => (prev ? { ...prev, color } : prev));
        }}
        onAttach={async (file) => {
          if (!active) return;
          const res = await mut.attach.mutateAsync({ noteId: active.id, file });
          setActive((prev) =>
            prev ? { ...prev, attachments: [...prev.attachments, res.attachment] } : prev,
          );
        }}
      />
      {tourScene ? (
        <div
          className="pointer-events-none fixed z-40 flex p-4 pb-40"
          style={{
            left: "var(--nav-rail-w, 76px)",
            top: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <KeepsTourDemo scene={tourScene} />
        </div>
      ) : null}
    </div>
  );
}
