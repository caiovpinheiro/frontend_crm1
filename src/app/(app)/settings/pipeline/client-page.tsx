"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  IconBolt,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconLock,
  IconPalette,
  IconPencil,
  IconPlus,
  IconStar,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { ScrollMap } from "@/components/crm/scroll-map";
import { PipelineHeader } from "@/components/crm/pipeline-header";
import { PipelineSwitcher } from "@/features/pipeline-v2/extras";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { PasswordInput } from "@/components/ui/password-input";
import { usePipelines, useBoard } from "@/features/pipeline-v2/hooks";
import { boardKey } from "@/features/pipeline-v2/hooks/use-board";
import { archivePipeline } from "@/features/pipeline-v2/api";
import { useAutomations } from "@/features/automations-v2/hooks";
import { useUserRole } from "@/hooks/use-user-role";
import { apiUrl } from "@/lib/api";
import { SETTINGS_HUB_BACK } from "../_v2-shell";
import { AddAutomationDrawer } from "./add-automation-drawer";
import { LostStageReasonsPanel } from "./lost-stage-reasons";
import {
  conditionsEqual,
  parseConditions,
  sanitizeConditions,
  type TriggerCondition,
} from "./trigger-conditions";

// ─── Constantes ───────────────────────────────────────────────────

const STAGE_TRIGGER_LABELS: Record<string, string> = {
  STAGE_ENTERED: "Quando criado nesta etapa",
  STAGE_MOVED_IN: "Quando movido para esta etapa",
  STAGE_EXITED: "Quando sair desta etapa",
  DEAL_CREATED: "Quando negócio for criado",
  MESSAGE_RECEIVED: "Quando mensagem for recebida",
  DEAL_WON: "Quando negócio for ganho",
  DEAL_LOST: "Quando negócio for perdido",
};

// Vocabulário do backend (AutomationTriggerType) → label exibido no card do
// estágio. O backend modela a relação automação ↔ estágio dentro de
// `triggerConfig` JSON (sem FK no Prisma), então a filtragem por estágio
// também acontece aqui no client.
const BACKEND_TRIGGER_LABELS: Record<string, string> = {
  deal_created: "Quando criado nesta etapa",
  stage_changed: "Quando entra nesta etapa",
  deal_won: "Quando negócio for ganho",
  deal_lost: "Quando negócio for perdido",
  message_received: "Quando mensagem for recebida",
  manual: "Execução manual",
};

/**
 * Lê `triggerConfig` (JSON) e diz se a automação está vinculada ao estágio
 * do pipeline em questão. Espelha a convenção usada no editor antigo
 * (`components/pipeline/funnel-automations.tsx`) — ver investigação em
 * 39521bd5-3e91-4916-8a54-7b76693baa7e.
 */
function isAutomationForStage(
  cfg: Record<string, unknown> | null | undefined,
  triggerType: string,
  pipelineId: string,
  stageId: string,
  active: boolean,
): boolean {
  // Automações desativadas (active=false) somem do editor — usado para a
  // semântica de "Excluir" (unbind), que desativa em vez de DELETE pra
  // permitir religar via /automations sem perder steps. Continuam visíveis
  // na página de listagem de automações.
  if (!active) return false;
  if (!cfg) return false;
  const cfgPipeline = typeof cfg.pipelineId === "string" ? cfg.pipelineId : undefined;
  if (cfgPipeline && cfgPipeline !== pipelineId) return false;
  if (cfg.stageId === stageId) return true;
  if (triggerType === "stage_changed" && cfg.toStageId === stageId) return true;
  // Trigger "Quando sair desta etapa" — fromStageId aponta pro estágio fonte.
  if (triggerType === "stage_changed" && cfg.fromStageId === stageId) return true;
  return false;
}

function labelForBackendTrigger(
  triggerType: string,
  cfg: Record<string, unknown> | null | undefined,
  stageId: string,
): string {
  if (
    triggerType === "stage_changed" &&
    cfg?.fromStageId === stageId &&
    cfg?.toStageId !== stageId
  ) {
    return "Quando sair desta etapa";
  }
  // Entrar/ser movido para esta etapa (toStageId aponta pro estágio).
  if (triggerType === "stage_changed" && cfg?.toStageId === stageId) {
    return "Quando movido para esta etapa";
  }
  return BACKEND_TRIGGER_LABELS[triggerType] ?? triggerType;
}

const COLOR_PALETTE = [
  { label: "Azul", value: "#5B6FF5" },
  { label: "Roxo", value: "#8B5CF6" },
  { label: "Ciano", value: "#06B6D4" },
  { label: "Verde", value: "#10B981" },
  { label: "Lima", value: "#84CC16" },
  { label: "Âmbar", value: "#F59E0B" },
  { label: "Laranja", value: "#F97316" },
  { label: "Vermelho", value: "#EF4444" },
  { label: "Rosa", value: "#EC4899" },
  { label: "Cinza", value: "#64748B" },
];

// ─── Tipos locais ─────────────────────────────────────────────────

interface Automation {
  id: string;
  /** Chip no topo: quando executar no estágio */
  stageTrigger: string;
  /** Nome da automação */
  name: string;
  /** Descrição / ação secundária */
  description?: string;
  /**
   * ID real da automação backend que originou este card. Preenchido SEMPRE
   * (mesmo quando `id` é sintético tipo `local-auto-...`) para que o save
   * consiga clonar/atualizar a automação correta. Para cards hidratados
   * direto do backend, vale o próprio `id`.
   */
  baseAutomationId?: string;
  /**
   * Condições extras (Tag/Campo/Canal) — salvas em `triggerConfig.conditions`
   * e avaliadas com semântica E pelo backend. `undefined`/[] = sem condições.
   */
  conditions?: TriggerCondition[];
}

/**
 * Converte um label visível (PT-BR, dos `STAGE_TRIGGER_LABELS` e
 * `BACKEND_TRIGGER_LABELS`) no par `{ triggerType, triggerConfig }` que o
 * backend grava em `Automation`. Usado pelo `handleSaveAll` quando persiste
 * mudanças locais (criar/mover/trocar trigger).
 */
function triggerFromLabel(
  label: string,
  pipelineId: string,
  stageId: string,
  conditions?: TriggerCondition[],
): { triggerType: string; triggerConfig: Record<string, unknown> } | null {
  // Condições sanitizadas são mescladas no triggerConfig como `conditions`.
  // Vazio → chave omitida (mantém o config limpo pra automações sem condição).
  const clean = sanitizeConditions(conditions ?? []);
  const withConditions = (
    cfg: Record<string, unknown>,
  ): Record<string, unknown> => (clean.length > 0 ? { ...cfg, conditions: clean } : cfg);

  switch (label) {
    case "Quando criado nesta etapa":
    case "Quando negócio for criado":
      return { triggerType: "deal_created", triggerConfig: withConditions({ pipelineId, stageId }) };
    case "Quando entra nesta etapa":
    case "Quando movido para esta etapa":
      return { triggerType: "stage_changed", triggerConfig: withConditions({ pipelineId, toStageId: stageId }) };
    case "Quando sair desta etapa":
      return { triggerType: "stage_changed", triggerConfig: withConditions({ pipelineId, fromStageId: stageId }) };
    case "Quando negócio for ganho":
      return { triggerType: "deal_won", triggerConfig: withConditions({ pipelineId }) };
    case "Quando negócio for perdido":
      return { triggerType: "deal_lost", triggerConfig: withConditions({ pipelineId }) };
    case "Quando mensagem for recebida":
      return { triggerType: "message_received", triggerConfig: withConditions({ pipelineId, stageId }) };
    case "Execução manual":
      return { triggerType: "manual", triggerConfig: withConditions({ pipelineId }) };
    default:
      return null;
  }
}

interface StageConfig {
  id: string;
  name: string;
  color: string;
  position: number;
  automations: Automation[];
  /** Estágios terminais fixos (Ganho/Perdido) — sem drag/rename/reorder. */
  isWon?: boolean;
  isLost?: boolean;
}

/** Terminal fixo (Ganho/Perdido): travado na configuração. */
function isTerminalStage(stage: Pick<StageConfig, "isWon" | "isLost"> | undefined): boolean {
  return Boolean(stage?.isWon || stage?.isLost);
}

// ─── CopyToStageModal ─────────────────────────────────────────────

interface CopyToStageModalProps {
  open: boolean;
  automation: Automation;
  currentStageId: string;
  stages: StageConfig[];
  onClose: () => void;
  onConfirm: (targetStageId: string) => void;
}

function CopyToStageModal({
  open,
  automation,
  currentStageId,
  stages,
  onClose,
  onConfirm,
}: CopyToStageModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelectedId(null);
  }, [open]);

  if (!open) return null;

  const targets = stages.filter((s) => s.id !== currentStageId);

  return (
    <div
      className="fixed inset-0 z-(--z-sheet) flex items-center justify-center bg-foreground/25 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[0_20px_60px_rgba(15,23,42,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-start justify-between bg-gradient-to-br from-[var(--brand-primary)]/10 via-[var(--glass-bg-base)] to-[var(--glass-bg-base)] px-5 pb-4 pt-5">
          <span className="absolute left-0 top-0 h-full w-[3px] rounded-r-full bg-[var(--brand-primary)]" />
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10">
              <IconCopy size={16} className="text-[var(--brand-primary)]" />
            </div>
            <div>
              <h2 className="font-display text-[14px] font-bold text-foreground">
                Copiar para outra fase
              </h2>
              <p className="mt-0.5 font-display text-[11.5px] text-ink-muted line-clamp-1">
                {automation.name}
              </p>
            </div>
          </div>
          <TooltipGlass label="Fechar" side="left">
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-muted hover:text-ink-soft"
            >
              <IconX size={15} />
            </button>
          </TooltipGlass>
        </div>

        <div className="h-px w-full bg-muted" />

        {/* Lista de fases */}
        <div className="flex flex-col gap-1 px-4 py-3">
          <p className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-ink-subtle">
            Selecionar fase de destino
          </p>
          {targets.length === 0 ? (
            <p className="py-4 text-center font-display text-[12.5px] text-ink-subtle">
              Nenhuma outra fase disponível.
            </p>
          ) : (
            targets.map((stage) => {
              const isSelected = selectedId === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setSelectedId(stage.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                    isSelected
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/6"
                      : "border-[var(--glass-border-subtle)] bg-muted hover:border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)]",
                  )}
                >
                  <span
                    className="h-5 w-1 shrink-0 rounded-full"
                    style={{ background: stage.color }}
                  />
                  <span className="flex-1 font-display text-[13px] font-semibold text-ink-soft">
                    {stage.name}
                  </span>
                  <span className="font-display text-[11px] text-ink-subtle">
                    {stage.automations.length} automação{stage.automations.length !== 1 ? "ões" : ""}
                  </span>
                  {isSelected && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]">
                      <IconCheck size={11} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--glass-border-subtle)] bg-muted/80 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] px-4 py-1.5 font-display text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => selectedId && onConfirm(selectedId)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-1.5 font-display text-[12.5px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.30)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconCopy size={12} />
            Colar nesta fase
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AutomationCard (Variante C — header brand) ───────────────────

interface AutomationCardProps {
  automation: Automation;
  stageId: string;
  stages: StageConfig[];
  onCopy: (automation: Automation, targetStageId: string) => void;
  onEdit: (automation: Automation) => void;
  onDelete: (automationId: string) => void;
}

function AutomationCard({ automation, stageId, stages, onCopy, onEdit, onDelete }: AutomationCardProps) {
  const [active, setActive] = useState(true);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [menuOpen]);

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] shadow-[var(--glass-shadow-sm)]">
      {/* Header com gradiente brand */}
      <div
        className="relative flex flex-col gap-2 px-4 pb-4 pt-4"
        style={{ background: "linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-light, #7B8FF7) 100%)" }}
      >
        {/* Ícone decorativo watermark */}
        <div className="absolute right-3 top-2 opacity-10" aria-hidden>
          <IconBolt size={42} className="text-white" />
        </div>

        {/* Tag de gatilho + menu contextual */}
        <div className="relative flex items-center justify-between" ref={menuRef}>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--glass-bg-subtle)] px-2.5 py-0.5 font-display text-[10px] font-bold text-white/90">
            <IconBolt size={10} />
            {automation.stageTrigger}
          </span>

          <TooltipGlass label="Mais opções do gatilho" side="top">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg bg-transparent text-white/60 transition-colors hover:bg-[var(--glass-bg-subtle)] hover:text-white"
            >
              <IconDots size={14} />
            </button>
          </TooltipGlass>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[0_8px_28px_rgba(15,23,42,0.14)]">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(automation); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-display text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
              >
                <IconPencil size={13} className="text-ink-subtle" />
                Editar gatilho
              </button>
              <div className="mx-3 h-px bg-muted" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(automation.id);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-display text-[12.5px] font-semibold text-destructive transition-colors hover:bg-destructive-soft"
              >
                <IconTrash size={13} />
                Deletar gatilho
              </button>
            </div>
          )}
        </div>

        {/* Nome + toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--glass-bg-subtle)]">
              <IconBolt size={14} className="text-white" />
            </div>
            <p className="truncate font-display text-[13.5px] font-bold text-white">
              {automation.name}
            </p>
          </div>
          <SwitchGlass
            checked={active}
            onChange={(v) => setActive(v)}
            size="sm"
            aria-label={`${active ? "Desativar" : "Ativar"} ${automation.name}`}
            className="relative z-10 shrink-0"
          />
        </div>

        {automation.description && (
          <p className="line-clamp-1 font-body text-[11px] leading-relaxed text-white/65">
            {automation.description}
          </p>
        )}
      </div>

      {/* Rodapé pill buttons */}
      <div className="flex items-center gap-2 bg-[var(--brand-primary)] px-4 pb-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setCopyModalOpen(true); }}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] py-1.5 font-display text-[11px] font-semibold text-white/90 transition-colors hover:bg-[var(--glass-bg-panel)]"
        >
          <IconCopy size={12} />
          Duplicar
        </button>
        <a
          href={`/automations/${automation.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white py-1.5 font-display text-[11px] font-bold text-[var(--brand-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all hover:-translate-y-px"
        >
          Abrir
          <IconExternalLink size={11} />
        </a>
      </div>

      <CopyToStageModal
        open={copyModalOpen}
        automation={automation}
        currentStageId={stageId}
        stages={stages}
        onClose={() => setCopyModalOpen(false)}
        onConfirm={(targetId) => {
          onCopy(automation, targetId);
          setCopyModalOpen(false);
        }}
      />
    </div>
  );
}

// ─── StageOptionsMenu ─────────────────────────────────────────────

interface StageOptionsMenuProps {
  stageId: string;
  isFirst: boolean;
  isLast: boolean;
  currentColor: string;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onRename: () => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
}

function StageOptionsMenu({
  stageId: _stageId,
  isFirst,
  isLast,
  currentColor,
  onMoveForward,
  onMoveBackward,
  onRename,
  onChangeColor,
  onDelete,
}: StageOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowColors(false);
      }
    };
    document.addEventListener("pointerdown", fn);
    return () => document.removeEventListener("pointerdown", fn);
  }, [open]);

  const close = () => {
    setOpen(false);
    setShowColors(false);
  };

  return (
    <div ref={ref} className="relative">
      <TooltipGlass label="Opções do estágio" side="top">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
        >
          <IconDots size={16} />
        </button>
      </TooltipGlass>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] py-1 shadow-[0_8px_28px_rgba(15,23,42,0.14)]">
          {/* Mover posição */}
          <div className="px-2 py-1">
            <p className="px-2 pb-1 font-display text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
              Posição
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={isFirst}
                onClick={() => { onMoveForward(); close(); }}
                className="flex cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11.5px] font-semibold text-ink-soft transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconChevronLeft size={13} />
                <span className="whitespace-nowrap">Mover frente</span>
              </button>
              <button
                type="button"
                disabled={isLast}
                onClick={() => { onMoveBackward(); close(); }}
                className="flex cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11.5px] font-semibold text-ink-soft transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="whitespace-nowrap">Mover atrás</span>
                <IconChevronRight size={13} />
              </button>
            </div>
          </div>

          <div className="my-1 border-t border-[var(--glass-border-subtle)]" />

          {/* Renomear */}
          <button
            type="button"
            onClick={() => { onRename(); close(); }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 font-display text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
          >
            <IconPencil size={14} className="text-ink-subtle" />
            Renomear estágio
          </button>

          {/* Alterar cor */}
          <button
            type="button"
            onClick={() => setShowColors((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between gap-2.5 px-3.5 py-2 font-display text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
          >
            <span className="flex items-center gap-2.5">
              <IconPalette size={14} className="text-ink-subtle" />
              Alterar cor
            </span>
            <span
              className="h-4 w-4 rounded-full border border-[var(--glass-border)]"
            style={{ background: currentColor }}
            />
          </button>

          {/* Swatches de cor */}
          {showColors && (
            <div className="border-t border-[var(--glass-border-subtle)] px-3.5 py-2.5">
              <div className="grid grid-cols-5 gap-1.5">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => { onChangeColor(c.value); close(); }}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                      currentColor === c.value
                        ? "border-[var(--text-primary)]"
                        : "border-transparent",
                    )}
                    style={{ background: c.value }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="my-1 border-t border-[var(--glass-border-subtle)]" />

          {/* Excluir */}
          <button
            type="button"
            onClick={() => { onDelete(); close(); }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 font-display text-[12.5px] font-semibold text-[var(--color-danger-text)] transition-colors hover:bg-[var(--color-danger-bg)]"
          >
            <IconTrash size={14} />
            Excluir estágio
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Modal de renomear estágio ────────────────────────────────────

function RenameStageModal({
  open,
  initialName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, initialName]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-6 shadow-[0_16px_48px_rgba(15,20,40,0.20)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            Renomear estágio
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)]"
          >
            <IconX size={16} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
            if (e.key === "Escape") onClose();
          }}
          placeholder="Nome do estágio..."
          className="w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5 font-display text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--glass-border)] bg-transparent px-4 py-2 font-display text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!value.trim() || value.trim() === initialName}
            onClick={() => value.trim() && onConfirm(value.trim())}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.30)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)] disabled:opacity-50"
          >
            <IconCheck size={13} />
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de excluir estágio ─────────────────────────────────────

function DeleteStageModal({
  open,
  stageName,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  stageName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-6 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_25%,transparent)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]">
            <IconTrash size={18} />
          </span>
          <h2 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            Excluir estágio
          </h2>
        </div>
        <p className="font-body text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Tem certeza que deseja excluir o estágio{" "}
          <strong className="font-semibold text-[var(--text-primary)]">{stageName}</strong>? Esta
          ação não pode ser desfeita. Estágios com negócios não podem ser excluídos.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-2 font-display text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-danger)] px-4 py-2 font-display text-[12px] font-bold text-white shadow-[var(--glass-shadow-sm)] transition-all hover:-translate-y-px hover:brightness-95 disabled:translate-y-0 disabled:opacity-50"
          >
            <IconTrash size={13} />
            {busy ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AddStageModal ────────────────────────────────────────────────

function AddStageModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-6 shadow-[0_16px_48px_rgba(15,20,40,0.20)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            Nova etapa
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)]"
          >
            <IconX size={16} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
            if (e.key === "Escape") onClose();
          }}
          placeholder="Nome da etapa..."
          className="w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5 font-display text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--glass-border)] bg-transparent px-4 py-2 font-display text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => value.trim() && onConfirm(value.trim())}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.30)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)] disabled:opacity-50"
          >
            <IconCheck size={13} />
            Criar etapa
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StageColumn ──────────────────────────────────────────────────

interface StageColumnProps {
  stage: StageConfig;
  pipelineId: string | null;
  isFirst: boolean;
  isLast: boolean;
  isDragOver: boolean;
  allStages: StageConfig[];
  onAddAutomation: (stageId: string) => void;
  onCopyAutomation: (automation: Automation, targetStageId: string, sourceStageId: string) => void;
  onEditAutomation: (automation: Automation, stageId: string) => void;
  onDeleteAutomation: (automationId: string, stageId: string) => void;
  onMoveForward: (stageId: string) => void;
  onMoveBackward: (stageId: string) => void;
  onRename: (stageId: string) => void;
  onChangeColor: (stageId: string, color: string) => void;
  onDelete: (stageId: string) => void;
  onDragStart: (stageId: string) => void;
  onDragOver: (stageId: string) => void;
  onDrop: (targetId: string) => void;
  onDragEnd: () => void;
}

function StageColumn({
  stage,
  pipelineId,
  isFirst,
  isLast,
  isDragOver,
  allStages,
  onAddAutomation,
  onCopyAutomation,
  onEditAutomation,
  onDeleteAutomation,
  onMoveForward,
  onMoveBackward,
  onRename,
  onChangeColor,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: StageColumnProps) {
  const locked = isTerminalStage(stage);
  const isLost = Boolean(stage.isLost);
  return (
    <section
      aria-label={`Estágio ${stage.name}`}
      draggable={!locked}
      onDragStart={() => onDragStart(stage.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(stage.id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(stage.id); }}
      onDragEnd={onDragEnd}
      className={cn(
        "kanban-col flex shrink-0 flex-col rounded-xl border bg-[var(--glass-bg-strong)] px-3.5 pb-3 pt-4 shadow-[var(--glass-shadow)] backdrop-blur-md transition-all duration-150",
        isLost ? "w-[360px]" : "w-[300px]",
        isDragOver
          ? "scale-[1.02] border-[var(--brand-primary)] shadow-[0_0_0_2px_rgba(91,111,245,0.25),var(--glass-shadow)]"
          : "border-[var(--glass-border)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-2.5">
          {/* Handle de drag — terminais fixos não reordenam */}
          {locked ? (
            <TooltipGlass label="Estágio fixo do funil" side="top">
              <span className="flex items-center text-[var(--text-muted)]/60">
                <IconLock size={14} />
              </span>
            </TooltipGlass>
          ) : (
            <TooltipGlass label="Arrastar para reordenar" side="top">
              <span className="flex cursor-grab flex-col gap-1 active:cursor-grabbing">
                {[0,1,2].map((i) => (
                <span key={i} className="flex gap-1">
                  <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-muted)]/40" />
                  <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-muted)]/40" />
                </span>
              ))}
              </span>
            </TooltipGlass>
          )}
          <span
            className="h-[18px] w-[3px] rounded-full"
            style={{ background: stage.color }}
          />
          <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
            {stage.name}
          </h3>
          <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--text-muted)]">
            {stage.automations.length}
          </span>
        </div>
        {locked ? (
          <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Fixo
          </span>
        ) : (
          <StageOptionsMenu
            stageId={stage.id}
            isFirst={isFirst}
            isLast={isLast}
            currentColor={stage.color}
            onMoveForward={() => onMoveForward(stage.id)}
            onMoveBackward={() => onMoveBackward(stage.id)}
            onRename={() => onRename(stage.id)}
            onChangeColor={(color) => onChangeColor(stage.id, color)}
            onDelete={() => onDelete(stage.id)}
          />
        )}
      </div>

      {/* Subtítulo */}
      <div className="mb-3 border-b border-[var(--glass-border-subtle)] px-1 pb-2.5 font-display text-xs font-semibold text-[var(--text-secondary)]">
        {stage.automations.length === 0
          ? "Sem automações"
          : `${stage.automations.length} automação${stage.automations.length !== 1 ? "ões" : ""}`}
      </div>

      {/* Lista de cards */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {isLost && pipelineId && (
          <LostStageReasonsPanel pipelineId={pipelineId} />
        )}
        {stage.automations.map((auto) => (
          <AutomationCard
            key={auto.id}
            automation={auto}
            stageId={stage.id}
            stages={allStages}
            onCopy={(automation, targetStageId) =>
              onCopyAutomation(automation, targetStageId, stage.id)
            }
            onEdit={(automation) => onEditAutomation(automation, stage.id)}
            onDelete={(automationId) => onDeleteAutomation(automationId, stage.id)}
          />
        ))}

        <button
          type="button"
          onClick={() => onAddAutomation(stage.id)}
          className={cn(
            "mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-[var(--glass-border)] bg-transparent py-2.5 font-display text-xs font-semibold text-[var(--text-muted)] transition-all",
            "hover:border-[var(--brand-primary)] hover:bg-[var(--color-enterprise-bg)] hover:text-[var(--brand-primary)]",
          )}
        >
          <IconPlus size={14} />
          Adicionar automação
        </button>
      </div>
    </section>
  );
}

// ─── Modal "Novo pipeline" ────────────────────────────────────────

function NewPipelineModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-6 shadow-[0_16px_48px_rgba(15,20,40,0.20)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 font-display text-[15px] font-bold text-[var(--text-primary)]">
          Novo pipeline
        </h2>
        <p className="mb-4 font-display text-[12.5px] text-[var(--text-muted)]">
          Crie um novo funil de vendas para sua equipe.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
            if (e.key === "Escape") onClose();
          }}
          placeholder="Nome do pipeline..."
          className="w-full rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5 font-display text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--glass-border)] bg-transparent px-4 py-2 font-display text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => value.trim() && onConfirm(value.trim())}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.30)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)] disabled:opacity-50"
          >
            <IconCheck size={13} />
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal "Apagar pipeline" ──────────────────────────────────────

function ArchivePipelineModal({
  open,
  pipelineName,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pipelineName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-6 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_25%,transparent)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]">
            <IconTrash size={18} />
          </span>
          <h2 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            Apagar pipeline
          </h2>
        </div>
        <p className="font-body text-[13px] leading-relaxed text-[var(--text-secondary)]">
          O pipeline{" "}
          <strong className="font-semibold text-[var(--text-primary)]">{pipelineName}</strong>,
          suas etapas e negócios deixarão de aparecer no CRM. Os dados não são apagados
          definitivamente — ficam arquivados no banco. Confirme com sua senha de login para
          continuar.
        </p>
        <PasswordInput
          ref={inputRef}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && password && !busy) onConfirm(password);
            if (e.key === "Escape" && !busy) onClose();
          }}
          placeholder="Sua senha de login..."
          disabled={busy}
          className="mt-4"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-2 font-display text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !password}
            onClick={() => onConfirm(password)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-danger)] px-4 py-2 font-display text-[12px] font-bold text-white shadow-[var(--glass-shadow-sm)] transition-all hover:-translate-y-px hover:brightness-95 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconTrash size={13} />
            {busy ? "Apagando..." : "Apagar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TabsOverride ─────────────────────────────────────────────────

interface TabsOverrideProps {
  onNewPipeline: () => void;
  onSetDefault: () => void;
  onSave: () => void;
  hasChanges: boolean;
  saving: boolean;
  onDeletePipeline?: () => void;
  canDelete?: boolean;
  deleteDisabled?: boolean;
}

function PipelineSettingsTabs({
  onNewPipeline,
  onSetDefault,
  onSave,
  hasChanges,
  saving,
  onDeletePipeline,
  canDelete,
  deleteDisabled,
}: TabsOverrideProps) {
  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        onClick={onNewPipeline}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-1.5 font-display text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.30)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)]"
      >
        <IconPlus size={14} />
        Novo pipeline
      </button>

      <TooltipGlass label="Definir como pipeline padrão" side="bottom">
        <button
          type="button"
          onClick={onSetDefault}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] transition-colors hover:border-warning/40/50 hover:bg-warning-soft hover:text-warning dark:hover:bg-warning/10"
        >
          <IconStar size={15} />
        </button>
      </TooltipGlass>

      {canDelete && (
        <TooltipGlass
          label={deleteDisabled ? "Não é possível apagar o único pipeline" : "Apagar este pipeline"}
          side="bottom"
        >
          <button
            type="button"
            onClick={onDeletePipeline}
            disabled={deleteDisabled}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-bg)] px-4 py-1.5 font-display text-[12px] font-bold text-[var(--color-danger-text)] transition-all hover:-translate-y-px hover:brightness-95 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-40"
          >
            <IconTrash size={14} />
            Apagar pipeline
          </button>
        </TooltipGlass>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!hasChanges || saving}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-display text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.30)] transition-all",
            hasChanges && !saving
              ? "cursor-pointer bg-success hover:-translate-y-px hover:bg-success"
              : "cursor-not-allowed bg-success/40 shadow-none",
          )}
        >
          <IconCheck size={14} />
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────────

export default function PipelineSettingsClientPage() {
  const { status: sessionStatus } = useSession();
  const canFetch = sessionStatus !== "unauthenticated";
  const { role, isSuperAdmin } = useUserRole();
  const canDeletePipeline = role === "ADMIN" || isSuperAdmin;

  const { data: pipelines } = usePipelines(canFetch);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);

  // Modal "Apagar pipeline"
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  // Automações por estágio (estado local)
  const [stageAutomationsMap, setStageAutomationsMap] = useState<Record<string, Automation[]>>({});

  // Drawer "Adicionar automação"
  const [addAutomationStageId, setAddAutomationStageId] = useState<string | null>(null);

  // Drawer "Editar automação"
  const [editingAutomation, setEditingAutomation] = useState<{ automation: Automation; stageId: string } | null>(null);

  // Estado local de ordem, nomes e cores dos estágios
  const [stageOrder, setStageOrder] = useState<string[]>([]);
  const [stageNameOverrides, setStageNameOverrides] = useState<Record<string, string>>({});
  const [stageColorOverrides, setStageColorOverrides] = useState<Record<string, string>>({});

  // Drag-and-drop
  const dragSourceId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Refs do board para scroll horizontal / altura das colunas
  const boardRef = useRef<HTMLDivElement>(null);
  const boardWrapperRef = useRef<HTMLDivElement>(null);

  // Propaga a altura disponível para as colunas via --col-h (mesma técnica
  // usada no board do pipeline) — quebra a dependência da cadeia flex.
  useEffect(() => {
    const wrapper = boardWrapperRef.current;
    if (!wrapper) return;
    const apply = () => {
      const board = wrapper.querySelector<HTMLElement>(".kanban-board-hscroll");
      if (!board) return;
      const boardTop = board.getBoundingClientRect().top;
      const colH = Math.max(120, window.innerHeight - boardTop - 16);
      board.style.height = `${colH}px`;
      board.style.setProperty("--col-h", `${colH}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrapper);
    const screenEl = wrapper.closest<HTMLElement>(".v2-screen");
    if (screenEl) ro.observe(screenEl);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  // Modal de renomear
  const [renamingStageId, setRenamingStageId] = useState<string | null>(null);

  // Modal de excluir estágio
  const [deletingStageId, setDeletingStageId] = useState<string | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Modal de nova etapa
  const [addStageOpen, setAddStageOpen] = useState(false);

  // Automações do backend para look-up e hidratação da lista por estágio.
  // perPage usa o máximo aceito pelo backend (100). Orgs com >100 automações
  // precisariam de paginação adicional; fora do escopo do bugfix atual.
  const { data: automationsData } = useAutomations({ perPage: 100, enabled: canFetch });

  // Persistência do último funil — mesma chave/lógica do `/pipeline`
  // (ver `app/(app)/pipeline/_v2-client.tsx`). Trocar funil aqui ou lá deve
  // ficar lembrado em ambos os lugares após F5.
  const PIPELINE_STORAGE_KEY = "crm:pipeline:last-selected:v1";

  useEffect(() => {
    if (pipelineId || !pipelines?.length) return;
    let saved: string | null = null;
    try {
      saved = typeof window !== "undefined" ? localStorage.getItem(PIPELINE_STORAGE_KEY) : null;
    } catch {
      saved = null;
    }
    if (saved && pipelines.some((p) => p.id === saved)) {
      setPipelineId(saved);
      return;
    }
    const def = pipelines.find((p) => p.isDefault) ?? pipelines[0];
    setPipelineId(def.id);
  }, [pipelines, pipelineId]);

  useEffect(() => {
    if (!pipelineId) return;
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(PIPELINE_STORAGE_KEY, pipelineId);
      }
    } catch {
      /* localStorage indisponível — ignorar */
    }
  }, [pipelineId]);

  const { data: board = [] } = useBoard({
    pipelineId,
    status: "OPEN",
    enabled: canFetch,
  });

  // Snapshot do estado original do board — usado para diff ao salvar e para
  // determinar se há alterações pendentes. É atualizado sempre que o board
  // do backend muda (ex.: após salvar e revalidar).
  const baselineRef = useRef<{
    order: string[];
    names: Record<string, string>;
    colors: Record<string, string>;
  }>({ order: [], names: {}, colors: {} });

  // Snapshot das automações vinculadas a cada estágio — usado pelo diff em
  // `handleSaveAll` para decidir quais automações criar (clone), mover
  // (PUT triggerConfig), trocar trigger ou desativar (unbind). Capturado no
  // mesmo useEffect que hidrata `stageAutomationsMap` para garantir
  // consistência entre baseline e estado inicial visível.
  const automationsBaselineRef = useRef<
    Map<
      string,
      {
        stageId: string;
        trigger: string;
        triggerType: string;
        triggerConfig: Record<string, unknown> | null;
        conditions: TriggerCondition[];
      }
    >
  >(new Map());

  const [saving, setSaving] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (board.length > 0) {
      const order = board.map((s) => s.id);
      const names: Record<string, string> = {};
      const colors: Record<string, string> = {};
      for (const s of board) {
        names[s.id] = s.name;
        colors[s.id] = s.color ?? "#5B6FF5";
      }
      baselineRef.current = { order, names, colors };
      setStageOrder(order);
      setStageNameOverrides({});
      setStageColorOverrides({});
    }
  }, [board]);

  // Hidrata as automações por estágio a partir do GET /api/automations.
  // O backend não tem FK Automação→Stage; o vínculo vive em
  // `triggerConfig.{pipelineId,stageId,toStageId,fromStageId}` (ver
  // `services/automation-executor.ts` no backend e a investigação em
  // 39521bd5-3e91-4916-8a54-7b76693baa7e).
  //
  // Além de popular `stageAutomationsMap` para render, captura o baseline em
  // `automationsBaselineRef` — é nele que `handleSaveAll` se ancora para
  // calcular o diff (criar/mover/unbind) ao salvar.
  useEffect(() => {
    if (!pipelineId || !automationsData?.items || board.length === 0) {
      return;
    }
    const map: Record<string, Automation[]> = {};
    const baselineNext = new Map<
      string,
      {
        stageId: string;
        trigger: string;
        triggerType: string;
        triggerConfig: Record<string, unknown> | null;
        conditions: TriggerCondition[];
      }
    >();
    for (const stage of board) {
      const matches: Automation[] = [];
      for (const dto of automationsData.items) {
        const cfg = (dto.triggerConfig ?? null) as Record<string, unknown> | null;
        if (!isAutomationForStage(cfg, dto.triggerType, pipelineId, stage.id, dto.active)) {
          continue;
        }
        const label = labelForBackendTrigger(dto.triggerType, cfg, stage.id);
        const conditions = parseConditions(cfg);
        matches.push({
          id: dto.id,
          baseAutomationId: dto.id,
          name: dto.name,
          description: dto.description ?? undefined,
          stageTrigger: label,
          conditions,
        });
        // Cada automação real só pode estar em 1 estágio (1 triggerConfig).
        // Se já entrou aqui, ignora repetição em outros estágios — defensivo
        // contra triggerConfigs anômalos com múltiplos casamentos.
        if (!baselineNext.has(dto.id)) {
          baselineNext.set(dto.id, {
            stageId: stage.id,
            trigger: label,
            triggerType: dto.triggerType,
            triggerConfig: cfg,
            conditions,
          });
        }
      }
      map[stage.id] = matches;
    }
    automationsBaselineRef.current = baselineNext;
    setStageAutomationsMap(map);
  }, [pipelineId, automationsData?.items, board]);

  // Detecta se há mudanças não salvas comparando estado atual vs baseline.
  const hasChanges = useMemo(() => {
    const base = baselineRef.current;
    // Stages novos locais
    if (stageOrder.some((id) => id.startsWith("local-stage-"))) return true;
    // Ordem alterada (apenas dos persistidos)
    const persistedOrder = stageOrder.filter((id) => !id.startsWith("local-stage-"));
    if (
      persistedOrder.length !== base.order.length ||
      persistedOrder.some((id, i) => id !== base.order[i])
    ) {
      return true;
    }
    // Nome alterado
    for (const [id, name] of Object.entries(stageNameOverrides)) {
      if (id.startsWith("local-stage-")) continue;
      if (base.names[id] !== undefined && base.names[id] !== name) return true;
    }
    // Cor alterada
    for (const [id, color] of Object.entries(stageColorOverrides)) {
      if (id.startsWith("local-stage-")) continue;
      if (base.colors[id] !== undefined && base.colors[id] !== color) return true;
    }
    // ─── Automações ─────────────────────────────────────────────────
    // (a) Qualquer card sintético (Adicionar/Copiar) é mudança.
    // (b) ID real do baseline ausente do mapa = unbind/excluir.
    // (c) ID real em estágio diferente do baseline = move.
    // (d) ID real com label de trigger diferente do baseline = edit do gatilho.
    const automationsBaseline = automationsBaselineRef.current;
    const seenRealIds = new Set<string>();
    for (const [stageId, list] of Object.entries(stageAutomationsMap)) {
      for (const auto of list) {
        if (auto.id.startsWith("local-auto-")) return true;
        seenRealIds.add(auto.id);
        const prev = automationsBaseline.get(auto.id);
        if (!prev) return true; // ID real que não existia no baseline (defensivo)
        if (prev.stageId !== stageId) return true;
        if (prev.trigger !== auto.stageTrigger) return true;
        if (!conditionsEqual(prev.conditions, auto.conditions)) return true;
      }
    }
    for (const id of automationsBaseline.keys()) {
      if (!seenRealIds.has(id)) return true;
    }
    return false;
  }, [stageOrder, stageNameOverrides, stageColorOverrides, stageAutomationsMap]);

  const handleSaveAll = useCallback(async () => {
    if (!pipelineId || saving) return;
    setSaving(true);
    try {
      const base = baselineRef.current;

      // 1) Criar stages novas locais (POST). Cada uma recebe id real, que
      // substitui o id local na ordem final enviada ao reorder.
      const localToRealId = new Map<string, string>();
      const localIds = stageOrder.filter((id) => id.startsWith("local-stage-"));
      for (const localId of localIds) {
        const name = stageNameOverrides[localId];
        const color = stageColorOverrides[localId];
        if (!name) continue;
        const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/stages`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, ...(color ? { color } : {}) }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? `Falha ao criar etapa "${name}".`);
        }
        const created = (await res.json()) as { id: string };
        localToRealId.set(localId, created.id);
      }

      // 2) Atualizar nome/cor de stages persistidas (PATCH).
      const persistedIds = Object.keys({ ...stageNameOverrides, ...stageColorOverrides }).filter(
        (id) => !id.startsWith("local-stage-"),
      );
      for (const id of persistedIds) {
        const patch: { name?: string; color?: string } = {};
        const newName = stageNameOverrides[id];
        const newColor = stageColorOverrides[id];
        if (newName !== undefined && newName !== base.names[id]) patch.name = newName;
        if (newColor !== undefined && newColor !== base.colors[id]) patch.color = newColor;
        if (Object.keys(patch).length === 0) continue;
        const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/stages/${id}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? `Falha ao atualizar etapa.`);
        }
      }

      // 3) Reordenar (PUT /stages) com a lista final, substituindo ids locais
      // pelos reais. Só envia se a ordem mudou ou se houve criação.
      const finalOrder = stageOrder.map((id) => localToRealId.get(id) ?? id);
      const orderChanged =
        finalOrder.length !== base.order.length ||
        finalOrder.some((id, i) => id !== base.order[i]);
      if (orderChanged) {
        const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/stages`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ stageIds: finalOrder }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? "Falha ao reordenar etapas.");
        }
      }

      // 4) Persistir mudanças em automações por estágio.
      //    Fonte da verdade: `stageAutomationsMap` (estado atual) vs
      //    `automationsBaselineRef.current` (snapshot do último hidrate).
      //    IDs locais (`local-auto-*`) precisam ser remapeados para os ids
      //    reais dos estágios recém-criados — usa o `localToRealId`.
      const automationsBaseline = automationsBaselineRef.current;
      const realIdsSeen = new Set<string>();

      type AutomationOp =
        | { kind: "link"; id: string; stageRealId: string; label: string; conditions?: TriggerCondition[] }
        | { kind: "update"; id: string; stageRealId: string; label: string; conditions?: TriggerCondition[] }
        | { kind: "unbind"; id: string };

      const ops: AutomationOp[] = [];

      for (const [stageIdLocal, list] of Object.entries(stageAutomationsMap)) {
        const stageRealId = localToRealId.get(stageIdLocal) ?? stageIdLocal;
        for (const auto of list) {
          if (auto.id.startsWith("local-auto-")) {
            const baseId = auto.baseAutomationId;
            if (!baseId) continue; // defensivo — não deveria acontecer
            // VINCULAR (não clonar): aponta o gatilho para a própria automação
            // existente (PUT triggerType/triggerConfig + active) — evita
            // duplicatas em /automations. Marca como "seen" pra não cair no
            // unbind abaixo (caso já estivesse no baseline, ligada a outra etapa).
            ops.push({ kind: "link", id: baseId, stageRealId, label: auto.stageTrigger, conditions: auto.conditions });
            realIdsSeen.add(baseId);
            continue;
          }
          realIdsSeen.add(auto.id);
          const prev = automationsBaseline.get(auto.id);
          if (!prev) continue; // ID real sem baseline — ignorado (defensivo)
          if (
            prev.stageId !== stageRealId ||
            prev.trigger !== auto.stageTrigger ||
            !conditionsEqual(prev.conditions, auto.conditions)
          ) {
            ops.push({ kind: "update", id: auto.id, stageRealId, label: auto.stageTrigger, conditions: auto.conditions });
          }
        }
      }

      // IDs reais do baseline ausentes do mapa atual → unbind (active=false).
      for (const id of automationsBaseline.keys()) {
        if (!realIdsSeen.has(id)) {
          ops.push({ kind: "unbind", id });
        }
      }

      for (const op of ops) {
        if (op.kind === "link") {
          // Vincula a automação EXISTENTE a esta etapa/gatilho (sem clonar):
          // atualiza triggerType/triggerConfig e garante `active: true` (o
          // filtro de leitura da etapa exige ativa). Assim não acumulam
          // duplicatas em /automations e o vínculo persiste na releitura.
          const tr = triggerFromLabel(op.label, pipelineId, op.stageRealId, op.conditions);
          if (!tr) {
            throw new Error(`Gatilho desconhecido: "${op.label}".`);
          }
          const res = await fetch(apiUrl(`/api/automations/${op.id}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              triggerType: tr.triggerType,
              triggerConfig: tr.triggerConfig,
              active: true,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.message ?? "Falha ao vincular automação à etapa.");
          }
        } else if (op.kind === "update") {
          const tr = triggerFromLabel(op.label, pipelineId, op.stageRealId, op.conditions);
          if (!tr) {
            throw new Error(`Gatilho desconhecido: "${op.label}".`);
          }
          const res = await fetch(apiUrl(`/api/automations/${op.id}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ triggerType: tr.triggerType, triggerConfig: tr.triggerConfig }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.message ?? "Falha ao atualizar automação.");
          }
        } else {
          // unbind: desativa preservando triggerConfig/steps. Para religar:
          // ativar de novo em /automations (volta a aparecer no editor).
          const res = await fetch(apiUrl(`/api/automations/${op.id}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ active: false }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.message ?? "Falha ao desativar automação.");
          }
        }
      }

      toast.success("Alterações salvas.");
      // Revalida o board — useEffect re-inicializa overrides com baseline novo.
      await queryClient.invalidateQueries({ queryKey: boardKey(pipelineId, "OPEN") });
      // Revalida automações — força re-hidratação de `stageAutomationsMap` e
      // do `automationsBaselineRef` com o estado pós-save.
      await queryClient.invalidateQueries({ queryKey: ["v2-automations"], exact: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  }, [pipelineId, saving, stageOrder, stageNameOverrides, stageColorOverrides, stageAutomationsMap, queryClient]);

  // Monta os estágios na ordem local, mesclando overrides.
  // IDs com prefixo "local-stage-" são etapas criadas localmente (ainda não
  // persistidas no backend) — montadas apenas a partir dos overrides.
  const stages: StageConfig[] = useMemo(() => {
    const stageMap = new Map(board.map((s) => [s.id, s]));
    const order = stageOrder.length > 0 ? stageOrder : board.map((s) => s.id);
    return order
      .map((id, idx) => {
        const s = stageMap.get(id);
        if (s) {
          return {
            id: s.id,
            name: stageNameOverrides[s.id] ?? s.name,
            color: stageColorOverrides[s.id] ?? s.color ?? "#5B6FF5",
            position: s.position,
            automations: stageAutomationsMap[s.id] ?? [],
            isWon: s.isWon,
            isLost: s.isLost,
          } satisfies StageConfig;
        }
        // Etapa criada localmente (não está no board do backend ainda)
        if (stageNameOverrides[id]) {
          return {
            id,
            name: stageNameOverrides[id],
            color: stageColorOverrides[id] ?? "#5B6FF5",
            position: idx,
            automations: stageAutomationsMap[id] ?? [],
          } satisfies StageConfig;
        }
        return null;
      })
      .filter(Boolean) as StageConfig[];
  }, [board, stageOrder, stageNameOverrides, stageColorOverrides, stageAutomationsMap]);

  const addAutomationStageName = useMemo(() => {
    if (!addAutomationStageId) return "";
    return stages.find((s) => s.id === addAutomationStageId)?.name ?? "";
  }, [addAutomationStageId, stages]);

  const renamingStageCurrentName = useMemo(() => {
    if (!renamingStageId) return "";
    return stages.find((s) => s.id === renamingStageId)?.name ?? "";
  }, [renamingStageId, stages]);

  const deletingStageName = useMemo(() => {
    if (!deletingStageId) return "";
    return stages.find((s) => s.id === deletingStageId)?.name ?? "";
  }, [deletingStageId, stages]);

  // ─── Handlers de estágio ────────────────────────────────────────

  // Terminais fixos (Ganho/Perdido): não arrastam, não recebem drop e
  // nenhum estágio comum pode passar pra depois deles.
  const terminalStageIds = useMemo(
    () => new Set(board.filter((s) => s.isWon || s.isLost).map((s) => s.id)),
    [board],
  );

  const handleDragStart = useCallback((stageId: string) => {
    if (terminalStageIds.has(stageId)) return;
    dragSourceId.current = stageId;
  }, [terminalStageIds]);

  const handleDragOver = useCallback((stageId: string) => {
    if (terminalStageIds.has(stageId)) return;
    if (dragSourceId.current && dragSourceId.current !== stageId) {
      setDragOverId(stageId);
    }
  }, [terminalStageIds]);

  const handleDrop = useCallback((targetId: string) => {
    const sourceId = dragSourceId.current;
    if (!sourceId || sourceId === targetId) return;
    if (terminalStageIds.has(sourceId) || terminalStageIds.has(targetId)) return;
    setStageOrder((prev) => {
      const arr = [...prev];
      const fromIdx = arr.indexOf(sourceId);
      const toIdx = arr.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, sourceId);
      return arr;
    });
    dragSourceId.current = null;
    setDragOverId(null);
  }, [terminalStageIds]);

  const handleDragEnd = useCallback(() => {
    dragSourceId.current = null;
    setDragOverId(null);
  }, []);

  const handleMoveForward = useCallback((stageId: string) => {
    if (terminalStageIds.has(stageId)) return;
    setStageOrder((prev) => {
      const idx = prev.indexOf(stageId);
      if (idx <= 0) return prev;
      if (terminalStageIds.has(prev[idx - 1])) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, [terminalStageIds]);

  const handleMoveBackward = useCallback((stageId: string) => {
    if (terminalStageIds.has(stageId)) return;
    setStageOrder((prev) => {
      const idx = prev.indexOf(stageId);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      if (terminalStageIds.has(prev[idx + 1])) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, [terminalStageIds]);

  const handleRenameConfirm = useCallback((name: string) => {
    if (!renamingStageId) return;
    setStageNameOverrides((prev) => ({ ...prev, [renamingStageId]: name }));
    setRenamingStageId(null);
  }, [renamingStageId]);

  const handleChangeColor = useCallback((stageId: string, color: string) => {
    setStageColorOverrides((prev) => ({ ...prev, [stageId]: color }));
  }, []);

  const handleAddStage = useCallback((name: string) => {
    const newId = `local-stage-${Date.now()}`;
    const color = "#5B6FF5";
    // Insere ANTES dos terminais fixos (Ganho/Perdido) — eles sempre
    // fecham o pipeline. O backend aplica a mesma regra no POST.
    setStageOrder((prev) => {
      const firstTerminalIdx = prev.findIndex((id) => terminalStageIds.has(id));
      if (firstTerminalIdx === -1) return [...prev, newId];
      const next = [...prev];
      next.splice(firstTerminalIdx, 0, newId);
      return next;
    });
    setStageNameOverrides((prev) => ({ ...prev, [newId]: name }));
    setStageColorOverrides((prev) => ({ ...prev, [newId]: color }));
    setAddStageOpen(false);
  }, [terminalStageIds]);

  // Exclusão de estágio. Estágios locais (ainda não salvos) são apenas
  // removidos do estado; persistidos disparam DELETE imediato — o backend
  // valida proteções (estágio com negócios, entrada e terminais) e devolve
  // 409 com mensagem, exibida via toast.
  const handleConfirmDeleteStage = useCallback(async () => {
    const id = deletingStageId;
    if (!id) return;

    if (id.startsWith("local-stage-")) {
      setStageOrder((prev) => prev.filter((s) => s !== id));
      setStageNameOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setStageColorOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setStageAutomationsMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeletingStageId(null);
      toast.success("Estágio removido.");
      return;
    }

    if (!pipelineId) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/stages/${id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Falha ao excluir estágio.");
      }
      toast.success("Estágio excluído.");
      setDeletingStageId(null);
      await queryClient.invalidateQueries({ queryKey: boardKey(pipelineId, "OPEN") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir estágio.");
    } finally {
      setDeletingBusy(false);
    }
  }, [deletingStageId, pipelineId, queryClient]);

  // ─── Handlers de automação ──────────────────────────────────────

  const handleAddAutomation = useCallback((stageId: string) => {
    setAddAutomationStageId(stageId);
  }, []);

  const handleDrawerConfirm = useCallback(
    ({
      automationId,
      trigger,
      targetStageId,
      conditions,
    }: {
      automationId: string;
      trigger: string;
      applyToExisting: boolean;
      targetStageId?: string;
      conditions?: TriggerCondition[];
    }) => {
      if (!addAutomationStageId) return;
      const autoDto = automationsData?.items.find((a) => a.id === automationId);
      if (!autoDto) return;

      const newAuto: Automation = {
        // Prefixo `local-auto-add-` sinaliza ao `handleSaveAll` que precisa
        // CLONAR (POST /api/automations) a automação base ao salvar — preserva
        // a original em /automations e cria uma nova vinculada ao estágio.
        id: `local-auto-add-${automationId}-${Date.now()}`,
        baseAutomationId: automationId,
        stageTrigger: STAGE_TRIGGER_LABELS[trigger] ?? trigger,
        name: autoDto.name,
        description: autoDto.description ?? undefined,
        conditions: sanitizeConditions(conditions ?? []),
      };

      // Gatilho "movido para etapa": a automação pertence à etapa de DESTINO
      // escolhida no seletor inline (pode diferir do card onde foi aberto).
      // O `handleSaveAll` converte o label → triggerConfig.toStageId usando a
      // chave do mapa, então basta arquivar sob a etapa-alvo.
      const fileStageId = targetStageId ?? addAutomationStageId;

      setStageAutomationsMap((prev) => ({
        ...prev,
        [fileStageId]: [...(prev[fileStageId] ?? []), newAuto],
      }));
      setAddAutomationStageId(null);
    },
    [addAutomationStageId, automationsData?.items],
  );

  const handleEditAutomation = useCallback(
    (automation: Automation, stageId: string) => {
      setEditingAutomation({ automation, stageId });
    },
    [],
  );

  const handleEditDrawerConfirm = useCallback(
    ({
      automationId,
      trigger,
      targetStageId,
      conditions,
    }: {
      automationId: string;
      trigger: string;
      applyToExisting: boolean;
      targetStageId?: string;
      conditions?: TriggerCondition[];
    }) => {
      if (!editingAutomation) return;
      const { automation, stageId } = editingAutomation;
      const autoDto = automationsData?.items.find((a) => a.id === automationId);
      const updatedAuto: Automation = {
        ...automation,
        // Se o usuário trocou a automação base no drawer, atualiza o
        // `baseAutomationId` — `handleSaveAll` saberá apontar o triggerConfig
        // para o backend correto (e clonar steps se necessário).
        baseAutomationId: autoDto?.id ?? automation.baseAutomationId,
        stageTrigger: STAGE_TRIGGER_LABELS[trigger] ?? trigger,
        name: autoDto?.name ?? automation.name,
        description: autoDto?.description ?? automation.description,
        conditions: sanitizeConditions(conditions ?? []),
      };
      // "Movido para etapa" pode ter destino diferente da etapa atual do card:
      // move a automação para a chave da etapa-alvo (remove da origem).
      const destStageId = targetStageId ?? stageId;
      setStageAutomationsMap((prev) => {
        const next = { ...prev };
        if (destStageId !== stageId) {
          next[stageId] = (prev[stageId] ?? []).filter((a) => a.id !== automation.id);
          next[destStageId] = [...(prev[destStageId] ?? []), updatedAuto];
        } else {
          next[stageId] = (prev[stageId] ?? []).map((a) =>
            a.id === automation.id ? updatedAuto : a,
          );
        }
        return next;
      });
      setEditingAutomation(null);
    },
    [editingAutomation, automationsData?.items],
  );

  const handleDeleteAutomation = useCallback(
    (automationId: string, stageId: string) => {
      setStageAutomationsMap((prev) => ({
        ...prev,
        [stageId]: (prev[stageId] ?? []).filter((a) => a.id !== automationId),
      }));
    },
    [],
  );

  const handleCopyAutomation = useCallback(
    (automation: Automation, targetStageId: string, _sourceStageId: string) => {
      // Preserva o `baseAutomationId` real (mesmo se estiver copiando uma cópia
      // ainda não salva) — `handleSaveAll` precisa do ID real do backend pra
      // duplicar a automação (POST /api/automations + steps clonados).
      const baseId = automation.baseAutomationId ?? automation.id;
      const copy: Automation = {
        ...automation,
        id: `local-auto-copy-${baseId}-${Date.now()}`,
        baseAutomationId: baseId,
      };
      setStageAutomationsMap((prev) => ({
        ...prev,
        [targetStageId]: [...(prev[targetStageId] ?? []), copy],
      }));
    },
    [],
  );

  // ─── Outros handlers ────────────────────────────────────────────

  const handleNewPipeline = useCallback(
    async (name: string) => {
      try {
        const res = await fetch(apiUrl("/api/pipelines"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? "Falha ao criar pipeline.");
        }
        const created = (await res.json()) as { id: string; name: string };
        await queryClient.invalidateQueries({ queryKey: ["pipelines-v2"] });
        setNewPipelineOpen(false);
        setPipelineId(created.id);
        setStageOrder([]);
        setStageNameOverrides({});
        setStageColorOverrides({});
        setStageAutomationsMap({});
        toast.success(`Pipeline "${created.name}" criado.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar pipeline.");
      }
    },
    [queryClient],
  );

  const handleSetDefault = useCallback(async () => {
    if (!pipelineId) return;
    try {
      const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Falha ao definir pipeline padrão.");
      }
      await queryClient.invalidateQueries({ queryKey: ["pipelines-v2"] });
      toast.success("Pipeline definido como padrão.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao definir pipeline padrão.");
    }
  }, [pipelineId, queryClient]);

  // Apagar pipeline (soft-archive) — ADMIN only. Guarda client-side de
  // "último pipeline" espelha a validação 409 do backend, evitando um round
  // trip óbvio; o backend segue sendo a fonte da verdade (defesa em
  // profundidade caso a lista local esteja desatualizada).
  const canArchiveCurrentPipeline = (pipelines?.length ?? 0) > 1;

  const handleArchivePipeline = useCallback(
    async (password: string) => {
      if (!pipelineId) return;
      setArchiveBusy(true);
      try {
        await archivePipeline(pipelineId, password);
        const remaining = (pipelines ?? []).filter((p) => p.id !== pipelineId);
        setArchiveModalOpen(false);
        setPipelineId(remaining[0]?.id ?? null);
        setStageOrder([]);
        setStageNameOverrides({});
        setStageColorOverrides({});
        setStageAutomationsMap({});
        await queryClient.invalidateQueries({ queryKey: ["pipelines-v2"] });
        toast.success("Pipeline apagado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao apagar pipeline.");
      } finally {
        setArchiveBusy(false);
      }
    },
    [pipelineId, pipelines, queryClient],
  );

  const currentPipelineName = useMemo(
    () => pipelines?.find((p) => p.id === pipelineId)?.name ?? "",
    [pipelines, pipelineId],
  );

  return (
    <>
      <div
        ref={boardWrapperRef}
        className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden"
      >
          <PipelineHeader
            hideActions
            back={SETTINGS_HUB_BACK}
            pipelineNameSlot={
              <PipelineSwitcher
                selectedId={pipelineId}
                onChange={(id) => {
                  setPipelineId(id);
                  setStageOrder([]);
                  setStageNameOverrides({});
                  setStageColorOverrides({});
                  setStageAutomationsMap({});
                }}
              />
            }
            tabsOverride={
              <PipelineSettingsTabs
                onNewPipeline={() => setNewPipelineOpen(true)}
                onSetDefault={handleSetDefault}
                onSave={handleSaveAll}
                hasChanges={hasChanges}
                saving={saving}
                onDeletePipeline={() => setArchiveModalOpen(true)}
                canDelete={canDeletePipeline}
                deleteDisabled={!pipelineId || !canArchiveCurrentPipeline}
              />
            }
          />

          {/* Board de estágios */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={boardRef}
            className="kanban-board-hscroll flex min-w-0 flex-1 gap-3.5 pb-1"
          >
            {stages.length > 0 ? (
              stages.map((stage, idx) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  pipelineId={pipelineId}
                  isFirst={idx === 0}
                  isLast={idx === stages.length - 1 || isTerminalStage(stages[idx + 1])}
                  isDragOver={dragOverId === stage.id}
                  allStages={stages}
                  onAddAutomation={handleAddAutomation}
                  onCopyAutomation={handleCopyAutomation}
                  onEditAutomation={handleEditAutomation}
                  onDeleteAutomation={handleDeleteAutomation}
                  onMoveForward={handleMoveForward}
                  onMoveBackward={handleMoveBackward}
                  onRename={setRenamingStageId}
                  onChangeColor={handleChangeColor}
                  onDelete={setDeletingStageId}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))
            ) : (
              <EmptyStages canFetch={canFetch} />
            )}

            {/* Botão de adicionar nova etapa */}
            <div className="flex w-[280px] shrink-0 items-start pt-0.5">
              <button
                type="button"
                onClick={() => setAddStageOpen(true)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--glass-border)] bg-transparent px-4 py-3.5 font-display text-[13px] font-semibold text-[var(--text-muted)] transition-all hover:border-[var(--brand-primary)]/50 hover:bg-[var(--brand-primary)]/5 hover:text-[var(--brand-primary)]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current">
                  <IconPlus size={13} />
                </span>
                Nova etapa
              </button>
            </div>
          </div>
          <ScrollMap boardRef={boardRef} columnCount={stages.length + 1} />
          </div>{/* fim relative wrapper */}
        </div>

      <NewPipelineModal
        open={newPipelineOpen}
        onClose={() => setNewPipelineOpen(false)}
        onConfirm={handleNewPipeline}
      />

      <ArchivePipelineModal
        open={archiveModalOpen}
        pipelineName={currentPipelineName}
        busy={archiveBusy}
        onClose={() => setArchiveModalOpen(false)}
        onConfirm={handleArchivePipeline}
      />

      <RenameStageModal
        open={!!renamingStageId}
        initialName={renamingStageCurrentName}
        onClose={() => setRenamingStageId(null)}
        onConfirm={handleRenameConfirm}
      />

      <DeleteStageModal
        open={!!deletingStageId}
        stageName={deletingStageName}
        busy={deletingBusy}
        onClose={() => setDeletingStageId(null)}
        onConfirm={handleConfirmDeleteStage}
      />

      <AddStageModal
        open={addStageOpen}
        onClose={() => setAddStageOpen(false)}
        onConfirm={handleAddStage}
      />

      <AddAutomationDrawer
        open={!!addAutomationStageId}
        stageName={addAutomationStageName}
        stages={stages}
        currentStageId={addAutomationStageId ?? undefined}
        onClose={() => setAddAutomationStageId(null)}
        onConfirm={handleDrawerConfirm}
      />

      {/* Drawer de edição de automação */}
      <AddAutomationDrawer
        open={!!editingAutomation}
        stageName={
          editingAutomation
            ? (stages.find((s) => s.id === editingAutomation.stageId)?.name ?? "")
            : ""
        }
        stages={stages}
        currentStageId={editingAutomation?.stageId ?? undefined}
        initialTargetStageId={editingAutomation?.stageId ?? undefined}
        initialConditions={editingAutomation?.automation.conditions ?? []}
        initialAutomationId={editingAutomation?.automation.id ?? null}
        initialTrigger={
          // Reverter label para value
          Object.entries(STAGE_TRIGGER_LABELS).find(
            ([, label]) => label === editingAutomation?.automation.stageTrigger,
          )?.[0] ?? "STAGE_ENTERED"
        }
        onClose={() => setEditingAutomation(null)}
        onConfirm={handleEditDrawerConfirm}
      />
    </>
  );
}

function EmptyStages({ canFetch }: { canFetch: boolean }) {
  return (
    <div className="grid w-full place-items-center rounded-xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-12 text-center backdrop-blur-md">
      <div>
        <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
          {canFetch ? "Selecione um pipeline" : "Carregando..."}
        </h2>
        <p className="mt-1 max-w-sm font-display text-[12.5px] text-[var(--text-muted)]">
          Pipeline ativo não retornou estágios. Verifique a configuração no painel de administração.
        </p>
      </div>
    </div>
  );
}
