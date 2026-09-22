/**
 * POST /api/transcribe  (rota frontend — servidor Next.js)
 *
 * Encaminha o download do áudio ao backend autenticado (cookie), sem
 * fetch direto da URL extraída do proxy Meta (SSRF).
 *
 * Body : { url: string }
 * Resp : { transcript: string }
 */
import { NextResponse, type NextRequest } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

function backendBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

function toInternalMediaPath(url: string): string {
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    if (
      parsed.pathname.startsWith("/api/storage/") ||
      parsed.pathname.startsWith("/api/media/proxy") ||
      parsed.pathname.startsWith("/uploads/")
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* mantém a URL original */
  }
  return url;
}

async function fetchAudioBytes(
  rawUrl: string,
  cookieHeader: string,
): Promise<{ buffer: ArrayBuffer; mime: string; filename: string } | null> {
  const url = toInternalMediaPath(rawUrl);
  const isInternal =
    url.startsWith("/api/media/proxy") ||
    url.startsWith("/api/storage/") ||
    url.startsWith("/uploads/");
  if (!isInternal) return null;

  const base = backendBase();
  const backendPath = url.startsWith("/uploads/") ? `/api${url}` : url;
  const href = base ? `${base}${backendPath}` : backendPath;
  try {
    const res = await fetch(href, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_AUDIO_BYTES) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_AUDIO_BYTES) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "audio/ogg";
    const rawName = backendPath.split("?")[0]?.split("/").pop() ?? "audio.ogg";
    const filename = rawName.includes(".") ? rawName : "audio.ogg";
    return { buffer, mime, filename };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY não configurada no servidor." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const url = (body as Record<string, unknown>)?.url;
  if (typeof url !== "string" || !url) {
    return NextResponse.json(
      { error: "Campo 'url' é obrigatório." },
      { status: 400 },
    );
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const resolved = await fetchAudioBytes(url, cookieHeader);
  if (!resolved) {
    return NextResponse.json(
      { error: "Não foi possível acessar o áudio. Verifique se o arquivo existe." },
      { status: 404 },
    );
  }

  const ext = resolved.filename.includes(".")
    ? resolved.filename.split(".").pop()!
    : "ogg";
  const filename = `audio.${ext}`;

  const form = new FormData();
  form.append(
    "file",
    new Blob([resolved.buffer], { type: resolved.mime }),
    filename,
  );
  form.append("model", GROQ_MODEL);
  form.append("language", "pt");
  form.append("response_format", "json");

  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error("[transcribe] Groq fetch error:", err);
    return NextResponse.json(
      { error: "Timeout ou falha de rede ao conectar com o Groq." },
      { status: 504 },
    );
  }

  if (!groqRes.ok) {
    const errBody = await groqRes.text().catch(() => "");
    console.error(`[transcribe] Groq ${groqRes.status}:`, errBody.slice(0, 300));
    return NextResponse.json(
      { error: `Groq retornou erro ${groqRes.status}.` },
      { status: 502 },
    );
  }

  const data = (await groqRes.json()) as { text?: string };
  return NextResponse.json({ transcript: (data.text ?? "").trim() });
}
