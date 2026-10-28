"use client";

/**
 * Chave secreta do canal Webchat (identidade ou servidor a servidor):
 * mostra só "configurada em …"; gerar/girar chama o backend e exibe o valor
 * UMA vez, só na memória deste componente (some ao fechar o painel).
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.5.
 */
import {
  IconCheck as Check,
  IconCopy as Copy,
  IconKey as Key,
  IconLoader2 as Loader2,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  rotateWebchatSecret,
  type WebchatSecretKind,
  type WebchatSecretStatus,
  type WebchatSecretsStatus,
} from "./v2-config";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
}

export type WebchatSecretFieldProps = {
  channelId: string;
  kind: WebchatSecretKind;
  label: string;
  status: WebchatSecretStatus;
  onRotated: (next: WebchatSecretsStatus) => void;
};

export function WebchatSecretField({ channelId, kind, label, status, onRotated }: WebchatSecretFieldProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const id = `wc-secret-${kind}`;

  const mutation = useMutation({
    mutationFn: () => rotateWebchatSecret(channelId, kind),
    onSuccess: (res) => {
      setRevealed(res.secret);
      setConfirming(false);
      onRotated(res.secrets);
    },
  });

  const run = () => {
    if (status.configured && !confirming) {
      setConfirming(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-xs">
            {label}
          </Label>
          <p className="text-xs text-[var(--text-muted)]" data-testid={`${id}-status`}>
            {status.configured
              ? `Configurada${status.rotatedAt ? ` em ${formatDate(status.rotatedAt)}` : ""}`
              : "Não configurada"}
          </p>
        </div>
        <Button
          type="button"
          variant={confirming ? "destructive" : "outline"}
          size="sm"
          className="gap-1"
          disabled={mutation.isPending}
          onClick={run}
        >
          {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Key className="size-3.5" />}
          {confirming ? "Confirmar troca" : status.configured ? "Gerar nova chave" : "Gerar chave"}
        </Button>
      </div>
      {confirming ? (
        <p className="text-xs text-[var(--color-danger-text)]" role="alert">
          A chave atual deixa de valer na hora: o site precisa usar a nova.
        </p>
      ) : null}
      {mutation.isError ? (
        <p className="text-xs text-[var(--color-danger-text)]" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : "Erro ao gerar a chave."}
        </p>
      ) : null}
      {revealed ? (
        <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] p-3">
          <p className="text-xs font-medium">Copie agora: esta chave não será mostrada de novo.</p>
          <div className="flex gap-2">
            <Input id={id} readOnly value={revealed} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-3"
              aria-label={`Copiar ${label}`}
              onClick={() => {
                void navigator.clipboard?.writeText(revealed).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check className="size-3.5 text-[var(--color-success)]" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(null)}>
            Já copiei
          </Button>
        </div>
      ) : null}
    </div>
  );
}
