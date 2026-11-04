"use client";

/*
 * Regras automáticas por departamento da Distribuição por Leads.
 *
 * Seção da tela /widgets/distribution?mode=leads: interruptor que liga o
 * controle (`departmentRulesEnabled`), um card por departamento (membros,
 * ativos, inativos, elegíveis, disponível agora / fora do horário / sem
 * regra, próxima mudança) e o botão "Regras automáticas", que abre o modal
 * com a lista de regras e o formulário de criar/editar. O resumo vem de
 * `/api/distribution/leads/department-rules/summary` e se atualiza a cada
 * minuto, sem recarregar a página. Só o modo Por Leads lê estas regras.
 */

import { useMemo, useState } from "react";
import {
  IconBuilding,
  IconClockHour4,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { CARD_SURFACE_CLASS, LIST_CARD_ROW_CLASS } from "@/components/crm/sortable-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DeptGlyph } from "@/features/conversations-settings/department-icons";
import { cn } from "@/lib/utils";

import {
  useDeleteLeadsDepartmentRule,
  useLeadsDepartmentRulesSummary,
  useLeadsSettings,
  useSaveLeadsDepartmentRule,
  useToggleLeadsDepartmentRule,
  useUpdateLeadsSettings,
} from "./leads-hooks";
import type {
  LeadsDepartmentRuleDto,
  LeadsDepartmentRuleInput,
  LeadsDepartmentSummaryDto,
} from "./leads-types";

const WEEKDAYS = [
  { value: 0, short: "Dom", long: "domingo" },
  { value: 1, short: "Seg", long: "segunda" },
  { value: 2, short: "Ter", long: "terça" },
  { value: 3, short: "Qua", long: "quarta" },
  { value: 4, short: "Qui", long: "quinta" },
  { value: 5, short: "Sex", long: "sexta" },
  { value: 6, short: "Sáb", long: "sábado" },
] as const;
const WORKDAYS = [1, 2, 3, 4, 5];
const SAO_PAULO = "America/Sao_Paulo";

function minuteToClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clockToMinute(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function weekdaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Todos os dias";
  if (sorted.join(",") === WORKDAYS.join(",")) return "Seg a Sex";
  return sorted.map((d) => WEEKDAYS[d]?.short ?? d).join(", ");
}

function ruleLabel(rule: LeadsDepartmentRuleDto): string {
  const crosses = rule.startMinute > rule.endMinute;
  return `${minuteToClock(rule.startMinute)} às ${minuteToClock(rule.endMinute)}${
    crosses ? " (dia seguinte)" : ""
  }`;
}

/** "hoje 18:00", "amanhã 09:00" ou "seg 09:00", no fuso de São Paulo. */
function formatNextChange(iso: string, nowIso: string): string {
  const at = new Date(iso);
  const now = new Date(nowIso);
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: SAO_PAULO, dateStyle: "short" }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  const today = dayKey(now);
  const target = dayKey(at);
  if (target === today) return `hoje ${time}`;
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  if (target === tomorrow) return `amanhã ${time}`;
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO, weekday: "short" })
    .format(at)
    .replace(".", "");
  return `${weekday} ${time}`;
}

function AvailabilityBadge({
  dept,
  rulesEnabled,
}: {
  dept: LeadsDepartmentSummaryDto;
  rulesEnabled: boolean;
}) {
  if (!dept.hasEnabledRule) {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-secondary px-2 py-0.5 font-display text-[11px] font-bold text-muted-foreground">
        Sem regra
      </span>
    );
  }
  if (dept.availableNow) {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-success-soft px-2 py-0.5 font-display text-[11px] font-bold text-success">
        {rulesEnabled ? "Disponível" : "Disponível (regras desligadas)"}
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-warning/15 px-2 py-0.5 font-display text-[11px] font-bold text-warning">
      Fora do horário
    </span>
  );
}

function DepartmentCard({
  dept,
  rulesEnabled,
  serverNow,
}: {
  dept: LeadsDepartmentSummaryDto;
  rulesEnabled: boolean;
  serverNow: string;
}) {
  const stats = [
    { label: "Consultores", value: dept.totalMembers },
    { label: "Ativos", value: dept.activeMembers },
    { label: "Inativos", value: dept.inactiveMembers },
    { label: "Elegíveis", value: dept.eligibleMembers, highlight: true },
  ];
  return (
    <li className={cn(LIST_CARD_ROW_CLASS, "flex min-w-0 flex-col gap-3")}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[15px]"
            style={{ backgroundColor: `${dept.color}22` }}
          >
            <DeptGlyph icon={dept.icon} size={16} color={dept.color} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[13.5px] font-bold text-foreground">
              {dept.name}
            </p>
            <p className="truncate font-body text-[11.5px] text-muted-foreground">
              {dept.rules.filter((r) => r.enabled).length === 0
                ? "Não participa da distribuição"
                : dept.rules
                    .filter((r) => r.enabled)
                    .map((r) => `${ruleLabel(r)} · ${weekdaysLabel(r.weekdays)}`)
                    .join(" · ")}
            </p>
          </div>
        </div>
        <AvailabilityBadge dept={dept} rulesEnabled={rulesEnabled} />
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate font-body text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {s.label}
            </dt>
            <dd
              className={cn(
                "font-display text-[18px] font-bold tabular-nums",
                s.highlight ? "text-primary" : "text-foreground",
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      {dept.nextChangeAt && (
        <p className="flex items-center gap-1 font-body text-[11.5px] text-muted-foreground">
          <IconClockHour4 size={13} />
          {dept.nextChangeKind === "activates" ? "Ativa " : "Encerra "}
          {formatNextChange(dept.nextChangeAt, serverNow)}
        </p>
      )}
    </li>
  );
}

type FormState = {
  departmentId: string;
  start: string;
  end: string;
  weekdays: number[];
  enabled: boolean;
};

function emptyForm(departmentId = ""): FormState {
  return { departmentId, start: "09:00", end: "18:00", weekdays: WORKDAYS, enabled: true };
}

function formFromRule(rule: LeadsDepartmentRuleDto): FormState {
  return {
    departmentId: rule.departmentId,
    start: minuteToClock(rule.startMinute),
    end: minuteToClock(rule.endMinute),
    weekdays: rule.weekdays,
    enabled: rule.enabled,
  };
}

function RulesDialog({
  open,
  onClose,
  departments,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  departments: LeadsDepartmentSummaryDto[];
  canManage: boolean;
}) {
  const saveMut = useSaveLeadsDepartmentRule();
  const toggleMut = useToggleLeadsDepartmentRule();
  const deleteMut = useDeleteLeadsDepartmentRule();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [editing, setEditing] = useState<{ id?: string; form: FormState } | null>(null);
  const close = () => {
    setEditing(null);
    onClose();
  };

  const rules = useMemo(
    () =>
      departments
        .flatMap((d) => d.rules)
        .sort(
          (a, b) =>
            a.departmentName.localeCompare(b.departmentName, "pt-BR") ||
            a.startMinute - b.startMinute,
        ),
    [departments],
  );
  const busy = saveMut.isPending || toggleMut.isPending || deleteMut.isPending;

  const submit = () => {
    if (!editing) return;
    const { form } = editing;
    const startMinute = clockToMinute(form.start);
    const endMinute = clockToMinute(form.end);
    if (!form.departmentId) return toast.error("Escolha o departamento.");
    if (startMinute == null || endMinute == null) return toast.error("Horário inválido.");
    if (startMinute === endMinute) return toast.error("Hora inicial e final não podem ser iguais.");
    if (form.weekdays.length === 0) return toast.error("Selecione ao menos um dia da semana.");
    const input: LeadsDepartmentRuleInput = {
      departmentId: form.departmentId,
      startMinute,
      endMinute,
      weekdays: [...form.weekdays].sort((a, b) => a - b),
      enabled: form.enabled,
    };
    saveMut.mutate(
      { id: editing.id, input },
      {
        onSuccess: () => {
          toast.success(editing.id ? "Regra atualizada." : "Regra criada.");
          setEditing(null);
        },
        onError: (e) => toast.error(e.message || "Erro ao salvar a regra."),
      },
    );
  };

  const remove = async (rule: LeadsDepartmentRuleDto) => {
    const ok = await confirm({
      title: "Excluir regra?",
      description: `${rule.departmentName}: ${ruleLabel(rule)} · ${weekdaysLabel(rule.weekdays)}. Sem regra habilitada, o departamento deixa de receber leads enquanto as regras estiverem ligadas.`,
      confirmLabel: "Excluir",
      destructive: true,
      action: async () => {
        await deleteMut.mutateAsync(rule.id);
      },
    });
    if (ok) toast.success("Regra excluída.");
  };

  const form = editing?.form ?? null;
  const crosses =
    form &&
    (() => {
      const s = clockToMinute(form.start);
      const e = clockToMinute(form.end);
      return s != null && e != null && s > e;
    })();

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title="Regras automáticas"
        description="Cada departamento recebe leads só dentro das faixas abaixo (horário de Brasília). Sem regra habilitada, o departamento não participa."
        icon={
          <FormDialogIcon>
            <IconClockHour4 className="size-4" />
          </FormDialogIcon>
        }
        size="lg"
        busy={busy}
        footer={
          form ? (
            <>
              <ButtonGlass
                type="button"
                variant="glass"
                className={formDialogCancelClass}
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Voltar
              </ButtonGlass>
              <ButtonGlass
                type="button"
                variant="primary"
                className={formDialogPrimaryClass}
                onClick={submit}
                disabled={busy}
              >
                {saveMut.isPending ? "Salvando…" : editing?.id ? "Salvar" : "Criar regra"}
              </ButtonGlass>
            </>
          ) : (
            <>
              <ButtonGlass
                type="button"
                variant="glass"
                className={formDialogCancelClass}
                onClick={close}
                disabled={busy}
              >
                Fechar
              </ButtonGlass>
              {canManage && (
                <ButtonGlass
                  type="button"
                  variant="primary"
                  className={formDialogPrimaryClass}
                  onClick={() =>
                    setEditing({ form: emptyForm(departments[0]?.departmentId ?? "") })
                  }
                  disabled={busy || departments.length === 0}
                >
                  <IconPlus size={15} /> Nova regra
                </ButtonGlass>
              )}
            </>
          )
        }
      >
        {form ? (
          <div className="space-y-4">
            <div>
              <span className={formLabelClass}>Departamento</span>
              <DropdownGlass
                triggerClassName="w-full"
                searchable
                placeholder="Selecione o departamento…"
                value={form.departmentId}
                options={departments.map((d) => ({
                  value: d.departmentId,
                  label: d.name,
                  icon: <DeptGlyph icon={d.icon} size={16} color={d.color} />,
                  description: `${d.totalMembers} consultor${d.totalMembers === 1 ? "" : "es"}`,
                }))}
                onValueChange={(v) =>
                  setEditing((cur) => cur && { ...cur, form: { ...cur.form, departmentId: v } })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={formLabelClass}>Hora inicial</span>
                <Input
                  type="time"
                  className={formControlClass}
                  value={form.start}
                  onChange={(e) =>
                    setEditing((cur) => cur && { ...cur, form: { ...cur.form, start: e.target.value } })
                  }
                  disabled={busy}
                />
              </div>
              <div>
                <span className={formLabelClass}>Hora final</span>
                <Input
                  type="time"
                  className={formControlClass}
                  value={form.end}
                  onChange={(e) =>
                    setEditing((cur) => cur && { ...cur, form: { ...cur.form, end: e.target.value } })
                  }
                  disabled={busy}
                />
              </div>
            </div>
            {crosses && (
              <p className="font-body text-[12px] text-muted-foreground">
                Hora final menor que a inicial: a faixa termina no dia seguinte.
              </p>
            )}
            <div>
              <span className={formLabelClass}>Dias da semana</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = form.weekdays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.long}
                      disabled={busy}
                      onClick={() =>
                        setEditing(
                          (cur) =>
                            cur && {
                              ...cur,
                              form: {
                                ...cur.form,
                                weekdays: on
                                  ? cur.form.weekdays.filter((x) => x !== d.value)
                                  : [...cur.form.weekdays, d.value],
                              },
                            },
                        )
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 font-display text-[12px] font-semibold transition-colors disabled:opacity-50",
                        on
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
              <span className="font-body text-[13px] text-foreground">Regra habilitada</span>
              <Switch
                checked={form.enabled}
                disabled={busy}
                onCheckedChange={(v) =>
                  setEditing((cur) => cur && { ...cur, form: { ...cur.form, enabled: v } })
                }
                aria-label="Regra habilitada"
              />
            </label>
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={<IconClockHour4 className="size-6" />}
            title="Nenhuma regra cadastrada"
            description="Crie uma regra por departamento com a faixa de horário e os dias em que ele pode receber leads."
          />
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3",
                  !rule.enabled && "opacity-60",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-[13px] font-bold text-foreground">
                    {rule.departmentName}
                  </p>
                  <p className="font-body text-[12px] text-muted-foreground">
                    {ruleLabel(rule)} · {weekdaysLabel(rule.weekdays)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={rule.enabled}
                    disabled={!canManage || busy}
                    aria-label={rule.enabled ? "Desabilitar regra" : "Habilitar regra"}
                    onCheckedChange={(v) =>
                      toggleMut.mutate(
                        { id: rule.id, enabled: v },
                        { onError: (e) => toast.error(e.message || "Erro ao salvar.") },
                      )
                    }
                  />
                  {canManage && (
                    <>
                      <button
                        type="button"
                        aria-label="Editar regra"
                        disabled={busy}
                        onClick={() => setEditing({ id: rule.id, form: formFromRule(rule) })}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                      >
                        <IconPencil size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Excluir regra"
                        disabled={busy}
                        onClick={() => void remove(rule)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <IconTrash size={16} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </FormDialog>
      {confirmDialog}
    </>
  );
}

export function LeadsDepartmentRulesSection({ canManage }: { canManage: boolean }) {
  const summaryQuery = useLeadsDepartmentRulesSummary();
  const settingsQuery = useLeadsSettings();
  const updateSettings = useUpdateLeadsSettings();
  const [dialogOpen, setDialogOpen] = useState(false);

  const summary = summaryQuery.data;
  const rulesEnabled =
    (updateSettings.isPending ? updateSettings.variables?.departmentRulesEnabled : undefined) ??
    settingsQuery.data?.departmentRulesEnabled ??
    summary?.rulesEnabled ??
    false;
  const departments = summary?.departments ?? [];

  return (
    <section className="flex flex-col gap-3" aria-label="Departamentos da Distribuição por Leads">
      <div className={cn("flex items-center justify-between gap-4 py-3", LIST_CARD_ROW_CLASS)}>
        <div className="min-w-0">
          <p className="font-display text-[14px] font-bold text-[var(--text-primary)]">
            Regras automáticas por departamento
          </p>
          <p className="mt-0.5 font-body text-[12px] text-muted-foreground">
            {rulesEnabled
              ? "Ligado: só consultores de departamento em horário ativo entram no sorteio."
              : "Desligado: o rodízio ignora departamentos e horários (comportamento padrão)."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ButtonGlass
            type="button"
            variant="glass"
            size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={summaryQuery.isLoading}
          >
            <IconClockHour4 size={15} /> Regras automáticas
          </ButtonGlass>
          {canManage && (
            <Switch
              checked={rulesEnabled}
              disabled={updateSettings.isPending || settingsQuery.isLoading}
              aria-label="Regras automáticas por departamento"
              onCheckedChange={(v) =>
                updateSettings.mutate(
                  { departmentRulesEnabled: v },
                  {
                    onSuccess: (data) =>
                      toast.success(
                        data.departmentRulesEnabled
                          ? "Regras por departamento ligadas."
                          : "Regras por departamento desligadas.",
                      ),
                    onError: (e) => toast.error(e.message || "Erro ao salvar."),
                  },
                )
              }
            />
          )}
        </div>
      </div>

      {summaryQuery.error ? (
        <div className={CARD_SURFACE_CLASS}>
          <EmptyState
            icon={<IconBuilding className="size-6" />}
            title="Erro ao carregar os departamentos"
            description={summaryQuery.error.message}
          />
        </div>
      ) : departments.length === 0 ? (
        !summaryQuery.isLoading && (
          <div className={CARD_SURFACE_CLASS}>
            <EmptyState
              icon={<IconBuilding className="size-6" />}
              title="Nenhum departamento"
              description="Cadastre departamentos e seus membros para usar as regras automáticas."
            />
          </div>
        )
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <DepartmentCard
              key={d.departmentId}
              dept={d}
              rulesEnabled={rulesEnabled}
              serverNow={summary?.serverNow ?? new Date().toISOString()}
            />
          ))}
        </ul>
      )}

      <RulesDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        departments={departments}
        canManage={canManage}
      />
    </section>
  );
}
