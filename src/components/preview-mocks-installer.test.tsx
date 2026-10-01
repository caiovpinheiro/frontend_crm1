/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previewState = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/preview-mode", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/preview-mode")>();
  return { ...mod, isPreviewMode: () => previewState.on };
});

import { PreviewMocksInstaller } from "./preview-mocks-installer";

const FLAG = "NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED";

describe("PreviewMocksInstaller", () => {
  const realFetch = vi.fn(async () => new Response("real", { status: 200 }));

  beforeEach(() => {
    previewState.on = true;
    realFetch.mockClear();
    window.fetch = realFetch as unknown as typeof window.fetch;
    delete window.__previewFetchInstalled;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("build sem a chave (produção normal): não toca no fetch, mesmo com preview ligado", () => {
    vi.stubEnv(FLAG, "false");
    render(<PreviewMocksInstaller />);
    expect(window.fetch).toBe(realFetch);
    expect(window.__previewFetchInstalled).toBeUndefined();
  });

  it("build com a chave, mas preview desligado em runtime: não instala", () => {
    vi.stubEnv(FLAG, "true");
    previewState.on = false;
    render(<PreviewMocksInstaller />);
    expect(window.fetch).toBe(realFetch);
  });

  it("build com a chave + preview: instala já e responde /api/* com o catálogo carregado por import()", async () => {
    vi.stubEnv(FLAG, "true");
    render(<PreviewMocksInstaller />);
    expect(window.__previewFetchInstalled).toBe(true);
    expect(window.fetch).not.toBe(realFetch);

    // Request feito ANTES do chunk carregar espera o chunk e não vaza pro backend.
    const res = await window.fetch("/api/users/me");
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { user?: { email?: string } };
    expect(body.user?.email).toBe("gestor.demo@example.com");
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("outro host passa direto para o fetch original", async () => {
    vi.stubEnv(FLAG, "true");
    render(<PreviewMocksInstaller />);
    await window.fetch("https://cdn.example.com/asset.js");
    expect(realFetch).toHaveBeenCalledTimes(1);
  });
});
