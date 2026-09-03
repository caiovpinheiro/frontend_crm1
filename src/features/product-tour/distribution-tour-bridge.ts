export type DistributionTourTab = "team" | "coverage" | "queue" | "logs";

let setTab: ((tab: DistributionTourTab) => void) | null = null;

export function registerDistributionTourBridge(
  next: ((tab: DistributionTourTab) => void) | null,
): void {
  setTab = next;
}

export function setDistributionTourTab(tab: DistributionTourTab): void {
  setTab?.(tab);
}
