import { apiUrl, parseApiResponse } from "@/lib/api";

export async function postWhatsappCall<T>(
  conversationId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl("/wa-whatsapp-call"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, ...body }),
  });
  return parseApiResponse<T>(res, "Erro na chamada WhatsApp.");
}
