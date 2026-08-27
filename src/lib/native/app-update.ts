/**
 * "Atualizar sem APK" (ver AGENT.md § Atualizar sem APK).
 *
 * Duas camadas de atualização coexistem no APK:
 *   - Camada A (deploy web): UI/features do CRM chegam via bundle remoto
 *     normal, sem precisar de APK novo. Cobertos por `MobileAppUpdateDialog`.
 *   - Camada B (este módulo): quando a CASCA nativa muda (plugins,
 *     permissões, ícone), o app baixa e instala um APK publicado
 *     manualmente, comparando o `versionCode` nativo local contra
 *     `public/mobile-release.json`.
 *
 * Nunca lança em browser/desktop — `checkNativeAppUpdate` sempre resolve
 * `null` fora do WebView do APK.
 */

import { getAppUpdatePlugin, isNativePlatform } from "@/lib/native/capacitor";
import { resolveMobileReleaseManifestUrl } from "@/lib/native/mobile-release-config";

const THROTTLE_KEY = "crm_native_update_checked_at";
const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h

export interface MobileReleaseInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  force: boolean;
  notes: string;
}

export interface NativeAppUpdateInfo {
  release: MobileReleaseInfo;
  localVersionCode: number;
  localVersionName: string;
}

function readThrottleTimestamp(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(THROTTLE_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeThrottleTimestamp(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THROTTLE_KEY, String(Date.now()));
  } catch {
    // Storage bloqueado (modo privado, quota etc.) — ignora silenciosamente.
  }
}

function parseMobileRelease(data: Partial<MobileReleaseInfo>): MobileReleaseInfo | null {
  if (typeof data.versionCode !== "number") return null;
  return {
    versionCode: data.versionCode,
    versionName: typeof data.versionName === "string" ? data.versionName : "",
    apkUrl: typeof data.apkUrl === "string" ? data.apkUrl.trim() : "",
    force: Boolean(data.force),
    notes: typeof data.notes === "string" ? data.notes : "",
  };
}

/**
 * Busca o manifesto no serviço de releases (EasyPanel separado).
 * Fallback: `/mobile-release.json` no host do CRM (compat).
 */
export async function fetchMobileRelease(): Promise<MobileReleaseInfo | null> {
  const bust = `t=${Date.now()}`;
  const candidates = [
    `${resolveMobileReleaseManifestUrl()}?${bust}`,
    `/mobile-release.json?${bust}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<MobileReleaseInfo>;
      const parsed = parseMobileRelease(data);
      if (parsed) return parsed;
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

/**
 * Compara a versão nativa instalada com `mobile-release.json`. Retorna
 * `null` em browser/desktop, quando não há plugin/atualização, quando
 * `apkUrl` está vazio ou quando o check foi throttled (a menos que
 * `force: true` seja passado).
 */
export async function checkNativeAppUpdate(
  options: { force?: boolean } = {},
): Promise<NativeAppUpdateInfo | null> {
  if (!isNativePlatform()) return null;

  const plugin = getAppUpdatePlugin();
  if (!plugin) return null;

  const release = await fetchMobileRelease();
  if (!release || !release.apkUrl) {
    writeThrottleTimestamp();
    return null;
  }

  let localVersionCode: number;
  let localVersionName: string;
  try {
    const version = await plugin.getNativeVersion();
    localVersionCode = Number(version.versionCode) || 0;
    localVersionName = version.versionName ?? "";
  } catch {
    return null;
  }

  if (release.versionCode <= localVersionCode) {
    writeThrottleTimestamp();
    return null;
  }

  // Updates com force: true sempre aparecem; as opcionais respeitam throttle 12h.
  const bypassThrottle = options.force || release.force;
  if (!bypassThrottle) {
    const lastChecked = readThrottleTimestamp();
    if (Date.now() - lastChecked < THROTTLE_MS) return null;
  }

  writeThrottleTimestamp();
  return { release, localVersionCode, localVersionName };
}

/**
 * Baixa e dispara a instalação do APK. Se a permissão "instalar apps
 * desconhecidos" estiver faltando, abre a tela de configurações do
 * Android e lança um erro em português orientando o usuário a tentar de
 * novo após conceder.
 */
export async function installNativeUpdate(apkUrl: string): Promise<void> {
  const plugin = getAppUpdatePlugin();
  if (!plugin) {
    throw new Error("Atualização nativa não disponível neste ambiente.");
  }

  let canInstall: boolean;
  try {
    const permission = await plugin.canInstallPackages();
    canInstall = Boolean(permission.value);
  } catch {
    throw new Error("Não foi possível verificar a permissão de instalação.");
  }

  if (!canInstall) {
    try {
      await plugin.openInstallPermissionSettings();
    } catch {
      // Ignora — a mensagem abaixo já orienta o usuário mesmo se a tela não abrir.
    }
    throw new Error(
      'Permissão necessária: ative "Instalar apps desconhecidos" para o Bwipo e tente novamente.',
    );
  }

  try {
    await plugin.downloadAndInstall({ url: apkUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao baixar/instalar a atualização: ${message}`);
  }
}
