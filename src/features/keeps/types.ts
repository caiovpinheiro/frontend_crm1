import type { JSONContent } from "@tiptap/core";

export type KeepFolder = "notes" | "archive" | "trash";

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
