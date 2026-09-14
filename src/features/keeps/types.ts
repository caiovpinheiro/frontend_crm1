import type { JSONContent } from "@tiptap/core";

export type KeepFolder = "notes" | "archive" | "trash";

export type KeepLayout = "grid" | "list";

export type KeepNoteColor =
  | "default"
  | "yellow"
  | "orange"
  | "coral"
  | "green"
  | "teal"
  | "blue"
  | "lavender";

export type KeepLabel = {
  id: string;
  name: string;
};

export type KeepNoteMeta = {
  color: KeepNoteColor;
  labelIds: string[];
};

export type KeepAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  createdAt: string;
};

export type KeepDoc = JSONContent;

export type KeepNote = {
  id: string;
  title: string;
  content: KeepDoc;
  plainText: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  trashedAt: string | null;
  source: string;
  importBatchId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  attachments: KeepAttachment[];
};

export const EMPTY_KEEP_DOC: KeepDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
