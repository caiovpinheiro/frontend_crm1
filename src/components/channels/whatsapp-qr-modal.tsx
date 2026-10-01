"use client";

import { logger } from "@/lib/logger";
import { apiUrl } from "@/lib/api";
import { IconCircleCheck as CheckCircle2, IconLoader2 as Loader2, IconRefresh as RefreshCw, IconDeviceMobile as Smartphone, IconMenu2 as Menu, IconLink as Link2 } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { ApiChannel } from "./types";

const QR_TTL_SEC = 60;
const POLL_MS = 2500;

type QrResponse = { qrCode: string | null; status?: string };
type StatusResponse = { status: string; phoneNumber?: string };

async function fetchQr(channelId: string): Promise<QrResponse> {
  const res = await fetch(apiUrl(`/api/channels/${channelId}/qr`));
  const data = (await res.json()) as QrResponse & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? "Erro ao carregar QR Code.");
  }
  return data;
}

async function fetchStatus(channelId: string): Promise<StatusResponse> {
  const res = await fetch(apiUrl(`/api/channels/${channelId}/status`));
  const data = (await res.json()) as StatusResponse & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? "Erro ao consultar status.");
  }
  return data;
}

async function postConnect(channelId: string): Promise<{ status?: string; qrCode?: string }> {
  const res = await fetch(apiUrl(`/api/channels/${channelId}/connect`), {
    method: "POST",
  });
  const data = (await res.json()) as { status?: string; qrCode?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? "Erro ao gerar novo QR Code.");
  }
  return data;
}

export type WhatsappQrModalProps = {
  channel: ApiChannel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQr?: string | null;
};

export function WhatsappQrModal({
  channel,
  open,
  onOpenChange,
  initialQr,
}: WhatsappQrModalProps) {
  const queryClient = useQueryClient();
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SEC);
  const [manualExpired, setManualExpired] = useState(false);
  const [success, setSuccess] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channelId = channel?.id ?? "";

  const resetLocalState = useCallback(() => {
    setSecondsLeft(QR_TTL_SEC);
    setManualExpired(false);
    setSuccess(false);
    setRegenerating(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      resetLocalState();
      return;
    }
    resetLocalState();
  }, [open, channelId, resetLocalState]);

  const {
    data: qrData,
    isLoading: qrLoading,
    isFetching: qrFetching,
    isError: qrError,
    error: qrErr,
    refetch: refetchQr,
  } = useQuery({
    queryKey: ["channel-qr", channelId, open],
    enabled: open && !!channelId && !success,
    queryFn: () => fetchQr(channelId),
    placeholderData:
      initialQr && open
        ? { qrCode: initialQr, status: channel?.status ?? "" }
        : undefined,
    staleTime: 0,
    refetchInterval: (query) => {
      if (!open || success) return false;
      const hasQr = !!query.state.data?.qrCode;
      return hasQr ? false : POLL_MS;
    },
  });

  const qrCode = qrData?.qrCode ?? null;

  const { data: statusData } = useQuery({
    queryKey: ["channel-status", channelId, open],
    enabled: open && !!channelId && !success,
    queryFn: () => fetchStatus(channelId),
    refetchInterval: open && !success ? POLL_MS : false,
  });

  const liveStatus = statusData?.status ?? channel?.status;

  useEffect(() => {
    if (!open || success || !qrCode) return;

    setSecondsLeft(QR_TTL_SEC);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setManualExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, success, qrCode, channelId]);

  useEffect(() => {
    if (liveStatus === "CONNECTED" && open && !success) {
      setSuccess(true);
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      closeTimerRef.current = setTimeout(() => {
        onOpenChange(false);
      }, 3000);
    }
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [liveStatus, open, success, onOpenChange, queryClient]);

  useEffect(() => {
    if (liveStatus === "FAILED" && open) {
      setManualExpired(true);
    }
  }, [liveStatus, open]);

  async function handleRegenerate() {
    if (!channelId) return;
    setRegenerating(true);
    setManualExpired(false);
    setSecondsLeft(QR_TTL_SEC);
    try {
      await postConnect(channelId);
      await queryClient.invalidateQueries({ queryKey: ["channel-qr", channelId] });
      await refetchQr();
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setManualExpired(true);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (e) {
      logger.error("whatsapp-qr", "gerar novo QR falhou", e);
      setManualExpired(true);
    } finally {
      setRegenerating(false);
    }
  }

  const showExpired = manualExpired && !success;
  const showSkeleton =
    open &&
    (qrFetching || qrLoading) &&
    !qrCode &&
    !qrError &&
    !showExpired;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        panelClassName={cn(
          "max-w-md border-2 border-[var(--channel-whatsapp)]/20 bg-gradient-to-b from-[var(--glass-bg-overlay)] to-[var(--channel-whatsapp)]/[0.04] shadow-2xl sm:max-w-md"
        )}
        bodyClassName="p-0 gap-0"
      >
        <div className="relative px-6 pb-6 pt-8">
          <DialogClose />

          <DialogHeader className="space-y-2 text-center sm:text-center">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Escaneie o QR Code com WhatsApp
            </DialogTitle>
            <DialogDescription className="text-pretty text-center text-sm">
              Abra o WhatsApp no seu celular &gt; Configurações &gt; Dispositivos
              vinculados &gt; Vincular dispositivo
            </DialogDescription>
          </DialogHeader>

          <ol className="mx-auto mt-6 max-w-xs space-y-3 text-left text-sm text-[var(--text-muted)]">
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--channel-whatsapp)]/15 text-xs font-bold text-[var(--channel-whatsapp)]">
                1
              </span>
              <span className="flex items-center gap-2 pt-0.5">
                <Smartphone className="size-4 text-[var(--channel-whatsapp)]" />
                Abra o WhatsApp no telefone
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--channel-whatsapp)]/15 text-xs font-bold text-[var(--channel-whatsapp)]">
                2
              </span>
              <span className="flex items-center gap-2 pt-0.5">
                <Menu className="size-4 text-[var(--channel-whatsapp)]" />
                Toque em <strong className="text-[var(--text-primary)]">Mais opções</strong> ou{" "}
                <strong className="text-[var(--text-primary)]">Configurações</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--channel-whatsapp)]/15 text-xs font-bold text-[var(--channel-whatsapp)]">
                3
              </span>
              <span className="flex items-center gap-2 pt-0.5">
                <Link2 className="size-4 text-[var(--channel-whatsapp)]" />
                Dispositivos vinculados → Vincular um dispositivo
              </span>
            </li>
          </ol>

          <div className="mx-auto mt-8 flex flex-col items-center">
            {success ? (
              <div className="flex flex-col items-center gap-4 py-4 animate-in zoom-in-95 duration-300">
                <div className="flex size-[300px] items-center justify-center rounded-2xl border-2 border-[var(--color-success)]/40 bg-[var(--color-success)]/10">
                  <CheckCircle2 className="size-24 text-[var(--color-success)] drop-shadow-sm" />
                </div>
                <p className="text-center text-lg font-semibold text-[var(--color-success)]">
                  WhatsApp conectado com sucesso!
                </p>
                <p className="text-center text-sm text-[var(--text-muted)]">
                  Fechando em instantes…
                </p>
              </div>
            ) : null}

            {!success && showSkeleton ? (
              <div className="flex size-[300px] items-center justify-center rounded-2xl border bg-[var(--glass-bg-overlay)]">
                <div className="flex w-[260px] flex-col items-center gap-3 p-4">
                  <Skeleton className="size-[220px] rounded-xl" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            ) : null}

            {!success && !showSkeleton && qrError ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 px-4 text-center">
                <p className="text-sm text-[var(--color-danger-text)]">
                  {qrErr instanceof Error ? qrErr.message : "Erro ao carregar QR Code."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-[var(--channel-whatsapp)]/40"
                  onClick={() => void refetchQr()}
                >
                  <RefreshCw className="size-4" />
                  Tentar novamente
                </Button>
              </div>
            ) : null}

            {!success && !showSkeleton && !qrError && qrCode && !showExpired ? (
              <div className="relative">
                <div
                  className={cn(
                    "rounded-2xl border-4 border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-3 shadow-xl",
                    "ring-4 ring-[var(--channel-whatsapp)]/20"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    width={300}
                    height={300}
                    className="size-[300px] object-contain"
                  />
                </div>
                <div
                  className="pointer-events-none absolute -inset-2 rounded-3xl bg-[var(--color-info)]/10 blur-xl"
                  aria-hidden
                />
              </div>
            ) : null}

            {!success && showExpired ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center">
                <p className="text-base font-medium text-[var(--text-primary)]">
                  QR Code expirado
                </p>
                <p className="max-w-xs text-sm text-[var(--text-muted)]">
                  Gere um novo código e escaneie novamente no aplicativo.
                </p>
                <Button
                  type="button"
                  className="gap-2 bg-[var(--channel-whatsapp)] text-white hover:bg-[var(--channel-whatsapp)]/90"
                  onClick={() => void handleRegenerate()}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Gerar novo QR Code
                </Button>
              </div>
            ) : null}
          </div>

          {!success && qrCode && !showExpired && !qrLoading ? (
            <div className="mt-6 text-center">
              <p className="text-xs font-medium text-[var(--text-muted)]">
                Válido por{" "}
                <span className="tabular-nums text-[var(--text-primary)]">{secondsLeft}s</span>{" "}
                — depois atualize o código
              </p>
              <div className="mx-auto mt-2 h-1.5 max-w-[200px] overflow-hidden rounded-full bg-[var(--glass-bg-overlay)]">
                <div
                  className="h-full rounded-full bg-[var(--channel-whatsapp)] transition-all duration-1000 ease-linear"
                  style={{
                    width: `${(secondsLeft / QR_TTL_SEC) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
