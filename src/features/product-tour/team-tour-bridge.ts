export type TeamTourTab = 0 | 1 | 2;

let setTab: ((tab: TeamTourTab) => void) | null = null;

export function registerTeamTourBridge(
  next: ((tab: TeamTourTab) => void) | null,
): void {
  setTab = next;
}

export function setTeamTourTab(tab: TeamTourTab): void {
  setTab?.(tab);
}
