"use client";

/**
 * Anexos de um material (vídeo, imagem, áudio, PDF). Quando o agente lê um
 * trecho do material, vê os anexos e o "quando enviar", e pode mandar ao
 * cliente depois da resposta. Salvos na hora, sem depender do "Salvar" do texto.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertCircle,
  IconFileTypePdf,
  IconLoader2,
  IconMusic,
  IconPaperclip,
  IconPhoto,
  IconTrash,
  IconVideo,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, apiUrl, parseApiResponse } from "@/lib/api";

type Kind = "image" | "video" | "audio" | "document";

type Attachment = {
  id: string;
  docId: string;
  url: string;
  mimeType: string | null;
  name: string;
  description: string;
  kind: Kind;
};

const KIND_ICON: Record<Kind, typeof IconPhoto> = {
  image: IconPhoto,
  video: IconVideo,
  audio: IconMusic,
  document: IconFileTypePdf,
};

const KIND_LABEL: Record<Kind, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "PDF" };

const MAX_BYTES = 16 * 1024 * 1024;

function DescriptionField({ agentId, docId, item }: { agentId: string; docId: string; item: Attachment }) {
  const queryClient = useQueryClient();
  const [value, setValue] = React.useState(item.description);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/materials/${docId}/attachments/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      return parseApiResponse(res, "Erro ao salvar o anexo.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-v2-material-attachments", agentId, docId] }),
  });
  return (
    <Input
      value={value}
      maxLength={300}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== item.description && save.mutate()}
      placeholder="Quando enviar (ex.: quando o cliente não achar o botão)"
      className="h-8 text-xs"
      aria-label={`Quando enviar ${item.name}`}
    />
  );
}

export function MaterialAttachments({ agentId, docId }: { agentId: string; docId: string }) {
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const key = ["ai-v2-material-attachments", agentId, docId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/materials/${docId}/attachments`);
      return parseApiResponse<{ attachments: Attachment[]; limits: { perMaterial: number } }>(res, "Erro ao carregar os anexos.");
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("O arquivo passa de 16 MB.");
      const form = new FormData();
      form.append("file", file);
      const up = await fetch(apiUrl("/api/uploads/automation-media"), { method: "POST", body: form });
      const data = (await up.json().catch(() => ({}))) as { url?: string; fileName?: string; mimeType?: string; message?: string };
      if (!up.ok || !data.url) throw new Error(data.message ?? "Erro ao enviar o arquivo.");
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/materials/${docId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.url, mimeType: data.mimeType, name: (data.fileName ?? file.name).replace(/\.[^.]+$/, "") }),
      });
      return parseApiResponse(res, "Erro ao anexar.");
    },
    onMutate: () => setError(null),
    onError: (e) => setError((e as Error).message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/materials/${docId}/attachments/${id}`, { method: "DELETE" });
      return parseApiResponse(res, "Erro ao remover.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const items = list.data?.attachments ?? [];
  const max = list.data?.limits.perMaterial ?? 5;

  return (
    <div className="grid gap-2 rounded-xl border border-border/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="flex-1">Anexos para enviar ao cliente</Label>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={upload.isPending || items.length >= max}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? <IconLoader2 className="size-4 animate-spin" /> : <IconPaperclip className="size-4" />}
          Anexar arquivo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Vídeo, imagem, áudio ou PDF (até 16 MB, {max} por material). Quando o agente usar este material, ele pode enviar o anexo depois da
        resposta — escreva quando enviar. Salvos na hora.
      </p>
      {list.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {items.map((a) => {
        const Icon = KIND_ICON[a.kind];
        return (
          <div key={a.id} className="flex flex-col gap-2 rounded-lg border border-border/60 p-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-2 sm:w-56 sm:shrink-0">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={KIND_LABEL[a.kind]} />
              <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium hover:underline" title={a.name}>
                {a.name}
              </a>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <DescriptionField key={`${a.id}:${a.description}`} agentId={agentId} docId={docId} item={a} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                disabled={remove.isPending}
                onClick={() => remove.mutate(a.id)}
                aria-label={`Remover ${a.name}`}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
