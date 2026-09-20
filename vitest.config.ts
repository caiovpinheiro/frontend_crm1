import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Config mínima: testes unitários de helpers puros (node env). O alias `@/`
// espelha o tsconfig — os codecs de filtro da URL importam por ele.
// O plugin React entra só para permitir que testes .ts importem utilitários
// que ainda re-exportam componentes TSX via barrel (ex.: chat-timeline).
export default defineConfig({
  plugins: [react()],
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
