/*
 * Dados de exemplo da Distribuição por Leads (modo DEV/mock — mesmo padrão
 * de `mock.ts` do modo smart). Nunca usados em produção.
 */

import type {
  LeadsHistoryResponse,
  LeadsParticipantsResponse,
  LeadsStatsResponse,
} from "./leads-types";

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function slotsFor(weight: number, lastAssignedAt: string | null) {
  return Array.from({ length: 5 }, (_, slotIndex) => ({
    slotIndex,
    active: slotIndex < weight,
    lastAssignedAt: slotIndex === 0 ? lastAssignedAt : null,
  }));
}

export const MOCK_LEADS_PARTICIPANTS: LeadsParticipantsResponse = {
  participants: [
    {
      userId: "u-mock-1",
      name: "Ana Souza",
      email: "ana@eduit.com.br",
      avatarUrl: null,
      status: "ACTIVE",
      weight: 3,
      slots: slotsFor(3, ago(8)),
      totalReceived: 42,
      createdAt: ago(60 * 24 * 7),
      updatedAt: ago(60),
    },
    {
      userId: "u-mock-2",
      name: "Bruno Lima",
      email: "bruno@eduit.com.br",
      avatarUrl: null,
      status: "ACTIVE",
      weight: 1,
      slots: slotsFor(1, ago(32)),
      totalReceived: 14,
      createdAt: ago(60 * 24 * 7),
      updatedAt: ago(90),
    },
    {
      userId: "u-mock-3",
      name: "Carla Mendes",
      email: "carla@eduit.com.br",
      avatarUrl: null,
      status: "INACTIVE",
      weight: 0,
      slots: slotsFor(0, null),
      totalReceived: 27,
      createdAt: ago(60 * 24 * 6),
      updatedAt: ago(200),
    },
  ],
};

export const MOCK_LEADS_STATS: LeadsStatsResponse = {
  total: 83,
  byUser: [
    { userId: "u-mock-1", name: "Ana Souza", count: 42 },
    { userId: "u-mock-2", name: "Bruno Lima", count: 14 },
    { userId: "u-mock-3", name: "Carla Mendes", count: 27 },
  ],
  ranking: [
    { userId: "u-mock-1", name: "Ana Souza", count: 42 },
    { userId: "u-mock-3", name: "Carla Mendes", count: 27 },
    { userId: "u-mock-2", name: "Bruno Lima", count: 14 },
  ],
};

const MOCK_LEADS_HISTORY_SEED = [
  { phone: "+555494316336", userId: "u-mock-1", name: "Ana Souza", minutes: 8 },
  { phone: "+5511974895736", userId: "u-mock-2", name: "Bruno Lima", minutes: 26 },
  { phone: "+5511952266566", userId: "u-mock-1", name: "Ana Souza", minutes: 41 },
  { phone: "+5511976387964", userId: "u-mock-1", name: "Ana Souza", minutes: 55 },
  { phone: "+5511951259983", userId: "u-mock-3", name: "Carla Mendes", minutes: 73 },
  { phone: "+5511991172389", userId: "u-mock-1", name: "Ana Souza", minutes: 90 },
  { phone: "+5511960306481", userId: "u-mock-2", name: "Bruno Lima", minutes: 112 },
  { phone: "+5512997048019", userId: "u-mock-1", name: "Ana Souza", minutes: 140 },
];

export const MOCK_LEADS_HISTORY: LeadsHistoryResponse = {
  total: MOCK_LEADS_HISTORY_SEED.length,
  nextCursor: null,
  items: MOCK_LEADS_HISTORY_SEED.map((s, i) => ({
    id: `mock-leads-${i + 1}`,
    createdAt: ago(s.minutes),
    userId: s.userId,
    userName: s.name,
    slotIndex: i % 3,
    targetKey: `contact:mock-ct-${i + 1}`,
    contactId: `mock-ct-${i + 1}`,
    dealId: null,
    conversationId: `mock-cv-${i + 1}`,
    leadLabel: s.phone,
    triggerSource: "AUTOMATION",
  })),
};
