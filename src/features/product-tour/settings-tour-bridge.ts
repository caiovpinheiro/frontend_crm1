/**
 * Ponte tour → gaveta de Configurações. A sidebar abre no hover da
 * engrenagem e fecha ao sair; durante o tour o overlay do Driver.js
 * rouba o hover e a gaveta fecharia no meio dos passos. O layout
 * registra `setOpen` e o tour mantém a gaveta aberta até o fim.
 */
let setter: ((open: boolean) => void) | null = null;

export function registerSettingsTourBridge(fns: {
  setOpen: (open: boolean) => void;
}): void {
  setter = fns.setOpen;
}

export function setSettingsTourOpen(open: boolean): void {
  setter?.(open);
}
