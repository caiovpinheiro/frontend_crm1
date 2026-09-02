"use client";

import { driver, type DriveStep, type PopoverDOM } from "driver.js";
import "driver.js/dist/driver.css";

import { applyBuilderTourStep } from "./builder-tour-bridge";
import { setCreateWizardStep } from "./create-wizard-bridge";
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

function isTourTargetVisible(tourId: string): boolean {
  const el = document.querySelector(`[data-tour="${tourId}"]`);
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

function toDriveSteps(steps: PageTourStep[]): DriveStep[] {
  return steps.map((step) => ({
    element: `[data-tour="${step.element}"]`,
    skipMissingElement: step.element === "automations-status",
    popover: {
      title: step.title,
      description: step.description,
      side: step.side ?? "bottom",
      align: "center",
    },
  }));
}

function openTourMenu(triggerTourId: string): void {
  const wrap = document.querySelector(`[data-tour="${triggerTourId}"]`);
  const btn = wrap?.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
}

function prepareStep(step: PageTourStep | undefined): void {
  if (!step) return;
  if (step.wizardStep) setCreateWizardStep(step.wizardStep);
  if (step.openMenu) openTourMenu(step.openMenu);
  applyBuilderTourStep({
    openPalette: step.openPalette,
    openPicker: step.openPicker,
    focusTrigger: step.focusTrigger,
  });
}

function waitForSelector(
  selector: string,
  timeoutMs: number,
): Promise<Element | null> {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
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
    await waitForSelector(`[data-tour="${step.element}"]`, 2500);
    if (step.openPalette || step.openPicker || step.focusTrigger) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 160);
      });
    }
    if (step.skipIfMissing && !isTourTargetVisible(step.element)) {
      const current = instance.getActiveIndex() ?? 0;
      const dir = index >= current ? 1 : -1;
      await goToStepIndex(index + dir);
      return;
    }
  }
  instance.moveTo(index);
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
    skipMissingElement: tour.skipMissingElement !== false,
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
      if (instance.isLastStep()) {
        instance.destroy();
        return;
      }
      void goToStepIndex((state.activeIndex ?? 0) + 1);
    },
    onPrevClick: (_element, _step, { driver: instance, state }) => {
      void goToStepIndex((state.activeIndex ?? 1) - 1);
    },
    onDestroyed: () => {
      applyBuilderTourStep({});
      activeTour = null;
      activeTourDef = null;
    },
  });
  window.setTimeout(() => activeTour?.drive(), 80);
}

export function stopPageTour(): void {
  applyBuilderTourStep({});
  activeTour?.destroy();
  activeTour = null;
  activeTourDef = null;
}
