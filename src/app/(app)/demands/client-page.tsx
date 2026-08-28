"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { IconChevronDown, IconColumns, IconLayoutKanban, IconPlus, IconRocket } from "@tabler/icons-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageHeader } from "@/components/crm/page-header";
import { PageActionsMenu, PageSegmentedControl } from "@/components/crm/page-toolbar";
import { ClientOnly } from "@/components/util/client-only";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-my-permissions";
import { DemandKanban } from "@/features/demands/board-kanban";
import { DemandItemDrawer } from "@/features/demands/item-drawer";
import { DemandSearchFilterBar } from "@/features/demands/search-filter-bar";
import {
  kindOptions,
  priorityOptions,
  useDemandBoard,
  useDemandBoards,
  useDemandMutations,
} from "@/features/demands/hooks";
import { KIND_LABEL, type DemandItem, type DemandItemKind, type DemandPriority } from "@/features/demands/types";
import { Badge } from "@/components/ui/badge";

export default function DemandsClientPage({
  navRail,
}: {
  navRail?: React.ReactNode;
} = {}) {
  const { status } = useSession();
  const canCreate = useCan("demand:create");
  const canMove = useCan("demand:move");
  const canManage = useCan("demand:manage_board");
  const canVote = useCan("demand:vote");

  const boardsQuery = useDemandBoards(status === "authenticated");
  const boards = boardsQuery.data?.boards ?? [];
  const [boardId, setBoardId] = React.useState<string | null>(null);
  const activeId = boardId ?? boards[0]?.id ?? null;
  const boardQuery = useDemandBoard(activeId);
  const board = boardQuery.data;

  const [view, setView] = React.useState<"kanban" | "list">("kanban");
  const [search, setSearch] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("ALL");
  const [openItemId, setOpenItemId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createStageId, setCreateStageId] = React.useState<string | undefined>();
  const [boardOpen, setBoardOpen] = React.useState(false);
  const [stageOpen, setStageOpen] = React.useState(false);

  const { createItem, createBoard, addStage, moveItem, vote } = useDemandMutations();

  const filteredBoard = React.useMemo(() => {
    if (!board) return null;
    const q = search.trim().toLowerCase();
    const filterItem = (it: DemandItem) => {
      if (kindFilter !== "ALL" && it.kind !== kindFilter) return false;
      if (priorityFilter !== "ALL" && it.priority !== priorityFilter) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        `#${it.number}`.includes(q) ||
        (it.assignee?.name ?? "").toLowerCase().includes(q)
      );
    };
    return {
      ...board,
      stages: board.stages.map((s) => ({ ...s, items: s.items.filter(filterItem) })),
    };
  }, [board, search, kindFilter, priorityFilter]);

  const allItems = filteredBoard?.stages.flatMap((s) =>
    s.items.map((it) => ({ ...it, stageName: s.name })),
  ) ?? [];

  const headerMenuItems = [
    canCreate
      ? {
          icon: <IconPlus size={14} stroke={2.6} />,
          label: "Nova Solicitação",
          onClick: () => {
            setCreateStageId(undefined);
            setCreateOpen(true);
          },
          primary: true as const,
        }
      : null,
    canManage
      ? {
          icon: <IconColumns size={13} />,
          label: "Nova Fase",
          onClick: () => setStageOpen(true),
          primary: false as const,
          divider: canCreate,
        }
      : null,
    canManage
      ? {
          icon: <IconLayoutKanban size={13} />,
          label: "Novo Board",
          onClick: () => setBoardOpen(true),
          primary: false as const,
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const booting =
    (status === "loading" ||
      boardsQuery.isPending ||
      (!!activeId && boardQuery.isPending)) &&
    !filteredBoard;
  const loadError =
    boardsQuery.error ?? boardQuery.error;
  const loadErrorMessage =
    loadError instanceof Error
      ? loadError.message
      : "Não foi possível carregar os boards.";

  return (
    <div
      className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4"
      style={{ gridTemplateRows: "1fr" }}
    >
      {navRail ?? <NavRailSpacer />}
      {booting ? (
        <AppLoading variant="panel" />
      ) : boardsQuery.isError || boardQuery.isError ? (
        <AppLoading
          variant="panel"
          error={loadErrorMessage}
          onRetry={() => {
            void boardsQuery.refetch();
            void boardQuery.refetch();
          }}
        />
      ) : (
      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
          <PageHeader
            icon={<IconRocket size={20} />}
            title="Demandas"
            titleAccessory={
              boards.length > 0 ? (
                <ClientOnly
                  fallback={
                    <div
                      aria-hidden
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]"
                    />
                  }
                >
                  <DropdownGlass
                    options={boards.map((b) => ({
                      value: b.id,
                      label: `${b.name} (${b.itemCount})`,
                    }))}
                    value={activeId ?? undefined}
                    onValueChange={setBoardId}
                    menuLabel="Trocar de board"
                    align="start"
                    matchTriggerWidth={false}
                    className="min-w-[220px]"
                    trigger={
                      <button
                        type="button"
                        aria-label={
                          board
                            ? `Board: ${board.name}`
                            : "Selecionar board"
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-[var(--glass-shadow-sm)] transition-colors hover:border-[var(--brand-primary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)] data-[state=open]:border-[var(--brand-primary)] data-[state=open]:bg-[var(--brand-primary)] data-[state=open]:text-white"
                      >
                        <IconChevronDown size={16} stroke={2.4} />
                      </button>
                    }
                  />
                </ClientOnly>
              ) : null
            }
            center={
              <DemandSearchFilterBar
                search={search}
                onSearch={setSearch}
                kind={kindFilter}
                onKindChange={setKindFilter}
                priority={priorityFilter}
                onPriorityChange={setPriorityFilter}
              />
            }
            actions={
              <div className="flex items-center gap-2">
                <PageSegmentedControl
                  aria-label="Visualização"
                  size="compact"
                  value={view}
                  onChange={(v) => setView(v as "kanban" | "list")}
                  items={[
                    { value: "kanban", label: "Kanban" },
                    { value: "list", label: "Lista" },
                  ]}
                />
                {headerMenuItems.length > 0 && (
                  <PageActionsMenu aria-label="Ações" items={headerMenuItems} />
                )}
              </div>
            }
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!filteredBoard ? (
              <p className="text-[13px] text-[var(--text-muted)]">Nenhum board disponível.</p>
            ) : view === "kanban" ? (
              <div className="flex min-h-0 flex-1 flex-col">
              <DemandKanban
                board={filteredBoard}
                canMove={canMove}
                onOpenItem={setOpenItemId}
                onVote={(id) => {
                  if (!canVote) return;
                  vote.mutate({ id, boardId: filteredBoard.id });
                }}
                onMove={(id, stageId, beforeId, afterId) => {
                  moveItem.mutate(
                    { id, boardId: filteredBoard.id, stageId, beforeId, afterId },
                    { onError: (err) => toast.error(err.message) },
                  );
                }}
                onAddInStage={(stageId) => {
                  setCreateStageId(stageId);
                  setCreateOpen(true);
                }}
              />
              </div>
            ) : (
              <div className="overflow-auto rounded-2xl border border-[var(--glass-border)]">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-[var(--glass-bg-subtle)] text-[12px] text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Título</th>
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold">Fase</th>
                      <th className="px-3 py-2 font-semibold">Votos</th>
                      <th className="px-3 py-2 font-semibold">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((it) => (
                      <tr
                        key={it.id}
                        className="cursor-pointer border-t border-[var(--glass-border)] hover:bg-[var(--color-primary-soft)]"
                        onClick={() => setOpenItemId(it.id)}
                      >
                        <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                          {it.number}
                        </td>
                        <td className="px-3 py-2 font-medium">{it.title}</td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary">{KIND_LABEL[it.kind]}</Badge>
                        </td>
                        <td className="px-3 py-2">{it.stageName}</td>
                        <td className="px-3 py-2 tabular-nums">{it.votesCount}</td>
                        <td className="px-3 py-2">{it.assignee?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

      <DemandItemDrawer
        itemId={openItemId}
        boardId={activeId ?? ""}
        onClose={() => setOpenItemId(null)}
      />

      <CreateItemDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        boardId={activeId}
        stageId={createStageId}
        stages={board?.stages ?? []}
        defaultKind={board?.kind === "BUGS" ? "BUG" : "REQUEST"}
        pending={createItem.isPending}
        onSubmit={async (input) => {
          try {
            const item = await createItem.mutateAsync(input);
            setCreateOpen(false);
            setOpenItemId(item.id);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro ao criar.");
          }
        }}
      />

      <FormDialog
        open={boardOpen}
        onOpenChange={setBoardOpen}
        title="Novo Board"
        footer={
          <Button
            form="new-board-form"
            type="submit"
            disabled={createBoard.isPending}
          >
            Criar
          </Button>
        }
      >
        <form
          id="new-board-form"
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") ?? "").trim();
            if (!name) return;
            try {
              const b = await createBoard.mutateAsync({
                name,
                description: String(fd.get("description") ?? "").trim() || undefined,
              });
              setBoardOpen(false);
              setBoardId(b.id);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Erro ao criar board.");
            }
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="board-name">Nome</Label>
            <Input id="board-name" name="name" required placeholder="Ex.: Financeiro" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="board-desc">Descrição</Label>
            <Textarea id="board-desc" name="description" rows={2} />
          </div>
        </form>
      </FormDialog>

      <FormDialog
        open={stageOpen}
        onOpenChange={setStageOpen}
        title="Nova Fase"
        footer={
          <Button form="new-stage-form" type="submit" disabled={addStage.isPending}>
            Adicionar
          </Button>
        }
      >
        <form
          id="new-stage-form"
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!activeId) return;
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") ?? "").trim();
            if (!name) return;
            try {
              await addStage.mutateAsync({ boardId: activeId, name });
              setStageOpen(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Erro ao criar fase.");
            }
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="stage-name">Nome da fase</Label>
            <Input id="stage-name" name="name" required placeholder="Ex.: Bloqueado" />
          </div>
        </form>
      </FormDialog>
      </main>
      )}
    </div>
  );
}

export function CreateItemDialog({
  open,
  onOpenChange,
  boardId,
  stageId,
  stages,
  defaultKind,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  boardId: string | null;
  stageId?: string;
  stages: { id: string; name: string }[];
  defaultKind: DemandItemKind;
  pending: boolean;
  onSubmit: (input: {
    boardId: string;
    title: string;
    description?: string;
    kind: DemandItemKind;
    priority: DemandPriority;
    stageId?: string;
  }) => Promise<void>;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova Solicitação"
      footer={
        <Button form="new-demand-form" type="submit" disabled={pending || !boardId}>
          Criar demanda
        </Button>
      }
    >
      <form
        id="new-demand-form"
        key={`${String(open)}-${stageId ?? ""}-${defaultKind}`}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!boardId) return;
          const fd = new FormData(e.currentTarget);
          void onSubmit({
            boardId,
            title: String(fd.get("title") ?? "").trim(),
            description: String(fd.get("description") ?? "").trim() || undefined,
            kind: (String(fd.get("kind") || defaultKind) as DemandItemKind),
            priority: (String(fd.get("priority") || "NONE") as DemandPriority),
            stageId: String(fd.get("stageId") || stageId || "") || undefined,
          });
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="d-title">Título</Label>
          <Input id="d-title" name="title" required placeholder="O que precisa ser feito?" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="d-desc">Descrição</Label>
          <Textarea id="d-desc" name="description" rows={4} placeholder="Contexto, impacto, como reproduzir…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label>Tipo</Label>
            <SelectNative name="kind" defaultValue={defaultKind}>
              {kindOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="grid gap-1">
            <Label>Prioridade</Label>
            <SelectNative name="priority" defaultValue="NONE">
              {priorityOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="grid gap-1">
            <Label>Fase</Label>
            <SelectNative name="stageId" defaultValue={stageId ?? stages[0]?.id ?? ""}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectNative>
          </div>
        </div>
      </form>
    </FormDialog>
  );
}
