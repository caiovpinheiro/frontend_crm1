/**
 * Contador na aba do navegador: título `(N) …` e um ponto no favicon.
 * Estado por aba (módulo), sem React. `setTabBadge(0)` restaura.
 */

const TITLE_PREFIX = /^\(\d+\)\s/;
const ORIGINAL_HREF = "tabBadgeOriginalHref";
const BADGE_SOURCE = "/icon-32.png";

let badgedIconUrl: string | null = null;
let badgedIconPromise: Promise<string | null> | null = null;

function iconLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
}

function drawBadgedIcon(): Promise<string | null> {
  badgedIconPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        ctx.beginPath();
        ctx.arc(size - 8, 8, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = BADGE_SOURCE;
  });
  return badgedIconPromise;
}

function setIconBadged(on: boolean) {
  for (const link of iconLinks()) {
    if (on) {
      if (!badgedIconUrl) continue;
      link.dataset[ORIGINAL_HREF] ??= link.href;
      link.href = badgedIconUrl;
    } else if (link.dataset[ORIGINAL_HREF]) {
      link.href = link.dataset[ORIGINAL_HREF];
      delete link.dataset[ORIGINAL_HREF];
    }
  }
}

let current = 0;

export function getTabBadge(): number {
  return current;
}

export function setTabBadge(count: number): void {
  if (typeof document === "undefined") return;
  current = Math.max(0, count);
  const base = document.title.replace(TITLE_PREFIX, "");
  document.title = current > 0 ? `(${current}) ${base}` : base;
  if (current === 0) {
    setIconBadged(false);
    return;
  }
  if (badgedIconUrl) {
    setIconBadged(true);
    return;
  }
  void drawBadgedIcon().then((url) => {
    badgedIconUrl = url;
    if (current > 0) setIconBadged(true);
  });
}
