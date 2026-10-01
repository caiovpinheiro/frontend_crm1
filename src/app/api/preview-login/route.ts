/**
 * GET /api/preview-login?redirect=/inbox
 *
 * Emite um JWT de sessão fake para o usuário de preview, ASSINADO COM O
 * `AUTH_SECRET` REAL. Por isso (SEC-13):
 *
 *  - Em produção (`NODE_ENV === "production"`) a rota responde 404 como se
 *    não existisse — a menos que a dupla chave de preview esteja ligada
 *    (`NEXT_PUBLIC_PREVIEW_MODE` + `NEXT_PUBLIC_PREVIEW_MODE_ALLOW_PRODUCTION_BUILD`,
 *    ver `@/lib/preview-mode`). O `Host` NÃO conta em produção.
 *  - Fora de produção: hosts *.vusercontent.net / *.v0.dev / *.v0.app /
 *    *.v0.build / localhost / 127.0.0.1, ou `NEXT_PUBLIC_PREVIEW_MODE=true`.
 *
 * NUNCA ative em produção — libera acesso sem credenciais reais.
 */
import { encode } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { previewLoginDecision } from "@/lib/preview-mode";

export async function GET(req: NextRequest) {
  const decision = previewLoginDecision(req.headers.get("host"));
  if (decision === "not-found") {
    return new NextResponse(null, { status: 404 });
  }
  if (decision === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const redirect = req.nextUrl.searchParams.get("redirect") ?? "/inbox";
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

  // O nome do cookie e a flag `secure` precisam bater EXATAMENTE com a lógica
  // do auth.config.ts (useSecureCookies = NEXTAUTH_URL começa com https://),
  // senão o auth()/middleware leem um cookie com nome diferente do que gravamos.
  const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const cookieName = useSecureCookies
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const maxAge = 60 * 60 * 8; // 8h

  // No Auth.js v5, `salt` é obrigatório e DEVE ser o nome do cookie de sessão.
  const token = await encode({
    salt: cookieName,
    secret,
    maxAge,
    token: {
      sub: "preview-user",
      id: "preview-user",
      name: "Preview User",
      email: "preview@example.com",
      role: "ADMIN",
      organizationId: "preview-org",
      isSuperAdmin: false,
    },
  });

  const response = NextResponse.redirect(new URL(redirect, req.url));
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookies,
    path: "/",
    maxAge,
  });

  return response;
}
