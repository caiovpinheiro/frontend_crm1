"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconChartBar as BarChart3,
  IconCircleCheck,
  IconExternalLink,
  IconLayoutGrid as LayoutGrid,
  IconLoader2 as Loader2,
  IconPhone as Phone,
  IconPlus as Plus,
  IconPuzzle as Puzzle,
  IconRobot as Bot,
  IconCalendar as Calendar,
  IconSettings as SettingsIcon,
  IconTrash as Trash2,
  IconWebhook as Webhook,
} from "@tabler/icons-react";
import type { Icon as LucideIcon } from "@tabler/icons-react";

import { toast } from "sonner";

import { DistributionIcon } from "@/components/icons/distribution-icon";
import { cn } from "@/lib/utils";
import {
  useDistributionSettings,
  useUpdateDistributionSettings,
} from "@/features/distribution/hooks";

import type { WidgetDto } from "@/features/widgets/types";

/** Mapeia chave de icone (widgets INTERNAL) para componente lucide.
 *  Widgets PARTNER usam `icon` como URL de imagem — vide `WidgetIcon`. */
const ICON_BY_KEY: Record<string, LucideIcon> = {
  route: DistributionIcon,
  bot: Bot,
  phone: Phone,
  calendar: Calendar,
  report: BarChart3,
  webhook: Webhook,
};

function WidgetIcon({ widget, className }: { widget: WidgetDto; className?: string }) {
  const [imgError, setImgError] = useState(false);
  // PARTNER: `icon` eh URL de imagem (http/https). Se a URL falhar
  // (404, CORS, content-type errado, parceiro fora do ar), caimos no
  // Puzzle pra nao quebrar o layout do card. `referrerPolicy=no-referrer`
  // impede que o parceiro saiba a origem do CRM (privacidade do tenant).
  if (widget.ownerType === "PARTNER") {
    const looksLikeUrl = /^https?:\/\//i.test(widget.icon);
    if (looksLikeUrl && !imgError) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          src={widget.icon}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgError(true)}
          className={cn("object-contain", className)}
        />
      );
    }
    return <Puzzle className={className} />;
  }
  const Cmp = ICON_BY_KEY[widget.icon] ?? LayoutGrid;
  return <Cmp className={className} />;
}

/** Rota interna pra widgets INTERNAL — quando o slug nao esta no mapa,
 *  cai na rota generica `/widgets/[slug]` (que sabe redirecionar). */
const INTERNAL_ROUTE_BY_SLUG: Record<string, string> = {
  smart_distribution: "/widgets/distribution",
  calls_history: "/widgets/calls",
};

const CALLS_CARD_COPY = {
  name: "Ligações",
  category: "Comunicação",
  description: "Softphone SIP, histórico de chamadas e discagem nos cards do pipeline.",
  features: [
    "Softphone integrado (Api4Com / SIP)",
    "Histórico de chamadas",
    "Discagem nos cards do pipeline",
    "Gravações automáticas via webhook",
  ],
};

interface WidgetCardProps {
  widget: WidgetDto;
  canManage: boolean;
  pending: boolean;
  /** True quando existe painel de config para o slug no registry E o
   *  usuário tem a permissão necessária. Controla a exibição do botão
   *  "Configurar" no rodapé do card. */
  canConfigure?: boolean;
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
  /** Handler acionado pelo botão "Configurar". Recebe o slug e é
   *  responsável por abrir o drawer de config na Central. */
  onConfigure?: (slug: string) => void;
}

/**
 * WidgetCard — visual "Widget Marketplace" (ref. mockup):
 *  - card branco, cantos pouco arredondados, borda sutil, formato vertical
 *  - topo: tile do ícone (borda + fundo claro) | badge DISPONÍVEL / ● Instalado
 *  - categoria caps → título bold → descrição muted
 *  - features com check circular verde
 *  - rodapé: instalado = "Abrir" outline + lixeira quadrada;
 *    disponível = "+ Instalar" sólido azul full-width
 */
export function WidgetCard({
  widget,
  canManage,
  pending,
  canConfigure = false,
  onInstall,
  onUninstall,
  onConfigure,
}: WidgetCardProps) {
  const installed = widget.installed;
  const comingSoon = widget.availability === "coming_soon";
  const disabled = Boolean(widget.disabled);

  const openHref =
    widget.ownerType === "PARTNER"
      ? `/widgets/${widget.slug}`
      : INTERNAL_ROUTE_BY_SLUG[widget.slug] ?? `/widgets/${widget.slug}`;

  const isCalls = widget.slug === "calls_history";
  const name = isCalls ? CALLS_CARD_COPY.name : widget.name;
  const category = isCalls ? CALLS_CARD_COPY.category : widget.category;
  const description = isCalls ? CALLS_CARD_COPY.description : widget.description;
  const features = isCalls ? CALLS_CARD_COPY.features : widget.features;

  const solidBtn =
    "inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#2563eb] px-4 py-2.5 font-display text-[13px] font-bold text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50";

  const outlineBtn =
    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2.5 font-display text-[13px] font-bold text-[#2563eb] transition-colors hover:border-[#2563eb] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50";

  const trashBtn =
    "flex size-[42px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-[var(--color-danger-text)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:cursor-not-allowed disabled:opacity-50";

  const configBtn =
    "flex size-[42px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-[#2563eb] hover:bg-blue-50 hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <article className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-[box-shadow,border-color] duration-150 hover:border-slate-300 hover:shadow-md">
      {/* Topo: tile do ícone + badge de status (e parceiro) */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#2e3b6e]">
          <WidgetIcon widget={widget} className="size-6" />
        </span>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge installed={installed} comingSoon={comingSoon} disabled={disabled} />
          {widget.slug === "smart_distribution" && installed && !disabled && canManage && (
            <DistributionPowerButton />
          )}
          {widget.ownerType === "PARTNER" && widget.partnerName && (
            <span className="font-display text-[9px] font-bold uppercase tracking-[0.6px] text-slate-400">
              Parceiro: {widget.partnerName}
            </span>
          )}
        </div>
      </div>

      {/* Categoria + título */}
      <div className="px-5 pt-4">
        <p className="font-display text-[10px] font-bold uppercase tracking-[1.2px] text-slate-400">
          {category}
        </p>
        <h3 className="mt-1 min-w-0 break-words font-display text-[17px] font-bold tracking-[-0.2px] text-slate-900">
          {name}
        </h3>
      </div>

      <p className="min-w-0 break-words text-pretty px-5 pt-2 font-body text-[12.5px] leading-[1.6] text-slate-500">
        {description}
      </p>

      {/* Recursos — check circular verde */}
      {features.length > 0 && (
        <ul className="flex flex-col gap-2 px-5 pt-4">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-2 font-body text-[12px] text-slate-700"
            >
              <IconCircleCheck className="size-[16px] shrink-0 text-emerald-500" strokeWidth={2} />
              <span className="min-w-0">{feature}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Rodapé: ação primária + excluir */}
      <div className="mt-auto px-5 pb-5 pt-5">
        {disabled && widget.disabledReason && (
          <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
            {widget.disabledReason}
          </div>
        )}

        <div className="flex items-center gap-2">
          {comingSoon ? (
            <button
              type="button"
              disabled
              className="inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 font-display text-[13px] font-bold text-slate-400"
            >
              Em breve
            </button>
          ) : installed ? (
            <>
              {!disabled && (
                <Link href={openHref} className={outlineBtn}>
                  <IconExternalLink className="size-4" strokeWidth={2.2} />
                  Abrir
                </Link>
              )}
              {!disabled && canConfigure && onConfigure && (
                <button
                  type="button"
                  onClick={() => onConfigure(widget.slug)}
                  aria-label={`Configurar ${widget.name}`}
                  title="Configurar"
                  className={configBtn}
                >
                  <SettingsIcon className="size-4" strokeWidth={2.2} />
                </button>
              )}
              <button
                type="button"
                disabled={!canManage || pending}
                onClick={() => onUninstall(widget.slug)}
                aria-label={`Remover ${widget.name}`}
                title="Remover"
                className={cn(trashBtn, disabled && "w-auto flex-1 gap-1.5")}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {disabled && <span className="font-display text-[13px] font-bold">Remover</span>}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!canManage || pending}
              onClick={() => onInstall(widget.slug)}
              className={solidBtn}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" strokeWidth={2.5} />
              )}
              Instalar
            </button>
          )}
        </div>

        {!canManage && !comingSoon && (
          <p className="mt-2 text-center font-body text-[11px] text-slate-400">
            Apenas administradores podem gerenciar widgets.
          </p>
        )}
      </div>
    </article>
  );
}

function DistributionPowerButton() {
  const settingsQuery = useDistributionSettings();
  const updateSettings = useUpdateDistributionSettings();
  const enabled = settingsQuery.data?.enabled ?? true;
  const busy = updateSettings.isPending || settingsQuery.isLoading;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        updateSettings.mutate(
          { enabled: !enabled },
          {
            onSuccess: (data) =>
              toast.success(data.enabled ? "Distribuição ligada." : "Distribuição desligada."),
            onError: (e) =>
              toast.error(e instanceof Error ? e.message : "Erro ao salvar configuração."),
          },
        );
      }}
      title={enabled ? "Desligar distribuição" : "Ligar distribuição"}
      aria-pressed={enabled}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 font-display text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        enabled
          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
      )}
    >
      {enabled ? "Desligar" : "Ligar"}
    </button>
  );
}

function StatusBadge({
  installed,
  comingSoon,
  disabled,
}: {
  installed: boolean;
  comingSoon: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-danger-bg)] px-2.5 py-1 font-display text-[10px] font-bold text-[var(--color-danger-text)]">
        <span className="size-1.5 rounded-full bg-[var(--color-danger-text)]" />
        Indisponível
      </span>
    );
  }
  if (comingSoon) {
    return (
      <span className="inline-flex shrink-0 items-center rounded border border-slate-200 bg-white px-2.5 py-1 font-display text-[9px] font-bold uppercase tracking-[0.8px] text-slate-400">
        Em breve
      </span>
    );
  }
  if (installed) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-display text-[10px] font-bold text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Instalado
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-slate-200 bg-white px-2.5 py-1 font-display text-[9px] font-bold uppercase tracking-[0.8px] text-slate-400">
      Disponível
    </span>
  );
}
