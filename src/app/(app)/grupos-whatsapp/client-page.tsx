"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconArrowLeft as ArrowLeft,
  IconCheck as Check,
  IconClock as Clock,
  IconInbox as Inbox,
  IconLayoutKanban as Columns3,
  IconPaperclip as Paperclip,
  IconRefresh as RefreshCw,
  IconSearch as Search,
  IconSend as Send,
  IconUsers as Users,
  IconUsersGroup as UsersRound,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { MessageContent } from "@/components/crm/message-bubble/message-content";
import { QuotedPreview, ReactionBadge } from "@/components/crm/message-bubble/bubble-parts";
import { MessageActionsMenu } from "@/components/crm/message-bubble/message-actions-menu";
import { EmojiButton, useEmojiPanel } from "@/features/inbox-v2/extras/composer/emoji-button";
import { ReplyPreviewBar } from "@/features/inbox-v2/extras/composer/reply-preview-bar";
import { formatWhatsapp } from "@/components/crm/message-bubble/media-helpers";
import { SignatureControl } from "@/features/inbox-v2/extras/composer/signature-control";
import { useComposerSignature } from "@/features/inbox-v2/extras/composer/use-composer-signature";
import { useConversationFeatures } from "@/features/inbox-v2/hooks/use-conversation-features";
import { EmptyState } from "@/components/crm/empty-state";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PagePrimaryButton } from "@/components/crm/page-toolbar";
import { Avatar, GroupGlyph } from "@/features/team-chat/avatar";
import {
  formatClock,
  formatDayLabel,
  formatListTime,
  getOrbitaNameColor,
  initialsOf,
} from "@/features/team-chat/helpers";
import {
  useWhatsAppGroup,
  useWhatsAppGroupMessages,
  useWhatsAppGroupMutations,
  useWhatsAppGroups,
} from "@/features/whatsapp-groups/hooks";
import {
  groupMessagesByDay,
  isFirstOfRun,
  isGroupMediaMessage,
  toBubbleMessage,
  type GroupThreadMessage,
} from "@/features/whatsapp-groups/thread";
import { groupListPreview, unreadBadgeLabel } from "@/features/whatsapp-groups/list-preview";
import { GroupInfoPanel } from "@/features/whatsapp-groups/group-info-panel";
import { AudioRecorderButton, FilePickerButton } from "@/features/inbox-v2/extras";
import type { AudioRecordState } from "@/features/inbox-v2/extras/audio-recorder-button";
import type { WhatsAppGroupDetail, WhatsAppGroupMember } from "@/features/whatsapp-groups/types";
import { useMobileChatChrome } from "@/hooks/use-mobile-chat-chrome";
import { cn } from "@/lib/utils";

const ICON_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-[var(--orbita-radius-inner)] text-[var(--orbita-text-secondary)] transition-colors hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)] disabled:opacity-50";

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function GruposWhatsAppClientPage() {
  const list = useWhatsAppGroups();
  const mut = useWhatsAppGroupMutations();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  // Grupo aberto pelo usuário (clique). A seleção automática ao entrar na
  // página não conta como "visto" — senão o grupo do topo nunca mostraria
  // as não lidas.
  const [openedId, setOpenedId] = useState<string | null>(null);

  const groups = useMemo(() => list.data?.groups ?? [], [list.data?.groups]);
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
    if (!connected || autoSynced || list.isLoading) return;
    setAutoSynced(true);
    mut.sync.mutate(undefined, {
      onError: (err) => toast.error(errorText(err, "Falha ao sincronizar")),
    });
  }, [autoSynced, connected, list.isLoading, mut.sync]);

  const detail = useWhatsAppGroup(connected ? selectedId : null);
  const group = detail.data?.group;
  // Celular com a conversa aberta: some a barra inferior e o campo fica na base.
  useMobileChatChrome(connected && mobileThread);

  const syncNow = () =>
    mut.sync.mutate(undefined, {
      onSuccess: () => toast.success("Atualizando grupos…"),
      onError: (err) => toast.error(errorText(err, "Falha ao sincronizar")),
    });

  return (
    <div className="v2-screen grid h-full min-h-0 min-w-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-[var(--bg-base)]">
      <NavRailSpacer />
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {list.isLoading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : !connected ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <EmptyState
              icon={<UsersRound className="size-7" />}
              title="Nenhum WhatsApp QR Code conectado"
              description="Conecte um número em Canais (WhatsApp QR Code) para ver e gerenciar os grupos dessa conta."
              action={<PagePrimaryButton href="/settings/channels">Ir para Canais</PagePrimaryButton>}
            />
          </div>
        ) : (
          <div className="team-chat-shell flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
            {/* Lista de grupos */}
            <aside
              className={cn(
                "orbita-block h-full min-h-0 w-full shrink-0 flex-col border-r border-[var(--orbita-divider)] md:flex md:w-[min(36%,26rem)] md:min-w-[20rem]",
                mobileThread ? "hidden" : "flex",
              )}
            >
              <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 px-1">
                    <h1 className="truncate font-display text-[20px] font-bold text-[var(--orbita-text)]">
                      Grupos WhatsApp
                    </h1>
                    {channel?.phoneNumber ? (
                      <p className="truncate text-[13px] text-[var(--orbita-text-tertiary)]">
                        Conta {channel.phoneNumber}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={ICON_BTN}
                    aria-label="Atualizar grupos"
                    title="Atualizar grupos"
                    disabled={mut.sync.isPending}
                    onClick={syncNow}
                  >
                    <RefreshCw className={cn("h-[18px] w-[18px]", mut.sync.isPending && "animate-spin")} />
                  </button>
                </div>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--orbita-text-tertiary)]" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar grupos"
                    aria-label="Buscar grupos"
                    className="h-11 w-full rounded-[10px] border border-border bg-[var(--orbita-field)] py-2.5 pl-10 pr-3 text-[15px] text-[var(--orbita-text)] outline-none placeholder:text-[var(--orbita-text-tertiary)]"
                  />
                </div>
              </div>
              <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-6 py-10 text-center text-[14px] text-[var(--orbita-text-tertiary)]">
                    {mut.sync.isPending
                      ? "Sincronizando grupos…"
                      : q.trim()
                        ? "Nenhum grupo com esse nome."
                        : "Nenhum grupo nesta conta ainda."}
                  </p>
                ) : (
                  filtered.map((g) => {
                    const active = selectedId === g.id;
                    const preview = groupListPreview(g);
                    // Grupo aberto: o que chega já está sendo visto.
                    const unread = active && openedId === g.id ? null : unreadBadgeLabel(g.unreadCount);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          if (g.id !== selectedId) setMembersOpen(false);
                          setSelectedId(g.id);
                          setOpenedId(g.id);
                          setMobileThread(true);
                        }}
                        className={cn(
                          "flex min-h-[76px] w-full items-center gap-3.5 border-b border-[var(--orbita-divider)] px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          active ? "orbita-item-selected" : "hover:bg-[var(--orbita-field)]",
                        )}
                      >
                        <GroupGlyph seed={g.id} size={48} name={g.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-[16px] leading-tight text-[var(--orbita-text)]",
                                active ? "font-semibold" : "font-medium",
                              )}
                            >
                              {g.name || "Grupo sem nome"}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[12px] tabular-nums",
                                unread
                                  ? "font-semibold text-[var(--orbita-selected)]"
                                  : "text-[var(--orbita-text-tertiary)]",
                              )}
                            >
                              {g.lastMessageAt ? formatListTime(g.lastMessageAt) : ""}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            {/* Uma linha só, cortada com "…" (como no WhatsApp). */}
                            <p className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--orbita-text-secondary)]">
                              {preview ? (
                                <>
                                  {preview.author ? (
                                    <span className="font-medium text-[var(--orbita-text)]">{preview.author}: </span>
                                  ) : null}
                                  {formatWhatsapp(preview.text)}
                                </>
                              ) : (
                                `${g.participantCount} participante${g.participantCount === 1 ? "" : "s"}`
                              )}
                            </p>
                            {unread ? (
                              <span
                                aria-label={`${unread} mensagens não lidas`}
                                className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--orbita-selected)] px-1.5 text-[11.5px] font-semibold tabular-nums text-white"
                              >
                                {unread}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Conversa */}
            <section
              className={cn(
                "orbita-block relative h-full min-h-0 min-w-0 flex-1 flex-col md:flex",
                mobileThread ? "flex" : "hidden",
              )}
            >
              {!selectedId ? (
                <ThreadPlaceholder
                  title="Selecione um grupo"
                  description="Escolha um grupo à esquerda para ver as mensagens e enviar."
                />
              ) : detail.isLoading ? (
                <AppLoading variant="inline" className="min-h-0 flex-1" />
              ) : !group ? (
                <ThreadPlaceholder
                  title="Grupo não encontrado"
                  description={
                    detail.isError
                      ? errorText(detail.error, "Não foi possível carregar o grupo.")
                      : "Atualize a lista e tente de novo."
                  }
                />
              ) : (
                <GroupThread
                  key={group.id}
                  group={group}
                  membersOpen={membersOpen}
                  markReadOnView={openedId === group.id}
                  onBack={() => setMobileThread(false)}
                  onToggleMembers={() => setMembersOpen((v) => !v)}
                />
              )}
            </section>

            {group && membersOpen ? (
              <GroupInfoPanel
                key={group.id}
                group={group}
                memberCount={Math.max(group.members.length, group.participantCount)}
                onClose={() => setMembersOpen(false)}
                members={
                  group.members.length === 0 ? (
                    <li className="px-4 py-6 text-center text-[13px] text-[var(--orbita-text-tertiary)]">
                      Participantes ainda não sincronizados.
                    </li>
                  ) : (
                    group.members.map((m) => <MemberRow key={m.id} groupId={group.id} member={m} />)
                  )
                }
              />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

function ThreadPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="chat-thread-texture flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--orbita-field)] text-[var(--orbita-selected)]">
        <UsersRound className="h-7 w-7" />
      </div>
      <h2 className="mt-5 font-display text-[18px] font-semibold text-[var(--orbita-text)]">{title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--orbita-text-secondary)]">{description}</p>
    </div>
  );
}

function GroupThread({
  group,
  membersOpen,
  markReadOnView,
  onBack,
  onToggleMembers,
}: {
  group: WhatsAppGroupDetail;
  membersOpen: boolean;
  /** Aberto pelo usuário: marca como visto ao abrir e quando chega mensagem. */
  markReadOnView: boolean;
  onBack: () => void;
  onToggleMembers: () => void;
}) {
  const thread = useWhatsAppGroupMessages(group.id);
  const mut = useWhatsAppGroupMutations();
  const [draft, setDraft] = useState("");
  const [recState, setRecState] = useState<AudioRecordState>("idle");
  // Responder: a mensagem citada fica na barra acima do campo até enviar.
  const [replyTo, setReplyTo] = useState<GroupThreadMessage | null>(null);
  const { emojiOpen, setEmojiOpen, emojiWrapRef } = useEmojiPanel();
  // Assinatura: mesma chave e nome do inbox; respeita Configurações → Conversas.
  const { data: session } = useSession();
  const agentName = (session?.user?.name ?? "").trim();
  const { features: convFeatures } = useConversationFeatures();
  const signature = useComposerSignature({
    agentName,
    signatureAllowed: convFeatures.agentSignatureEnabled,
  });
  const recording = recState !== "idle";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const messages = useMemo(() => thread.data?.messages ?? [], [thread.data?.messages]);
  const days = useMemo(() => groupMessagesByDay(messages), [messages]);
  const memberCount = Math.max(group.members.length, group.participantCount);

  // "Visto" compartilhado no número: ao abrir e a cada mensagem recebida
  // com o grupo aberto (aba visível), o contador zera para todos.
  const markRead = mut.markRead.mutate;
  const lastIncomingId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].fromMe) return messages[i].id;
    }
    return null;
  }, [messages]);
  useEffect(() => {
    if (!markReadOnView) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    markRead(group.id);
  }, [markReadOnView, group.id, lastIncomingId, markRead]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const send = () => {
    const typed = draft.trim();
    if (!typed) return;
    // Mesma assinatura do inbox: "*William*: texto" (cada um no seu login).
    const text = signature.applySignature(typed);
    const quoting = replyTo;
    setDraft("");
    setReplyTo(null);
    mut.send.mutate(
      { id: group.id, text, replyTo: quoting },
      {
        onError: (err) => {
          // Devolve o texto para o operador não perder o que escreveu.
          setDraft((cur) => cur || typed);
          setReplyTo((cur) => cur ?? quoting);
          toast.error(errorText(err, "Falha no envio"));
        },
      },
    );
    inputRef.current?.focus();
  };

  // Emoji no cursor (mesmo seletor do inbox).
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      const pos = start + emoji.length;
      node.setSelectionRange(pos, pos);
    });
  };

  // Áudio e anexo: mesmos botões do inbox, enviando para o grupo.
  const sendFile = (file: Blob, fileName: string) =>
    mut.sendAttachment.mutateAsync({ id: group.id, file, fileName });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-black/[0.06] bg-[var(--orbita-chrome)] dark:border-white/[0.06]">
        <div className="flex h-[60px] items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} aria-label="Voltar" className={cn(ICON_BTN, "md:hidden")}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            {/* Como no WhatsApp: clicar no grupo abre "Dados do grupo". */}
            <button
              type="button"
              onClick={onToggleMembers}
              title="Dados do grupo"
              className="flex min-w-0 items-center gap-3 rounded-[var(--orbita-radius-inner)] py-1 pr-2 text-left outline-none hover:bg-[var(--orbita-field)] focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <GroupGlyph seed={group.id} size={40} name={group.name} />
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-semibold text-[var(--orbita-text)]">
                  {group.name || "Grupo sem nome"}
                </span>
                <span className="block truncate text-[13px] text-[var(--orbita-text-secondary)]">
                  {group.description?.trim() ||
                    `${memberCount} participante${memberCount === 1 ? "" : "s"} · clique para ver dados do grupo`}
                </span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onToggleMembers}
            aria-label="Dados do grupo"
            title="Dados do grupo"
            aria-pressed={membersOpen}
            className={cn(ICON_BTN, membersOpen && "bg-[var(--orbita-field)] text-[var(--orbita-selected)]")}
          >
            <Users className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="chat-thread-texture chat-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 md:px-6">
        {thread.isLoading ? (
          <AppLoading variant="inline" className="min-h-[160px]" />
        ) : thread.isError && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
            <p className="max-w-sm text-sm text-destructive">
              {errorText(thread.error, "Não foi possível carregar as mensagens.")}
            </p>
            <button
              type="button"
              onClick={() => void thread.refetch()}
              className="rounded-full border border-border bg-[var(--orbita-block)] px-4 py-1.5 text-[13px] font-medium text-[var(--orbita-text)] hover:bg-[var(--orbita-field)]"
            >
              Tentar de novo
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-10">
            <span className="rounded-full border border-border bg-[var(--orbita-block)] px-4 py-1.5 text-[13px] text-[var(--orbita-text-secondary)]">
              As mensagens do grupo aparecem aqui a partir de agora.
            </span>
          </div>
        ) : (
          days.map((day) => (
            <div key={day.key}>
              <div className="pointer-events-none sticky top-1 z-[2] my-3.5 flex justify-center">
                <span className="rounded-full border border-border bg-[var(--orbita-block)] px-3.5 py-1 text-[13px] font-medium text-[var(--orbita-text-secondary)] shadow-sm">
                  {formatDayLabel(day.iso)}
                </span>
              </div>
              <ul className="flex flex-col">
                {day.items.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    first={isFirstOfRun(day.items, i)}
                    onReply={(m) => {
                      setReplyTo(m);
                      inputRef.current?.focus();
                    }}
                    onReact={(m, emoji) =>
                      mut.react.mutate(
                        { groupId: group.id, messageId: m.id, emoji, myName: agentName || null },
                        { onError: (err) => toast.error(errorText(err, "Não foi possível reagir")) },
                      )
                    }
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="relative z-20 shrink-0 border-t border-border bg-[var(--orbita-block)] px-3 pb-3 pt-2 md:px-4">
        {replyTo && !recording ? (
          <ReplyPreviewBar
            replyTo={{
              id: replyTo.id,
              preview: replyTo.text,
              senderName: replyTo.fromMe ? "Você" : replyTo.fromName || replyTo.fromPhone,
            }}
            onCancelReply={() => setReplyTo(null)}
          />
        ) : null}
        {convFeatures.agentSignatureEnabled && !recording ? (
          <div className="mb-1.5 px-1">
            <SignatureControl
              signature={signature}
              agentName={agentName}
              signatureEditable={convFeatures.agentSignatureEditable}
            />
          </div>
        ) : null}
        <form
          className="flex w-full items-end gap-2 rounded-[16px] border border-border bg-[var(--orbita-block)] p-2 shadow-[0_8px_24px_rgba(91,111,245,0.08)]"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {!recording ? (
            <EmojiButton
              emojiWrapRef={emojiWrapRef}
              emojiOpen={emojiOpen}
              setEmojiOpen={setEmojiOpen}
              inputDisabled={false}
              busy={false}
              insertEmoji={insertEmoji}
            />
          ) : null}
          {!recording ? (
            <FilePickerButton
              conversationId={null}
              sendFile={sendFile}
              className="h-11 w-11 shrink-0"
            >
              <Paperclip className="h-5 w-5" aria-label="Anexar arquivo" />
            </FilePickerButton>
          ) : null}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4096}
            placeholder="Digite uma mensagem para o grupo"
            aria-label="Mensagem para o grupo"
            className={cn(
              "max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-snug text-[var(--orbita-text)] outline-none placeholder:text-[var(--orbita-text-tertiary)]",
              recording && "hidden",
            )}
          />
          {/* Sem texto, o botão vira o gravador (como no WhatsApp e no inbox). */}
          {draft.trim() && !recording ? (
            <button
              type="submit"
              aria-label="Enviar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--orbita-selected)] text-white transition-opacity disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          ) : (
            <AudioRecorderButton
              conversationId={null}
              sendFile={sendFile}
              onStateChange={setRecState}
              className={cn("h-11 shrink-0", recording ? "flex-1" : "w-11")}
            />
          )}
        </form>
        <p className="mt-1.5 hidden px-1 text-[11.5px] text-[var(--orbita-text-tertiary)] md:block">
          Enter envia · Shift+Enter quebra a linha
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  first,
  onReply,
  onReact,
}: {
  msg: GroupThreadMessage;
  first: boolean;
  onReply: (msg: GroupThreadMessage) => void;
  onReact: (msg: GroupThreadMessage, emoji: string) => void;
}) {
  const mine = msg.fromMe;
  const author = msg.fromName || msg.fromPhone || "Participante";
  const [menuOpen, setMenuOpen] = useState(false);
  // Reagir/responder exige o id do WhatsApp (mensagens antigas do CRM não têm).
  const actionable = msg.canReact && !msg.pending;
  const bubble = toBubbleMessage(msg);
  const hasReactions = msg.reactions.length > 0;
  return (
    <li
      className={cn(
        "flex w-full",
        mine ? "justify-end" : "justify-start",
        first ? "mt-2" : "mt-0.5",
        hasReactions && "mb-3",
      )}
    >
      <div className="group relative flex max-w-[min(78%,36rem)] overflow-visible">
        <div
          className={cn(
            "relative min-w-0 px-3 pb-1.5 pt-2",
            mine ? "orbita-bubble-sent" : "orbita-bubble-received",
            first && "orbita-bubble--tail",
            msg.pending && "opacity-80",
          )}
        >
          {!mine && first ? (
            <p className="mb-0.5 truncate text-[13px] font-semibold" style={{ color: getOrbitaNameColor(msg.fromJid) }}>
              {author}
            </p>
          ) : null}
          {/* Resposta: quadro com a mensagem citada (como no WhatsApp). */}
          {msg.replyTo ? (
            <QuotedPreview
              snippet={msg.replyTo.text || "Mensagem"}
              direction={mine ? "out" : "in"}
              senderName={msg.replyTo.author}
              onLightBg={!mine}
            />
          ) : null}
          {isGroupMediaMessage(msg) && !msg.pending ? (
            <div className="text-[15px] leading-snug">
              <MessageContent message={bubble} isOutgoing={mine} />
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{formatWhatsapp(msg.text)}</p>
          )}
          <div
            className={cn(
              "mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums",
              mine ? "text-[var(--orbita-bubble-sent-meta)]" : "text-[var(--orbita-text-tertiary)]",
            )}
          >
            <span>{formatClock(msg.createdAt)}</span>
            {mine ? (
              msg.pending ? (
                <Clock className="h-3 w-3" aria-label="Enviando" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-label="Enviada" />
              )
            ) : null}
          </div>
          {hasReactions ? (
            <ReactionBadge
              reactions={msg.reactions}
              anchor={mine ? "left" : "right"}
              onClick={actionable ? () => setMenuOpen(true) : undefined}
            />
          ) : null}
        </div>
        {actionable ? (
          <MessageActionsMenu
            message={bubble}
            isOutgoing={mine}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onReply={() => onReply(msg)}
            onReact={(_m, emoji) => onReact(msg, emoji ?? "")}
            hideUnavailableActions
          />
        ) : null}
      </div>
    </li>
  );
}

function MemberRow({ groupId, member }: { groupId: string; member: WhatsAppGroupMember }) {
  const router = useRouter();
  const mut = useWhatsAppGroupMutations();
  const [open, setOpen] = useState(false);
  const label = member.name || member.phone || member.jid;

  const openIn = (target: "inbox" | "pipeline") =>
    mut.openMember.mutate(
      { groupId, memberId: member.id },
      {
        onSuccess: (data) => {
          if (target === "inbox") {
            router.push(`/inbox?c=${encodeURIComponent(data.conversationId)}`);
            return;
          }
          if (data.dealId) {
            router.push(`/pipeline?deal=${encodeURIComponent(data.dealId)}`);
            return;
          }
          router.push(`/contacts/${encodeURIComponent(data.contactId)}`);
          toast.message("Contato sem negócio aberto — abrindo a ficha.");
        },
        onError: (err) =>
          toast.error(
            errorText(err, target === "inbox" ? "Não foi possível abrir no inbox" : "Não foi possível abrir no pipeline"),
          ),
      },
    );

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--orbita-field)]",
          open && "bg-[var(--orbita-field)]",
        )}
      >
        <Avatar
          person={{ id: member.jid, name: label, initials: initialsOf(label), presence: "offline" }}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--orbita-text)]">{label}</p>
          {member.phone && member.name ? (
            <p className="truncate text-[12px] text-[var(--orbita-text-tertiary)]">{member.phone}</p>
          ) : null}
        </div>
        {member.isSuperAdmin || member.isAdmin ? (
          <span className="shrink-0 rounded-full bg-[var(--orbita-chip-active)] px-2 py-0.5 text-[11px] font-semibold text-[var(--orbita-chip-active-text)]">
            {member.isSuperAdmin ? "Super admin" : "Admin"}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="flex gap-2 px-4 pb-3 pl-[60px]">
          <button
            type="button"
            disabled={mut.openMember.isPending}
            onClick={() => openIn("inbox")}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[var(--orbita-block)] px-3 py-1.5 text-[13px] font-medium text-[var(--orbita-text)] hover:bg-[var(--orbita-field)] disabled:opacity-60"
          >
            <Inbox className="h-3.5 w-3.5" />
            Inbox
          </button>
          <button
            type="button"
            disabled={mut.openMember.isPending}
            onClick={() => openIn("pipeline")}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[var(--orbita-block)] px-3 py-1.5 text-[13px] font-medium text-[var(--orbita-text)] hover:bg-[var(--orbita-field)] disabled:opacity-60"
          >
            <Columns3 className="h-3.5 w-3.5" />
            Pipeline
          </button>
        </div>
      ) : null}
    </li>
  );
}
