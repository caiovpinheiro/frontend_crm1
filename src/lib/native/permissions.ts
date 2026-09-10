/**
 * Permissões de mídia/notificação do APK (ver AGENT.md § Permissões
 * Android do APK).
 *
 * `ensureMicrophonePermission` / `ensureCameraPermission` funcionam igual
 * em browser e no WebView nativo: chamam `getUserMedia` (que já dispara o
 * prompt do navegador ou, no APK, o `BridgeWebChromeClient` do Capacitor —
 * desde que a permissão exista no AndroidManifest) e fecham a stream
 * imediatamente. O caller usa o resultado só como pré-check; a stream real
 * é aberta de novo por quem for usá-la (gravação, softphone, WebRTC etc.).
 *
 * `ensureNotificationPermission` cobre o Web Push atual (Notification API
 * + Service Worker). No APK, POST_NOTIFICATIONS habilita o prompt nativo,
 * mas o WebView não tem um push service próprio — se o Web Push do SW não
 * entregar notificações em background no APK, o próximo passo é migrar
 * para @capacitor/push-notifications + FCM (não implementado nesta fase).
 */

import { isNativePlatform } from "@/lib/native/capacitor";

export interface MediaPermissionResult {
  ok: boolean;
  error?: string;
}

function mediaErrorMessage(err: unknown, label: string): string {
  const name = (err as { name?: string })?.name ?? "";
  switch (name) {
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `Nenhum${label === "câmera" ? "a" : ""} ${label} encontrad${label === "câmera" ? "a" : "o"} neste aparelho.`;
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return `Acesso ${label === "câmera" ? "à câmera" : "ao microfone"} bloqueado. Permita nas configurações do app.`;
    case "NotReadableError":
    case "TrackStartError":
      return `${label === "câmera" ? "Câmera" : "Microfone"} em uso por outro aplicativo.`;
    case "OverconstrainedError":
      return "Configuração de mídia não suportada neste aparelho.";
    default:
      return `Não foi possível acessar ${label === "câmera" ? "a câmera" : "o microfone"}.`;
  }
}

async function ensureMediaPermission(
  constraints: MediaStreamConstraints,
  label: "microfone" | "câmera",
): Promise<MediaPermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: `Acesso a ${label} não suportado neste navegador.` };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mediaErrorMessage(err, label) };
  }
}

/** Pré-checa/pede permissão de microfone. Funciona igual em browser e no APK. */
export function ensureMicrophonePermission(): Promise<MediaPermissionResult> {
  return ensureMediaPermission({ audio: true }, "microfone");
}

/**
 * Abre o microfone numa única chamada a `getUserMedia` (pede permissão se
 * necessário) e devolve a stream. Usar no gravador de voz — o pré-check
 * `ensureMicrophonePermission` abre e fecha a stream, o que no deal detail
 * (página pesada) dobra o delay até a gravação começar.
 */
export async function openMicrophoneStream(
  audio: boolean | MediaTrackConstraints = true,
): Promise<{ ok: true; stream: MediaStream } | { ok: false; error: string }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "Acesso ao microfone não suportado neste navegador." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    return { ok: true, stream };
  } catch (err) {
    return { ok: false, error: mediaErrorMessage(err, "microfone") };
  }
}

/** Pré-checa/pede permissão de câmera. Funciona igual em browser e no APK. */
export function ensureCameraPermission(): Promise<MediaPermissionResult> {
  return ensureMediaPermission({ video: true }, "câmera");
}

export interface NotificationPermissionResult {
  ok: boolean;
  status: NotificationPermission | "unsupported";
  error?: string;
}

/**
 * Pede permissão de notificação (Web Push) quando ainda não decidida.
 * No APK, exige POST_NOTIFICATIONS declarado no manifesto (Android 13+);
 * se o push não chegar em background dentro do WebView, o próximo passo
 * é FCM via @capacitor/push-notifications — não implementado aqui.
 */
export async function ensureNotificationPermission(): Promise<NotificationPermissionResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, status: "unsupported", error: "Notificações não suportadas neste navegador." };
  }

  let status = Notification.permission;
  if (status === "default") {
    try {
      status = await Notification.requestPermission();
    } catch {
      return { ok: false, status, error: "Não foi possível solicitar permissão de notificação." };
    }
  }

  if (status !== "granted") {
    const hint = isNativePlatform()
      ? "Notificações bloqueadas. Habilite nas configurações do app."
      : "Notificações bloqueadas. Habilite nas configurações do navegador.";
    return { ok: false, status, error: hint };
  }

  return { ok: true, status };
}
