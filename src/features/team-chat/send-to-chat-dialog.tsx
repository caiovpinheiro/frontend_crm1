"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";

import {
  listTeamChatDestinations,
  previewTeamChatRecord,
  shareAccessWarning,
  shareRecordToChat,
} from "./api";
import { RecordCard } from "./record-card";
import type { ChatDestination, CrmCard, ShareTarget } from "./types";

type Ctx = {
  openShare: (target: ShareTarget) => void;
};

const SendToChatContext = createContext<Ctx | null>(null);

export function SendToChatTrigger({
  target,
  className,
  children,
  onPicked,
}: {
  target: ShareTarget;
  className?: string;
  children: React.ReactNode;
  onPicked?: () => void;
}) {
  const { openShare } = useSendToChat();
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPicked?.();
        openShare(target);
      }}
    >
      {children}
    </button>
  );
}

export function useSendToChat() {
  const ctx = useContext(SendToChatContext);
  if (!ctx) {
    return {
      openShare: (_target: ShareTarget) => {
        toast.error("Chat interno indisponível neste contexto.");
      },
    };
  }
  return ctx;
}

export function SendToChatProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const openShare = useCallback((next: ShareTarget) => setTarget(next), []);
  return (
    <SendToChatContext.Provider value={{ openShare }}>
      {children}
      <SendToChatDialog target={target} onClose={() => setTarget(null)} />
    </SendToChatContext.Provider>
  );
}

function destKey(d: ChatDestination) {
  return d.roomId ? `room:${d.roomId}` : `person:${d.personId}`;
}

function SendToChatDialog({
  target,
  onClose,
}: {
  target: ShareTarget | null;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [dests, setDests] = useState<ChatDestination[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [feedbackType, setFeedbackType] = useState<"positive" | "negative" | "warning" | null>(null);
  const [card, setCard] = useState<CrmCard | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setQ("");
    setPicked([]);
    setContent("");
    setFeedbackType(null);
    setWarning(null);
    void previewTeamChatRecord(target.type, target.id)
      .then((r) => setCard(r.card))
      .catch(() => setCard(null));
    void listTeamChatDestinations()
      .then((r) => setDests(r.destinations))
      .catch(() => setDests([]));
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const t = window.setTimeout(() => {
      void listTeamChatDestinations(q)
        .then((r) => setDests(r.destinations))
        .catch(() => undefined);
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, target]);

  const selected = useMemo(
    () => dests.filter((d) => picked.includes(destKey(d))),
    [dests, picked],
  );

  useEffect(() => {
    if (!target || selected.length === 0) {
      setWarning(null);
      return;
    }
    const roomIds = selected.map((d) => d.roomId).filter((id): id is string => !!id);
    if (roomIds.length === 0) {
      setWarning(null);
      return;
    }
    void shareAccessWarning(target.type, target.id, roomIds)
      .then((r) => {
        const parts = r.rooms
          .filter((x) => x.withoutAccess > 0)
          .map((x) => `${x.withoutAccess} de ${x.memberCount} pessoas em ${x.name} não têm acesso`);
        setWarning(parts.length ? parts.join(". ") : null);
      })
      .catch(() => setWarning(null));
  }, [selected, target]);

  function toggle(d: ChatDestination) {
    const key = destKey(d);
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function submit() {
    if (!target || selected.length === 0) return;
    setBusy(true);
    try {
      const attendance =
        target.attendanceNames && target.attendanceNames.length > 0
          ? `Atendimento: ${target.attendanceNames.join(", ")}`
          : "";
      const text = [content.trim(), attendance].filter(Boolean).join("\n\n");
      await shareRecordToChat({
        type: target.type,
        id: target.id,
        roomIds: selected.map((d) => d.roomId).filter((id): id is string => !!id),
        personIds: selected.filter((d) => !d.roomId && d.personId).map((d) => d.personId as string),
        content: text,
        feedbackType,
      });
      toast.success("Enviado para o chat.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={!!target}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Enviar para o Bwipo Chat"
      description="Manda o link do atendimento para um consultor. Quem não tiver acesso vê um card restrito."
      icon={
        <FormDialogIcon>
          <MessageSquarePlus className="size-4" />
        </FormDialogIcon>
      }
      size="md"
      footer={
        <>
          <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={onClose}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={busy || selected.length === 0}
            onClick={() => void submit()}
          >
            Enviar
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Feedback (opcional)</span>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className={cn(formControlClass, "h-20 resize-none py-2")}
        placeholder="Ex.: lead mal atendido — revisar abordagem"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { key: "positive", label: "Positivo", cls: "bg-green-100 text-green-900 border-green-200" },
          { key: "negative", label: "Negativo", cls: "bg-red-100 text-red-900 border-red-200" },
          { key: "warning", label: "Aviso", cls: "bg-amber-100 text-amber-900 border-amber-200" },
        ].map((opt) => {
          const active = feedbackType === (opt.key as typeof feedbackType);
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() =>
                setFeedbackType(active ? null : (opt.key as typeof feedbackType))
              }
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                active ? opt.cls : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {target?.attendanceNames && target.attendanceNames.length > 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Atendimento: {target.attendanceNames.join(", ")}
        </p>
      ) : null}
      {card && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preview
          </p>
          <RecordCard
            card={card}
            className={cn(
              "w-full max-w-none",
              feedbackType === "positive" && "border-green-200 bg-green-50/50",
              feedbackType === "negative" && "border-red-200 bg-red-50/50",
              feedbackType === "warning" && "border-amber-200 bg-amber-50/50",
            )}
          />
        </div>
      )}
      <span className={cn(formLabelClass, "mt-4")}>Destinos</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={formControlClass}
        placeholder="Buscar pessoas e canais"
      />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-card">
        {dests.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum destino.</p>
        ) : (
          dests.map((d) => {
            const key = destKey(d);
            const on = picked.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(d)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-[13px]",
                  on ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <span className="min-w-0 truncate">
                  {d.section === "channels" ? `#${d.name}` : d.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {d.section === "people" ? "Pessoa" : d.section === "groups" ? "Grupo" : "Canal"}
                </span>
              </button>
            );
          })
        )}
      </div>
      {warning && (
        <p className="mt-3 text-[12px] text-muted-foreground" role="status">
          {warning}
        </p>
      )}
    </FormDialog>
  );
}
