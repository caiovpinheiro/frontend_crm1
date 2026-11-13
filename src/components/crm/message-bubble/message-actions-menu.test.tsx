/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { MessageActionsMenu } from "./message-actions-menu";

const message = { id: "m1", content: "oi", time: "", type: "incoming" as const };

afterEach(cleanup);

describe("MessageActionsMenu — Fixar/Favoritar", () => {
  it("inbox (padrão): continuam no menu", async () => {
    render(<MessageActionsMenu message={message} isOutgoing={false} open onOpenChange={() => {}} onReply={() => {}} />);
    expect(await screen.findByText("Fixar")).toBeTruthy();
    expect(screen.getByText("Favoritar")).toBeTruthy();
  });

  it("grupos (hideUnavailableActions sem handler): só Responder/Reagir/Copiar", async () => {
    render(
      <MessageActionsMenu
        message={message}
        isOutgoing={false}
        open
        onOpenChange={() => {}}
        onReply={() => {}}
        onReact={() => {}}
        hideUnavailableActions
      />,
    );
    expect(await screen.findByText("Responder")).toBeTruthy();
    expect(screen.queryByText("Fixar")).toBeNull();
    expect(screen.queryByText("Favoritar")).toBeNull();
  });
});
