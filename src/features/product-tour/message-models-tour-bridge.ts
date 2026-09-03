export type MessageModelsTourTab = "overview" | "internal" | "whatsapp" | "flows";

let setTab: ((tab: MessageModelsTourTab) => void) | null = null;

export function registerMessageModelsTourBridge(
  next: ((tab: MessageModelsTourTab) => void) | null,
): void {
  setTab = next;
}

export function setMessageModelsTourTab(tab: MessageModelsTourTab): void {
  setTab?.(tab);
}
