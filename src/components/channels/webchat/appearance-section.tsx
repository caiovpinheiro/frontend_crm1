"use client";

/**
 * Seção "Modelo do widget" do painel Webchat: mostra o modelo gravado e abre o
 * wizard. O wizard salva sozinho e só devolve o `appearance` novo: as outras
 * edições do painel continuam pendentes até o "Salvar" de sempre.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { WebchatAppearance } from "@/features/webchat-widget/appearance";
import { isPlainAppearance } from "@/features/webchat-widget/appearance";
import type { WebchatPublicConfig } from "@/features/webchat-widget/types";

import type { ApiChannel } from "../types";
import { MODEL_INFO, WebchatAppearanceWizard } from "./appearance-wizard";

function summary(appearance: WebchatAppearance | undefined): string {
  if (!appearance || isPlainAppearance(appearance)) {
    return "Nenhum modelo configurado: o widget usa o visual padrão.";
  }
  const topics = appearance.start.topics.length;
  const count = topics === 1 ? "1 tópico" : `${topics} tópicos`;
  return `${MODEL_INFO[appearance.model].name} com ${count}.`;
}

export function WebchatAppearanceSection({
  channel,
  appearance,
  previewBase,
  contextKeys,
  onSaved,
}: {
  channel: ApiChannel;
  appearance: WebchatAppearance | undefined;
  previewBase: WebchatPublicConfig;
  contextKeys: string[];
  onSaved: (appearance: WebchatAppearance) => void;
}) {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Modelo do widget
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-[var(--text-secondary)]">{summary(appearance)}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setJustSaved(false);
            setOpen(true);
          }}
        >
          Configurar modelo
        </Button>
      </div>
      <p className="text-xs text-[var(--text-muted)]" role="status">
        {justSaved ? "Modelo salvo." : ""}
      </p>
      {open ? (
        <WebchatAppearanceWizard
          channel={channel}
          initial={appearance}
          previewBase={previewBase}
          contextKeys={contextKeys}
          onClose={() => setOpen(false)}
          onSaved={(saved) => {
            setOpen(false);
            setJustSaved(true);
            onSaved(saved);
          }}
        />
      ) : null}
    </section>
  );
}
