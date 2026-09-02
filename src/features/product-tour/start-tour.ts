"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

import "./product-tour.css";
import { getTour } from "./tour-registry";

type DriverInstance = ReturnType<typeof driver>;

let activeTour: DriverInstance | null = null;

function overlayColor(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--text-primary")
    .trim();
  return raw || "rgb(15 23 42)";
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
      align: "start",
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
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayColor: overlayColor(),
    overlayOpacity: 0.42,
    stagePadding: 8,
    stageRadius: 16,
    popoverOffset: 12,
    popoverClass: "bwipo-driver-popover",
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Próximo",
    prevBtnText: "Voltar",
    doneBtnText: "Concluir",
    skipMissingElement: true,
    waitForElement: 2500,
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
