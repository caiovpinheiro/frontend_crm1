"use client";

/**
 * SoftphoneWidget — chip flutuante global montado no `(app)/layout.tsx`.
 *
 * Responsabilidades:
 *  1. Auto-connect ao logar: se o backend retornar credenciais SIP
 *     (`GET /api/sip-extensions/me/credentials` 200), monta o `JsSIP.UA`
 *     via `useSoftphone.connect()` automaticamente. Sem credenciais
 *     (404), o widget fica oculto — nada polui a UI dos operadores sem
 *     telefonia provisionada.
 *  2. Persistência entre F5: o JsSIP é browser-side e morre a cada
 *     reload; o auto-connect resolve isso ao montar o widget.
 *  3. Status visível: chip discreto bottom-right com cor e label
 *     refletindo o estado (Conectando / Ativo / Erro). Sem indicador, o
 *     `DealCallButton` mostraria "Conecte o softphone" sem o operador
 *     saber por que a conexão caiu.
 *  4. UI de chamada: durante `call_ringing`/`call_active`/`call_held`,
 *     expande pra mostrar número, duração e controles (Atender / Mute /
 *     Hold / Encerrar). Sem isso não dá pra atender inbound nem
 *     encerrar manualmente.
 *
 * O hook `useSoftphone` mantém o `JsSIP.UA` em variável de módulo
 * (singleton), então este widget é o único lugar que precisa chamar
 * `connect()` — `useDealDial` e qualquer outro consumidor herdam o
 * mesmo UA via re-import do módulo.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  IconPhoneFilled,
  IconPhoneIncoming,
  IconPhoneOff,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerPause,
  IconPlayerPlay,
  IconLoader2,
  IconAlertTriangle,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { useSoftphone } from "../hooks/use-softphone";
import { useIdleEnabled } from "@/hooks/use-idle-enabled";
import { useCallsWidget } from "../hooks/use-calls-widget";
import { getMyCredentialsOrNull } from "../api/extensions";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export function SoftphoneWidget() {
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";

  // Gate por widget `calls_history`: o softphone só monta quando a org
  // tem a Telefonia ATIVA na Central de Widgets. Quem desinstala, deixa
  // de ver o chip flutuante (e o DealCallButton também desliga via mesmo
  // hook). Enquanto a query carrega, devolvemos `enabled=null` → render
  // nada (evita flash do chip aparecendo e sumindo).
  const idle = useIdleEnabled();
  const callsWidget = useCallsWidget(isAuthenticated && idle);

  // Só busca credenciais quando o usuário está autenticado E o widget
  // está habilitado. 404 (sem ramal) é tratado pelo `getMyCredentials`
  // lançando erro, e o widget simplesmente não renderiza (handler abaixo).
  const credentialsQuery = useQuery({
    queryKey: ["softphone", "credentials"],
    queryFn: getMyCredentialsOrNull,
    enabled: isAuthenticated && callsWidget.enabled === true,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const softphone = useSoftphone();
  const [hidden, setHidden] = React.useState(false);

  // Auto-connect quando temos credenciais E ainda não estamos conectados.
  // `useSoftphone` é idempotente: chamar `connect()` com `moduleUA` já
  // existente é no-op (early-return seta status="registered").
  React.useEffect(() => {
    if (!credentialsQuery.data) return;
    if (softphone.status === "disconnected") {
      void softphone.connect();
    }
    // Intencional: rodar quando as credenciais carregam OU quando o
    // status volta a `disconnected` (ex.: erro de rede que matou o UA).
  }, [credentialsQuery.data, softphone.status, softphone]);


  if (sessionStatus !== "authenticated") return null;
  if (callsWidget.enabled !== true) return null;
  if (credentialsQuery.isLoading) return null;
  if (credentialsQuery.isError || !credentialsQuery.data) return null;
  if (hidden) return null;

  const credentials = credentialsQuery.data;
  const ramal = credentials.authUser;

  const hasActiveCall =
    softphone.status === "call_ringing" ||
    softphone.status === "call_active" ||
    softphone.status === "call_held";

  const showIdleDetail =
    !hasActiveCall && (softphone.status === "error" || softphone.status === "connecting");

  return (
    <div
      className="fixed bottom-4 right-4 z-(--z-sheet) flex flex-col items-end gap-2"
      role="region"
      aria-label="Softphone"
    >
      {hasActiveCall && (
        <CallPanel
          status={softphone.status}
          direction={softphone.callDirection}
          remoteNumber={softphone.remoteNumber}
          durationMs={softphone.durationMs}
          muted={softphone.muted}
          held={softphone.held}
          onAnswer={softphone.answer}
          onHangup={softphone.hangup}
          onToggleMute={softphone.toggleMute}
          onToggleHold={softphone.toggleHold}
        />
      )}

      {showIdleDetail && (
        <StatusChip
          status={softphone.status}
          ramal={ramal}
          error={softphone.error}
          onReconnect={() => void softphone.connect()}
          onHide={() => setHidden(true)}
        />
      )}
    </div>
  );
}

// ─── Chip de status (idle) ───────────────────────────────────────────────

interface StatusChipProps {
  status: ReturnType<typeof useSoftphone>["status"];
  ramal: string;
  error: string | null;
  onReconnect: () => void;
  onHide: () => void;
}

function StatusChip({
  status,
  ramal,
  error,
  onReconnect,
  onHide,
}: StatusChipProps) {
  // Disconnected aparece só durante a janela curta antes do auto-connect
  // disparar; tratamos como "Conectando" pra não confundir o usuário com
  // estado falso-negativo.
  const isConnecting = status === "connecting" || status === "disconnected";
  const isRegistered = status === "registered";
  const isError = status === "error";

  // Registrado: card com telefone sólido (sem ping/badge de status).
  // Fechar volta o idle só pro ícone da NavRail.
  if (isRegistered) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-2 shadow-lg backdrop-blur-md dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-panel)]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-success-bg)] text-[var(--color-success-text)] dark:bg-[var(--color-success)]/15 dark:text-[var(--color-success)]">
          <IconPhoneFilled size={18} />
        </span>

        <div className="min-w-0 pr-0.5">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.7px] text-[var(--color-success-text)] dark:text-[var(--color-success)]">
            Registrado
          </div>
          <div className="text-[14px] font-bold leading-tight tabular-nums text-[var(--text-primary)]">
            Ramal {ramal}
          </div>
        </div>

        <button
          type="button"
          onClick={onHide}
          aria-label="Fechar detalhe do softphone"
          title="Fechar"
          className="ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] transition hover:bg-[var(--color-danger)]/20 dark:bg-[var(--color-danger)]/15 dark:text-[var(--color-danger)]"
        >
          <IconX size={16} strokeWidth={2.4} />
        </button>
      </div>
    );
  }

  // Conectando (transiente) e Erro continuam como pill fino — só o estado
  // Registrado usa o card. Erro fica expandido pra leitura da mensagem.
  return (
    <div
      className={cn(
        "group inline-flex h-8 items-center overflow-hidden rounded-full border shadow-sm backdrop-blur-md transition",
        isConnecting &&
          "border-[var(--color-warning)]/30 bg-[var(--color-warn-bg)] text-[var(--color-warning)] dark:border-[var(--color-warning)]/25 dark:bg-[var(--color-warning)]/15 dark:text-[var(--color-warning)]",
        isError &&
          "border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] dark:border-[var(--color-danger)]/25 dark:bg-[var(--color-danger)]/15 dark:text-[var(--color-danger)]",
      )}
    >
      <div className="inline-flex items-center gap-1.5 pl-2.5 pr-2 text-[12px] font-medium">
        {isConnecting && (
          <>
            <IconLoader2 size={12} className="animate-spin" />
            <span>Conectando…</span>
          </>
        )}
        {isError && (
          <>
            <IconAlertTriangle size={12} />
            <span
              className="max-w-[240px] truncate"
              title={error ?? "Erro desconhecido"}
            >
              {error ?? "Erro no softphone"}
            </span>
            <button
              type="button"
              onClick={onReconnect}
              aria-label="Tentar reconectar"
              title="Tentar reconectar"
              className="inline-flex items-center justify-center rounded-full p-1 hover:bg-black/10 dark:hover:bg-[var(--glass-bg-subtle)]"
            >
              <IconRefresh size={11} />
            </button>
          </>
        )}
      </div>

      {isError && (
        <button
          type="button"
          onClick={onHide}
          aria-label="Esconder até reload"
          title="Esconder até recarregar"
          className="inline-flex h-full items-center justify-center border-l border-current/15 px-1.5 opacity-50 transition-opacity hover:opacity-100"
        >
          <IconX size={11} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

// ─── Painel de chamada ativa ─────────────────────────────────────────────

interface CallPanelProps {
  status: ReturnType<typeof useSoftphone>["status"];
  direction: "inbound" | "outbound" | null;
  remoteNumber: string | null;
  durationMs: number;
  muted: boolean;
  held: boolean;
  onAnswer: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleHold: () => void;
}

function CallPanel({
  status,
  direction,
  remoteNumber,
  durationMs,
  muted,
  held,
  onAnswer,
  onHangup,
  onToggleMute,
  onToggleHold,
}: CallPanelProps) {
  const isRinging = status === "call_ringing";
  const isActive = status === "call_active" || status === "call_held";

  return (
    <div
      className={cn(
        "w-[280px] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl",
        "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-primary)]",
        "dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-panel)]",
      )}
      style={{
        boxShadow: "var(--glass-shadow, 0 20px 60px rgba(0,0,0,0.18))",
      }}
      role="dialog"
      aria-label="Chamada em andamento"
    >
      <div className="mb-3 flex items-center gap-2">
        {isRinging ? (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-success)] opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
          </span>
        ) : (
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
        )}
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {isRinging
            ? direction === "inbound"
              ? "Chamada recebida"
              : "Chamando…"
            : direction === "inbound"
              ? "Em chamada (entrada)"
              : "Em chamada"}
        </span>
      </div>

      <div className="mb-4 flex items-baseline justify-between gap-2">
        <span className="truncate text-lg font-semibold">
          {remoteNumber ?? "Desconhecido"}
        </span>
        {isActive && (
          <span className="font-mono text-sm text-[var(--text-muted)]">
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {isRinging && direction === "inbound" ? (
          <>
            <button
              type="button"
              onClick={onAnswer}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-success)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-success)] active:scale-[0.98]"
            >
              <IconPhoneIncoming size={16} />
              Atender
            </button>
            <button
              type="button"
              onClick={onHangup}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-danger)] active:scale-[0.98]"
            >
              <IconPhoneOff size={16} />
              Recusar
            </button>
          </>
        ) : isRinging && direction === "outbound" ? (
          // Outbound dialing (Api4com originando) — sem mute/hold, só
          // permite cancelar antes do destino atender.
          <button
            type="button"
            onClick={onHangup}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-danger)] active:scale-[0.98]"
          >
            <IconPhoneOff size={16} />
            Cancelar
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                muted
                  ? "border-[var(--color-warning)] bg-[var(--color-warning)] text-white"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-subtle)] dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-subtle)] dark:hover:bg-[var(--glass-bg-subtle)]",
              )}
              title={muted ? "Reativar microfone" : "Silenciar microfone"}
            >
              {muted ? <IconMicrophoneOff size={16} /> : <IconMicrophone size={16} />}
            </button>

            <button
              type="button"
              onClick={onToggleHold}
              aria-pressed={held}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                held
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-subtle)] dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-subtle)] dark:hover:bg-[var(--glass-bg-subtle)]",
              )}
              title={held ? "Retomar chamada" : "Colocar em espera"}
            >
              {held ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
            </button>

            <button
              type="button"
              onClick={onHangup}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-danger)] active:scale-[0.98]"
            >
              <IconPhoneOff size={16} />
              Encerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SoftphoneWidget;
