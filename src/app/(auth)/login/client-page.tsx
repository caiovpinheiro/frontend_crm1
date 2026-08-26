"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { IconAlertCircle as AlertCircle, IconEye as Eye, IconEyeOff as EyeOff, IconLoader2 as Loader2, IconLock as Lock, IconLogin as LogIn, IconMail as Mail } from "@tabler/icons-react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { HeroGeometric } from "@/components/ui/hero-geometric";
import { isNativePlatform } from "@/lib/native/capacitor";
import { isPreviewMode, isV0PreviewHost } from "@/lib/preview-mode";
import { resolveTenantFromRequest } from "@/lib/tenant-host";
import { buildTenantUrl, getTenantBaseDomain, getTenantProtocol } from "@/lib/tenant-url";

function LoginShellFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="mx-auto h-20 w-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--glass-bg-panel)]" />
        <div className="h-64 w-full animate-pulse rounded-[var(--radius-card)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] backdrop-blur" />
      </div>
    </div>
  );
}

function safeInternalPath(raw: string | null, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
  return t;
}

/**
 * Origem pós-login.
 * No APK Capacitor o `window.location.origin` vira `https://localhost`
 * (androidScheme) e redirecionar pra lá perde o cookie do CRM — nesse
 * caso usamos o host web. No browser (incl. localhost local) permanece
 * na origem atual para não expulsar o dev para produção.
 */
function resolvePostLoginOrigin(): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  if (
    isNativePlatform() ||
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://")
  ) {
    const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (app && !/easypanel\.host/i.test(app)) return app;
    return `${getTenantProtocol()}://${getTenantBaseDomain()}`;
  }
  return origin;
}

function isApexLoginHost(): boolean {
  if (typeof window === "undefined") return false;
  return resolveTenantFromRequest({ hostHeader: window.location.host }).kind === "apex";
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = safeInternalPath(searchParams.get("callbackUrl"), "/dashboard");
  const emailFromQuery = (searchParams.get("email") ?? "").trim();

  const [email, setEmail] = useState(emailFromQuery);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [identifyOnly, setIdentifyOnly] = useState(false);
  const [previewAllowed, setPreviewAllowed] = useState(false);
  const [errorBump, setErrorBump] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewAllowed(isPreviewMode() || isV0PreviewHost());
    if (isApexLoginHost() && !emailFromQuery) {
      setIdentifyOnly(true);
    }
  }, [emailFromQuery]);

  useEffect(() => {
    if (!loginSuccess) return;
    const id = window.setTimeout(() => {
      // Navegação completa: o cookie definido na resposta do `signIn` segue no próximo pedido HTTP.
      // No APK (Capacitor), `window.location.origin` às vezes vira `https://localhost`
      // por causa do androidScheme — redirecionar pra lá perde o cookie do CRM.
      const origin = resolvePostLoginOrigin();
      window.location.assign(`${origin}${callbackUrl}`);
    }, 1500);
    return () => window.clearTimeout(id);
  }, [loginSuccess, callbackUrl]);

  /**
   * Bug fix: em algumas situações o `signIn("credentials", { redirect: false })`
   * retorna `{ ok: true, error: "..." }` mesmo quando o `authorize` rejeita
   * a credencial (depende da versão de `next-auth/react`). Centralizamos a
   * checagem aqui pra que toda nova ramificação que detectar falha caia
   * NUNCA no branch de `setLoginSuccess(true)` (que mostra "Acesso liberado").
   *
   * Critério rígido de sucesso: `ok === true` E sem `error`.
   */
  function showError(message: string) {
    setError(message);
    setLoginSuccess(false);
    setErrorBump((n) => n + 1);
    // Devolve foco pro campo de senha pra reentrada rápida; SR anuncia o
    // alerta via `aria-live="assertive"` no nó do erro.
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (identifyOnly) {
        const res = await fetch("/api/auth/tenant-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; slug?: string | null; apex?: boolean }
          | null;
        if (!res.ok || !data?.ok) {
          showError("Não encontramos uma conta com este e-mail.");
          return;
        }
        if (data.slug) {
          const next = new URL(`${buildTenantUrl(data.slug)}/login`);
          next.searchParams.set("email", email.trim());
          if (callbackUrl && callbackUrl !== "/dashboard") {
            next.searchParams.set("callbackUrl", callbackUrl);
          }
          window.location.assign(next.toString());
          return;
        }
        setIdentifyOnly(false);
        requestAnimationFrame(() => passwordRef.current?.focus());
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result === undefined) {
        showError(
          "Não foi possível iniciar o login. Recarregue a página ou verifique se /api/auth está acessível.",
        );
        return;
      }

      // Checagem estrita: ok=true E sem error. Cobre o caso (raro mas
      // documentado) de o `next-auth/react` retornar `ok: true` com
      // `error` setado quando o callback responde 200 mas o authorize
      // recusou — exatamente o sintoma reportado ("aparece como sucedido,
      // mas volta pra preencher").
      const hasError = !result.ok || Boolean(result.error);

      if (hasError) {
        if (result.code === "database_unavailable") {
          showError(
            "Não foi possível conectar ao banco de dados. Inicie o PostgreSQL (ex.: docker compose up -d) e confira o DATABASE_URL no .env.",
          );
        } else if (result.code === "account_locked") {
          showError(
            "Conta temporariamente bloqueada por várias tentativas. Aguarde alguns minutos ou peça a um admin para revisar o bloqueio.",
          );
        } else if (result.code === "mfa_required") {
          showError(
            "Esta conta exige MFA. Use o fluxo de código de autenticação (em desenvolvimento no login web).",
          );
        } else {
          // Default: credenciais inválidas (CredentialsSignin) ou qualquer
          // outro erro genérico. Mensagem única evita user-enumeration
          // (não revela se o e-mail existe).
          showError("E-mail ou senha incorretos.");
        }
        return;
      }

      setLoginSuccess(true);
    } catch (err) {
      showError(
        err instanceof Error && err.message.includes("URL")
          ? "Resposta inválida do servidor de autenticação. Atualize as dependências do Auth.js ou abra um issue com o log do Network em /api/auth/callback/credentials."
          : "Erro ao contactar o servidor. Verifique PostgreSQL, NEXTAUTH_URL (ex.: http://localhost:3000) e o console (F12).",
      );
    } finally {
      setLoading(false);
    }
  }

  if (loginSuccess) {
    return (
      <HeroGeometric color1="#a78bfa" color2="#f472b6" speed={1}>
        <div
          className="flex min-h-screen w-full flex-col items-center justify-center gap-5 p-6 text-white"
          role="status"
          aria-live="polite"
          aria-label="Login concluído, carregando o CRM"
        >
          <div className="relative flex size-28 items-center justify-center">
            {/* Anéis pulsantes (efeito de "validação" tipo Lottie) */}
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute size-20 rounded-full border border-[var(--glass-border)]"
                initial={{ scale: 0.7, opacity: 0.6 }}
                animate={{ scale: [0.7, 1.7], opacity: [0.6, 0] }}
                transition={{
                  duration: 2,
                  repeat: Number.POSITIVE_INFINITY,
                  delay: i * 0.55,
                  ease: "easeOut",
                }}
              />
            ))}

            {/* Halo de vidro com pop elástico */}
            <motion.div
              className="relative flex size-24 items-center justify-center rounded-full bg-[var(--glass-bg-subtle)] backdrop-blur-md"
              initial={{ scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 14 }}
            >
              {/* Disco branco interno */}
              <motion.div
                className="flex size-16 items-center justify-center rounded-full bg-white shadow-[0_12px_30px_-8px_rgba(0,0,0,0.45)]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.12, type: "spring", stiffness: 280, damping: 16 }}
              >
                {/* Check desenhado (path animado) */}
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <motion.path
                    d="M4 12.5l5 5L20 6.5"
                    stroke="var(--brand-primary)"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.32, duration: 0.5, ease: "easeInOut" }}
                  />
                </svg>
              </motion.div>
            </motion.div>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="font-display text-[24px] font-bold tracking-tight text-white"
          >
            Acesso liberado
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="text-[14px] text-white/80"
          >
            Carregando o CRM…
          </motion.p>
          <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-[var(--glass-bg-subtle)]">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
          </div>
        </div>
      </HeroGeometric>
    );
  }

  return (
    <HeroGeometric color1="#a78bfa" color2="#f472b6" speed={1}>
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* Logo Bwipo (fundo transparente) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-bwipo.png"
            alt="Bwipo"
            className="mb-4 h-12 w-auto object-contain"
          />
          <p className="mt-1 text-[14px] text-white/70">
            {identifyOnly
              ? "Informe seu e-mail para abrir o login da sua empresa."
              : "Faça login para gerenciar conversas e negócios."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-overlay w-full rounded-[var(--radius-2xl)] p-8"
        >
          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[var(--text-secondary)]">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-11 w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] pl-9 pr-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] backdrop-blur transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            </div>
          </div>

          {!identifyOnly ? (
            <div className="mb-6">
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[var(--text-secondary)]">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  className={cn(
                    "h-11 w-full rounded-full border bg-[var(--glass-bg-base)] pl-9 pr-11 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] backdrop-blur transition-all focus:outline-none focus:ring-2 disabled:opacity-50",
                    error
                      ? "border-[var(--color-danger)]/40 focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20"
                      : "border-[var(--glass-border)] focus:border-primary focus:ring-primary/20",
                  )}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <motion.div
              key={errorBump}
              role="alert"
              aria-live="assertive"
              id="login-error"
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: [0, -8, 8, -6, 6, -3, 3, 0] }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
              className={cn(
                "mb-4 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-[13px] font-medium leading-snug text-[var(--color-danger)] backdrop-blur shadow-[0_4px_12px_-4px_rgba(220,38,38,0.18)]",
              )}
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-danger)]" aria-hidden />
              <span className="flex-1">{error}</span>
            </motion.div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)",
              boxShadow: "0 6px 20px -4px rgba(91,111,245,0.45)",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {identifyOnly ? "Buscando…" : "Entrando…"}
              </>
            ) : (
              <>
                <LogIn className="size-4" />
                {identifyOnly ? "Continuar" : "Entrar"}
              </>
            )}
          </button>

          {previewAllowed ? (
            <a
              href={`/api/preview-login?redirect=${encodeURIComponent(callbackUrl)}`}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--color-warning)]/60 bg-[var(--color-warning)]/10 text-[13px] font-medium text-[var(--color-warning)] backdrop-blur transition-all hover:bg-[var(--color-warning)]/20 active:scale-[0.98]"
              title="Disponível apenas em ambientes de preview (v0.dev). Pula a autenticação."
            >
              <Eye className="size-4" />
              Entrar (preview)
            </a>
          ) : null}

          <p className="mt-4 text-center text-[13px] text-[var(--text-secondary)]">
            Não tem uma conta?{" "}
            <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Criar conta
            </Link>
          </p>
          <p className="mt-2 text-center text-[13px] text-[var(--text-secondary)]">
            <Link
              href="/?cadastro=empresa"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Cadastre sua empresa
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-[12px] text-white/75">Acesso restrito · Bwipo</p>
      </div>
    </div>
    </HeroGeometric>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShellFallback />}>
      <LoginForm />
    </Suspense>
  );
}
