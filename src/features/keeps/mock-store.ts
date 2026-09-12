import { keepDocPlainText } from "./helpers";
import { EMPTY_KEEP_DOC, type KeepDoc, type KeepFolder, type KeepNote } from "./types";

const KEY = "bwipo-keeps-mock-notes-v1";

function now() {
  return new Date().toISOString();
}

function uid() {
  return `keep-${Math.random().toString(36).slice(2, 10)}`;
}

function folderOf(note: KeepNote): KeepFolder {
  if (note.trashed) return "trash";
  if (note.archived) return "archive";
  return "notes";
}

function load(): KeepNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as KeepNote[]) : [];
  } catch {
    return [];
  }
}

function save(items: KeepNote[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

function all(): KeepNote[] {
  return load();
}

export function mockListKeepNotes(folder: KeepFolder, q: string): { items: KeepNote[] } {
  const query = q.trim().toLowerCase();
  const items = all()
    .filter((n) => folderOf(n) === folder)
    .filter((n) => {
      if (!query) return true;
      return `${n.title} ${n.plainText}`.toLowerCase().includes(query);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position);
  return { items };
}

export function mockCreateKeepNote(input: { title?: string; content?: KeepDoc }): { note: KeepNote } {
  const content = input.content ?? EMPTY_KEEP_DOC;
  const note: KeepNote = {
    id: uid(),
    title: input.title ?? "",
    content,
    plainText: keepDocPlainText(content),
    pinned: false,
    archived: false,
    trashed: false,
    trashedAt: null,
    source: "manual",
    importBatchId: null,
    position: Date.now(),
    createdAt: now(),
    updatedAt: now(),
    attachments: [],
  };
  save([note, ...all()]);
  return { note };
}

export function mockPatchKeepNote(
  id: string,
  patch: Partial<{ title: string; content: KeepDoc; pinned: boolean; archived: boolean; trashed: boolean }>,
): { note: KeepNote } {
  const items = all();
  const idx = items.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error("Nota não encontrada.");
  const prev = items[idx];
  const content = patch.content ?? prev.content;
  const next: KeepNote = {
    ...prev,
    title: patch.title ?? prev.title,
    content,
    plainText: patch.content ? keepDocPlainText(content) : prev.plainText,
    pinned: patch.pinned ?? prev.pinned,
    archived: patch.archived ?? prev.archived,
    trashed: patch.trashed ?? prev.trashed,
    trashedAt: patch.trashed === true ? now() : patch.trashed === false ? null : prev.trashedAt,
    updatedAt: now(),
  };
  items[idx] = next;
  save(items);
  return { note: next };
}

export function mockDeleteKeepNote(id: string, forever = false): void {
  if (forever) {
    save(all().filter((n) => n.id !== id));
    return;
  }
  mockPatchKeepNote(id, { trashed: true, pinned: false });
}

export function mockUploadKeepAttachment(
  noteId: string,
  file: File,
): { attachment: KeepNote["attachments"][number] } {
  const items = all();
  const idx = items.findIndex((n) => n.id === noteId);
  if (idx < 0) throw new Error("Nota não encontrada.");
  const attachment: KeepNote["attachments"][number] = {
    id: uid(),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    url: typeof URL !== "undefined" ? URL.createObjectURL(file) : "",
    createdAt: now(),
  };
  items[idx] = {
    ...items[idx],
    attachments: [...items[idx].attachments, attachment],
    updatedAt: now(),
  };
  save(items);
  return { attachment };
}

export function mockImportGoogleKeepZip(): { imported: number; batchId: string } {
  return { imported: 0, batchId: `mock-${uid()}` };
}

export function mockReorderKeepNotes(items: Array<{ id: string; pinned: boolean; position: number }>): void {
  const map = new Map(items.map((i) => [i.id, i]));
  save(
    all().map((n) => {
      const u = map.get(n.id);
      return u ? { ...n, pinned: u.pinned, position: u.position } : n;
    }),
  );
}
