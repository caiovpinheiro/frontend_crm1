"use client";

import {
  IconCircleCheck,
  IconCopy,
  IconDeviceDesktop,
  IconDownload,
  IconLinkOff,
  IconLoader2,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { buttonGlassClassName } from "@/components/crm/button-glass";
import { apiUrl } from "@/lib/api";

type ClientView = {
  state: "waiting" | "connected" | "closed";
  organizationName: string;
  downloadUrl: string | null;
  expiresAt: string | null;
};

type Load =
  | { kind: "loading" }
  | { kind: "ready"; view: ClientView }
  | { kind: "invalid" }
  | { kind: "error" };

/** Recarrega o estado enquanto a sessão está aberta (para mostrar "conectado"). */
const POLL_MS = 5000;

const noopSubscribe = () => () => {};

function isWindowsDevice(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || "";
  return /win/i.test(platform) || /Windows NT/i.test(navigator.userAgent);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Página pública do cliente: baixa o suporte no Windows, orienta nos outros sistemas. */
export function RemoteSupportClientPage({ token }: { token: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // Só no navegador (no SSR fica `null` e a tela espera).
  const windows = useSyncExternalStore<boolean | null>(noopSubscribe, isWindowsDevice, () => null);

  const fetchView = useCallback(async (): Promise<Load> => {
    try {
      const res = await fetch(apiUrl(`/api/public/remote-support/${token}`), {
        cache: "no-store",
        credentials: "omit",
      });
      if (res.status === 404) return { kind: "invalid" };
      if (!res.ok) return { kind: "error" };
      return { kind: "ready", view: (await res.json()) as ClientView };
    } catch {
      return { kind: "error" };
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const next = await fetchView();
      if (!alive) return;
      // Falha de rede depois de já ter carregado: mantém a tela e tenta de novo.
      setLoad((prev) => (next.kind === "error" && prev.kind === "ready" ? prev : next));
      const open = next.kind === "ready" && next.view.state !== "closed";
      if (open || next.kind === "error") timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetchView]);

  if (load.kind === "loading" || (load.kind === "ready" && windows === null)) {
    return (
      <Shell>
        <div className="flex justify-center py-6 text-muted-foreground">
          <IconLoader2 className="size-6 animate-spin" aria-label="Carregando" />
        </div>
      </Shell>
    );
  }

  if (load.kind === "error") {
    return (
      <Shell>
        <Message
          icon={<IconLinkOff className="size-6" />}
          title="Não foi possível abrir o suporte"
          text="Verifique sua internet e atualize esta página."
        />
      </Shell>
    );
  }

  if (load.kind === "invalid" || load.view.state === "closed") {
    return (
      <Shell organizationName={load.kind === "ready" ? load.view.organizationName : undefined}>
        <Message
          icon={<IconLinkOff className="size-6" />}
          title="Este link não vale mais"
          text="O atendimento foi encerrado ou o prazo acabou. Se ainda precisar de ajuda, peça um novo link ao atendente."
        />
      </Shell>
    );
  }

  const { view } = load;

  if (view.state === "connected") {
    return (
      <Shell organizationName={view.organizationName}>
        <Message
          tone="success"
          icon={<IconCircleCheck className="size-6" />}
          title="Tudo certo, você está conectado"
          text="Quando o atendente pedir acesso, vai aparecer uma janela no seu computador. Clique em Permitir para ele ver sua tela. Para encerrar, é só fechar o programa."
        />
      </Shell>
    );
  }

  if (!windows) {
    return (
      <Shell organizationName={view.organizationName}>
        <Message
          icon={<IconDeviceDesktop className="size-6" />}
          title="Abra este link no computador com Windows"
          text="O suporte remoto funciona em computadores com Windows. Abra este mesmo link nele para o atendente poder te ajudar."
        />
        <CopyLinkButton />
      </Shell>
    );
  }

  return (
    <Shell organizationName={view.organizationName}>
      <Message
        icon={<IconDeviceDesktop className="size-6" />}
        title="Vamos te ajudar no seu computador"
        text="O atendente só vê sua tela se você permitir, e você pode encerrar quando quiser."
      />
      <ol className="mt-6 space-y-3 text-sm text-foreground">
        <Step n={1}>Clique em Baixar o suporte.</Step>
        <Step n={2}>Abra o arquivo baixado. Ele não instala nada no computador.</Step>
        <Step n={3}>Quando o atendente pedir acesso, clique em Permitir.</Step>
      </ol>
      {view.downloadUrl && (
        <a
          href={view.downloadUrl}
          className={buttonGlassClassName({ variant: "primary", className: "mt-6 w-full py-3 text-sm" })}
        >
          <IconDownload className="size-4" />
          Baixar o suporte
        </a>
      )}
      {view.expiresAt && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Este link vale até {formatTime(view.expiresAt)}.
        </p>
      )}
    </Shell>
  );
}

function Shell({ organizationName, children }: { organizationName?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="mb-5 text-xs font-medium text-muted-foreground">
          Suporte remoto{organizationName ? ` · ${organizationName}` : ""}
        </p>
        {children}
      </div>
    </main>
  );
}

function Message({
  icon,
  title,
  text,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone?: "default" | "success";
}) {
  return (
    <div>
      <div
        className={
          tone === "success"
            ? "flex size-11 items-center justify-center rounded-full bg-success/10 text-success"
            : "flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"
        }
      >
        {icon}
      </div>
      <h1 className="mt-4 font-display text-xl font-bold leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
      className={buttonGlassClassName({ variant: "glass", className: "mt-6 w-full py-3 text-sm" })}
    >
      {copied ? <IconCircleCheck className="size-4" /> : <IconCopy className="size-4" />}
      {copied ? "Link copiado" : "Copiar o link"}
    </button>
  );
}
