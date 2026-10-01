/**
 * Rascunho do composer persistido em `localStorage` (MA-10).
 *
 * Antes o texto vivia só no estado da aba: fechar/recarregar perdia o que
 * o operador digitou, e duas abas do mesmo negócio não se enxergavam. Aqui
 * fica a parte pura (chave, leitura, escrita, assinatura do evento
 * `storage`); o hook `useComposerDraftPersistence` liga isto ao `Composer`.
 *
 * Regras:
 * - Chave por org + usuário + conversa: trocar de conta na mesma máquina
 *   não vaza rascunho de outra pessoa.
 * - Limite de tamanho (`COMPOSER_DRAFT_MAX_CHARS`): o storage é ~5 MB por
 *   origem e compartilhado com o resto do app; um colar acidental de
 *   megabytes não pode derrubar as outras chaves.
 * - Todo acesso ao storage em try/catch: Safari privado, quota cheia e
 *   storage bloqueado por política lançam — o composer segue funcionando
 *   só em memória.
 */

export const COMPOSER_DRAFT_PREFIX = "bwipo:composer-draft:";
export const COMPOSER_DRAFT_MAX_CHARS = 20_000;
/** Agrupa teclas antes de gravar (uma escrita por pausa de digitação). */
export const COMPOSER_DRAFT_WRITE_DEBOUNCE_MS = 300;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StorageEventLike = { key: string | null; newValue: string | null };
export type DraftEventTarget = {
  addEventListener(type: "storage", fn: (e: StorageEventLike) => void): void;
  removeEventListener(type: "storage", fn: (e: StorageEventLike) => void): void;
};

/** Chave do rascunho; `null` enquanto faltar org, usuário ou conversa. */
export function composerDraftKey(parts: {
  orgId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
}): string | null {
  const { orgId, userId, conversationId } = parts;
  if (!orgId || !userId || !conversationId) return null;
  return `${COMPOSER_DRAFT_PREFIX}${orgId}:${userId}:${conversationId}`;
}

function defaultStorage(): DraftStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Texto salvo ou `""` (ausente, storage indisponível ou erro). */
export function readComposerDraft(
  key: string,
  storage: DraftStorage | null = defaultStorage(),
): string {
  if (!storage) return "";
  try {
    const raw = storage.getItem(key);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

/**
 * Grava o texto (cortado em `COMPOSER_DRAFT_MAX_CHARS`); texto vazio remove
 * a chave. Retorna `false` quando o storage recusou (quota, política).
 */
export function writeComposerDraft(
  key: string,
  text: string,
  storage: DraftStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    if (!text) {
      storage.removeItem(key);
      return true;
    }
    storage.setItem(key, text.slice(0, COMPOSER_DRAFT_MAX_CHARS));
    return true;
  } catch {
    return false;
  }
}

export function clearComposerDraft(
  key: string,
  storage: DraftStorage | null = defaultStorage(),
): void {
  writeComposerDraft(key, "", storage);
}

/**
 * Chama `onChange(texto)` quando OUTRA aba grava/remove esta chave (o
 * evento `storage` só dispara nas demais abas da origem). Retorna o
 * unsubscribe.
 */
export function subscribeComposerDraft(
  key: string,
  onChange: (text: string) => void,
  target: DraftEventTarget | null = typeof window === "undefined" ? null : window,
): () => void {
  if (!target) return () => {};
  const listener = (e: StorageEventLike) => {
    // `key === null` é `storage.clear()`: trata como remoção.
    if (e.key !== null && e.key !== key) return;
    onChange(typeof e.newValue === "string" ? e.newValue : "");
  };
  try {
    target.addEventListener("storage", listener);
  } catch {
    return () => {};
  }
  return () => {
    try {
      target.removeEventListener("storage", listener);
    } catch {
      /* ignore */
    }
  };
}
