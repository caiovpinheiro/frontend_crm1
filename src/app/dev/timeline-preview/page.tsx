"use client";

import { useState } from "react";

import {
  EventRow,
  NoteRow,
  type ConversationEventAction,
} from "@/components/crm/chat-timeline";
import {
  MessageBubble,
  type Message,
} from "@/components/crm/message-bubble";

const MOCK_EVENTS: {
  action: ConversationEventAction;
  text: string;
  actor: string;
  time: string;
}[] = [
  {
    action: "distribuicao",
    text: "Conversa distribuída para Atendimento – SAC → Joyce",
    actor: "Sistema",
    time: "09:12",
  },
  {
    action: "atribuicao",
    text: "Atribuída a Marcelo",
    actor: "Joyce",
    time: "09:15",
  },
  {
    action: "transferencia",
    text: "Transferida de Joyce para Marcelo (Comercial)",
    actor: "Joyce",
    time: "09:18",
  },
  {
    action: "status",
    text: "Status alterado para Em atendimento",
    actor: "Marcelo",
    time: "09:19",
  },
  {
    action: "tag",
    text: "Tag adicionada: Lead quente",
    actor: "Marcelo",
    time: "09:20",
  },
  {
    action: "entrada",
    text: "Joyce entrou na conversa",
    actor: "Joyce",
    time: "09:21",
  },
  {
    action: "saida",
    text: "Joyce saiu da conversa",
    actor: "Joyce",
    time: "09:22",
  },
  {
    action: "saida",
    text: "Eduarda Moreira removida da conversa",
    actor: "Marcelo",
    time: "18:45",
  },
  {
    action: "ia",
    text: "Agente IA sugeriu resposta automática",
    actor: "Agente IA",
    time: "09:23",
  },
];

const INBOUND: Message = {
  id: "preview-in",
  content: "Boa tarde! Gostaria de saber sobre a matrícula.",
  time: "09:10",
  type: "incoming",
  senderName: "Mateus",
  senderInitials: "MB",
  kind: "message",
};

const OUTBOUND: Message = {
  id: "preview-out",
  content: "Olá! Claro, posso te ajudar com isso.",
  time: "09:24",
  type: "outgoing",
  senderName: "Marcelo",
  senderInitials: "MA",
  kind: "message",
  status: "read",
};

function toggleTheme() {
  const el = document.documentElement;
  const dark = !el.classList.contains("v2-dark");
  el.classList.toggle("v2-dark", dark);
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
}

export default function TimelinePreviewPage() {
  const [notePinned, setNotePinned] = useState(false);

  return (
    <main className="min-h-dvh bg-[var(--bg-base)] px-4 py-8 text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[10px] font-bold uppercase tracking-widest text-[var(--brand-primary)]">
              Preview local · sem API
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">
              Timeline: EVENT vs NOTA
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Componentes reais com dados mock. EVENT é linha fina centralizada;
              NOTA é o card azul com cadeado.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="shrink-0 rounded-full border border-[var(--glass-border,rgba(0,0,0,0.08))] bg-[var(--glass-bg-base)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
          >
            Light / dark
          </button>
        </header>

        <section
          className="rounded-[var(--radius-lg,1rem)] border border-[color-mix(in_srgb,var(--text-muted)_14%,transparent)] bg-[var(--glass-bg-base)] px-4 py-5 sm:px-6"
          aria-label="Timeline mock"
        >
          <ul className="flex list-none flex-col gap-1.5">
            <li>
              <MessageBubble message={INBOUND} agentInitials="MA" agentName="Marcelo" />
            </li>

            {MOCK_EVENTS.map((event) => (
              <li key={`${event.action}-${event.time}`}>
                <EventRow
                  action={event.action}
                  text={event.text}
                  actor={event.actor}
                  time={event.time}
                />
              </li>
            ))}

            <li>
              <NoteRow
                content="Cliente pediu retorno amanhã de manhã. Confirmar vaga no noturno."
                senderName="Marcelo"
                time="09:25"
                isPinned={notePinned}
                noteId="preview-note"
                onPinNote={(id) => setNotePinned(id != null)}
              />
            </li>

            <li>
              <MessageBubble message={OUTBOUND} agentInitials="MA" agentName="Marcelo" />
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
