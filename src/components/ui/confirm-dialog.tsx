"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formDialogCancelClass } from "@/components/ui/form-dialog";

/**
 * Hook que devolve uma função `confirm()` Promise-based, equivalente
 * a `window.confirm` mas renderizado com o DS v2 (AlertDialog).
 *
 * Uso:
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   if (await confirm({ title: "Excluir?", description: "..." })) { ... }
 *   ...
 *   return <>{...} {dialog}</>;
 *
 * Com `action`, o dialog permanece aberto com botões disabled e
 * `pendingLabel` até a Promise resolver. Erro: dialog fica aberto
 * (o caller mostra o toast). Sucesso: resolve true e fecha.
 */
export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rótulo do botão enquanto `action` está pendente. */
  pendingLabel?: string;
  /** Quando true, o botão de confirmação fica em vermelho (ação destrutiva). */
  destructive?: boolean;
  /**
   * Se informado, o dialog não fecha no clique — espera esta Promise.
   * Re-throw para manter o dialog aberto após falha.
   */
  action?: () => void | Promise<void>;
};

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function useConfirm() {
  const [state, setState] = React.useState<ConfirmState | null>(null);
  const [pending, setPending] = React.useState(false);
  const stateRef = React.useRef(state);
  const pendingRef = React.useRef(pending);
  stateRef.current = state;
  pendingRef.current = pending;

  const confirm = React.useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setPending(false);
        setState({ ...opts, resolve });
      }),
    [],
  );

  function handleClose(value: boolean) {
    if (pendingRef.current) return;
    const cur = stateRef.current;
    if (!cur) return;
    cur.resolve(value);
    setState(null);
  }

  async function handleConfirm() {
    const cur = stateRef.current;
    if (!cur || pendingRef.current) return;
    if (cur.action) {
      setPending(true);
      try {
        await cur.action();
        cur.resolve(true);
        setState(null);
      } catch {
        /* caller toasts; dialog stays open for retry or cancel */
      } finally {
        setPending(false);
      }
      return;
    }
    cur.resolve(true);
    setState(null);
  }

  const dialog = (
    <AlertDialog
      open={!!state}
      onOpenChange={(o) => {
        if (!o) handleClose(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          {state?.description && (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={pending}
            className={formDialogCancelClass}
            onClick={() => handleClose(false)}
          >
            {state?.cancelLabel ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => void handleConfirm()}
            variant={state?.destructive ? "destructive" : "default"}
            className="rounded-full"
          >
            {pending
              ? (state?.pendingLabel ?? "Aguarde…")
              : (state?.confirmLabel ?? "Confirmar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
