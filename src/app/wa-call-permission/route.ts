import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

import { backendBase } from "@/lib/api-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Fora de `/api/*` de propósito. O rewrite `afterFiles` `/api/:path*` do
 * Next intercepta App Router em `/api/...` e o Traefik devolve 502 HTML
 * (2871 bytes) antes do handler local. Este path não casa com o rewrite.
 */
const UPSTREAM_TIMEOUT_MS = 2_500;

export async function POST(request: Request) {
  let base: string;
  try {
    base = backendBase();
  } catch {
    return NextResponse.json(
      { message: "Backend não configurado (NEXT_PUBLIC_API_BASE_URL)." },
      { status: 503 },
    );
  }

  const cookie = request.headers.get("cookie") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const contentType = request.headers.get("content-type") ?? "application/json";
  const body = await request.text().catch(() => "");

  let conversationId = "";
  try {
    const parsed = JSON.parse(body) as { conversationId?: unknown };
    conversationId =
      typeof parsed.conversationId === "string" ? parsed.conversationId.trim() : "";
  } catch {
    /* body inválido — o backend responde 400 */
  }
  if (!conversationId) {
    return NextResponse.json(
      { message: "Informe conversationId no corpo." },
      { status: 400 },
    );
  }

  try {
    const upstream = await Promise.race([
      fetch(
        `${base}/api/conversations/${encodeURIComponent(conversationId)}/call-permission`,
        {
          method: "POST",
          headers: {
            "Content-Type": contentType,
            Accept: "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body,
          cache: "no-store",
        },
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          const err = new Error("timeout");
          err.name = "TimeoutError";
          reject(err);
        }, UPSTREAM_TIMEOUT_MS);
      }),
    ]);

    const text = await upstream.text();
    const ct = upstream.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return new NextResponse(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return NextResponse.json(
      {
        message:
          "O envio do template não retornou JSON (gateway). Tente novamente.",
      },
      { status: 502 },
    );
  } catch (e) {
    const timedOut =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    logger.error("wa-call-permission-proxy", timedOut ? "timeout" : "falha", e);
    return NextResponse.json(
      {
        message: timedOut
          ? "A Meta não respondeu a tempo ao enviar o template. Tente novamente."
          : "Falha ao falar com o servidor ao enviar o template.",
      },
      { status: 504 },
    );
  }
}
