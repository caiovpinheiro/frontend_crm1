/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, status: "authenticated" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { toConversationCard } from "@/features/inbox-v2/adapters";
import type { ConversationListRow } from "@/features/inbox-v2/api";
import { ComposerMenu } from "@/features/inbox-v2/extras/composer-menu";
import {
  outboundChannelsForConversation,
  resolveWhatsappSessionScope,
  type OutboundChannelOption,
} from "@/features/inbox-v2/hooks/use-channels";

const WA: OutboundChannelOption = {
  id: "ch-wa",
  name: "WhatsApp Vendas",
  type: "WHATSAPP",
  provider: "META_CLOUD_API",
  status: "CONNECTED",
  phoneNumber: "5511999999999",
};

function renderMenu(showWhatsappTemplates: boolean, showAttachments = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ComposerMenu
          conversationId="conv-1"
          showWhatsappTemplates={showWhatsappTemplates}
          showAttachments={showAttachments}
          enableCallPermission={false}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  // Botão "+" (o title vira tooltip no ButtonGlass).
  fireEvent.click(container.querySelector("button")!);
}

describe("composer em conversa Webchat", () => {
  afterEach(cleanup);

  it("sem seletor 'Enviar por' nem fallback para o 1º WhatsApp da org", () => {
    expect(outboundChannelsForConversation([WA], "webchat")).toEqual([]);
    expect(outboundChannelsForConversation([WA], "WEBCHAT")).toEqual([]);
    expect(outboundChannelsForConversation([WA], "whatsapp")).toEqual([WA]);
  });

  it("sem janela de 24h (nem template de sessão)", () => {
    const scope = resolveWhatsappSessionScope({
      selectedOutbound: null,
      conversationChannelType: "WEBCHAT",
      conversationChannelProvider: "WEBCHAT",
    });
    expect(scope.applyWhatsappSession).toBe(false);
  });

  it("menu + esconde templates, ligação, anexo e foto", () => {
    renderMenu(false, false);
    expect(screen.queryByText("Templates WhatsApp")).toBeNull();
    expect(screen.queryByText("Anexar arquivo")).toBeNull();
    expect(screen.queryByText("Tirar foto")).toBeNull();
    expect(screen.queryByText(/permissão de ligação/i)).toBeNull();
    expect(screen.getByText("Modelos internos")).toBeTruthy();
  });

  it("WhatsApp continua com 'Templates WhatsApp', anexo e foto", () => {
    renderMenu(true);
    expect(screen.getByText("Templates WhatsApp")).toBeTruthy();
    expect(screen.getByText("Anexar arquivo")).toBeTruthy();
    expect(screen.getByText("Tirar foto")).toBeTruthy();
  });

  it("card sem o pill da janela de 24h (WhatsApp mantém)", () => {
    const row = (channel: string) =>
      ({
        id: "c1",
        number: 1,
        channel,
        status: "OPEN",
        assignedToId: null,
        assignedTo: null,
        contact: { id: "ct1", name: "Maria", phone: null },
        lastInboundAt: "2020-01-01T00:00:00.000Z",
        lastMessageAt: "2020-01-01T00:00:00.000Z",
      }) as unknown as ConversationListRow;
    expect(toConversationCard(row("webchat")).sessionExpiresIn).toBeNull();
    expect(toConversationCard(row("whatsapp")).sessionExpiresIn).toBe("Expirada");
  });
});
