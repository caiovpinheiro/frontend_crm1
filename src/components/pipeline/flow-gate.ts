/**
 * Decisão de o que o Flow (`/pipeline/flow`) renderiza antes de ter dados.
 *
 * Pura de propósito: o hard refresh do Flow já travou no shell de loading
 * várias vezes por regressão de ordem dos `if`s no host. Aqui a regra fica
 * isolada e coberta por teste — em especial a invariante de que `stuck`
 * (timeout do shell) NUNCA pode resultar em `pending`.
 */

export const FLOW_ERROR_NO_PIPELINES = "Nenhum funil configurado nesta organização.";
export const FLOW_ERROR_LOAD_FAILED = "Não foi possível carregar os funis.";

export type FlowGateInput = {
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
  /** CUID do funil ativo; null enquanto `GET /api/pipelines` não resolve. */
  pipelineId: string | null;
  pipelinesError: boolean;
  pipelinesEmpty: boolean;
  /** Shell pendente por mais tempo que o timeout de segurança. */
  stuck: boolean;
};

export type FlowGate =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

/**
 * Ordem importa:
 * 1. sem sessão o middleware redireciona — renderizar shell prendia a tela,
 *    porque `usePipelines` fica desligada e `pipelineId` nunca sai de null;
 * 2. com funil resolvido, segue para a UI real;
 * 3. lista vazia / erro / timeout viram estado terminal com retry;
 * 4. só então "carregando".
 */
export function resolveFlowGate(input: FlowGateInput): FlowGate {
  if (input.sessionStatus === "unauthenticated") return { kind: "none" };
  if (input.pipelineId) return { kind: "ready" };
  if (input.pipelinesEmpty) {
    return { kind: "error", message: FLOW_ERROR_NO_PIPELINES };
  }
  if (input.pipelinesError || input.stuck) {
    return { kind: "error", message: FLOW_ERROR_LOAD_FAILED };
  }
  return { kind: "pending" };
}
