"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, Loader2, MessageSquare, Rocket, ThumbsUp, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTeamUsersQuery } from "@/features/shared/queries/team-users";
import { useCan } from "@/hooks/use-my-permissions";
import { useDemandItem, useDemandMutations, kindOptions, priorityOptions } from "./hooks";
import { EVENT_LABEL, KIND_LABEL, PRIORITY_LABEL, type DemandItem } from "./types";

type TabId = "detalhes" | "comentarios" | "atividade";

const TABS: { id: TabId; label: string; icon: typeof Rocket }[] = [
  { id: "detalhes", label: "Detalhes", icon: Rocket },
  { id: "comentarios", label: "Comentários", icon: MessageSquare },
  { id: "atividade", label: "Atividade", icon: Activity },
];

const FIELD =
  "h-11 w-full rounded-xl border border-border bg-secondary/60 px-4 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export function DemandItemDrawer({
  itemId,
  boardId,
  onClose,
  canDelete,
  onDelete,
}: {
  itemId: string | null;
  boardId: string;
  onClose: () => void;
  canDelete?: boolean;
  onDelete?: (item: DemandItem) => void;
}) {
  const { data: item, isLoading } = useDemandItem(itemId);
  const { patchItem, comment, vote } = useDemandMutations();
  const { data: users = [] } = useTeamUsersQuery();
  const canEdit = useCan("demand:edit");
  const canComment = useCan("demand:comment");
  const canVote = useCan("demand:vote");
  const [draft, setDraft] = React.useState("");
  const [tab, setTab] = React.useState<TabId>("detalhes");

  React.useEffect(() => {
    setDraft("");
    setTab("detalhes");
  }, [itemId]);

  React.useEffect(() => {
    if (!itemId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [itemId, onClose]);

  if (!itemId) return null;

  return (
    <div className="telefonia-ip-theme fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/30 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demand-item-title"
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Rocket className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="demand-item-title"
                className="truncate text-xl font-bold tracking-tight text-foreground"
              >
                {item?.title ?? "Demanda"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {item ? `#${item.number}` : "Carregando…"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6">
          <div
            role="tablist"
            aria-label="Seções"
            className="inline-flex items-center gap-1 rounded-xl bg-secondary/60 p-1"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none ${
                    active
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-4">
          {isLoading || !item ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Carregando…
            </div>
          ) : tab === "detalhes" ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {KIND_LABEL[item.kind]}
                </span>
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {PRIORITY_LABEL[item.priority]}
                </span>
                <button
                  type="button"
                  disabled={!canVote || vote.isPending}
                  onClick={() => vote.mutate({ id: item.id, boardId })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <ThumbsUp className="size-3.5" aria-hidden="true" />
                  {item.votedByMe ? "Votado" : "Votar"} · {item.votesCount}
                </button>
              </div>

              {item.description ? (
                <p className="text-sm leading-relaxed text-foreground">{item.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Sem descrição.</p>
              )}

              {canEdit ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tipo">
                    <select
                      className={FIELD}
                      value={item.kind}
                      onChange={(e) =>
                        patchItem.mutate({
                          id: item.id,
                          boardId,
                          patch: { kind: e.target.value as typeof item.kind },
                        })
                      }
                    >
                      {kindOptions().map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Prioridade">
                    <select
                      className={FIELD}
                      value={item.priority}
                      onChange={(e) =>
                        patchItem.mutate({
                          id: item.id,
                          boardId,
                          patch: { priority: e.target.value as typeof item.priority },
                        })
                      }
                    >
                      {priorityOptions().map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Responsável">
                      <select
                        className={FIELD}
                        value={item.assigneeId ?? ""}
                        onChange={(e) =>
                          patchItem.mutate({
                            id: item.id,
                            boardId,
                            patch: { assigneeId: e.target.value || null },
                          })
                        }
                      >
                        <option value="">Sem responsável</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              ) : null}
            </div>
          ) : tab === "comentarios" ? (
            <div className="flex flex-col gap-4">
              {item.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {item.comments.map((c) => (
                    <div key={c.id} className="rounded-xl bg-secondary/60 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        {c.author.name} ·{" "}
                        {formatDistanceToNow(new Date(c.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{c.content}</p>
                    </div>
                  ))}
                </div>
              )}
              {canComment ? (
                <Field label="Novo comentário">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Atualizar o time…"
                    rows={3}
                    className="min-h-[88px] w-full resize-y rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </Field>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col">
              {item.events.map((ev) => (
                <li
                  key={ev.id}
                  className="border-b border-border py-3 text-sm last:border-0"
                >
                  <span className="font-semibold text-foreground">
                    {ev.actor?.name ?? "Sistema"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {EVENT_LABEL[ev.type] ?? ev.type}
                    {typeof ev.payload?.toStageName === "string"
                      ? ` → ${ev.payload.toStageName}`
                      : ""}
                    {" · "}
                    {formatDistanceToNow(new Date(ev.createdAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          {canDelete && item && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="mr-auto h-10 rounded-xl px-5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(item)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Excluir
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 rounded-xl px-5"
            onClick={onClose}
          >
            Fechar
          </Button>
          {canComment && item && tab === "comentarios" ? (
            <Button
              type="button"
              size="lg"
              className="h-10 rounded-xl px-5"
              disabled={!draft.trim() || comment.isPending}
              onClick={() => {
                const text = draft.trim();
                if (!text) return;
                comment.mutate(
                  { id: item.id, content: text },
                  { onSuccess: () => setDraft("") },
                );
              }}
            >
              {comment.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Comentar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}
