"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EMPTY_KEEP_DOC, type KeepDoc } from "./types";

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    code: false,
  }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  Image.configure({ inline: false, allowBase64: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: "Escreva uma nota..." }),
];

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}

function KeepToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border pb-2">
      <ToolbarButton title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Sublinhado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const href = window.prompt("URL", prev ?? "https://");
          if (href === null) return;
          if (!href) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          editor.chain().focus().setLink({ href }).run();
        }}
      >
        <LinkIcon className="size-3.5" />
      </ToolbarButton>
    </div>
  );
}

export function KeepRichEditor({
  content,
  onChange,
  placeholder,
  compact,
}: {
  content: KeepDoc;
  onChange: (doc: KeepDoc) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: placeholder
      ? extensions.map((ext) => (ext.name === "placeholder" ? Placeholder.configure({ placeholder }) : ext))
      : extensions,
    content: content?.type === "doc" ? content : EMPTY_KEEP_DOC,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON() as KeepDoc);
    },
    editorProps: {
      attributes: {
        class: cn(
          "keep-editor prose prose-sm max-w-none text-foreground focus:outline-none",
          compact ? "min-h-[4.5rem]" : "min-h-[12rem]",
        ),
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  if (!editor) return <div className="min-h-[4.5rem] rounded-xl bg-card" />;

  return (
    <div className="space-y-2">
      {!compact ? <KeepToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
