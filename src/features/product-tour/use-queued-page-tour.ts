"use client";

import { useEffect } from "react";

import { consumeQueuedPageTour, peekQueuedPageTour, startPageTour } from "./start-tour";

/** Continua um tour encadeado após `href` + `startTourId`. */
export function useQueuedPageTour(...ids: string[]): void {
  const key = ids.join("|");
  useEffect(() => {
    const pending = peekQueuedPageTour();
    if (!pending || !ids.includes(pending)) return;
    const timer = window.setTimeout(() => {
      if (peekQueuedPageTour() !== pending) return;
      consumeQueuedPageTour();
      startPageTour(pending);
    }, 450);
    return () => window.clearTimeout(timer);
    // ids is represented by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
