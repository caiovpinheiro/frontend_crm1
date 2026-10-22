"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useEmbeddedSignup } from "@/hooks/use-embedded-signup";
import { apiUrl } from "@/lib/api";
import { getTenantBaseDomain } from "@/lib/tenant-url";

function tenantReturnUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    const base = getTenantBaseDomain();
    const onTenant =
      host === base ||
      host.endsWith(`.${base}`) ||
      host === "localhost" ||
      host.endsWith(".localhost");
    if (!onTenant) return null;
    if (host === `connect.${base}` || host === "connect.localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

type Phase = "loading" | "ready" | "working" | "done" | "error";

type ApiError = { message?: string; code?: string };

function readState(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("state")?.trim() ?? "";
}

function messageFor(code: string | undefined, fallback: string): string {
  switch (code) {
    case "STATE_EXPIRED":
      return "Este link expirou. Volte ao Bwipo e clique em Conectar com Meta de novo.";
    case "STATE_USED":
      return "Este link já foi usado. Volte ao Bwipo e inicie a conexão de novo.";
    case "STATE_MISMATCH":
      return "Esta conexão não pertence à sua sessão. Volte ao Bwipo e tente de novo.";
    case "STATE_IN_PROGRESS":
      return "A conexão já está em andamento. Aguarde um instante e toque em Continuar de novo.";
    default:
      return fallback;
  }
}

export function MetaConnectScreen() {
  const signup = useEmbeddedSignup();
  const [phase, setPhase] = useState<Phase>("loading");
  const [detail, setDetail] = useState("Conectando com a Meta...");
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    const state = readState();
    if (!state) {
      setPhase("error");
      setDetail("Link de conexão inválido.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/meta/connect/preview?state=${encodeURIComponent(state)}`),
        );
        const data = (await res.json().catch(() => ({}))) as ApiError & {
          returnUrl?: string;
        };
        if (cancelled) return;
        if (typeof data.returnUrl === "string") {
          setReturnUrl(tenantReturnUrl(data.returnUrl));
        }
        if (res.status === 401) {
          setPhase("error");
          setDetail("Sua sessão expirou. Volte ao Bwipo, entre de novo e repita a conexão.");
          return;
        }
        if (!res.ok) {
          setPhase("error");
          setDetail(messageFor(data.code, data.message || "Não foi possível validar a conexão."));
          return;
        }
        setPhase("ready");
        setDetail("Conectando com a Meta...");
      } catch {
        if (!cancelled) {
          setPhase("error");
          setDetail("Não foi possível falar com o Bwipo. Tente de novo.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function continueWithMeta() {
    const state = readState();
    if (!state) return;
    setPhase("working");
    setDetail("Conectando com a Meta...");
    try {
      const result = await signup.launchSignup();
      if (!result.phoneNumberId || !result.wabaId) {
        setPhase("error");
        setDetail("A Meta não devolveu o WhatsApp (WABA ou número). Tente de novo.");
        return;
      }
      const res = await fetch(apiUrl("/api/meta/connect/complete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          code: result.code,
          wabaId: result.wabaId,
          phoneNumberId: result.phoneNumberId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiError & {
        returnUrl?: string;
      };
      if (typeof data.returnUrl === "string") {
        setReturnUrl(tenantReturnUrl(data.returnUrl));
      }
      if (!res.ok) {
        if (res.status === 401) {
          setPhase("error");
          setDetail("Sua sessão expirou. Volte ao Bwipo, entre de novo e repita a conexão.");
          return;
        }
        setPhase("error");
        setDetail(
          messageFor(
            data.code,
            data.message || "A Meta não concluiu a conexão. Tente de novo.",
          ),
        );
        return;
      }
      setPhase("done");
      setDetail("WhatsApp conectado.");
      const backTarget = typeof data.returnUrl === "string" ? tenantReturnUrl(data.returnUrl) : null;
      if (backTarget) {
        const back = new URL(backTarget);
        back.searchParams.set("meta", "connected");
        window.location.assign(back.toString());
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const cancelled = /cancel/i.test(raw);
      setPhase("error");
      setDetail(
        cancelled
          ? "Login cancelado na Meta."
          : "A Meta não autorizou o acesso. Confira as permissões e tente de novo.",
      );
    }
  }

  const showButton = phase === "ready" || phase === "error";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <img
          src="/logo-bwipo.png"
          alt="Bwipo"
          className="mx-auto h-10 w-auto"
        />
        <p className="mt-6 text-sm text-foreground">{detail}</p>
        {showButton ? (
          <Button
            type="button"
            className="mt-6"
            disabled={phase === "working" || !signup.sdkReady}
            onClick={() => void continueWithMeta()}
          >
            Continuar com a Meta
          </Button>
        ) : null}
        {phase === "ready" && !signup.isConfigured ? (
          <p className="mt-3 text-xs text-muted-foreground">
            O Embedded Signup não está configurado neste ambiente.
          </p>
        ) : null}
        {phase === "error" && signup.error ? (
          <p className="mt-3 text-xs text-muted-foreground">{signup.error}</p>
        ) : null}
        {returnUrl ? (
          <a
            href={returnUrl}
            className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            Voltar ao Bwipo
          </a>
        ) : null}
      </div>
    </div>
  );
}
