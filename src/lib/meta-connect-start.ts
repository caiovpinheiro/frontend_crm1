import { apiUrl } from "@/lib/api";

/** Abre o Embedded Signup em connect.bwipo.com. O token não passa por aqui. */
export async function redirectToMetaConnect(input: {
  name?: string;
  channelId?: string;
}): Promise<void> {
  const res = await fetch(apiUrl("/api/meta/connect/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    message?: string;
  };
  if (!res.ok || typeof data.url !== "string" || !data.url) {
    throw new Error(data.message || "Não foi possível iniciar a conexão com a Meta.");
  }
  let target: URL;
  try {
    target = new URL(data.url);
  } catch {
    throw new Error("URL de conexão inválida.");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("URL de conexão inválida.");
  }
  if (target.pathname !== "/meta/start") {
    throw new Error("URL de conexão inválida.");
  }
  window.location.assign(target.toString());
}
