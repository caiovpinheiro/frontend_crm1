import { NextResponse } from "next/server";

import { backendBase } from "@/lib/api-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Fora de `/api/*` de propósito. O rewrite `afterFiles` `/api/:path*` do
 * Next + Traefik devolve 502 HTML quando o Graph demora — o operador vê
 * "Servidor temporariamente indisponível". Este path não casa com o rewrite.
 *
 * Timeout folgado para 1 tentativa Graph (20s) + Prisma; sem retry 3×.
 */
const UPSTREAM_TIMEOUT_MS = 28_000;

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
    const upstream = await fetch(
      `${base}/api/conversations/${encodeURIComponent(conversationId)}/whatsapp-calls`,
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
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );

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
          "Servidor temporariamente indisponível. Tente novamente em instantes.",
      },
      { status: 502 },
    );
  } catch (e) {
    const timedOut =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error("[wa-whatsapp-call-proxy]", e);
    return NextResponse.json(
      {
        message: timedOut
          ? "A Meta não respondeu a tempo ao iniciar a ligação. Tente novamente."
          : "Falha ao falar com o servidor ao ligar. Tente novamente.",
      },
      { status: 504 },
    );
  }
}
