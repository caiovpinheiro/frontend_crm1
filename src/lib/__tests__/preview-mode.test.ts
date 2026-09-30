import { describe, expect, it } from "vitest";

import {
  isLocalHostName,
  isPreviewEnabledByEnv,
  isPreviewHostName,
  isProductionRuntime,
  previewLoginDecision,
  shouldBypassAuthForPreview,
  type PreviewEnv,
} from "../preview-mode";

const PROD: PreviewEnv = { nodeEnv: "production" };
const DEV: PreviewEnv = { nodeEnv: "development" };
const PROD_FLAG_ONLY: PreviewEnv = { nodeEnv: "production", previewMode: "true" };
const PROD_DOUBLE_KEY: PreviewEnv = {
  nodeEnv: "production",
  previewMode: "true",
  allowProductionBuild: "true",
};
const DEV_FLAG: PreviewEnv = { nodeEnv: "development", previewMode: "true\n" };

const V0_HOST = "abc123.vusercontent.net";
const PROD_HOST = "acme.crm.eduit.com.br";

describe("isProductionRuntime", () => {
  it("só é produção com NODE_ENV=production", () => {
    expect(isProductionRuntime(PROD)).toBe(true);
    expect(isProductionRuntime(DEV)).toBe(false);
    expect(isProductionRuntime({ nodeEnv: "test" })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });
});

describe("isPreviewEnabledByEnv (SEC-13: dupla chave em produção)", () => {
  it("fora de produção, NEXT_PUBLIC_PREVIEW_MODE=true basta (com trim/case)", () => {
    expect(isPreviewEnabledByEnv(DEV_FLAG)).toBe(true);
    expect(isPreviewEnabledByEnv({ nodeEnv: "development", previewMode: " TRUE " })).toBe(true);
  });

  it("sem a flag principal nunca liga, mesmo com a segunda chave", () => {
    expect(isPreviewEnabledByEnv(DEV)).toBe(false);
    expect(isPreviewEnabledByEnv({ nodeEnv: "development", previewMode: "1" })).toBe(false);
    expect(
      isPreviewEnabledByEnv({ nodeEnv: "development", allowProductionBuild: "true" }),
    ).toBe(false);
  });

  it("em produção, NEXT_PUBLIC_PREVIEW_MODE sozinho é ignorado", () => {
    expect(isPreviewEnabledByEnv(PROD_FLAG_ONLY)).toBe(false);
  });

  it("em produção, liga só com as duas chaves", () => {
    expect(isPreviewEnabledByEnv(PROD_DOUBLE_KEY)).toBe(true);
    expect(
      isPreviewEnabledByEnv({ ...PROD_DOUBLE_KEY, allowProductionBuild: "yes" }),
    ).toBe(false);
  });
});

describe("isPreviewHostName / isLocalHostName", () => {
  it("casa só os domínios de preview do v0 (ignorando porta e caixa)", () => {
    expect(isPreviewHostName(V0_HOST)).toBe(true);
    expect(isPreviewHostName("X.V0.DEV:3000")).toBe(true);
    expect(isPreviewHostName("app.v0.app")).toBe(true);
    expect(isPreviewHostName("app.v0.build")).toBe(true);
    expect(isPreviewHostName(PROD_HOST)).toBe(false);
    expect(isPreviewHostName("localhost:3000")).toBe(false);
    // Sufixo precisa do ponto: "v0.dev.evil.com" e "notv0.dev" não casam.
    expect(isPreviewHostName("v0.dev.evil.com")).toBe(false);
    expect(isPreviewHostName("evil-v0.dev")).toBe(false);
    expect(isPreviewHostName("")).toBe(false);
    expect(isPreviewHostName(null)).toBe(false);
  });

  it("localhost cobre subdomínios de dev e loopback", () => {
    expect(isLocalHostName("localhost")).toBe(true);
    expect(isLocalHostName("acme.localhost:3000")).toBe(true);
    expect(isLocalHostName("127.0.0.1:3000")).toBe(true);
    expect(isLocalHostName("[::1]:3000")).toBe(true);
    expect(isLocalHostName("localhost.evil.com")).toBe(false);
    expect(isLocalHostName(PROD_HOST)).toBe(false);
  });
});

describe("shouldBypassAuthForPreview (SEC-21: middleware)", () => {
  it("em produção NUNCA libera por Host, mesmo de preview do v0", () => {
    expect(shouldBypassAuthForPreview(V0_HOST, PROD)).toBe(false);
    expect(shouldBypassAuthForPreview(V0_HOST, PROD_FLAG_ONLY)).toBe(false);
    expect(shouldBypassAuthForPreview(PROD_HOST, PROD_FLAG_ONLY)).toBe(false);
  });

  it("em produção libera apenas com a dupla chave de env", () => {
    expect(shouldBypassAuthForPreview(PROD_HOST, PROD_DOUBLE_KEY)).toBe(true);
  });

  it("fora de produção libera por env ou por Host do v0 (nunca localhost/produção)", () => {
    expect(shouldBypassAuthForPreview(PROD_HOST, DEV_FLAG)).toBe(true);
    expect(shouldBypassAuthForPreview(V0_HOST, DEV)).toBe(true);
    expect(shouldBypassAuthForPreview("localhost:3000", DEV)).toBe(false);
    expect(shouldBypassAuthForPreview(PROD_HOST, DEV)).toBe(false);
  });
});

describe("previewLoginDecision (SEC-13: /api/preview-login)", () => {
  it("em produção sem dupla chave responde 404 para qualquer Host", () => {
    expect(previewLoginDecision(V0_HOST, PROD)).toBe("not-found");
    expect(previewLoginDecision("localhost", PROD)).toBe("not-found");
    expect(previewLoginDecision(PROD_HOST, PROD_FLAG_ONLY)).toBe("not-found");
  });

  it("em produção com dupla chave permite", () => {
    expect(previewLoginDecision(PROD_HOST, PROD_DOUBLE_KEY)).toBe("allow");
  });

  it("fora de produção: permite v0/localhost/env, proíbe (403) o resto", () => {
    expect(previewLoginDecision(V0_HOST, DEV)).toBe("allow");
    expect(previewLoginDecision("localhost:3000", DEV)).toBe("allow");
    expect(previewLoginDecision("127.0.0.1", DEV)).toBe("allow");
    expect(previewLoginDecision(PROD_HOST, DEV_FLAG)).toBe("allow");
    expect(previewLoginDecision(PROD_HOST, DEV)).toBe("forbidden");
    expect(previewLoginDecision(null, DEV)).toBe("forbidden");
  });
});
