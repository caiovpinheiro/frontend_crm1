"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";

import { AuthSurface } from "@/components/ui/auth-surface";
import { BlurText } from "@/components/ui/blur-text";
import { Button } from "@/components/ui/button";
import { HeroGeometric } from "@/components/ui/hero-geometric";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isMarketingApexHost } from "@/lib/tenant-host";
import { buildTenantUrl } from "@/lib/tenant-url";

type OrgChoice = { slug: string; name: string; status: string };

function ForgotForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState((searchParams.get("email") ?? "").trim());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgChoice[] | null>(null);

  const autoSent = useRef(false);

  async function postReset(organizationSlug?: string) {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        organizationSlug,
      }),
    });
    if (!res.ok && res.status === 429) {
      throw new Error("Muitas tentativas. Aguarde um minuto.");
    }
    setDone(true);
  }

  useEffect(() => {
    if (autoSent.current) return;
    const q = (searchParams.get("email") ?? "").trim();
    if (!q) return;
    if (typeof window === "undefined") return;
    if (isMarketingApexHost(window.location.host)) return;
    autoSent.current = true;
    setLoading(true);
    void postReset()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível enviar.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez no landing do tenant
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const host = window.location.host;
      const onApex = isMarketingApexHost(host);
      if (onApex) {
        const lookup = await fetch("/api/auth/tenant-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        const data = (await lookup.json().catch(() => ({}))) as {
          ok?: boolean;
          slug?: string | null;
          orgs?: OrgChoice[];
        };
        if (data?.ok && Array.isArray(data.orgs) && data.orgs.length > 1) {
          setOrgs(data.orgs.filter((o) => o.status === "ACTIVE"));
          return;
        }
        if (data?.ok && data.slug) {
          window.location.assign(
            `${buildTenantUrl(data.slug)}/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`,
          );
          return;
        }
        setDone(true);
        return;
      }
      await postReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setLoading(false);
    }
  }

  async function pickOrg(slug: string) {
    setLoading(true);
    setError(null);
    try {
      window.location.assign(
        `${buildTenantUrl(slug)}/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <HeroGeometric color1="#a78bfa" color2="#f472b6" speed={1}>
      <div className="flex min-h-screen items-center justify-center p-6">
        <AuthSurface>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              <BlurText
                text="Esqueci a senha"
                delay={70}
                className="font-bold text-foreground"
              />
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Enviamos um link de 30 minutos se existir uma conta com este e-mail.
            </p>
          </div>

          {done ? (
            <p className="text-sm text-foreground">
              Se existir uma conta, as instruções já foram enviadas. Confira a
              caixa de entrada e o spam.
            </p>
          ) : orgs && orgs.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Selecione a organização:</p>
              {orgs.map((o) => (
                <button
                  key={o.slug}
                  type="button"
                  disabled={loading}
                  onClick={() => void pickOrg(o.slug)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-foreground hover:border-primary/40"
                >
                  {o.name}
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="fp-email">E-mail</Label>
                <Input
                  id="fp-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5"
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={loading || !email.trim()} className="w-full">
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Enviar link
              </Button>
            </form>
          )}

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

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ForgotForm />
    </Suspense>
  );
}
