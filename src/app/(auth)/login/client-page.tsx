"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { IconAlertCircle as AlertCircle, IconEye as Eye, IconEyeOff as EyeOff, IconLoader2 as Loader2, IconLogin as LogIn } from "@tabler/icons-react";
import { motion } from "framer-motion";

import { BlurText } from "@/components/ui/blur-text";
import { Button } from "@/components/ui/button";
import { HeroGeometric } from "@/components/ui/hero-geometric";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isNativePlatform } from "@/lib/native/capacitor";
import { isPreviewMode, isV0PreviewHost } from "@/lib/preview-mode";
import {
  isMarketingApexHost,
  isSingleHostCrm,
  resolveTenantFromRequest,
} from "@/lib/tenant-host";
import { buildTenantUrl } from "@/lib/tenant-url";
import {
  OrgAccountPicker,
  type TenantOrgChoice,
} from "./org-account-picker";

const DEV_PREVIEW_ORGS: TenantOrgChoice[] = [
  { slug: "anhanguera-comercial", name: "ANHANGUERA COMERCIAL", status: "ARCHIVED" },
  { slug: "cruzeiro-ead", name: "CRUZEIRO ACADÊMICO", status: "ARCHIVED" },
  { slug: "cruzeiro-comercial", name: "CRUZEIRO COMERCIAL", status: "ACTIVE" },
  { slug: "uead", name: "UEaD", status: "ARCHIVED" },
];

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
    // DEV_BRANCH: o filtro de `easypanel.host` do main descartaria a URL de
    // dev e cairia no default `bwipo.com` do `getTenantBaseDomain()` — o app
    // mobile de dev logaria em produção. Aqui a URL de dev é a correta.
    return (
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "https://crm-dev-frontend.ca31ey.easypanel.host"
    );
  }
  return origin;
}

function isApexLoginHost(): boolean {
  if (typeof window === "undefined") return false;
  return isMarketingApexHost(window.location.host);
}

const loginFieldVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = safeInternalPath(searchParams.get("callbackUrl"), "/dashboard");
  const emailFromQuery = (searchParams.get("email") ?? "").trim();
  const orgFromQuery = (searchParams.get("org") ?? "").trim().toLowerCase();
  const previewOrgs =
    process.env.NODE_ENV === "development" &&
    searchParams.get("previewOrgs") === "1";

  const [email, setEmail] = useState(
    emailFromQuery || (previewOrgs ? "caio.vinicius@eduit.com.br" : ""),
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [identifyOnly, setIdentifyOnly] = useState(false);
  const [previewAllowed, setPreviewAllowed] = useState(false);
  const [errorBump, setErrorBump] = useState(0);
  const [orgChoices, setOrgChoices] = useState<TenantOrgChoice[] | null>(
    previewOrgs ? DEV_PREVIEW_ORGS : null,
  );
  const [welcomeName, setWelcomeName] = useState<string | null>(
    previewOrgs ? "Caio" : null,
  );
  const [selectedOrgSlug, setSelectedOrgSlug] = useState<string | null>(
    orgFromQuery || null,
  );
  const passwordRef = useRef<HTMLInputElement>(null);

  function hostTenantSlug(): string | null {
    if (typeof window === "undefined") return null;
    const tenant = resolveTenantFromRequest({
      hostHeader: window.location.host,
    });
    return tenant.kind === "tenant" ? tenant.slug : null;
  }

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

  function goToOrgLogin(slug: string, nextEmail: string) {
    if (isSingleHostCrm(window.location.host)) {
      setSelectedOrgSlug(slug);
      setOrgChoices(null);
      setIdentifyOnly(false);
      setError(null);
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }
    const next = new URL(`${buildTenantUrl(slug)}/login`);
    next.searchParams.set("email", nextEmail);
    next.searchParams.set("org", slug);
    if (callbackUrl && callbackUrl !== "/dashboard") {
      next.searchParams.set("callbackUrl", callbackUrl);
    }
    window.location.assign(next.toString());
  }

  function handleSelectOrg(org: TenantOrgChoice) {
    if (org.status !== "ACTIVE") {
      showError("Esta organização está expirada e não pode ser acessada.");
      return;
    }
    goToOrgLogin(org.slug, email.trim());
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
          | {
              ok?: boolean;
              slug?: string | null;
              apex?: boolean;
              orgs?: TenantOrgChoice[];
              displayName?: string | null;
            }
          | null;
        if (!res.ok || !data?.ok) {
          showError("Não encontramos uma conta com este e-mail.");
          return;
        }
        const orgs = Array.isArray(data.orgs) ? data.orgs : [];
        if (orgs.length > 1) {
          setWelcomeName(data.displayName ?? null);
          setOrgChoices(orgs);
          return;
        }
        if (data.slug) {
          goToOrgLogin(data.slug, email.trim());
          return;
        }
        setIdentifyOnly(false);
        requestAnimationFrame(() => passwordRef.current?.focus());
        return;
      }

      let orgSlug = selectedOrgSlug || hostTenantSlug() || orgFromQuery || "";
      if (!orgSlug) {
        const lookupRes = await fetch("/api/auth/tenant-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        const lookup = (await lookupRes.json().catch(() => null)) as
          | {
              ok?: boolean;
              orgs?: TenantOrgChoice[];
              displayName?: string | null;
              slug?: string | null;
            }
          | null;
        const orgs = Array.isArray(lookup?.orgs) ? lookup.orgs : [];
        if (lookupRes.ok && lookup?.ok && orgs.length > 1) {
          setWelcomeName(lookup.displayName ?? null);
          setOrgChoices(orgs);
          return;
        }
        orgSlug = lookup?.slug ?? orgs[0]?.slug ?? "";
        if (orgSlug) setSelectedOrgSlug(orgSlug);
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        organizationSlug: orgSlug,
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
        } else if (result.code === "email_unverified") {
          const q = new URLSearchParams();
          if (email.trim()) q.set("email", email.trim());
          showError(
            "Confirme seu e-mail para entrar. Enviamos um código de 6 dígitos.",
          );
          window.setTimeout(() => {
            window.location.assign(`/verify-email?${q.toString()}`);
          }, 800);
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

  if (orgChoices && orgChoices.length > 1) {
    return (
      <OrgAccountPicker
        email={email.trim() || emailFromQuery}
        displayName={welcomeName}
        orgs={orgChoices}
        error={error}
        onSelect={handleSelectOrg}
        onExit={() => {
          setOrgChoices(null);
          setError(null);
          if (previewOrgs) {
            window.location.assign("/login");
            return;
          }
          setIdentifyOnly(isApexLoginHost());
        }}
      />
    );
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
          {/* Wordmark Bwipo: marca + wipo branco (fundo transparente) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-bwipo-white.png"
            alt="Bwipo"
            className="mb-4 h-12 w-auto max-w-[220px] object-contain"
          />
          <p className="mt-1 text-[14px] text-white/70">
            {identifyOnly
              ? "Informe seu e-mail para abrir o login da sua empresa."
              : "Faça login para gerenciar conversas e negócios."}
          </p>
        </div>

        <motion.div
          className="relative w-full"
          initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(14px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="absolute -inset-2 rounded-3xl bg-linear-to-br from-primary/20 via-primary/5 to-transparent blur-2xl" />
          <motion.form
            onSubmit={handleSubmit}
            className="relative flex w-full flex-col gap-4 rounded-2xl border border-border bg-background p-6 text-foreground shadow-xl md:p-8"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } },
            }}
          >
          <motion.div variants={loginFieldVariants}>
            <h2 className="text-xl font-bold text-foreground">
              <BlurText
                text={identifyOnly ? "Encontre sua empresa" : "Entrar na sua conta"}
                delay={70}
                className="font-bold text-foreground"
              />
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              <BlurText
                text={
                  identifyOnly
                    ? "Informe seu e-mail para abrir o login da sua empresa."
                    : "Use o e-mail e a senha da sua organização."
                }
                delay={40}
                startDelay={160}
                className="text-xs text-muted-foreground"
              />
            </p>
          </motion.div>

          <motion.div variants={loginFieldVariants}>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="mt-1.5"
            />
          </motion.div>

          {!identifyOnly ? (
            <motion.div variants={loginFieldVariants}>
              <Label htmlFor="password">Senha</Label>
              <div className="relative mt-1.5">
                <Input
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
                  className="pr-11"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <div className="mt-1.5 flex justify-end">
                <Link
                  href={
                    email.trim()
                      ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
                      : "/forgot-password"
                  }
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Esqueci a senha
                </Link>
              </div>
            </motion.div>
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
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">{error}</span>
            </motion.div>
          ) : null}

          <motion.div variants={loginFieldVariants}>
            <Button type="submit" disabled={loading} className="w-full">
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
            </Button>
          </motion.div>

          {previewAllowed ? (
            <a
              href={`/api/preview-login?redirect=${encodeURIComponent(callbackUrl)}`}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-warning)]/60 bg-[var(--color-warning)]/10 text-sm font-medium text-[var(--color-warning)] transition-all hover:bg-[var(--color-warning)]/20"
              title="Disponível apenas em ambientes de preview (v0.dev). Pula a autenticação."
            >
              <Eye className="size-4" />
              Entrar (preview)
            </a>
          ) : null}

          <motion.p className="text-center text-xs text-muted-foreground" variants={loginFieldVariants}>
            Não tem uma conta?{" "}
            <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Criar conta
            </Link>
          </motion.p>
          <motion.p className="text-center text-xs text-muted-foreground" variants={loginFieldVariants}>
            <Link
              href="/?cadastro=empresa"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Cadastre sua empresa
            </Link>
          </motion.p>
          </motion.form>
        </motion.div>

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
