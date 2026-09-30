import { describe, expect, it } from "vitest";

import { remoteLayoutSignature, shouldWriteRemoteLayout } from "./layout-remote-gate";

const payload = (h: number) => ({
  preset: "custom",
  visibleWidgets: ["kpis"],
  layout: { kpis: { i: "kpis", x: 0, y: 0, w: 12, h } },
});

describe("shouldWriteRemoteLayout", () => {
  it("ajuste automático de altura nunca grava no servidor", () => {
    expect(
      shouldWriteRemoteLayout({
        source: "auto",
        lastSignature: remoteLayoutSignature(payload(4)),
        nextSignature: remoteLayoutSignature(payload(9)),
      }),
    ).toBe(false);
  });

  it("ação da pessoa com payload igual ao último enviado não grava", () => {
    const sig = remoteLayoutSignature(payload(4));
    expect(
      shouldWriteRemoteLayout({ source: "user", lastSignature: sig, nextSignature: sig }),
    ).toBe(false);
  });

  it("ação da pessoa com payload diferente grava", () => {
    expect(
      shouldWriteRemoteLayout({
        source: "user",
        lastSignature: remoteLayoutSignature(payload(4)),
        nextSignature: remoteLayoutSignature(payload(6)),
      }),
    ).toBe(true);
  });

  it("sem assinatura anterior (nada hidratado) a ação da pessoa grava", () => {
    expect(
      shouldWriteRemoteLayout({
        source: "user",
        lastSignature: null,
        nextSignature: remoteLayoutSignature(payload(4)),
      }),
    ).toBe(true);
  });

  it("a assinatura é estável para o mesmo conteúdo", () => {
    expect(remoteLayoutSignature(payload(4))).toBe(remoteLayoutSignature(payload(4)));
  });
});
