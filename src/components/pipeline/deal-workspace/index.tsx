"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { IconLoader2 as Loader2, IconX as X } from "@tabler/icons-react";
import { toast } from "sonner";

import { useConfirm } from "@/hooks/use-confirm";
import { DealForm } from "@/components/pipeline/deal-form";
import type { BoardStage } from "@/components/pipeline/kanban-board";
import { ConversationHeader, type ConversationHeaderTab } from "@/components/inbox/conversation-header";
import {
  conversationHasCallingHint,
  WhatsappCallChip,
} from "@/components/inbox/whatsapp-call-chip";
import type { TransferControlUser } from "@/components/inbox/transfer-control";
import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";
import { TooltipHost } from "@/components/ui/tooltip";
import { cn, dealNumericValue } from "@/lib/utils";

import { WorkspaceShell } from "./shell";
import {
  DealHeaderWorkspaceOutcomes,
  DealWorkspaceToolbarMenuItems,
} from "./header";
import { type RightTabValue } from "./tabs";
import { WorkspaceSidebar } from "./sidebar";
import { DealChatPanel } from "./deal-chat-panel";
import { WorkspaceConversationList } from "./workspace-conversation-list";
import { ActivitiesPanel } from "./panels/activities";
import { NotesPanel } from "./panels/notes";
import { TimelinePanel } from "./panels/timeline";
import { CONVERSATION_REOPENED_EVENT } from "@/features/inbox-v2/hooks";
import { dealDetailKey } from "@/features/pipeline-v2/hooks/use-deal-detail";
import { useTeamUsersQuery } from "@/features/shared/queries/team-users";
import type {
  ContactDetail,
  ConversationRow,
  DealDetailData,
  UserOption,
} from "./shared";

// ── Fetchers ────────────────────────────────────────────────────────────────

async function fetchDeal(id: string): Promise<DealDetailData> {
  const res = await fetch(apiUrl(`/api/deals/${id}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Erro ao carregar negocio");
  return data;
}

async function fetchContact(id: string): Promise<ContactDetail> {
  const res = await fetch(apiUrl(`/api/contacts/${id}`));
  if (!res.ok) throw new Error("Erro ao carregar contato");
  return res.json();
}

// ── Main ────────────────────────────────────────────────────────────────────

const boardKey = (pipelineId: string) => ["pipeline-board", pipelineId] as const;
type DealWorkspaceProps = {
  dealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  boardStages: BoardStage[];
};

export function DealWorkspace({
  dealId,
  open,
  onOpenChange,
  pipelineId,
  boardStages,
}: DealWorkspaceProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [lostOpen, setLostOpen] = React.useState(false);
  const [rightTab, setRightTab] = React.useState<RightTabValue>("conversations");
  const [selectedConv, setSelectedConv] = React.useState<ConversationRow | null>(null);
  const [convStatus, setConvStatus] = React.useState("");
  const [convListOpen, setConvListOpen] = React.useState(false);
  const inConversationSearchRef = React.useRef<{ open: () => void } | null>(null);

  // Key canônica do deal (mesma do DealDetailPanel v2) — dedupe GET
  // /api/deals/:id e faz as invalidações de mutations valerem pros dois.
  const { data: deal, isLoading: dealLoading } = useQuery({
    queryKey: dealDetailKey(dealId),
    queryFn: () => fetchDeal(dealId!),
    enabled: open && !!dealId,
  });

  const contactId = deal?.contact?.id;
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: contactId ? ["contact", contactId] : ["contact", "none"],
    queryFn: () => fetchContact(contactId!),
    enabled: open && !!contactId,
  });

  const [autoLoaded, setAutoLoaded] = React.useState(false);
  const autoCreateConvRef = React.useRef(false);
  // Distingue "seleção automática" (initial load) de "clique manual do usuário
  // numa conversa da lista". Sem isso, o auto-switch abaixo trocaria a conv
  // que o usuário escolheu de propósito por uma mais recente.
  const manualSelectionRef = React.useRef(false);

  const invalidateAll = React.useCallback(() => {
    if (dealId) queryClient.invalidateQueries({ queryKey: dealDetailKey(dealId) });
    if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
    queryClient.invalidateQueries({ queryKey: boardKey(pipelineId) });
  }, [dealId, contactId, queryClient]);

  React.useEffect(() => {
    if (!open) {
      setEditing(false);
      setLostOpen(false);
      setSelectedConv(null);
      setConvStatus("");
      setRightTab("conversations");
      setAutoLoaded(false);
      setConvListOpen(false);
      autoCreateConvRef.current = false;
      manualSelectionRef.current = false;
    }
  }, [open]);

  const autoCreateConversation = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error("Sem contato");
      const res = await fetch(apiUrl("/api/conversations/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          skipSend: true,
          source: "deal_workspace",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.message === "string" ? data.message : "Erro ao criar conversa");
      return data.conversation as ConversationRow;
    },
    onSuccess: (conv) => {
      if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      invalidateAll();
      setSelectedConv(conv);
      setConvStatus(conv.status);
    },
  });

  React.useEffect(() => {
    if (
      !open ||
      !contactId ||
      !contact ||
      contact.conversations.length > 0 ||
      autoCreateConvRef.current ||
      autoCreateConversation.isPending
    ) {
      return;
    }
    autoCreateConvRef.current = true;
    autoCreateConversation.mutate();
  }, [open, contactId, contact, autoCreateConversation]);

  React.useEffect(() => {
    if (contact && !autoLoaded && contact.conversations.length > 0 && !selectedConv) {
      const latest = contact.conversations[0];
      setSelectedConv(latest);
      setConvStatus(latest.status);
      setAutoLoaded(true);
    }
  }, [contact, autoLoaded, selectedConv]);

  // Auto-switch para a conversa MAIS RECENTE quando o backend traz uma nova
  // no topo da lista (contact.conversations[0]) que ainda não é a selecionada.
  // Cobre principalmente o caso do modelo de ticket: "reabrir" gera uma nova
  // conversa com id diferente — sem esse effect, o painel ficava travado na
  // conversa velha (RESOLVED) mesmo depois de reabrir. Só troca se o usuário
  // não fez uma seleção manual (evita brigar com o clique dele na lista).
  React.useEffect(() => {
    if (!contact || contact.conversations.length === 0) return;
    if (manualSelectionRef.current) return;
    const latest = contact.conversations[0];
    if (selectedConv && selectedConv.id === latest.id) return;
    setSelectedConv(latest);
    setConvStatus(latest.status);
  }, [contact, selectedConv]);

  // Modelo de ticket: reabrir cria NOVA conversa (novo id). Escuta o evento
  // global disparado pelo `chat-window` / inbox-v2 (`emitConversationReopened`)
  // e troca a conversa ativa para a recém-criada. Também invalida o contato
  // pra o novo id aparecer na lista `contact.conversations` sem reload.
  React.useEffect(() => {
    if (!open) return;
    function onReopened(e: Event) {
      const newId = (e as CustomEvent<{ newId: string }>).detail?.newId;
      if (!newId) return;
      // O evento chega ANTES do refetch do contato — trocamos otimista para
      // um placeholder com o id novo (status OPEN, sem detalhes ainda). O
      // useEffect de auto-switch vai substituir pelo objeto completo assim
      // que `contact.conversations` for atualizada com o novo ticket.
      manualSelectionRef.current = false;
      setSelectedConv((prev) => ({
        id: newId,
        externalId: null,
        channel: prev?.channel ?? "whatsapp",
        status: "OPEN",
        inboxName: prev?.inboxName ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assignedTo: prev?.assignedTo ?? null,
      } as ConversationRow));
      setConvStatus("OPEN");
      if (contactId) {
        queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      }
    }
    window.addEventListener(CONVERSATION_REOPENED_EVENT, onReopened);
    return () => window.removeEventListener(CONVERSATION_REOPENED_EVENT, onReopened);
  }, [open, contactId, queryClient]);

  const statusMutation = useMutation({
    mutationFn: async (input: { status: "WON" | "LOST" | "OPEN"; lostReason?: string }) => {
      if (!dealId) throw new Error("Sem negocio");
      const res = await fetch(apiUrl(`/api/deals/${dealId}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          input.status === "LOST"
            ? { status: "LOST", lostReason: input.lostReason }
            : { status: input.status },
        ),
      });
      if (!res.ok) throw new Error("Erro ao alterar status");
      return res.json();
    },
    onSuccess: () => { invalidateAll(); setLostOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!dealId) throw new Error("Sem negocio");
      const res = await fetch(apiUrl(`/api/deals/${dealId}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boardKey(pipelineId) });
      onOpenChange(false);
    },
  });

  const { data: users = [] } = useTeamUsersQuery<UserOption>(open);

  // ── Atribuição de conversa (mesma API do Inbox/SalesHub) ──
  const { data: sessionData } = useSession();
  const myUserId = (sessionData?.user as { id?: string } | undefined)?.id;
  const myRole = (sessionData?.user as { role?: "ADMIN" | "MANAGER" | "MEMBER" } | undefined)?.role;
  const canManageAssignee = myRole === "ADMIN" || myRole === "MANAGER";

  const { data: teamUsers = [] } = useTeamUsersQuery<TransferControlUser>(
    open && canManageAssignee && !!selectedConv,
  );

  const [assignLoading, setAssignLoading] = React.useState(false);
  const assignConversation = React.useCallback(
    async (assignedToId: string | null) => {
      if (!selectedConv) return;
      const convId = selectedConv.id;
      setAssignLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/conversations/${convId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignedToId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message ?? "Erro ao transferir");
        toast.success(assignedToId ? "Conversa transferida" : "Conversa liberada");
        if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao transferir");
      } finally {
        setAssignLoading(false);
      }
    },
    [selectedConv, contactId, queryClient],
  );

  const ownerMutation = useMutation({
    mutationFn: async (ownerId: string | null) => {
      if (!dealId) throw new Error("Sem negocio");
      const res = await fetch(apiUrl(`/api/deals/${dealId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
      if (!res.ok) throw new Error("Erro ao atribuir responsavel");
    },
    onSuccess: invalidateAll,
  });

  const stageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      if (!dealId) throw new Error("Sem negocio");
      const res = await fetch(apiUrl(`/api/deals/${dealId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error("Erro ao alterar etapa");
    },
    onSuccess: invalidateAll,
  });

  const contactUpdateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!contactId) throw new Error("Sem contato");
      const res = await fetch(apiUrl(`/api/contacts/${contactId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao atualizar contato");
      return res.json();
    },
    onSuccess: () => {
      if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
    },
  });

  const dealUpdateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!dealId) throw new Error("Sem negocio");
      const res = await fetch(apiUrl(`/api/deals/${dealId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao atualizar negocio");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const stageOptions = boardStages.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const isLoading = dealLoading || (!!contactId && contactLoading);
  const workspaceTabs: ConversationHeaderTab[] = [
    { key: "conversations", label: "Conversa", count: contact?.conversations.length ?? 0 },
    { key: "activities", label: "Tarefas", count: deal?.activities?.length ?? 0 },
    { key: "notes", label: "Notas", count: deal?.notes?.length ?? 0 },
    { key: "timeline", label: "Timeline" },
  ];
  const conversationTags =
    selectedConv?.tags?.map((t) => ({ name: t.tag.name, color: t.tag.color })) ?? [];

  return (
    <WorkspaceShell
      open={open}
      onClose={() => onOpenChange(false)}
      hideFloatingClose={!!deal && !isLoading}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-8 animate-spin text-[var(--color-ink-muted)]" />
        </div>
      ) : !deal ? (
        <div className="flex h-full items-center justify-center text-[14px] tracking-tight text-[var(--text-muted)]">
          Negocio nao encontrado.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <ConversationHeader
            contactId={contact?.id ?? null}
            contactName={contact?.name ?? deal.title}
            contactPhone={contact?.phone ?? null}
            contactAvatarUrl={contact?.avatarUrl ?? null}
            contactChannel={selectedConv?.channel ?? "whatsapp"}
            contactHref={contact?.id ? `/contacts/${contact.id}` : null}
            conversationId={selectedConv?.id ?? null}
            conversationChannel={selectedConv?.channel ?? null}
            tabs={workspaceTabs}
            activeTab={rightTab}
            onTabChange={(key) => setRightTab(key as RightTabValue)}
            onSearch={selectedConv ? () => inConversationSearchRef.current?.open() : undefined}
            onBack={() => onOpenChange(false)}
            onClose={() => onOpenChange(false)}
            onOpenConversationList={
              contact && contact.conversations.length > 1
                ? () => setConvListOpen(true)
                : undefined
            }
            phoneReplacement={
              selectedConv ? (
                <WhatsappCallChip
                  conversationId={selectedConv.id}
                  channel={selectedConv.channel}
                  contactName={contact?.name ?? deal.title}
                  hasCalling={conversationHasCallingHint(selectedConv)}
                />
              ) : undefined
            }
            overflowMenu={
              <DealWorkspaceToolbarMenuItems
                conversationId={selectedConv?.id ?? null}
                conversationChannel={selectedConv?.channel ?? null}
                hasCalling={conversationHasCallingHint(selectedConv)}
                contactId={contact?.id ?? null}
                contactName={contact?.name ?? deal.title}
                canManageAssignee={canManageAssignee}
                myUserId={myUserId}
                currentAssigneeId={selectedConv?.assignedToId ?? null}
                teamUsers={teamUsers}
                assignLoading={assignLoading}
                onAssign={(uid) => void assignConversation(uid)}
                tags={conversationTags}
                onTagsUpdated={() => {
                  if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
                }}
                onEdit={() => setEditing(true)}
                onDelete={async () => {
                  const ok = await confirm({
                    title: "Excluir negocio",
                    description: "Excluir este negocio? Esta acao nao pode ser desfeita.",
                    confirmLabel: "Excluir",
                    variant: "destructive",
                  });
                  if (ok) deleteMutation.mutate();
                }}
              />
            }
            actionsSlot={
              <DealHeaderWorkspaceOutcomes
                dealStatus={deal.status}
                statusBusy={statusMutation.isPending}
                onWon={() => statusMutation.mutate({ status: "WON" })}
                onLostOpen={() => setLostOpen(true)}
                onReopen={() => statusMutation.mutate({ status: "OPEN" })}
              />
            }
          />

          {contact && contact.conversations.length > 1 ? (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-2 py-1.5 backdrop-blur-md lg:hidden">
              {contact.conversations.map((c) => {
                const active = selectedConv?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      manualSelectionRef.current = true;
                      setSelectedConv(c);
                      setConvStatus(c.status);
                    }}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-all backdrop-blur",
                      active
                        ? "border-primary/30 bg-[var(--color-primary-soft)] text-primary shadow-[var(--glass-shadow-sm)]"
                        : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--color-ink-soft)] hover:bg-[var(--glass-bg-overlay)]",
                    )}
                  >
                    {c.inboxName?.trim() || "Conversa"}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Layout 2 colunas (lg+): painel do negócio | chat fluido */}
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="hidden min-h-0 min-w-0 flex-col overflow-hidden border-r border-[var(--glass-border)] bg-[var(--glass-bg-panel)] backdrop-blur-xl lg:flex">
              <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                {rightTab === "conversations" && contact ? (
                  // Modo compacto é o único que tem SortableSidebar
                  // Forçar compact=true sempre que WorkspaceSidebar for chamado do index.tsx
                  <WorkspaceSidebar
                    deal={deal}
                    contact={contact}
                    users={users}
                    stageOptions={stageOptions}
                    onStageChange={(stageId) => stageMutation.mutate(stageId)}
                    stagePending={stageMutation.isPending}
                    onOwnerChange={(ownerId) => ownerMutation.mutate(ownerId)}
                    ownerPending={ownerMutation.isPending}
                    onContactUpdate={(d) => contactUpdateMutation.mutate(d)}
                    isUpdating={contactUpdateMutation.isPending}
                    onDealUpdate={(d) => dealUpdateMutation.mutate(d)}
                    dealUpdatePending={dealUpdateMutation.isPending}
                    density="compact"
                  />
                ) : null}
                {rightTab === "activities" ? (
                  <ActivitiesPanel
                    dealId={deal.id}
                    contactId={contactId}
                    contactName={contact?.name ?? null}
                    dealTitle={deal.title}
                    onCreated={() => {
                      if (dealId) queryClient.invalidateQueries({ queryKey: dealDetailKey(dealId) });
                      queryClient.invalidateQueries({ queryKey: ["pipeline-board"] });
                    }}
                  />
                ) : null}
                {rightTab === "notes" && contactId ? (
                  <NotesPanel
                    notes={deal.notes}
                    contactId={contactId}
                    dealId={deal.id}
                    onCreated={invalidateAll}
                  />
                ) : null}
                {rightTab === "timeline" ? <TimelinePanel dealId={deal.id} /> : null}
              </div>
            </aside>

            <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
              {autoCreateConversation.isPending && !selectedConv ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <Loader2 className="size-8 animate-spin text-[var(--color-ink-muted)]" />
                  <p className="text-[12px] text-[var(--color-ink-muted)]">Abrindo conversa…</p>
                </div>
              ) : selectedConv ? (
                <DealChatPanel
                  conversationId={selectedConv.id}
                  conversationStatus={convStatus || selectedConv.status}
                  onStatusChange={setConvStatus}
                  contactId={contactId}
                  inConversationSearchRef={inConversationSearchRef}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                  <p className="text-[12px] font-medium text-[var(--color-ink-muted)]">
                    {contact?.conversations.length === 0
                      ? "Não foi possível abrir a conversa ainda."
                      : "Carregando conversa…"}
                  </p>
                </div>
              )}
            </section>
          </div>

          <AnimatePresence>
            {convListOpen && contact && contact.conversations.length > 0 ? (
              <>
                <motion.div
                  key="conv-list-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setConvListOpen(false)}
                  className="fixed inset-0 z-(--z-sheet) bg-[var(--glass-bg-modal)]/30 backdrop-blur-sm"
                />
                <motion.aside
                  key="conv-list-panel"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                  className={cn(
                    "fixed inset-y-0 left-0 z-(--z-modal) flex w-[88vw] max-w-sm flex-col",
                    "border-r border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
                  )}
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-4 py-3 backdrop-blur">
                    <span className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                      Conversas
                    </span>
                    <TooltipHost label="Fechar" side="left">
                      <button
                        type="button"
                        onClick={() => setConvListOpen(false)}
                        aria-label="Fechar"
                        className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--color-ink-soft)] backdrop-blur transition-all hover:bg-[var(--glass-bg-base)] hover:text-foreground active:scale-95"
                      >
                        <X className="size-4" />
                      </button>
                    </TooltipHost>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <WorkspaceConversationList
                      conversations={contact.conversations}
                      selectedId={selectedConv?.id ?? null}
                      onSelect={(c) => {
                        manualSelectionRef.current = true;
                        setSelectedConv(c);
                        setConvStatus(c.status);
                        setConvListOpen(false);
                      }}
                    />
                  </div>
                </motion.aside>
              </>
            ) : null}
          </AnimatePresence>

          {/* Edit mode — overlay glass interno */}
          <AnimatePresence>
            {editing ? (
              <motion.div
                key="edit-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 z-(--z-overlay) flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-10 backdrop-blur-md"
                onClick={(e: React.MouseEvent) => { if (e.target === e.currentTarget) setEditing(false); }}
              >
                <motion.div
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 8, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                  className={cn(
                    "w-full max-w-xl rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-6 sm:p-8 backdrop-blur-xl",
                    "shadow-[var(--glass-shadow-lg)]",
                  )}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-[18px] font-bold tracking-tight text-foreground">
                      Editar negócio
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      aria-label="Fechar edição"
                      className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--color-ink-soft)] backdrop-blur transition-all hover:bg-[var(--glass-bg-base)] hover:text-foreground active:scale-95"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <DealForm
                    mode="edit"
                    dealId={deal.id}
                    stages={stageOptions}
                    initialContactName={deal.contact?.name}
                    defaultValues={{
                      title: deal.title,
                      value: dealNumericValue(deal.value),
                      stageId: deal.stage.id,
                      contactId: deal.contact?.id ?? null,
                      expectedClose: deal.expectedClose,
                    }}
                    onSuccess={() => { setEditing(false); invalidateAll(); }}
                    onCancel={() => setEditing(false)}
                  />
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <LossReasonDialog
            open={lostOpen}
            onOpenChange={(o) => {
              if (!o) setLostOpen(false);
            }}
            onConfirm={(reason) => statusMutation.mutate({ status: "LOST", lostReason: reason })}
            isPending={statusMutation.isPending}
          />
        </div>
      )}
    </WorkspaceShell>
  );
}
