export type CreateWizardStep = 1 | 2 | 3;

export type CreateWizardBridge = {
  setStep: (step: CreateWizardStep) => void;
};

let bridge: CreateWizardBridge | null = null;

export function registerCreateWizardBridge(next: CreateWizardBridge | null): void {
  bridge = next;
}

export function setCreateWizardStep(step: CreateWizardStep): void {
  bridge?.setStep(step);
}
