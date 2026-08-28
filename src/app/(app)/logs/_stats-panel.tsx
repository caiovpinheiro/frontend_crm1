"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  CalendarCheck,
  CheckCheck,
  CheckSquare,
  CircleDot,
  ClipboardCheck,
  Clock,
  GitBranch,
  MessageCircle,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  Plug,
  Send,
  Server,
  Share2,
  StickyNote,
  Tag,
  Trash2,
  Trophy,
  User,
  UserCog,
  UserMinus,
  UserPlus,
  Webhook,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { KpiCard, KpiSquareScroll, type KpiTone } from "@/components/crm/kpi-card";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { EVENT_CONFIG } from "@/components/crm/feed";
import { cn } from "@/lib/utils";
import type { ActivityStats } from "@/features/activity-feed/use-activity-stats";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

function compact(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

type ActorKey = "HUMAN" | "AI" | "AUTOMATION" | "INTEGRATION" | "SYSTEM";

const ACTOR_META: Record<
  ActorKey,
  {
    label: string;
    Icon: LucideIcon;
    iconClass: string;
    barClass: string;
    fill: string;
    tone: KpiTone;
    seriesKey: "humanos" | "ia" | "automacoes" | "integracoes" | "sistema";
  }
> = {
  HUMAN: {
    label: "Humanos",
    Icon: User,
    iconClass: "text-primary",
    barClass: "bg-primary",
    fill: "var(--color-primary)",
    tone: "brand",
    seriesKey: "humanos",
  },
  AI: {
    label: "Agentes IA",
    Icon: Bot,
    iconClass: "text-fuchsia",
    barClass: "bg-fuchsia",
    fill: "var(--color-fuchsia)",
    tone: "violet",
    seriesKey: "ia",
  },
  AUTOMATION: {
    label: "Automações",
    Icon: Zap,
    iconClass: "text-lavender",
    barClass: "bg-lavender",
    fill: "var(--color-lavender)",
    tone: "violet",
    seriesKey: "automacoes",
  },
  INTEGRATION: {
    label: "Integrações",
    Icon: Plug,
    iconClass: "text-sky",
    barClass: "bg-sky",
    fill: "var(--color-sky)",
    tone: "brand",
    seriesKey: "integracoes",
  },
  SYSTEM: {
    label: "Sistema",
    Icon: Server,
    iconClass: "text-muted-foreground",
    barClass: "bg-muted-foreground",
    fill: "var(--color-muted-foreground)",
    tone: "neutral",
    seriesKey: "sistema",
  },
};

const ACTOR_ORDER: ActorKey[] = [
  "HUMAN",
  "AI",
  "AUTOMATION",
  "INTEGRATION",
  "SYSTEM",
];

/** Empilhamento do gráfico de área (base → topo). Base = volumes maiores. */
const AREA_STACK: ActorKey[] = [
  "SYSTEM",
  "INTEGRATION",
  "AUTOMATION",
  "HUMAN",
  "AI",
];

const ENTITY_META: Record<
  string,
  { label: string; Icon: LucideIcon; iconClass: string; barClass: string }
> = {
  DEAL: {
    label: "Negócio",
    Icon: Briefcase,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  CONTACT: {
    label: "Contato",
    Icon: User,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  CONVERSATION: {
    label: "Conversa",
    Icon: MessageCircle,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
  MESSAGE: {
    label: "Mensagem",
    Icon: MessageSquare,
    iconClass: "text-lavender",
    barClass: "bg-lavender",
  },
  ACTIVITY: {
    label: "Tarefa",
    Icon: CheckSquare,
    iconClass: "text-chip-orange",
    barClass: "bg-chip-orange",
  },
  NOTE: {
    label: "Nota",
    Icon: StickyNote,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
  TAG: {
    label: "Tag",
    Icon: Tag,
    iconClass: "text-fuchsia",
    barClass: "bg-fuchsia",
  },
};

type EventVisual = {
  Icon: LucideIcon;
  iconClass: string;
  barClass: string;
};

const EVENT_VISUAL: Record<string, EventVisual> = {
  LEAD_DISTRIBUTION_FAILED: {
    Icon: Share2,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  LEAD_DISTRIBUTED: {
    Icon: Share2,
    iconClass: "text-lavender",
    barClass: "bg-lavender",
  },
  MESSAGE_RECEIVED: {
    Icon: MessageSquare,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
  MESSAGE_SENT: {
    Icon: Send,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  MESSAGE_READ: {
    Icon: CheckCheck,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  MESSAGE_FAILED: {
    Icon: AlertTriangle,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  AUTOMATION_EXECUTED: {
    Icon: Zap,
    iconClass: "text-lavender",
    barClass: "bg-lavender",
  },
  AUTOMATION_RUN: {
    Icon: Zap,
    iconClass: "text-lavender",
    barClass: "bg-lavender",
  },
  CONVERSATION_CREATED: {
    Icon: MessageCircle,
    iconClass: "text-fuchsia",
    barClass: "bg-fuchsia",
  },
  CONVERSATION_CLOSED: {
    Icon: MessageCircle,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
  CONVERSATION_TABULATED: {
    Icon: ClipboardCheck,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  CONVERSATION_REOPENED: {
    Icon: MessageCircle,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
  CONTACT_CREATED: {
    Icon: UserPlus,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
  AI_AGENT_ACTION: {
    Icon: Bot,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  STAGE_CHANGED: {
    Icon: ArrowRight,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  OWNER_CHANGED: {
    Icon: UserCog,
    iconClass: "text-fuchsia",
    barClass: "bg-fuchsia",
  },
  CONTACT_OWNER_CHANGED: {
    Icon: UserCog,
    iconClass: "text-fuchsia",
    barClass: "bg-fuchsia",
  },
  ASSIGNEE_CHANGED: {
    Icon: UserCog,
    iconClass: "text-lavender",
    barClass: "bg-lavender",
  },
  CUSTOM_FIELD_UPDATED: {
    Icon: Pencil,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  FIELD_UPDATED: {
    Icon: Pencil,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
  CREATED: {
    Icon: Briefcase,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  DEAL_DELETED: {
    Icon: Trash2,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  CONTACT_DELETED: {
    Icon: Trash2,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  NOTE_DELETED: {
    Icon: Trash2,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  ACTIVITY_DELETED: {
    Icon: Trash2,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  TAG_REMOVED: {
    Icon: XCircle,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  CONTACT_TAG_REMOVED: {
    Icon: XCircle,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  CONTACT_LINKED: {
    Icon: UserPlus,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  CONTACT_UNLINKED: {
    Icon: UserMinus,
    iconClass: "text-muted-foreground",
    barClass: "bg-muted-foreground",
  },
  CONTACT_FIELD_CHANGED: {
    Icon: Pencil,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
  CONTACT_TAG_ADDED: {
    Icon: Tag,
    iconClass: "text-fuchsia",
    barClass: "bg-fuchsia",
  },
  CONVERSATION_STATUS_CHANGED: {
    Icon: ClipboardCheck,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  CONVERSATION_DEPARTMENT_CHANGED: {
    Icon: GitBranch,
    iconClass: "text-lavender",
    barClass: "bg-lavender",
  },
  ACTIVITY_UPDATED: {
    Icon: Pencil,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  ACTIVITY_RENAMED: {
    Icon: Pencil,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  ACTIVITY_DUE_CHANGED: {
    Icon: Clock,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
  ACTIVITY_DESCRIPTION_CHANGED: {
    Icon: Pencil,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  NOTE_UPDATED: {
    Icon: Pencil,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
  PRODUCT_REMOVED: {
    Icon: Package,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
  PRODUCT_UPDATED: {
    Icon: Package,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
  SCHEDULED_MESSAGE_CREATED: {
    Icon: Clock,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  SCHEDULED_MESSAGE_CANCELLED: {
    Icon: XCircle,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
  SCHEDULED_MESSAGE_FAILED: {
    Icon: AlertTriangle,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  STATUS_CHANGED: {
    Icon: Trophy,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  CALL_COMPLETED: {
    Icon: Phone,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  CALL_MISSED: {
    Icon: Phone,
    iconClass: "text-chip-red",
    barClass: "bg-chip-red",
  },
  ACTIVITY_ADDED: {
    Icon: CalendarCheck,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  ACTIVITY_COMPLETED: {
    Icon: CheckSquare,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  NOTE_ADDED: {
    Icon: StickyNote,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
  TAG_ADDED: {
    Icon: Tag,
    iconClass: "text-fuchsia",
    barClass: "bg-fuchsia",
  },
  PRODUCT_ADDED: {
    Icon: Package,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  SCHEDULED_MESSAGE_SENT: {
    Icon: Clock,
    iconClass: "text-primary",
    barClass: "bg-primary",
  },
  WEBHOOK: {
    Icon: Webhook,
    iconClass: "text-sky",
    barClass: "bg-sky",
  },
};

const FALLBACK_EVENT_BARS = [
  "bg-primary",
  "bg-success",
  "bg-sky",
  "bg-lavender",
  "bg-fuchsia",
  "bg-chip-red",
] as const;

const FALLBACK_EVENT_ICONS = [
  "text-primary",
  "text-success",
  "text-sky",
  "text-lavender",
  "text-fuchsia",
  "text-chip-red",
] as const;

function eventVisual(type: string, index: number): EventVisual {
  return (
    EVENT_VISUAL[type] ?? {
      Icon: Activity,
      iconClass: FALLBACK_EVENT_ICONS[index % FALLBACK_EVENT_ICONS.length],
      barClass: FALLBACK_EVENT_BARS[index % FALLBACK_EVENT_BARS.length],
    }
  );
}

type BarRow = {
  key: string;
  label: string;
  value: number;
  Icon: LucideIcon;
  iconClass: string;
  barClass: string;
};

function formatChartLabel(label?: string) {
  if (!label) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const d = new Date(`${label}T00:00:00`);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  }
  return label;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; fill?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const heading = formatChartLabel(label);
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-md">
      {heading ? (
        <p className="mb-1 text-xs font-semibold text-foreground">{heading}</p>
      ) : null}
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span>{entry.name}:</span>
          <span className="font-semibold tabular-nums text-foreground">
            {typeof entry.value === "number" ? fmt(entry.value) : "—"}
          </span>
        </p>
      ))}
    </div>
  );
}

function BarList({ title, rows }: { title: string; rows: BarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className={cn(CARD_SURFACE_CLASS, "flex flex-col gap-4 p-5")}>
      <h2 className="text-base font-bold tracking-tight text-foreground">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sem dados no período.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const Icon = row.Icon;
            const pct = Math.max((row.value / max) * 100, 4);
            return (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(140px,1.1fr)_1.4fr_auto] items-center gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon
                    className={cn("size-4 shrink-0", row.iconClass)}
                    aria-hidden="true"
                  />
                  <span
                    className="truncate text-sm text-foreground"
                    title={row.label}
                  >
                    {row.label}
                  </span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={cn("block h-full rounded-full", row.barClass)}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                  {fmt(row.value)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SummaryCards({ stats }: { stats: ActivityStats }) {
  const items = ACTOR_ORDER.map((key) => {
    const meta = ACTOR_META[key];
    const Icon = meta.Icon;
    return {
      key,
      label: meta.label,
      value: stats.totals.byActorType[key] ?? 0,
      tone: meta.tone,
      icon: <Icon className="size-5" aria-hidden="true" />,
    };
  });

  return (
    <>
      <KpiSquareScroll
        items={[
          {
            key: "total",
            label: "Total",
            value: fmt(stats.totals.total),
            tone: "brand" as KpiTone,
            icon: <Activity className="size-4" aria-hidden="true" />,
          },
          ...items.map((c) => ({
            key: c.key,
            label: c.label,
            value: fmt(c.value),
            tone: c.tone,
            icon: c.icon,
          })),
        ]}
      />
      <div className="hidden gap-3 sm:grid sm:grid-cols-3 xl:grid-cols-6">
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-primary bg-primary p-4 text-primary-foreground">
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary-foreground/80">
            <Activity className="size-3.5" aria-hidden="true" />
            Total de eventos
          </span>
          <span className="text-2xl font-bold tabular-nums tracking-tight">
            {fmt(stats.totals.total)}
          </span>
        </div>
        {items.map((c) => (
          <KpiCard
            key={c.key}
            label={c.label}
            value={fmt(c.value)}
            icon={c.icon}
            tone={c.tone}
          />
        ))}
      </div>
    </>
  );
}

function EventsTrend({ stats }: { stats: ActivityStats }) {
  const data = useMemo(() => {
    if (stats.timelineByActor?.length) {
      return stats.timelineByActor.map((row) => ({
        date: row.day,
        humanos: row.HUMAN,
        ia: row.AI,
        automacoes: row.AUTOMATION,
        integracoes: row.INTEGRATION,
        sistema: row.SYSTEM,
      }));
    }
    return stats.timeline.map((row) => ({
      date: row.day,
      humanos: row.count,
      ia: 0,
      automacoes: 0,
      integracoes: 0,
      sistema: 0,
    }));
  }, [stats.timeline, stats.timelineByActor]);

  const total = stats.totals.total;
  const seriesPresent = AREA_STACK.filter((key) =>
    data.some((d) => d[ACTOR_META[key].seriesKey] > 0),
  );

  return (
    <section
      className={cn(CARD_SURFACE_CLASS, "flex flex-col gap-4 p-5 lg:col-span-2")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Eventos por dia
          </h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {fmt(total)}
            </span>{" "}
            eventos no período
          </p>
        </div>
        <div className="hidden flex-wrap items-center gap-3 sm:flex">
          {seriesPresent.map((key) => {
            const meta = ACTOR_META[key];
            const Icon = meta.Icon;
            return (
              <span
                key={key}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Icon
                  className={cn("size-3.5", meta.iconClass)}
                  aria-hidden="true"
                />
                {meta.label}
              </span>
            );
          })}
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Sem eventos no período.
        </p>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
              <defs>
                {seriesPresent.map((key) => {
                  const meta = ACTOR_META[key];
                  return (
                    <linearGradient
                      key={key}
                      id={`logs-fill-${meta.seriesKey}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={meta.fill}
                        stopOpacity={0.7}
                      />
                      <stop
                        offset="95%"
                        stopColor={meta.fill}
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(`${v}T00:00:00`);
                  return d.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  });
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={38}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                tickFormatter={(v: number) => compact(v)}
              />
              <Tooltip content={<ChartTooltip />} />
              {seriesPresent.map((key) => {
                const meta = ACTOR_META[key];
                return (
                  <Area
                    key={key}
                    dataKey={meta.seriesKey}
                    name={meta.label}
                    type="monotone"
                    stackId="a"
                    stroke={meta.fill}
                    fill={`url(#logs-fill-${meta.seriesKey})`}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function OriginDonut({ stats }: { stats: ActivityStats }) {
  const slices = ACTOR_ORDER.map((key) => ({
    key,
    ...ACTOR_META[key],
    value: stats.totals.byActorType[key] ?? 0,
  })).filter((s) => s.value > 0);
  const total = slices.reduce((acc, s) => acc + s.value, 0);

  return (
    <section className={cn(CARD_SURFACE_CLASS, "flex flex-col gap-4 p-5")}>
      <h2 className="text-base font-bold tracking-tight text-foreground">
        Por origem
      </h2>
      {total === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Sem dados no período.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
          <div className="mx-auto size-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip />} />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={80}
                  strokeWidth={2}
                  paddingAngle={2}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex w-full flex-col gap-2">
            {slices.map((s) => {
              const Icon = s.Icon;
              return (
                <li
                  key={s.key}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon
                      className={cn("size-3.5", s.iconClass)}
                      aria-hidden="true"
                    />
                    {s.label}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {((s.value / total) * 100).toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function HourlyBars({ stats }: { stats: ActivityStats }) {
  const data = useMemo(() => {
    const source =
      stats.hourly ??
      Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    return source.map((row) => ({
      hour: `${String(row.hour).padStart(2, "0")}h`,
      value: row.count,
    }));
  }, [stats.hourly]);

  const hasData = data.some((d) => d.value > 0);

  return (
    <section
      className={cn(CARD_SURFACE_CLASS, "flex flex-col gap-4 p-5 lg:col-span-2")}
    >
      <h2 className="text-base font-bold tracking-tight text-foreground">
        Atividade por hora
      </h2>
      {!hasData ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Sem dados no período.
        </p>
      ) : (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={38}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                tickFormatter={(v: number) => compact(v)}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="value"
                name="Eventos"
                fill="var(--color-primary)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function LogsStatsPanel({ stats }: { stats: ActivityStats }) {
  const entityRows: BarRow[] = Object.entries(stats.totals.byEntityType)
    .map(([key, value]) => {
      const meta = ENTITY_META[key];
      return {
        key,
        label: meta?.label ?? key,
        value,
        Icon: meta?.Icon ?? CircleDot,
        iconClass: meta?.iconClass ?? "text-muted-foreground",
        barClass: meta?.barClass ?? "bg-muted-foreground",
      };
    })
    .sort((a, b) => b.value - a.value);

  const typeRows: BarRow[] = stats.totals.byType.map((row, i) => {
    const visual = eventVisual(row.type, i);
    return {
      key: row.type,
      label: EVENT_CONFIG[row.type]?.label ?? row.type,
      value: row.count,
      Icon: visual.Icon,
      iconClass: visual.iconClass,
      barClass: visual.barClass,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <SummaryCards stats={stats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <EventsTrend stats={stats} />
        <OriginDonut stats={stats} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HourlyBars stats={stats} />
        <BarList title="Por entidade" rows={entityRows} />
      </div>

      <BarList title="Top tipos de evento" rows={typeRows} />
    </div>
  );
}
