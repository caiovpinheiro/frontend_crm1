"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconArrowLeft as ArrowLeft, IconCopy as Copy, IconFileText as FileText, IconStack as Layers, IconLoader2 as Loader2, IconMessage as MessageSquare, IconPaperclip as Paperclip, IconPencil as Pencil, IconPlus as Plus, IconTrash as Trash2, IconVariable as Variable, IconX as XIcon } from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { Skeleton } from "@/components/ui/skeleton";
import { InternalTemplateVariablePicker } from "@/components/templates/internal-template-variable-picker";
import { PageTourButton } from "@/features/product-tour";
import { cn } from "@/lib/utils";
import {
  HubChip,
  HubPanel,
  HubStat,
  HubStatGrid,
  HubSubHeader,
  HubToolbar,
} from "./message-models/hub-ui";

type TemplateAttachment = {
  url: string;
  mimeType?: string | null;
  name?: string | null;
  /** Texto enviado ANTES deste arquivo (só faz sentido para índice >= 1). */
  messageBefore?: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  content: string;
  category: string | null;
  language: string;
  status: string;
  channelType: string | null;
  updatedAt: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  attachments?: TemplateAttachment[] | null;
};

const MAX_TEMPLATE_ATTACHMENTS = 5;

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  EMAIL: "E-mail",
};

async function fetchTemplates(): Promise<TemplateRow[]> {
  const res = await fetch(apiUrl("/api/templates"));
  if (!res.ok) throw new Error("Erro ao carregar templates");
  return res.json();
}

export default function TemplatesSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TemplateRow | null>(null);

  React.useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    queueMicrotask(() => {
      setEditing(null);
      setFormOpen(true);
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("new");
      const qs = sp.toString();
      router.replace(qs ? `/old/settings/message-models?${qs}` : "/old/settings/message-models?tab=internal");
    });
  }, [router, searchParams]);

  const { data: templates = [], isLoading, isError } = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; content: string; category?: string; language?: string; channelType?: string; mediaUrl?: string | null; mediaType?: string | null; mediaName?: string | null; attachments?: TemplateAttachment[] }) => {
      const res = await fetch(apiUrl("/api/templates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? "Erro ao criar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name: string; content: string; category?: string; language?: string; channelType?: string | null; mediaUrl?: string | null; mediaType?: string | null; mediaName?: string | null; attachments?: TemplateAttachment[] }) => {
      const res = await fetch(apiUrl(`/api/templates/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao atualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setEditing(null);
      setFormOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/templates/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const [query, setQuery] = React.useState("");
  const [catFilter, setCatFilter] = React.useState<string>("all");

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) set.add(t.category?.trim() || "Sem categoria");
    return [...set];
  }, [templates]);

  const withVariables = React.useMemo(
    () => templates.filter((t) => /\{\{.*?\}\}/.test(t.content ?? "")).length,
    [templates],
  );
  const distinctChannels = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) if (t.channelType) set.add(t.channelType);
    return set.size;
  }, [templates]);

  const grouped = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = templates.filter((t) => {
      const cat = t.category?.trim() || "Sem categoria";
      const okC = catFilter === "all" || cat === catFilter;
      const okQ =
        !q || t.name.toLowerCase().includes(q) || (t.content ?? "").toLowerCase().includes(q);
      return okC && okQ;
    });
    const map = new Map<string, TemplateRow[]>();
    for (const t of filtered) {
      const cat = t.category?.trim() || "Sem categoria";
      const arr = map.get(cat) ?? [];
      arr.push(t);
      map.set(cat, arr);
    }
    return [...map.entries()];
  }, [templates, query, catFilter]);

  return (
    <div className={embedded ? "min-w-0 w-full max-w-full space-y-3 sm:space-y-4" : "min-w-0 w-full space-y-6"}>
      {embedded ? null : (
        <>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="size-4" /> Configurações
          </Link>

          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-[20px] font-extrabold tracking-tight text-[var(--text-primary)]">Modelos internos de mensagem</h1>
              <p className="mt-0.5 font-body text-[13px] text-[var(--text-muted)]">
                Mensagens prontas guardadas no CRM, usadas como atalho de resposta nas conversas. Use{" "}
                <code className="rounded-[var(--radius-sm)] bg-[var(--glass-bg-strong)] px-1 font-mono text-xs">{"{{variável}}"}</code>{" "}
                para campos dinâmicos.
              </p>
            </div>
            <ButtonGlass variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2 shrink-0">
              <Plus className="size-4" /> Novo modelo
            </ButtonGlass>
          </div>
        </>
      )}

      {embedded ? (
        <HubSubHeader
          icon={<FileText className="size-[22px]" />}
          title="Modelos internos de mensagem"
          actions={
            <ButtonGlass type="button" variant="primary" size="sm" data-tour="models-internal-new" onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5">
              <Plus className="size-4" />
              Nova mensagem interna
            </ButtonGlass>
          }
        >
          Mensagens prontas e reutilizáveis em qualquer canal do CRM — atalhos de resposta para
          agilizar o atendimento. Use{" "}
          <code className="rounded-[var(--radius-sm)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
            {"{{variável}}"}
          </code>{" "}
          para inserir campos dinâmicos do contato e do negócio (ex.:{" "}
          <code className="rounded-[var(--radius-sm)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
            {"{{nome}}"}
          </code>
          ).
        </HubSubHeader>
      ) : null}

      <div data-tour="models-internal-stats">
      <HubStatGrid mobileCompact>
        <HubStat mobileCompact tone="brand" icon={<FileText className="size-5" />} value={templates.length} label="Modelos internos" />
        <HubStat mobileCompact tone="violet" icon={<Layers className="size-5" />} value={categories.length} label="Categorias" />
        <HubStat mobileCompact tone="warn" icon={<Variable className="size-5" />} value={withVariables} label="Com variáveis" />
        <HubStat mobileCompact tone="success" icon={<MessageSquare className="size-5" />} value={distinctChannels} label="Canais usados" />
      </HubStatGrid>
      </div>

      <div data-tour="models-internal-list" className="space-y-3">
      <HubPanel>
        <HubToolbar
          searchValue={query}
          onSearchChange={setQuery}
          placeholder="Buscar por nome ou conteúdo..."
        >
          <HubChip active={catFilter === "all"} onClick={() => setCatFilter("all")} count={templates.length}>
            Todos
          </HubChip>
          {categories.map((c) => (
            <HubChip
              key={c}
              active={catFilter === c}
              onClick={() => setCatFilter(c)}
              count={templates.filter((t) => (t.category?.trim() || "Sem categoria") === c).length}
            >
              {c}
            </HubChip>
          ))}
        </HubToolbar>
      </HubPanel>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)]"
            >
              <Skeleton className="size-9 shrink-0 rounded-[var(--radius-md)]" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40 max-w-full rounded-[var(--radius-sm)]" />
                <Skeleton className="h-3 w-64 max-w-full rounded-[var(--radius-sm)]" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <HubPanel className="flex flex-col items-center gap-2.5 px-5 py-14 text-center">
          <FileText className="size-10 text-[var(--color-danger)]" />
          <div className="font-bold text-[var(--color-danger-text)]">Erro ao carregar os modelos internos</div>
          <div className="text-[13px] text-[var(--text-muted)]">
            O servidor retornou erro (não é lista vazia). Se acabou de sair um deploy,
            pode haver migração de banco pendente. Recarregue em instantes.
          </div>
        </HubPanel>
      ) : grouped.length === 0 ? (
        <HubPanel className="flex flex-col items-center gap-2.5 px-5 py-14 text-center">
          <FileText className="size-10 text-[var(--glass-border)]" />
          <div className="font-bold text-[var(--text-secondary)]">Nenhum modelo encontrado</div>
          <div className="text-[13px] text-[var(--text-muted)]">Tente outra busca ou crie um novo modelo interno.</div>
          <ButtonGlass onClick={() => { setEditing(null); setFormOpen(true); }} className="mt-2 gap-1.5">
            <Plus className="size-4" /> Novo modelo
          </ButtonGlass>
        </HubPanel>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(([cat, items]) => (
            <div key={cat} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 px-1">
                <span className={cn("flex size-[26px] shrink-0 items-center justify-center rounded-[var(--radius-sm)]", categoryBadgeClass(cat))}>
                  <FileText className="size-[14px]" />
                </span>
                <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">{cat}</span>
                <span className="rounded-[var(--radius-full)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-2 py-px text-[11px] font-bold text-[var(--text-muted)]">
                  {items.length}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => { setEditing(null); setFormOpen(true); }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[12px] font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-enterprise-bg)]"
                >
                  <Plus className="size-3.5" /> Novo
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((t) => (
                  <InternalTemplateCard
                    key={t.id}
                    template={t}
                    category={cat}
                    onEdit={() => { setEditing(t); setFormOpen(true); }}
                    onDelete={() => deleteMutation.mutate(t.id)}
                    deleting={deleteMutation.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) { setFormOpen(false); setEditing(null); } else setFormOpen(true); }}>
        <DialogContent
          size="lg"
          panelClassName="max-w-[min(40rem,calc(100vw-1.25rem))]"
          bodyClassName="gap-3 overflow-x-hidden p-4 sm:gap-4 sm:p-6"
        >
          <DialogClose />
          <DialogHeader className="pr-10">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle>{editing ? "Editar Template" : "Novo Template"}</DialogTitle>
              {!editing ? <PageTourButton tourId="message-models-internal-create" size="sm" /> : null}
            </div>
          </DialogHeader>
          {/* `key` força remount ao trocar criar↔editar: o form só lê
              `initial` no useState do mount; sem key, reabrir "Editar"
              após "Novo" (ou Dialog que mantém o conteúdo montado) deixa
              os campos vazios com o título "Editar Template". */}
          <TemplateForm
            key={editing?.id ?? "new"}
            initial={editing}
            onSubmit={(data) => {
              if (editing) {
                updateMutation.mutate({ id: editing.id, ...data });
              } else {
                createMutation.mutate(data);
              }
            }}
            isPending={createMutation.isPending || updateMutation.isPending}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MEDIA_ACCEPT_TEMPLATE = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";

function TemplateForm({
  initial,
  onSubmit,
  isPending,
  onCancel,
}: {
  initial: TemplateRow | null;
  onSubmit: (data: { name: string; content: string; category?: string; language?: string; channelType?: string; mediaUrl?: string | null; mediaType?: string | null; mediaName?: string | null; attachments: TemplateAttachment[] }) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [content, setContent] = React.useState(initial?.content ?? "");
  const [category, setCategory] = React.useState(initial?.category ?? "");
  const [channelType, setChannelType] = React.useState(initial?.channelType ?? "");
  const language = initial?.language ?? "pt_BR";
  const contentRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Anexos do modelo — array (máx. `MAX_TEMPLATE_ATTACHMENTS`). Inicializa de
  // `initial.attachments` quando presente; senão cai no mediaUrl legado
  // (templates antigos, criados antes do multi-anexo).
  const [attachments, setAttachments] = React.useState<TemplateAttachment[]>(() => {
    if (initial?.attachments && initial.attachments.length > 0) return initial.attachments;
    if (initial?.mediaUrl) {
      return [{ url: initial.mediaUrl, mimeType: initial.mediaType ?? null, name: initial.mediaName ?? null }];
    }
    return [];
  });
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setAttachments((prev) => [
        ...prev,
        { url: data.url, mimeType: data.mimeType, name: data.fileName ?? file.name },
      ]);
    } catch {
      toast.error("Erro de rede ao enviar arquivo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMessageBefore = (index: number, text: string) => {
    setAttachments((prev) =>
      prev.map((att, i) => (i === index ? { ...att, messageBefore: text } : att)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    const first = attachments[0] ?? null;
    onSubmit({
      name: name.trim(),
      content: content.trim(),
      category: category.trim() || undefined,
      language,
      channelType: channelType || undefined,
      mediaUrl: first?.url ?? null,
      mediaType: first?.mimeType ?? null,
      mediaName: first?.name ?? null,
      attachments,
    });
  };

  // Insere o token na posição do cursor da textarea — preserva o que
  // já foi digitado e move o cursor pro fim do token inserido.
  const insertToken = (token: string) => {
    const el = contentRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const next = content.slice(0, start) + token + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + token.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 w-full space-y-3 sm:space-y-4">
      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5" data-tour="internal-create-name">
          <label htmlFor="tpl-name" className={FIELD_LABEL_CLASS}>
            Nome do modelo
          </label>
          <InputGlass
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: Boas-vindas, Pós-venda"
            required
            className="min-w-0 max-w-full"
          />
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2" data-tour="internal-create-meta">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="tpl-category" className={FIELD_LABEL_CLASS}>
              Categoria
            </label>
            <InputGlass
              id="tpl-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Vendas, Suporte…"
              className="min-w-0 max-w-full"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className={FIELD_LABEL_CLASS}>Canal</label>
            <DropdownGlass
              options={[
                { value: "", label: "Todos os canais" },
                { value: "WHATSAPP", label: "WhatsApp" },
                { value: "INSTAGRAM", label: "Instagram" },
                { value: "FACEBOOK", label: "Facebook" },
                { value: "EMAIL", label: "E-mail" },
              ]}
              value={channelType}
              onValueChange={(v) => setChannelType(v)}
              triggerClassName="w-full min-w-0 max-w-full"
            />
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-1.5" data-tour="internal-create-body">
            <label htmlFor="tpl-content" className={FIELD_LABEL_CLASS}>
              Mensagem
            </label>
            <textarea
              id="tpl-content"
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Olá {{contato.primeiroNome}}, tudo bem? Vi seu interesse no negócio {{negocio.titulo}}..."
              rows={5}
              required
              className="min-h-[120px] w-full min-w-0 max-w-full resize-y rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2.5 font-body text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/10 sm:px-3.5"
            />
            <p className="text-pretty break-words font-body text-[11.5px] leading-snug text-[var(--text-muted)]">
              Clique numa variável abaixo para inserir no cursor — o CRM substitui pelo valor real na hora de enviar.
            </p>
          </div>

          <InternalTemplateVariablePicker onSelect={insertToken} defaultOpen={false} />
        </div>

        <div className="min-w-0">
          <InternalTemplatePreview name={name} content={content} channelType={channelType} attachments={attachments} />
        </div>
      </div>

      {/* Media upload */}
      <div className="flex min-w-0 flex-col gap-1.5" data-tour="internal-create-files">
        <label className={FIELD_LABEL_CLASS}>Anexar arquivo (imagem/vídeo)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept={MEDIA_ACCEPT_TEMPLATE}
          onChange={handleFileChange}
          className="hidden"
        />
        {attachments.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {attachments.map((att, i) => (
              <React.Fragment key={`${att.url}-${i}`}>
                {i >= 1 ? (
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor={`tpl-msg-before-${i}`} className={FIELD_LABEL_CLASS}>
                      {i + 1}° mensagem
                    </label>
                    <textarea
                      id={`tpl-msg-before-${i}`}
                      value={att.messageBefore ?? ""}
                      onChange={(e) => updateMessageBefore(i, e.target.value)}
                      placeholder="Texto opcional enviado antes deste arquivo…"
                      rows={2}
                      className="min-h-[52px] w-full min-w-0 max-w-full resize-y rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2 font-body text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/10"
                    />
                  </div>
                ) : null}
                <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2">
                  <Paperclip className="size-4 shrink-0 text-[var(--brand-primary)]" />
                  <span className="min-w-0 flex-1 truncate font-body text-[12px] text-[var(--text-primary)]">
                    {att.name || att.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="shrink-0 rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                    aria-label="Remover arquivo"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : null}
        {attachments.length > 1 ? (
          <p className="font-body text-[11px] text-[var(--text-muted)]">
            A 2ª mensagem é enviada antes do 2º arquivo, e assim por diante.
          </p>
        ) : null}
        {attachments.length < MAX_TEMPLATE_ATTACHMENTS ? (
          <ButtonGlass
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full justify-start gap-2 text-[13px]"
          >
            {uploading ? (
              <><Loader2 className="size-4 animate-spin" /> Enviando…</>
            ) : attachments.length === 0 ? (
              <><Paperclip className="size-4" /> Selecionar arquivo</>
            ) : (
              <><Plus className="size-4" /> Novo arquivo</>
            )}
          </ButtonGlass>
        ) : null}
        <p className="font-body text-[11px] text-[var(--text-muted)]">
          Até {MAX_TEMPLATE_ATTACHMENTS} arquivos. Aceita: JPG, PNG, WEBP, GIF, MP4, WEBM — máx. 16 MB cada.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--glass-border-subtle)] pt-3 sm:pt-4">
        <ButtonGlass type="button" onClick={onCancel}>Cancelar</ButtonGlass>
        <ButtonGlass type="submit" variant="primary" disabled={isPending || !name.trim() || !content.trim()} className="gap-2" data-tour="internal-create-submit">
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {initial ? "Salvar" : "Criar"}
        </ButtonGlass>
      </div>
    </form>
  );
}

/** Rótulo padrão dos campos do form — mesma escala usada em todo o hub
 * (Modelos de mensagem) e no assistente de templates WhatsApp/Meta. */
const FIELD_LABEL_CLASS =
  "font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]";

/**
 * Pré-visualização em tempo real do modelo interno (espelha o padrão já
 * usado no assistente de templates WhatsApp/Meta — `WhatsappTemplatePreview`
 * em `whatsapp-templates.tsx` — porém em bolha neutra, já que o modelo
 * interno pode ser usado em qualquer canal).
 */
function InternalTemplatePreview({
  name,
  content,
  channelType,
  attachments,
}: {
  name: string;
  content: string;
  channelType: string;
  attachments: TemplateAttachment[];
}) {
  const channelLabel = channelType ? CHANNEL_LABELS[channelType] ?? channelType : "Todos os canais";
  return (
    <aside aria-label="Pré-visualização da mensagem" className="min-w-0 space-y-2">
      <p className={FIELD_LABEL_CLASS}>Pré-visualização</p>
      <div className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow-sm)]">
        <div className="flex min-w-0 items-center gap-2 border-b border-[var(--glass-border-subtle)] px-3 py-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
            <FileText className="size-3.5" />
          </span>
          <span className="min-w-0 truncate text-[12px] font-bold text-[var(--text-primary)]">
            {name.trim() || "Novo modelo"}
          </span>
        </div>
        {/* Sequência de envio: 1ª mensagem (`content`) → Arquivo 1 →
            (2ª mensagem / messageBefore) → Arquivo 2 → … */}
        <div className="min-w-0 max-h-[360px] space-y-2.5 overflow-y-auto p-3">
          <PreviewMessageBlock label="1ª mensagem" text={content} />
          {attachments.map((att, i) => (
            <React.Fragment key={`${att.url}-${i}`}>
              {i >= 1 ? (
                <PreviewMessageBlock label={`${i + 1}ª mensagem`} text={att.messageBefore ?? ""} />
              ) : null}
              <PreviewAttachmentBlock label={`Arquivo ${i + 1}`} attachment={att} />
            </React.Fragment>
          ))}
        </div>
        <div className="border-t border-[var(--glass-border-subtle)] px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
          {channelLabel}
        </div>
      </div>
    </aside>
  );
}

function PreviewMessageBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">{label}</p>
      <div className="break-words whitespace-pre-wrap rounded-xl rounded-tl-sm bg-[var(--glass-bg-strong)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)] shadow-sm">
        {text.trim() ? (
          highlightVars(text)
        ) : (
          <span className="text-[var(--text-muted)] opacity-60">— sem texto —</span>
        )}
      </div>
    </div>
  );
}

function PreviewAttachmentBlock({ label, attachment }: { label: string; attachment: TemplateAttachment }) {
  const fileName = attachment.name || attachment.url || "Arquivo";
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">{label}</p>
      <div className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]">
          <FileText className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-[12px] font-medium text-[var(--text-primary)]">{fileName}</p>
          <p className="truncate font-body text-[10px] text-[var(--text-muted)]">Anexo · será enviado nesta ordem</p>
        </div>
      </div>
    </div>
  );
}

function highlightVars(content: string): React.ReactNode {
  const parts = content.split(/(\{\{.*?\}\})/g);
  return parts.map((p, i) =>
    /^\{\{.*\}\}$/.test(p) ? (
      <span
        key={i}
        className="rounded-[var(--radius-sm)] bg-[var(--color-enterprise-bg)] px-1 font-mono text-[11.5px] text-[var(--brand-primary-dark)]"
      >
        {p}
      </span>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  );
}

/**
 * Paleta categórica derivada dos tokens semânticos existentes do DS
 * (sem hex novos). Cada categoria recebe uma cor estável via hash do
 * nome; "Sem categoria" fica neutra. O badge combina fundo suave +
 * ícone na cor da categoria — usado no header do grupo e no item.
 */
const CATEGORY_BADGE_TONES = [
  "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
  "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  "bg-[color-mix(in_srgb,var(--brand-secondary)_18%,transparent)] text-[var(--brand-secondary)]",
  "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]",
];

const CATEGORY_BADGE_NEUTRAL = "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]";

function categoryBadgeClass(category: string): string {
  if (category === "Sem categoria") return CATEGORY_BADGE_NEUTRAL;
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_BADGE_TONES[hash % CATEGORY_BADGE_TONES.length];
}

/**
 * Card individual de um modelo interno (variação "Lista compacta").
 * Ícone em badge suave (cor da categoria) + título + preview com chips
 * {{...}} inline (via `highlightVars`); à direita, canal + "Atualizado
 * há X" e o botão "Copiar". Editar/Excluir surgem no hover.
 */
function InternalTemplateCard({
  template,
  category,
  onEdit,
  onDelete,
  deleting,
}: {
  template: TemplateRow;
  category: string;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const channel = template.channelType ? CHANNEL_LABELS[template.channelType] ?? template.channelType : null;
  const updated = template.updatedAt
    ? formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true, locale: ptBR })
    : null;

  return (
    <div className="group flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3.5 py-3 shadow-[var(--glass-shadow-sm)] transition-all hover:border-[var(--input-border-focus)] hover:shadow-[var(--glass-shadow)] sm:px-4">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]", categoryBadgeClass(category))}>
        <FileText className="size-[17px]" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold leading-tight text-[var(--text-primary)]">{template.name}</div>
        <div className="mt-0.5 truncate text-[12.5px] leading-tight text-[var(--text-secondary)]">
          {highlightVars(template.content ?? "")}
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
        <span className="text-[11.5px] font-semibold text-[var(--text-muted)]">{channel ?? "Todos os canais"}</span>
        {updated ? <span className="text-[11px] text-[var(--text-muted)]">Atualizado {updated}</span> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(template.content ?? "");
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
        >
          <Copy className="size-3.5" /> Copiar
        </button>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            aria-label="Editar"
            onClick={onEdit}
            className="flex size-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
          >
            <Pencil className="size-[15px]" />
          </button>
          <button
            type="button"
            aria-label="Excluir"
            onClick={onDelete}
            disabled={deleting}
            className="flex size-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] disabled:opacity-50"
          >
            <Trash2 className="size-[15px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

