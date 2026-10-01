"use client";

import * as React from "react";
import {
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFlag,
  IconMessageCircle,
  IconPlayerPlay,
  IconTrophy,
  IconX,
  IconXboxX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Data
───────────────────────────────────────────────────────────────*/

const TRIGGERS = [
  {
    id: "stage_entered",
    label: "Quando criado nesta etapa",
    description: "Executa ao mover ou criar um negócio nesta etapa.",
    icon: <IconFlag size={16} />,
  },
  {
    id: "stage_left",
    label: "Quando sair desta etapa",
    description: "Executa ao mover um negócio para outra etapa.",
    icon: <IconChevronRight size={16} />,
  },
  {
    id: "deal_created",
    label: "Quando negócio for criado",
    description: "Executa apenas na criação do negócio nesta etapa.",
    icon: <IconBolt size={16} />,
  },
  {
    id: "message_received",
    label: "Quando mensagem for recebida",
    description: "Executa ao receber uma mensagem do contato.",
    icon: <IconMessageCircle size={16} />,
  },
  {
    id: "deal_won",
    label: "Quando negócio for ganho",
    description: "Executa ao marcar o negócio como ganho.",
    icon: <IconTrophy size={16} />,
  },
  {
    id: "deal_lost",
    label: "Quando negócio for perdido",
    description: "Executa ao marcar o negócio como perdido.",
    icon: <IconXboxX size={16} />,
  },
];

/* ─────────────────────────────────────────────────────────────
   Variante 1 — Minimalista clean
   Fundo glass-bg-modal puro, separadores finos, seletor dropdown
───────────────────────────────────────────────────────────────*/

function VariantA({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = React.useState("stage_entered");
  const [open, setOpen] = React.useState(false);
  const active = TRIGGERS.find((t) => t.id === selected)!;

  return (
    <div className="flex w-[400px] flex-col rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4">
        <div>
          <h2 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
            Adicionar automação
          </h2>
          <p className="mt-0.5 font-body text-[12px] text-[var(--text-muted)]">
            Estágio: <span className="font-semibold text-[var(--text-secondary)]">Qualificado</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
        >
          <IconX size={15} />
        </button>
      </div>

      <div className="border-t border-[var(--glass-border-subtle)]" />

      {/* Body */}
      <div className="flex flex-col gap-5 px-6 py-5">
        {/* Condição */}
        <div className="flex flex-col gap-2">
          <label className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Para todos os leads com:
          </label>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 self-start rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] px-3 font-display text-[12px] font-semibold text-[var(--brand-primary)] transition-colors hover:border-[var(--brand-primary)] hover:bg-[var(--color-enterprise-bg)]"
          >
            + Adicionar uma condição
          </button>
        </div>

        {/* Trigger — dropdown */}
        <div className="flex flex-col gap-2">
          <label className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Executar
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex h-10 w-full items-center justify-between rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 font-display text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-base)]"
            >
              {active.label}
              <IconChevronDown
                size={15}
                className={cn(
                  "shrink-0 text-[var(--text-muted)] transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>

            {open && (
              <div className="absolute left-0 top-[calc(100%+4px)] z-10 w-full rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow)]">
                {TRIGGERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setSelected(t.id); setOpen(false); }}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors first:rounded-t-[var(--radius-lg)] last:rounded-b-[var(--radius-lg)]",
                      t.id === selected
                        ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                        : "hover:bg-[var(--glass-bg-overlay)]",
                    )}
                  >
                    <span className={cn("font-display text-[13px] font-semibold", t.id === selected ? "text-[var(--brand-primary)]" : "text-[var(--text-primary)]")}>
                      {t.label}
                    </span>
                    <span className="font-body text-[11px] text-[var(--text-muted)]">
                      {t.description}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Extras */}
        <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5">
          <span className="font-body text-[12px] text-[var(--text-secondary)]">
            Aplicar o gatilho a todos os leads já nesta etapa
          </span>
          <div className="h-4 w-8 rounded-full bg-[var(--glass-border)] relative">
            <div className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-[var(--glass-border-subtle)] px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-[var(--radius-md)] px-4 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 font-display text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)] transition-opacity hover:opacity-90"
        >
          <IconCheck size={13} />
          Finalizado
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Variante 2 — Glass hierárquico
   Cards clicáveis de gatilho com ícone + descrição
───────────────────────────────────────────────────────────────*/

function VariantB({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = React.useState("stage_entered");

  return (
    <div className="flex w-[420px] flex-col rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] overflow-hidden">
      {/* Header com fundo enterprise */}
      <div
        className="flex items-start justify-between px-6 pt-5 pb-5"
        style={{ background: "var(--color-enterprise-bg)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary)] shadow-[0_4px_12px_rgba(91,111,245,0.4)]">
            <IconBolt size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
              Nova automação
            </h2>
            <p className="font-body text-[11px] text-[var(--brand-primary)] font-semibold">
              Qualificado
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)] hover:text-white"
        >
          <IconX size={15} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <p className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Escolha o gatilho
          </p>
          <div className="flex flex-col gap-1.5">
            {TRIGGERS.map((t) => {
              const isActive = t.id === selected;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-lg)] border px-3.5 py-2.5 text-left transition-all",
                    isActive
                      ? "border-[var(--brand-primary)] bg-[var(--color-enterprise-bg)] shadow-[0_0_0_3px_rgba(91,111,245,0.12)]"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:border-[var(--brand-primary)]/40 hover:bg-[var(--glass-bg-base)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors",
                      isActive
                        ? "bg-[var(--brand-primary)] text-white"
                        : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
                    )}
                  >
                    {t.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-display text-[12px] font-semibold", isActive ? "text-[var(--brand-primary)]" : "text-[var(--text-primary)]")}>
                      {t.label}
                    </p>
                    <p className="font-body text-[11px] text-[var(--text-muted)]">
                      {t.description}
                    </p>
                  </div>
                  {isActive && (
                    <IconCheck size={14} className="shrink-0 text-[var(--brand-primary)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--glass-border-subtle)] px-6 py-4">
        <button
          type="button"
          className="h-8 rounded-[var(--radius-md)] px-3 font-display text-[11px] font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-enterprise-bg)]"
        >
          + Criar nova automação
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[var(--radius-md)] px-4 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 font-display text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)] transition-opacity hover:opacity-90"
          >
            <IconPlayerPlay size={12} />
            Ativar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Variante 3 — Brand header
   Header com gradiente brand, chips horizontais de gatilho
───────────────────────────────────────────────────────────────*/

function VariantC({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = React.useState("stage_entered");
  const active = TRIGGERS.find((t) => t.id === selected)!;

  return (
    <div className="flex w-[440px] flex-col rounded-[var(--radius-xl)] overflow-hidden border border-[var(--glass-border)] shadow-[var(--glass-shadow-lg)]">
      {/* Header brand */}
      <div
        className="relative flex items-start justify-between px-6 pt-6 pb-5"
        style={{ background: "linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-light) 100%)" }}
      >
        <div>
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">
            Estágio · Qualificado
          </p>
          <h2 className="mt-0.5 font-display text-[17px] font-bold text-white">
            Adicionar automação
          </h2>
          <p className="mt-1 font-body text-[12px] text-white/70">
            {active.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <IconX size={15} />
        </button>
      </div>

      {/* Body — fundo glass-bg-modal */}
      <div className="flex flex-col gap-5 bg-[var(--glass-bg-modal)] px-6 py-5">
        {/* Condição */}
        <div className="flex flex-col gap-2">
          <label className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Para todos os leads com:
          </label>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 self-start rounded-full border border-dashed border-[var(--glass-border)] px-3.5 font-display text-[11.5px] font-semibold text-[var(--brand-primary)] transition-colors hover:border-[var(--brand-primary)] hover:bg-[var(--color-enterprise-bg)]"
          >
            + Adicionar condição
          </button>
        </div>

        {/* Trigger — chips com scroll horizontal */}
        <div className="flex flex-col gap-2">
          <label className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Executar
          </label>
          <div className="flex flex-col gap-1.5">
            {TRIGGERS.map((t) => {
              const isActive = t.id === selected;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius-lg)] px-3 py-2 text-left transition-all",
                    isActive
                      ? "bg-[var(--color-enterprise-bg)]"
                      : "hover:bg-[var(--glass-bg-overlay)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                      isActive
                        ? "bg-[var(--brand-primary)] text-white"
                        : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
                    )}
                  >
                    {t.icon}
                  </div>
                  <span
                    className={cn(
                      "font-display text-[12.5px] font-semibold",
                      isActive ? "text-[var(--brand-primary)]" : "text-[var(--text-primary)]",
                    )}
                  >
                    {t.label}
                  </span>
                  {isActive && (
                    <span className="ml-auto shrink-0 rounded-full bg-[var(--brand-primary)] px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-white">
                      Ativo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5">
          <span className="font-body text-[12px] text-[var(--text-secondary)]">
            Aplicar o gatilho a todos os leads já nesta etapa
          </span>
          <div className="relative h-4 w-8 rounded-full bg-[var(--glass-border)]">
            <div className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 bg-[var(--glass-bg-modal)] border-t border-[var(--glass-border-subtle)] px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-[var(--radius-md)] px-4 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 font-display text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)] transition-opacity hover:opacity-90"
        >
          <IconCheck size={13} />
          Finalizado
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Page — showcase lado a lado
───────────────────────────────────────────────────────────────*/

export default function AutomationModalShowcase() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50/60 p-10">
      <div className="mb-8">
        <h1 className="font-display text-[22px] font-bold text-[var(--text-primary)]">
          Modal de Automação — 3 variantes DS v2
        </h1>
        <p className="mt-1 font-body text-[13px] text-[var(--text-muted)]">
          Clique nas opções de gatilho para ver a interação. Escolha a variante para aplicar em produção.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        {/* Variante A */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] font-display text-[10px] font-bold text-white">A</span>
            <span className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Minimalista clean</span>
          </div>
          <VariantA onClose={() => {}} />
        </div>

        {/* Variante B */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] font-display text-[10px] font-bold text-white">B</span>
            <span className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Glass hierárquico</span>
          </div>
          <VariantB onClose={() => {}} />
        </div>

        {/* Variante C */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] font-display text-[10px] font-bold text-white">C</span>
            <span className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Brand header</span>
          </div>
          <VariantC onClose={() => {}} />
        </div>
      </div>
    </div>
  );
}
