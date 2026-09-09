import { apiFetch, parseApiResponse } from "@/lib/api";
import type { SmtpRelayInput, SmtpRelaySettings } from "./types";

export async function getSmtpRelay(): Promise<SmtpRelaySettings> {
  const res = await apiFetch("/api/settings/smtp-relay");
  const data = await parseApiResponse<{ settings: SmtpRelaySettings }>(
    res,
    "Erro ao carregar o relay SMTP.",
  );
  return data.settings;
}

export async function saveSmtpRelay(input: SmtpRelayInput): Promise<SmtpRelaySettings> {
  const res = await apiFetch("/api/settings/smtp-relay", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseApiResponse<{ settings: SmtpRelaySettings }>(
    res,
    "Erro ao salvar o relay SMTP.",
  );
  return data.settings;
}

export async function deleteSmtpRelay(): Promise<void> {
  const res = await apiFetch("/api/settings/smtp-relay", { method: "DELETE" });
  await parseApiResponse(res, "Erro ao remover o relay SMTP.");
}
