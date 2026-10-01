import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Regressão do achado do pentest: mocks do preview (com PII real) iam no
 * bundle público de produção.
 *
 *  1. Guardas ESTÁTICOS sobre `src/` (rodam em todo PR, sem build): o catálogo
 *     de mocks só entra por `import()` atrás da chave de build, e não há
 *     e-mail pessoal do operador no código.
 *  2. O script `scripts/check-bundle-sem-mocks.mjs` (o "grep" pós-build)
 *     continua detectando vazamento.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "src");
const SCRIPT = path.join(ROOT, "scripts", "check-bundle-sem-mocks.mjs");
const FLAG = 'process.env.NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED === "true"';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|json)$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const isTest = (file: string) => /(\.test\.tsx?$|\/__tests__\/|\/__fixtures__\/)/.test(rel(file));

const sources = walk(SRC)
  .filter((f) => !isTest(f))
  .map((file) => ({ file: rel(file), text: readFileSync(file, "utf8") }));

describe("mocks de preview fora do bundle de produção (guardas estáticos)", () => {
  it("ninguém importa o catálogo de mocks estaticamente, só `preview-fetch.ts`", () => {
    const offenders = sources
      .filter((s) => s.file !== "src/lib/preview-fetch.ts")
      .filter((s) => /(from|import)\s*\(?\s*["'][^"']*\/preview-mocks["']/.test(s.text))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("`preview-fetch` só é carregado por import() dinâmico atrás da chave de build", () => {
    const importers = sources.filter((s) => /["'][^"']*\/preview-fetch["']/.test(s.text));
    expect(importers.map((s) => s.file)).toEqual(["src/components/preview-mocks-installer.tsx"]);
    for (const s of importers) {
      // Sem import estático de valor (o `typeof import(...)` é só tipo).
      expect(s.text).not.toMatch(/^import .* from ["'][^"']*\/preview-fetch["']/m);
      expect(s.text).toContain(FLAG);
      // O import() vem DEPOIS do `if` com a chave literal.
      expect(s.text.indexOf(FLAG)).toBeLessThan(s.text.indexOf('import("@/lib/preview-fetch")'));
    }
  });

  it("toda rota de showcase/dev é um wrapper de servidor atrás da chave de build", () => {
    const pages = sources.filter(
      (s) =>
        /^src\/app\/(\(app\)\/(showcase|ds-showcase)|dev)\/.*page\.tsx$/.test(s.file) &&
        !s.file.endsWith("client-page.tsx"),
    );
    expect(pages.length).toBeGreaterThanOrEqual(14);
    const ungated = pages
      // `/dev/fluxo` é só um redirect para a rota real, sem dados.
      .filter((s) => s.file !== "src/app/dev/fluxo/page.tsx")
      .filter(
        (s) =>
          /^["']use client["']/.test(s.text.trimStart()) ||
          !s.text.includes(FLAG) ||
          // nenhum import estático relativo: o conteúdo entra só por import().
          /^import .* from ["']\.{1,2}\//m.test(s.text),
      )
      .map((s) => s.file);
    expect(ungated).toEqual([]);
  });

  it("não há e-mail pessoal do operador no código (só contatos institucionais)", () => {
    const allow = new Set(["comercial@eduit.com.br", "suporte@eduit.com.br"]);
    const offenders = sources
      .filter((s) =>
        (s.text.match(/[a-z0-9._%+-]+@eduit\.com\.br/gi) ?? []).some(
          (e) => !allow.has(e.toLowerCase()),
        ),
      )
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});

describe("scripts/check-bundle-sem-mocks.mjs", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "check-bundle-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  function run(dir: string): { status: number; output: string } {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT, dir], { encoding: "utf8", stdio: "pipe" });
      return { status: 0, output: stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { status: e.status ?? -1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  function fixture(name: string, files: Record<string, string>): string {
    const dir = path.join(tmp, name);
    for (const [file, content] of Object.entries(files)) {
      const full = path.join(dir, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return dir;
  }

  it("passa em bundle limpo (contato institucional é permitido)", () => {
    const dir = fixture("limpo", {
      "chunks/app.js": 'const a="comercial@eduit.com.br";console.log("ok")',
    });
    expect(run(dir).status).toBe(0);
  });

  it("falha quando uma sentinela dos mocks aparece em qualquer subpasta", () => {
    const dir = fixture("com-mock", {
      "chunks/app/layout.js": 'x={id:"u-demo-agente-a",name:"Agente Demo A"}',
    });
    const res = run(dir);
    expect(res.status).toBe(1);
    expect(res.output).toContain("layout.js");
  });

  it("falha com e-mail pessoal do operador, sem imprimir o endereço", () => {
    const dir = fixture("com-email", { "chunks/x.js": 'e="fulano.real@eduit.com.br"' });
    const res = run(dir);
    expect(res.status).toBe(1);
    expect(res.output).not.toContain("fulano.real");
  });

  it("sai com 2 quando o diretório não existe (build não rodou)", () => {
    expect(run(path.join(tmp, "nao-existe")).status).toBe(2);
  });
});
