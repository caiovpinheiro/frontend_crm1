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
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayColor: overlayColor(),
    overlayOpacity: 0.42,
    // Padding grande + slot de busca 32rem fazia o recorte engolir o
    // calendário e parecer que o clique fica “ao lado” do controle.
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
    onHighlighted: () => {
      // `.v2-root { zoom: 0.93 }` + 1º paint: o SVG do overlay às vezes
      // mede antes do layout final. O Driver.js re-mede no resize.
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
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
