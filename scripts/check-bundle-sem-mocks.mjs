#!/usr/bin/env node
/**
 * Confere que o bundle público NÃO carrega os mocks do preview mode nem
 * e-mails pessoais do operador (pentest: dados de mock com PII real estavam
 * no JavaScript servido em produção).
 *
 * Uso (depois de `npm run build` com o preview DESLIGADO):
 *
 *   node scripts/check-bundle-sem-mocks.mjs            # varre .next/static
 *   node scripts/check-bundle-sem-mocks.mjs <dir> ...  # varre outro(s) diretório(s)
 *
 * Saída: 0 = limpo · 1 = achou sentinela/e-mail · 2 = uso inválido
 * (diretório inexistente, sentinela que não existe mais no catálogo).
 *
 * Equivale a `grep -rlF -e <sentinela> ... .next/static`, mais:
 *  - garante que cada sentinela AINDA existe em `src/lib/preview-mocks.ts`
 *    (senão o grep passaria "limpo" por estar procurando a string errada);
 *  - procura qualquer `alguem@<domínio do operador>` fora da lista de contatos
 *    institucionais públicos.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Strings que só existem no catálogo de mocks do preview (nome, e-mail, id). */
export const SENTINELS = ["Agente Demo A", "agente.a@example.com", "u-demo-agente-a"];

/** Arquivo-fonte onde as sentinelas precisam existir. */
const MOCKS_SOURCE = path.join(ROOT, "src", "lib", "preview-mocks.ts");

/** Contatos institucionais públicos do operador (páginas públicas do app). */
const OPERATOR_EMAIL_RE = /[a-z0-9._%+-]+@eduit\.com\.br/gi;
const OPERATOR_EMAIL_ALLOWLIST = new Set(["comercial@eduit.com.br", "suporte@eduit.com.br"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function scan(dirs) {
  const hits = [];
  let files = 0;
  for (const dir of dirs) {
    for (const file of walk(dir)) {
      files += 1;
      const text = readFileSync(file, "latin1");
      for (const sentinel of SENTINELS) {
        // latin1 preserva bytes; as sentinelas são ASCII.
        if (text.includes(sentinel)) hits.push({ file, what: `sentinela "${sentinel}"` });
      }
      const emails = new Set(
        (text.match(OPERATOR_EMAIL_RE) ?? [])
          .map((e) => e.toLowerCase())
          .filter((e) => !OPERATOR_EMAIL_ALLOWLIST.has(e)),
      );
      // Não imprime o endereço: o log de CI é mais público que o repositório.
      if (emails.size > 0) {
        hits.push({ file, what: `${emails.size} e-mail(s) pessoal(is) do operador` });
      }
    }
  }
  return { hits, files };
}

const args = process.argv.slice(2);
const dirs = (args.length > 0 ? args : [path.join(ROOT, ".next", "static")]).map((d) =>
  path.resolve(d),
);

for (const dir of dirs) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`[check-bundle] diretório não encontrado: ${dir} — rode \`npm run build\` antes.`);
    process.exit(2);
  }
}

const source = existsSync(MOCKS_SOURCE) ? readFileSync(MOCKS_SOURCE, "utf8") : "";
const stale = SENTINELS.filter((s) => !source.includes(s));
if (stale.length > 0) {
  console.error(
    `[check-bundle] sentinela(s) ausente(s) de src/lib/preview-mocks.ts: ${stale.join(", ")} — atualize SENTINELS.`,
  );
  process.exit(2);
}

const { hits, files } = scan(dirs);
if (hits.length > 0) {
  console.error(`[check-bundle] FALHOU — mocks/PII no bundle (${hits.length} ocorrência(s)):`);
  for (const hit of hits) console.error(`  ${path.relative(ROOT, hit.file)}: ${hit.what}`);
  console.error(
    "Os mocks de preview só podem entrar por import() dentro de um if com " +
      'process.env.NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED === "true" (ver preview-mocks-installer.tsx).',
  );
  process.exit(1);
}
console.log(`[check-bundle] ok — ${files} arquivo(s) sem mocks de preview nem e-mails pessoais.`);
