/*
 * Grades responsivas do Dashboard.
 *
 * Todas respondem à LARGURA DO CONTAINER (container queries do Tailwind v4,
 * `@container` no pai + `@[Npx]:` no grid), não à da janela: o <main> perde o
 * trilho de navegação, o recuo e (no desktop) o zoom de 0,93, então 1.280 px de
 * janela dão ~1.100 px de conteúdo. Pontos de quebra, em px do container:
 *
 *   < 420      1 coluna  (celular: o rótulo completo cabe) — exceto os KPIs
 *              de período e de tabulações, que ficam 2×2
 *   420–899    2 colunas
 *   900–1.359  3 colunas (5 cards = 3 + 2)
 *   ≥ 1.360    todos na mesma linha
 *
 * jsdom não mede CSS: os testes só conferem os tokens (layout-classes.test.ts);
 * a conferência visual fica descrita no PR.
 */

/** Wrapper que vira o container das grades abaixo. */
export const KPI_CONTAINER_CLASS = "@container min-w-0";

/**
 * "Agora": os 3 cards pequenos (aguardando, em atendimento, atendentes) na
 * mesma linha — 1 coluna no celular, 2 no tablet, 3 no desktop — e "Maior
 * espera atual" abaixo, na largura toda. Antes a espera vinha no meio e quebrava
 * a linha: 1/3 vazio ao lado dos dois primeiros e "Atendentes" sozinho embaixo.
 */
export const AGORA_GRID_CLASS =
  "grid grid-cols-1 gap-1.5 @[440px]:grid-cols-2 @[700px]:grid-cols-3";
/** O card largo ocupa sempre a linha toda, depois dos três. */
export const AGORA_WAIT_CLASS = "col-span-full";

/**
 * Cards de período do Volume (4 cards): 2×2 até caberem os 4 na linha. No
 * celular eram 4 × 75 px empilhados; o rótulo quebra em até 2 linhas.
 */
export const PERIOD_KPI_GRID_CLASS = "grid grid-cols-2 gap-1.5 @[1000px]:grid-cols-4";

/** Indicadores de Negócios (5 cards): 2 → 3 (3+2) → 5. */
export const DEAL_KPI_GRID_CLASS =
  "grid grid-cols-1 gap-1.5 @[420px]:grid-cols-2 @[900px]:grid-cols-3 @[1360px]:grid-cols-5";

/** Exceções (4 cards). */
export const EXCEPTIONS_GRID_CLASS =
  "grid grid-cols-1 gap-1.5 @[420px]:grid-cols-2 @[1000px]:grid-cols-4";

/** Tabulações (4 cards): 2×2 também no celular (era carrossel lateral), 4 com folga. */
export const TABULATION_KPI_GRID_CLASS =
  "grid grid-cols-2 gap-1.5 @[1000px]:grid-cols-4";

/**
 * Alvo de toque ≥ 40 px nos botões do Dashboard em ponteiro grosso (dedo) ou
 * abaixo de `md`. No desktop com mouse nada muda. Vai no <main> da página.
 */
export const DASHBOARD_TOUCH_TARGET_CLASS =
  "max-md:[&_button]:min-h-10 max-md:[&_button]:min-w-10 pointer-coarse:[&_button]:min-h-10 pointer-coarse:[&_button]:min-w-10";
