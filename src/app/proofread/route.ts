/**
 * POST /proofread  (rota frontend — servidor Next.js)
 *
 * Checa ortografia/gramática via LanguageTool antes do envio no composer.
 * O browser chama `/api/proofread`; `next.config.ts` reescreve para cá
 * porque `afterFiles` `/api/:path*` ganharia do App Router em `/api/*`.
 *
 * Body : { text: string, language?: "pt-BR" }
 * Resp : { ok: boolean, suggested: string, matches: ProofreadMatch[] }
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  applyLanguageToolReplacements,
  type ProofreadMatch,
  type ProofreadResult,
} from "@/lib/language-tool";

const DEFAULT_CHECK_URL = "https://api.languagetool.org/v2/check";
const MAX_TEXT_LENGTH = 20_000;
const LANGUAGE_RE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function languageToolCheckUrl(): string {
  const raw = (process.env.LANGUAGETOOL_API_URL ?? DEFAULT_CHECK_URL).trim();
  if (!raw) return DEFAULT_CHECK_URL;
  if (raw.includes("/v2/check")) return raw;
  return `${raw.replace(/\/$/, "")}/v2/check`;
}

type LtReplacement = { value?: unknown };
type LtMatch = {
  message?: unknown;
  shortMessage?: unknown;
  offset?: unknown;
  length?: unknown;
  replacements?: LtReplacement[];
};

function normalizeMatches(raw: unknown): ProofreadMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: ProofreadMatch[] = [];
  for (const item of raw as LtMatch[]) {
    const offset = typeof item.offset === "number" ? item.offset : NaN;
    const length = typeof item.length === "number" ? item.length : NaN;
    if (!Number.isFinite(offset) || !Number.isFinite(length)) continue;
    const replacements = (item.replacements ?? [])
      .map((r) => (typeof r?.value === "string" ? r.value : ""))
      .filter((v) => v.length > 0);
    const message =
      typeof item.message === "string" && item.message.trim()
        ? item.message
        : "Possível erro encontrado.";
    out.push({
      message,
      shortMessage:
        typeof item.shortMessage === "string" && item.shortMessage.trim()
          ? item.shortMessage
          : undefined,
      offset,
      length,
      replacements,
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "Campo 'text' é obrigatório." }, { status: 400 });
  }

  const languageRaw =
    typeof record.language === "string" && record.language.trim()
      ? record.language.trim()
      : "pt-BR";
  const language = LANGUAGE_RE.test(languageRaw) ? languageRaw : "pt-BR";

  if (text.length > MAX_TEXT_LENGTH) {
    const passthrough: ProofreadResult = { ok: true, suggested: text, matches: [] };
    return NextResponse.json(passthrough);
  }

  const params = new URLSearchParams();
  params.set("text", text);
  params.set("language", language);
  const apiKey = (process.env.LANGUAGETOOL_API_KEY ?? "").trim();
  const username = (process.env.LANGUAGETOOL_USERNAME ?? "").trim();
  if (apiKey) params.set("apiKey", apiKey);
  if (username) params.set("username", username);

  let ltRes: Response;
  try {
    ltRes = await fetch(languageToolCheckUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "Bwipo-CRM-Proofread/1.0",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error("[proofread] LanguageTool fetch error:", err);
    return NextResponse.json(
      { error: "Timeout ou falha de rede ao conectar com o LanguageTool." },
      { status: 504 },
    );
  }

  if (!ltRes.ok) {
    const errBody = await ltRes.text().catch(() => "");
    console.error(`[proofread] LanguageTool ${ltRes.status}:`, errBody.slice(0, 300));
    return NextResponse.json(
      { error: `LanguageTool retornou erro ${ltRes.status}.` },
      { status: 502 },
    );
  }

  const data = (await ltRes.json().catch(() => ({}))) as { matches?: unknown };
  const matches = normalizeMatches(data.matches);
  const suggested = applyLanguageToolReplacements(text, matches);
  const result: ProofreadResult = {
    ok: matches.length === 0,
    suggested,
    matches,
  };
  return NextResponse.json(result);
}
