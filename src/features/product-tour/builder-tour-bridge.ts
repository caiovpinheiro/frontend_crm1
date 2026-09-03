type BuilderTourBridge = {
  openPalette: () => void;
  openPicker: () => void;
  closePicker: () => void;
  focusTrigger: () => void;
};

let bridge: Partial<BuilderTourBridge> = {};

/** Partes independentes (paleta, picker, canvas) se registram sem apagar a outra. */
export function registerBuilderTourBridge(
  part: Partial<BuilderTourBridge>,
): () => void {
  bridge = { ...bridge, ...part };
  return () => {
    const next = { ...bridge };
    for (const key of Object.keys(part) as (keyof BuilderTourBridge)[]) {
      if (next[key] === part[key]) delete next[key];
    }
    bridge = next;
  };
}

export function applyBuilderTourStep(step: {
  openPalette?: boolean;
  openPicker?: boolean;
  focusTrigger?: boolean;
}): void {
  if (step.focusTrigger) bridge.focusTrigger?.();
  if (step.openPalette) bridge.openPalette?.();
  if (step.openPicker) bridge.openPicker?.();
  else bridge.closePicker?.();
}
