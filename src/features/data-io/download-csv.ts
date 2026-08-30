/** Total conhecido pela UI até o header `X-Export-Total` chegar. */
function parseExportTotal(res: Response, estimated?: number): number | null {
  const raw = res.headers.get("X-Export-Total");
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return estimated ?? null;
}

function countCrlf(
  chunk: Uint8Array,
  lastWasCr: boolean,
): { count: number; lastWasCr: boolean } {
  let count = 0;
  let cr = lastWasCr;
  for (const b of chunk) {
    if (b === 0x0a && cr) count += 1;
    cr = b === 0x0d;
  }
  return { count, lastWasCr: cr };
}

export type DownloadProgress = {
  loaded: number;
  total: number | null;
};

export async function downloadCsvFromApi(
  url: string,
  fallbackName: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  onProgress?.({ loaded: 0, total: null });

  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (!res.ok) {
    let msg = `Falha na exportação (${res.status})`;
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j?.message === "string" && j.message.trim()) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const total = parseExportTotal(res);
  const useRows = Boolean(res.headers.get("X-Export-Total"));
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="?([^";]+)"?/.exec(cd);
  const name = m?.[1] ?? fallbackName;

  let blob: Blob;
  if (!res.body) {
    blob = await res.blob();
    onProgress?.({ loaded: total ?? 1, total: total ?? 1 });
  } else {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let crlf = 0;
    let lastWasCr = false;
    let lastEmit = 0;

    const emit = (loaded: number, force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit < 80) return;
      lastEmit = now;
      onProgress?.({ loaded, total });
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      const counted = countCrlf(value, lastWasCr);
      crlf += counted.count;
      lastWasCr = counted.lastWasCr;
      emit(useRows ? Math.max(0, crlf - 1) : chunks.reduce((n, c) => n + c.byteLength, 0));
    }

    const loaded = useRows ? Math.max(0, crlf - 1) : 1;
    onProgress?.({ loaded: total ?? loaded, total: total ?? loaded });
    blob = new Blob(chunks as BlobPart[], { type: "text/csv;charset=utf-8" });
  }

  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = name;
  a.click();
  URL.revokeObjectURL(objUrl);
}

export function downloadTextCsv(filename: string, content: string) {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objUrl);
}
