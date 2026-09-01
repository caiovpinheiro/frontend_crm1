"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";

import { HeroGeometric } from "@/components/ui/hero-geometric";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") ?? "").trim();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (!token) {
      setError("Link inválido. Peça um novo e-mail de redefinição.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Link inválido ou expirado.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <HeroGeometric color1="#a78bfa" color2="#f472b6" speed={1}>
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-overlay w-full max-w-sm rounded-[var(--radius-2xl)] p-8 text-white">
          <h1 className="mb-1 text-xl font-semibold">Nova senha</h1>
          {done ? (
            <p className="mt-4 text-sm text-white/85">
              Senha atualizada.{" "}
              <Link href="/login" className="underline">
                Entrar
              </Link>
            </p>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="mt-6 flex flex-col gap-3">
              <label className="text-[13px]" htmlFor="np">
                Senha
              </label>
              <input
                id="np"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-full border border-white/15 bg-white/5 px-4 text-sm outline-none"
              />
              <label className="text-[13px]" htmlFor="np2">
                Confirmar
              </label>
              <input
                id="np2"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11 rounded-full border border-white/15 bg-white/5 px-4 text-sm outline-none"
              />
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex h-11 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-zinc-900 disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvar senha
              </button>
            </form>
          )}
        </div>
      </div>
    </HeroGeometric>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ResetForm />
    </Suspense>
  );
}
