import { useEffect, useState } from "react";

/**
 * Assinatura do agente (estilo WhatsApp): toggle + nome personalizado,
 * persistidos em localStorage (mesmas chaves do /inbox v1). Quando ligada
 * e fora do modo nota, prefixa `*Nome*: ` na mensagem.
 */
export function useComposerSignature({
  agentName,
  signatureAllowed,
}: {
  agentName: string;
  signatureAllowed: boolean;
}) {
  const [sigEnabled, setSigEnabled] = useState(true);
  const [sigValue, setSigValue] = useState("");
  const [sigEditing, setSigEditing] = useState(false);
  const [sigDraft, setSigDraft] = useState("");

  useEffect(() => {
    try {
      const e = window.localStorage.getItem("eduit:signature:enabled");
      const v = window.localStorage.getItem("eduit:signature:value");
      if (e !== null) setSigEnabled(e === "1");
      if (v !== null) setSigValue(v);
    } catch {
      /* ignore */
    }
  }, []);

  const effectiveSignature = (sigValue.trim() || agentName).trim();

  function persistSigEnabled(v: boolean) {
    setSigEnabled(v);
    try {
      window.localStorage.setItem("eduit:signature:enabled", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  function persistSigValue(v: string) {
    setSigValue(v);
    try {
      window.localStorage.setItem("eduit:signature:value", v);
    } catch {
      /* ignore */
    }
  }

  // Prefixa a assinatura de forma idempotente (não duplica se o texto já
  // vier assinado em qualquer um dos formatos usados historicamente).
  function applySignature(text: string): string {
    const sig = effectiveSignature;
    // Respeita a permissão org-level "Permitir assinatura": quando desligada,
    // a assinatura nunca é aplicada, mesmo que o agente a tenha habilitado
    // localmente antes (estado persistido em localStorage).
    if (!signatureAllowed || !sigEnabled || !sig) return text;
    const s = sig.toLowerCase();
    const lower = text.toLowerCase();
    const already =
      lower.startsWith(`*${s}:*`) ||
      lower.startsWith(`*${s}*:`) ||
      lower.startsWith(`*${s}*`) ||
      lower.startsWith(`${s}:`);
    return already ? text : `*${sig}*: ${text}`;
  }

  return {
    sigEnabled,
    sigValue,
    sigEditing,
    setSigEditing,
    sigDraft,
    setSigDraft,
    effectiveSignature,
    persistSigEnabled,
    persistSigValue,
    applySignature,
  };
}

export type ComposerSignature = ReturnType<typeof useComposerSignature>;
