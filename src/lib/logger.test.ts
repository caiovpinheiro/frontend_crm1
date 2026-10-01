import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOGGER_DEBUG_STORAGE_KEY, logger, urlForLog } from "./logger";

/** `window.localStorage` falso: a suíte roda em ambiente node. */
function stubWindow(getItem: (key: string) => string | null) {
  vi.stubGlobal("window", { localStorage: { getItem } });
}

describe("logger", () => {
  const spies = {
    debug: vi.spyOn(console, "debug"),
    info: vi.spyOn(console, "info"),
    warn: vi.spyOn(console, "warn"),
    error: vi.spyOn(console, "error"),
  };

  beforeEach(() => {
    for (const spy of Object.values(spies)) spy.mockImplementation(() => {});
  });

  afterEach(() => {
    for (const spy of Object.values(spies)) spy.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("debug e info ficam mudos em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubWindow(() => null);
    logger.debug("escopo", "diagnóstico");
    logger.info("escopo", "diagnóstico");
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
  });

  it("debug e info ficam mudos em produção no servidor (sem window)", () => {
    vi.stubEnv("NODE_ENV", "production");
    logger.debug("escopo", "diagnóstico");
    logger.info("escopo", "diagnóstico");
    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
  });

  it("debug e info emitem em desenvolvimento", () => {
    vi.stubEnv("NODE_ENV", "development");
    logger.debug("escopo", "a");
    logger.info("escopo", "b", { id: 1 });
    expect(spies.debug).toHaveBeenCalledWith("[escopo] a");
    expect(spies.info).toHaveBeenCalledWith("[escopo] b", { id: 1 });
  });

  it('debug e info emitem em produção com localStorage["bwipo:debug"]="1"', () => {
    vi.stubEnv("NODE_ENV", "production");
    stubWindow((key) => (key === LOGGER_DEBUG_STORAGE_KEY ? "1" : null));
    logger.debug("escopo", "a");
    logger.info("escopo", "b");
    expect(LOGGER_DEBUG_STORAGE_KEY).toBe("bwipo:debug");
    expect(spies.debug).toHaveBeenCalledWith("[escopo] a");
    expect(spies.info).toHaveBeenCalledWith("[escopo] b");
  });

  it("qualquer outro valor da chave não liga o debug", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubWindow(() => "true");
    logger.debug("escopo", "a");
    expect(spies.debug).not.toHaveBeenCalled();
  });

  it("warn e error sempre emitem, com escopo e contexto", () => {
    vi.stubEnv("NODE_ENV", "production");
    const err = new Error("boom");
    logger.warn("escopo", "atenção", { status: 500 });
    logger.error("escopo", "falhou", err);
    expect(spies.warn).toHaveBeenCalledWith("[escopo] atenção", { status: 500 });
    expect(spies.error).toHaveBeenCalledWith("[escopo] falhou", err);
  });

  it("sem contexto não passa um segundo argumento", () => {
    logger.warn("escopo", "só a mensagem");
    expect(spies.warn.mock.calls[0]).toEqual(["[escopo] só a mensagem"]);
  });

  it("storage bloqueado não quebra e mantém o debug desligado", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubWindow(() => {
      throw new Error("SecurityError");
    });
    expect(() => logger.debug("escopo", "a")).not.toThrow();
    expect(spies.debug).not.toHaveBeenCalled();
  });
});

describe("urlForLog", () => {
  it("descarta query string e hash", () => {
    expect(urlForLog("https://parceiro.example/app/x?token=abc&email=a@b.c#frag")).toBe(
      "https://parceiro.example/app/x",
    );
  });

  it("não devolve o texto original quando a URL é inválida", () => {
    expect(urlForLog("não é url ?token=abc")).toBe("(url inválida)");
  });
});
