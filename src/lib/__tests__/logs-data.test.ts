import { describe, expect, it } from "vitest"

import {
  automationLogToEntry,
  inboxHrefForLog,
  type AutomationLogRow,
} from "@/lib/logs-data"

function row(patch: Partial<AutomationLogRow> = {}): AutomationLogRow {
  return {
    id: "log-1",
    status: "SUCCESS",
    executedAt: "2026-09-10T12:00:00.000Z",
    ...patch,
  }
}

describe("inboxHrefForLog", () => {
  it("usa o número público da conversa", () => {
    expect(
      inboxHrefForLog({ conversationId: "cuid_abc", conversationNumber: 42 }),
    ).toBe("/inbox?c=42")
  })

  it("cai no id quando não há número", () => {
    expect(
      inboxHrefForLog({ conversationId: "cuid_abc", conversationNumber: null }),
    ).toBe("/inbox?c=cuid_abc")
  })

  it("omite o link sem conversa", () => {
    expect(
      inboxHrefForLog({ conversationId: null, conversationNumber: null }),
    ).toBeNull()
  })
})

describe("automationLogToEntry conversa", () => {
  it("lê conversationId e conversationNumber da API", () => {
    const entry = automationLogToEntry(
      row({ conversationId: "conv_1", conversationNumber: 88 }),
    )
    expect(entry.conversationId).toBe("conv_1")
    expect(entry.conversationNumber).toBe(88)
    expect(inboxHrefForLog(entry)).toBe("/inbox?c=88")
  })

  it("lê a conversa no payload quando a API não envia o campo", () => {
    const entry = automationLogToEntry(
      row({
        payload: { conversationId: "conv_payload", conversationNumber: "15" },
      }),
    )
    expect(entry.conversationId).toBe("conv_payload")
    expect(entry.conversationNumber).toBe(15)
    expect(inboxHrefForLog(entry)).toBe("/inbox?c=15")
  })
})
