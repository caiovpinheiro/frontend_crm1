"use client";

import type { PopoverDOM } from "driver.js";
import {
  Calendar,
  CheckSquare,
  Columns3,
  Compass,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Search,
  Settings,
  User,
  Users,
  Workflow,
} from "lucide-react";
import type { ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { TourCard } from "@/components/onboarding/tour-card";

import type { PageTour, PageTourCta } from "./tour-types";

const HOST_ATTR = "data-tour-card-host";

let root: Root | null = null;
let host: HTMLElement | null = null;

function hideDriverChrome(popover: PopoverDOM): void {
  popover.title.style.display = "none";
  popover.description.style.display = "none";
  popover.footer.style.display = "none";
  popover.closeButton.style.display = "none";
  popover.title.setAttribute("aria-hidden", "true");
  popover.description.setAttribute("aria-hidden", "true");
  popover.footer.setAttribute("aria-hidden", "true");
  popover.closeButton.setAttribute("aria-hidden", "true");
}

function resolveStepIcon(element: string): ComponentType<{ className?: string }> {
  if (element.includes("search")) return Search;
  if (element.includes("period") || element.includes("calendar")) return Calendar;
  if (element.includes("inbox") || element.includes("chat") || element.includes("message")) {
    return MessageSquare;
  }
  if (element.includes("pipeline") || element.includes("deal") || element.includes("kanban")) {
    return Columns3;
  }
  if (element.includes("contact")) return Users;
  if (element.includes("team") || element.includes("user") || element.includes("schedule")) {
    return User;
  }
  if (element.includes("campaign")) return Megaphone;
  if (element.includes("automat") || element.includes("builder")) return Workflow;
  if (element.includes("setting") || element.includes("security") || element.includes("permission")) {
    return Settings;
  }
  if (element.includes("task")) return CheckSquare;
  if (element.includes("dashboard") || element.includes("kpi")) return LayoutDashboard;
  return Compass;
}

export function unmountTourCard(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}

export function mountTourCard(
  popover: PopoverDOM,
  tour: PageTour,
  currentIndex: number,
  onCta: (cta: PageTourCta) => void,
): void {
  hideDriverChrome(popover);

  if (!host || !popover.wrapper.contains(host)) {
    unmountTourCard();
    host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "1");
    popover.wrapper.appendChild(host);
    root = createRoot(host);
  }

  const step = tour.steps[currentIndex];
  const isLast = currentIndex >= tour.steps.length - 1;
  const extraActions = (tour.ctas ?? [])
    .filter((cta) => cta.onElement === step?.element)
    .map((cta) => ({
      label: cta.label,
      onClick: () => onCta(cta),
    }));
  const Icon = resolveStepIcon(step?.element ?? "");

  flushSync(() => {
    root?.render(
      <TourCard
        title={step?.title ?? ""}
        description={step?.description ?? ""}
        current={currentIndex + 1}
        total={tour.steps.length}
        onNext={() => popover.nextButton.click()}
        onBack={() => popover.previousButton.click()}
        onClose={() => popover.closeButton.click()}
        nextLabel={isLast ? "Concluir" : "Próximo"}
        extraActions={extraActions}
        icon={<Icon className="size-5 text-white" aria-hidden />}
      />,
    );
  });
}
