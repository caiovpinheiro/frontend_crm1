/**
 * Acesso ao runtime nativo do Capacitor (APK) sem depender de nenhum
 * pacote `@capacitor/*` no bundle do Next.js.
 *
 * Decisão (ver AGENT.md § Biometria no APK): a casca Capacitor vive só em
 * `mobile/` (repo separado por branch `CRM_MOBILE`). O frontend acessa o
 * bridge via `window.Capacitor`, que só existe dentro do WebView do APK —
 * em browser/desktop este objeto é `undefined` e todo o código aqui faz
 * no-op.
 */

export type NativeBiometryType =
  | "none"
  | "touchId"
  | "faceId"
  | "fingerprint"
  | "faceAuthentication"
  | "irisAuthentication"
  | "multiple"
  | "deviceCredential";

export interface NativeBiometricAvailableResult {
  isAvailable: boolean;
  biometryType?: NativeBiometryType | number;
  errorCode?: number;
}

export interface NativeBiometricVerifyOptions {
  reason?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  negativeButtonText?: string;
  maxAttempts?: number;
}

export interface NativeBiometricPlugin {
  isAvailable(options?: { useFallback?: boolean }): Promise<NativeBiometricAvailableResult>;
  verifyIdentity(options?: NativeBiometricVerifyOptions): Promise<void>;
}

export type AppStateChangeListener = (state: { isActive: boolean }) => void;

export interface AppPluginListenerHandle {
  remove(): void | Promise<void>;
}

export interface NativeAppPlugin {
  addListener(
    eventName: "appStateChange",
    listener: AppStateChangeListener,
  ): Promise<AppPluginListenerHandle> | AppPluginListenerHandle;
}

export interface NativeAppUpdateVersion {
  versionCode: number;
  versionName: string;
}

export interface NativeAppUpdateDownloadOptions {
  url: string;
}

export interface NativeAppUpdateBooleanResult {
  value: boolean;
}

/** Plugin nativo "Atualizar sem APK" (ver AGENT.md § Atualizar sem APK). */
export interface NativeAppUpdatePlugin {
  getNativeVersion(): Promise<NativeAppUpdateVersion>;
  downloadAndInstall(options: NativeAppUpdateDownloadOptions): Promise<void>;
  canInstallPackages(): Promise<NativeAppUpdateBooleanResult>;
  openInstallPermissionSettings(): Promise<void>;
}

export interface CapacitorPluginsMap {
  NativeBiometric?: NativeBiometricPlugin;
  App?: NativeAppPlugin;
  AppUpdate?: NativeAppUpdatePlugin;
  PushNotifications?: unknown;
  [pluginName: string]: unknown;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: CapacitorPluginsMap;
}

function getCapacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** `true` apenas dentro do WebView do APK (Android/iOS via Capacitor). */
export function isNativePlatform(): boolean {
  const capacitor = getCapacitorGlobal();
  try {
    return capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

/** Acesso tipado aos plugins nativos registrados no bridge do Capacitor. */
export function getCapacitorPlugins(): CapacitorPluginsMap | undefined {
  return getCapacitorGlobal()?.Plugins;
}

export function getNativeBiometricPlugin(): NativeBiometricPlugin | undefined {
  return getCapacitorPlugins()?.NativeBiometric;
}

export function getNativeAppPlugin(): NativeAppPlugin | undefined {
  return getCapacitorPlugins()?.App;
}

export function getAppUpdatePlugin(): NativeAppUpdatePlugin | undefined {
  return getCapacitorPlugins()?.AppUpdate;
}

type NativeStatusBarPlugin = {
  setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void>;
  setBackgroundColor?: (options: { color: string }) => Promise<void>;
  setStyle?: (options: { style: string }) => Promise<void>;
};

/** Status bar sobre a faixa nativa reservada no APK; não usar overlay:false no SDK 35. */
export function syncNativeStatusBar(isDark: boolean): void {
  if (!isNativePlatform()) return;
  const bar = getCapacitorPlugins()?.StatusBar as NativeStatusBarPlugin | undefined;
  if (!bar) return;
  const color = isDark ? "#0d1b3e" : "#f4f6fb";
  void bar.setOverlaysWebView?.({ overlay: true });
  void bar.setBackgroundColor?.({ color });
  void bar.setStyle?.({ style: isDark ? "LIGHT" : "DARK" });
}
