/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", name: "Ana" } }, status: "authenticated" }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/features/inbox-v2/extras/audio-recorder-button", () => ({
  AudioRecorderButton: () => <button type="button">microfone</button>,
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { Composer } from "@/features/inbox-v2/extras/composer";

function renderComposer(attachmentsEnabled: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Composer
          value=""
          onChange={() => {}}
          onSend={() => {}}
          conversationId="conv-1"
          attachmentsEnabled={attachmentsEnabled}
          whatsappFeatures={attachmentsEnabled}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Composer — Webchat sem áudio", () => {
  afterEach(cleanup);

  it("sem microfone quando anexos estão desligados (Webchat)", () => {
    renderComposer(false);
    expect(screen.queryByText("microfone")).toBeNull();
  });

  it("WhatsApp mantém o microfone", () => {
    renderComposer(true);
    expect(screen.getByText("microfone")).toBeTruthy();
  });
});
