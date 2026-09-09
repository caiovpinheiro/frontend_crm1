"use client";

import { useMemo, useRef, useState } from "react";
import { Archive, Lightbulb, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/crm/empty-state";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { PageChrome } from "@/components/crm/page-header";
import { HeaderPillToggle, SectionHeader } from "@/components/crm/section-header";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { AppLoading } from "@/components/crm/app-loading";
import { cn } from "@/lib/utils";
import { KeepCard } from "@/features/keeps/keep-card";
import { KeepBoard } from "@/features/keeps/keep-board";
import { KeepComposer } from "@/features/keeps/keep-composer";
import { KeepEditorDialog } from "@/features/keeps/keep-editor-dialog";
import { useKeepMutations, useKeepNotes } from "@/features/keeps/hooks";
import { EMPTY_KEEP_DOC, type KeepFolder, type KeepNote } from "@/features/keeps/types";

export default function BwipoKeepsClientPage() {
  const [folder, setFolder] = useState<KeepFolder>("notes");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<KeepNote | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const notesQuery = useKeepNotes(folder, q);
  const mut = useKeepMutations(folder, q);

  const items = notesQuery.data?.items ?? [];
  const pinned = useMemo(() => items.filter((n) => n.pinned), [items]);
  const rest = useMemo(() => items.filter((n) => !n.pinned), [items]);

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
            <div className="relative">
              <SectionHeader
                icon={Lightbulb}
                title="Bwipo Keeps"
                search={false}
                actions={
                  <HeaderPillToggle
                    value={folder}
                    onChange={setFolder}
                    options={[
                      { key: "notes", label: "Notas", icon: Lightbulb },
                      { key: "archive", label: "Arquivo", icon: Archive },
                      { key: "trash", label: "Lixeira", icon: Trash2 },
                    ]}
                  />
                }
                menuSlot={
                  <PageActionsMenu
                    tooltip="Importar Keep"
                    items={[
                      {
                        icon: <Upload size={14} />,
                        label: "Importar do Google Keep",
                        onClick: () => importRef.current?.click(),
                      },
                    ]}
                  />
                }
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 bottom-2 z-[1] grid place-items-center">
                <div className="pointer-events-auto w-full max-w-xl">
                  <SearchFilterBar
                    value={q}
                    onChange={setQ}
                    placeholder="Pesquisar notas..."
                    withFilter={false}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </>
        }
        bodyClassName="gap-4"
      >
        {folder === "notes" ? (
          <KeepComposer
            pending={mut.create.isPending}
            onCreate={async ({ title, content, file }) => {
              try {
                const created = await mut.create.mutateAsync({ title, content: content ?? EMPTY_KEEP_DOC });
                if (file) await mut.attach.mutateAsync({ noteId: created.note.id, file });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Não foi possível salvar a nota.");
                throw err;
              }
            }}
          />
        ) : null}

        {notesQuery.isLoading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Lightbulb className="size-7" />}
            title={q ? "Nenhuma nota encontrada" : folder === "trash" ? "Lixeira vazia" : folder === "archive" ? "Nada no arquivo" : "Nenhuma nota ainda"}
            description={q ? "Tente outro termo." : "Crie uma nota ou importe o ZIP do Google Keep."}
          />
        ) : folder === "notes" ? (
          <KeepBoard
            pinned={pinned}
            rest={rest}
            onOpen={setActive}
            onPin={(note) => mut.patch.mutate({ id: note.id, patch: { pinned: !note.pinned } })}
            onArchive={(note) => mut.patch.mutate({ id: note.id, patch: { archived: true } })}
            onTrash={(note) => mut.remove.mutate({ id: note.id })}
            onReorder={(items) => {
              mut.reorder.mutate(items, {
                onError: (err) =>
                  toast.error(err instanceof Error ? err.message : "Não foi possível reordenar."),
              });
            }}
          />
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
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </PageChrome>

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
        onAttach={async (file) => {
          if (!active) return;
          const res = await mut.attach.mutateAsync({ noteId: active.id, file });
          setActive((prev) =>
            prev ? { ...prev, attachments: [...prev.attachments, res.attachment] } : prev,
          );
        }}
      />
    </div>
  );
}
