import { apiUrl } from "@/lib/api";
import type { EmailAccount, ConnectEmailInput, ApiFieldError } from "./types";

function fieldErrorFromBody(data: unknown, fallback: string): ApiFieldError {
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const message = typeof body.message === "string" && body.message.trim()
    ? body.message
    : fallback;
  const field = typeof body.field === "string" && body.field.trim() ? body.field : "form";
  return { ok: false, field, message };
}

export async function listEmailAccounts(): Promise<EmailAccount[]> {
  const res = await fetch(apiUrl("/api/email-accounts"), { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Erro ao listar contas.");
  return (data.accounts ?? []) as EmailAccount[];
}

export async function testEmailConnection(
  input: ConnectEmailInput,
): Promise<{ ok: true } | ApiFieldError> {
  const res = await fetch(apiUrl("/api/email-accounts/test"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === true) return { ok: true };
  return fieldErrorFromBody(data, "Não foi possível testar a conexão.");
}

export async function connectEmailAccount(
  input: ConnectEmailInput,
): Promise<{ ok: true; account: EmailAccount } | ApiFieldError> {
  const res = await fetch(apiUrl("/api/email-accounts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === true && data.account) {
    return data as { ok: true; account: EmailAccount };
  }
  return fieldErrorFromBody(data, "Não foi possível conectar a conta de e-mail.");
}

export async function disconnectEmailAccount(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/email-accounts/${id}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Erro ao desconectar conta.");
  }
}

export async function syncEmailAccount(
  id: string,
): Promise<{ synced: number; skipped: number; errors: number }> {
  const res = await fetch(apiUrl(`/api/email-accounts/${id}/sync`), { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Erro ao sincronizar.");
  return data;
}
