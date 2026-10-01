import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/app-revision/route";
import { hasComparableClientRevision } from "@/hooks/use-app-revision";

/**
 * Pentest: `/api/app-revision` (pública) devolvia o SHA completo do commit e
 * a hora do build. Agora o identificador é opaco — e a detecção de versão
 * nova (cliente compara o que tem embutido com o que o servidor responde)
 * continua funcionando.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "generate-app-revision.mjs");
const SHA_A = "0123456789abcdef0123456789abcdef01234567";
const SHA_B = "fedcba9876543210fedcba9876543210fedcba98";

const tmp = mkdtempSync(path.join(tmpdir(), "app-revision-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Roda o gerador do prebuild como o CI roda, com `GITHUB_SHA` = `sha`. */
function generate(sha: string, name: string): { file: Record<string, unknown>; log: string } {
  const out = path.join(tmp, `${name}.json`);
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_SHA: sha, APP_REVISION_OUT: out };
  delete env.BUILD_ID;
  delete env.APP_VERSION;
  const log = execFileSync(process.execPath, [SCRIPT], { env, encoding: "utf8" });
  return { file: JSON.parse(readFileSync(out, "utf8")) as Record<string, unknown>, log };
}

async function serverRevision(buildId: string): Promise<Record<string, unknown>> {
  vi.stubEnv("NEXT_PUBLIC_BUILD_ID", buildId);
  const res = GET();
  expect(res.headers.get("cache-control")).toContain("no-store");
  return (await res.json()) as Record<string, unknown>;
}

afterEach(() => vi.unstubAllEnvs());

describe("identificador opaco do build", () => {
  it("o gerador grava só um hash curto: sem SHA, sem prefixo do SHA, sem builtAt", () => {
    const { file, log } = generate(SHA_A, "a");
    expect(Object.keys(file)).toEqual(["revision"]);
    expect(file.revision).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(file)).not.toContain(SHA_A.slice(0, 7));
    // O log do build (público em CI) também não leva o SHA.
    expect(log).not.toContain(SHA_A.slice(0, 7));
  });

  it("é determinístico por commit e muda quando o commit muda", () => {
    expect(generate(SHA_A, "a1").file.revision).toBe(generate(SHA_A, "a2").file.revision);
    expect(generate(SHA_A, "a3").file.revision).not.toBe(generate(SHA_B, "b1").file.revision);
  });
});

describe("GET /api/app-revision", () => {
  it("devolve só `revision` — nada de builtAt", async () => {
    const body = await serverRevision("a1b2c3d4e5f6");
    expect(body).toEqual({ revision: "a1b2c3d4e5f6" });
  });

  it("não usa mais NEXT_PUBLIC_BUILD_TIME mesmo que exista no ambiente", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2026-10-01T00:00:00.000Z");
    const body = await serverRevision("a1b2c3d4e5f6");
    expect(JSON.stringify(body)).not.toContain("2026-10-01");
  });
});

describe("detecção de versão nova continua funcionando", () => {
  // O mesmo valor vai para o bundle (cliente) e para a rota (servidor): os
  // dois saem de `NEXT_PUBLIC_BUILD_ID`, gerado uma vez no prebuild.
  it("cliente e servidor do MESMO build → iguais (sem aviso)", async () => {
    const client = String(generate(SHA_A, "same").file.revision);
    expect(hasComparableClientRevision(client)).toBe(true);
    const remote = (await serverRevision(client)).revision;
    expect(remote === client).toBe(true);
  });

  it("servidor em build NOVO → diferente do cliente antigo (mostra o aviso)", async () => {
    const client = String(generate(SHA_A, "old").file.revision);
    const deployed = String(generate(SHA_B, "new").file.revision);
    const remote = (await serverRevision(deployed)).revision;
    expect(remote).not.toBe(client);
  });

  it("cliente antigo (SHA cru no bundle) contra servidor novo → detecta o deploy", async () => {
    const deployed = String(generate(SHA_A, "rollout").file.revision);
    const remote = (await serverRevision(deployed)).revision;
    expect(hasComparableClientRevision(SHA_A)).toBe(true);
    expect(remote).not.toBe(SHA_A);
  });
});
