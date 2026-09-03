export type DashboardTourTab = "deals" | "service";

let setTab: ((tab: DashboardTourTab) => void) | null = null;

export function registerDashboardTourBridge(
  next: ((tab: DashboardTourTab) => void) | null,
): void {
  setTab = next;
}

export function setDashboardTourTab(tab: DashboardTourTab): void {
  setTab?.(tab);
}
