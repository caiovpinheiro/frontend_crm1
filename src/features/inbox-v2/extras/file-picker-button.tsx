"use client";

import { useRef } from "react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { useSendAttachment } from "@/features/inbox-v2/hooks";

/**
 * Botão "Anexar arquivo": abre o file picker do SO, faz upload via
 * /api/conversations/:id/attachments e invalida a lista de mensagens.
 *
 * Aceita 1 arquivo por vez (suficiente para o fluxo principal). Para
 * múltiplos, o usuário repete a ação — o backend WhatsApp não
 * aceita anexos múltiplos numa mesma mensagem nativamente.
 */
export function FilePickerButton({
  conversationId,
  children,
  className,
  accept,
  capture,
  onOpen,
  disabled,
  beforeSend,
  onBlocked,
  onStageFiles,
}: {
  conversationId: string | null;
  children: React.ReactNode;
  className?: string;
  accept?: string;
  /** Passado ao `<input capture>` — "environment"/"user" abrem a câmera direto em vez do seletor de arquivos. */
  capture?: "user" | "environment";
  /** Chamado antes de abrir o picker (ex.: fechar o menu que contém o botão). */
  onOpen?: () => void;
  disabled?: boolean;
  /** Se retornar false, o upload é abortado (ex.: confirmação de canal). */
  beforeSend?: () => boolean | Promise<boolean>;
  /** Chamado quando o picker é bloqueado (sessão encerrada, etc.). */
  onBlocked?: () => void;
  /**
   * Quando informado, os arquivos escolhidos NÃO são enviados aqui: vão
   * para o composer (preview + legenda) e saem no próximo envio. Permite
   * vários arquivos de uma vez.
   */
  onStageFiles?: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const sendAttachment = useSendAttachment(conversationId);

  function openPicker() {
    if (!conversationId) {
      toast.error("Selecione uma conversa antes de anexar");
      return;
    }
    if (disabled) {
      onBlocked?.();
      return;
    }
    // Abre o picker antes de onOpen — se onOpen fechar o menu pai,
    // o <input> seria desmontado e o click não dispararia.
    ref.current?.click();
    queueMicrotask(() => onOpen?.());
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const file = files[0];
    if (!file) return;
    e.target.value = ""; // permite reanexar o mesmo arquivo depois
    if (disabled) {
      onBlocked?.();
      return;
    }
    if (onStageFiles) {
      // Confirmação de canal e envio acontecem no composer, ao enviar.
      onStageFiles(files);
      return;
    }
    if (beforeSend) {
      const ok = await beforeSend();
      if (!ok) return;
    }
    sendAttachment.mutate(
      { file, fileName: file.name },
      {
        onSuccess: () => toast.success("Anexo enviado"),
        onError: (err) => toast.error(err.message || "Falha ao enviar anexo"),
      },
    );
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        multiple={!!onStageFiles && !capture}
        onChange={handleChange}
        className="hidden"
        aria-hidden
      />
      <ButtonGlass
        type="button"
        variant="icon"
        size="icon"
        className={className}
        onClick={openPicker}
        disabled={sendAttachment.isPending || !conversationId || !!disabled}
      >
        {children}
      </ButtonGlass>
    </>
  );
}
