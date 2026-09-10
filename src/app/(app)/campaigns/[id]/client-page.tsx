"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Eye,
  MessageSquareReply,
  Pause,
  Play,
  Rocket,
  Send,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { KpiCard } from "@/components/crm/kpi-card";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";
import { rewriteNumericPath } from "@/lib/public-path";

import { CampaignRecipientsReport } from "@/features/campaigns/campaign-recipients-report";
import {
  useAudienceOptions,
  useCampaign,
  useCampaignActions,
  useCampaignStats,
} from "@/features/campaigns/hooks";
import {
  STATUS_CHIP_CLASS,
  STATUS_META,
} from "@/features/campaigns/constants";
import type { CampaignAction, CampaignDetail } from "@/features/campaigns/types";
import { nf, rate } from "@/features/campaigns/viz";

const ACTIVE = ["SCHEDULED", "PROCESSING", "SENDING"];

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

/** Nome da tag escolhida na criação: audienceTags ou filters.tagIds. */
function formatCampaignTag(
  campaign: CampaignDetail,
  catalog: { id: string; name: string }[],
): string {
  if (campaign.audienceTags && campaign.audienceTags.length > 0) {
    return campaign.audienceTags.map((t) => t.name).join(", ");
  }
  const ids = (campaign.filters?.tagIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (ids.length === 0) return "—";
  const byId = new Map(catalog.map((t) => [t.id, t.name]));
  return ids.map((id) => byId.get(id) ?? id).join(", ");
}

export default function CampaignDetailClientPage() {
  const { id } = useParams<{ id: string }>();
  const { status: authStatus } = useSession();
  const isAuth = authStatus === "authenticated";

  const [recipientFilter, setRecipientFilter] = useState("");
  const [page, setPage] = useState(1);

  const applyRecipientFilter = (value: string) => {
    setRecipientFilter((prev) => (value !== "" && prev === value ? "" : value));
    setPage(1);
  };

  const campaignQuery = useCampaign(id, isAuth);
  const campaign = campaignQuery.data;
  const campaignId = campaign?.id ?? id;

  useEffect(() => {
    if (campaign?.number != null) rewriteNumericPath("/campaigns", id, campaign.number);
  }, [campaign?.number, id]);

  const isActive = campaign ? ACTIVE.includes(campaign.status) : false;
  const audienceOptionsQuery = useAudienceOptions(isAuth);
  const tagLabel = useMemo(
    () =>
      campaign
        ? formatCampaignTag(campaign, audienceOptionsQuery.data?.tags ?? [])
        : "—",
    [campaign, audienceOptionsQuery.data?.tags],
  );

  const statsQuery = useCampaignStats(campaignId, isActive, isAuth && !!campaign);
  const stats = statsQuery.data;

  const action = useCampaignActions();

  if (campaignQuery.isLoading) {
    return (
      <Shell>
        <AppLoading variant="inline" className="min-h-0 flex-1" />
      </Shell>
    );
  }

  if (!campaign) {
    return (
      <Shell>
        <div className={cn(CARD_SURFACE_CLASS, "flex min-h-[280px] items-center justify-center")}>
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Users className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-4 text-lg font-bold">Campanha não encontrada</p>
            <p className="mt-1 text-sm text-muted-foreground">Ela pode ter sido removida.</p>
            <Link href="/campaigns" className="mt-4 text-sm font-semibold text-primary hover:underline">
              Ir para campanhas
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const meta = STATUS_META[campaign.status] ?? STATUS_META.DRAFT;
  const total = stats?.totalRecipients ?? campaign.totalRecipients;
  const sent = stats?.sentCount ?? campaign.sentCount;
  const delivered = stats?.deliveredCount ?? campaign.deliveredCount;
  const read = stats?.readCount ?? campaign.readCount;
  const replied = stats?.repliedCount ?? campaign.repliedCount ?? 0;
  const failed = stats?.failedCount ?? campaign.failedCount;
  const pending = stats?.pendingCount ?? Math.max(0, total - sent);
  const sentPct = rate(sent, total);
  const deliveredPct = rate(delivered, sent);
  const readPct = rate(read, sent);
  const repliedPct = rate(replied, sent);
  const failedPct = rate(failed, sent || total);
  const highFailure = failedPct >= 5;

  const canPause = campaign.status === "SENDING" || campaign.status === "PROCESSING";
  const canResume = campaign.status === "PAUSED";
  const canCancel = [
    "DRAFT",
    "SCHEDULED",
    "PROCESSING",
    "SENDING",
    "PAUSED",
  ].includes(campaign.status);

  const run = (a: CampaignAction) => {
    action.mutate(
      { id: campaignId, action: a },
      {
        onSuccess: (res) => toast.success(res?.message ?? "Campanha atualizada."),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Erro ao executar ação na campanha."),
      },
    );
  };

  return (
    <Shell>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/campaigns"
            aria-label="Voltar para Campanhas"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-primary">
            <Rocket className="size-6" aria-hidden="true" />
          </span>
          <h1 className="min-w-0 truncate text-3xl font-bold tracking-tight text-balance">
            {campaign.name}
          </h1>
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm font-semibold",
              STATUS_CHIP_CLASS[campaign.status],
            )}
          >
            {meta.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {campaign.status === "DRAFT" ? (
            <HeaderPill onClick={() => run("launch")} disabled={action.isPending}>
              <Rocket className="size-4" aria-hidden="true" /> Lançar
            </HeaderPill>
          ) : null}
          {canPause ? (
            <HeaderPill onClick={() => run("pause")} disabled={action.isPending}>
              <Pause className="size-4" aria-hidden="true" /> Pausar
            </HeaderPill>
          ) : null}
          {canResume ? (
            <HeaderPill onClick={() => run("resume")} disabled={action.isPending}>
              <Play className="size-4" aria-hidden="true" /> Retomar
            </HeaderPill>
          ) : null}
          {canCancel ? (
            <HeaderPill danger onClick={() => run("cancel")} disabled={action.isPending}>
              <X className="size-4" aria-hidden="true" /> Encerrar
            </HeaderPill>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={<Users className="size-5" />}
          label="Total"
          value={nf(total)}
          tone="neutral"
          active={recipientFilter === ""}
          onClick={() => applyRecipientFilter("")}
        />
        <KpiCard
          icon={<Send className="size-5" />}
          label="Enviados"
          value={nf(sent)}
          tone="brand"
          active={recipientFilter === "SENT"}
          onClick={() => applyRecipientFilter("SENT")}
        />
        <KpiCard
          icon={<CircleCheck className="size-5" />}
          label={`Entregues · ${deliveredPct}%`}
          value={<span className="text-success">{nf(delivered)}</span>}
          tone="success"
          active={recipientFilter === "DELIVERED"}
          onClick={() => applyRecipientFilter("DELIVERED")}
        />
        <KpiCard
          icon={<Eye className="size-5" />}
          label={`Lidos · ${readPct}%`}
          value={<span className="text-chip-blue">{nf(read)}</span>}
          tone="brand"
          active={recipientFilter === "READ"}
          onClick={() => applyRecipientFilter("READ")}
        />
        <KpiCard
          icon={<MessageSquareReply className="size-5" />}
          label={`Responderam · ${repliedPct}%`}
          value={<span className="text-chip-violet">{nf(replied)}</span>}
          tone="violet"
        />
        <KpiCard
          icon={<TriangleAlert className="size-5" />}
          label="Falhas"
          value={<span className="text-destructive">{nf(failed)}</span>}
          tone="red"
          active={recipientFilter === "FAILED"}
          onClick={() => applyRecipientFilter("FAILED")}
        />
      </div>

      {total > 0 ? (
        <div className={cn(CARD_SURFACE_CLASS, "p-5")}>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${sentPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>{sentPct}% enviado</span>
            <button
              type="button"
              onClick={() => applyRecipientFilter("PENDING")}
              className={cn(
                "tabular-nums rounded-full px-2 py-0.5 transition-colors hover:text-foreground",
                recipientFilter === "PENDING" && "bg-secondary font-semibold text-foreground",
              )}
            >
              {nf(pending)} pendentes
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5">
        <section className={cn(CARD_SURFACE_CLASS, "p-5")}>
          <h2 className="text-lg font-bold tracking-tight">Funil de conversão</h2>
          <div className="mt-4 flex flex-col gap-4">
            <FunnelBar
              label="Enviado"
              count={sent}
              pct={sentPct}
              color="bg-foreground/70"
              active={recipientFilter === "SENT"}
              onClick={() => applyRecipientFilter("SENT")}
            />
            <FunnelBar
              label="Lido"
              count={read}
              pct={readPct}
              color="bg-success"
              active={recipientFilter === "READ"}
              onClick={() => applyRecipientFilter("READ")}
            />
            <FunnelBar label="Respondido" count={replied} pct={repliedPct} color="bg-primary" />
            <FunnelBar
              label="Falha"
              count={failed}
              pct={failedPct}
              color="bg-destructive"
              active={recipientFilter === "FAILED"}
              onClick={() => applyRecipientFilter("FAILED")}
            />
          </div>

          <div className="mt-5 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CircleX className="size-4" aria-hidden="true" />
              <span className="text-xs font-semibold tracking-wide">Falhas</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-destructive">
              {nf(failed)} · {failedPct}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">mensagens não entregues</p>
          </div>

          {highFailure ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              Taxa de falha alta: {failedPct}%
            </div>
          ) : null}

          {stats?.failureReasons && stats.failureReasons.length > 0 ? (
            <div className="mt-4 flex flex-col gap-1.5">
              {stats.failureReasons.map((reason) => (
                <div key={reason.reason} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{reason.reason}</span>
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold tabular-nums text-destructive">
                    {reason.count}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <CampaignRecipientsReport
          campaignId={campaignId}
          campaignName={campaign.name}
          filter={recipientFilter}
          onFilterChange={applyRecipientFilter}
          page={page}
          onPageChange={setPage}
          enabled={!!campaign}
          counts={{ total, delivered, pending, failed, sent, read }}
        />
      </div>

      <div className={cn(CARD_SURFACE_CLASS, "px-5 py-1")}>
        <MetaRow label="Criado em" value={fmtDateTime(campaign.createdAt)} />
        {campaign.startedAt ? (
          <MetaRow label="Iniciado em" value={fmtDateTime(campaign.startedAt)} />
        ) : null}
        {campaign.completedAt ? (
          <MetaRow label="Concluído em" value={fmtDateTime(campaign.completedAt)} />
        ) : null}
        {campaign.scheduledAt ? (
          <MetaRow label="Agendado para" value={fmtDateTime(campaign.scheduledAt)} />
        ) : null}
        <MetaRow label="Velocidade" value={`${campaign.sendRate} msgs/s`} />
        <MetaRow label="Tag" value={tagLabel} />
        {campaign.segment ? <MetaRow label="Segmento" value={campaign.segment.name} /> : null}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-screen v2-screen-fill v2-page-scroll grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-y-auto bg-background">
      <NavRailSpacer />
      <main className="flex min-w-0 flex-col">
        <div className="flex w-full flex-col gap-5 px-4 py-5">{children}</div>
      </main>
    </div>
  );
}

function HeaderPill({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
        danger
          ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function FunnelBar({
  label,
  count,
  pct,
  color,
  onClick,
  active,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {nf(count)} · {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </>
  );

  if (!onClick) return <div>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl text-left transition-colors",
        active ? "bg-secondary/80" : "hover:bg-secondary/40",
      )}
    >
      {body}
    </button>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}
