// =============================================================
// ESLint flat config (Next 16 + ESLint 9)
// =============================================================
// `next lint` foi deprecado em Next 16. Esta config substitui o
// fluxo legado e roda via `npm run lint` (ESLint CLI direto).
//
// Base: eslint-config-next (regras Next + react + react-hooks +
// jsx-a11y + import). Extendida com overrides do projeto.
// =============================================================

import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "coverage/**",
      "prisma/migrations/**",
      "src/generated/**",
    ],
  },
  {
    // Regras "neutras" (sem plugin TS) — valem pra .js/.mjs/.cjs tambem.
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "@next/next/no-img-element": "warn",
      "no-unused-vars": "off",

      // eslint-plugin-react-hooks v7 ativa regras agressivas novas
      // (purity, static-components, refs, set-state-in-effect) que nao
      // eram cobertas pelo `next lint` legado. Marcamos como warn pra
      // sinalizar dividas tecnicas sem bloquear merge enquanto o time
      // refatora os componentes afetados.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/error-boundaries": "warn",
    },
  },
  {
    // Regras dependentes do plugin @typescript-eslint (registrado pelo
    // bloco `next/typescript` do eslint-config-next, escopado para .ts/.tsx).
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Workers/servicos backend usam convencoes JS server-side que
    // disparam falso-positivo das regras orientadas a React UI:
    // - `usePostgresAuthState`, `useChannelLogger`, etc. nao sao
    //   React hooks.
    // - `<a href>` em emails/templates de admin nao sao Next pages.
    files: [
      "src/workers/**/*.{ts,tsx}",
      "src/services/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
      "scripts/**/*.{ts,tsx}",
    ],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // App/pages: deixamos warn (nao bloqueia, mas sinaliza dividas
    // tecnicas de a11y/perf reais).
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "react/no-unescaped-entities": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DS-001: Ícones — @tabler/icons-react é o padrão.
  //   lucide-react é legado (features/legacy-v1) e não deve crescer.
  //   warn = sinaliza no IDE sem bloquear CI; a contagem é travada pelo ratchet
  //   em scripts/ds-scan.mjs (categoria lucideImports).
  // ─────────────────────────────────────────────────────────────────────────
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/features/legacy-v1/**"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "lucide-react",
              message:
                "DS-001: use @tabler/icons-react. lucide-react é legado; veja audit/divergencias-backlog.md#DS-001.",
            },
          ],
        },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DS-009: Diálogos de confirmação — window.confirm() é proibido.
  //   Deve ser zero no codebase; qualquer nova ocorrência falha o lint.
  //   Use useConfirm() de @/hooks/use-confirm.
  // ─────────────────────────────────────────────────────────────────────────
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message:
            "DS-009: use useConfirm() de @/hooks/use-confirm em vez de confirm() nativo.",
        },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Logs: console.* é proibido em src/. Use `logger` de @/lib/logger
  //   (debug/info só em desenvolvimento ou com localStorage["bwipo:debug"]="1";
  //   warn/error sempre). Exceções ficam com eslint-disable justificado no
  //   próprio arquivo: src/lib/logger.ts (o emissor) e src/app/sw.ts (service
  //   worker). Fora de src/ (scripts/, public/) a regra não se aplica.
  // ─────────────────────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-console": "error",
    },
  },
];

export default eslintConfig;
