"use client";

/*
 * Aviso acima do campo de mensagem: o contato desta conversa está no chat do
 * site, e a resposta certa é por lá. Sem ticket webchat ativo, não renderiza.
 */

import Link from "next/link";
import type { MouseEvent } from "react";
import { IconMessageCircle } from "@tabler/icons-react";

import { useActiveWebchat } from "@/features/inbox-v2/hooks/use-active-webchat";

export function ActiveWebchatNotice({
  conversationId,
  enabled = true,
  onOpen,
}: {
  conversationId: string | null;
  enabled?: boolean;
  /** Dentro do inbox troca a conversa sem recarregar; fora dele, navega. */
  onOpen?: (conversationId: string) => void;
}) {
  const active = useActiveWebchat(conversationId, enabled);
  if (!active) return null;

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!onOpen || !active) return;
    // Ctrl/Cmd/Shift mantêm abrir em outra aba ou janela.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(active.id);
  }

  return (
    <div
      role="status"
      className="mb-2 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)]"
    >
      <IconMessageCircle size={14} className="shrink-0 text-[var(--color-warning)]" aria-hidden />
      <span className="min-w-0">
        Este contato está no chat agora{" "}
        <span className="whitespace-nowrap">(Nº {active.number})</span>
      </span>
      <Link
        href={`/inbox?c=${active.number}`}
        onClick={handleClick}
        className="ml-auto inline-flex shrink-0 items-center rounded-full border border-[var(--color-warn-border)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
      >
        Abrir conversa
      </Link>
    </div>
  );
}
