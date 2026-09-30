import { describe, expect, it } from "vitest";

import { appRevisionQueryOptions } from "@/hooks/use-app-revision";
import {
  ALERT_CONFIG_STALE_MS,
  APP_REVISION_POLL_MS,
  EMAIL_ACCOUNTS_POLL_MS,
  pollWhileVisible,
  TEAM_CHAT_MESSAGES_POLL_MS,
  TEAM_CHAT_MESSAGES_STALE_MS,
} from "../shell-polling";

describe("política de polling do shell (FE-4/5/12/18, MA-5)", () => {
  it("intervalos mínimos das queries do shell", () => {
    expect(EMAIL_ACCOUNTS_POLL_MS).toBe(5 * 60_000);
    expect(APP_REVISION_POLL_MS).toBe(3 * 60_000);
    expect(TEAM_CHAT_MESSAGES_POLL_MS).toBe(60_000);
    expect(TEAM_CHAT_MESSAGES_STALE_MS).toBe(20_000);
    expect(ALERT_CONFIG_STALE_MS).toBe(10 * 60_000);
  });

  it("pollWhileVisible: só com a aba visível, nunca em background nem por foco", () => {
    expect(pollWhileVisible(true, 60_000)).toEqual({
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    });
    expect(pollWhileVisible(false, 60_000).refetchInterval).toBe(false);
    expect(pollWhileVisible(false, 60_000).refetchOnWindowFocus).toBe(false);
  });
});

describe("app-revision compartilhada (FE-18)", () => {
  it("uma query só, 3 min, staleTime = intervalo", () => {
    const opts = appRevisionQueryOptions({ enabled: true, visible: true, clientRevision: "abc123" });
    expect(opts.queryKey).toEqual(["app-revision"]);
    expect(opts.enabled).toBe(true);
    expect(opts.refetchInterval).toBe(APP_REVISION_POLL_MS);
    expect(opts.staleTime).toBe(APP_REVISION_POLL_MS);
    expect(opts.refetchIntervalInBackground).toBe(false);
  });

  it("aba oculta não faz poll", () => {
    const opts = appRevisionQueryOptions({ enabled: true, visible: false, clientRevision: "abc123" });
    expect(opts.refetchInterval).toBe(false);
  });

  it("sem BUILD_ID comparável (vazio ou dev) fica desligada", () => {
    expect(appRevisionQueryOptions({ enabled: true, visible: true, clientRevision: "" }).enabled).toBe(false);
    expect(appRevisionQueryOptions({ enabled: true, visible: true, clientRevision: "dev" }).enabled).toBe(false);
    expect(appRevisionQueryOptions({ enabled: false, visible: true, clientRevision: "abc" }).enabled).toBe(false);
  });
});
