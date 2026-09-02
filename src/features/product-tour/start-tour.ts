"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

import "./product-tour.css";
import { getTour } from "./tour-registry";

type DriverInstance = ReturnType<typeof driver>;
type Box = { x: number; y: number; width: number; height: number };

let activeTour: DriverInstance | null = null;

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
  const popW = pop.offsetWidth;
  const left = Math.max(8, Math.min(box.x + box.width / 2 - popW / 2, window.innerWidth - popW - 8));
  pop.style.left = `${left}px`;
  pop.style.right = "auto";
  pop.style.top = `${box.y + box.height + 8}px`;
}

function toDriveSteps(
  steps: NonNullable<ReturnType<typeof getTour>>["steps"],
): DriveStep[] {
  return steps.map((step) => ({
    element: `[data-tour="${step.element}"]`,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side ?? "bottom",
      align: "center",
    },
  }));
}

/** Inicia o tour da página. Só chama a partir de um clique do usuário. */
export function startPageTour(id: string): void {
  const tour = getTour(id);
  if (!tour || typeof document === "undefined") return;

  const steps = toDriveSteps(tour.steps);
  if (steps.length === 0) return;

  activeTour?.destroy();
  activeTour = driver({
    steps,
    animate: false,
    smoothScroll: true,
    allowClose: true,
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
    onHighlighted: (element) => {
      requestAnimationFrame(() => snapDriverToElement(element));
    },
    onDestroyed: () => {
      activeTour = null;
    },
  });
  activeTour.drive();
}

export function stopPageTour(): void {
  activeTour?.destroy();
  activeTour = null;
}
