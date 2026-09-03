export type SecurityTourTab = "permissions" | "api" | "flags";
export type SecurityTourAccess = "role" | "user";

let setPageTab: ((tab: SecurityTourTab) => void) | null = null;
let setAccess: ((kind: SecurityTourAccess) => void) | null = null;

export function registerSecurityPageTourBridge(
  next: ((tab: SecurityTourTab) => void) | null,
): void {
  setPageTab = next;
}

export function registerSecurityAccessTourBridge(
  next: ((kind: SecurityTourAccess) => void) | null,
): void {
  setAccess = next;
}

export function setSecurityTourTab(tab: SecurityTourTab): void {
  setPageTab?.(tab);
}

export function setSecurityTourAccess(kind: SecurityTourAccess): void {
  setAccess?.(kind);
}
