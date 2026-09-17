export type KeepsTourComposer = "closed" | "note" | "checklist";
export type KeepsTourFolder = "notes" | "archive" | "trash";
export type KeepsTourView = "normal" | "categories";
export type KeepsTourChatTab = "conversa" | "keeps";

type FolderBridge = {
  setFolder: (folder: KeepsTourFolder) => void;
  setViewMode: (view: KeepsTourView) => void;
};

let folderBridge: FolderBridge | null = null;
let openComposer: ((mode: KeepsTourComposer) => void) | null = null;
let setChatTab: ((tab: KeepsTourChatTab) => void) | null = null;

export function registerKeepsFolderTourBridge(next: FolderBridge | null): void {
  folderBridge = next;
}

export function registerKeepsComposerTourBridge(
  next: ((mode: KeepsTourComposer) => void) | null,
): void {
  openComposer = next;
}

export function registerKeepsChatTourBridge(
  next: ((tab: KeepsTourChatTab) => void) | null,
): void {
  setChatTab = next;
}

export function applyKeepsTourStep(step: {
  keepsFolder?: KeepsTourFolder;
  keepsView?: KeepsTourView;
  keepsComposer?: KeepsTourComposer;
  keepsChatTab?: KeepsTourChatTab;
}): void {
  if (step.keepsFolder) folderBridge?.setFolder(step.keepsFolder);
  if (step.keepsView) folderBridge?.setViewMode(step.keepsView);
  if (step.keepsComposer) openComposer?.(step.keepsComposer);
  if (step.keepsChatTab) setChatTab?.(step.keepsChatTab);
}
