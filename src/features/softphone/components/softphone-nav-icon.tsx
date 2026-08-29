"use client";

/**
 * Ícone de telefonia na NavRail — sob o status do agente (wifi) quando a
 * rail está colapsada; ao lado com pipe quando expandida. Sem badge/ping
 * (o softphone idle sai do canto; chamadas ativas ficam no SoftphoneWidget).
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Phone } from "lucide-react";

import { toast } from "sonner";

import { DockButton } from "@/components/crm/floating-dock";
import { cn } from "@/lib/utils";
import { useSoftphone } from "../hooks/use-softphone";
import { useCallsWidget } from "../hooks/use-calls-widget";
import { getMyCredentialsOrNull } from "../api/extensions";

export function SoftphoneNavIcon({
  expanded = false,
  /** Inclui o `|` à esquerda (só renderiza o grupo se o softphone estiver ativo). */
  withPipe = false,
  className,
}: {
  expanded?: boolean;
  withPipe?: boolean;
  className?: string;
}) {
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const callsWidget = useCallsWidget(isAuthenticated);

  const credentialsQuery = useQuery({
    queryKey: ["softphone", "credentials"],
    queryFn: getMyCredentialsOrNull,
    enabled: isAuthenticated && callsWidget.enabled === true,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const softphone = useSoftphone();

  React.useEffect(() => {
    if (!credentialsQuery.data) return;
    if (softphone.status === "disconnected") {
      void softphone.connect();
    }
  }, [credentialsQuery.data, softphone.status, softphone]);

  if (!isAuthenticated) return null;
  if (callsWidget.enabled !== true) return null;
  if (credentialsQuery.isLoading || credentialsQuery.isError || !credentialsQuery.data) {
    return null;
  }

  const ramal = credentialsQuery.data.authUser;
  const isError = softphone.status === "error";
  const isConnecting =
    softphone.status === "connecting" || softphone.status === "disconnected";
  const isOnCall =
    softphone.status === "call_active" ||
    softphone.status === "call_ringing" ||
    softphone.status === "call_held";
  const isConnected = softphone.status === "registered" || isOnCall;

  const title = isConnected ? "Telefonia online" : "Telefonia offline";

  function onIconClick() {
    if (isError) {
      toast.error(softphone.error ?? "Telefonia offline");
      return;
    }
    if (isConnecting) {
      toast.message("Telefonia offline — conectando…");
      return;
    }
    toast.success(ramal ? `Ramal ${ramal}` : "Telefonia online");
  }

  // Telefone simples em verde. O estado vive no dot: verde esmaecendo (pulse
  // suave de opacidade) quando online, vermelho estático quando offline/erro.
  const iconColorClass = "text-[#22c55e]";

  const dotBg = isConnected ? "#22c55e" : "#ef4444";
  const dotAnimateClass = isConnected ? "softphone-dot-fade" : "";

  const statusDot = (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full",
        dotAnimateClass,
      )}
      style={{ background: dotBg }}
    />
  );

  const icon = (
    <span className="relative inline-flex items-center justify-center">
      <Phone size={20} strokeWidth={2.2} className={iconColorClass} />
      {statusDot}
    </span>
  );

  // Rail colapsada: mesmo tile 44×44 dos demais ícones (cabe em 72px).
  if (!expanded) {
    return (
      <DockButton
        title={title}
        onClick={onIconClick}
        disablePop
        className={cn("group", className)}
      >
        {icon}
      </DockButton>
    );
  }

  const phoneBtn = (
    <button
      type="button"
      onClick={onIconClick}
      aria-label={title}
      title={title}
      className={cn(
        "group relative inline-flex shrink-0 items-center justify-center rounded-xl p-1.5 transition-colors hover:bg-[var(--nav-hover,var(--glass-bg-overlay))]",
        className,
      )}
    >
      {icon}
    </button>
  );

  if (!withPipe) return phoneBtn;

  return (
    <>
      <span
        className="shrink-0 select-none text-[13px] leading-none text-[var(--nav-text-muted)]/45"
        aria-hidden
      >
        |
      </span>
      {phoneBtn}
    </>
  );
}
