"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { IconLoader2 as Loader2, IconMail as Mail } from "@tabler/icons-react";

import { HeroGeometric } from "@/components/ui/hero-geometric";
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
        <div className="glass-overlay w-full max-w-sm rounded-[var(--radius-2xl)] p-8 text-white">
          <h1 className="mb-1 text-xl font-semibold">Esqueci a senha</h1>
          <p className="mb-6 text-[13px] text-white/70">
            Enviamos um link de 30 minutos se existir uma conta com este e-mail.
          </p>

          {done ? (
            <p className="text-sm text-white/85">
              Se existir uma conta, as instruções já foram enviadas. Confira a
              caixa de entrada e o spam.
            </p>
          ) : orgs && orgs.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-white/80">Selecione a organização:</p>
              {orgs.map((o) => (
                <button
                  key={o.slug}
                  type="button"
                  disabled={loading}
                  onClick={() => void pickOrg(o.slug)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
                >
                  {o.name}
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
              <label className="text-[13px] font-medium text-white/80" htmlFor="fp-email">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                <input
                  id="fp-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-full border border-white/15 bg-white/5 pl-9 pr-4 text-sm outline-none focus:border-white/40"
                />
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-zinc-900 disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Enviar link
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-[13px] text-white/60">
            <Link href="/login" className="underline-offset-4 hover:underline">
              Voltar ao login
            </Link>
          </p>
        </div>
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
