"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";

import { AuthSurface } from "@/components/ui/auth-surface";
import { BlurText } from "@/components/ui/blur-text";
import { Button } from "@/components/ui/button";
import { HeroGeometric } from "@/components/ui/hero-geometric";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <AuthSurface>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              <BlurText
                text="Confirme seu e-mail"
                delay={70}
                className="font-bold text-foreground"
              />
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">{info}</p>
          </div>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="ve-email">E-mail</Label>
              <Input
                id="ve-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="ve-code">Código</Label>
              <Input
                id="ve-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1.5 text-center text-lg tracking-[0.4em]"
                placeholder="000000"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmar
            </Button>
          </form>
          <button
            type="button"
            disabled={resending || !email.trim()}
            onClick={() => void resend()}
            className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {resending ? "Enviando…" : "Reenviar código"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Voltar ao login
            </Link>
          </p>
        </AuthSurface>
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
