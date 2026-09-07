"use client";

import {
  IconAlertCircle as AlertCircle,
  IconCircleCheck as CheckCircle2,
  IconEye as Eye,
  IconFileText as FileText,
  IconLoader2 as Loader2,
  IconPencil as Pencil,
  IconPlus as Plus,
  IconRefresh as RefreshCcw,
  IconTrash as Trash2,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { PaginationGlass } from "@/components/crm/pagination-glass";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import {
  CARD_SURFACE_CLASS,
  LIST_ACTIONS_CELL_CLASS,
  LIST_ACTIONS_TRACK,
  LIST_CARD_HEAD_STATIC_CLASS,
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
  ListColumnLabel,
} from "@/components/crm/sortable-header";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, parseApiResponse } from "@/lib/api";

type KnowledgeStatus = "PENDING" | "INDEXING" | "READY" | "FAILED";

type KnowledgeDoc = {
  id: string;
  title: string;
  source: string;
  mimeType: string | null;
  sizeBytes: number;
  status: KnowledgeStatus;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};

type KnowledgeDocDetail = KnowledgeDoc & {
  content: string | null;
  /** Texto remontado dos trechos (doc anterior à coluna `content`). */
  contentReconstructed: boolean;
};

type KnowledgeList = {
  items: KnowledgeDoc[];
  total: number;
  page: number;
  perPage: number;
};

const MAX_CONTENT_CHARS = 500_000;

/**
 * Colunas da lista. `LIST_ACTIONS_TRACK` mantém o cabeçalho e as linhas
 * resolvendo a coluna de ações com a mesma largura.
 */
const GRID_TEMPLATE = `minmax(0,1fr) 7rem 8.5rem 6rem 6.5rem 7.5rem ${LIST_ACTIONS_TRACK}`;

/**
 * Painel da base de conhecimento do agente — o operador vê, cria, edita e
 * remove os documentos que o agente consulta ao responder.
 *
 * Documento em fila ou processando faz a lista se auto-atualizar a cada 2s
 * até virar Pronto ou Falhou; o motivo da falha aparece na própria linha.
 */
export function KnowledgePanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(25);
  const [creating, setCreating] = React.useState(false);
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formToken, setFormToken] = React.useState(0);

  const openCreate = React.useCallback(() => {
    setFormToken((t) => t + 1);
    setEditingId(null);
    setCreating(true);
  }, []);

  const openEdit = React.useCallback((id: string) => {
    setFormToken((t) => t + 1);
    setCreating(false);
    setEditingId(id);
  }, []);

  // Debounce para não disparar uma request por tecla digitada.
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const listKey = ["ai-agent-knowledge", agentId, debouncedSearch, page, perPage];

  const { data, isLoading, isError } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await apiFetch(
        `/api/ai-agents/${agentId}/knowledge?${params.toString()}`,
      );
      return parseApiResponse<KnowledgeList>(
        res,
        "Não foi possível carregar os documentos.",
      );
    },
    refetchInterval: (q) => {
      const current = q.state.data as KnowledgeList | undefined;
      const busy = current?.items.some(
        (d) => d.status === "PENDING" || d.status === "INDEXING",
      );
      return busy ? 2000 : false;
    },
  });

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["ai-agent-knowledge", agentId],
    });
  }, [agentId, queryClient]);

  const deleteMut = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiFetch(
        `/api/ai-agents/${agentId}/knowledge/${docId}`,
        { method: "DELETE" },
      );
      await parseApiResponse(res, "Não foi possível excluir o documento.");
    },
    onSuccess: invalidate,
  });

  const reindexMut = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiFetch(
        `/api/ai-agents/${agentId}/knowledge/${docId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reindex" }),
        },
      );
      await parseApiResponse(res, "Não foi possível reprocessar o documento.");
    },
    onSuccess: invalidate,
  });

  const docs = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-xs text-muted-foreground">
          Documentos que o agente consulta antes de responder. Cole roteiros,
          perguntas frequentes e regras — o agente busca o trecho mais próximo
          da dúvida do cliente.
        </p>
        <ButtonGlass
          type="button"
          variant="primary"
          size="sm"
          onClick={openCreate}
        >
          <Plus className="size-3.5" />
          Novo documento
        </ButtonGlass>
      </div>

      <SearchFilterBar
        value={search}
        onChange={setSearch}
        withFilter={false}
        clearable
        placeholder="Buscar por título..."
        ariaLabel="Buscar documentos da base de conhecimento"
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando documentos...
        </div>
      ) : isError ? (
        <div className={`${CARD_SURFACE_CLASS} px-4 py-8 text-center`}>
          <p className="text-sm font-medium text-foreground">
            Não foi possível carregar os documentos.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recarregue a página e tente novamente.
          </p>
        </div>
      ) : docs.length === 0 ? (
        <div className={`${CARD_SURFACE_CLASS} px-4 py-10 text-center`}>
          <p className="text-sm font-medium text-foreground">
            {debouncedSearch
              ? "Nenhum documento com esse título."
              : "Nenhum documento cadastrado."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {debouncedSearch
              ? "Ajuste a busca para ver os demais."
              : "Sem documentos, o agente responde só com as instruções que você escreveu."}
          </p>
        </div>
      ) : (
        <div>
          <div
            className={LIST_CARD_HEAD_STATIC_CLASS}
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <ListColumnLabel>Documento</ListColumnLabel>
            <ListColumnLabel>Origem</ListColumnLabel>
            <ListColumnLabel>Situação</ListColumnLabel>
            <ListColumnLabel align="right">Trechos</ListColumnLabel>
            <ListColumnLabel align="right">Tamanho</ListColumnLabel>
            <ListColumnLabel align="right">Criado em</ListColumnLabel>
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          <div className={LIST_CARD_STACK_CLASS}>
            {docs.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                busy={deleteMut.isPending || reindexMut.isPending}
                onView={() => setViewingId(doc.id)}
                onEdit={() => openEdit(doc.id)}
                onReindex={() => reindexMut.mutate(doc.id)}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Excluir "${doc.title}"?`,
                    description:
                      "O agente deixa de consultar este documento. A ação não pode ser desfeita.",
                    confirmLabel: "Excluir",
                    destructive: true,
                  });
                  if (ok) deleteMut.mutate(doc.id);
                }}
              />
            ))}
          </div>

          {total > perPage && (
            <PaginationGlass
              total={total}
              entityLabel="documentos"
              page={page}
              lastPage={lastPage}
              canPrev={page > 1}
              canNext={page < lastPage}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
              perPage={perPage}
              onPerPageChange={(v) => {
                setPerPage(v);
                setPage(1);
              }}
            />
          )}
        </div>
      )}

      <DocFormDialog
        agentId={agentId}
        docId={editingId}
        open={creating || editingId !== null}
        openToken={formToken}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditingId(null);
          }
        }}
        onSaved={invalidate}
      />

      <DocViewDialog
        agentId={agentId}
        docId={viewingId}
        onOpenChange={(open) => {
          if (!open) setViewingId(null);
        }}
        onEdit={() => {
          if (viewingId) openEdit(viewingId);
          setViewingId(null);
        }}
      />

      {dialog}
    </div>
  );
}

function DocRow({
  doc,
  busy,
  onView,
  onEdit,
  onReindex,
  onDelete,
}: {
  doc: KnowledgeDoc;
  busy: boolean;
  onView: () => void;
  onEdit: () => void;
  onReindex: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`${LIST_CARD_ROW_CLASS} grid items-center gap-4`}
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {doc.title}
          </p>
          {doc.status === "FAILED" && doc.errorMessage ? (
            <p className="truncate text-[11px] text-destructive">
              {doc.errorMessage}
            </p>
          ) : doc.status === "PENDING" || doc.status === "INDEXING" ? (
            <p className="truncate text-[11px] text-muted-foreground">
              O agente ainda não usa este documento nas respostas.
            </p>
          ) : null}
        </div>
      </div>

      <span className="truncate text-[13px] text-muted-foreground">
        {sourceLabel(doc.source)}
      </span>

      <StatusBadge status={doc.status} />

      <span className="text-right text-[13px] tabular-nums text-muted-foreground">
        {doc.chunkCount.toLocaleString("pt-BR")}
      </span>
      <span className="text-right text-[13px] tabular-nums text-muted-foreground">
        {formatBytes(doc.sizeBytes)}
      </span>
      <span className="text-right text-[13px] tabular-nums text-muted-foreground">
        {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
      </span>

      <div className={LIST_ACTIONS_CELL_CLASS}>
        <ButtonGlass
          type="button"
          variant="icon"
          size="icon"
          title="Ver conteúdo"
          onClick={onView}
        >
          <Eye className="size-4" />
        </ButtonGlass>
        <ButtonGlass
          type="button"
          variant="icon"
          size="icon"
          title="Editar"
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </ButtonGlass>
        {doc.status === "FAILED" && (
          <ButtonGlass
            type="button"
            variant="icon"
            size="icon"
            title="Processar de novo"
            onClick={onReindex}
            disabled={busy}
          >
            <RefreshCcw className="size-4" />
          </ButtonGlass>
        )}
        <ButtonGlass
          type="button"
          variant="icon"
          size="icon"
          title="Excluir"
          className="text-destructive/70 hover:text-destructive"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="size-4" />
        </ButtonGlass>
      </div>
    </div>
  );
}

/** Criar (docId null) e editar compartilham o mesmo formulário. */
function DocFormDialog({
  agentId,
  docId,
  open,
  openToken,
  onOpenChange,
  onSaved,
}: {
  agentId: string;
  docId: string | null;
  open: boolean;
  /** Muda a cada abertura do modal — reseta o formulário. */
  openToken: number;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = docId !== null;
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["ai-agent-knowledge-doc", agentId, docId],
    enabled: open && isEdit,
    queryFn: async () => {
      const res = await apiFetch(
        `/api/ai-agents/${agentId}/knowledge/${docId}`,
      );
      return parseApiResponse<KnowledgeDocDetail>(
        res,
        "Não foi possível carregar o documento.",
      );
    },
  });

  // Preenche o formulário uma vez por abertura: `openToken` muda a cada
  // vez que o operador abre o modal, então reabrir o mesmo documento
  // descarta a edição anterior. Sem isso, um refetch em background
  // sobrescreveria o que está sendo digitado.
  const targetKey = !open
    ? null
    : isEdit
      ? detail
        ? `${openToken}:${detail.id}`
        : null
      : `${openToken}:new`;

  if (targetKey !== null && targetKey !== loadedKey) {
    setTitle(isEdit && detail ? detail.title : "");
    setContent(isEdit && detail ? (detail.content ?? "") : "");
    setError(null);
    setLoadedKey(targetKey);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      setError(null);
      const res = await apiFetch(
        isEdit
          ? `/api/ai-agents/${agentId}/knowledge/${docId}`
          : `/api/ai-agents/${agentId}/knowledge`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), content }),
        },
      );
      return parseApiResponse<KnowledgeDoc>(
        res,
        "Não foi possível salvar o documento.",
      );
    },
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const canSave =
    title.trim().length > 0 &&
    content.trim().length >= 10 &&
    content.length <= MAX_CONTENT_CHARS &&
    !saveMut.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      busy={saveMut.isPending}
      title={isEdit ? "Editar documento" : "Novo documento"}
      description={
        isEdit
          ? "Ao salvar o texto, o agente reaprende o documento do zero."
          : "Cole o texto que o agente deve consultar ao responder."
      }
      icon={
        <FormDialogIcon>
          <FileText className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={!canSave}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {isEdit ? "Salvar" : "Criar"}
          </ButtonGlass>
        </>
      }
    >
      {isEdit && isLoading ? (
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando documento...
        </div>
      ) : (
        <div className="space-y-4">
          {detail?.contentReconstructed && (
            <p className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              Este documento foi cadastrado antes de guardarmos o texto
              original. O que aparece aqui foi remontado a partir dos trechos e
              pode ter pequenas diferenças de espaçamento. Ao salvar, ele passa
              a ser a versão oficial.
            </p>
          )}

          <div>
            <span className={formLabelClass}>Título *</span>
            <InputGlass
              className={formControlClass}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Perguntas frequentes sobre matrícula"
            />
          </div>

          <div>
            <span className={formLabelClass}>Conteúdo *</span>
            <Textarea
              rows={16}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Cole aqui o texto do documento..."
              className="min-h-64 w-full resize-y rounded-xl border border-border bg-card px-3.5 py-2.5"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {content.length.toLocaleString("pt-BR")} de{" "}
              {MAX_CONTENT_CHARS.toLocaleString("pt-BR")} caracteres
            </p>
          </div>

          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </FormDialog>
  );
}

function DocViewDialog({
  agentId,
  docId,
  onOpenChange,
  onEdit,
}: {
  agentId: string;
  docId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const open = docId !== null;
  const { data: detail, isLoading } = useQuery({
    queryKey: ["ai-agent-knowledge-doc", agentId, docId],
    enabled: open,
    queryFn: async () => {
      const res = await apiFetch(
        `/api/ai-agents/${agentId}/knowledge/${docId}`,
      );
      return parseApiResponse<KnowledgeDocDetail>(
        res,
        "Não foi possível carregar o documento.",
      );
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={detail?.title ?? "Documento"}
      description={
        detail
          ? `${statusLabel(detail.status)} · ${detail.chunkCount.toLocaleString("pt-BR")} trecho(s) · ${formatBytes(detail.sizeBytes)}`
          : "Conteúdo que o agente consulta."
      }
      icon={
        <FormDialogIcon>
          <FileText className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            onClick={onEdit}
          >
            Editar
          </ButtonGlass>
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando conteúdo...
        </div>
      ) : (
        <div className="space-y-3">
          {detail?.status === "FAILED" && detail.errorMessage && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Não foi possível preparar este documento: {detail.errorMessage}
            </p>
          )}
          {(detail?.status === "PENDING" || detail?.status === "INDEXING") && (
            <p className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              Documento em preparação — o agente ainda não o usa nas respostas.
            </p>
          )}
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-border bg-card px-4 py-3">
            <pre className="whitespace-pre-wrap break-words font-body text-[13px] leading-relaxed text-foreground">
              {detail?.content?.trim() || "Documento sem texto."}
            </pre>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

function StatusBadge({ status }: { status: KnowledgeStatus }) {
  switch (status) {
    case "READY":
      return (
        <Badge
          variant="secondary"
          className="w-max gap-1 bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:bg-[var(--color-success-bg)]"
        >
          <CheckCircle2 className="size-3" /> Pronto
        </Badge>
      );
    case "FAILED":
      return (
        <Badge
          variant="secondary"
          className="w-max gap-1 bg-destructive/15 text-destructive hover:bg-destructive/15"
        >
          <AlertCircle className="size-3" /> Falhou
        </Badge>
      );
    case "INDEXING":
      return (
        <Badge variant="outline" className="w-max gap-1">
          <Loader2 className="size-3 animate-spin" /> Preparando
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="w-max gap-1">
          <RefreshCcw className="size-3" /> Na fila
        </Badge>
      );
  }
}

function statusLabel(status: KnowledgeStatus): string {
  switch (status) {
    case "READY":
      return "Pronto para uso";
    case "FAILED":
      return "Falhou";
    case "INDEXING":
      return "Preparando";
    default:
      return "Na fila";
  }
}

function sourceLabel(source: string): string {
  return source === "paste" ? "Texto colado" : "Arquivo";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
