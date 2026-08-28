import type { ActivityStats } from "./use-activity-stats";

const today = new Date();
function dayKey(offset: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

const timelineByActor = Array.from({ length: 14 }, (_, i) => {
  const wave = Math.sin((i / 14) * Math.PI * 2);
  const weekend = i % 7 === 0 || i % 7 === 6;
  const wf = weekend ? 0.55 : 1;
  const HUMAN = Math.round((9 + wave * 3) * wf);
  const AI = Math.round((2 + wave * 1) * wf);
  const AUTOMATION = Math.round((4 + wave * 2) * wf);
  const INTEGRATION = Math.round((6 + wave * 2) * wf);
  const SYSTEM = Math.round((3 + wave * 1) * wf);
  return {
    day: dayKey(13 - i),
    HUMAN,
    AI,
    AUTOMATION,
    INTEGRATION,
    SYSTEM,
  };
});

export const MOCK_ACTIVITY_STATS: ActivityStats = {
  window: { from: dayKey(29), to: dayKey(0) },
  totals: {
    total: 248,
    byActorType: {
      HUMAN: 142,
      AI: 38,
      AUTOMATION: 52,
      INTEGRATION: 16,
      SYSTEM: 0,
    },
    byEntityType: {
      DEAL: 88,
      CONTACT: 54,
      MESSAGE: 72,
      CONVERSATION: 24,
      ACTIVITY: 10,
    },
    byType: [
      { type: "LEAD_DISTRIBUTION_FAILED", count: 64 },
      { type: "MESSAGE_RECEIVED", count: 48 },
      { type: "AUTOMATION_EXECUTED", count: 32 },
      { type: "CONVERSATION_CREATED", count: 28 },
      { type: "MESSAGE_SENT", count: 22 },
      { type: "MESSAGE_READ", count: 18 },
      { type: "STAGE_CHANGED", count: 14 },
      { type: "CONVERSATION_CLOSED", count: 10 },
      { type: "LEAD_DISTRIBUTED", count: 8 },
      { type: "OWNER_CHANGED", count: 6 },
      { type: "AI_AGENT_ACTION", count: 5 },
      { type: "CONVERSATION_TABULATED", count: 4 },
      { type: "MESSAGE_FAILED", count: 3 },
      { type: "CONTACT_CREATED", count: 2 },
    ],
  },
  timeline: timelineByActor.map((d) => ({
    day: d.day,
    count: d.HUMAN + d.AI + d.AUTOMATION + d.INTEGRATION + d.SYSTEM,
  })),
  timelineByActor,
  hourly: Array.from({ length: 24 }, (_, h) => {
    const peak =
      Math.exp(-Math.pow(h - 14, 2) / 26) +
      0.4 * Math.exp(-Math.pow(h - 10, 2) / 10);
    return { hour: h, count: Math.round(peak * 18 + 1) };
  }),
};
