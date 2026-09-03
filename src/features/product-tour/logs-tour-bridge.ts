export type LogsTourTab = 0 | 1 | 2 | 3;

let setTab: ((tab: LogsTourTab) => void) | null = null;

export function registerLogsTourBridge(
  next: ((tab: LogsTourTab) => void) | null,
): void {
  setTab = next;
}

export function setLogsTourTab(tab: LogsTourTab): void {
  setTab?.(tab);
}
