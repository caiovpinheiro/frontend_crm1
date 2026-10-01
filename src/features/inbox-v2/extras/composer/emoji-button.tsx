import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { IconMoodSmile } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { ButtonGlass } from "@/components/crm/button-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { EmojiPicker } from "@/components/inbox/emoji-picker";

/** Estado do painel de emoji: fecha no clique-fora e no ESC. */
export function useEmojiPanel() {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!emojiOpen) return;
    function onDoc(e: MouseEvent) {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    }
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setEmojiOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [emojiOpen]);

  return { emojiOpen, setEmojiOpen, emojiWrapRef };
}

/** Botão smiley + painel de emoji (abre acima do botão). */
export function EmojiButton({
  emojiWrapRef,
  emojiOpen,
  setEmojiOpen,
  inputDisabled,
  busy,
  insertEmoji,
}: {
  emojiWrapRef: RefObject<HTMLDivElement | null>;
  emojiOpen: boolean;
  setEmojiOpen: Dispatch<SetStateAction<boolean>>;
  inputDisabled: boolean;
  busy: boolean;
  insertEmoji: (emoji: string) => void;
}) {
  return (
    <div ref={emojiWrapRef} className="relative">
      <TooltipGlass label="Emoji" side="top">
        <span className="inline-flex">
          <ButtonGlass
            type="button"
            variant="icon"
            size="icon"
            className={cn(
              "h-9 w-9 shrink-0",
              emojiOpen && "text-[var(--brand-primary)]",
            )}
            onClick={(e) => {
              e.stopPropagation();
              setEmojiOpen((v) => !v);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={inputDisabled || busy}
          >
            <IconMoodSmile size={20} />
          </ButtonGlass>
        </span>
      </TooltipGlass>
      {emojiOpen && (
        <div
          className="absolute bottom-12 left-0 z-50 w-[380px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <EmojiPicker
            open={emojiOpen}
            onPick={(emoji) => {
              insertEmoji(emoji);
              setEmojiOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
