"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconLayoutGrid,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { NavRail } from "@/components/crm/nav-rail";
import { PageHeader } from "@/components/crm/page-header";

import { useWidgetSso, useWidgets } from "@/features/widgets/hooks";
import type { WidgetDto } from "@/features/widgets/types";

/** Mapa de widgets INTERNAL com rota dedicada. Slugs nao mapeados caem
 *  em "widget interno sem rota dedicada" (mostra placeholder). */
const INTERNAL_ROUTES: Record<string, string> = {
  smart_distribution: "/widgets/distribution",
  ai_agents: "/ai-agents",
};

/** Tempo maximo aguardando o iframe disparar `load`. Acima disso assumimos
 *  que o app do parceiro esta indisponivel ou bloqueando ser embedado
 *  (`X-Frame-Options: DENY` / CSP `frame-ancestors`). Browsers nao notificam
 *  cross-origin nesses casos, entao timeout eh a unica defesa. */
const IFRAME_LOAD_TIMEOUT_MS = 20_000;

interface WidgetRunnerProps {
  slug: string;
  navRail?: React.ReactNode;
}

export default function WidgetRunnerClientPage({ slug, navRail }: WidgetRunnerProps) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const canFetch = sessionStatus !== "unauthenticated";

  const widgetsQuery = useWidgets(canFetch);
  const widget: WidgetDto | undefined = useMemo(
    () => widgetsQuery.data?.items.find((w) => w.slug === slug),
    [widgetsQuery.data, slug],
  );

  const isInternal = widget?.ownerType === "INTERNAL";
  const isPartner = widget?.ownerType === "PARTNER";

  useEffect(() => {
    if (!widget) return;
    if (isInternal) {
      const route = INTERNAL_ROUTES[widget.slug];
      if (route) router.replace(route);
    }
  }, [widget, isInternal, router]);

  const ssoQuery = useWidgetSso(
    isPartner && widget?.installed ? slug : null,
    canFetch,
  );

  const isLoading = widgetsQuery.isLoading || (isPartner && widget?.installed && ssoQuery.isLoading);
  const error =
    widgetsQuery.error ||
    (isPartner && widget?.installed ? ssoQuery.error : null);

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      {navRail ?? <NavRail />}

      <main className="flex min-w-0 flex-col gap-4 overflow-hidden">
        <PageHeader
          icon={<IconLayoutGrid size={22} />}
          title={widget?.name ?? "Widget"}
          description={
            widget?.ownerType === "PARTNER" && widget.partnerName
              ? `Por ${widget.partnerName}`
              : widget?.category ?? "Abrindo widget..."
          }
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
          {isLoading ? (
            <CenteredState icon={<IconLoader2 className="size-6 animate-spin" />}>
              Carregando widget…
            </CenteredState>
          ) : !widget ? (
            <CenteredState icon={<IconAlertTriangle className="size-6" />} tone="danger">
              Widget não encontrado ou indisponível.
            </CenteredState>
          ) : !widget.installed ? (
            <CenteredState icon={<IconAlertTriangle className="size-6" />} tone="danger">
              Este widget não está instalado nesta organização.
            </CenteredState>
          ) : widget.disabled ? (
            <CenteredState icon={<IconAlertTriangle className="size-6" />} tone="danger">
              {widget.disabledReason ?? "Widget temporariamente indisponível."}
            </CenteredState>
          ) : isInternal && !INTERNAL_ROUTES[widget.slug] ? (
            <CenteredState icon={<IconAlertTriangle className="size-6" />}>
              Widget interno sem rota dedicada — abra a partir do menu.
            </CenteredState>
          ) : isInternal ? (
            <CenteredState icon={<IconLoader2 className="size-6 animate-spin" />}>
              Redirecionando…
            </CenteredState>
          ) : error ? (
            <CenteredState
              icon={<IconAlertTriangle className="size-6" />}
              tone="danger"
              actions={
                <Button size="sm" variant="ghost" onClick={() => ssoQuery.refetch()}>
                  <IconRefresh className="size-3.5" />
                  Tentar novamente
                </Button>
              }
            >
              {error.message || "Falha ao carregar widget."}
            </CenteredState>
          ) : ssoQuery.data ? (
            <SafePartnerIframe
              slug={widget.slug}
              title={widget.name}
              iframeUrl={ssoQuery.data.iframeUrl}
              token={ssoQuery.data.token}
              onRetry={() => ssoQuery.refetch()}
            />
          ) : (
            <CenteredState icon={<IconLoader2 className="size-6 animate-spin" />}>
              Preparando contexto seguro…
            </CenteredState>
          )}
        </section>
      </main>
    </div>
  );
}

/** Anexa o token SSO como query param `token` na URL do parceiro. */
function buildIframeUrl(iframeUrl: string, token: string): string {
  try {
    const url = new URL(iframeUrl);
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    // URL malformada vinda do banco — devolve o que veio sem token pra
    // pelo menos abrir e o parceiro ver o erro.
    return iframeUrl;
  }
}

interface SafePartnerIframeProps {
  slug: string;
  title: string;
  iframeUrl: string;
  token: string;
  onRetry: () => void;
}

/**
 * Wrapper do iframe com tres garantias:
 *   1. Overlay de loading ate `onload` ou timeout — sem isso, URLs lentas
 *      ou bloqueadas por X-Frame-Options ficam com tela branca eterna.
 *   2. Estado de erro acionavel ("Abrir em nova aba" + "Tentar novamente")
 *      quando o timeout estoura.
 *   3. Remount real (via `key`) quando o token SSO renovar — sem isso, o
 *      app do parceiro acaba com 401 silencioso apos 5 min.
 *
 * Browsers NAO notificam `error` em iframe cross-origin que recusou embed
 * (X-Frame-Options/CSP). Por isso o unico sinal confiavel eh ausencia de
 * `load` apos o timeout.
 */
function SafePartnerIframe({ slug, title, iframeUrl, token, onRetry }: SafePartnerIframeProps) {
  const [phase, setPhase] = useState<"loading" | "ready" | "timeout" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);

  const src = useMemo(() => buildIframeUrl(iframeUrl, token), [iframeUrl, token]);

  // `key` muda quando o token vira ou usuario reclica em "tentar de novo"
  // — forca o iframe a remontar com URL atualizada.
  const iframeKey = `${reloadKey}:${token}`;

  useEffect(() => {
    setPhase("loading");
    startedAtRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPhase((prev) => {
        if (prev !== "loading") return prev;
        // eslint-disable-next-line no-console
        console.warn("[widget.iframe] load_timeout", {
          slug,
          iframeUrl,
          waitedMs: Date.now() - startedAtRef.current,
        });
        return "timeout";
      });
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [iframeKey, slug, iframeUrl]);

  const handleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const loadedInMs = Date.now() - startedAtRef.current;
    setPhase("ready");
    // eslint-disable-next-line no-console
    console.info("[widget.iframe] load_ok", { slug, loadedInMs });
  }, [slug]);

  const handleError = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("error");
    // eslint-disable-next-line no-console
    console.error("[widget.iframe] load_error", { slug, iframeUrl });
  }, [slug, iframeUrl]);

  const openExternal = useCallback(() => {
    // Sem token na URL aberta em nova aba — o parceiro precisa de SSO
    // pra contexto, mas o link "abrir externamente" deve ser limpo
    // (evita vazar JWT no historico do navegador do usuario).
    window.open(iframeUrl, "_blank", "noopener,noreferrer");
  }, [iframeUrl]);

  const retry = useCallback(() => {
    setReloadKey((k) => k + 1);
    onRetry();
  }, [onRetry]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {(phase === "loading") && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]">
          <IconLoader2 className="size-6 animate-spin" />
          <p className="font-body text-[13px]">Carregando aplicativo…</p>
        </div>
      )}

      {(phase === "timeout" || phase === "error") && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--glass-bg-subtle)] p-12 text-center">
          <IconAlertTriangle className="size-7 text-[var(--color-danger-text)]" />
          <div>
            <p className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
              {phase === "timeout"
                ? "O aplicativo demorou muito para responder"
                : "Não foi possível carregar o aplicativo"}
            </p>
            <p className="mt-1 font-body text-[12.5px] text-[var(--text-muted)]">
              {phase === "timeout"
                ? "Pode ser que o servidor do parceiro esteja indisponível ou bloqueando ser embedado."
                : "Verifique sua conexão ou tente novamente em alguns instantes."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="default" onClick={retry}>
              <IconRefresh className="size-3.5" />
              Tentar novamente
            </Button>
            <Button size="sm" variant="ghost" onClick={openExternal}>
              <IconExternalLink className="size-3.5" />
              Abrir em nova aba
            </Button>
          </div>
        </div>
      )}

      <iframe
        key={iframeKey}
        src={src}
        title={title}
        // Sandbox restritivo. allow-same-origin necessario pra muitos apps
        // funcionarem (cookies/localStorage proprios). Se algum parceiro
        // precisar de allow-popups/allow-downloads, expandimos por widget
        // no futuro via campo no banco.
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups-to-escape-sandbox"
        allow="clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        className="h-full w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}

function CenteredState({
  children,
  icon,
  tone = "muted",
  actions,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  tone?: "muted" | "danger";
  actions?: React.ReactNode;
}) {
  const toneClass =
    tone === "danger" ? "text-[var(--color-danger-text)]" : "text-[var(--text-muted)]";
  return (
    <div className={`flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-12 text-center ${toneClass}`}>
      {icon}
      <p className="font-body text-[13px]">{children}</p>
      {actions}
    </div>
  );
}
