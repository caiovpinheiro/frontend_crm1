import type { NextAuthConfig } from "next-auth";

import type { AppUserRole } from "./auth-types";
import { logger } from "./logger";

/**
 * Config compartilhada (sem Prisma) para uso no middleware Edge / RSC.
 * Cookies de sessão são emitidos pelo backend (rewrite /api/auth/*);
 * o Domain=`.{TENANT_BASE_DOMAIN}` fica na config do BE.
 */
const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";

export default {
  /** Garante o mesmo segredo no middleware (Edge) e nos handlers (Node). */
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  /**
   * Silencia o ruído de `JWTSessionError` ("no matching decryption secret"):
   * acontece quando o navegador ainda tem um cookie cifrado com um segredo
   * antigo. O wrapper em `auth-public.ts` já trata isso como "sem sessão";
   * aqui só evitamos poluir o console com o stack trace esperado. Demais
   * erros continuam sendo logados normalmente.
   */
  logger: {
    error(error: Error) {
      if (error?.name === "JWTSessionError") return;
      logger.error("auth", error?.name ?? "erro", error);
    },
  },
  /** Em HTTPS, cookies só por canal seguro (mitiga roubo de sessão em redes mistas). */
  useSecureCookies: nextAuthUrl.startsWith("https://"),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: AppUserRole | null }).role ?? undefined;
        token.organizationId =
          (user as { organizationId?: string | null }).organizationId ?? null;
        token.organizationSlug =
          (user as { organizationSlug?: string | null }).organizationSlug ??
          null;
        token.isSuperAdmin = Boolean(
          (user as { isSuperAdmin?: boolean }).isSuperAdmin,
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: unknown }).role = token.role;
        (session.user as { organizationId?: string | null }).organizationId =
          (token.organizationId as string | null | undefined) ?? null;
        (session.user as { organizationSlug?: string | null }).organizationSlug =
          (token.organizationSlug as string | null | undefined) ?? null;
        (session.user as { isSuperAdmin?: boolean }).isSuperAdmin = Boolean(
          token.isSuperAdmin,
        );
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
