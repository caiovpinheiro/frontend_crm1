import { apiFetch, parseApiResponse } from "@/lib/api";

/** Contrato de `/api/remote-support/sessions` (fonte da verdade: backend). */
export type RemoteSupportStatus = "WAITING" | "CONNECTED" | "ENDED" | "EXPIRED" | "FAILED";

export type RemoteSupportSession = {
  id: string;
  status: RemoteSupportStatus;
  contactId: string;
  /** Link que o cliente abre (só enquanto a sessão está ativa). */
  clientLink: string | null;
  deviceName: string | null;
  /** Assistant do cliente conectado agora; `null` = não verificado. */
  deviceOnline: boolean | null;
  expiresAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null };
};

const BASE = "/api/remote-support/sessions";
/** Operações que falam com o MeshCentral podem levar alguns segundos. */
const MUTATION_TIMEOUT_MS = 30_000;

export async function fetchRemoteSupportSessions(contactId: string): Promise<RemoteSupportSession[]> {
  const res = await apiFetch(`${BASE}?contactId=${encodeURIComponent(contactId)}`);
  const data = await parseApiResponse<{ items: RemoteSupportSession[] }>(
    res,
    "Erro ao carregar o suporte remoto.",
  );
  return data.items;
}

export async function fetchRemoteSupportSession(id: string): Promise<RemoteSupportSession> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}`);
  const data = await parseApiResponse<{ session: RemoteSupportSession }>(
    res,
    "Erro ao consultar a sessão de suporte.",
  );
  return data.session;
}

export async function startRemoteSupportSession(contactId: string): Promise<RemoteSupportSession> {
  const res = await apiFetch(
    BASE,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    },
    MUTATION_TIMEOUT_MS,
  );
  const data = await parseApiResponse<{ session: RemoteSupportSession }>(
    res,
    "Erro ao iniciar o suporte remoto.",
  );
  return data.session;
}

export async function createRemoteSupportControlLink(id: string): Promise<string> {
  const res = await apiFetch(
    `${BASE}/${encodeURIComponent(id)}/control`,
    { method: "POST" },
    MUTATION_TIMEOUT_MS,
  );
  const data = await parseApiResponse<{ url: string }>(res, "Erro ao abrir o controle.");
  return data.url;
}

export async function endRemoteSupportSession(id: string): Promise<RemoteSupportSession> {
  const res = await apiFetch(
    `${BASE}/${encodeURIComponent(id)}/end`,
    { method: "POST" },
    MUTATION_TIMEOUT_MS,
  );
  const data = await parseApiResponse<{ session: RemoteSupportSession }>(
    res,
    "Erro ao encerrar o suporte remoto.",
  );
  return data.session;
}
