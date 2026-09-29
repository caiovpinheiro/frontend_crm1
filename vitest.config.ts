import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Config mínima: testes unitários de helpers puros (node env). O alias `@/`
// espelha o tsconfig — os codecs de filtro da URL importam por ele.
export default defineConfig({
  // O tsconfig usa `jsx: "preserve"` (o Next compila o JSX). Sem isto, um
  // helper que importa um barrel com `.tsx` quebra no import-analysis.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
