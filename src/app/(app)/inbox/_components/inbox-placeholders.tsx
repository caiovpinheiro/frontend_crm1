import { IconDeviceLaptop, IconMessageCircle } from "@tabler/icons-react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";

export function EmptyChatArea() {
  // `h-full min-h-0` cobre a coluna do grid; o card fica no centro do
  // container de conversa (não da página). Sem isso o main colapsava e
  // sobrava faixa vazia no F5.
  return (
    <main className="flex h-full min-h-0 w-full flex-col items-center justify-center p-6">
      <div
        className={cn(
          CARD_SURFACE_CLASS,
          "flex w-full max-w-md flex-col items-center px-8 py-12 text-center",
        )}
      >
        <div className="relative flex h-16 w-20 items-center justify-center text-primary">
          <IconDeviceLaptop size={64} stroke={1.25} aria-hidden />
          <IconMessageCircle
            className="absolute -translate-y-0.5"
            size={24}
            stroke={1.75}
            aria-hidden
          />
        </div>
        <h2 className="mt-6 font-display text-xl font-bold tracking-tight text-foreground">
          Selecione uma conversa
        </h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Mensagens, ligações e o histórico do contato aparecem aqui.
        </p>
      </div>
    </main>
  );
}

export function NoDealTab({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[var(--text-muted)]">
      <div className="font-display text-[13px] font-semibold">
        Nenhum negocio vinculado
      </div>
      <p className="max-w-xs text-[12px]">{message}</p>
    </div>
  );
}

export function EmptyAside() {
  return (
    <aside
      aria-label="Detalhes do contato"
      // `h-full min-h-0` — mesma correção do EmptyChatArea. Sem isso,
      // quando o aside NÃO é colapsado (ex.: preferência do usuário
      // salva como aberto), o placeholder ficava com altura de conteúdo
      // e sobrava uma faixa vazia embaixo.
      className="flex h-full min-h-0 w-full items-center justify-center rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-6 text-center text-[12px] text-[var(--text-muted)] backdrop-blur-md shadow-[var(--glass-shadow)]"
    >
      Sem contato selecionado.
    </aside>
  );
}
