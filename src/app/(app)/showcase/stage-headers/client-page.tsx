"use client";

import { useState } from "react";
import {
  IconBolt,
  IconDots,
  IconGripVertical,
  IconPlus,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// ─── Dados de exemplo ─────────────────────────────────────────────

const STAGES = [
  { id: "1", name: "Novo lead",    color: "#5b6ff5", automations: 0 },
  { id: "2", name: "Qualificado",  color: "#a78bfa", automations: 2 },
  { id: "3", name: "Proposta",     color: "#f59e0b", automations: 1 },
  { id: "4", name: "Negociação",   color: "#10b981", automations: 3 },
  { id: "5", name: "Fechado",      color: "#ef4444", automations: 0 },
];

// Gera versão mais clara (20% de opacidade) da cor da etapa para backgrounds
function colorBg(hex: string, alpha = 0.12) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Chip de contagem compartilhado ───────────────────────────────

function CountBadge({
  count,
  color,
  variant,
}: {
  count: number;
  color: string;
  variant: "glass" | "color" | "white";
}) {
  if (variant === "color")
    return (
      <span
        className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-display text-[11px] font-bold"
        style={{ background: colorBg(color, 0.2), color }}
      >
        {count}
      </span>
    );
  if (variant === "white")
    return (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 font-display text-[11px] font-bold text-white">
        {count}
      </span>
    );
  return (
    <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-0.5 font-display text-[11px] font-bold text-[var(--text-muted)]">
      {count}
    </span>
  );
}

// ─── Menu placeholder ─────────────────────────────────────────────

function DotsMenu({ light }: { light?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors",
        light
          ? "text-white/70 hover:bg-white/20 hover:text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]",
      )}
    >
      <IconDots size={16} />
    </button>
  );
}

function DragHandle({ light }: { light?: boolean }) {
  return (
    <span
      title="Arrastar"
      className={cn(
        "flex cursor-grab flex-col gap-[3px] active:cursor-grabbing",
        light ? "opacity-60" : "",
      )}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex gap-[3px]">
          <span
            className={cn(
              "h-[3px] w-[3px] rounded-full",
              light ? "bg-white/50" : "bg-[var(--text-muted)]/40",
            )}
          />
          <span
            className={cn(
              "h-[3px] w-[3px] rounded-full",
              light ? "bg-white/50" : "bg-[var(--text-muted)]/40",
            )}
          />
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
//  VARIANTE A — Barra lateral + badge colorido (sutil)
//  Abordagem atual refinada: barra de acento aumentada para 4px,
//  badge do count usa a cor da etapa em vez do glass neutro.
// ─────────────────────────────────────────────────────────────────

function HeaderA({ name, color, automations }: (typeof STAGES)[0]) {
  return (
    <div className="flex items-center justify-between px-1 pb-2.5">
      <div className="flex items-center gap-2.5">
        <DragHandle />
        <span
          className="h-5 w-[4px] rounded-full"
          style={{ background: color }}
        />
        <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
          {name}
        </h3>
        <CountBadge count={automations} color={color} variant="color" />
      </div>
      <DotsMenu />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  VARIANTE B — Indicador dot pulsante + nome com underline colorido
//  O nome da etapa recebe um sublinhado na cor da etapa. O dot à
//  esquerda pulsa levemente para indicar etapa ativa.
// ─────────────────────────────────────────────────────────────────

function HeaderB({ name, color, automations }: (typeof STAGES)[0]) {
  return (
    <div className="flex items-center justify-between px-1 pb-2.5">
      <div className="flex items-center gap-2.5">
        <DragHandle />
        {/* Dot pulsante */}
        <span className="relative flex h-3 w-3 shrink-0">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
            style={{ background: color }}
          />
          <span
            className="relative inline-flex h-3 w-3 rounded-full"
            style={{ background: color }}
          />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--text-primary)] leading-none">
            {name}
          </h3>
          {/* Underline na cor da etapa */}
          <span
            className="h-[2px] w-full rounded-full"
            style={{ background: color }}
          />
        </div>
        <CountBadge count={automations} color={color} variant="color" />
      </div>
      <DotsMenu />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  VARIANTE C — Pill / chip de etapa com background tintado
//  O nome da etapa fica dentro de uma pílula com background na cor
//  da etapa com baixa opacidade, e texto na cor sólida.
// ─────────────────────────────────────────────────────────────────

function HeaderC({ name, color, automations }: (typeof STAGES)[0]) {
  return (
    <div className="flex items-center justify-between px-1 pb-2.5">
      <div className="flex items-center gap-2">
        <DragHandle />
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
          style={{ background: colorBg(color, 0.15), border: `1.5px solid ${colorBg(color, 0.35)}` }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span
            className="font-display text-[13.5px] font-bold"
            style={{ color }}
          >
            {name}
          </span>
        </span>
        <CountBadge count={automations} color={color} variant="color" />
      </div>
      <DotsMenu />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  VARIANTE D — Header com tarja/faixa de cor no topo da coluna
//  A borda superior da coluna recebe uma faixa grossa na cor da
//  etapa. O header fica limpo e minimalista abaixo dela.
// ─────────────────────────────────────────────────────────────────

function HeaderD({ name, color, automations }: (typeof STAGES)[0]) {
  return (
    <>
      {/* Faixa colorida no topo — aplicada antes do padding normal */}
      <div
        className="mb-3 -mx-3.5 -mt-4 h-[5px] w-[calc(100%+28px)] rounded-t-xl"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-2.5">
          <DragHandle />
          <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
            {name}
          </h3>
          <CountBadge count={automations} color={color} variant="color" />
        </div>
        <DotsMenu />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
//  VARIANTE E — Header com gradiente sutil na cor da etapa
//  O bloco de header recebe um background com gradiente tintado
//  que vai da cor da etapa (baixa opacidade) para transparente.
//  Integrado à coluna, sem quebrar o glass da coluna.
// ─────────────────────────────────────────────────────────────────

function HeaderE({ name, color, automations }: (typeof STAGES)[0]) {
  return (
    <div
      className="-mx-3.5 -mt-4 mb-0 rounded-t-xl px-5 pt-4 pb-3"
      style={{
        background: `linear-gradient(180deg, ${colorBg(color, 0.18)} 0%, transparent 100%)`,
        borderBottom: `1.5px solid ${colorBg(color, 0.3)}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <DragHandle />
          <span
            className="h-[18px] w-[3px] rounded-full"
            style={{ background: color }}
          />
          <h3
            className="font-display text-[15px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {name}
          </h3>
          <CountBadge count={automations} color={color} variant="color" />
        </div>
        <DotsMenu />
      </div>
      <p className="mt-1.5 pl-8 font-display text-[11px] font-semibold text-[var(--text-muted)]">
        {automations === 0
          ? "Sem automações"
          : automations === 1
          ? "1 automação"
          : `${automations} automações`}
      </p>
    </div>
  );
}

// ─── Preview de coluna wrapper ─────────────────────────────────────

function StagePreview({
  stage,
  variant,
  label,
  description,
}: {
  stage: (typeof STAGES)[0];
  variant: "A" | "B" | "C" | "D" | "E";
  label: string;
  description: string;
}) {
  const headers = {
    A: <HeaderA {...stage} />,
    B: <HeaderB {...stage} />,
    C: <HeaderC {...stage} />,
    D: <HeaderD {...stage} />,
    E: <HeaderE {...stage} />,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Label da variante */}
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold text-white"
          style={{ background: stage.color }}
        >
          {variant}
        </span>
        <div>
          <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">
            {label}
          </p>
          <p className="font-display text-[11px] text-[var(--text-muted)]">
            {description}
          </p>
        </div>
      </div>

      {/* Coluna simulada */}
      <div className="w-[280px] rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3.5 pb-3 pt-4 shadow-[var(--glass-shadow)] backdrop-blur-md">
        {headers[variant]}

        {/* Subtítulo — somente para variantes que não o integram */}
        {variant !== "E" && (
          <div className="mb-3 border-b border-[var(--glass-border-subtle)] px-1 pb-2.5 font-display text-xs font-semibold text-[var(--text-secondary)]">
            {stage.automations === 0
              ? "Sem automações"
              : stage.automations === 1
              ? "1 automação"
              : `${stage.automations} automações`}
          </div>
        )}

        {/* Cards placeholder */}
        {Array.from({ length: Math.min(stage.automations, 2) }, (_, i) => i).map((i) => (
          <div
            key={i}
            className="mb-2 flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] shadow-[var(--glass-shadow-sm)]"
          >
            <div
              className="flex items-center gap-2 px-3.5 py-2.5"
              style={{
                background: `linear-gradient(135deg, ${stage.color} 0%, ${stage.color}cc 100%)`,
              }}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/20">
                <IconBolt size={12} className="text-white" />
              </div>
              <p className="flex-1 truncate font-display text-[12px] font-bold text-white">
                Automação {i + 1}
              </p>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-[var(--glass-border)] py-2 font-display text-xs font-semibold text-[var(--text-muted)] transition-all hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
        >
          <IconPlus size={13} />
          Adicionar automação
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────

const VARIANTS: {
  id: "A" | "B" | "C" | "D" | "E";
  label: string;
  description: string;
}[] = [
  {
    id: "A",
    label: "Barra + badge colorido",
    description: "Barra de acento 4px com badge do count na cor da etapa",
  },
  {
    id: "B",
    label: "Dot pulsante + underline",
    description: "Indicador animado e sublinhado tipográfico na cor da etapa",
  },
  {
    id: "C",
    label: "Pill tintado",
    description: "Nome dentro de pílula com background na cor da etapa",
  },
  {
    id: "D",
    label: "Faixa no topo",
    description: "Borda superior grossa na cor da etapa, header limpo abaixo",
  },
  {
    id: "E",
    label: "Gradiente de header",
    description: "Background tintado degradê que integra o header à coluna",
  },
];

export default function StageHeadersShowcase() {
  const [selectedStage, setSelectedStage] = useState(STAGES[1]); // Qualificado por padrão

  return (
    <div className="min-h-screen p-10">
      <div className="mx-auto max-w-[1600px]">
        {/* Título */}
        <div className="mb-8">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            Headers de Fase
          </h1>
          <p className="mt-1 font-display text-[14px] text-[var(--text-muted)]">
            5 variações dentro do DS v2 — Glassmorphism + cor de etapa em evidência
          </p>
        </div>

        {/* Seletor de etapa */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="font-display text-[12px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Visualizar com:
          </span>
          {STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedStage(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12.5px] font-semibold transition-all",
                selectedStage.id === s.id
                  ? "border-transparent text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-white/70",
              )}
              style={
                selectedStage.id === s.id
                  ? { background: s.color }
                  : undefined
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </button>
          ))}
        </div>

        {/* Grid das 5 variações */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-5">
          {VARIANTS.map((v) => (
            <StagePreview
              key={v.id}
              stage={selectedStage}
              variant={v.id}
              label={v.label}
              description={v.description}
            />
          ))}
        </div>

        {/* Nota de implementação */}
        <div className="mt-12 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-5 py-4 backdrop-blur-md">
          <p className="font-display text-[12px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Nota
          </p>
          <p className="mt-1 font-display text-[13px] text-[var(--text-secondary)]">
            Todas as variações usam apenas tokens do DS v2 (
            <code className="rounded bg-[var(--glass-bg-overlay)] px-1 py-0.5 font-mono text-[11px]">
              --glass-*
            </code>
            ,{" "}
            <code className="rounded bg-[var(--glass-bg-overlay)] px-1 py-0.5 font-mono text-[11px]">
              --text-*
            </code>
            ,{" "}
            <code className="rounded bg-[var(--glass-bg-overlay)] px-1 py-0.5 font-mono text-[11px]">
              --radius-*
            </code>
            ) mais a cor dinâmica de cada etapa (
            <code className="rounded bg-[var(--glass-bg-overlay)] px-1 py-0.5 font-mono text-[11px]">
              stage.color
            </code>
            ). Nenhuma alteração foi feita no pipeline real.
          </p>
        </div>
      </div>
    </div>
  );
}
