/** @vitest-environment jsdom */
/**
 * L5 — faixas do Inbox: a 768–1023 px mantém lista + conversa lado a lado
 * (contato em gaveta); só abaixo de 768 px vira painel único.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/crm/page-header", () => ({
  PageHeader: ({ center }: { center?: ReactNode }) => <header>{center}</header>,
}));
vi.mock("../inbox-header-controls", () => ({
  InboxCollapseHeaderButton: () => null,
  InboxCollapsiblePageHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  InboxExpandHeaderButton: () => null,
  InboxMobileCompactBar: ({ search }: { search: ReactNode }) => <div>{search}</div>,
  InboxMobilePaneToggle: () => null,
}));

import { InboxShell } from "../inbox-shell";

function renderShell(
  layout: "mobile" | "tablet" | "desktop",
  over: {
    hasActiveConversation?: boolean;
    drawerOpen?: boolean;
    onDrawer?: (open: boolean) => void;
  } = {},
) {
  return render(
    <InboxShell
      pageHeader={{ icon: null, title: "Inbox" }}
      layout={layout}
      navRail={<nav>rail</nav>}
      hasActiveConversation={over.hasActiveConversation ?? true}
      onCloseConversation={() => {}}
      headerCollapsed={false}
      headerHydrated
      setHeaderCollapsed={() => {}}
      mobilePaneTab="chat"
      setMobilePaneTab={() => {}}
      conversationColumn={<section>lista</section>}
      chat={<section>chat</section>}
      aside={<aside>contato</aside>}
      asideCollapsed={false}
      convWidth={300}
      asideWidth={320}
      setAsideWidth={() => {}}
      tabletDrawerOpen={over.drawerOpen ?? false}
      onTabletDrawerChange={over.onDrawer ?? (() => {})}
      period={null}
      searchFilter={null}
      searchFilterWithPeriod={null}
      compactSearchFilter={null}
      mobileCallButton={null}
      templateModal={null}
      extraDialogs={null}
    />,
  );
}

afterEach(() => cleanup());

describe("InboxShell por faixa de largura", () => {
  it("tablet: lista e conversa juntas; contato fora até abrir a gaveta", () => {
    renderShell("tablet");
    expect(screen.getByText("lista")).toBeTruthy();
    expect(screen.getByText("chat")).toBeTruthy();
    expect(screen.queryByText("contato")).toBeNull();
    expect(screen.getByLabelText("Abrir painel do contato")).toBeTruthy();
    const grid = screen.getByTestId("inbox-tablet-body");
    expect(grid.style.gridTemplateColumns).toBe("300px minmax(0, 1fr)");
  });

  it("tablet: o botão pede para abrir; com a gaveta aberta o contato aparece sobre a conversa", () => {
    const onDrawer = vi.fn();
    renderShell("tablet", { onDrawer });
    fireEvent.click(screen.getByLabelText("Abrir painel do contato"));
    expect(onDrawer).toHaveBeenCalledWith(true);
    cleanup();

    renderShell("tablet", { drawerOpen: true, onDrawer });
    expect(screen.getByTestId("inbox-tablet-drawer")).toBeTruthy();
    expect(screen.getByText("contato")).toBeTruthy();
    expect(screen.getByText("chat")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDrawer).toHaveBeenCalledWith(false);
  });

  it("tablet sem conversa aberta: sem botão de contato", () => {
    renderShell("tablet", { hasActiveConversation: false });
    expect(screen.queryByLabelText("Abrir painel do contato")).toBeNull();
  });

  it("celular: painel único (conversa aberta mostra só o chat)", () => {
    renderShell("mobile");
    expect(screen.getByText("chat")).toBeTruthy();
    expect(screen.queryByText("lista")).toBeNull();
    expect(screen.queryByTestId("inbox-tablet-body")).toBeNull();
  });

  it("desktop: três colunas, sem gaveta", () => {
    const { container } = renderShell("desktop");
    expect(screen.getByText("lista")).toBeTruthy();
    expect(screen.getByText("chat")).toBeTruthy();
    expect(screen.getByText("contato")).toBeTruthy();
    expect(screen.queryByTestId("inbox-tablet-body")).toBeNull();
    const grid = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
      (el) => el.style.gridTemplateColumns.startsWith("300px"),
    );
    expect(grid?.style.gridTemplateColumns).toBe("300px minmax(0, 1fr) 320px");
  });
});
