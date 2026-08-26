"use client";

/**
 * Slash Command Menu — quando o operador digita "/" no composer do
 * inbox, este menu aparece listando atalhos de mensagem prontos:
 *
 *   - Modelos internos (`/api/templates`) — texto livre + variáveis dotted-path
 *     (`{{contato.nome}}`, `{{negocio.titulo}}`...) interpoladas client-side.
 *   - Templates WhatsApp (Meta WABA, `/api/whatsapp-template-configs/agent-enabled`)
 *     — disparam o `pendingTemplate` flow existente (preview + variáveis Meta
 *     + envio via Cloud API). Não inserem texto livre porque o canal exige
 *     fluxo aprovado.
 *
 * Quem fica responsável pelo quê:
 *   - `useSlashMenu` (hook abaixo) detecta abertura/fechamento, mantém a
 *     lista filtrada, gerencia índice ativo e aplica seleção. Devolve um
 *     `onKeyDown` que o composer chama ANTES dos handlers de envio/escape;
 *     ele retorna `true` quando consumiu o evento (Up/Down/Enter/Esc enquanto
 *     o menu está aberto).
 *   - `SlashCommandMenu` (componente) é puramente apresentação: recebe
 *     `state` + `onSelectItem`.
 *
 * Compat: o menu só abre quando "/" está no INÍCIO do draft ou após
 * whitespace, e fecha automaticamente assim que o token deixa de
 * existir (ex.: o usuário apaga). Isso preserva o comportamento atual
 * de quem digita "/" no meio de uma URL.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconBolt as Bolt,
  IconFileText as FileText,
  IconLoader2 as Loader2,
  IconMessageQuestion as MessageSquareQuote,
          IconMessage2,
  IconClipboardList as ClipboardList,
  IconSearch,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconX,
} from "@tabler/icons-react";

import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  interpolateInternalTemplate,
  type InternalTemplateContext,
} from "@/lib/internal-template-variables";
import type { OperatorVariableMeta } from "@/lib/meta-whatsapp/operator-template-variables";
import { fetchAgentAutomations } from "@/features/automations-v2/api";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type SlashItemKind =
  | "internal-template"
  | "quick-reply"
  | "meta-template"
  | "wa-flow"
  | "automation";

/** Metadados de destaque (favorito / uso) anexados a qualquer item. */
type SlashItemHighlight = {
  /** Marcado como favorito pelo agente (persistido por-usuário). */
  favorite?: boolean;
  /** Quantas vezes ESTE agente já usou o item (ordena os "mais usados"). */
  useCount?: number;
};

export type SlashItem = SlashItemHighlight &
  (   | {
      kind: "internal-template";
      id: string;
      name: string;
      content: string;
      category: string | null;
      channelType: string | null;
      mediaUrl: string | null;
      mediaName: string | null;
      attachments?: InternalAttachment[] | null;
    }
  | {
      kind: "quick-reply";
      id: string;
      name: string;
      content: string;
      category: string | null;
      attachmentUrl: string | null;
    }
  | {
      kind: "meta-template";
      id: string;
      name: string;
      label: string;
      bodyPreview: string;
      category: string | null;
      language: string;
      hasButtons: boolean;
      buttonTypes: string[];
      hasVariables: boolean;
      flowAction: string | null;
      flowId: string | null;
      operatorVariables: OperatorVariableMeta[] | null;
    }
  | {
      kind: "wa-flow";
      id: string;
      name: string;
    }
  | {
      kind: "automation";
      id: string;
      name: string;
      description: string | null;
      messagePreview: string | null;
      stepCount: number;
      category: string;
      categoryLabel: string;
    } );

export type SlashSelectionResult =
  | { kind: "insert-text"; text: string }
  | { kind: "open-meta-template"; item: Extract<SlashItem, { kind: "meta-template" }> };

// ─────────────────────────────────────────────────────────────────
// Detecção de "/" no draft
// ─────────────────────────────────────────────────────────────────

/**
 * Verifica se a posição do cursor está dentro de um token "/...".
 * Retorna `{ start, end, query }` se sim, `null` se não.
 *
 *   - "/abc|"          → { start: 0, end: 4, query: "abc" }
 *   - "oi /abc|"       → { start: 3, end: 7, query: "abc" }
 *   - "url://foo|"     → null  (depois de letra+":" não conta como atalho)
 *   - "  /  "          → null  (espaço quebra o token)
 */
export function detectSlashTokenAt(
  text: string,
  cursorPos: number,
): { start: number; end: number; query: string } | null {
  if (cursorPos < 1 || cursorPos > text.length) return null;
  // Walk backwards finding the slash that opens the token.
  let start = -1;
  for (let i = cursorPos - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "/") {
      // Verifica se o caractere anterior é início ou whitespace.
      const prev = i === 0 ? "" : text[i - 1];
      if (i === 0 || /\s/.test(prev)) {
        start = i;
        break;
      }
      return null;
    }
    if (/\s/.test(ch)) {
      // Quebrou o token sem achar "/".
      return null;
    }
  }
  if (start === -1) return null;
  // Walk forward from cursor pra achar o fim do token (até whitespace).
  let end = cursorPos;
  while (end < text.length && !/\s/.test(text[end])) end++;
  const query = text.slice(start + 1, end);
  return { start, end, query };
}

// ─────────────────────────────────────────────────────────────────
// Fetchers
// ─────────────────────────────────────────────────────────────────

type InternalAttachment = {
  url: string;
  name?: string | null;
  mimeType?: string | null;
  messageBefore?: string | null;
};

type InternalRow = {
  id: string;
  name: string;
  content: string;
  category: string | null;
  language?: string;
  status?: string;
  channelType: string | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  /** Multi-anexo (com messageBefore opcional a partir do 2º). */
  attachments?: InternalAttachment[] | null;
};
type QuickReplyRow = {
  id: string;
  title: string;
  content: string;
  attachmentUrl?: string | null;
  group?: { name?: string | null } | null;
};
type MetaRow = {
  id: string;
  metaTemplateId: string;
  metaTemplateName: string;
  label: string;
  agentEnabled?: boolean;
  language: string;
  category: string | null;
  bodyPreview: string;
  hasButtons?: boolean;
  hasVariables?: boolean;
  buttonTypes?: string[];
  flowAction?: string | null;
  flowId?: string | null;
  operatorVariables?: OperatorVariableMeta[] | null;
};

async function fetchInternalTemplates(): Promise<InternalRow[]> {
  const r = await fetch(apiUrl("/api/templates"));
  if (!r.ok) return [];
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function fetchMetaTemplates(channelId?: string | null): Promise<MetaRow[]> {
  const qs = channelId?.trim()
    ? `?channelId=${encodeURIComponent(channelId.trim())}`
    : "";
  const r = await fetch(apiUrl(`/api/whatsapp-template-configs/agent-enabled${qs}`));
  if (!r.ok) return [];
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function fetchQuickReplies(): Promise<QuickReplyRow[]> {
  const r = await fetch(apiUrl("/api/settings/quick-replies"));
  if (!r.ok) return [];
  const data = await r.json().catch(() => []);
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return list as QuickReplyRow[];
}

type PublishedFlowRow = {
  id: string;
  shortId?: string | null;
  name: string;
};

async function fetchPublishedFlows(): Promise<PublishedFlowRow[]> {
  const r = await fetch(apiUrl("/api/whatsapp-flow-definitions/published"));
  if (!r.ok) return [];
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? (data as PublishedFlowRow[]) : [];
}

async function sendWaFlowRequest(
  conversationId: string,
  flowDefinitionId: string,
): Promise<{ reopenedConversationId?: string }> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/flow`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flowDefinitionId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    reopenedConversationId?: string;
  };
  if (!res.ok) {
    throw new Error(typeof json?.message === "string" ? json.message : "Falha ao enviar formulário");
  }
  return { reopenedConversationId: json.reopenedConversationId };
}

/**
 * Dispara uma automação manual na conversa atual — mesmo mecanismo do
 * `AgentAutomationPickerModal` (POST /api/automations/:id/run com
 * contactId + conversationId). Usado quando o operador escolhe um item
 * da seção "Automações" no menu "/".
 */
async function runAutomationRequest(
  automationId: string,
  payload: { contactId: string; conversationId?: string | null },
): Promise<{ automationName?: string }> {
  const res = await fetch(apiUrl(`/api/automations/${automationId}/run`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contactId: payload.contactId,
      conversationId: payload.conversationId ?? undefined,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    automationName?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(typeof json?.message === "string" ? json.message : "Falha ao executar");
  }
  return { automationName: json.automationName };
}

// ─────────────────────────────────────────────────────────────────
// Busca (accent-insensitive) e preferências do agente (favoritos + uso)
// ─────────────────────────────────────────────────────────────────

/** Normaliza para busca accent-insensitive (igual ao resto do app). */
function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Título exibido/pesquisável de um item (meta usa label, senão o name). */
function slashItemTitle(item: SlashItem): string {
  return item.kind === "meta-template" ? item.label || item.name : item.name;
}

/** Tipos de item que suportam favorito/uso (automação fica de fora). */
type ShortcutKind = "internal-template" | "quick-reply" | "meta-template";

const SHORTCUT_KINDS: ReadonlySet<SlashItemKind> = new Set<SlashItemKind>([
  "internal-template",
  "quick-reply",
  "meta-template",
]);

type ShortcutRow = {
  itemKind: string;
  itemId: string;
  favorite: boolean;
  useCount: number;
};

type ShortcutPref = { favorite: boolean; useCount: number };

/** Chave estável no mapa de preferências. */
function shortcutKey(kind: SlashItemKind, id: string): string {
  return `${kind}:${id}`;
}

async function fetchAgentShortcuts(): Promise<ShortcutRow[]> {
  const r = await fetch(apiUrl("/api/slash-shortcuts"));
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return list as ShortcutRow[];
}

async function postAgentShortcut(payload: {
  action: "favorite" | "use";
  itemKind: ShortcutKind;
  itemId: string;
  favorite?: boolean;
}): Promise<ShortcutRow | null> {
  const r = await fetch(apiUrl("/api/slash-shortcuts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as ShortcutRow | null;
}

// ─────────────────────────────────────────────────────────────────
// Hook de estado
// ─────────────────────────────────────────────────────────────────

export type SlashMenuState = {
  open: boolean;
  /** Query EFETIVA aplicada ao filtro (campo da modal ou token "/..."). */
  query: string;
  /** Texto cru digitado no campo de busca da modal (controlado). */
  search: string;
  /** Lista plana já filtrada/ordenada que o componente renderiza. */
  items: SlashItem[];
  activeIndex: number;
  isLoading: boolean;
  /** Estado isolado da seção "Automações" (degradação graciosa). */
  automations: {
    /** Seção só aparece quando há conversa + contato. */
    visible: boolean;
    isLoading: boolean;
    isError: boolean;
  };
};

export type UseSlashMenuOptions = {
  draft: string;
  setDraft: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Contexto pra interpolação dos modelos internos. */
  templateContext?: InternalTemplateContext;
  /** Disparado quando o operador escolhe um template Meta — pai abre o flow. */
  onPickMetaTemplate: (item: Extract<SlashItem, { kind: "meta-template" }>) => void;
  /**
   * Quando fornecido, SUBSTITUI a ação padrão de selecionar um item
   * (inserir texto / abrir flow). O hook só remove o token "/..." do draft
   * e delega TODO o resto ao consumidor — usado pelo composer v2 para
   * ENVIAR direto o modelo/template. Aplica-se tanto a clique quanto a
   * teclado (Enter/Tab), mantendo o comportamento consistente.
   */
  onSelectOverride?: (item: SlashItem) => void;
  /**
   * Chamado quando o item escolhido tem mídia anexada (modelo interno ou
   * mensagem rápida). O composer usa isso para "encostar" o anexo que será
   * enviado junto com o texto no envio. Ignorado quando `onSelectOverride`
   * está definido (esse caminho cuida do envio por conta própria).
   */
  onInsertMedia?: (
    media:
      | { url: string; name: string | null; messageBefore?: string | null }
      | Array<{ url: string; name: string | null; messageBefore?: string | null }>,
  ) => void;
  /**
   * Conversa/contato atuais — necessários para a seção "Automações".
   * Quando ausentes, a seção fica oculta (não dá pra disparar automação
   * sem saber em qual contato/conversa aplicar).
   */
  conversationId?: string | null;
  contactId?: string | null;
  /** Canal Cloud API — filtra templates Meta da WABA correta. */
  channelId?: string | null;
  /** Desliga totalmente o atalho (ex.: modo nota, anexo pendente). */
  disabled?: boolean;
};

export function useSlashMenu({
  draft,
  setDraft,
  textareaRef,
  templateContext,
  onPickMetaTemplate,
  onSelectOverride,
  onInsertMedia,
  conversationId,
  contactId,
  channelId,
  disabled = false,
}: UseSlashMenuOptions) {
  const [open, setOpen] = React.useState(false);
  const [token, setToken] = React.useState<{ start: number; end: number; query: string } | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = React.useState(0);
  // Texto digitado NO campo de busca da modal. Fonte de verdade da busca
  // quando preenchido; senão cai no token "/..." do composer (os dois
  // caminhos filtram a mesma lista — ver `effectiveQuery`).
  const [search, setSearch] = React.useState("");
  const queryClient = useQueryClient();

  const queriesEnabled = open && !disabled;

  const internalsQ = useQuery({
    queryKey: ["slash-internal-templates"],
    queryFn: fetchInternalTemplates,
    enabled: queriesEnabled,
    staleTime: 60_000,
  });
  const metasQ = useQuery({
    queryKey: ["slash-meta-templates", channelId ?? "default"],
    queryFn: () => fetchMetaTemplates(channelId),
    enabled: queriesEnabled,
    staleTime: 60_000,
  });
  const quickRepliesQ = useQuery({
    queryKey: ["slash-quick-replies"],
    queryFn: fetchQuickReplies,
    enabled: queriesEnabled,
    staleTime: 60_000,
  });
  const flowsQ = useQuery({
    queryKey: ["slash-published-flows"],
    queryFn: fetchPublishedFlows,
    enabled: queriesEnabled,
    staleTime: 60_000,
  });

  // Preferências do agente (favoritos + contador de uso) para destacar/ordenar.
  const shortcutsQ = useQuery({
    queryKey: ["slash-shortcuts"],
    queryFn: fetchAgentShortcuts,
    enabled: queriesEnabled,
    staleTime: 30_000,
  });
  const shortcutMap = React.useMemo(() => {
    const m = new Map<string, ShortcutPref>();
    for (const s of shortcutsQ.data ?? []) {
      if (!SHORTCUT_KINDS.has(s.itemKind as SlashItemKind)) continue;
      m.set(shortcutKey(s.itemKind as SlashItemKind, s.itemId), {
        favorite: !!s.favorite,
        useCount: Number(s.useCount) || 0,
      });
    }
    return m;
  }, [shortcutsQ.data]);

  // Automações só fazem sentido com conversa + contato definidos (o run
  // precisa dos dois). Sem eles a seção fica oculta.
  const automationsVisible = !!conversationId && !!contactId;
  const automationsEnabled = queriesEnabled && automationsVisible;
  const automationsQ = useQuery({
    queryKey: ["slash-agent-automations"],
    queryFn: fetchAgentAutomations,
    enabled: automationsEnabled,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const isLoading =
    queriesEnabled &&
    (internalsQ.isLoading || metasQ.isLoading || quickRepliesQ.isLoading || flowsQ.isLoading);

  // Busca unificada: o campo da modal tem prioridade; sem ele, usa o
  // token "/..." do composer. Accent-insensitive, prioriza TÍTULO.
  const effectiveQuery = (search.trim() || token?.query || "").trim();

  const items = React.useMemo<SlashItem[]>(() => {
    const q = normalizeSearch(effectiveQuery);
    // `title` = casa no título (peso alto); `sec` = descrição/preview/categoria.
    const hitTitle = (s: string) => q === "" ? false : normalizeSearch(s).includes(q);
    const hitSec = (s: string) => q === "" ? false : normalizeSearch(s).includes(q);
    const pref = (kind: SlashItemKind, id: string): ShortcutPref =>
      shortcutMap.get(shortcutKey(kind, id)) ?? { favorite: false, useCount: 0 };

    const out: SlashItem[] = [];

    for (const t of internalsQ.data ?? []) {
      const title = t.name;
      if (q === "" || hitTitle(title) || hitSec(t.content) || hitSec(t.category ?? "")) {
        const p = pref("internal-template", t.id);
        out.push({
          kind: "internal-template",
          id: t.id,
          name: t.name,
          content: t.content,
          category: t.category,
          channelType: t.channelType,
          mediaUrl: t.mediaUrl ?? null,
          mediaName: t.mediaName ?? null,
          attachments: Array.isArray(t.attachments) ? t.attachments : null,
          favorite: p.favorite,
          useCount: p.useCount,
        });
      }
    }

    for (const q2 of quickRepliesQ.data ?? []) {
      const title = q2.title;
      if (q === "" || hitTitle(title) || hitSec(q2.content) || hitSec(q2.group?.name ?? "")) {
        const p = pref("quick-reply", q2.id);
        out.push({
          kind: "quick-reply",
          id: q2.id,
          name: q2.title,
          content: q2.content,
          category: q2.group?.name ?? null,
          attachmentUrl: q2.attachmentUrl ?? null,
          favorite: p.favorite,
          useCount: p.useCount,
        });
      }
    }

    for (const m of metasQ.data ?? []) {
      const name = m.label || m.metaTemplateName;
      if (q === "" || hitTitle(name) || hitSec(m.bodyPreview ?? "") || hitSec(m.category ?? "")) {
        const p = pref("meta-template", m.metaTemplateId);
        out.push({
          kind: "meta-template",
          id: m.metaTemplateId,
          name: m.metaTemplateName,
          label: m.label,
          bodyPreview: m.bodyPreview ?? "",
          category: m.category,
          language: m.language,
          hasButtons: m.hasButtons === true,
          buttonTypes: Array.isArray(m.buttonTypes)
            ? m.buttonTypes.filter((x): x is string => typeof x === "string")
            : [],
          hasVariables: m.hasVariables === true,
          flowAction: m.flowAction ?? null,
          flowId: m.flowId ?? null,
          operatorVariables: Array.isArray(m.operatorVariables) ? m.operatorVariables : null,
          favorite: p.favorite,
          useCount: p.useCount,
        });
      }
    }

    for (const f of flowsQ.data ?? []) {
      const title = f.name;
      if (q === "" || hitTitle(title)) {
        out.push({
          kind: "wa-flow",
          id: f.id,
          name: f.name,
        });
      }
    }

    if (automationsEnabled) {
      for (const a of automationsQ.data?.items ?? []) {
        if (
          q === "" ||
          hitTitle(a.name) ||
          hitSec(a.description ?? "") ||
          hitSec(a.messagePreview ?? "")
        ) {
          out.push({
            kind: "automation",
            id: a.id,
            name: a.name,
            description: a.description,
            messagePreview: a.messagePreview,
            stepCount: a.stepCount,
            category: a.category,
            categoryLabel: a.categoryLabel,
          });
        }
      }
    }

    // Ordenação/destaque. `Destaques` (favoritos + mais usados) vão para o
    // topo; o resto mantém o agrupamento por tipo (KIND_ORDER). Dentro de
    // cada bucket, quem casa no TÍTULO vem antes de quem só casou em
    // descrição/preview (busca "primariamente por título").
    const titleRank = (it: SlashItem): number => {
      if (q === "") return 0;
      return hitTitle(slashItemTitle(it)) ? 0 : 1;
    };
    const isDestaque = (it: SlashItem): boolean =>
      SHORTCUT_KINDS.has(it.kind) && (!!it.favorite || (it.useCount ?? 0) > 0);

    const destaque: SlashItem[] = [];
    const rest: SlashItem[] = [];
    for (const it of out) (isDestaque(it) ? destaque : rest).push(it);

    destaque.sort(
      (a, b) =>
        (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
        (b.useCount ?? 0) - (a.useCount ?? 0) ||
        titleRank(a) - titleRank(b),
    );
    rest.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        titleRank(a) - titleRank(b),
    );

    return [...destaque, ...rest];
  }, [
    internalsQ.data,
    metasQ.data,
    quickRepliesQ.data,
    flowsQ.data,
    automationsQ.data,
    automationsEnabled,
    effectiveQuery,
    shortcutMap,
  ]);

  // Reset activeIndex sempre que a query muda — sem isso o índice
  // pode cair fora do range da nova lista.
  React.useEffect(() => {
    setActiveIndex(0);
  }, [effectiveQuery, items.length]);

  // Ao fechar a modal, limpa a busca digitada no campo — senão ela
  // persistiria e filtraria a próxima abertura de forma inesperada.
  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Recalcula token sempre que `draft` muda. Isso roda também quando o
  // componente monta com texto pré-existente (paste, restore de draft, etc.).
  const recompute = React.useCallback(() => {
    if (disabled) {
      if (open) setOpen(false);
      setToken(null);
      return;
    }
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? draft.length;
    const found = detectSlashTokenAt(draft, cursor);
    if (found) {
      setToken(found);
      if (!open) setOpen(true);
    } else {
      setToken(null);
      if (open) setOpen(false);
    }
  }, [draft, textareaRef, disabled, open]);

  // Hook chama recompute em todo render — barato (string scan curto).
  React.useEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, disabled]);

  const close = React.useCallback(() => {
    setOpen(false);
    setToken(null);
    setSearch("");
  }, []);

  // Incrementa o contador de uso do item (favoritos/mais usados). Otimista
  // no cache do react-query + POST; o servidor é a fonte final via refetch.
  const recordUsage = React.useCallback(
    (kind: SlashItemKind, id: string) => {
      if (!SHORTCUT_KINDS.has(kind)) return;
      queryClient.setQueryData<ShortcutRow[]>(["slash-shortcuts"], (old) => {
        const list = Array.isArray(old) ? [...old] : [];
        const idx = list.findIndex((s) => s.itemKind === kind && s.itemId === id);
        if (idx >= 0) list[idx] = { ...list[idx], useCount: (list[idx].useCount ?? 0) + 1 };
        else list.push({ itemKind: kind, itemId: id, favorite: false, useCount: 1 });
        return list;
      });
      void postAgentShortcut({ action: "use", itemKind: kind as ShortcutKind, itemId: id })
        .then(() => queryClient.invalidateQueries({ queryKey: ["slash-shortcuts"] }))
        .catch(() => queryClient.invalidateQueries({ queryKey: ["slash-shortcuts"] }));
    },
    [queryClient],
  );

  // Marca/desmarca favorito (otimista + POST). Ignora automações.
  const toggleFavorite = React.useCallback(
    (item: SlashItem) => {
      if (!SHORTCUT_KINDS.has(item.kind)) return;
      const kind = item.kind;
      const id = item.id;
      const nextFav = !item.favorite;
      queryClient.setQueryData<ShortcutRow[]>(["slash-shortcuts"], (old) => {
        const list = Array.isArray(old) ? [...old] : [];
        const idx = list.findIndex((s) => s.itemKind === kind && s.itemId === id);
        if (idx >= 0) list[idx] = { ...list[idx], favorite: nextFav };
        else list.push({ itemKind: kind, itemId: id, favorite: nextFav, useCount: 0 });
        return list;
      });
      void postAgentShortcut({
        action: "favorite",
        itemKind: kind as ShortcutKind,
        itemId: id,
        favorite: nextFav,
      })
        .then((row) => {
          if (!row) queryClient.invalidateQueries({ queryKey: ["slash-shortcuts"] });
        })
        .catch(() => queryClient.invalidateQueries({ queryKey: ["slash-shortcuts"] }));
    },
    [queryClient],
  );

  const applyItem = React.useCallback(
    (item: SlashItem) => {
      if (!token) return;

      // Automação: NÃO insere texto — dispara o run na conversa atual
      // (mesmo mecanismo do AgentAutomationPickerModal) e fecha o menu.
      if (item.kind === "automation") {
        const before = draft.slice(0, token.start);
        const after = draft.slice(token.end);
        setDraft(before + after);
        close();
        if (!contactId) {
          toast.error("Sem contato associado a esta conversa.");
          return;
        }
        void runAutomationRequest(item.id, { contactId, conversationId })
          .then((res) =>
            toast.success(`Automação disparada: ${res.automationName ?? item.name}`),
          )
          .catch((err) =>
            toast.error(
              err instanceof Error ? err.message : "Erro ao executar automação",
            ),
          );
        return;
      }

      if (item.kind === "wa-flow") {
        const before = draft.slice(0, token.start);
        const after = draft.slice(token.end);
        setDraft(before + after);
        close();
        if (!conversationId) {
          toast.error("Abra uma conversa para enviar o formulário.");
          return;
        }
        void sendWaFlowRequest(conversationId, item.id)
          .then((res) => {
            toast.success(`Formulário enviado: ${item.name}`);
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
            queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
            if (res.reopenedConversationId) {
              queryClient.invalidateQueries({
                queryKey: ["messages", res.reopenedConversationId],
              });
            }
          })
          .catch((err) =>
            toast.error(
              err instanceof Error ? err.message : "Erro ao enviar formulário",
            ),
          );
        return;
      }

      // Contabiliza uso (favoritos/mais usados) — todos os caminhos abaixo
      // efetivamente "usam" o item (insert, abrir flow Meta ou override v2).
      recordUsage(item.kind, item.id);

      // Override (composer v2): remove o "/token" e delega o envio ao pai.
      if (onSelectOverride) {
        const before = draft.slice(0, token.start);
        const after = draft.slice(token.end);
        setDraft(before + after);
        close();
        onSelectOverride(item);
        return;
      }

      if (item.kind === "meta-template") {
        // Substitui o "/query" por nada — o pai vai abrir o pendingTemplate
        // panel; deixar o token no draft só atrapalha.
        const before = draft.slice(0, token.start);
        const after = draft.slice(token.end);
        setDraft(before + after);
        close();
        onPickMetaTemplate(item);
        return;
      }

      // internal-template → interpola variáveis; quick-reply → texto literal.
      const replacement =
        item.kind === "internal-template"
          ? interpolateInternalTemplate(item.content, templateContext ?? {})
          : item.content;

      const before = draft.slice(0, token.start);
      const after = draft.slice(token.end);
      const next = before + replacement + after;
      setDraft(next);
      close();

      // Encosta a(s) mídia(s) pra ir junto no envio. Modelos internos usam
      // `attachments` (multi-arquivo + messageBefore); legado cai em mediaUrl.
      if (item.kind === "internal-template") {
        const fromAtt = Array.isArray(item.attachments)
          ? item.attachments
              .filter((a) => typeof a?.url === "string" && a.url.trim())
              .map((a) => ({
                url: a.url.trim(),
                name: a.name ?? null,
                messageBefore: a.messageBefore ?? null,
              }))
          : [];
        if (fromAtt.length > 0) {
          onInsertMedia?.(fromAtt);
        } else if (item.mediaUrl) {
          onInsertMedia?.({ url: item.mediaUrl, name: item.mediaName ?? null });
        }
      } else if (item.attachmentUrl) {
        onInsertMedia?.({ url: item.attachmentUrl, name: null });
      }

      // Move o cursor pro fim do texto inserido.
      const pos = (before + replacement).length;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [draft, setDraft, token, close, onPickMetaTemplate, onSelectOverride, onInsertMedia, templateContext, textareaRef, contactId, conversationId, recordUsage, queryClient],
  );

  const applyActive = React.useCallback(() => {
    const item = items[activeIndex];
    if (item) applyItem(item);
  }, [items, activeIndex, applyItem]);

  /**
   * Handler de teclado pro composer. Retorna `true` quando consumiu o
   * evento — o pai deve dar `e.preventDefault()` e PARAR o handler de
   * envio/etc dele.
   */
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>): boolean => {
      if (!open || items.length === 0) {
        if (open && e.key === "Escape") {
          e.preventDefault();
          close();
          return true;
        }
        return false;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        applyActive();
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return true;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        applyActive();
        return true;
      }
      return false;
    },
    [open, items.length, applyActive, close],
  );

  const state: SlashMenuState = {
    open: open && !!token,
    query: effectiveQuery,
    search,
    items,
    activeIndex,
    isLoading: !!isLoading,
    automations: {
      visible: automationsVisible,
      isLoading: automationsEnabled && automationsQ.isLoading,
      isError: automationsEnabled && automationsQ.isError,
    },
  };

  return {
    state,
    onKeyDown,
    onSelectItem: applyItem,
    setActiveIndex,
    setSearch,
    toggleFavorite,
    close,
  };
}

// ─────────────────────────────────────────────────────────────────
// Componente visual — modal central (padrão AgentAutomationPickerModal)
// ─────────────────────────────────────────────────────────────────
//
// Refatorado do popover pequeno para uma modal central grande, espelhando
// o visual da AgentAutomationPickerModal (card glass centralizado, header
// com ícone gradiente + título + subtítulo + busca + fechar, corpo com
// <section>s agrupadas por eyebrow header e grid de cards).
//
// IMPORTANTE — o comportamento é 100% preservado: a busca continua sendo o
// que o operador digita APÓS "/" no textarea, e a navegação por teclado
// (↑/↓/Enter/Esc/Tab) continua sendo tratada pelo `useSlashMenu.onKeyDown`
// que o composer chama no textarea. Por isso o foco NUNCA sai do textarea:
// o campo de busca do header é apenas um reflexo de `state.query` e todos os
// cliques usam `onMouseDown preventDefault` para manter o foco no textarea.

const KIND_ORDER: SlashItemKind[] = [
  "internal-template",
  "quick-reply",
  "meta-template",
  "wa-flow",
  "automation",
];

const KIND_GROUP_LABEL: Record<SlashItemKind, string> = {
  "internal-template": "Modelos internos do CRM",
  "quick-reply": "Mensagens rápidas",
  "meta-template": "Templates WhatsApp (Meta)",
  "wa-flow": "Formulários WhatsApp",
  automation: "Automações",
};

const KIND_GROUP_HINT: Record<SlashItemKind, string> = {
  "internal-template": "Mensagem do CRM com variáveis preenchidas no envio",
  "quick-reply": "Resposta pronta — envia o texto (e o anexo, se houver)",
  "meta-template": "Modelo aprovado na Meta — abre painel para confirmar envio",
  "wa-flow": "Formulário publicado — envia na janela de 24h e abre no WhatsApp",
  automation: "Dispara a automação permitida nesta conversa",
};

const KIND_ICON: Record<SlashItemKind, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  "internal-template": FileText,
  "quick-reply": Bolt,
  "meta-template": MessageSquareQuote,
  "wa-flow": ClipboardList,
  automation: Bolt,
};

/** Visual (fg/bg) por tipo — mesmos tokens glass da modal de automação. */
const KIND_VISUAL: Record<SlashItemKind, { fg: string; bg: string }> = {
  "internal-template": {
    fg: "text-[var(--color-info)]",
    bg: "bg-[var(--color-primary)]/8",
  },
  "quick-reply": {
    fg: "text-[var(--color-warn)]",
    bg: "bg-[var(--color-warn-bg)]",
  },
  "meta-template": {
    fg: "text-[var(--color-success)]",
    bg: "bg-[var(--color-success-soft,rgba(16,185,129,0.1))]",
  },
  "wa-flow": {
    fg: "text-[var(--color-lavender)]",
    bg: "bg-[var(--color-lavender)]/10",
  },
  automation: {
    fg: "text-[var(--color-lavender)]",
    bg: "bg-[var(--color-lavender-soft)]",
  },
};

export function SlashCommandMenu({
  open,
  state,
  onSelectItem,
  onHover,
  onClose,
  onSearchChange,
  onSearchKeyDown,
  onToggleFavorite,
  className: _className,
}: {
  /** Controla a exibição da modal (com animação de entrada/saída). */
  open?: boolean;
  state: SlashMenuState;
  onSelectItem: (item: SlashItem) => void;
  /** Atualiza activeIndex quando o mouse passa por um item. */
  onHover?: (index: number) => void;
  /** Fecha a modal (backdrop / botão / ESC). */
  onClose?: () => void;
  /** Aceito por callers legado (popover); a modal atual é portal no body. */
  className?: string;
  /** Atualiza o texto de busca digitado no campo da modal. */
  onSearchChange?: (value: string) => void;
  /** Navegação por teclado quando o campo de busca está focado (↑/↓/Enter/Esc/Tab). */
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => boolean;
  /** Marca/desmarca favorito de um item (star toggle). */
  onToggleFavorite?: (item: SlashItem) => void;
}) {
  const isOpen = open ?? state.open;
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // ESC fecha (paridade com a modal de automação). O composer também escuta
  // ESC/onKeyDown — chamadas duplicadas de onClose são idempotentes.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Agrupa os itens por tipo na ordem fixa KIND_ORDER, mantendo o
  // índice GLOBAL de cada item (essencial pra que ↑/↓ continuem
  // navegando linearmente entre todos os itens, mesmo separados em
  // cabeçalhos de seção).
  type IndexedItem = { item: SlashItem; globalIndex: number };
  const byKind: Record<SlashItemKind, IndexedItem[]> = {
    "internal-template": [],
    "quick-reply": [],
    "meta-template": [],
    "wa-flow": [],
    automation: [],
  };
  // "Destaques" = favoritos + mais usados do agente (topo). Esses itens saem
  // das seções por tipo para não duplicar; o `globalIndex` (ordem em
  // state.items) já vem com os destaques primeiro, então ↑/↓ navega na mesma
  // ordem visual (Destaques → seções por tipo).
  const destaque: IndexedItem[] = [];
  state.items.forEach((item, i) => {
    const highlighted =
      item.kind !== "automation" &&
      item.kind !== "wa-flow" &&
      (!!item.favorite || (item.useCount ?? 0) > 0);
    if (highlighted) destaque.push({ item, globalIndex: i });
    else byKind[item.kind].push({ item, globalIndex: i });
  });

  // Estado isolado da seção "Automações": mostrada mesmo com 0 itens quando
  // está carregando ou deu erro (degradação graciosa — não quebra o resto).
  const auto = state.automations;
  const autoStateOnly =
    auto.visible && byKind.automation.length === 0 && (auto.isLoading || auto.isError);
  const hasContent = state.items.length > 0 || autoStateOnly;
  const anyAboveAutomation =
    destaque.length > 0 ||
    byKind["internal-template"].length > 0 ||
    byKind["quick-reply"].length > 0 ||
    byKind["meta-template"].length > 0;

  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            key="slash-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={() => onClose?.()}
            className="fixed inset-0 z-70 bg-black/30 backdrop-blur-sm"
            aria-hidden
          />

          <motion.div
            key="slash-modal"
            role="listbox"
            aria-label="Mensagens prontas"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              "fixed left-1/2 top-1/2 z-71 -translate-x-1/2 -translate-y-1/2",
              "w-[min(720px,calc(100vw-32px))] max-h-[min(80vh,720px)]",
              "flex flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--glass-border)]",
              "bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
            )}
            // Mantém o foco no textarea (o input real de envio/busca).
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-6 pt-6 pb-5 backdrop-blur-md sm:px-7">
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    "bg-linear-to-br from-[var(--brand-primary)] to-[var(--brand-primary-dark)] text-white",
                    "shadow-[var(--glass-shadow)] ring-1 ring-white/40",
                  )}
                >
                  <IconMessage2 className="size-5" strokeWidth={2.4} />
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[20px] font-bold leading-tight tracking-tighter text-[var(--text-primary)] sm:text-[22px]">
                    Mensagens prontas
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium tracking-tight text-[var(--text-muted)]">
                    Escolha um modelo ou template para inserir na conversa.
                  </p>
                </div>

                <div className="hidden items-center gap-2 sm:flex">
                  <SlashSearchBox
                    value={state.search}
                    query={state.query}
                    count={state.items.length}
                    onChange={onSearchChange}
                    onKeyDown={onSearchKeyDown}
                  />
                  <SlashCloseButton onClose={onClose} />
                </div>
                <div className="sm:hidden">
                  <SlashCloseButton onClose={onClose} />
                </div>
              </div>

              <div className="mt-3 sm:hidden">
                <SlashSearchBox
                  value={state.search}
                  query={state.query}
                  count={state.items.length}
                  onChange={onSearchChange}
                  onKeyDown={onSearchKeyDown}
                />
              </div>
            </div>

            {/* Body */}
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {state.isLoading && !hasContent ? (
                <div className="flex items-center justify-center py-14">
                  <Loader2 className="size-6 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : !hasContent ? (
                <div className="py-12 text-center text-[13px] tracking-tight text-[var(--text-muted)]">
                  {state.query
                    ? `Nenhuma mensagem pronta encontrada para "${state.query}".`
                    : "Nenhuma mensagem pronta disponível."}
                </div>
              ) : (
                <>
                  {/* Destaques — favoritos + mais usados do agente (topo). */}
                  {destaque.length > 0 ? (
                    <section aria-label="Destaques" className="mb-1">
                      <SlashDestaqueHeader count={destaque.length} />
                      <div className="flex flex-col gap-2">
                        {destaque.map(({ item, globalIndex }) => (
                          <SlashItemCard
                            key={`destaque-${item.kind}-${item.id}`}
                            item={item}
                            active={globalIndex === state.activeIndex}
                            onHover={() => onHover?.(globalIndex)}
                            onSelect={() => onSelectItem(item)}
                            onToggleFavorite={onToggleFavorite}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {KIND_ORDER.map((kind, idx) => {
                    const group = byKind[kind];
                    if (group.length === 0) return null;
                    return (
                      <section
                        key={kind}
                        aria-label={KIND_GROUP_LABEL[kind]}
                        className={cn((idx > 0 || destaque.length > 0) && "mt-6")}
                      >
                        <SlashSectionHeader kind={kind} count={group.length} />

                        {/* 1 mensagem por linha — coluna única (otimiza espaço). */}
                        <div className="flex flex-col gap-2">
                          {group.map(({ item, globalIndex }) => (
                            <SlashItemCard
                              key={`${item.kind}-${item.id}`}
                              item={item}
                              active={globalIndex === state.activeIndex}
                              onHover={() => onHover?.(globalIndex)}
                              onSelect={() => onSelectItem(item)}
                              onToggleFavorite={onToggleFavorite}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}

                  {/* Automações: loading/erro inline (sem itens) — não quebra o resto. */}
                  {autoStateOnly ? (
                    <section
                      aria-label={KIND_GROUP_LABEL.automation}
                      className={cn(anyAboveAutomation && "mt-6")}
                    >
                      <SlashSectionHeader kind="automation" />
                      {auto.isLoading ? (
                        <div className="flex items-center gap-2 px-1 py-3 text-[12px] tracking-tight text-[var(--text-muted)]">
                          <Loader2 className="size-4 animate-spin" />
                          Carregando automações…
                        </div>
                      ) : (
                        <div className="px-1 py-3 text-[12px] tracking-tight text-[var(--color-danger)]">
                          Não foi possível carregar as automações.
                        </div>
                      )}
                    </section>
                  ) : null}
                </>
              )}
            </div>

            {/* Footer — dicas de teclado */}
            <div className="flex shrink-0 items-center justify-between border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-6 py-3 text-[10.5px] tracking-tight text-[var(--text-muted)] sm:px-7">
              <span>
                <kbd className="rounded bg-[var(--glass-bg-strong)] px-1 py-0.5 font-mono text-[10px]">↑</kbd>{" "}
                <kbd className="rounded bg-[var(--glass-bg-strong)] px-1 py-0.5 font-mono text-[10px]">↓</kbd> navegar ·{" "}
                <kbd className="rounded bg-[var(--glass-bg-strong)] px-1 py-0.5 font-mono text-[10px]">Enter</kbd> inserir
              </span>
              <span>
                <kbd className="rounded bg-[var(--glass-bg-strong)] px-1 py-0.5 font-mono text-[10px]">Esc</kbd> fechar
              </span>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    portalTarget,
  );
}

function SlashSectionHeader({ kind, count }: { kind: SlashItemKind; count?: number }) {
  const Icon = KIND_ICON[kind];
  const visual = KIND_VISUAL[kind];
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-md",
          visual.bg,
          visual.fg,
        )}
      >
        <Icon className="size-3" strokeWidth={2.6} />
      </span>
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-widest",
          visual.fg,
        )}
      >
        {KIND_GROUP_LABEL[kind]}
      </span>
      {typeof count === "number" ? (
        <span className="shrink-0 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--text-muted)]">
          {count}
        </span>
      ) : null}
      <span className="ml-auto hidden truncate text-[10px] tracking-tight text-[var(--text-muted)] sm:inline">
        {KIND_GROUP_HINT[kind]}
      </span>
    </div>
  );
}

function SlashItemCard({
  item,
  active,
  onHover,
  onSelect,
  onToggleFavorite,
}: {
  item: SlashItem;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
  onToggleFavorite?: (item: SlashItem) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const visual = KIND_VISUAL[item.kind];
  const title = item.kind === "meta-template" ? item.label || item.name : item.name;
  // Favorito/uso só se aplicam a modelos/mensagens/templates (não automações).
  const canFavorite = item.kind !== "automation" && item.kind !== "wa-flow" && !!onToggleFavorite;
  const isFav = !!item.favorite;
  const preview =
    item.kind === "meta-template"
      ? item.bodyPreview
      : item.kind === "automation"
        ? item.messagePreview || item.description || ""
        : item.kind === "wa-flow"
          ? "Envia o formulário agora (janela de 24h)"
          : item.content;
  const tag =
    item.kind === "automation"
      ? item.categoryLabel || null
      : "category" in item
        ? (item.category ?? null)
        : null;
  const hasMedia =
    (item.kind === "internal-template" && !!item.mediaUrl) ||
    (item.kind === "quick-reply" && !!item.attachmentUrl);

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      // Evita perder o foco do textarea (o input real de envio/busca).
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "group/card flex w-full items-start gap-3 rounded-2xl border bg-[var(--glass-bg-overlay)]",
        "px-3.5 py-2.5 text-left transition-all duration-150",
        active
          ? "border-[var(--brand-primary)]/40 shadow-[var(--glass-shadow)] ring-1 ring-[var(--brand-primary)]/30"
          : "border-[var(--glass-border-subtle)] hover:border-[var(--brand-primary)]/30 hover:shadow-[var(--glass-shadow)]",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          "ring-1 ring-[var(--glass-border-subtle)] transition-all",
          visual.bg,
          visual.fg,
        )}
      >
        <Icon className="size-[18px]" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold tracking-tight text-[var(--text-primary)]">
            {title}
          </p>
          {hasMedia ? (
            <span className="shrink-0 text-[11px]" title="Inclui anexo">
              📎
            </span>
          ) : null}
          {tag ? (
            <span className="shrink-0 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-px text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
              {tag}
            </span>
          ) : null}
          {canFavorite ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              aria-pressed={isFav}
              title={isFav ? "Remover dos favoritos" : "Favoritar"}
              // Não seleciona o item nem tira o foco do textarea ao clicar.
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite?.(item);
              }}
              className={cn(
                "shrink-0 cursor-pointer rounded-full p-0.5 transition-colors",
                isFav
                  ? "text-[var(--color-warn,#f59e0b)]"
                  : "text-[var(--text-muted)] opacity-0 hover:text-[var(--color-warn,#f59e0b)] group-hover/card:opacity-100",
              )}
            >
              {isFav ? (
                <IconStarFilled className="size-3.5" />
              ) : (
                <IconStar className="size-3.5" strokeWidth={2.2} />
              )}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11.5px] font-medium leading-snug tracking-tight text-[var(--text-muted)]">
          {preview || "Sem preview."}
        </p>
      </div>
    </button>
  );
}

/**
 * Cabeçalho da seção "Destaques" (favoritas + mais usadas do agente).
 */
function SlashDestaqueHeader({ count }: { count: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--color-warn-bg,rgba(245,158,11,0.12))] text-[var(--color-warn,#f59e0b)]">
        <IconSparkles className="size-3" strokeWidth={2.6} />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-warn,#f59e0b)]">
        Destaques
      </span>
      <span className="shrink-0 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--text-muted)]">
        {count}
      </span>
      <span className="ml-auto hidden truncate text-[10px] tracking-tight text-[var(--text-muted)] sm:inline">
        Favoritas e mais usadas por você
      </span>
    </div>
  );
}

/**
 * Campo de busca do header — EDITÁVEL. Filtra a lista por título (e, como
 * fallback, descrição/preview). Unificado com o token "/..." do composer:
 * quando vazio, mostra/filtra pelo que foi digitado após "/"; ao digitar
 * aqui, a busca da modal assume o controle. Navegação por teclado (↑/↓/
 * Enter/Esc/Tab) funciona com o campo focado via `onKeyDown`.
 */
function SlashSearchBox({
  value,
  query,
  count,
  onChange,
  onKeyDown,
}: {
  value: string;
  query: string;
  count: number;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-9 items-center gap-1.5 rounded-full border border-[var(--glass-border)]",
        "bg-[var(--input-bg)] pl-3 pr-3 transition-colors focus-within:border-[var(--brand-primary)]/50",
        query && "border-[var(--brand-primary)]/50",
      )}
    >
      <IconSearch className="size-3.5 shrink-0 text-[var(--text-muted)]" strokeWidth={2.2} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
        }}
        aria-label="Buscar mensagens prontas por título"
        placeholder={query && !value ? query : "Buscar por título…"}
        className={cn(
          "h-full w-[200px] min-w-0 flex-1 border-0 bg-transparent text-[13px]",
          "tracking-tight text-[var(--text-primary)] outline-none",
          "placeholder:font-medium placeholder:text-[var(--text-muted)]",
        )}
      />
      <span className="shrink-0 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
        {count} {count === 1 ? "resultado" : "resultados"}
      </span>
    </div>
  );
}

function SlashCloseButton({ onClose }: { onClose?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      onMouseDown={(e) => e.preventDefault()}
      aria-label="Fechar"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full",
        "border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
        "transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] active:scale-95",
      )}
    >
      <IconX className="size-4" strokeWidth={2.2} />
    </button>
  );
}
