"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";

import { AuthSurface } from "@/components/ui/auth-surface";
import { BlurText } from "@/components/ui/blur-text";
import { Button } from "@/components/ui/button";
import { HeroGeometric } from "@/components/ui/hero-geometric";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <AuthSurface>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              <BlurText
                text="Nova senha"
                delay={70}
                className="font-bold text-foreground"
              />
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Defina uma senha com no mínimo 8 caracteres.
            </p>
          </div>

          {done ? (
            <p className="text-sm text-foreground">
              Senha atualizada.{" "}
              <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Entrar
              </Link>
            </p>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="np">Senha</Label>
                <Input
                  id="np"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="np2">Confirmar</Label>
                <Input
                  id="np2"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvar senha
              </Button>
            </form>
          )}
        </AuthSurface>
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
