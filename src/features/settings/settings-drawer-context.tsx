"use client";

/**
 * Gaveta do menu de Configurações (lista à esquerda em /settings).
 *
 * Abre no hover da engrenagem da NavRail; fecha ao sair, salvo se pinada.
 * O pin persiste em localStorage — mesma ideia do aside CRM do Flow.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const PIN_KEY = "crm:settings:drawer-pinned:v1";
/** Folga pro ponteiro cruzar o spacer entre a NavRail e a coluna da gaveta. */
const CLOSE_DELAY_MS = 320;

/**
 * Pin do menu de Configurações. Default = fixado: sem preferência salva
 * (primeiro acesso) a gaveta sobe aberta e presa. Só respeita o valor
 * salvo quando o usuário já mexeu no pin (chave presente = "0" ou "1").
 */
function readPinned(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PIN_KEY) !== "0";
  } catch {
    return true;
  }
}

type SettingsDrawerContextValue = {
  open: boolean;
  pinned: boolean;
  togglePinned: () => void;
  /** Tour guiado mantém a gaveta aberta mesmo sem hover/pin. */
  setTourOpen: (open: boolean) => void;
  onGearEnter: () => void;
  onGearLeave: () => void;
  onDrawerEnter: () => void;
  onDrawerLeave: () => void;
};

const SettingsDrawerContext = createContext<SettingsDrawerContextValue | null>(
  null,
);

export function SettingsDrawerProvider({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPinned(readPinned());
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    [clearCloseTimer],
  );

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHovering(false);
    }, CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const onGearEnter = useCallback(() => {
    clearCloseTimer();
    setHovering(true);
  }, [clearCloseTimer]);

  const onGearLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  const onDrawerEnter = useCallback(() => {
    clearCloseTimer();
    setHovering(true);
  }, [clearCloseTimer]);

  const onDrawerLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {
        /* private mode / quota */
      }
      if (!next) setHovering(false);
      return next;
    });
  }, []);

  const open = pinned || hovering || tourOpen;

  const value = useMemo(
    () => ({
      open,
      pinned,
      togglePinned,
      setTourOpen,
      onGearEnter,
      onGearLeave,
      onDrawerEnter,
      onDrawerLeave,
    }),
    [
      open,
      pinned,
      togglePinned,
      onGearEnter,
      onGearLeave,
      onDrawerEnter,
      onDrawerLeave,
    ],
  );

  return (
    <SettingsDrawerContext.Provider value={value}>
      {children}
    </SettingsDrawerContext.Provider>
  );
}

export function useSettingsDrawer(): SettingsDrawerContextValue {
  const ctx = useContext(SettingsDrawerContext);
  if (!ctx) {
    // Fora do provider (ex.: preview): gaveta sempre aberta, sem pin.
    return {
      open: true,
      pinned: false,
      togglePinned: () => {},
      setTourOpen: () => {},
      onGearEnter: () => {},
      onGearLeave: () => {},
      onDrawerEnter: () => {},
      onDrawerLeave: () => {},
    };
  }
  return ctx;
}
