"use client";

import * as React from "react";
import {
  IconBolt,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconPaperclip,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/crm/glass-card";
import { InputGlass } from "@/components/crm/input-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { FormDialog } from "@/components/ui/form-dialog";
import {
  useQuickReplies,
  useQuickReplyGroups,
  useCreateQuickReply,
  useDeleteQuickReply,
  type QuickReply,
  type QuickReplyGroup,
} from "../hooks/use-quick-replies";

// ─── Collapsible group section ───────────────────────────────────────────────
// TODO: componente Accordion não existe no DS V2

function GroupSection({
  label,
  count,
  items,
  onDelete,
  deleteId,
}: {
  label: string;
  count: number;
  items: QuickReply[];
  onDelete: (id: string) => void;
  deleteId: string | null;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div className="border-b border-[var(--glass-border-subtle)] last:border-0">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-overlay)]"
      >
        {open ? (
          <IconChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" />
        ) : (
          <IconChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
        )}
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--glass-bg-strong)] px-1 font-display text-[10px] font-bold text-[var(--text-muted)]">
          {count}
        </span>
      </button>

      {/* Items */}
      {open && (
        <div className="divide-y divide-[var(--glass-border-subtle)]">
          {items.map((reply) => (
            <div
              key={reply.id}
              className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--glass-bg-overlay)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                    {reply.title}
                  </span>
                  {reply.attachmentUrl && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.5 font-body text-[10px] text-[var(--text-muted)]">
                      📎 Anexo
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 font-body text-[12px] text-[var(--text-muted)]">
                  {reply.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(reply.id)}
                disabled={deleteId === reply.id}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] group-hover:opacity-100 disabled:opacity-30"
                aria-label="Excluir mensagem rápida"
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

const MEDIA_ACCEPT_QR = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";

export function CreateQuickReplyModal({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: QuickReplyGroup[];
}) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [groupId, setGroupId] = React.useState<string>("");
  const [attachmentUrl, setAttachmentUrl] = React.useState<string | null>(null);
  const [attachmentName, setAttachmentName] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const createMutation = useCreateQuickReply();

  function handleClose() {
    setTitle("");
    setContent("");
    setGroupId("");
    setAttachmentUrl(null);
    setAttachmentName(null);
    onClose();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.warning("Arquivo excede o limite de 16 MB.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/uploads/automation-media"), { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Erro ao enviar arquivo."); return; }
      setAttachmentUrl(data.url);
      setAttachmentName(data.fileName ?? file.name);
    } catch {
      toast.error("Erro de rede ao enviar arquivo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    createMutation.mutate(
      { title: title.trim(), content: content.trim(), groupId: groupId || null, attachmentUrl: attachmentUrl || null },
      { onSuccess: handleClose },
    );
  }

  const canSubmit = title.trim().length > 0 && content.trim().length > 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      busy={createMutation.isPending}
      size="md"
      icon={<IconBolt size={18} className="text-[var(--brand-primary)]" />}
      title="Nova mensagem rápida"
      footer={
        <>
          <button type="button" onClick={handleClose}
            className="rounded-[var(--radius-md)] border border-[var(--glass-border)] px-4 py-2 font-display text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)]">
            Cancelar
          </button>
          <ButtonGlass type="submit" form="new-quick-msg-form" variant="primary" disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? "Criando…" : "Criar"}
          </ButtonGlass>
        </>
      }
    >
      <form id="new-quick-msg-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="mb-1.5 block font-display text-[12px] font-semibold text-[var(--text-secondary)]">
              Título
            </label>
            <InputGlass
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Saudação inicial…"
              autoFocus
            />
          </div>

          {/* Content */}
          <div>
            <label className="mb-1.5 block font-display text-[12px] font-semibold text-[var(--text-secondary)]">
              Conteúdo
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Olá! Como posso ajudar?"
              rows={4}
              className={cn(
                "w-full resize-none rounded-[var(--radius-md)] border border-[var(--glass-border)]",
                "bg-[var(--glass-bg-overlay)] px-3 py-2.5",
                "font-body text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]",
              )}
            />
          </div>

          {/* Group */}
          <div>
            <label className="mb-1.5 block font-display text-[12px] font-semibold text-[var(--text-secondary)]">
              Grupo
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className={cn(
                "w-full rounded-[var(--radius-md)] border border-[var(--glass-border)]",
                "bg-[var(--glass-bg-overlay)] px-3 py-2.5",
                "font-body text-[13px] text-[var(--text-primary)]",
                "focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]",
              )}
            >
              <option value="">Sem grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Media attachment */}
          <div>
            <label className="mb-1.5 block font-display text-[12px] font-semibold text-[var(--text-secondary)]">
              Anexar arquivo (imagem/vídeo)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT_QR}
              onChange={handleFileChange}
              className="hidden"
            />
            {attachmentUrl && attachmentName ? (
              <div className={cn(
                "flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)]",
                "bg-[var(--glass-bg-overlay)] px-3 py-2",
              )}>
                <IconPaperclip size={15} className="shrink-0 text-[var(--brand-primary)]" />
                <span className="min-w-0 flex-1 truncate font-body text-[12px] text-[var(--text-primary)]">
                  {attachmentName}
                </span>
                <button
                  type="button"
                  onClick={() => { setAttachmentUrl(null); setAttachmentName(null); }}
                  className="shrink-0 rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                  aria-label="Remover arquivo"
                >
                  <IconX size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)]",
                  "bg-[var(--glass-bg-overlay)] px-3 py-2.5",
                  "font-body text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                  "focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {uploading ? (
                  <><IconLoader2 size={15} className="animate-spin" /> Enviando…</>
                ) : (
                  <><IconPaperclip size={15} /> Selecionar arquivo</>
                )}
              </button>
            )}
            <p className="mt-1 font-body text-[11px] text-[var(--text-muted)]">
              Aceita: JPG, PNG, WEBP, GIF, MP4, WEBM — máx. 16 MB. Opcional.
            </p>
          </div>

      </form>
    </FormDialog>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function QuickMessagesTab() {
  const [rawSearch, setRawSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // 300ms debounce on search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(rawSearch), 300);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const { data: replies = [], isLoading } = useQuickReplies(debouncedSearch);
  const { data: groups = [] } = useQuickReplyGroups();
  const deleteMutation = useDeleteQuickReply();

  function handleDelete(id: string) {
    setDeletingId(id);
    deleteMutation.mutate(id, {
      onSettled: () => setDeletingId(null),
    });
  }

  // Group replies by groupId
  const grouped = React.useMemo(() => {
    const byGroup = new Map<string | null, QuickReply[]>();
    for (const reply of replies) {
      const key = reply.groupId ?? null;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(reply);
    }
    return byGroup;
  }, [replies]);

  const ungrouped = grouped.get(null) ?? [];

  // Groups that have replies (or all groups if not searching)
  const activeGroups = groups.filter(
    (g) => (grouped.get(g.id) ?? []).length > 0,
  );

  const hasAnyReplies = replies.length > 0;

  return (
    <>
      <GlassCard variant="panel" className="overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 border-b border-[var(--glass-border-subtle)] p-4">
          <div className="flex-1">
            <InputGlass
              withSearch
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Buscar mensagem rápida…"
              className="max-w-xs"
            />
          </div>
          <ButtonGlass
            variant="primary"
            size="sm"
            onClick={() => setShowCreate(true)}
            className="shrink-0 gap-1.5"
          >
            <IconPlus size={14} />
            Nova mensagem
          </ButtonGlass>
        </div>

        {/* ── Body ── */}
        {isLoading ? (
          <div className="space-y-px p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--glass-bg-strong)]"
              />
            ))}
          </div>
        ) : !hasAnyReplies ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <IconBolt size={32} className="text-[var(--text-muted)] opacity-40" />
            <p className="font-display text-sm font-semibold text-[var(--text-muted)]">
              Nenhuma mensagem rápida. Crie a primeira.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="font-display text-xs text-[var(--brand-primary)] hover:underline"
            >
              Criar mensagem rápida
            </button>
          </div>
        ) : (
          <div>
            {/* Named groups */}
            {activeGroups.map((group) => (
              <GroupSection
                key={group.id}
                label={group.name}
                count={(grouped.get(group.id) ?? []).length}
                items={grouped.get(group.id) ?? []}
                onDelete={handleDelete}
                deleteId={deletingId}
              />
            ))}

            {/* Ungrouped */}
            {ungrouped.length > 0 && (
              <GroupSection
                label="Sem grupo"
                count={ungrouped.length}
                items={ungrouped}
                onDelete={handleDelete}
                deleteId={deletingId}
              />
            )}
          </div>
        )}
      </GlassCard>

      {/* ── Create modal ── */}
      <CreateQuickReplyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        groups={groups}
      />
    </>
  );
}
