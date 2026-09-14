"use client";

import { useEffect, useState } from "react";
import { Forward } from "lucide-react";
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

import { forwardTeamChatMessage, listTeamChatDestinations } from "./api";
import type { ChatDestination, TeamChatMessage } from "./types";

const TYPES = [
  { id: "correcao" as const, label: "Correção" },
  { id: "atencao" as const, label: "Atenção" },
  { id: "reconhecimento" as const, label: "Reconhecimento" },
];

export function ForwardDialog({
  open,
  onOpenChange,
  roomId,
  message,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: string;
  message: TeamChatMessage | null;
}) {
  const [excerpt, setExcerpt] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("atencao");
  const [dests, setDests] = useState<ChatDestination[]>([]);
  const [destKey, setDestKey] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !message) return;
    setExcerpt(message.content);
    setNote("");
    setType("atencao");
    setDestKey("");
    void listTeamChatDestinations()
      .then((r) => setDests(r.destinations))
      .catch(() => setDests([]));
  }, [open, message]);

  const visible = dests.filter((d) => (type === "correcao" ? d.kind === "DM" : true));
  const dest = visible.find((d) => (d.roomId ? `room:${d.roomId}` : `person:${d.personId}`) === destKey);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Encaminhar com anotação"
      description="O trecho e a nota vão para o destino escolhido."
      icon={
        <FormDialogIcon>
          <Forward className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass type="button" variant="glass" className={formDialogCancelClass} onClick={() => onOpenChange(false)}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={busy || !note.trim() || !excerpt.trim() || !dest}
            onClick={() => {
              if (!message || !dest) return;
              setBusy(true);
              void forwardTeamChatMessage({
                sourceRoomId: roomId,
                sourceMessageId: message.id,
                excerpt: excerpt.trim(),
                note: note.trim(),
                type,
                destRoomId: dest.roomId ?? undefined,
                destPersonId: dest.roomId ? undefined : dest.personId ?? undefined,
              })
                .then(() => {
                  toast.success("Encaminhado.");
                  onOpenChange(false);
                })
                .catch((err: Error) => toast.error(err.message))
                .finally(() => setBusy(false));
            }}
          >
            Encaminhar
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Tipo</span>
      <div className="mb-3 flex gap-2">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setType(t.id)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-semibold",
              type === t.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <span className={formLabelClass}>Trecho</span>
      <textarea
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        className={cn(formControlClass, "h-20 resize-none py-2")}
      />
      <span className={cn(formLabelClass, "mt-3")}>Anotação *</span>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={cn(formControlClass, "h-20 resize-none py-2")}
        placeholder="O que a pessoa precisa saber"
      />
      <span className={cn(formLabelClass, "mt-3")}>Destino</span>
      {type === "correcao" && (
        <p className="mb-1 text-[12px] text-muted-foreground">Correção só pode ir para uma pessoa.</p>
      )}
      <div className="max-h-40 overflow-y-auto rounded-xl border border-border">
        {visible.map((d) => {
          const key = d.roomId ? `room:${d.roomId}` : `person:${d.personId}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setDestKey(key)}
              className={cn(
                "flex w-full px-3 py-2 text-left text-[13px]",
                destKey === key ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              {d.section === "channels" ? `#${d.name}` : d.name}
            </button>
          );
        })}
      </div>
    </FormDialog>
  );
}
