/**
 * Cadeado biométrico local do APK (ver AGENT.md § Biometria no APK,
 * escopo A — sem push/Firebase).
 *
 * Só faz sentido dentro do WebView nativo (`isNativePlatform()`). Em
 * browser/desktop toda função aqui retorna um resultado neutro
 * (indisponível / desligado) sem lançar erro, para que o resto do app
 * nunca precise checar a plataforma antes de chamar.
 */

import { getNativeBiometricPlugin, isNativePlatform } from "@/lib/native/capacitor";

export const BIOMETRIC_LOCK_STORAGE_KEY = "crm_biometric_lock_enabled";

const DEFAULT_TITLE = "Bwipo";
const DEFAULT_REASON = "Confirme sua identidade para continuar";

export interface BiometricAvailability {
  isAvailable: boolean;
  biometryType?: string | number;
}

/**
 * Checa se o aparelho tem biometria (ou credencial de dispositivo, via
 * `useFallback: true`) disponível para autenticar. `useFallback` permite
 * que Face Unlock "fraco" ou PIN/padrão do Android também contem —
 * decisão do escopo A para não bloquear aparelhos sem biometria forte.
 */
export async function isBiometricAvailable(): Promise<BiometricAvailability> {
  if (!isNativePlatform()) return { isAvailable: false };

  const plugin = getNativeBiometricPlugin();
  if (!plugin) return { isAvailable: false };

  try {
    const result = await plugin.isAvailable({ useFallback: true });
    return { isAvailable: Boolean(result?.isAvailable), biometryType: result?.biometryType };
  } catch {
    return { isAvailable: false };
  }
}

/**
 * Dispara o prompt nativo de biometria. Resolve `true` em sucesso,
 * `false` em qualquer cancelamento/erro (nunca lança).
 */
export async function verifyBiometric(reason: string = DEFAULT_REASON): Promise<boolean> {
  if (!isNativePlatform()) return false;

  const plugin = getNativeBiometricPlugin();
  if (!plugin) return false;

  try {
    await plugin.verifyIdentity({
      title: DEFAULT_TITLE,
      subtitle: reason,
      reason,
    });
    return true;
  } catch {
    return false;
  }
}

/** Lê a flag local (localStorage) — nunca lança, mesmo em SSR/storage bloqueado. */
export function isBiometricLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Liga/desliga a flag local. Desligar nunca exige biometria (decisão do escopo A). */
export function setBiometricLockEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.setItem(BIOMETRIC_LOCK_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(BIOMETRIC_LOCK_STORAGE_KEY);
    }
  } catch {
    // Storage bloqueado (modo privado, quota etc.) — ignora silenciosamente.
  }
}
