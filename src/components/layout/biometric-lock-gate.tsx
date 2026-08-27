"use client";

/**
 * Cadeado biométrico do APK (ver AGENT.md § Biometria no APK, escopo A).
 *
 * Bloqueia a UI com um overlay full-screen enquanto:
 *   - roda dentro do WebView nativo (Capacitor), E
 *   - a sessão está autenticada, E
 *   - o operador ligou o toggle "Desbloquear com biometria" no Perfil
 *     (`crm_biometric_lock_enabled` no localStorage).
 *
 * Reavalia em dois momentos: cold start (mount) e quando o app volta a
 * ficar ativo após ter ficado inativo (`App.appStateChange`). Um grace
 * period curto evita re-bloquear em transições rápidas (flicker) — ex.:
 * abrir o teclado ou um seletor de arquivo, que podem gerar um blip de
 * inactive/active sem o usuário de fato ter saído do app.
 *
 * No-op completo fora do Capacitor (web/desktop): nunca monta o overlay.
 */

import * as React from "react";
import { useSession, signOut } from "next-auth/react";
import { IconFingerprint, IconLogout } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { getNativeAppPlugin, isNativePlatform } from "@/lib/native/capacitor";
import { isBiometricLockEnabled, verifyBiometric } from "@/lib/native/biometric";

const RESUME_GRACE_MS = 2000;

export function BiometricLockGate() {
  const { status } = useSession();
  const [native, setNative] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const inactiveSinceRef = React.useRef<number | null>(null);
  const authenticated = status === "authenticated";

  React.useEffect(() => {
    setNative(isNativePlatform());
  }, []);

  // Cold start: se as condições já estiverem satisfeitas quando a sessão
  // resolve, bloqueia direto.
  React.useEffect(() => {
    if (!native) return;
    if (authenticated && isBiometricLockEnabled()) {
      setLocked(true);
    }
  }, [native, authenticated]);

  React.useEffect(() => {
    if (!native) return;

    const appPlugin = getNativeAppPlugin();
    if (!appPlugin) return;

    let handle: { remove(): void | Promise<void> } | undefined;
    let cancelled = false;

    void Promise.resolve(
      appPlugin.addListener("appStateChange", (state) => {
        if (!state.isActive) {
          inactiveSinceRef.current = Date.now();
          return;
        }

        const inactiveSince = inactiveSinceRef.current;
        inactiveSinceRef.current = null;
        if (inactiveSince == null) return;

        const elapsed = Date.now() - inactiveSince;
        if (elapsed < RESUME_GRACE_MS) return;

        if (authenticated && isBiometricLockEnabled()) {
          setFailed(false);
          setLocked(true);
        }
      }),
    ).then((h) => {
      if (cancelled) {
        void h.remove();
      } else {
        handle = h;
      }
    });

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [native, authenticated]);

  if (!native || !locked) return null;

  async function handleUnlock() {
    setVerifying(true);
    setFailed(false);
    try {
      const ok = await verifyBiometric("Confirme sua identidade para continuar");
      if (ok) {
        setLocked(false);
      } else {
        setFailed(true);
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-[#0d1b3e]/97 px-6 backdrop-blur-xl">
      <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.06] p-8 text-center shadow-[var(--glass-shadow-lg)] backdrop-blur-md">
        <div className="flex size-16 items-center justify-center rounded-full bg-white/10">
          <IconFingerprint className="size-8 text-white" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-white">Bwipo bloqueado</h2>
          <p className="mt-1.5 text-sm leading-snug text-white/70">
            Confirme sua identidade para continuar.
          </p>
          {failed ? (
            <p className="mt-2 text-[12px] leading-snug text-red-300">
              Não foi possível verificar sua identidade. Tente novamente.
            </p>
          ) : null}
        </div>
        <ButtonGlass
          type="button"
          variant="primary"
          onClick={handleUnlock}
          disabled={verifying}
          className="h-11 w-full text-sm disabled:opacity-60"
        >
          <IconFingerprint className="size-4" aria-hidden />
          {verifying ? "Verificando..." : "Desbloquear"}
        </ButtonGlass>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/60 transition-colors hover:text-white"
        >
          <IconLogout className="size-3.5" aria-hidden />
          Sair da conta
        </button>
      </div>
    </div>
  );
}
