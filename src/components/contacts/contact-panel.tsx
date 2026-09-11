"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconArrowLeft as ArrowLeft, IconBuilding as Building2, IconCalendar as Calendar, IconCheck as Check, IconCircleCheck as CheckCircle2, IconExternalLink as ExternalLink, IconFileText as FileText, IconHeartHandshake as Handshake, IconLoader2 as Loader2, IconMail as Mail, IconMessage as MessageSquare, IconPencil as Pencil, IconPhone as Phone, IconPlus as Plus, IconStar as Star, IconTag as Tag, IconUser as User, IconCircle as Circle, IconTrash as Trash2, IconX as X } from "@tabler/icons-react";

import { ChannelBadge } from "@/components/inbox/channel-badge";
import { ChatWindow } from "@/components/inbox/chat-window-lazy";
import { NewConversationButton } from "@/components/inbox/new-conversation";
import { CustomFieldsSection } from "@/components/contacts/custom-fields-section";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { AVATAR_SIZE } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { dt } from "@/lib/design-tokens";
import { cn, formatCurrency, formatDateTime, tagPillStyle, tagStyle } from "@/lib/utils";

// ── Types ─────────────────────────────────────

type ContactDetail = {
  id: string; name: string; email: string | null; phone: string | null;
  avatarUrl: string | null; leadScore: number; lifecycleStage: string;
  source: string | null;
  company: { id: string; name: string; domain: string | null } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  tags: { tag: { id: string; name: string; color: string } }[];
  deals: { id: string; title: string; value: string | number; status: string; stage: { id: string; name: string; color: string } }[];
  activities: ActivityRow[];
  notes: NoteRow[];
  conversations: ConversationRow[];
  createdAt: string; updatedAt: string;
};

type ConversationRow = {
  id: string; externalId: string | null; channel: string;
  status: string; inboxName: string | null; createdAt: string; updatedAt: string;
};

type ActivityRow = {
  id: string; type: string; title: string; description: string | null;
  completed: boolean; scheduledAt: string | null; createdAt: string;
  user: { id: string; name: string };
  deal?: { id: string; title: string } | null;
};

type NoteRow = {
  id: string; content: string; createdAt: string; user: { id: string; name: string };
};

// ── Constants ─────────────────────────────────

const LIFECYCLE_OPTIONS = [
  { value: "SUBSCRIBER", label: "Assinante", color: "bg-[var(--glass-bg-overlay)]" },
  { value: "LEAD", label: "Lead", color: "bg-[var(--brand-primary)]" },
  { value: "MQL", label: "MQL", color: "bg-[var(--color-warning)]" },
  { value: "SQL", label: "SQL", color: "bg-[var(--color-warning)]" },
  { value: "OPPORTUNITY", label: "Oportunidade", color: "bg-[var(--brand-secondary)]" },
  { value: "CUSTOMER", label: "Cliente", color: "bg-[var(--color-success)]" },
  { value: "EVANGELIST", label: "Evangelista", color: "bg-[var(--brand-accent)]" },
  { value: "OTHER", label: "Outro", color: "bg-[var(--glass-bg-overlay)]" },
] as const;

const LIFECYCLE_COLORS: Record<string, string> = {
  SUBSCRIBER: "bg-[var(--glass-bg-subtle)] text-[var(--text-secondary)]",
  LEAD: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
  MQL: "bg-[var(--color-warn-bg)] text-[var(--color-warning)]",
  SQL: "bg-[var(--color-warn-bg)] text-[var(--color-warning)]",
  OPPORTUNITY: "bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]",
  CUSTOMER: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  EVANGELIST: "bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]",
  OTHER: "bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberto", RESOLVED: "Resolvido", PENDING: "Pendente", SNOOZED: "Adiado",
};

const ACTIVITY_TYPES = [
  { value: "CALL", label: "Ligação", icon: "📞" },
  { value: "EMAIL", label: "E-mail", icon: "📧" },
  { value: "MEETING", label: "Reunião", icon: "🤝" },
  { value: "TASK", label: "Tarefa", icon: "✅" },
  { value: "NOTE", label: "Nota", icon: "📝" },
  { value: "WHATSAPP", label: "WhatsApp", icon: "💬" },
  { value: "OTHER", label: "Outro", icon: "📌" },
];

// ── Fetcher ───────────────────────────────────

async function fetchContact(id: string): Promise<ContactDetail> {
  const res = await fetch(apiUrl(`/api/contacts/${id}`));
  if (!res.ok) throw new Error("Erro ao carregar contato");
  return res.json();
}

// ── Main Component ────────────────────────────

type ContactPanelProps = {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ContactPanel({ contactId, open, onOpenChange }: ContactPanelProps) {
  const queryClient = useQueryClient();
  const [rightTab, setRightTab] = React.useState<"conversations" | "activities" | "notes">("conversations");
  const [selectedConv, setSelectedConv] = React.useState<ConversationRow | null>(null);
  const [convStatus, setConvStatus] = React.useState("");

  const { data: contact, isLoading } = useQuery({
    queryKey: contactId ? ["contact", contactId] : ["contact", "none"],
    queryFn: () => fetchContact(contactId!),
    enabled: open && !!contactId,
  });

  React.useEffect(() => {
    if (!open) {
      setSelectedConv(null);
      setConvStatus("");
      setRightTab("conversations");
    }
  }, [open]);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!contactId) throw new Error("Sem contato");
      const res = await fetch(apiUrl(`/api/contacts/${contactId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao atualizar");
      return res.json();
    },
    onSuccess: () => {
      if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="max-w-none! w-[calc(100vw-60px)]! overflow-hidden p-0"
      >
        <SheetClose className="absolute right-4 top-4 z-20" />

        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : !contact ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Contato não encontrado.
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Header */}
            <ContactHeader contact={contact} />

            {/* Two-column body */}
            <div className="flex min-h-0 flex-1">
              <div className="scrollbar-thin w-[360px] shrink-0 overflow-y-auto border-r border-border/60 bg-muted/5 p-4">
                <ContactLeftPanel
                  contact={contact}
                  onUpdate={(d) => updateMutation.mutate(d)}
                  isUpdating={updateMutation.isPending}
                />
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex items-center border-b border-border/60 px-4 pt-2 pb-0">
                  <Tabs value={rightTab} onValueChange={(v) => { setRightTab(v as typeof rightTab); setSelectedConv(null); }}>
                    <TabsList className="h-9 bg-transparent p-0">
                      <TabsTrigger value="conversations" className="gap-1.5 data-[state=active]:shadow-none">
                        <MessageSquare className="size-3.5" /> Conversas
                        {contact.conversations.length > 0 && (
                          <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px]">{contact.conversations.length}</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="activities" className="gap-1.5 data-[state=active]:shadow-none">
                        <Calendar className="size-3.5" /> Tarefas
                      </TabsTrigger>
                      <TabsTrigger value="notes" className="gap-1.5 data-[state=active]:shadow-none">
                        <FileText className="size-3.5" /> Notas
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                  {rightTab === "conversations" && (
                    <ConversationsPanel
                      conversations={contact.conversations}
                      selected={selectedConv}
                      onSelect={(c) => { setSelectedConv(c); setConvStatus(c?.status ?? ""); }}
                      convStatus={convStatus}
                      onStatusChange={setConvStatus}
                      contactId={contact.id}
                      contactPhone={contact.phone}
                      onConversationCreated={() => {
                        if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
                      }}
                    />
                  )}
                  {rightTab === "activities" && (
                    <ActivitiesPanel activities={contact.activities} contactId={contact.id} onCreated={() => { if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] }); }} />
                  )}
                  {rightTab === "notes" && (
                    <NotesPanel notes={contact.notes} contactId={contact.id} onCreated={() => { if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] }); }} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Contact Header ────────────────────────────

function ContactHeader({ contact }: { contact: ContactDetail }) {
  const currentStage = LIFECYCLE_OPTIONS.find((o) => o.value === contact.lifecycleStage);
  return (
    <div className="shrink-0 border-b border-border/60 bg-background px-5 py-3">
      <div className="flex items-center gap-4 pr-8">
        <ChatAvatar
          user={{ id: contact.id, name: contact.name, imageUrl: contact.avatarUrl }}
          phone={contact.phone}
          channel={contact.phone ? "whatsapp" : null}
          size={AVATAR_SIZE.lg}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight text-foreground">{contact.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {contact.email && <span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> {contact.email}</span>}
            {contact.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {contact.phone}</span>}
            {contact.company && <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" /> {contact.company.name}</span>}
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", LIFECYCLE_COLORS[contact.lifecycleStage] ?? LIFECYCLE_COLORS.OTHER)}>
              {currentStage?.label ?? contact.lifecycleStage}
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 text-[var(--color-warning)]" />
              <span className="text-xs font-semibold tabular-nums">{contact.leadScore}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Contact Left Panel ────────────────────────

function ContactLeftPanel({
  contact, onUpdate, isUpdating,
}: {
  contact: ContactDetail;
  onUpdate: (data: Record<string, unknown>) => void;
  isUpdating: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: sessionData } = useSession();
  const userRole = (sessionData?.user as { role?: string })?.role ?? "MEMBER";
  const canCreateTag = userRole === "ADMIN" || userRole === "MANAGER";

  const [editingBasic, setEditingBasic] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", email: "", phone: "", source: "" });
  const [tagInput, setTagInput] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);

  const { data: allTags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => { const r = await fetch(apiUrl("/api/tags")); return r.ok ? r.json() : []; },
    staleTime: 60_000,
  });
  const existingTagIds = new Set(contact.tags.map((t) => t.tag.id));
  const tagSuggestions = (allTags as { id: string; name: string; color: string }[]).filter(
    (t) => !existingTagIds.has(t.id) && t.name.toLowerCase().includes(tagInput.toLowerCase()),
  );

  const startEdit = () => {
    setDraft({ name: contact.name, email: contact.email ?? "", phone: contact.phone ?? "", source: contact.source ?? "" });
    setEditingBasic(true);
  };

  const saveBasic = () => {
    const payload: Record<string, unknown> = {};
    if (draft.name.trim() !== contact.name) payload.name = draft.name.trim();
    if (draft.email.trim() !== (contact.email ?? "")) payload.email = draft.email.trim() || null;
    if (draft.phone.trim() !== (contact.phone ?? "")) payload.phone = draft.phone.trim() || null;
    if (draft.source.trim() !== (contact.source ?? "")) payload.source = draft.source.trim() || null;
    if (Object.keys(payload).length > 0) onUpdate(payload);
    setEditingBasic(false);
  };

  const addTagMutation = useMutation({
    mutationFn: async (payload: { tagId?: string; tagName?: string }) => {
      const res = await fetch(apiUrl(`/api/contacts/${contact.id}/tags`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Erro");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contact", contact.id] }); setTagInput(""); setShowSuggestions(false); },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(apiUrl(`/api/contacts/${contact.id}/tags`), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagId }) });
      if (!res.ok) throw new Error("Erro");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contact", contact.id] }); },
  });

  const currentStageOpt = LIFECYCLE_OPTIONS.find((o) => o.value === contact.lifecycleStage);

  return (
    <div className="space-y-4">
      {/* Lifecycle */}
      <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fase do Ciclo</Label>
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", currentStageOpt?.color ?? "bg-[var(--glass-bg-overlay)]")} />
          <DropdownGlass
            options={LIFECYCLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={contact.lifecycleStage}
            onValueChange={(v) => onUpdate({ lifecycleStage: v })}
            disabled={isUpdating}
            triggerClassName="h-8 flex-1 text-sm font-medium"
          />
        </div>
      </div>

      <Separator />

      {/* Basic info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dados do Contato</h3>
          {!editingBasic ? (
            <Button type="button" variant="ghost" size="icon" className="size-6" onClick={startEdit}><Pencil className="size-3" /></Button>
          ) : (
            <div className="flex gap-0.5">
              <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => setEditingBasic(false)}><X className="size-3" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-6 text-[var(--color-success-text)]" onClick={saveBasic} disabled={isUpdating}><Check className="size-3" /></Button>
            </div>
          )}
        </div>

        {editingBasic ? (
          <div className="grid gap-2">
            {[
              { label: "Nome", key: "name" as const, type: "text" },
              { label: "E-mail", key: "email" as const, type: "email" },
              { label: "Telefone", key: "phone" as const, type: "tel" },
              { label: "Fonte", key: "source" as const, type: "text" },
            ].map(({ label, key, type }) => (
              <div key={key} className="grid gap-0.5">
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <Input type={type} value={draft[key]} onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))} className="h-7 text-xs" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-2 text-sm">
            <InfoRow icon={<User className="size-3.5" />} label="Nome" value={contact.name} />
            <InfoRow icon={<Mail className="size-3.5" />} label="E-mail" value={contact.email} />
            <InfoRow icon={<Phone className="size-3.5" />} label="Telefone" value={contact.phone} />
            <InfoRow icon={<Building2 className="size-3.5" />} label="Empresa" value={contact.company?.name} />
            {contact.source && <InfoRow icon={<ExternalLink className="size-3.5" />} label="Fonte" value={contact.source} />}
            {contact.assignedTo && <InfoRow icon={<User className="size-3.5" />} label="Responsável" value={contact.assignedTo.name} />}
          </div>
        )}
      </div>

      <Separator />

      <CustomFieldsSection contactId={contact.id} />

      <Separator />

      {/* Tags */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</h3>
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((t) => (
            <span
              key={t.tag.id}
              className={cn(dt.pill.base, "gap-1 pr-1")}
              style={tagPillStyle(t.tag.name, t.tag.color)}
            >
              {t.tag.name}
              <button type="button" onClick={() => removeTagMutation.mutate(t.tag.id)} className="rounded-sm p-0.5 opacity-60 hover:opacity-100">
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <form onSubmit={(e) => { e.preventDefault(); if (tagInput.trim() && canCreateTag) addTagMutation.mutate({ tagName: tagInput.trim() }); }} className="flex gap-1.5">
            <Input
              value={tagInput}
              onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder={canCreateTag ? "Buscar ou criar tag…" : "Buscar tag…"}
              className="h-7 flex-1 text-xs"
            />
            {canCreateTag && (
              <Button type="submit" size="sm" variant="outline" className="h-7 px-2" disabled={!tagInput.trim() || addTagMutation.isPending}><Tag className="size-3" /></Button>
            )}
          </form>
          {showSuggestions && tagInput && tagSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
              {tagSuggestions.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addTagMutation.mutate({ tagId: t.id })}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/50"
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: t.color || "var(--text-muted)" }} />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Deals */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Negócios ({contact.deals.length})
        </h3>
        {contact.deals.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">Nenhum negócio vinculado.</p>
        ) : (
          <div className="grid gap-1.5">
            {contact.deals.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Handshake className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{d.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={dt.pill.sm} style={tagStyle(d.stage.color)}>
                    {d.stage.name}
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{formatCurrency(Number(d.value))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="truncate text-foreground text-xs">{value || "—"}</p>
      </div>
    </div>
  );
}

// ── Conversations Panel ───────────────────────

function ConversationsPanel({
  conversations, selected, onSelect, convStatus, onStatusChange,
  contactId, contactPhone, onConversationCreated,
}: {
  conversations: ConversationRow[];
  selected: ConversationRow | null;
  onSelect: (c: ConversationRow | null) => void;
  convStatus: string;
  onStatusChange: (s: string) => void;
  contactId?: string;
  contactPhone?: string | null;
  onConversationCreated?: () => void;
}) {
  const queryClient = useQueryClient();

  if (selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onSelect(null)}>
            <ArrowLeft className="size-4" />
          </Button>
          <ChannelBadge channel={selected.channel} />
          {selected.inboxName && (
            <span className="text-xs font-medium text-muted-foreground">{selected.inboxName}</span>
          )}
          <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[selected.status] ?? selected.status}</Badge>
        </div>
        <ChatWindow
          conversationId={selected.id}
          conversationStatus={convStatus || selected.status}
          onResolve={(s) => onStatusChange(s)}
          onReopen={(s) => onStatusChange(s)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {contactId && (
        <div className="shrink-0 border-b border-border/40 px-4 py-3">
          <NewConversationButton
            contactId={contactId}
            contactPhone={contactPhone}
            onCreated={(conv) => {
              if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
              onConversationCreated?.();
              onSelect({
                id: conv.id,
                externalId: conv.externalId,
                channel: conv.channel,
                status: conv.status,
                inboxName: conv.inboxName,
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
              });
            }}
          />
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <MessageSquare className="mb-3 size-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Clique em &quot;Nova Conversa&quot; acima para enviar a primeira mensagem.
          </p>
        </div>
      ) : (
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <button key={c.id} type="button" onClick={() => onSelect(c)} className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-muted/40">
              <ChannelBadge channel={c.channel} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {c.inboxName && <span className="text-sm font-medium">{c.inboxName}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true, locale: ptBR })}</p>
              </div>
              <Badge variant={c.status === "OPEN" ? "default" : c.status === "RESOLVED" ? "success" : "secondary"} className="text-[10px]">
                {STATUS_LABEL[c.status] ?? c.status}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Activities Panel ──────────────────────────

function ActivitiesPanel({
  activities, contactId, onCreated,
}: {
  activities: ActivityRow[];
  contactId: string;
  onCreated: () => void;
}) {
  const [type, setType] = React.useState("TASK");
  const [title, setTitle] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [scheduled, setScheduled] = React.useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { type, title: title.trim(), contactId };
      if (desc.trim()) body.description = desc.trim();
      if (scheduled.trim()) body.scheduledAt = new Date(scheduled).toISOString();
      const res = await fetch(apiUrl("/api/activities"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Erro ao criar atividade");
      return res.json();
    },
    onSuccess: () => { setTitle(""); setDesc(""); setScheduled(""); onCreated(); },
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) =>
      fetch(apiUrl(`/api/activities/${id}/toggle`), { method: "POST" }).then((r) => { if (!r.ok) throw new Error(); }),
    onSuccess: () => onCreated(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(apiUrl(`/api/activities/${id}`), { method: "DELETE" }).then((r) => { if (!r.ok) throw new Error(); }),
    onSuccess: () => onCreated(),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-lg border border-border/80 bg-muted/10 p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <DropdownGlass
                options={ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                value={type}
                onValueChange={(v) => setType(v)}
                triggerClassName="h-8 w-full text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Agendar</Label>
              <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da tarefa…" className="h-8 text-sm" />
          <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (opcional)" className="text-sm" />
          <Button type="button" size="sm" disabled={!title.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Salvando…" : "Adicionar tarefa"}
          </Button>
        </div>

        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa registrada.</p>
        ) : (
          <div className="relative space-y-0">
            {activities.map((a, idx) => (
              <div key={a.id} className="group/act relative flex gap-3 pb-5">
                {idx < activities.length - 1 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border/60" />}
                <TooltipGlass label={a.completed ? "Marcar como pendente" : "Marcar como concluída"} side="right">
                  <button
                    type="button"
                    onClick={() => toggleMut.mutate(a.id)}
                    disabled={toggleMut.isPending}
                    className={cn("relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm transition-colors hover:border-[var(--color-success)]", a.completed ? "border-[var(--color-success)]/40 bg-[var(--color-success-bg)]" : "border-border bg-muted/40")}
                  >
                    {ACTIVITY_TYPES.find((t) => t.value === a.type)?.icon ?? "📌"}
                  </button>
                </TooltipGlass>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", a.completed && "line-through text-muted-foreground")}>{a.title}</span>
                    {a.completed ? (
                      <CheckCircle2 className="size-3.5 text-[var(--color-success)]" />
                    ) : (
                      <Circle className="size-3.5 text-[var(--text-faint)]" />
                    )}
                    <TooltipGlass label="Excluir tarefa" side="left" className="ml-auto opacity-0 group-hover/act:opacity-100">
                      <button
                        type="button"
                        onClick={() => deleteMut.mutate(a.id)}
                        disabled={deleteMut.isPending}
                        className="shrink-0 rounded p-1 text-[var(--color-ink-muted)] transition hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]"
                        aria-label="Excluir tarefa"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </TooltipGlass>
                  </div>
                  {a.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {a.user.name} · {formatDateTime(a.scheduledAt ?? a.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notes Panel ───────────────────────────────

function NotesPanel({
  notes, contactId, onCreated,
}: {
  notes: NoteRow[];
  contactId: string;
  onCreated: () => void;
}) {
  const [draft, setDraft] = React.useState("");

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(apiUrl(`/api/contacts/${contactId}/notes`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Erro ao criar nota");
      return res.json();
    },
    onSuccess: () => { setDraft(""); onCreated(); },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{n.user.name} · {formatDateTime(n.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) mutation.mutate(draft.trim()); }} className="flex gap-2 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma nota…"
          rows={2}
          className="min-h-[44px] flex-1 resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim()) mutation.mutate(draft.trim()); } }}
        />
        <Button type="submit" size="icon" className="size-11 shrink-0 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90" disabled={!draft.trim() || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
        </Button>
      </form>
    </div>
  );
}
