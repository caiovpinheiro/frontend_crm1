/**
 * Política de polling das queries do shell (layout autenticado).
 *
 * Tudo que o shell busca já chega por SSE ou muda raramente; os polls
 * daqui são só safety-net para queda silenciosa da stream. Nenhuma query
 * do shell refaz por foco da aba: com N abas abertas, alternar entre elas
 * gerava uma rajada de 5–7 requisições por troca (MA-5).
 */

/** Contas de e-mail no trilho (contador de não lidas). Antes: 60 s. */
export const EMAIL_ACCOUNTS_POLL_MS = 5 * 60_000;

/** `/api/app-revision` — detector de deploy compartilhado (banner + mobile). */
export const APP_REVISION_POLL_MS = 3 * 60_000;

/** Mensagens da sala do Bwipo Chat (SSE faz o upsert; poll é só rede de segurança). Antes: 8 s. */
export const TEAM_CHAT_MESSAGES_POLL_MS = 60_000;
export const TEAM_CHAT_MESSAGES_STALE_MS = 20_000;

/** `GET /api/agents/me/alert-config` — muda quando o admin salva. */
export const ALERT_CONFIG_STALE_MS = 10 * 60_000;

/**
 * Opções de poll do React Query para queries do shell: roda só com a aba
 * visível, nunca em segundo plano e nunca por foco.
 */
export function pollWhileVisible(visible: boolean, intervalMs: number) {
  return {
    refetchInterval: visible ? intervalMs : (false as const),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  } as const;
}
