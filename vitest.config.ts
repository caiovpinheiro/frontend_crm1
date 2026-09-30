import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Config mínima: testes unitários de helpers puros (node env). O alias `@/`
// espelha o tsconfig — os codecs de filtro da URL importam por ele.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // O tsconfig usa `jsx: preserve` (Next); sem isto o transform (oxc, Vite 8)
  // não parseia `.tsx` importado por um teste (ex.: checar `React.memo`).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
