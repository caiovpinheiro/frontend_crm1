#!/usr/bin/env node
/**
 * Gera public/app-revision.json — fingerprint único do build atual.
 *
 * Executado em predev/prebuild, ANTES do Next.js ler `next.config.ts`
 * (que embute o valor em `NEXT_PUBLIC_BUILD_ID` via `env`). O
 * `MobileAppUpdateDialog` compara esse valor embutido no JS do cliente contra
 * `/api/app-revision` (rota não-cacheada) para detectar deploys novos — ver
 * `src/components/layout/mobile-app-update-dialog.tsx`.
 *
 * A origem do fingerprint prioriza IDs estáveis de CI (BUILD_ID / GITHUB_SHA /
 * APP_VERSION) e cai para `build-<timestamp>` quando nenhum estiver setado
 * (dev local), garantindo que cada execução gere uma revisão única.
 *
 * O que vai para o arquivo (e daí para o bundle e para a rota pública) é um
 * identificador OPACO: hash curto da origem. Só precisa ser "igual ou
 * diferente" entre dois builds — publicar o SHA do commit e a hora do build
 * (pentest) entregava de graça a versão exata do código em produção. Por isso
 * também não há mais `builtAt`.
 *
 * `APP_REVISION_OUT` troca o arquivo de saída (usado pelos testes).
 */
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = process.env.APP_REVISION_OUT
  ? resolve(process.env.APP_REVISION_OUT)
  : resolve(__dirname, "..", "public", "app-revision.json");

/** Mesmo cálculo de `opaqueRevision` em `next.config.ts` — mantenha em sincronia. */
function opaqueRevision(source) {
  return createHash("sha256").update(`app-revision:${source}`).digest("hex").slice(0, 12);
}

function main() {
  const source =
    process.env.BUILD_ID || process.env.GITHUB_SHA || process.env.APP_VERSION || `build-${Date.now()}`;
  const data = { revision: opaqueRevision(source) };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
  // O log do build não imprime a origem (SHA): só o identificador opaco.
  console.log(`[generate-app-revision] revision=${data.revision} → ${OUT_PATH}`);
}

main();
