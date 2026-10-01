/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Sessão NextAuth controlável ───────────────────────────────────────
const sessionState = vi.hoisted(() => ({
  current: {
    data: { user: { id: "u1", organizationId: "org-1", isSuperAdmin: false } },
    status: "authenticated" as const,
  } as { data: { user: Record<string, unknown> } | null; status: string },
}));
vi.mock("next-auth/react", () => ({ useSession: () => sessionState.current }));

// ── Preview mode controlável (o resto do módulo é o original) ─────────
const previewState = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/preview-mode", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/preview-mode")>();
  return { ...mod, isPreviewMode: () => previewState.on };
});

import { ShellBootstrap } from "@/components/layout/shell-bootstrap";
import type { InboxAlertConfig } from "@/features/inbox-v2/inbox-alert-audience";
import { SIDEBAR_PREFS_KEY, useSidebarPreferences } from "@/features/sidebar/hooks";
import { useCallsWidget } from "@/features/softphone/hooks/use-calls-widget";
import { ACTIVE_WIDGET_SLUGS_KEY } from "@/features/widgets/hooks";
import { useChatTheme } from "@/hooks/use-chat-theme";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useOrganization } from "@/hooks/use-organization";
import {
  SHELL_BOOTSTRAP_PATH,
  normalizeAlertConfigBlock,
  resetShellBootstrapForTests,
  shellBootstrapKeys,
  type MeBootstrapPayload,
} from "@/lib/shell-bootstrap";

// ── Payload do backend ────────────────────────────────────────────────
function makePayload(over: Partial<MeBootstrapPayload> = {}): MeBootstrapPayload {
  return {
    version: 1,
    user: { id: "u1", organizationId: "org-1", isSuperAdmin: false },
    profile: {
      id: "u1",
      name: "Ana",
      email: "ana@x.com",
      role: "ADMIN",
      avatarUrl: null,
      phone: null,
      signature: null,
      closingMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      chatTheme: "azul",
    },
    preferences: {
      sidebar: { items: [] },
      roleSidebar: null,
      dashboard: {},
      appearance: { theme: "dark" },
      availableKeys: ["inbox", "pipeline"],
    },
    effectivePermissions: {
      permissions: ["nav:email", "inbox:view"],
      channelGrants: [],
      stageGrants: [],
      roles: [],
      groups: [],
    },
    organization: {
      id: "org-1",
      name: "Org Um",
      slug: "org-um",
      logoUrl: null,
      primaryColor: null,
      status: "ACTIVE",
      onboardingCompletedAt: null,
    },
    alertConfig: {
      config: { mine: { whatsapp: true } } as unknown as InboxAlertConfig,
      departmentIds: ["d1", 42 as unknown as string],
    },
    agentStatus: { userId: "u1", status: "ONLINE", availableForVoiceCalls: true },
    emailUnread: {
      totalUnread: 3,
      accounts: [{ id: "e1", email: "sac@x.com", unreadCount: 3 }],
    },
    teamChatRooms: { totalUnread: 0, rooms: [] },
    widgets: { activeSlugs: ["calls_history"] },
    failedBlocks: [],
    ...over,
  };
}

// ── fetch espião com rotas individuais (o "hoje") ─────────────────────
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type BootstrapAnswer = () => Response | Promise<Response>;
let bootstrapAnswer: BootstrapAnswer;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith(SHELL_BOOTSTRAP_PATH)) return bootstrapAnswer();
  if (url.endsWith("/api/organization")) {
    return json({ id: "org-1", name: "Org via GET", slug: "o", logoUrl: null, primaryColor: null, status: "ACTIVE", onboardingCompletedAt: null });
  }
  if (/\/api\/users\/[^/]+\/effective-permissions$/.test(url)) {
    return json({ permissions: ["via-get"], channelGrants: [], stageGrants: [], roles: [], groups: [] });
  }
  if (url.endsWith("/api/profile")) return json({ chatTheme: "azul", name: "Via GET" });
  if (url.endsWith("/api/profile/preferences")) {
    return json({ sidebar: { items: [] }, availableKeys: ["via-get"] });
  }
  if (url.endsWith("/api/widgets")) {
    return json({ items: [{ slug: "calls_history", installed: true }, { slug: "x", installed: false }] });
  }
  return json({ message: `rota não mockada: ${url}` }, 500);
});

const calledPaths = () =>
  fetchMock.mock.calls.map(([input]) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    return u.replace(/^https?:\/\/[^/]+/, "");
  });
const bootstrapCalls = () => calledPaths().filter((p) => p === SHELL_BOOTSTRAP_PATH).length;

// ── Harness: os hooks que o shell monta na abertura ───────────────────
type Out = {
  org: string | null;
  perms: string[] | null;
  keys: string[] | null;
  calls: boolean | null;
  errors: number;
};

function Harness() {
  const org = useOrganization();
  const perms = useMyPermissions();
  const prefs = useSidebarPreferences();
  const calls = useCallsWidget();
  useChatTheme();
  const out: Out = {
    org: org.data?.name ?? null,
    perms: perms.data?.permissions ?? null,
    keys: prefs.data?.availableKeys ?? null,
    calls: calls.enabled,
    errors: [org.isError, perms.isError, prefs.isError].filter(Boolean).length,
  };
  return <pre data-testid="out">{JSON.stringify(out)}</pre>;
}

const readOut = (): Out => JSON.parse(screen.getByTestId("out").textContent ?? "{}");

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

function App({ qc, withBootstrap = true }: { qc: QueryClient; withBootstrap?: boolean }) {
  return (
    <QueryClientProvider client={qc}>
      {withBootstrap ? <ShellBootstrap /> : null}
      <Harness />
    </QueryClientProvider>
  );
}

async function waitAllLoaded() {
  await waitFor(() => {
    const o = readOut();
    expect(o.org).not.toBeNull();
    expect(o.perms).not.toBeNull();
    expect(o.keys).not.toBeNull();
    expect(o.calls).not.toBeNull();
  });
}

beforeEach(() => {
  resetShellBootstrapForTests();
  previewState.on = false;
  sessionState.current = {
    data: { user: { id: "u1", organizationId: "org-1", isSuperAdmin: false } },
    status: "authenticated",
  };
  bootstrapAnswer = () => json(makePayload());
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("helpers", () => {
  it("chaves semeadas espelham as constantes exportadas pelos hooks", () => {
    expect(shellBootstrapKeys.sidebarPreferences()).toEqual(SIDEBAR_PREFS_KEY);
    expect(shellBootstrapKeys.activeWidgetSlugs()).toEqual(ACTIVE_WIDGET_SLUGS_KEY);
  });

  it("normalizeAlertConfigBlock aplica o mesmo saneamento do GET individual", () => {
    const n = normalizeAlertConfigBlock({ departmentIds: ["a", 1, null, "b"] });
    expect(n.departmentIds).toEqual(["a", "b"]);
    expect(n.config).toBeTruthy();
    expect(normalizeAlertConfigBlock({}).departmentIds).toEqual([]);
  });
});

describe("abertura do shell", () => {
  it("ANTES (sem <ShellBootstrap/>): cada hook faz o seu GET", async () => {
    render(<App qc={makeClient()} withBootstrap={false} />);
    await waitAllLoaded();
    const paths = calledPaths();
    expect(bootstrapCalls()).toBe(0);
    expect(paths).toHaveLength(5);
    expect(new Set(paths)).toEqual(
      new Set([
        "/api/organization",
        "/api/users/u1/effective-permissions",
        "/api/profile",
        "/api/profile/preferences",
        "/api/widgets",
      ]),
    );
    expect(readOut()).toMatchObject({ org: "Org via GET", perms: ["via-get"], calls: true, errors: 0 });
  });

  it("DEPOIS: 1 GET /api/me/bootstrap em vez de N; hooks consomem os blocos", async () => {
    const qc = makeClient();
    render(<App qc={qc} />);
    await waitAllLoaded();

    expect(calledPaths()).toEqual([SHELL_BOOTSTRAP_PATH]);
    expect(readOut()).toEqual({
      org: "Org Um",
      perms: ["nav:email", "inbox:view"],
      keys: ["inbox", "pipeline"],
      calls: true,
      errors: 0,
    });
  });

  it("semeia os caches nas chaves/formatos que as telas usam", async () => {
    const qc = makeClient();
    render(<App qc={qc} />);
    await waitAllLoaded();
    const p = makePayload();
    const k = shellBootstrapKeys;

    expect(qc.getQueryData(k.profile())).toEqual(p.profile);
    expect(qc.getQueryData(k.sidebarPreferences())).toEqual(p.preferences);
    expect(qc.getQueryData(k.myPermissions("u1"))).toEqual(p.effectivePermissions);
    expect(qc.getQueryData(k.organization("org-1"))).toEqual(p.organization);
    expect(qc.getQueryData(k.agentStatus("u1"))).toEqual(p.agentStatus);
    expect(qc.getQueryData(k.navEmailAccounts())).toEqual(p.emailUnread!.accounts);
    expect(qc.getQueryData(k.activeWidgetSlugs())).toEqual(p.widgets);
    // alert-config passa pelo mesmo saneamento do GET (departmentIds só string).
    expect(qc.getQueryData(k.alertConfig("u1"))).toEqual({
      config: p.alertConfig!.config,
      departmentIds: ["d1"],
    });
    // Salas do chat NÃO são semeadas (formato completo vive na tela do chat).
    expect(qc.getQueryData(["team-chat-rooms"])).toBeUndefined();
    // Catálogo de widgets não é tocado.
    expect(qc.getQueryData(["widgets"])).toBeUndefined();
  });

  it("bloco null (sem permissão / failedBlocks) → só aquele hook faz o GET individual", async () => {
    bootstrapAnswer = () =>
      json(makePayload({ organization: null, failedBlocks: ["organization"] }));
    render(<App qc={makeClient()} />);
    await waitAllLoaded();
    expect(calledPaths()).toEqual([SHELL_BOOTSTRAP_PATH, "/api/organization"]);
    expect(readOut()).toMatchObject({ org: "Org via GET", perms: ["nav:email", "inbox:view"], errors: 0 });
  });
});

describe("fallback", () => {
  it("404 (backend antigo): cai nos GETs de hoje sem erro e não insiste na página", async () => {
    bootstrapAnswer = () => json({ message: "Not found" }, 404);
    const qc = makeClient();
    const view = render(<App qc={qc} />);
    await waitAllLoaded();

    expect(bootstrapCalls()).toBe(1);
    expect(calledPaths()).toHaveLength(6);
    expect(readOut()).toMatchObject({ org: "Org via GET", perms: ["via-get"], keys: ["via-get"], calls: true, errors: 0 });

    // Nova identidade na mesma página: não tenta o endpoint de novo.
    sessionState.current = {
      data: { user: { id: "u1", organizationId: "org-2", isSuperAdmin: false } },
      status: "authenticated",
    };
    fetchMock.mockClear();
    view.rerender(<App qc={qc} />);
    await waitFor(() => expect(calledPaths()).toContain("/api/organization"));
    expect(bootstrapCalls()).toBe(0);
  });

  it("501 também marca como sem suporte", async () => {
    bootstrapAnswer = () => json({ message: "Not implemented" }, 501);
    render(<App qc={makeClient()} />);
    await waitAllLoaded();
    expect(bootstrapCalls()).toBe(1);
    expect(readOut()).toMatchObject({ org: "Org via GET", errors: 0 });
  });

  it("erro de rede no bootstrap: comportamento atual (GETs individuais)", async () => {
    bootstrapAnswer = () => Promise.reject(new TypeError("Failed to fetch"));
    render(<App qc={makeClient()} />);
    await waitAllLoaded();
    expect(bootstrapCalls()).toBe(1);
    expect(calledPaths()).toHaveLength(6);
    expect(readOut()).toMatchObject({ org: "Org via GET", errors: 0 });
  });

  it("500 / payload inválido / usuário diferente do da sessão → GETs individuais", async () => {
    for (const answer of [
      () => json({ message: "boom" }, 500),
      () => json({ ok: true }),
      () => json(makePayload({ user: { id: "outro", organizationId: "org-1", isSuperAdmin: false } })),
    ]) {
      cleanup();
      fetchMock.mockClear();
      bootstrapAnswer = answer;
      render(<App qc={makeClient()} />);
      await waitAllLoaded();
      expect(bootstrapCalls()).toBe(1);
      expect(readOut()).toMatchObject({ org: "Org via GET", perms: ["via-get"], errors: 0 });
    }
  });

  it("preview mode: nunca chama o endpoint", async () => {
    previewState.on = true;
    render(<App qc={makeClient()} />);
    await waitAllLoaded();
    expect(bootstrapCalls()).toBe(0);
    expect(readOut()).toMatchObject({ org: "Org via GET", errors: 0 });
  });
});

describe("invalidação e identidade", () => {
  it("invalidar depois da semeadura refaz o GET individual (não congela)", async () => {
    const qc = makeClient();
    render(<App qc={qc} />);
    await waitAllLoaded();
    expect(calledPaths()).toEqual([SHELL_BOOTSTRAP_PATH]);

    await qc.invalidateQueries({ queryKey: shellBootstrapKeys.organization("org-1") });
    await waitFor(() => expect(readOut().org).toBe("Org via GET"));
    expect(calledPaths()).toEqual([SHELL_BOOTSTRAP_PATH, "/api/organization"]);
    expect(bootstrapCalls()).toBe(1);
  });

  it("troca de org refaz o bootstrap e re-semeia nas chaves da nova org", async () => {
    const qc = makeClient();
    const view = render(<App qc={qc} />);
    await waitAllLoaded();
    expect(readOut().org).toBe("Org Um");

    bootstrapAnswer = () =>
      json(
        makePayload({
          user: { id: "u1", organizationId: "org-2", isSuperAdmin: false },
          organization: {
            id: "org-2",
            name: "Org Dois",
            slug: "org-dois",
            logoUrl: null,
            primaryColor: null,
            status: "ACTIVE",
            onboardingCompletedAt: null,
          },
          widgets: { activeSlugs: [] },
        }),
      );
    sessionState.current = {
      data: { user: { id: "u1", organizationId: "org-2", isSuperAdmin: false } },
      status: "authenticated",
    };
    view.rerender(<App qc={qc} />);

    await waitFor(() => expect(readOut().org).toBe("Org Dois"));
    expect(bootstrapCalls()).toBe(2);
    expect(calledPaths().filter((p) => p !== SHELL_BOOTSTRAP_PATH)).toEqual([]);
    expect(qc.getQueryData(shellBootstrapKeys.organization("org-2"))).toMatchObject({ name: "Org Dois" });
    expect(qc.getQueryData(shellBootstrapKeys.activeWidgetSlugs())).toEqual({ activeSlugs: [] });
  });

  it("sessão ainda carregando: bootstrap só dispara ao autenticar; hooks sem gate de sessão seguem como hoje", async () => {
    // Em produção o root layout entrega a `session` do SSR ao
    // SessionProvider e o 1º render já é `authenticated`. Este cenário
    // (sessão em `loading` no mount) cobre o caminho degradado: os hooks
    // que hoje não esperam a sessão (preferências, tema do chat, widgets)
    // disparam como sempre; os gateados (org, permissões) esperam e
    // depois vêm do bootstrap.
    sessionState.current = { data: null, status: "loading" };
    const qc = makeClient();
    const view = render(<App qc={qc} />);
    expect(bootstrapCalls()).toBe(0);
    expect(calledPaths()).not.toContain("/api/organization");

    sessionState.current = {
      data: { user: { id: "u1", organizationId: "org-1", isSuperAdmin: false } },
      status: "authenticated",
    };
    view.rerender(<App qc={qc} />);
    await waitAllLoaded();
    expect(bootstrapCalls()).toBe(1);
    expect(calledPaths()).not.toContain("/api/organization");
    expect(calledPaths()).not.toContain("/api/users/u1/effective-permissions");
    expect(readOut()).toMatchObject({ org: "Org Um", perms: ["nav:email", "inbox:view"], errors: 0 });
  });
});
