import type { PendingResponse, ResponsiblesResponse } from "./types";

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const MOCK_DISTRIBUTION_RESPONSIBLES: ResponsiblesResponse = {
  responsibles: [
    {
      userId: "u-mock-1",
      name: "Ana Souza",
      email: "ana@eduit.com.br",
      role: "MANAGER",
      participates: true,
      queueLimit: 8,
      volume: 3,
      type: "inbound",
      paused: false,
      lastExecutionAt: ago(12),
      status: "ONLINE",
      hasSchedule: true,
      queueCount: 3,
      eligible: true,
      blockedReasons: [],
    },
    {
      userId: "u-mock-2",
      name: "Bruno Lima",
      email: "bruno@eduit.com.br",
      role: "AGENT",
      participates: true,
      queueLimit: 6,
      volume: 5,
      type: "vendas",
      paused: false,
      lastExecutionAt: ago(45),
      status: "ONLINE",
      hasSchedule: true,
      queueCount: 5,
      eligible: true,
      blockedReasons: [],
    },
    {
      userId: "u-mock-3",
      name: "Carla Mendes",
      email: "carla@eduit.com.br",
      role: "AGENT",
      participates: true,
      queueLimit: 5,
      volume: 5,
      type: "vendas",
      paused: true,
      lastExecutionAt: ago(180),
      status: "AWAY",
      hasSchedule: true,
      queueCount: 2,
      eligible: false,
      blockedReasons: ["ON_PAUSE"],
    },
    {
      userId: "u-mock-4",
      name: "Diego Rocha",
      email: "diego@eduit.com.br",
      role: "AGENT",
      participates: true,
      queueLimit: 4,
      volume: 4,
      type: "suporte",
      paused: false,
      lastExecutionAt: ago(300),
      status: "OFFLINE",
      hasSchedule: false,
      queueCount: 0,
      eligible: false,
      blockedReasons: ["OFFLINE"],
    },
    {
      userId: "u-mock-5",
      name: "Eduarda Nunes",
      email: "eduarda@eduit.com.br",
      role: "AGENT",
      participates: false,
      queueLimit: 0,
      volume: 0,
      type: null,
      paused: false,
      lastExecutionAt: null,
      status: "OFFLINE",
      hasSchedule: true,
      queueCount: 0,
      eligible: false,
      blockedReasons: ["INACTIVE"],
    },
  ],
};

const MOCK_PENDING_SEED: {
  phone: string;
  channel: string;
  waitMinutes: number;
}[] = [
  { phone: "+555494316336", channel: "WHATSAPP", waitMinutes: 18 * 60 },
  { phone: "+5511974895736", channel: "INSTAGRAM", waitMinutes: 14 * 60 },
  { phone: "+5511952266566", channel: "WEBCHAT", waitMinutes: 13 * 60 },
  { phone: "+5511976387964", channel: "WHATSAPP", waitMinutes: 12 * 60 },
  { phone: "+5511951259983", channel: "INSTAGRAM", waitMinutes: 11 * 60 },
  { phone: "+5511991172389", channel: "WEBCHAT", waitMinutes: 11 * 60 },
  { phone: "+5511960306481", channel: "WHATSAPP", waitMinutes: 11 * 60 },
  { phone: "+5512997048019", channel: "INSTAGRAM", waitMinutes: 11 * 60 },
  { phone: "+5511979512788", channel: "FACEBOOK", waitMinutes: 11 * 60 },
  { phone: "+5511952165719", channel: "WHATSAPP", waitMinutes: 10 * 60 },
  { phone: "+5514991451558", channel: "EMAIL", waitMinutes: 9 * 60 },
  { phone: "+5511954662195", channel: "WHATSAPP", waitMinutes: 8 * 60 },
];

const MOCK_PENDING_DEPTS = [
  "Atendimento",
  "Acolhimento",
  "Comercial",
  "Suporte",
] as const;

export const MOCK_DISTRIBUTION_PENDING: PendingResponse = {
  total: MOCK_PENDING_SEED.length,
  nextCursor: null,
  pending: MOCK_PENDING_SEED.map((s, i) => ({
    id: `mock-pend-${i + 1}`,
    dealId: null,
    contactId: `mock-ct-${i + 1}`,
    label: s.phone,
    channel: s.channel,
    departmentId: `mock-dept-${(i % MOCK_PENDING_DEPTS.length) + 1}`,
    departmentName: MOCK_PENDING_DEPTS[i % MOCK_PENDING_DEPTS.length]!,
    distributionType: null,
    triggerSource: "INBOUND",
    attempts: 0,
    lastAttemptAt: ago(s.waitMinutes),
    createdAt: ago(s.waitMinutes),
  })),
};
