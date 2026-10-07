/*
 * Grades responsivas do Dashboard.
 *
 * Todas respondem à LARGURA DO CONTAINER (container queries do Tailwind v4,
 * `@container` no pai + `@[Npx]:` no grid), não à da janela: o <main> perde o
 * trilho de navegação, o recuo e (no desktop) o zoom de 0,93, então 1.280 px de
 * janela dão ~1.100 px de conteúdo. Pontos de quebra, em px do container:
 *
 *   < 420      1 coluna  (celular: o rótulo completo cabe)
 *   420–899    2 colunas
 *   900–1.359  3 colunas (5 cards = 3 + 2)
 *   ≥ 1.360    todos na mesma linha
 *
 * jsdom não mede CSS: os testes só conferem os tokens (layout-classes.test.ts);
 * a conferência visual fica descrita no PR.
 */

/** Wrapper que vira o container das grades abaixo. */
export const KPI_CONTAINER_CLASS = "@container min-w-0";

/** "Agora": 3 cards pequenos + "Maior espera atual" (largo). */
export const AGORA_GRID_CLASS =
  "grid grid-cols-1 gap-1.5 @[440px]:grid-cols-2 @[700px]:grid-cols-3 @[1360px]:grid-cols-6";
/** O card largo ocupa a linha toda até caber ao lado dos outros três. */
export const AGORA_WAIT_CLASS = "@[440px]:col-span-full @[1360px]:col-span-3";

/** Cards de período do Volume (4 cards): 1 coluna no celular. */
export const PERIOD_KPI_GRID_CLASS =
  "grid grid-cols-1 gap-1.5 @[420px]:grid-cols-2 @[1000px]:grid-cols-4";

/** Indicadores de Negócios (5 cards): 2 → 3 (3+2) → 5. */
export const DEAL_KPI_GRID_CLASS =
  "grid grid-cols-1 gap-1.5 @[420px]:grid-cols-2 @[900px]:grid-cols-3 @[1360px]:grid-cols-5";

/** Exceções (4 cards). */
export const EXCEPTIONS_GRID_CLASS =
  "grid grid-cols-1 gap-1.5 @[420px]:grid-cols-2 @[1000px]:grid-cols-4";

/** Tabulações (4 cards), dentro do KpiStrip (que já vira rolagem horizontal < sm). */
export const TABULATION_KPI_GRID_CLASS =
  "grid grid-cols-2 gap-2.5 @[1000px]:grid-cols-4";
