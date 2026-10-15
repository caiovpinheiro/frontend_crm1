/*
 * POST condicional do board (gate C, 15/10/2026).
 *
 * O backend responde o board e o "carregar mais" com `ETag` e aceita
 * `If-None-Match` também no POST (`POST /api/pipelines/:id/board` e
 * `/board/columns`): sem mudança no quadro, 304 sem corpo e sem banco.
 *
 * O navegador só revalida GET sozinho (cache HTTP + `cache: "no-cache"`). No
 * POST a revalidação é manual: guardamos o último `ETag` + corpo por pedido
 * (URL + corpo JSON exatos — o corpo já sai canônico dos chamadores) e
 * mandamos `If-None-Match`; 304 = reaproveitar o corpo guardado.
 *
 * Memória da aba (não persiste): poucas entradas, a mais antiga sai primeiro.
 * O corpo guardado é o texto da resposta (o board em cache no React Query
 * pode ter patches do SSE; o merge `mergeBoardKeepingLiveActivity` do
 * `structuralSharing` mantém a atividade mais nova por cima dele).
 */

/** Pedidos guardados por aba (board + filtros + colunas expandidas). */
export const BOARD_CONDITIONAL_MAX_ENTRIES = 16;

type Stored = { etag: string; body: string };

const stored = new Map<string, Stored>();

function remember(key: string, value: Stored): void {
  stored.delete(key);
  stored.set(key, value);
  while (stored.size > BOARD_CONDITIONAL_MAX_ENTRIES) {
    const oldest = stored.keys().next().value;
    if (oldest === undefined) break;
    stored.delete(oldest);
  }
}

/** Só testes. */
export function resetBoardConditionalCache(): void {
  stored.clear();
}

/** Só testes: ETag guardado para o pedido. */
export function storedBoardEtag(url: string, body: string): string | undefined {
  return stored.get(`${url}\n${body}`)?.etag;
}

export type ConditionalJsonResult = {
  /** HTTP real (304 quando o corpo veio da memória). */
  status: number;
  ok: boolean;
  /** Corpo JSON (do servidor ou o guardado, no 304). */
  data: unknown;
};

/**
 * POST JSON com `If-None-Match` do último 200 do mesmo pedido. 304 devolve
 * o corpo guardado com `ok: true`. Erro do servidor não apaga o guardado.
 */
export async function postJsonConditional(
  url: string,
  body: string,
  signal?: AbortSignal,
): Promise<ConditionalJsonResult> {
  const key = `${url}\n${body}`;
  const known = stored.get(key);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (known) headers["If-None-Match"] = known.etag;

  const res = await fetch(url, { method: "POST", headers, body, signal });

  if (res.status === 304) {
    if (known) {
      remember(key, known);
      return { status: 304, ok: true, data: JSON.parse(known.body) as unknown };
    }
    // 304 sem corpo guardado (não deveria acontecer): pede de novo sem validador.
    const retry = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
    return readResponse(retry, key);
  }
  return readResponse(res, key);
}

async function readResponse(res: Response, key: string): Promise<ConditionalJsonResult> {
  const text = await res.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    data = {};
  }
  const etag = res.headers.get("etag");
  if (res.ok && etag && text) remember(key, { etag, body: text });
  return { status: res.status, ok: res.ok, data };
}
