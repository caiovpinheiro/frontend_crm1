"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconLink,
  IconList,
  IconListNumbers,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconUnlink,
  IconBlockquote,
  IconClearFormatting,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface Props {
  content?: string;
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export type EmailRichEditorHandle = {
  getContent: () => { html: string; text: string };
};

type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
};

function ToolbarButton({ onClick, active, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] transition-colors",
        "hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]",
        active && "bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-[var(--glass-border)]" />;
}

export const EmailRichEditor = React.forwardRef<EmailRichEditorHandle, Props>(function EmailRichEditor(
  { content, onChange, placeholder, minHeight = "200px", className },
  ref,
) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          class: "text-[var(--brand-primary)] underline cursor-pointer",
        },
      }),
      TextAlign.configure({ types: ["paragraph"] }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: placeholder ?? "Escreva sua mensagem…",
      }),
    ],
    content: content ?? "",
    editorProps: {
      attributes: {
        class: "email-editor-content outline-none",
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate({ editor }) {
      onChange?.(editor.getHTML(), editor.getText());
    },
  });

  React.useImperativeHandle(ref, () => ({
    getContent: () => ({
      html: editor?.getHTML() ?? "",
      text: editor?.getText() ?? "",
    }),
  }), [editor]);

  const addLink = React.useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={cn("flex flex-col rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-2 py-1.5">
        {/* Texto */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito (Ctrl+B)">
          <IconBold size={15} stroke={2} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico (Ctrl+I)">
          <IconItalic size={15} stroke={2} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado (Ctrl+U)">
          <IconUnderline size={15} stroke={2} />
        </ToolbarButton>

        <Divider />

        {/* Link */}
        <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Inserir link">
          <IconLink size={15} stroke={2} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().unsetLink().run()} title="Remover link">
          <IconUnlink size={15} stroke={1.5} />
        </ToolbarButton>

        <Divider />

        {/* Listas */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista com marcadores">
          <IconList size={15} stroke={2} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada">
          <IconListNumbers size={15} stroke={2} />
        </ToolbarButton>

        <Divider />

        {/* Citação */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Citação">
          <IconBlockquote size={15} stroke={2} />
        </ToolbarButton>

        <Divider />

        {/* Alinhamento */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Alinhar à esquerda">
          <IconAlignLeft size={15} stroke={2} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centralizar">
          <IconAlignCenter size={15} stroke={2} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Alinhar à direita">
          <IconAlignRight size={15} stroke={2} />
        </ToolbarButton>

        <Divider />

        {/* Cor do texto */}
        <label title="Cor do texto" className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--glass-bg-strong)]">
          <span className="font-display text-sm font-bold leading-none" style={{ color: editor.getAttributes("textStyle").color ?? "var(--text-primary)" }}>A</span>
          <input
            type="color"
            defaultValue="#0f172a"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>

        <Divider />

        {/* Limpar formatação */}
        <ToolbarButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Limpar formatação">
          <IconClearFormatting size={15} stroke={1.5} />
        </ToolbarButton>
      </div>

      {/* Área de edição */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto px-4 py-3 font-body text-[13px] leading-relaxed text-[var(--text-primary)] [&_.email-editor-content_p]:my-1 [&_.email-editor-content_ul]:my-1 [&_.email-editor-content_ol]:my-1 [&_.email-editor-content_ul]:list-disc [&_.email-editor-content_ul]:pl-5 [&_.email-editor-content_ol]:list-decimal [&_.email-editor-content_ol]:pl-5 [&_.email-editor-content_blockquote]:border-l-4 [&_.email-editor-content_blockquote]:border-[var(--glass-border)] [&_.email-editor-content_blockquote]:pl-3 [&_.email-editor-content_blockquote]:text-[var(--text-muted)] [&_.email-editor-content_blockquote]:italic [&_.email-editor-content_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.email-editor-content_.is-editor-empty:first-child::before]:text-[var(--text-muted)] [&_.email-editor-content_.is-editor-empty:first-child::before]:pointer-events-none [&_.email-editor-content_.is-editor-empty:first-child::before]:float-left [&_.email-editor-content_.is-editor-empty:first-child::before]:h-0"
      />
    </div>
  );
});
