/**
 * Sessão do visitante no `localStorage` do iframe (origem nossa — o site do
 * cliente não lê). Uma entrada por chave pública, compartilhada por todas as
 * abas do mesmo navegador: o backend só aceita o token MAIS NOVO, então quem
 * recebe 401 relê esta entrada antes de concluir que a sessão morreu (outra
 * aba pode ter renovado/identificado e gravado um token novo).
 */

export type StoredSession = {
  token: string;
  visitorId: string;
  identified: boolean;
  name?: string;
  email?: string;
  phone?: string;
  lastSeenOutAt?: string;
};

export function storageKey(publicKey: string): string {
  return `bwipo-webchat:v1:${publicKey}`;
}

export function parseStoredSession(raw: string | null | undefined): StoredSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredSession> | null;
    if (!v || typeof v.token !== "string" || typeof v.visitorId !== "string") return null;
    return { identified: false, ...v } as StoredSession;
  } catch {
    return null;
  }
}

export function readStoredSession(publicKey: string): StoredSession | null {
  try {
    return parseStoredSession(window.localStorage.getItem(storageKey(publicKey)));
  } catch {
    return null;
  }
}

export function writeStoredSession(publicKey: string, value: StoredSession | null): void {
  try {
    if (value) window.localStorage.setItem(storageKey(publicKey), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(publicKey));
  } catch {
    /* storage bloqueado (modo privado / 3rd-party) — segue só em memória */
  }
}

/**
 * Apaga a sessão salva só se ela ainda é a do token que falhou. Se outra aba
 * já gravou um token diferente, a entrada fica (é dela, e está válida).
 */
export function clearStoredSessionIf(publicKey: string, failedToken: string): void {
  const disk = readStoredSession(publicKey);
  if (!disk || disk.token === failedToken) writeStoredSession(publicKey, null);
}

export function sameStoredSession(a: StoredSession | null, b: StoredSession | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.token === b.token &&
    a.visitorId === b.visitorId &&
    a.identified === b.identified &&
    a.name === b.name &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.lastSeenOutAt === b.lastSeenOutAt
  );
}
