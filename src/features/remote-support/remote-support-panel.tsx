"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconPlayerStop,
  IconPlugConnected,
  IconScreenShare,
} from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";

import type { RemoteSupportSession, RemoteSupportStatus } from "./api";
import {
  isActiveRemoteSession,
  useEndRemoteSupport,
  useRemoteSupportControl,
  useRemoteSupportSession,
  useRemoteSupportSessions,
  useStartRemoteSupport,
} from "./hooks";

const STATUS_LABEL: Record<RemoteSupportStatus, string> = {
  WAITING: "Aguardando cliente",
  CONNECTED: "Conectado",
  ENDED: "Encerrada",
  EXPIRED: "Expirada",
  FAILED: "Falhou",
};

const HISTORY_SHOWN = 5;
const LIST_ITEM_CLASS =
  "rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Suporte remoto na ficha do contato: gera o link da página do cliente (no
 * Windows ela baixa 1 arquivo, sem instalar), mostra quando ele conecta e abre
 * o controle da tela. O consentimento do cliente é exigido pelo servidor.
 */
export function RemoteSupportPanel({
  contactId,
  canStart,
}: {
  contactId: string;
  canStart: boolean;
}) {
  const sessionsQuery = useRemoteSupportSessions(contactId);
  const sessions = sessionsQuery.data ?? [];
  const activeFromList = sessions.find(isActiveRemoteSession) ?? null;
  const liveQuery = useRemoteSupportSession(activeFromList?.id ?? null);
  const live = liveQuery.data ?? activeFromList;
  const active = live && isActiveRemoteSession(live) ? live : null;
  const history = sessions.filter((s) => s.id !== active?.id).slice(0, HISTORY_SHOWN);

  const startMutation = useStartRemoteSupport(contactId);
  const controlMutation = useRemoteSupportControl();
  const endMutation = useEndRemoteSupport(contactId);
  const [copied, setCopied] = useState(false);

  function handleStart() {
    startMutation.mutate(undefined, {
      onError: (err) => toast.error(err.message),
    });
  }

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado. Envie ao cliente.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  async function handleControl(session: RemoteSupportSession) {
    // Abre a aba no clique (senão o navegador bloqueia como pop-up) e corta
    // o `opener` antes de navegar para o MeshCentral.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await controlMutation.mutateAsync(session.id);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
      toast.success("O cliente vai receber o pedido de permissão na tela dele.");
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : "Erro ao abrir o controle.");
    }
  }

  function handleEnd(session: RemoteSupportSession) {
    endMutation.mutate(session.id, {
      onSuccess: () => toast.success("Suporte encerrado. Nada ficou no servidor."),
      onError: (err) => toast.error(err.message),
    });
  }

  if (sessionsQuery.isLoading) {
    return <p className="text-[12px] text-[var(--text-muted)]">Carregando...</p>;
  }
  if (sessionsQuery.isError) {
    return (
      <p className="text-[12px] text-[var(--text-muted)]">{sessionsQuery.error.message}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!active && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-[var(--text-muted)]">
            Acesse a tela do cliente com o consentimento dele. Nada fica instalado na máquina.
          </p>
          {canStart && (
            <ButtonGlass
              variant="primary"
              onClick={handleStart}
              disabled={startMutation.isPending}
            >
              <IconScreenShare size={15} />
              {startMutation.isPending ? "Gerando link..." : "Iniciar suporte"}
            </ButtonGlass>
          )}
        </div>
      )}

      {active && (
        <div className={`${LIST_ITEM_CLASS} flex flex-col gap-3 p-3`}>
          <ActiveStatusLine session={active} />

          {active.status === "WAITING" && active.clientLink && (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-[var(--text-muted)]">
                Envie o link ao cliente. A página mostra o passo a passo (funciona em Windows).
              </p>
              <div className="flex gap-2">
                <InputGlass
                  readOnly
                  value={active.clientLink}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Link de suporte para o cliente"
                />
                <ButtonGlass variant="glass" onClick={() => void handleCopy(active.clientLink!)}>
                  <IconCopy size={15} />
                  {copied ? "Copiado" : "Copiar"}
                </ButtonGlass>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Expira às {formatTime(active.expiresAt)}
            </span>
            {canStart && (
              <div className="flex gap-2">
                {active.status === "CONNECTED" && (
                  <ButtonGlass
                    variant="primary"
                    onClick={() => void handleControl(active)}
                    disabled={active.deviceOnline !== true || controlMutation.isPending}
                  >
                    <IconExternalLink size={15} />
                    {controlMutation.isPending ? "Abrindo..." : "Controlar"}
                  </ButtonGlass>
                )}
                <ButtonGlass
                  variant="glass"
                  onClick={() => handleEnd(active)}
                  disabled={endMutation.isPending}
                >
                  <IconPlayerStop size={15} />
                  {endMutation.isPending ? "Encerrando..." : "Encerrar"}
                </ButtonGlass>
              </div>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <ul className="flex flex-col gap-2">
          {history.map((s) => (
            <li key={s.id} className={`${LIST_ITEM_CLASS} px-3 py-2`}>
              <p className="font-body text-[13px] text-[var(--text-primary)]">
                {STATUS_LABEL[s.status]}
                {s.deviceName ? ` · ${s.deviceName}` : ""}
              </p>
              <p className="mt-1 font-display text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {s.createdBy.name ?? "—"} · {new Date(s.createdAt).toLocaleString("pt-BR")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActiveStatusLine({ session }: { session: RemoteSupportSession }) {
  if (session.status === "WAITING") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-[var(--text-primary)]">
        <IconLoader2 size={16} className="animate-spin text-[var(--text-muted)]" />
        Aguardando o cliente abrir o arquivo...
      </p>
    );
  }
  const device = session.deviceName ?? "dispositivo do cliente";
  if (session.deviceOnline === false) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
        <IconPlugConnected size={16} />
        O cliente fechou o Assistant · {device}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[13px] text-[var(--text-primary)]">
      <IconPlugConnected size={16} className="text-primary" />
      Cliente conectado · {device}
    </p>
  );
}
