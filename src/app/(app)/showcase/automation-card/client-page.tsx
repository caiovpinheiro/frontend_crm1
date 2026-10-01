"use client";

import * as React from "react";
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconFlag,
  IconMessageCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrophy,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Dados de exemplo
───────────────────────────────────────────────────────────────*/

interface AutomationDemo {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerIcon: React.ReactNode;
  active: boolean;
  runs: number;
  successRate: number;
  accent: "blue" | "purple" | "mint";
}

const DEMO: AutomationDemo = {
  id: "auto-1",
  name: "Boas-vindas novo lead",
  description: "Mensagem automática ao entrar lead via WhatsApp com link para proposta personalizada.",
  trigger: "Quando criado nesta etapa",
  triggerIcon: <IconFlag size={12} />,
  active: true,
  runs: 1240,
  successRate: 94,
  accent: "blue",
};

const ACCENT_COLORS = {
  blue:   { bar: "bg-[var(--brand-primary)]",  icon: "bg-[var(--brand-primary)] text-white" },
  purple: { bar: "bg-[var(--brand-secondary)]", icon: "bg-[var(--brand-secondary)] text-white" },
  mint:   { bar: "bg-[var(--color-success)]",   icon: "bg-[var(--color-success)] text-white" },
};

/* ─────────────────────────────────────────────────────────────
   Toggle de ativar/pausar
───────────────────────────────────────────────────────────────*/
function Toggle({
  active,
  onChange,
  className,
}: {
  active: boolean;
  onChange: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1",
        active ? "bg-[var(--brand-primary)]" : "bg-[rgba(100,120,180,0.25)]",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.15)] transition-transform duration-200",
          active ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Botão de copiar com feedback
───────────────────────────────────────────────────────────────*/
function CopyButton({ onClick }: { onClick: () => void }) {
  const [copied, setCopied] = React.useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Duplicar automação"
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
    >
      {copied ? <IconCheck size={14} className="text-[var(--color-success)]" /> : <IconCopy size={14} />}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Variante A — Compacta horizontal
   Tag de gatilho no topo, nome + descrição no centro,
   ações (toggle, copiar, abrir) agrupadas no rodapé.
   Ideal para colunas estreitas como o pipeline.
───────────────────────────────────────────────────────────────*/
function VariantA({ data }: { data: AutomationDemo }) {
  const [active, setActive] = React.useState(data.active);
  const accent = ACCENT_COLORS[data.accent];

  return (
    <div className="group relative flex w-[280px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow)]">
      {/* Barra de acento */}
      <span className={cn("h-[3px] w-full", accent.bar)} aria-hidden />

      <div className="flex flex-col gap-3 p-4">
        {/* Tag de gatilho */}
        <div className="flex items-center gap-1.5 self-start rounded-full bg-[var(--glass-bg-overlay)] px-2.5 py-1 font-display text-[10.5px] font-bold text-[var(--text-secondary)]">
          <span className="text-[var(--brand-primary)]">{data.triggerIcon}</span>
          {data.trigger}
        </div>

        {/* Ícone + nome + descrição */}
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]", accent.icon)}>
            <IconBolt size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-[13.5px] font-bold text-[var(--text-primary)]">
              {data.name}
            </p>
            <p className="mt-0.5 line-clamp-2 font-body text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              {data.description}
            </p>
          </div>
        </div>
      </div>

      {/* Rodapé de ações */}
      <div className="flex items-center justify-between border-t border-[var(--glass-border-subtle)] px-4 py-2.5">
        {/* Status + toggle */}
        <div className="flex items-center gap-2">
          <Toggle active={active} onChange={() => setActive((v) => !v)} />
          <span className="font-display text-[11px] font-semibold text-[var(--text-muted)]">
            {active ? "Ativa" : "Pausada"}
          </span>
        </div>

        {/* Copiar + Abrir */}
        <div className="flex items-center gap-0.5">
          <CopyButton onClick={() => {}} />
          <a
            href={`/automations/${data.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Abrir automação"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
          >
            <IconExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Variante B — Glass expandido com métricas
   Header com ícone e status pulsante, corpo com descrição e
   métricas inline, rodapé com ações bem espaçadas.
───────────────────────────────────────────────────────────────*/
function VariantB({ data }: { data: AutomationDemo }) {
  const [active, setActive] = React.useState(data.active);
  const accent = ACCENT_COLORS[data.accent];

  return (
    <div className="group relative flex w-[300px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--glass-shadow-lg)]">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        {/* Ícone + nome */}
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)]", accent.icon)}>
            <IconBolt size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
              {data.name}
            </p>
            {/* Status pulsante */}
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", active ? "animate-ping bg-[var(--color-online)]" : "hidden")} />
                <span className={cn("relative h-2 w-2 rounded-full", active ? "bg-[var(--color-online)]" : "bg-[var(--color-offline)]")} />
              </span>
              <span className="font-display text-[11px] font-semibold text-[var(--text-muted)]">
                {active ? "Ativa" : "Pausada"}
              </span>
            </div>
          </div>
        </div>

        {/* Toggle alinhado ao topo */}
        <Toggle active={active} onChange={() => setActive((v) => !v)} className="mt-1" />
      </div>

      {/* Tag de gatilho */}
      <div className="px-5 pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1 font-display text-[10.5px] font-bold text-[var(--text-secondary)]">
          <span className="text-[var(--brand-primary)]">{data.triggerIcon}</span>
          {data.trigger}
        </div>
      </div>

      {/* Descrição */}
      <div className="px-5 pb-4">
        <p className="line-clamp-2 font-body text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          {data.description}
        </p>
      </div>

      {/* Métricas */}
      <div className="mx-5 mb-4 grid grid-cols-2 gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] p-3">
        <div className="flex flex-col">
          <span className="font-display text-[12px] font-bold text-[var(--text-primary)]">
            {data.runs.toLocaleString("pt-BR")}
          </span>
          <span className="font-body text-[10px] uppercase tracking-wider text-[var(--text-muted)]">execuções</span>
        </div>
        <div className="flex flex-col">
          <span className="font-display text-[12px] font-bold text-[var(--color-success-text)]">
            {data.successRate}%
          </span>
          <span className="font-body text-[10px] uppercase tracking-wider text-[var(--text-muted)]">sucesso</span>
        </div>
      </div>

      {/* Rodapé de ações */}
      <div className="flex items-center justify-between border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-5 py-3">
        <div className="flex items-center gap-1">
          <CopyButton onClick={() => {}} />
          <span className="font-body text-[11px] text-[var(--text-muted)]">Duplicar</span>
        </div>

        <a
          href={`/automations/${data.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] font-display text-[12px] font-bold text-[var(--brand-primary)] transition-all duration-150 hover:gap-2"
        >
          Abrir editor
          <IconArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Variante C — Header com gradiente brand
   Faixa superior com gradiente, ações em pill buttons no
   rodapé, toggle com label "ativo/pausado" estendido.
───────────────────────────────────────────────────────────────*/
function VariantC({ data }: { data: AutomationDemo }) {
  const [active, setActive] = React.useState(data.active);

  return (
    <div className="group relative flex w-[300px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] shadow-[var(--glass-shadow)]">

      {/* Header com gradiente brand */}
      <div
        className="relative flex items-start justify-between px-5 pt-5 pb-5"
        style={{ background: "linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-light) 100%)" }}
      >
        {/* Ícone decorativo de fundo */}
        <div className="absolute right-4 top-3 opacity-10" aria-hidden>
          <IconBolt size={52} className="text-white" />
        </div>

        {/* Conteúdo */}
        <div className="flex flex-col gap-1.5">
          {/* Tag de gatilho em branco */}
          <div className="flex items-center gap-1.5 self-start rounded-full bg-white/15 px-2.5 py-1 font-display text-[10.5px] font-bold text-white/90">
            <span>{data.triggerIcon}</span>
            {data.trigger}
          </div>
          <h3 className="font-display text-[15px] font-bold text-white">
            {data.name}
          </h3>
          <p className="line-clamp-2 max-w-[200px] font-body text-[11.5px] leading-relaxed text-white/70">
            {data.description}
          </p>
        </div>

        {/* Toggle no header */}
        <Toggle active={active} onChange={() => setActive((v) => !v)} className="mt-0.5 shrink-0" />
      </div>

      {/* Corpo em glass */}
      <div className="flex flex-col gap-3 bg-[var(--glass-bg-strong)] px-5 py-4 backdrop-blur-md">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            {active && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-online)] opacity-60" />
            )}
            <span className={cn("relative h-2 w-2 rounded-full", active ? "bg-[var(--color-online)]" : "bg-[var(--color-offline)]")} />
          </span>
          <span className="font-display text-[11.5px] font-semibold text-[var(--text-secondary)]">
            {active ? "Ativa · rodando normalmente" : "Pausada · clique para ativar"}
          </span>
        </div>

        {/* Métricas em linha */}
        <div className="flex items-center gap-4 rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-3.5 py-2.5">
          <div className="flex flex-col">
            <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">
              {data.runs.toLocaleString("pt-BR")}
            </span>
            <span className="font-body text-[9.5px] uppercase tracking-wider text-[var(--text-muted)]">execuções</span>
          </div>
          <div className="h-6 w-px bg-[var(--glass-border)]" />
          <div className="flex flex-col">
            <span className="font-display text-[13px] font-bold text-[var(--color-success-text)]">
              {data.successRate}%
            </span>
            <span className="font-body text-[9.5px] uppercase tracking-wider text-[var(--text-muted)]">sucesso</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {active ? (
              <IconPlayerPause size={13} className="text-[var(--text-muted)]" />
            ) : (
              <IconPlayerPlay size={13} className="text-[var(--color-success)]" />
            )}
          </div>
        </div>
      </div>

      {/* Rodapé pill buttons */}
      <div className="flex items-center gap-2 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-strong)] px-5 py-3 backdrop-blur-md">
        {/* Botão duplicar */}
        <button
          type="button"
          onClick={() => {}}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] py-1.5 font-display text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-primary)]/40 hover:text-[var(--brand-primary)]"
        >
          <IconCopy size={13} />
          Duplicar
        </button>

        {/* Botão abrir */}
        <a
          href={`/automations/${data.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--brand-primary)] py-1.5 font-display text-[11.5px] font-bold text-white shadow-[0_4px_12px_rgba(91,111,245,0.30)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)]"
        >
          Abrir
          <IconExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Page — showcase lado a lado com labels e anotações
───────────────────────────────────────────────────────────────*/

const VARIANTS = [
  {
    id: "A",
    label: "Compacta horizontal",
    note: "Ideal para pipeline — colunas estreitas. Ações no rodapé inline.",
    component: VariantA,
  },
  {
    id: "B",
    label: "Glass expandido",
    note: "Para listagens e galeria de automações. Métricas visíveis.",
    component: VariantB,
  },
  {
    id: "C",
    label: "Header brand",
    note: "Destaque visual máximo. Botões pill no rodapé, toggle no header.",
    component: VariantC,
  },
];

export default function AutomationCardShowcase() {
  return (
    <div
      className="min-h-screen p-10"
      style={{
        background:
          "linear-gradient(135deg, var(--color-bg-base) 0%, var(--color-bg-mesh-1) 40%, var(--color-bg-mesh-2) 70%, #dce8f5 100%)",
      }}
    >
      {/* Cabeçalho */}
      <div className="mb-10">
        <p className="mb-1 font-display text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          DS v2 · Componentes
        </p>
        <h1 className="font-display text-[24px] font-bold text-[var(--text-primary)]">
          Card de Automação
        </h1>
        <p className="mt-1 font-body text-[13px] text-[var(--text-secondary)]">
          3 variações — toggle de ativar/pausar, duplicar e abrir editor. Interaja com os componentes abaixo.
        </p>
      </div>

      {/* Variantes lado a lado */}
      <div className="flex flex-wrap items-start gap-10">
        {VARIANTS.map(({ id, label, note, component: Comp }) => (
          <div key={id} className="flex flex-col gap-3">
            {/* Label da variante */}
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] font-display text-[10px] font-bold text-white">
                {id}
              </span>
              <span className="font-display text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {label}
              </span>
            </div>
            <p className="max-w-[300px] font-body text-[11.5px] text-[var(--text-muted)]">{note}</p>

            {/* Card */}
            <Comp data={DEMO} />
          </div>
        ))}
      </div>

      {/* Seção de estado pausado */}
      <div className="mt-14">
        <p className="mb-6 font-display text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Estado pausado — todas as variantes
        </p>
        <div className="flex flex-wrap items-start gap-10">
          <VariantA data={{ ...DEMO, active: false, accent: "purple" }} />
          <VariantB data={{ ...DEMO, active: false, accent: "mint" }} />
          <VariantC data={{ ...DEMO, active: false, accent: "blue" }} />
        </div>
      </div>
    </div>
  );
}
