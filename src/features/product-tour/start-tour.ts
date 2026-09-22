"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

import { applyKeepsTourStep } from "./keeps-tour-bridge";
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

/** Caixa na viewport. Compensa só quando o rect ainda está em px de layout. */
function visualBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const root = document.querySelector(".v2-root") as HTMLElement | null;
  // Portal (menu de ações) sai do `.v2-root`: o rect já está em px de viewport.
  if (!root || !root.contains(el)) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  const zoom = readV2Zoom();
  const layoutW = el.offsetWidth;
  const reported = layoutW > 0 ? r.width / layoutW : 1;
  const rectIsLayout =
    Math.abs(zoom - 1) > 0.02 && Math.abs(reported - 1) < 0.04;
  if (!rectIsLayout) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
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

function snapDriverToElement(el: Element | undefined): void {
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

  const side = activeTour?.getActiveStep()?.popover?.side ?? "bottom";
  const popW = pop.offsetWidth;
  const popH = pop.offsetHeight;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const large = box.height > vh * 0.42;

  let left = box.x + box.width / 2 - popW / 2;
  let top = box.y + box.height + margin;

  if (large) {
    left = box.x + box.width / 2 - popW / 2;
    top = vh - popH - margin;
  } else if (side === "left") {
    left = box.x - popW - margin;
    top = box.y + box.height / 2 - popH / 2;
  } else if (side === "right") {
    left = box.x + box.width + margin;
    top = box.y + box.height / 2 - popH / 2;
  } else if (side === "top") {
    left = box.x + box.width / 2 - popW / 2;
    top = box.y - popH - margin;
  }

  left = Math.max(margin, Math.min(left, vw - popW - margin));
  top = Math.max(margin, Math.min(top, vh - popH - margin));

  pop.style.left = `${left}px`;
  pop.style.right = "auto";
  pop.style.top = `${top}px`;

  const arrow = pop.querySelector(".driver-popover-arrow") as HTMLElement | null;
  if (arrow) arrow.style.display = large || side === "left" || side === "right" ? "none" : "";
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

function ensureTourFallback(step: PageTourStep): void {
  if (!step.fallback) return;
  removeTourFallbacks();
  if (queryTourElement(step.element, true)) return;

  if (step.fallback === "menu-item") {
    if (document.querySelector(`[data-tour="${step.element}"]:not([data-tour-ghost])`)) {
      return;
    }
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

  if (step.fallback === "keeps-card") {
    const anchor =
      (step.fallbackAnchor ? queryTourElement(step.fallbackAnchor, true) : null) ??
      queryTourElement("keeps-board", true) ??
      queryTourElement("keeps-composer", true);
    if (!anchor) return;
    const ghost = document.createElement("article");
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "keep-note-card mt-3 w-[min(100%,18rem)] rounded-xl border border-border bg-card p-4 text-left shadow-none";
    const title = document.createElement("h3");
    title.className = "mb-1.5 text-sm font-semibold leading-snug text-foreground";
    title.textContent = "Script de preço";
    const body = document.createElement("p");
    body.className = "text-sm leading-relaxed text-muted-foreground";
    body.textContent =
      "A mensalidade deste curso é de R$ 249. Posso enviar o plano de pagamento.";
    ghost.append(title, body);
    anchor.insertAdjacentElement("afterend", ghost);
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
      </div>
      <div class="space-y-2">
        <div class="h-8 w-2/3 rounded-2xl rounded-bl-sm bg-muted"></div>
        <div class="ml-auto h-8 w-1/2 rounded-2xl rounded-br-sm bg-primary/15"></div>
      </div>
    `;
    anchor.insertAdjacentElement("afterbegin", ghost);
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
      </div>
    `;
    anchor.insertAdjacentElement("afterend", ghost);
    return;
  }

  if (step.fallback === "keeps-peek") {
    const anchor =
      (step.fallbackAnchor ? queryTourElement(step.fallbackAnchor, true) : null) ??
      queryTourElement("pipeline-chat-tabs", true) ??
      queryTourElement("inbox-chat-tabs", true) ??
      queryTourElement("pipeline-kanban", true) ??
      queryTourElement("inbox-list", true);
    if (!anchor) return;
    const ghost = document.createElement("div");
    ghost.dataset.tour = step.element;
    ghost.dataset.tourGhost = "1";
    ghost.className =
      "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm";
    ghost.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="h-9 flex-1 rounded-full bg-muted"></div>
        <div class="h-9 w-36 rounded-full bg-muted"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-border p-3">
          <div class="h-3 w-24 rounded bg-muted"></div>
          <div class="mt-2 h-2 w-full rounded bg-muted/70"></div>
        </div>
        <div class="rounded-xl border border-border p-3">
          <div class="h-3 w-20 rounded bg-muted"></div>
          <div class="mt-2 h-2 w-full rounded bg-muted/70"></div>
        </div>
      </div>
    `;
    anchor.insertAdjacentElement("afterend", ghost);
  }
}

function removeTourFallbacks(): void {
  for (const el of document.querySelectorAll("[data-tour-ghost]")) el.remove();
}

function toDriveSteps(steps: PageTourStep[]): DriveStep[] {
  return steps.map((step) => ({
    element: () => queryTourElement(step.element) as Element,
    skipMissingElement: true,
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

function closeTourMenu(triggerTourId: string): void {
  const wrap = document.querySelector(`[data-tour="${triggerTourId}"]`);
  const btn = wrap?.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (btn && btn.getAttribute("aria-expanded") === "true") btn.click();
}

function prepareStep(step: PageTourStep | undefined): void {
  if (!step) return;
  applyKeepsTourStep(step);
}

function stepNeedsMountWait(step: PageTourStep): boolean {
  return Boolean(
    step.openMenu ||
      step.keepsFolder ||
      step.keepsView ||
      step.keepsComposer ||
      step.keepsChatTab ||
      step.keepsScene,
  );
}

function waitForTourElement(tourId: string, timeoutMs: number): Promise<Element | null> {
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
  if (step?.openMenu) openTourMenu(step.openMenu);
  if (step) {
    const waitMs = step.skipIfMissing
      ? stepNeedsMountWait(step)
        ? 400
        : 0
      : 2500;
    if (waitMs > 0) {
      await waitForTourElement(step.element, waitMs);
    }
    if (step.fallback) ensureTourFallback(step);
    if (step.skipIfMissing && !isTourTargetVisible(step.element)) {
      const current = instance.getActiveIndex() ?? 0;
      const dir = index >= current ? 1 : -1;
      await goToStepIndex(index + dir);
      return;
    }
  }
  const resolved = queryTourElement(step.element, true) ?? queryTourElement(step.element);
  if (resolved) {
    const driveStep = instance.getConfig().steps?.[index];
    if (driveStep) driveStep.element = resolved;
  }
  instance.moveTo(index);
  if (step.openMenu) {
    window.setTimeout(() => {
      openTourMenu(step.openMenu!);
      if (step.fallback) ensureTourFallback(step);
    }, 120);
  }
  if (step.closeMenu) {
    window.setTimeout(() => closeTourMenu(step.closeMenu!), 120);
  }
}

function runCta(cta: PageTourCta): void {
  if (cta.startTourId && cta.href) {
    queuePageTour(cta.startTourId);
    stopPageTour();
    window.location.assign(cta.href);
  }
}

function injectTourCtas(tour: PageTour, index: number): void {
  for (const el of document.querySelectorAll("[data-tour-cta]")) el.remove();
  const step = tour.steps[index];
  if (!step) return;
  const ctas = (tour.ctas ?? []).filter((cta) => cta.onElement === step.element);
  if (ctas.length === 0) return;
  const footer = document.querySelector(".driver-popover-footer");
  if (!(footer instanceof HTMLElement) || !footer.parentElement) return;
  const wrap = document.createElement("div");
  wrap.dataset.tourCta = "1";
  wrap.style.cssText =
    "display:flex;flex-direction:column;gap:6px;width:100%;margin:0 0 8px;";
  for (const cta of ctas) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = cta.label;
    btn.style.cssText =
      "width:100%;border-radius:999px;border:1px solid var(--border);background:var(--card);padding:8px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runCta(cta);
    });
    wrap.appendChild(btn);
  }
  footer.parentElement.insertBefore(wrap, footer);
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
    onPopoverRender: () => {
      injectTourCtas(tour, activeTour?.getActiveIndex() ?? 0);
      snapDriverToElement(activeTour?.getActiveElement() ?? undefined);
    },
    onHighlighted: (element) => {
      const snap = () => snapDriverToElement(element);
      requestAnimationFrame(() => {
        snap();
        requestAnimationFrame(snap);
      });
    },
    onNextClick: (_element, _step, { driver: instance, state }) => {
      const next = (state.activeIndex ?? 0) + 1;
      if (next >= tour.steps.length) {
        instance.destroy();
        return;
      }
      void goToStepIndex(next);
    },
    onPrevClick: (_element, _step, { state }) => {
      void goToStepIndex((state.activeIndex ?? 1) - 1);
    },
    onDestroyed: () => {
      applyKeepsTourStep({});
      removeTourFallbacks();
      for (const el of document.querySelectorAll("[data-tour-cta]")) el.remove();
      activeTour = null;
      activeTourDef = null;
    },
  });
  window.setTimeout(() => activeTour?.drive(), 80);
}

export function stopPageTour(): void {
  applyKeepsTourStep({});
  removeTourFallbacks();
  for (const el of document.querySelectorAll("[data-tour-cta]")) el.remove();
  activeTour?.destroy();
  activeTour = null;
  activeTourDef = null;
}
