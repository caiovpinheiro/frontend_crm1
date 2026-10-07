import type { TabulationAnalyticsResponse } from "./use-tabulation-analytics";

/** Tabulações de demonstração (`?mock=1` e showcase). */
const ROWS: Array<[path: string, dept: "SAC" | "Acolhimento" | "Retenção", count: number, number?: number]> = [
  ["Provas › Avaliação regimental", "SAC", 19],
  ["Polo › Aluno de outro polo", "SAC", 17],
  ["Sem Resposta", "Retenção", 14, 98],
  ["Acadêmico › Dificuldade no AVA", "SAC", 13],
  ["Acolhimento › Acolhimento inicial", "Acolhimento", 10],
  ["Sem Resposta › Alunos inativos", "SAC", 8],
  ["Acolhimento › Acolhimento de retorno", "Acolhimento", 7],
  ["Transferencia › Teleatendimento", "SAC", 5],
  ["Acadêmico › Acesso › Senha do AVA", "SAC", 5],
  ["Acadêmico › Dp e Adaptação", "SAC", 4],
  ["Tecnológico › Disciplina online", "SAC", 4],
  ["Financeiro › Negociação de débito", "SAC", 4],
  ["Acolhimento › Primeiro contato", "Acolhimento", 3],
  ["Acadêmico › Dificuldade com prova", "SAC", 3],
  ["Acadêmico › Pós › Dúvidas gerais", "SAC", 2],
  ["Secretaria › Emissão de documentos", "SAC", 2],
];

const DEPT_NAME = { SAC: "Atendimento - SAC", Acolhimento: "Acolhimento", Retenção: "Retenção" };

export const MOCK_TABULATION_ROWS: TabulationAnalyticsResponse["byTabulation"] = ROWS.map(
  ([path, dept, count, number], i) => ({
    tabulationId: `mock-tab-${i}`,
    name: path.split(" › ").pop() ?? path,
    number: number ?? null,
    path,
    departmentId: `mock-dept-${dept}`,
    departmentName: DEPT_NAME[dept],
    count,
  }),
);

const USERS = ["Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Alves", "Fernanda Dias"];

export function mockTabulationAnalytics(page = 1, perPage = 25): TabulationAnalyticsResponse {
  const total = MOCK_TABULATION_ROWS.reduce((sum, row) => sum + row.count, 0);
  const weights = [0.3, 0.25, 0.2, 0.15, 0.1];
  const byUser = USERS.map((name, i) => ({
    userId: `mock-user-${i}`,
    name,
    count: Math.round(total * weights[i]!),
  }));
  const now = Date.now();
  const all = MOCK_TABULATION_ROWS.flatMap((row) =>
    Array.from({ length: row.count }, () => row),
  ).map((row, i) => ({
    id: `mock-log-${i}`,
    occurredAt: new Date(now - i * 47 * 60_000).toISOString(),
    conversationId: null,
    contactName: `Contato ${i + 1}`,
    actorName: USERS[i % USERS.length]!,
    tabulationPath: row.path,
    tabulationNumber: row.number ?? null,
    departmentName: row.departmentName,
  }));
  return {
    total,
    page,
    perPage,
    distinctTabulations: MOCK_TABULATION_ROWS.length,
    distinctUsers: USERS.length,
    byTabulation: MOCK_TABULATION_ROWS,
    byUser,
    items: all.slice((page - 1) * perPage, page * perPage),
  };
}
