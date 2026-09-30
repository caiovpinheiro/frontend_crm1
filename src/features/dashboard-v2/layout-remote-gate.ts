/**
 * Decide se uma mudança de layout do dashboard vai para o servidor
 * (`PUT /api/dashboard/layout`).
 *
 * - `user`: drag/resize/adicionar/remover feito pela pessoa → grava, mas só
 *   se o payload serializado mudou desde o último envio (ou da hidratação).
 * - `auto`: ajuste automático de altura (ResizeObserver) e reconciliação
 *   de etapas → fica só no localStorage. Antes cada mudança de altura de
 *   um widget (dados chegando do polling, resize da janela) virava um PUT.
 */
export type LayoutChangeSource = "user" | "auto";

export function remoteLayoutSignature(payload: unknown): string {
  return JSON.stringify(payload);
}

export function shouldWriteRemoteLayout(args: {
  source: LayoutChangeSource;
  lastSignature: string | null;
  nextSignature: string;
}): boolean {
  if (args.source === "auto") return false;
  return args.lastSignature !== args.nextSignature;
}
