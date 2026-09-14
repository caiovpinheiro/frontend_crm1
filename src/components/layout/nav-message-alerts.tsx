"use client";

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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Bell, BellOff } from "lucide-react";

import { listEmailAccounts } from "@/features/email-v2/api/accounts";
import { incrementRoomUnreadInCache, useTeamChatRooms } from "@/features/team-chat/hooks";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { subscribeSSEEvents } from "@/hooks/use-sse";
import { useUserRole } from "@/hooks/use-user-role";
import { cn } from "@/lib/utils";

const SOUND_KEY = "bwipo:nav-alert-sound-muted";
const SOUND_EVENT = "bwipo:nav-alert-sound-muted-changed";
const PULSE_MS = 4_000;
const SOUND_DEBOUNCE_MS = 700;

export type NavAlertSource = "team-chat" | "email";

type AlertsValue = {
  chatUnread: number;
  emailUnread: number;
  chatPulse: boolean;
  emailPulse: boolean;
  soundMuted: boolean;
  setSoundMuted: (muted: boolean) => void;
  setActiveTeamChatRoom: (id: string | null) => void;
};

const EMPTY: AlertsValue = {
  chatUnread: 0,
  emailUnread: 0,
  chatPulse: false,
  emailPulse: false,
  soundMuted: false,
  setSoundMuted: () => undefined,
  setActiveTeamChatRoom: () => undefined,
};

const NavMessageAlertsContext = createContext<AlertsValue>(EMPTY);

export function useNavMessageAlerts(): AlertsValue {
  return useContext(NavMessageAlertsContext);
}

export function navAlertForKey(key: string, alerts: AlertsValue): { count: number; pulse: boolean } {
  if (key === "team-chat") return { count: alerts.chatUnread, pulse: alerts.chatPulse };
  if (key === "email") return { count: alerts.emailUnread, pulse: alerts.emailPulse };
  return { count: 0, pulse: false };
}

export function navAlertForHref(href: string, alerts: AlertsValue): { count: number; pulse: boolean } {
  const path = href.split("?")[0] || href;
  if (path === "/bwipo-chat" || path.startsWith("/bwipo-chat/")) {
    return navAlertForKey("team-chat", alerts);
  }
  if (path === "/email" || path.startsWith("/email/")) {
    return navAlertForKey("email", alerts);
  }
  return { count: 0, pulse: false };
}

function canSeeNav(
  key: string,
  perms: readonly string[] | undefined,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  if (!perms) return false;
  return perms.includes("*") || perms.includes("nav:*") || perms.includes(key);
}

function readSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_KEY) === "1";
}

function writeSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_KEY, muted ? "1" : "0");
  window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: { muted } }));
  if (!muted) void resumeNavAlertAudio();
}

let audioCtx: AudioContext | null = null;
let lastPingAt = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx ??= new Ctor();
  return audioCtx;
}

async function resumeNavAlertAudio(): Promise<void> {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

function playNavAlertPing(): void {
  if (readSoundMuted()) return;
  const nowMs = Date.now();
  if (nowMs - lastPingAt < SOUND_DEBOUNCE_MS) return;
  lastPingAt = nowMs;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, at: 0 },
      { freq: 1174.66, at: 0.11 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const t0 = now + n.at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  } catch {
    /* ignore */
  }
}

export function NavAlertSoundToggle({ className }: { className?: string }) {
  const { soundMuted, setSoundMuted } = useNavMessageAlerts();
  return (
    <button
      type="button"
      onClick={() => setSoundMuted(!soundMuted)}
      aria-pressed={!soundMuted}
      aria-label={soundMuted ? "Ativar som de novas mensagens" : "Desligar som de novas mensagens"}
      title={soundMuted ? "Som de novas mensagens desligado" : "Som de novas mensagens ligado"}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {soundMuted ? <BellOff className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />}
    </button>
  );
}

export function NavMessageAlertsProvider({ children }: { children: ReactNode }) {
  const { status, data: session } = useSession();
  const { isSuperAdmin } = useUserRole();
  const { data: myPerms } = useMyPermissions();
  const pathname = usePathname() ?? "";
  const visible = useDocumentVisible();
  const qc = useQueryClient();
  const meId = (session?.user as { id?: string } | undefined)?.id ?? "";

  const ready = status === "authenticated";
  const canChat =
    ready &&
    (canSeeNav("nav:team-chat", myPerms?.permissions, isSuperAdmin) ||
      Boolean(myPerms?.permissions?.includes("team_chat:view")));
  const canEmail = ready && canSeeNav("nav:email", myPerms?.permissions, isSuperAdmin);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [soundMuted, setMutedState] = useState(false);
  const [chatPulse, setChatPulse] = useState(false);
  const [emailPulse, setEmailPulse] = useState(false);

  const activeRoomRef = useRef(activeRoomId);
  activeRoomRef.current = activeRoomId;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const meRef = useRef(meId);
  meRef.current = meId;
  const chatPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailBaseline = useRef<number | null>(null);

  const roomsQuery = useTeamChatRooms(canChat);
  const chatUnread = useMemo(
    () => (roomsQuery.data?.rooms ?? []).reduce((n, room) => n + (room.unread || 0), 0),
    [roomsQuery.data?.rooms],
  );

  const emailQuery = useQuery({
    queryKey: ["nav-email-accounts"],
    queryFn: listEmailAccounts,
    enabled: canEmail,
    staleTime: 30_000,
    refetchInterval: visible ? 60_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const emailUnread = useMemo(
    () => (emailQuery.data ?? []).reduce((n, account) => n + (account.unreadCount || 0), 0),
    [emailQuery.data],
  );

  const flash = useCallback((source: NavAlertSource) => {
    const setPulse = source === "team-chat" ? setChatPulse : setEmailPulse;
    const timerRef = source === "team-chat" ? chatPulseTimer : emailPulseTimer;
    setPulse(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPulse(false), PULSE_MS);
    playNavAlertPing();
  }, []);

  useEffect(() => {
    setMutedState(readSoundMuted());
    const sync = () => setMutedState(readSoundMuted());
    window.addEventListener(SOUND_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SOUND_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const unlock = () => void resumeNavAlertAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!canChat) return;
    return subscribeSSEEvents("/api/sse/messages", {
      team_chat_room_updated: () => {
        void qc.invalidateQueries({ queryKey: ["team-chat-rooms"] });
      },
      team_chat_message: (raw) => {
        const data = raw as {
          roomId?: string;
          memberIds?: string[];
          message?: { authorId?: string | null; kind?: string };
        };
        const myId = meRef.current;
        const members = data.memberIds;
        const knownRooms = qc.getQueryData<{ rooms: { id: string; muted?: boolean }[] }>(["team-chat-rooms"]);
        const inCachedRoom = Boolean(
          data.roomId && knownRooms?.rooms.some((room) => room.id === data.roomId),
        );
        const isMember = Array.isArray(members)
          ? Boolean(myId && members.includes(myId))
          : inCachedRoom;
        if (!isMember) return;

        const isOwn = Boolean(data.message?.authorId && data.message.authorId === myId);
        const isSystem = data.message?.kind === "SYSTEM";
        const viewingActiveRoom =
          Boolean(data.roomId) &&
          data.roomId === activeRoomRef.current &&
          pathnameRef.current.startsWith("/bwipo-chat") &&
          document.visibilityState === "visible";

        if (data.roomId && !isOwn && !isSystem && !viewingActiveRoom) {
          incrementRoomUnreadInCache(qc, data.roomId);
        }
        void qc.invalidateQueries({ queryKey: ["team-chat-rooms"] });

        if (!Array.isArray(members) && !inCachedRoom) return;
        if (!data.message || isSystem) return;
        if (isOwn) return;

        const mutedRoom = Boolean(
          data.roomId && knownRooms?.rooms.some((room) => room.id === data.roomId && room.muted),
        );
        if (mutedRoom) return;
        if (viewingActiveRoom) return;

        flash("team-chat");
      },
    });
  }, [canChat, flash, qc]);

  useEffect(() => {
    if (!canEmail || emailQuery.data === undefined) return;
    const next = emailUnread;
    if (emailBaseline.current === null) {
      emailBaseline.current = next;
      return;
    }
    if (next > emailBaseline.current) {
      const viewingInbox =
        pathnameRef.current.startsWith("/email") && document.visibilityState === "visible";
      if (!viewingInbox) flash("email");
    }
    emailBaseline.current = next;
  }, [canEmail, emailQuery.data, emailUnread, flash]);

  useEffect(
    () => () => {
      if (chatPulseTimer.current) clearTimeout(chatPulseTimer.current);
      if (emailPulseTimer.current) clearTimeout(emailPulseTimer.current);
    },
    [],
  );

  const setSoundMuted = useCallback((muted: boolean) => {
    writeSoundMuted(muted);
    setMutedState(muted);
  }, []);

  const value = useMemo<AlertsValue>(
    () => ({
      chatUnread,
      emailUnread,
      chatPulse,
      emailPulse,
      soundMuted,
      setSoundMuted,
      setActiveTeamChatRoom: setActiveRoomId,
    }),
    [chatUnread, emailUnread, chatPulse, emailPulse, soundMuted, setSoundMuted],
  );

  return <NavMessageAlertsContext.Provider value={value}>{children}</NavMessageAlertsContext.Provider>;
}
