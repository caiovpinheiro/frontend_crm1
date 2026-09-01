import { apiUrl, parseApiResponse } from "@/lib/api";

export async function postWhatsappCall<T>(
  conversationId: string,
  body: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/wa-whatsapp-call"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, ...body }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (
      e instanceof TypeError ||
      /failed to fetch|networkerror|load failed/i.test(msg)
    ) {
      throw new Error(
        "Não foi possível iniciar a chamada. Recarregue a página e tente novamente.",
      );
    }
    throw e;
  }
  return parseApiResponse<T>(res, "Erro na chamada WhatsApp.");
}
