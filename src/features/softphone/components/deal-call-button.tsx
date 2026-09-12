"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconPhone } from "@tabler/icons-react";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { useSession } from "next-auth/react";

import { useDealDial } from "../hooks/use-deal-dial";
import { useCallsWidget } from "../hooks/use-calls-widget";

interface DealCallButtonProps {
  /** Opcional: no inbox a ligação pode ter só contato, sem negócio. */
  dealId?: string | null;
  phone: string | null;
  contactId?: string;
  /** FAB no canto inferior direito do viewport (inbox / Sales Hub). */
  fab?: boolean;
}

export function DealCallButton({ dealId, phone, contactId, fab = false }: DealCallButtonProps) {
  // Gate por widget: se a org desinstalou a Telefonia em /widgets, o
  // botão some do card (espelha o comportamento do SoftphoneWidget).
  const { status: sessionStatus } = useSession();
  const canFetch = sessionStatus !== "unauthenticated";
  const callsWidget = useCallsWidget(canFetch);
  const { dial, canDial, loading } = useDealDial({ dealId, phone, contactId });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (fab) setMounted(true);
  }, [fab]);

  if (!phone) return null;
  if (callsWidget.enabled !== true) return null;

  const button = (
    <TooltipGlass label={canDial ? `Ligar ${phone}` : "Conecte o softphone"} side="left">
      <button
        type="button"
        disabled={!canDial || loading}
        onClick={dial}
        aria-label={`Ligar para ${phone}`}
        className={
          fab
            ? "flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_6px_20px_rgba(16,185,129,0.5)] ring-4 ring-emerald-500/20 transition-all hover:bg-emerald-600 hover:shadow-[0_8px_24px_rgba(16,185,129,0.6)] hover:ring-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:ring-0"
            : "flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.45)] ring-4 ring-emerald-500/15 transition-all hover:bg-emerald-600 hover:shadow-[0_6px_18px_rgba(16,185,129,0.55)] hover:ring-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:ring-0"
        }
      >
        <IconPhone size={fab ? 22 : 18} stroke={2.4} />
      </button>
    </TooltipGlass>
  );

  if (!fab) return button;
  if (!mounted) return null;

  // Portal no body: ChatArea tem overflow-hidden + backdrop-blur, que
  // criam containing block e clipariam um `fixed` no subtree do chat.
  return createPortal(
    <div
      className="pointer-events-none fixed z-(--z-sheet) right-[max(1rem,calc(env(safe-area-inset-right,0px)+1rem))] bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))]"
    >
      <div className="pointer-events-auto">{button}</div>
    </div>,
    document.body,
  );
}
