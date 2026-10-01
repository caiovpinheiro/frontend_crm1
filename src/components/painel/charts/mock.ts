// Mesmos números dos prints, para usar com ?mock=1.
import type {
  AgentStat, ChannelStat, DepartmentStat, ReasonStat, Tabulation, UserTabulationCount,
} from './types';

const h = (hours: number, min: number) => hours * 60 + min;

export const mockTabulations: Tabulation[] = [
  { category: 'Comercial', reason: 'Sem interesse', count: 42 },
  { category: 'Comercial', reason: 'Já é aluno', count: 31 },
  { category: 'Suporte', reason: 'Dúvida acadêmica', count: 27 },
  { category: 'Comercial', reason: 'Preço alto', count: 18 },
  { category: 'Suporte', reason: 'Problema de acesso', count: 15 },
  { category: 'Financeiro', reason: 'Boleto', count: 12 },
];

export const mockChannels: ChannelStat[] = [
  { channel: 'WhatsApp', count: 128, medianFirstResponseMin: 7 },
  { channel: 'Instagram', count: 36, medianFirstResponseMin: 14 },
  { channel: 'E-mail', count: 14, medianFirstResponseMin: 42 },
  { channel: 'Widget do site', count: 8, medianFirstResponseMin: 11 },
];

export const mockDepartments: DepartmentStat[] = [
  { id: 'd1', name: 'Atendimento', finished: 86, open: 9, avgFirstResponseMin: 17, avgStartMin: 7, avgDurationMin: h(9, 50) },
  { id: 'd2', name: 'Acolhimento', finished: 54, open: 6, avgFirstResponseMin: 22, avgStartMin: 10, avgDurationMin: h(12, 29) },
  { id: 'd3', name: 'Retenção', finished: 31, open: 4, avgFirstResponseMin: 29, avgStartMin: 14, avgDurationMin: h(16, 19) },
  { id: 'd4', name: 'Sem departamento', finished: 11, open: 2, avgFirstResponseMin: 43, avgStartMin: 22, avgDurationMin: h(20, 10) },
];

export const mockAgents: AgentStat[] = [
  { id: 'a1', name: 'Ana Souza', finished: 41, open: 5, avgFirstResponseMin: 20, avgStartMin: 7, avgDurationMin: h(12, 6) },
  { id: 'a2', name: 'Bruno Lima', finished: 36, open: 4, avgFirstResponseMin: 27, avgStartMin: 10, avgDurationMin: h(14, 41) },
  { id: 'a3', name: 'Carla Mendes', finished: 27, open: 6, avgFirstResponseMin: 37, avgStartMin: 12, avgDurationMin: h(18, 26) },
  { id: 'a4', name: 'Diego Alves', finished: 18, open: 3, avgFirstResponseMin: 50, avgStartMin: 17, avgDurationMin: h(23, 2) },
  { id: 'a5', name: 'Fernanda Dias', finished: 14, open: 2, avgFirstResponseMin: 30, avgStartMin: 10, avgDurationMin: h(16, 42) },
];

export const mockUsers: UserTabulationCount[] = [
  ['Ana Souza', 22], ['Bruno Lima', 20], ['Carla Mendes', 18], ['Diego Alves', 16], ['Elena Costa', 14],
  ['Fernanda Dias', 12], ['Gabriela Nunes', 10], ['Hugo Martins', 8], ['Iris Prado', 6], ['João Ribeiro', 4],
  ['Karina Lopes', 3], ['Lucas Teixeira', 3],
].map(([name, count], i) => ({ id: `u${i}`, name: name as string, count: count as number }));

export const mockReasons: ReasonStat[] = [
  { reason: 'Matrícula', count: 52, medianFirstResponseMin: 6 },
  { reason: 'Financeiro', count: 31, medianFirstResponseMin: 18 },
  { reason: 'Suporte', count: 24, medianFirstResponseMin: 9 },
  { reason: 'Comercial', count: 19, medianFirstResponseMin: 8 },
];
