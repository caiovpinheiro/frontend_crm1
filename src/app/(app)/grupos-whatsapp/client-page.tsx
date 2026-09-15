"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Columns3, Inbox, RefreshCw, Send, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { EmptyState } from "@/components/crm/empty-state";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageChrome } from "@/components/crm/page-header";
import { PageGhostButton, PagePrimaryButton } from "@/components/crm/page-toolbar";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { SectionHeader } from "@/components/crm/section-header";
import {
  useWhatsAppGroup,
  useWhatsAppGroupMessages,
  useWhatsAppGroupMutations,
  useWhatsAppGroups,
} from "@/features/whatsapp-groups/hooks";
import { cn } from "@/lib/utils";

export default function GruposWhatsAppClientPage() {
  const list = useWhatsAppGroups();
  const mut = useWhatsAppGroupMutations();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [autoSynced, setAutoSynced] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const router = useRouter();
  const threadRef = useRef<HTMLDivElement | null>(null);

  const groups = list.data?.groups ?? [];
  const connected = list.data?.connected === true;
  const channel = list.data?.channel ?? null;
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(term));
  }, [groups, q]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
    if (selectedId && !filtered.some((g) => g.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!connected || autoSynced || list.isLoading || groups.length > 0) return;
    setAutoSynced(true);
    mut.sync.mutate(undefined, {
      onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao sincronizar"),
    });
  }, [autoSynced, connected, groups.length, list.isLoading, mut.sync]);

  const detail = useWhatsAppGroup(connected ? selectedId : null);
  const thread = useWhatsAppGroupMessages(connected ? selectedId : null);
  const group = detail.data?.group;
  const messages = thread.data?.messages ?? [];

  useEffect(() => {
    setMembersOpen(false);
    setActiveMemberId(null);
  }, [selectedId]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, selectedId]);

  return (
    <div className={cn("v2-screen v2-screen-fill grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-hidden bg-background")}>
      <NavRailSpacer />
      <PageChrome
        className="px-4 py-5"
        header={
          <SectionHeader
            icon={UsersRound}
            title="Grupos WhatsApp"
            search={false}
            actions={
              connected ? (
                <PageGhostButton
                  type="button"
                  disabled={mut.sync.isPending}
                  onClick={() =>
                    mut.sync.mutate(undefined, {
                      onSuccess: () => toast.success("Atualizando grupos…"),
                      onError: (err) =>
                        toast.error(err instanceof Error ? err.message : "Falha ao sincronizar"),
                    })
                  }
                >
                  <RefreshCw size={14} className={mut.sync.isPending ? "animate-spin" : undefined} />
                  Atualizar
                </PageGhostButton>
              ) : null
            }
          />
        }
        bodyClassName="min-h-0"
      >
        {list.isLoading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : !connected ? (
          <EmptyState
            icon={<UsersRound className="size-7" />}
            title="Nenhum WhatsApp QR Code conectado"
            description="Conecte um número em Canais (WhatsApp QR Code) para ver e gerenciar os grupos dessa conta."
            action={<PagePrimaryButton href="/settings/channels">Ir para Canais</PagePrimaryButton>}
          />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(260px,320px)_1fr]">
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]">
              <div className="border-b border-[var(--glass-border)] p-3">
                <SearchFilterBar
                  value={q}
                  onChange={setQ}
                  placeholder="Buscar grupos..."
                  withFilter={false}
                  className="w-full"
                />
                {channel?.phoneNumber ? (
                  <p className="mt-2 font-body text-[12px] text-[var(--text-muted)]">
                    Conta {channel.phoneNumber}
                  </p>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <p className="px-2 py-8 text-center font-body text-[13px] text-[var(--text-muted)]">
                    {mut.sync.isPending
                      ? "Sincronizando grupos…"
                      : "Nenhum grupo nesta conta ainda."}
                  </p>
                ) : (
                  filtered.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      className={cn(
                        "mb-1 flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                        selectedId === g.id
                          ? "bg-[var(--brand-primary)]/10 text-[var(--text-primary)]"
                          : "hover:bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
                      )}
                    >
                      <span className="font-display text-[13px] font-semibold truncate">
                        {g.name || "Grupo sem nome"}
                      </span>
                      <span className="font-body text-[12px] text-[var(--text-muted)]">
                        {g.participantCount} participante{g.participantCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]">
              {!selectedId ? (
                <EmptyState
                  icon={<UsersRound className="size-7" />}
                  title="Selecione um grupo"
                  description="Escolha um grupo à esquerda para ver as mensagens e enviar."
                />
              ) : detail.isLoading ? (
                <AppLoading variant="inline" className="min-h-0 flex-1" />
              ) : !group ? (
                <EmptyState
                  icon={<UsersRound className="size-7" />}
                  title="Grupo não encontrado"
                  description="Atualize a lista e tente de novo."
                />
              ) : (
                <>
                  <div className="border-b border-[var(--glass-border)] px-4 py-3">
                    <h2 className="font-display text-[16px] font-bold text-[var(--text-primary)]">
                      {group.name || "Grupo sem nome"}
                    </h2>
                    {group.description ? (
                      <p className="mt-1 font-body text-[13px] text-[var(--text-muted)] line-clamp-2">
                        {group.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="border-b border-[var(--glass-border)] px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setMembersOpen((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 py-1 text-left"
                    >
                      <span className="font-display text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Participantes ({group.members.length})
                      </span>
                      <ChevronDown
                        size={16}
                        className={cn(
                          "text-[var(--text-muted)] transition-transform",
                          membersOpen ? "rotate-180" : "rotate-0",
                        )}
                      />
                    </button>
                    {membersOpen ? (
                      <ul className="mt-1 max-h-48 overflow-y-auto">
                        {group.members.map((m) => {
                          const label = m.name || m.phone || m.jid;
                          const open = activeMemberId === m.id;
                          return (
                            <li key={m.id} className="rounded-lg">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveMemberId((cur) => (cur === m.id ? null : m.id))
                                }
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--glass-bg-overlay)]"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-body text-[13px] text-[var(--text-secondary)]">
                                    {label}
                                  </p>
                                  {m.phone && m.name ? (
                                    <p className="font-body text-[12px] text-[var(--text-muted)]">
                                      {m.phone}
                                    </p>
                                  ) : null}
                                </div>
                                {m.isSuperAdmin || m.isAdmin ? (
                                  <span className="shrink-0 rounded-full border border-[var(--glass-border)] px-2 py-0.5 font-display text-[11px] font-semibold text-[var(--text-muted)]">
                                    {m.isSuperAdmin ? "Super admin" : "Admin"}
                                  </span>
                                ) : null}
                              </button>
                              {open ? (
                                <div className="mb-1 flex flex-wrap gap-2 px-2 pb-2">
                                  <PageGhostButton
                                    type="button"
                                    disabled={mut.openMember.isPending}
                                    onClick={() => {
                                      mut.openMember.mutate(
                                        { groupId: group.id, memberId: m.id },
                                        {
                                          onSuccess: (data) =>
                                            router.push(`/inbox?c=${encodeURIComponent(data.conversationId)}`),
                                          onError: (err) =>
                                            toast.error(
                                              err instanceof Error
                                                ? err.message
                                                : "Não foi possível abrir no inbox",
                                            ),
                                        },
                                      );
                                    }}
                                  >
                                    <Inbox size={14} />
                                    Inbox
                                  </PageGhostButton>
                                  <PageGhostButton
                                    type="button"
                                    disabled={mut.openMember.isPending}
                                    onClick={() => {
                                      mut.openMember.mutate(
                                        { groupId: group.id, memberId: m.id },
                                        {
                                          onSuccess: (data) => {
                                            if (data.dealId) {
                                              router.push(`/pipeline?deal=${encodeURIComponent(data.dealId)}`);
                                              return;
                                            }
                                            router.push(`/contacts/${encodeURIComponent(data.contactId)}`);
                                            toast.message("Contato sem negócio aberto — abrindo a ficha.");
                                          },
                                          onError: (err) =>
                                            toast.error(
                                              err instanceof Error
                                                ? err.message
                                                : "Não foi possível abrir no pipeline",
                                            ),
                                        },
                                      );
                                    }}
                                  >
                                    <Columns3 size={14} />
                                    Pipeline
                                  </PageGhostButton>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                  <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {thread.isLoading ? (
                      <AppLoading variant="inline" className="min-h-[120px]" />
                    ) : messages.length === 0 ? (
                      <p className="py-10 text-center font-body text-[13px] text-[var(--text-muted)]">
                        As mensagens recentes do grupo aparecem aqui.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {messages.map((msg) => (
                          <li
                            key={msg.id}
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2",
                              msg.fromMe
                                ? "ml-auto bg-[var(--brand-primary)]/15 text-[var(--text-primary)]"
                                : "mr-auto bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
                            )}
                          >
                            {!msg.fromMe ? (
                              <p className="mb-0.5 font-display text-[11px] font-semibold text-[var(--text-muted)]">
                                {msg.fromName || msg.fromPhone || "Participante"}
                              </p>
                            ) : null}
                            <p className="whitespace-pre-wrap break-words font-body text-[13px]">
                              {msg.text}
                            </p>
                            <p className="mt-1 text-right font-body text-[10px] text-[var(--text-muted)]">
                              {new Date(msg.createdAt).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <form
                    className="flex gap-2 border-t border-[var(--glass-border)] p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = draft.trim();
                      if (!text) return;
                      mut.send.mutate(
                        { id: group.id, text },
                        {
                          onSuccess: () => {
                            setDraft("");
                            toast.success("Mensagem enviada");
                          },
                          onError: (err) =>
                            toast.error(err instanceof Error ? err.message : "Falha no envio"),
                        },
                      );
                    }}
                  >
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder="Escreva uma mensagem para o grupo…"
                      className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--glass-border)] bg-transparent px-3 py-2 font-body text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                    />
                    <PagePrimaryButton type="submit" disabled={mut.send.isPending || !draft.trim()}>
                      <Send size={14} />
                      Enviar
                    </PagePrimaryButton>
                  </form>
                </>
              )}
            </section>
          </div>
        )}
      </PageChrome>
    </div>
  );
}
