import type { PendingResponse, ResponsiblesResponse } from "./types";

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const MOCK_DISTRIBUTION_RESPONSIBLES: ResponsiblesResponse = {
  responsibles: [
    {
      userId: "u-mock-1",
      name: "Ana Souza",
      email: "ana@example.com",
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
      email: "bruno@example.com",
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
      email: "carla@example.com",
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
      email: "diego@example.com",
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
      email: "eduarda@example.com",
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
  { phone: "+5511999990038", channel: "WHATSAPP", waitMinutes: 18 * 60 },
  { phone: "+5511999990039", channel: "INSTAGRAM", waitMinutes: 14 * 60 },
  { phone: "+5511999990040", channel: "WEBCHAT", waitMinutes: 13 * 60 },
  { phone: "+5511999990041", channel: "WHATSAPP", waitMinutes: 12 * 60 },
  { phone: "+5511999990042", channel: "INSTAGRAM", waitMinutes: 11 * 60 },
  { phone: "+5511999990043", channel: "WEBCHAT", waitMinutes: 11 * 60 },
  { phone: "+5511999990044", channel: "WHATSAPP", waitMinutes: 11 * 60 },
  { phone: "+5511999990045", channel: "INSTAGRAM", waitMinutes: 11 * 60 },
  { phone: "+5511999990046", channel: "FACEBOOK", waitMinutes: 11 * 60 },
  { phone: "+5511999990047", channel: "WHATSAPP", waitMinutes: 10 * 60 },
  { phone: "+5511999990048", channel: "EMAIL", waitMinutes: 9 * 60 },
  { phone: "+5511999990049", channel: "WHATSAPP", waitMinutes: 8 * 60 },
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
