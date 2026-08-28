"use client";

import * as React from "react";
import Link from "next/link";
import {
  IconBriefcase,
  IconChevronDown,
  IconExternalLink,
  IconLoader2,
  IconPlus,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/crm/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { useCan } from "@/hooks/use-my-permissions";

import {
  useCompaniesSearch,
  useJobCandidates,
  useJobMutations,
  useJobOpening,
  useJobOpenings,
  usePipelinesLite,
} from "@/features/products-v2/hooks";
import { JOB_STATUS_LABEL, type JobOpening } from "@/features/products-v2/types";

const STATUS_VARIANT: Record<JobOpening["status"], "success" | "warning" | "secondary" | "muted"> =
  {
    OPEN: "success",
    PAUSED: "warning",
    FILLED: "secondary",
    CLOSED: "muted",
  };

function ProgressBar({ stats }: { stats?: JobOpening["stats"] }) {
  if (!stats) return null;
  const total = Math.max(stats.capacity, 1);
  const consumedPct = (stats.consumed / total) * 100;
  const reservedPct = (stats.reserved / total) * 100;
  return (
    <div className="mt-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--glass-bg-subtle)]">
        <div
          className="h-full bg-[var(--color-success)]"
          style={{ width: `${consumedPct}%` }}
          title={`Preenchidas: ${stats.consumed}`}
        />
        <div
          className="h-full bg-[var(--color-warning)]"
          style={{ width: `${reservedPct}%` }}
          title={`Reservadas: ${stats.reserved}`}
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--text-secondary)]">
        <span>
          Disponível:{" "}
          <strong className="text-[var(--text-primary)] tabular-nums">{stats.balance}</strong>
        </span>
        <span>Reservadas: {stats.reserved}</span>
        <span>Preenchidas: {stats.consumed}</span>
        <span>Total: {stats.capacity}</span>
      </div>
    </div>
  );
}

function CandidatesPanel({ jobId, pipelineId }: { jobId: string; pipelineId: string | null }) {
  const { data: candidates = [], isLoading } = useJobCandidates(jobId);
  const { data: detail } = useJobOpening(jobId);

  return (
    <div className="mt-3 border-t border-[var(--glass-border)] pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Candidatos
        </p>
        {pipelineId && (
          <Link
            href={`/pipeline/${pipelineId}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand-primary)] hover:underline"
          >
            Abrir funil B2C <IconExternalLink size={13} />
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-3">
          <IconLoader2 size={16} className="animate-spin text-[var(--text-secondary)]" />
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-[11px] text-[var(--text-secondary)]">Sem candidatos no funil ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-1.5"
            >
              <span className="text-sm text-[var(--text-primary)]">
                {c.contact?.name ?? c.title}
              </span>
              <Badge variant={c.stage.isWon ? "success" : c.stage.isLost ? "muted" : "outline"}>
                {c.stage.name}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {detail?.stakeholders && detail.stakeholders.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Stakeholders (feedback)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {detail.stakeholders.map((s) => (
              <Badge key={s.id} variant="outline">
                {s.contact.name} · {s.role}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: JobOpening }) {
  const [expanded, setExpanded] = React.useState(false);
  const { update } = useJobMutations();
  const canManage = useCan("job_opening:manage");
  const canClose = useCan("job_opening:close");

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-4 shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-[15px] font-bold text-[var(--text-primary)]">
              {job.title}
            </p>
            <Badge variant={STATUS_VARIANT[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
            {job.clientCompany?.name ?? "Empresa não definida"}
            {job.product?.name ? ` · ${job.product.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && job.status === "OPEN" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => update.mutate({ jid: job.id, body: { status: "PAUSED" } })}
            >
              Pausar
            </Button>
          )}
          {canManage && job.status === "PAUSED" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => update.mutate({ jid: job.id, body: { status: "OPEN" } })}
            >
              Reabrir
            </Button>
          )}
          {canClose && job.status !== "CLOSED" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update.mutate({ jid: job.id, body: { status: "CLOSED" } })}
            >
              Fechar
            </Button>
          )}
          <Button size="icon" variant="ghost" className="size-8" onClick={() => setExpanded((v) => !v)}>
            <IconChevronDown
              size={16}
              className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </Button>
        </div>
      </div>

      <ProgressBar stats={job.stats} />

      {expanded && <CandidatesPanel jobId={job.id} pipelineId={job.candidatePipelineId} />}
    </div>
  );
}

export function CreateJobDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { create } = useJobMutations();
  const { data: pipelines = [] } = usePipelinesLite();
  const [title, setTitle] = React.useState("");
  const [vacancies, setVacancies] = React.useState("1");
  const [companySearch, setCompanySearch] = React.useState("");
  const [company, setCompany] = React.useState<{ id: string; name: string } | null>(null);
  const { data: companies = [] } = useCompaniesSearch(companySearch);
  const [pipelineId, setPipelineId] = React.useState("");
  const [reserveStageId, setReserveStageId] = React.useState("");
  const [consumeStageId, setConsumeStageId] = React.useState("");

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = selectedPipeline?.stages ?? [];

  React.useEffect(() => {
    if (!open) {
      setTitle("");
      setVacancies("1");
      setCompanySearch("");
      setCompany(null);
      setPipelineId("");
      setReserveStageId("");
      setConsumeStageId("");
    }
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Informe o título da vaga.");
      return;
    }
    if (!company) {
      toast.error("Selecione a empresa cliente.");
      return;
    }
    try {
      await create.mutateAsync({
        title: title.trim(),
        clientCompanyId: company.id,
        vacancies: Number(vacancies) || 0,
        candidatePipelineId: pipelineId || null,
        reserveStageId: reserveStageId || null,
        consumeStageId: consumeStageId || null,
      });
      toast.success("Vaga criada.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar vaga");
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={create.isPending}
      title="Nova vaga"
      description="Processo seletivo (B2C) com nº de posições e empresa cliente."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={create.isPending}>
            {create.isPending && <IconLoader2 size={14} className="mr-1.5 animate-spin" />}
            Criar vaga
          </Button>
        </>
      }
    >
      <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Título *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Nº de vagas</Label>
              <Input
                type="number"
                min="0"
                value={vacancies}
                onChange={(e) => setVacancies(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="relative">
            <Label>Empresa cliente *</Label>
            <div className="relative mt-1">
              <IconSearch
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
              />
              <Input
                value={company ? company.name : companySearch}
                onChange={(e) => {
                  setCompany(null);
                  setCompanySearch(e.target.value);
                }}
                placeholder="Buscar empresa…"
                className="pl-8"
              />
            </div>
            {!company && companies.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-44 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow)]">
                {companies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCompany({ id: c.id, name: c.name });
                      setCompanySearch("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--glass-bg-subtle)]"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Funil de candidatos (B2C)</Label>
            <SelectNative
              value={pipelineId}
              onChange={(e) => {
                setPipelineId(e.target.value);
                setReserveStageId("");
                setConsumeStageId("");
              }}
              className="mt-1 h-9"
            >
              <option value="">— Nenhum —</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectNative>
          </div>

          {stages.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Estágio de reserva</Label>
                <SelectNative
                  value={reserveStageId}
                  onChange={(e) => setReserveStageId(e.target.value)}
                  className="mt-1 h-9"
                >
                  <option value="">— Nenhum —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div>
                <Label>Estágio de contratação</Label>
                <SelectNative
                  value={consumeStageId}
                  onChange={(e) => setConsumeStageId(e.target.value)}
                  className="mt-1 h-9"
                >
                  <option value="">— Nenhum —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
            </div>
          )}
      </div>
    </FormDialog>
  );
}

const STATUS_FILTERS: Array<{ val: string; label: string }> = [
  { val: "", label: "Todas" },
  { val: "OPEN", label: "Abertas" },
  { val: "PAUSED", label: "Pausadas" },
  { val: "FILLED", label: "Preenchidas" },
  { val: "CLOSED", label: "Fechadas" },
];

export default function JobOpeningsClientPage() {
  const [statusFilter, setStatusFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const { data: jobs = [], isLoading } = useJobOpenings(statusFilter || undefined);
  const canManage = useCan("job_opening:manage");

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />

      <main className="flex min-w-0 flex-col gap-4 overflow-hidden">
        <PageHeader
          icon={<IconBriefcase size={22} />}
          title="Vagas"
          actions={
            <div className="flex items-center gap-2">
              <div className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-0.5">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.val || "all"}
                    type="button"
                    onClick={() => setStatusFilter(f.val)}
                    className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                      statusFilter === f.val
                        ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {canManage && (
                <Button onClick={() => setCreateOpen(true)}>
                  <IconPlus size={16} /> Nova vaga
                </Button>
              )}
            </div>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <IconLoader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow)] backdrop-blur-md">
              <EmptyState
                icon={<IconUsers size={28} />}
                title="Nenhuma vaga"
                description="Vagas surgem ao ganhar negócios B2B com produtos do tipo Vaga, ou crie manualmente."
              />
            </div>
          ) : (
            jobs.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </div>
      </main>

      <CreateJobDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
