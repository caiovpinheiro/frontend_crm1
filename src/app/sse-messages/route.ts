import { backendBase } from "@/lib/api-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Fora de `/api/*` de propósito. O rewrite `afterFiles` `/api/:path*` do
 * Next intercepta App Router em `/api/...` (mesmo padrão que
 * `/wa-call-permission`). O cliente continua em `/api/sse/messages`;
 * `next.config.ts` reescreve para cá.
 *
 * Por que o proxy existe: o rewrite direto para o backend bufferiza
 * `text/event-stream`. Aqui reencaminhamos o body sem buffer, com
 * headers anti-proxy, e tratamos hang-up do browser/backend como
 * disconnect normal — senão o Next relança `failed to pipe response`
 * (UND_ERR_SOCKET / "other side closed") como erro não capturado.
 */
const UPSTREAM_PATH = "/api/sse/messages";

let loggedBenignDisconnect = false;

function isBenignSseDisconnect(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as {
    name?: string;
    code?: string;
    message?: string;
    cause?: unknown;
  };
  if (e.name === "AbortError" || e.name === "ResponseAborted") return true;
  if (
    e.code === "UND_ERR_SOCKET" ||
    e.code === "ECONNRESET" ||
    e.code === "EPIPE" ||
    e.code === "ERR_STREAM_PREMATURE_CLOSE"
  ) {
    return true;
  }
  const msg = String(e.message ?? "");
  if (/other side closed|socket hang up|aborted|terminated|premature close/i.test(msg)) {
    return true;
  }
  return e.cause != null && isBenignSseDisconnect(e.cause);
}

function warnBenignDisconnectOnce(err: unknown) {
  if (loggedBenignDisconnect) return;
  loggedBenignDisconnect = true;
  const e = err as { code?: string; message?: string };
  console.warn(
    "[sse-proxy] disconnect (abort / socket close) — further ones suppressed:",
    e.code ?? e.message ?? err,
  );
}

function proxySseBody(
  upstreamBody: ReadableStream<Uint8Array>,
  clientSignal: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  const cancelUpstream = () => {
    void reader.cancel().catch(() => {});
  };
  if (clientSignal.aborted) {
    cancelUpstream();
  } else {
    clientSignal.addEventListener("abort", cancelUpstream, { once: true });
  }

  return new ReadableStream({
    async pull(controller) {
      if (clientSignal.aborted) {
        cancelUpstream();
        controller.close();
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        if (isBenignSseDisconnect(err) || clientSignal.aborted) {
          warnBenignDisconnectOnce(err);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }
        controller.error(err);
      }
    },
    cancel() {
      cancelUpstream();
    },
  });
}

function idlePreviewSse(): Response {
  return new Response(": preview\n\n", {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(request: Request) {
  let base: string;
  try {
    base = backendBase();
  } catch {
    // Preview/local sem backend: EventSource 500 derrubava o overlay e
    // poluía o dashboard. Stream vazio mantém a conexão quieta.
    return idlePreviewSse();
  }

  const cookie = request.headers.get("cookie") ?? "";
  const authorization = request.headers.get("authorization") ?? "";

  let upstream: Response;
  try {
    upstream = await fetch(`${base}${UPSTREAM_PATH}`, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: "no-store",
      signal: request.signal,
    });
  } catch (err) {
    if (isBenignSseDisconnect(err) || request.signal.aborted) {
      warnBenignDisconnectOnce(err);
      return new Response(null, { status: 204 });
    }
    throw err;
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || "Falha ao abrir SSE no backend", {
      status: upstream.status || 502,
    });
  }

  return new Response(proxySseBody(upstream.body, request.signal), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
