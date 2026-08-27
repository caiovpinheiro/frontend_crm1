"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown as ArrowDown, IconArrowUp as ArrowUp, IconCheck as Check, IconLoader2 as Loader2, IconLock as Lock, IconRotate2 as RotateCcw, IconDeviceFloppy as Save } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { MobileModuleIcon } from "@/components/layout/mobile-module-icon";
import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import {
  MOBILE_LAYOUT_QUERY_KEY,
  useMobileLayout,
} from "@/hooks/use-mobile-layout";
import {
  BOTTOM_NAV_MAX,
  DEFAULT_BOTTOM_NAV,
  DEFAULT_ENABLED,
  MOBILE_MODULES,
  type MobileModuleId,
} from "@/lib/mobile-layout";
import { cn } from "@/lib/utils";

/**
 * Layout Builder do PWA mobile.
 *
 * Estrutura:
 *   - Coluna ESQUERDA: catalogo de modulos (toggle on/off + reorder
 *     dentro do bottom nav).
 *   - Coluna DIREITA: mockup estatico de iPhone com preview LIVE.
 *     Re-renderiza instantaneamente conforme o admin muda toggles.
 *
 * Fluxo de dados:
 *   1. `useMobileLayout()` carrega config remota.
 *   2. Estado local `draft` espelha config; usuario edita.
 *   3. Salvar -> PUT /api/mobile-layout -> invalida cache global.
 *   4. App em outras abas pega versao nova em ate 30s (staleTime).
 *
 * Decisoes UX:
 *   - Sem drag-and-drop pesado (dnd-kit) — usamos botoes ↑↓ que
 *     funcionam perfeitamente em mobile e teclado, sao acessiveis
 *     por padrao e mantem bundle leve. Se o usuario pedir DnD
 *     "real" depois, refatoramos.
 *   - Sem limite fixo de modulos no bottom nav: o admin pode pinar
 *     todo o catalogo habilitado. Se os icones nao couberem na largura
 *     da tela, a barra do app faz scroll horizontal (nao corta itens).
 *   - Inbox e `required` -> toggle bloqueado (cadeado).
 */

type ModuleState = {
  id: MobileModuleId;
  enabled: boolean;
  inBottomNav: boolean;
  bottomNavOrder: number; // -1 quando nao esta no nav
};

export function MobileLayoutClientPage() {
  const { config, isLoading } = useMobileLayout();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ModuleState[]>([]);
  const [saved, setSaved] = useState(false);

  // Sincroniza draft quando config carrega/refetcha. Usamos
  // version como chave: se o admin abre a pagina depois de outro
  // admin ter salvo, pegamos a versao mais nova automaticamente.
  useEffect(() => {
    if (isLoading) return;
    const navOrder = new Map(config.bottomNav.map((id, idx) => [id, idx] as const));
    const enabledSet = new Set(config.enabled);
    setDraft(
      MOBILE_MODULES.map((m) => ({
        id: m.id,
        enabled: enabledSet.has(m.id),
        inBottomNav: navOrder.has(m.id),
        bottomNavOrder: navOrder.get(m.id) ?? -1,
      })),
    );
  }, [config.version, isLoading, config.bottomNav, config.enabled]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      bottomNav: MobileModuleId[];
      enabled: MobileModuleId[];
    }) => {
      const res = await fetch(apiUrl("/api/mobile-layout"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`save_failed_${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MOBILE_LAYOUT_QUERY_KEY });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const bottomNavCount = draft.filter((d) => d.inBottomNav).length;
  const orderedBottomNav = draft
    .filter((d) => d.inBottomNav)
    .sort((a, b) => a.bottomNavOrder - b.bottomNavOrder);

  function toggleEnabled(id: MobileModuleId) {
    const desc = MOBILE_MODULES.find((m) => m.id === id);
    if (desc?.required) return;
    setDraft((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const nextEnabled = !d.enabled;
        return {
          ...d,
          enabled: nextEnabled,
          inBottomNav: nextEnabled ? d.inBottomNav : false,
          bottomNavOrder: nextEnabled ? d.bottomNavOrder : -1,
        };
      }),
    );
  }

  function toggleBottomNav(id: MobileModuleId) {
    setDraft((prev) => {
      const target = prev.find((d) => d.id === id);
      if (!target || !target.enabled) return prev;
      const isAdding = !target.inBottomNav;
      if (isAdding && bottomNavCount >= BOTTOM_NAV_MAX) return prev;

      if (isAdding) {
        const nextOrder = Math.max(0, ...prev.filter((p) => p.inBottomNav).map((p) => p.bottomNavOrder)) + 1;
        return prev.map((d) =>
          d.id === id ? { ...d, inBottomNav: true, bottomNavOrder: nextOrder } : d,
        );
      }
      // Removendo: re-numera os restantes pra ficarem 0..N-1.
      const remaining = prev
        .filter((p) => p.inBottomNav && p.id !== id)
        .sort((a, b) => a.bottomNavOrder - b.bottomNavOrder);
      const orderMap = new Map(remaining.map((p, idx) => [p.id, idx] as const));
      return prev.map((d) =>
        d.id === id
          ? { ...d, inBottomNav: false, bottomNavOrder: -1 }
          : orderMap.has(d.id)
            ? { ...d, bottomNavOrder: orderMap.get(d.id)! }
            : d,
      );
    });
  }

  function moveBottomNav(id: MobileModuleId, dir: -1 | 1) {
    setDraft((prev) => {
      const ordered = prev
        .filter((d) => d.inBottomNav)
        .sort((a, b) => a.bottomNavOrder - b.bottomNavOrder);
      const idx = ordered.findIndex((d) => d.id === id);
      if (idx < 0) return prev;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= ordered.length) return prev;
      const a = ordered[idx];
      const b = ordered[swapIdx];
      return prev.map((d) => {
        if (d.id === a.id) return { ...d, bottomNavOrder: b.bottomNavOrder };
        if (d.id === b.id) return { ...d, bottomNavOrder: a.bottomNavOrder };
        return d;
      });
    });
  }

  function resetDefaults() {
    const navSet = new Set<MobileModuleId>(DEFAULT_BOTTOM_NAV);
    const enabledSet = new Set<MobileModuleId>(DEFAULT_ENABLED);
    setDraft(
      MOBILE_MODULES.map((m) => ({
        id: m.id,
        enabled: enabledSet.has(m.id),
        inBottomNav: navSet.has(m.id),
        bottomNavOrder: navSet.has(m.id) ? DEFAULT_BOTTOM_NAV.indexOf(m.id) : -1,
      })),
    );
  }

  function save() {
    const enabled = draft.filter((d) => d.enabled).map((d) => d.id);
    const bottomNav = orderedBottomNav.map((d) => d.id);
    saveMutation.mutate({ bottomNav, enabled });
  }

  const dirty =
    JSON.stringify({
      e: draft.filter((d) => d.enabled).map((d) => d.id).sort(),
      b: orderedBottomNav.map((d) => d.id),
    }) !==
    JSON.stringify({
      e: [...config.enabled].sort(),
      b: config.bottomNav,
    });

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Título/descrição já vêm do PageHeader do SettingsV2Shell — evita duplicar aqui. */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[1fr_360px]">
        {/* COLUNA ESQUERDA — Catalogo de modulos */}
        <div className="space-y-6">
          {/* Bottom nav editor */}
          <GlassCard variant="overlay" className="min-w-0 p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                  Barra inferior do app
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {bottomNavCount} módulo{bottomNavCount === 1 ? "" : "s"} na barra · role
                  horizontalmente se não couberem todos na tela
                </p>
              </div>
              <ButtonGlass
                type="button"
                variant="icon"
                size="sm"
                onClick={resetDefaults}
                className="gap-1.5 self-start sm:self-auto"
              >
                <RotateCcw className="size-3.5" />
                Restaurar padrão
              </ButtonGlass>
            </div>

            <ol className="space-y-2">
              {orderedBottomNav.map((d, idx) => {
                const desc = MOBILE_MODULES.find((m) => m.id === d.id)!;
                return (
                  <li
                    key={d.id}
                    className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]/40 p-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <MobileModuleIcon name={desc.iconName} className="size-[18px]" strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-bold text-[var(--text-primary)]">{desc.label}</p>
                        <p className="truncate text-[12px] text-[var(--text-muted)]">{desc.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-auto sm:ml-auto">
                      <ButtonGlass
                        type="button"
                        variant="icon"
                        size="icon"
                        onClick={() => moveBottomNav(d.id, -1)}
                        disabled={idx === 0}
                        aria-label={`Mover ${desc.label} para cima`}
                        className="disabled:opacity-30"
                      >
                        <ArrowUp className="size-4" />
                      </ButtonGlass>
                      <ButtonGlass
                        type="button"
                        variant="icon"
                        size="icon"
                        onClick={() => moveBottomNav(d.id, 1)}
                        disabled={idx === orderedBottomNav.length - 1}
                        aria-label={`Mover ${desc.label} para baixo`}
                        className="disabled:opacity-30"
                      >
                        <ArrowDown className="size-4" />
                      </ButtonGlass>
                      {desc.required ? (
                        <span
                          className="touch-target flex items-center justify-center rounded-full text-[var(--color-ink-muted)]"
                          title="Inbox é fixo no app — não pode ser removido."
                        >
                          <Lock className="size-4" />
                        </span>
                      ) : (
                        <ButtonGlass
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => toggleBottomNav(d.id)}
                          aria-label={`Remover ${desc.label} da barra inferior`}
                          className="text-[11px] uppercase tracking-wider"
                        >
                          Tirar
                        </ButtonGlass>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </GlassCard>

          {/* Catalogo completo */}
          <GlassCard variant="overlay" className="min-w-0 p-4 sm:p-6">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Todos os módulos</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Habilite ou esconda módulos do app. Itens habilitados que não estão na barra ficam
                no menu &quot;Mais&quot;.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {draft.map((d) => {
                const desc = MOBILE_MODULES.find((m) => m.id === d.id)!;
                const canPromote = d.enabled && !d.inBottomNav && bottomNavCount < BOTTOM_NAV_MAX;
                return (
                  <div
                    key={d.id}
                    className={cn(
                      "flex min-w-0 items-center gap-3 rounded-2xl border p-3 transition-colors",
                      d.enabled ? "border-border bg-[var(--glass-bg-overlay)]" : "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        d.enabled ? "bg-primary/10 text-primary" : "bg-[var(--glass-bg-strong)] text-[var(--color-ink-muted)]",
                      )}
                    >
                      <MobileModuleIcon name={desc.iconName} className="size-[18px]" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-bold text-[var(--text-primary)]">{desc.label}</p>
                      <p className="truncate text-[12px] text-[var(--text-muted)]">{desc.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => toggleEnabled(d.id)}
                        disabled={desc.required}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                          desc.required
                            ? "cursor-not-allowed bg-[var(--glass-bg-subtle)] text-[var(--color-ink-muted)]"
                            : d.enabled
                              ? "bg-[var(--color-success-subtle)] text-emerald-700 hover:bg-[var(--color-success-subtle)]"
                              : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)] hover:bg-slate-300",
                        )}
                      >
                        {desc.required ? "Fixo" : d.enabled ? "Ativo" : "Oculto"}
                      </button>
                      {d.enabled && !d.inBottomNav && (
                        <button
                          type="button"
                          onClick={() => toggleBottomNav(d.id)}
                          disabled={!canPromote}
                          title={!canPromote ? "Limite de módulos do catálogo atingido" : ""}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                            canPromote
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "cursor-not-allowed bg-[var(--glass-bg-subtle)] text-[var(--color-ink-muted)]",
                          )}
                        >
                          Pôr no menu
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Save bar (sticky) */}
          <GlassCard
            variant="overlay"
            className="sticky bottom-4 z-10 flex min-w-0 flex-wrap items-center justify-end gap-3 rounded-2xl p-4 backdrop-blur"
          >
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-success)]">
                <Check className="size-4" />
                Salvo
              </span>
            )}
            {dirty && !saved && (
              <span className="text-sm text-[var(--color-warning)]">Você tem alterações não salvas.</span>
            )}
            <ButtonGlass
              type="button"
              variant="primary"
              onClick={save}
              disabled={!dirty || saveMutation.isPending}
              className="h-11 gap-2 px-6"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Salvar layout
            </ButtonGlass>
          </GlassCard>
        </div>

        {/* COLUNA DIREITA — Mockup iPhone */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <IPhoneMockup
            bottomNav={orderedBottomNav.map((d) => d.id)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Mockup ESTATICO de iPhone (notch + bezels) com preview live da
 * bottom nav. Nao tenta ser pixel-perfect com o real iPhone — e
 * uma representacao visual pra dar contexto da tela. Conteudo
 * interno e um placeholder generico ("Inbox") + a bottom nav real
 * renderizada com o estado atual do draft.
 */
function IPhoneMockup({ bottomNav }: { bottomNav: MobileModuleId[] }) {
  const items = bottomNav
    .map((id) => MOBILE_MODULES.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--color-ink-muted)]">
        Pré-visualização ao vivo
      </p>
      <div
        className="relative aspect-[9/19.5] w-full max-w-[320px] rounded-full border-[10px] border-slate-900 bg-slate-900 shadow-[var(--glass-shadow)]"
      >
        {/* Tela */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl bg-[var(--color-primary-soft)]">
          {/* Notch */}
          <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
          {/* Top bar (status bar imitada) */}
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 pt-2 text-[10px] font-bold text-[var(--text-primary)]">
            <span>9:41</span>
            <span>•••</span>
          </div>
          {/* Mobile top bar do app */}
          <div className="absolute left-0 right-0 top-7 flex items-center justify-between bg-sidebar border-b border-sidebar-border px-4 py-3 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-[var(--glass-bg-overlay)]">
                <span className="text-[12px] font-bold text-primary">B</span>
              </span>
              <span className="font-display text-[13px] font-extrabold tracking-tight text-white">
                Inbox
              </span>
            </div>
            <span className="size-7 rounded-full bg-[var(--glass-bg-overlay)]/20" />
          </div>
          {/* Conteudo placeholder */}
          <div className="absolute left-0 right-0 top-[78px] bottom-[64px] space-y-2 overflow-hidden px-3 py-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl bg-[var(--glass-bg-overlay)] p-2 shadow-sm">
                <span className="size-8 shrink-0 rounded-full bg-[var(--glass-bg-strong)]" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="h-2 w-2/3 rounded-full bg-[var(--glass-bg-strong)]" />
                  <div className="h-2 w-full rounded-full bg-[var(--glass-bg-subtle)]" />
                </div>
              </div>
            ))}
          </div>
          {/* Bottom nav LIVE */}
          <div className="absolute bottom-0 left-0 right-0 flex items-stretch border-t border-sidebar-border bg-sidebar px-1 pb-2 pt-1.5">
            {items.length === 0 ? (
              <div className="flex-1 py-3 text-center text-[10px] text-sidebar-muted">
                Nenhum módulo na barra
              </div>
            ) : (
              items.map((m, idx) => (
                <div
                  key={m.id}
                  className={cn(
                    "relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5",
                    idx === 0 ? "text-white" : "text-sidebar-muted",
                  )}
                >
                  <MobileModuleIcon
                    name={m.iconName}
                    className={cn("size-4", idx === 0 && "scale-110")}
                    strokeWidth={idx === 0 ? 2.5 : 2}
                  />
                  <span className="text-[8px] font-semibold tracking-tight">{m.label}</span>
                  {idx === 0 && (
                    <span className="absolute -top-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[var(--glass-bg-overlay)]" />
                  )}
                </div>
              ))
            )}
            <div className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-sidebar-muted">
              <span className="flex h-4 items-center text-[14px] font-bold">···</span>
              <span className="text-[8px] font-semibold tracking-tight">Mais</span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-[var(--color-ink-muted)]">
        Mudanças aparecem para os operadores em até 30s.
      </p>
    </div>
  );
}
