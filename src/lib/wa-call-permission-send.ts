import { apiUrl } from "@/lib/api";
import type { CallPermissionTemplate } from "@/components/inbox/call-permission-template-dialog";

export const CALL_PERMISSION_TPL_STORAGE = "wa_call_permission_tpl";

/**
 * Templates de permissão de ligação da WABA do canal da conversa (a org pode
 * ter mais de um número, cada um na sua WABA). Erro da API vira exceção com a
 * mensagem do servidor, para a modal não mostrar "nenhum template" quando o
 * problema é outro (token vencido, canal sem WABA…).
 */
export async function fetchCallPermissionTemplates(
  conversationId?: string | null,
): Promise<CallPermissionTemplate[]> {
  const qs = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
  const r = await fetch(apiUrl(`/api/meta/whatsapp/call-permission-templates${qs}`));
  const j = (await r.json().catch(() => ({}))) as {
    items?: CallPermissionTemplate[];
    message?: string;
  };
  if (!r.ok) {
    const fromApi = typeof j.message === "string" ? j.message.trim() : "";
    throw new Error(fromApi || "Não foi possível carregar os templates de ligação.");
  }
  return Array.isArray(j.items) ? j.items : [];
}

function mapCallPermissionFetchError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : "";
  if (
    e instanceof TypeError ||
    /failed to fetch|networkerror|load failed/i.test(msg)
  ) {
    return new Error(
      "Não foi possível enviar o template de ligação. Recarregue a página e tente novamente.",
    );
  }
  return e instanceof Error ? e : new Error("Erro ao enviar solicitação");
}

export async function sendCallPermissionTemplate(args: {
  conversationId: string;
  templateName: string;
  tpl?: CallPermissionTemplate;
}): Promise<{ pending?: boolean; reopenedConversationId?: string }> {
  let r: Response;
  try {
    r = await fetch(apiUrl("/wa-call-permission"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: args.conversationId,
        templateName: args.templateName,
        languageCode: args.tpl?.language || "pt_BR",
        bodyText: args.tpl?.bodyText,
        headerText: args.tpl?.headerText,
        footerText: args.tpl?.footerText,
        buttons: args.tpl?.buttons,
      }),
    });
  } catch (e) {
    throw mapCallPermissionFetchError(e);
  }
  const j = (await r.json().catch(() => ({}))) as {
    message?: string;
    pending?: boolean;
    reopenedConversationId?: string;
  };
  if (!r.ok) {
    const fromApi = typeof j.message === "string" ? j.message.trim() : "";
    throw new Error(
      fromApi ||
        (r.status === 502 || r.status === 504
          ? "O servidor não respondeu a tempo ao enviar o template. Tente novamente."
          : "Erro ao enviar solicitação"),
    );
  }
  try {
    sessionStorage.setItem(CALL_PERMISSION_TPL_STORAGE, args.templateName);
  } catch {
    /* ignore */
  }
  return j;
}
