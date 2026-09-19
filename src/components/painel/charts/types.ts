// Formatos esperados pelos componentes. Faça o mapeamento a partir de
// usePainelService / tabulações em um único adapter (ver charts-adapter.ts).
//
// Tempos em MINUTOS. `null` = sem amostra no período (não é "zero minutos") e
// deve ser renderizado como "—", nunca como dentro da meta.

export type Tabulation = { category: string; reason: string; count: number };

export type ChannelStat = {
  channel: string;
  count: number;
  medianFirstResponseMin: number | null;
};

export type AgentStat = {
  id: string;
  name: string;
  finished: number;
  open: number;
  avgFirstResponseMin: number | null;
  avgStartMin: number | null;
  avgDurationMin: number | null;
};

export type DepartmentStat = {
  id: string;
  name: string;
  finished: number;
  open: number;
  avgFirstResponseMin: number | null;
  avgStartMin: number | null;
  avgDurationMin: number | null;
};

export type UserTabulationCount = { id: string; name: string; count: number };

export type ReasonStat = {
  reason: string;
  count: number;
  medianFirstResponseMin: number | null;
};
