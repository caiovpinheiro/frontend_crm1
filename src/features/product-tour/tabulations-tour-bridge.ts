export type TabulationsTourView = "tree" | "dashboard";

let setView: ((view: TabulationsTourView) => void) | null = null;

export function registerTabulationsTourBridge(
  next: ((view: TabulationsTourView) => void) | null,
): void {
  setView = next;
}

export function setTabulationsTourView(view: TabulationsTourView): void {
  setView?.(view);
}
