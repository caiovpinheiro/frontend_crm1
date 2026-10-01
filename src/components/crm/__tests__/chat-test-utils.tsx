/**
 * Render estático (react-dom/server) para os testes do chat canônico.
 *
 * O vitest do projeto roda em `node` (sem jsdom / Testing Library), então
 * afirmamos sobre o HTML gerado: presença de textos, `aria-label`s e
 * atributos `data-*`. Efeitos não rodam — o que cobre a composição de
 * props → markup, que é o contrato entre host, ChatArea e MessageBubble.
 */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TooltipProvider } from "@/components/crm/tooltip-glass";
import type { Message } from "@/components/crm/message-bubble";

export function renderStatic(node: ReactElement): string {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Quantas vezes `needle` aparece em `html`. */
export function countOf(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

export function makeMessage(over: Partial<Message> & { id: string }): Message {
  return {
    content: "Olá",
    time: "09:00",
    createdAt: "2026-09-29T12:00:00.000Z",
    type: "incoming",
    kind: "message",
    ...over,
  };
}
