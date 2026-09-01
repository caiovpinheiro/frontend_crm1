"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";

import { HeroGeometric } from "@/components/ui/hero-geometric";
import { resolveTenantFromRequest } from "@/lib/tenant-host";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState((searchParams.get("email") ?? "").trim());
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    "Enviamos um código de 6 dígitos para o seu e-mail.",
  );

  function orgSlug(): string | undefined {
    if (typeof window === "undefined") return undefined;
    const r = resolveTenantFromRequest({ hostHeader: window.location.host });
    return r.kind === "tenant" ? r.slug : undefined;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          organizationSlug: orgSlug(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Código inválido.");
      }
      router.push(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          organizationSlug: orgSlug(),
        }),
      });
      setInfo("Se a conta ainda não estiver confirmada, enviamos um novo código.");
    } finally {
      setResending(false);
    }
  }

  return (
    <HeroGeometric color1="#a78bfa" color2="#f472b6" speed={1}>
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-overlay w-full max-w-sm rounded-[var(--radius-2xl)] p-8 text-white">
          <h1 className="mb-1 text-xl font-semibold">Confirme seu e-mail</h1>
          <p className="mb-6 text-[13px] text-white/70">{info}</p>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
            <label className="text-[13px]" htmlFor="ve-email">
              E-mail
            </label>
            <input
              id="ve-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-full border border-white/15 bg-white/5 px-4 text-sm outline-none"
            />
            <label className="text-[13px]" htmlFor="ve-code">
              Código
            </label>
            <input
              id="ve-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-11 rounded-full border border-white/15 bg-white/5 px-4 text-center text-lg tracking-[0.4em] outline-none"
              placeholder="000000"
            />
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="mt-2 flex h-11 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-zinc-900 disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmar
            </button>
          </form>
          <button
            type="button"
            disabled={resending || !email.trim()}
            onClick={() => void resend()}
            className="mt-4 w-full text-center text-[13px] text-white/70 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {resending ? "Enviando…" : "Reenviar código"}
          </button>
          <p className="mt-4 text-center text-[13px] text-white/60">
            <Link href="/login" className="hover:underline">
              Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    </HeroGeometric>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <VerifyForm />
    </Suspense>
  );
}
