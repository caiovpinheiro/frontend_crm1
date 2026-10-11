import { describe, expect, it } from "vitest";

import { noticeStatus } from "../notices-step";

describe("status do aviso temporário na tela", () => {
  const now = new Date("2026-10-11T12:00");
  it("agendado, em vigor, encerrado e sem início", () => {
    expect(noticeStatus({ id: "a", message: "x", startsAt: "2026-10-12T08:00" }, now)).toBe("scheduled");
    expect(noticeStatus({ id: "a", message: "x", startsAt: "2026-10-11T08:00", endsAt: "2026-10-13T08:00" }, now)).toBe("active");
    expect(noticeStatus({ id: "a", message: "x", startsAt: "2026-10-09T08:00", endsAt: "2026-10-10T08:00" }, now)).toBe("ended");
    expect(noticeStatus({ id: "a", message: "x", startsAt: "" }, now)).toBe("invalid");
  });
  it("sem fim (ou fim antes do início): vale 24 h depois do início", () => {
    expect(noticeStatus({ id: "a", message: "x", startsAt: "2026-10-11T08:00" }, now)).toBe("active");
    expect(noticeStatus({ id: "a", message: "x", startsAt: "2026-10-10T08:00" }, now)).toBe("ended");
    expect(noticeStatus({ id: "a", message: "x", startsAt: "2026-10-11T08:00", endsAt: "2026-10-11T07:00" }, now)).toBe("active");
  });
});
