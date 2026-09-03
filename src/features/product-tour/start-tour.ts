"use client";

import { driver, type DriveStep, type PopoverDOM } from "driver.js";
import "driver.js/dist/driver.css";

import { applyBuilderTourStep } from "./builder-tour-bridge";
import { setCreateWizardStep } from "./create-wizard-bridge";
import { setDashboardTourTab } from "./dashboard-tour-bridge";
import { setDistributionTourTab } from "./distribution-tour-bridge";
import { setLogsTourTab } from "./logs-tour-bridge";
import { setMessageModelsTourTab } from "./message-models-tour-bridge";
import {
  setSecurityTourAccess,
  setSecurityTourTab,
} from "./security-tour-bridge";
import { setSettingsTourOpen } from "./settings-tour-bridge";
import { setTabulationsTourView } from "./tabulations-tour-bridge";
import { setTeamTourTab } from "./team-tour-bridge";
import "./product-tour.css";
import { getTour } from "./tour-registry";
import type { PageTour, PageTourCta, PageTourStep } from "./tour-types";

type DriverInstance = ReturnType<typeof driver>;
type Box = { x: number; y: number; width: number; height: number };

const PENDING_TOUR_KEY = "product-tour:pending";

let activeTour: DriverInstance | null = null;
let activeTourDef: PageTour | null = null;

function overlayColor(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--text-primary")
    .trim();
  return raw || "rgb(15 23 42)";
}

function readV2Zoom(): number {
  const root = document.querySelector(".v2-root") as HTMLElement | null;
  if (!root) return 1;
  const parsed = parseFloat(getComputedStyle(root).zoom);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const layout = root.clientWidth;
  const visual = root.getBoundingClientRect().width;
  return layout > 0 ? visual / layout : 1;
}

/** Caixa na viewport. Compensa zoom só em elementos dentro de `.v2-root`. */
function visualBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const asIs = { x: r.x, y: r.y, width: r.width, height: r.height };
  if (el.closest("dialog") || !el.closest(".v2-root")) return asIs;

  const zoom = readV2Zoom();
  const layoutW = el.offsetWidth;
  const reported = layoutW > 0 ? r.width / layoutW : 1;
  const rectIsLayout =
    Math.abs(zoom - 1) > 0.02 && Math.abs(reported - 1) < 0.04;
  if (!rectIsLayout) return asIs;
  return {
    x: r.x * zoom,
    y: r.y * zoom,
    width: r.width * zoom,
    height: r.height * zoom,
  };
}

function overlayHolePath(box: Box, padding: number, radius: number): string {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = box.width + padding * 2;
  const h = box.height + padding * 2;
  const rad = Math.floor(Math.max(Math.min(radius, w / 2, h / 2), 0));
  const x = box.x - padding + rad;
  const y = box.y - padding;
  const innerW = w - rad * 2;
  const innerH = h - rad * 2;
  return `M${vw},0L0,0L0,${vh}L${vw},${vh}L${vw},0Z
    M${x},${y} h${innerW} a${rad},${rad} 0 0 1 ${rad},${rad} v${innerH} a${rad},${rad} 0 0 1 -${rad},${rad} h-${innerW} a${rad},${rad} 0 0 1 -${rad},-${rad} v-${innerH} a${rad},${rad} 0 0 1 ${rad},-${rad} z`;
}

function hugPopover(pop: HTMLElement): void {
  pop.style.bottom = "auto";
  pop.style.right = "auto";
  pop.style.height = "auto";
  pop.style.minHeight = "0";
  pop.style.maxHeight = "none";
}

/**
 * `<dialog showModal>` fica na top-layer; o overlay no body ficaria atrás.
 * Reancora com `position:fixed` pra não virar item do flex do dialog.
 */
function restackTourChrome(): void {
  const dialog = document.querySelector("dialog[open]");
  if (!(dialog instanceof HTMLElement)) return;
  const overlay = document.querySelector(".driver-overlay");
  const pop = document.querySelector(".driver-popover");
  if (overlay && overlay.parentElement !== dialog) dialog.appendChild(overlay);
  if (overlay instanceof SVGElement) {
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.zIndex = "1000000000";
    overlay.setAttribute(
      "viewBox",
      `0 0 ${window.innerWidth} ${window.innerHeight}`,
    );
  }
  if (pop && pop.parentElement !== dialog) dialog.appendChild(pop);
  if (pop instanceof HTMLElement) {
    pop.style.position = "fixed";
    pop.style.zIndex = "1000000001";
  }
}

function snapDriverToElement(el: Element | undefined): void {
  restackTourChrome();
  if (!(el instanceof HTMLElement)) return;
  const box = visualBox(el);
  const svg = document.querySelector(".driver-overlay");
  const path = svg?.querySelector("path");
  if (path) {
    const padding = activeTour?.getConfig().stagePadding ?? 4;
    const radius = activeTour?.getConfig().stageRadius ?? 12;
    path.setAttribute("d", overlayHolePath(box, padding, radius));
  }

  const pop = document.querySelector(".driver-popover") as HTMLElement | null;
  if (!pop) return;

  hugPopover(pop);

  const side = activeTour?.getActiveStep()?.popover?.side ?? "bottom";
  const popW = pop.offsetWidth;
  const popH = pop.offsetHeight;
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = box.x + box.width / 2 - popW / 2;
  let top = box.y + box.height + gap;
  if (side === "top") {
    top = box.y - popH - gap;
  } else if (side === "left") {
    left = box.x - popW - gap;
    top = box.y + box.height / 2 - popH / 2;
  } else if (side === "right") {
    left = box.x + box.width + gap;
    top = box.y + box.height / 2 - popH / 2;
  }

  left = Math.max(gap, Math.min(left, vw - popW - gap));
  top = Math.max(gap, Math.min(top, vh - popH - gap));

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

function isElementPainted(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

/** Primeiro alvo visível; ignora o clone `md:hidden` / `hidden md:block`. */
function queryTourElement(tourId: string, visibleOnly = false): HTMLElement | null {
  const nodes = document.querySelectorAll(`[data-tour="${tourId}"]`);
  let first: HTMLElement | null = null;
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (!first) first = node;
    if (isElementPainted(node)) return node;
  }
  return visibleOnly ? null : first;
}

function isTourTargetVisible(tourId: string): boolean {
  return queryTourElement(tourId, true) != null;
}

/** Modelo de exemplo para passos que dependem de dado/permissão. */
function ensureTourFallback(step: PageTourStep): void {
  if (!step.fallback) return;
  // Um fantasma por vez: remove o do passo anterior para não empilhar
  // modelos na página. Âncoras são sempre elementos reais.
  removeTourFallbacks();
  if (queryTourElement(step.element, true)) return;

  if (step.fallback === "auto-inbound") {
    const anchor = queryTourElement("distribution-kpis", true);
    if (!anchor) return;
    const ghost = document.createElement("div");
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "flex items-center justify-between gap-4 rounded-xl border border-border bg-card py-3 px-4";
    const text = document.createElement("div");
    text.className = "min-w-0";
    const title = document.createElement("p");
    title.className = "font-display text-[14px] font-bold text-foreground";
    title.textContent = "Distribuir cada conversa nova automaticamente";
    const hint = document.createElement("p");
    hint.className = "mt-0.5 font-body text-[12px] text-muted-foreground";
    hint.textContent =
      "Ligado: toda mensagem inbound sem responsável entra na fila de espera.";
    text.append(title, hint);
    const toggle = document.createElement("span");
    toggle.className =
      "relative h-6 w-11 shrink-0 rounded-full border border-primary bg-primary";
    const knob = document.createElement("span");
    knob.className =
      "absolute top-1/2 right-0.5 h-5 w-5 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-sm";
    toggle.append(knob);
    ghost.append(text, toggle);
    anchor.insertAdjacentElement("afterend", ghost);
    return;
  }

  if (step.fallback === "menu-item") {
    const panel = document.querySelector("[role='menu'], [role='listbox']");
    if (!(panel instanceof HTMLElement)) return;
    const ghost = document.createElement("button");
    ghost.type = "button";
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-bold text-muted-foreground";
    ghost.textContent = step.fallbackLabel ?? step.title;
    panel.appendChild(ghost);
    return;
  }

  if (step.fallback === "row-action") {
    const list = queryTourElement("distribution-list", true);
    if (!list) return;
    const ghost = document.createElement("button");
    ghost.type = "button";
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 font-display text-[12px] font-semibold text-primary";
    ghost.textContent = step.fallbackLabel ?? step.title;
    list.appendChild(ghost);
    return;
  }

  if (step.fallback === "header-control") {
    const tabs = queryTourElement("distribution-tabs", true);
    if (!tabs) return;
    const ghost = document.createElement("div");
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground";
    ghost.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>';
    tabs.insertAdjacentElement("beforebegin", ghost);
    return;
  }

  if (step.fallback === "generic") {
    const anchor = step.fallbackAnchor
      ? queryTourElement(step.fallbackAnchor, true)
      : null;
    if (!anchor) return;
    const ghost = document.createElement("div");
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "rounded-xl border border-dashed border-border bg-card px-4 py-3 font-body text-[13px] text-muted-foreground";
    ghost.textContent = step.fallbackLabel ?? step.title;
    anchor.insertAdjacentElement("afterend", ghost);
    return;
  }

  if (step.fallback === "inbox-chat") {
    const anchor = queryTourElement("inbox-list", true);
    if (!anchor) return;
    const ghost = document.createElement("div");
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "flex flex-col gap-3 rounded-xl border border-border bg-card p-4";
    ghost.innerHTML = `
      <div class="flex items-center gap-2 border-b border-border pb-2">
        <div class="size-8 rounded-full bg-primary/10"></div>
        <div class="min-w-0 flex-1">
          <div class="h-3 w-24 rounded bg-muted"></div>
          <div class="mt-1 h-2 w-16 rounded bg-muted/60"></div>
        </div>
        <div class="h-5 w-12 rounded-full bg-muted"></div>
      </div>
      <div class="space-y-2">
        <div class="h-3 w-3/4 rounded bg-muted"></div>
        <div class="h-3 w-1/2 rounded bg-muted"></div>
        <div class="h-3 w-2/3 rounded bg-muted"></div>
      </div>
      <div class="flex items-center gap-2 border-t border-border pt-2">
        <div class="h-8 flex-1 rounded-lg bg-muted"></div>
        <div class="size-8 rounded-lg bg-muted"></div>
      </div>
    `;
    anchor.insertAdjacentElement("afterend", ghost);
    return;
  }

  if (step.fallback === "bwipo-chat-thread") {
    const anchor = queryTourElement(step.fallbackAnchor ?? "bwipo-chat-stage", true);
    if (!anchor) return;
    const ghost = document.createElement("div");
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "pointer-events-none m-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm";
    ghost.innerHTML = `
      <div class="flex items-center gap-2 border-b border-border pb-3">
        <div class="size-8 rounded-full bg-primary/10"></div>
        <div class="min-w-0 flex-1">
          <div class="h-3 w-28 rounded bg-muted"></div>
          <div class="mt-1 h-2 w-16 rounded bg-muted/60"></div>
        </div>
        <div class="size-6 rounded-full bg-muted"></div>
        <div class="size-6 rounded-full bg-muted"></div>
      </div>
      <div class="space-y-2">
        <div class="h-8 w-2/3 rounded-2xl rounded-bl-sm bg-muted"></div>
        <div class="ml-auto h-8 w-1/2 rounded-2xl rounded-br-sm bg-primary/15"></div>
        <div class="h-8 w-3/5 rounded-2xl rounded-bl-sm bg-muted"></div>
      </div>
      <div class="flex items-center gap-2 rounded-2xl border border-border px-3 py-2">
        <div class="size-5 rounded-full bg-muted"></div>
        <div class="h-2.5 w-1/2 rounded bg-muted"></div>
        <div class="ml-auto size-7 rounded-full bg-primary/20"></div>
      </div>
    `;
    anchor.insertAdjacentElement("afterbegin", ghost);
    return;
  }
}

function removeTourFallbacks(): void {
  for (const el of document.querySelectorAll("[data-tour-ghost]")) el.remove();
}

function toDriveSteps(steps: PageTourStep[]): DriveStep[] {
  return steps.map((step, index) => ({
    element: () => queryTourElement(step.element) as Element,
    skipMissingElement: true,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side ?? "bottom",
      align: "center",
      // O Driver rotula o botão como "Concluir" quando os próximos alvos
      // ainda não existem no DOM (fantasmas só nascem no goToStepIndex).
      // Mantém "Próximo" em todos, exceto no último passo real do tour.
      ...(index < steps.length - 1 ? { nextBtnText: "Próximo" } : {}),
    },
  }));
}

function openTourMenu(triggerTourId: string): void {
  const wrap = document.querySelector(`[data-tour="${triggerTourId}"]`);
  const btn = wrap?.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
}

function closeTourMenu(triggerTourId: string): void {
  const wrap = document.querySelector(`[data-tour="${triggerTourId}"]`);
  const btn = wrap?.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (btn && btn.getAttribute("aria-expanded") === "true") btn.click();
}

function prepareStep(step: PageTourStep | undefined): void {
  if (!step) return;
  if (step.wizardStep) setCreateWizardStep(step.wizardStep);
  if (step.distributionTab) setDistributionTourTab(step.distributionTab);
  if (step.logsTab !== undefined) setLogsTourTab(step.logsTab);
  if (step.teamTab !== undefined) setTeamTourTab(step.teamTab);
  if (step.modelsTab !== undefined) setMessageModelsTourTab(step.modelsTab);
  if (step.securityTab !== undefined) setSecurityTourTab(step.securityTab);
  if (step.securityAccess !== undefined) setSecurityTourAccess(step.securityAccess);
  if (step.tabulationsView !== undefined) setTabulationsTourView(step.tabulationsView);
  if (step.dashboardTab !== undefined) setDashboardTourTab(step.dashboardTab);
  // A gaveta de Configurações fecha sem hover; o overlay do Driver rouba
  // o hover, então o tour a mantém aberta até o fim.
  if (step.element.startsWith("settings-")) setSettingsTourOpen(true);
  applyBuilderTourStep({
    openPalette: step.openPalette,
    openPicker: step.openPicker,
    focusTrigger: step.focusTrigger,
  });
}

/** Passos que só existem depois do prepare (menu, paleta, wizard). */
function stepNeedsMountWait(step: PageTourStep): boolean {
  return Boolean(
    step.openMenu ||
      step.openPalette ||
      step.openPicker ||
      step.wizardStep ||
      step.focusTrigger ||
      step.distributionTab ||
      step.teamTab ||
      step.modelsTab ||
      step.securityTab ||
      step.securityAccess ||
      step.tabulationsView ||
      step.dashboardTab,
  );
}

function waitForTourElement(
  tourId: string,
  timeoutMs: number,
): Promise<Element | null> {
  const found = queryTourElement(tourId, true);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const el = queryTourElement(tourId, true);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function goToStepIndex(index: number): Promise<void> {
  const tour = activeTourDef;
  const instance = activeTour;
  if (!tour || !instance) return;
  if (index < 0) return;
  if (index >= tour.steps.length) {
    instance.destroy();
    return;
  }
  const step = tour.steps[index];
  prepareStep(step);
  if (step) {
    const waitMs = step.skipIfMissing
      ? stepNeedsMountWait(step)
        ? 400
        : 0
      : 2500;
    if (waitMs > 0) {
      await waitForTourElement(step.element, waitMs);
    }
    if (step.openPalette || step.openPicker || step.focusTrigger) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 160);
      });
    }
    if (step.fallback) ensureTourFallback(step);
    if (step.skipIfMissing && !isTourTargetVisible(step.element)) {
      const current = instance.getActiveIndex() ?? 0;
      const dir = index >= current ? 1 : -1;
      await goToStepIndex(index + dir);
      return;
    }
  }
  // O Driver.js resolve `element` na inicialização; com callback ele pode
  // capturar o clone escondido (`md:hidden`) antes da troca de aba. Reaponta
  // o alvo visível imediatamente antes de mover.
  const resolved = queryTourElement(step.element);
  if (resolved) {
    const driveStep = instance.getConfig().steps?.[index];
    if (driveStep) driveStep.element = resolved;
  }
  instance.moveTo(index);
  // Abrir o menu DEPOIS de destacar o gatilho: o clique desvia o foco do
  // popover e o Driver.js interpreta como "fechar tour".
  if (step.openMenu) {
    window.setTimeout(() => {
      openTourMenu(step.openMenu!);
      if (step.fallback) ensureTourFallback(step);
    }, 120);
  }
  // Fechar o menu DEPOIS de destacar o passo: o clique no gatilho desvia o
  // foco do popover e o Driver.js fecha o tour.
  if (step.closeMenu) {
    window.setTimeout(() => closeTourMenu(step.closeMenu!), 120);
  }
}

function runCta(cta: PageTourCta): void {
  if (cta.openMenu) openTourMenu(cta.openMenu);
  if (cta.continueTour) {
    const current = activeTour?.getActiveIndex() ?? 0;
    void goToStepIndex(current + 1);
    return;
  }
  if (cta.startTourId && cta.href) {
    queuePageTour(cta.startTourId);
    stopPageTour();
    window.location.assign(cta.href);
  }
}

function injectStepCtas(popover: PopoverDOM, tour: PageTour): void {
  const nav = popover.footerButtons;
  if (!nav) return;
  const idx = activeTour?.getActiveIndex() ?? 0;
  const step = tour.steps[idx];
  const ctas = (tour.ctas ?? []).filter((c) => c.onElement === step?.element);
  for (const extra of nav.querySelectorAll("[data-tour-cta]")) {
    const keep = ctas.some((c) => c.label === extra.textContent);
    if (!keep) extra.remove();
  }
  for (const cta of ctas) {
    if (
      [...nav.querySelectorAll("[data-tour-cta]")].some(
        (el) => el.textContent === cta.label,
      )
    ) {
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.tourCta = "1";
    btn.className = "driver-popover-footer-btn driver-popover-next-btn";
    btn.textContent = cta.label;
    btn.addEventListener("click", () => runCta(cta));
    nav.appendChild(btn);
  }
}

export function queuePageTour(id: string): void {
  try {
    sessionStorage.setItem(PENDING_TOUR_KEY, id);
  } catch {
    /* noop */
  }
}

export function consumeQueuedPageTour(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING_TOUR_KEY);
    if (id) sessionStorage.removeItem(PENDING_TOUR_KEY);
    return id;
  } catch {
    return null;
  }
}

export function peekQueuedPageTour(): string | null {
  try {
    return sessionStorage.getItem(PENDING_TOUR_KEY);
  } catch {
    return null;
  }
}

/** Inicia o tour da página. Só chama a partir de um clique do usuário. */
export function startPageTour(id: string): void {
  const tour = getTour(id);
  if (!tour || typeof document === "undefined") return;

  const steps = toDriveSteps(tour.steps);
  if (steps.length === 0) return;

  prepareStep(tour.steps[0]);

  activeTour?.destroy();
  activeTourDef = tour;
  activeTour = driver({
    steps,
    animate: false,
    smoothScroll: false,
    allowClose: true,
    disableActiveInteraction: true,
    overlayColor: overlayColor(),
    overlayOpacity: 0.42,
    stagePadding: 4,
    stageRadius: 12,
    popoverOffset: 8,
    popoverClass: "bwipo-driver-popover",
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Próximo",
    prevBtnText: "Voltar",
    doneBtnText: "Concluir",
    skipMissingElement: true,
    waitForElement: 2500,
    onPopoverRender: (popover) => {
      hugPopover(popover.wrapper);
      restackTourChrome();
      injectStepCtas(popover, tour);
    },
    onHighlighted: (element) => {
      const snap = () => snapDriverToElement(element);
      requestAnimationFrame(() => {
        snap();
        requestAnimationFrame(snap);
      });
    },
    onNextClick: (_element, _step, { driver: instance, state }) => {
      // Não usar instance.isLastStep(): ele resolve os elementos dos próximos
      // passos e, sem dado/conversa aberta, trata o passo atual como último
      // e destrói o tour antes de o fantasma ser criado no goToStepIndex.
      const next = (state.activeIndex ?? 0) + 1;
      if (next >= tour.steps.length) {
        instance.destroy();
        return;
      }
      void goToStepIndex(next);
    },
    onPrevClick: (_element, _step, { driver: instance, state }) => {
      void goToStepIndex((state.activeIndex ?? 1) - 1);
    },
    onDestroyed: () => {
      applyBuilderTourStep({});
      setSettingsTourOpen(false);
      removeTourFallbacks();
      activeTour = null;
      activeTourDef = null;
    },
  });
  window.setTimeout(() => activeTour?.drive(), 80);
}

export function stopPageTour(): void {
  applyBuilderTourStep({});
  setSettingsTourOpen(false);
  removeTourFallbacks();
  activeTour?.destroy();
  activeTour = null;
  activeTourDef = null;
}
