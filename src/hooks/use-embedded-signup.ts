"use client";

import { apiUrl } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: {
        appId: string;
        autoLogAppEvents: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FBLoginResponse) => void,
        options: {
          config_id: string;
          response_type: string;
          override_default_response_type: boolean;
          extras: { setup: Record<string, unknown> };
        },
      ) => void;
    };
    __ES_CONFIG__?: { appId: string; configId: string };
  }
}

type FBLoginResponse = {
  authResponse?: { code: string } | null;
  status?: string;
};

export type EmbeddedSignupResult = {
  code: string;
  phoneNumberId: string;
  wabaId: string;
};

type EmbeddedSignupState = {
  sdkReady: boolean;
  loading: boolean;
  error: string | null;
  result: EmbeddedSignupResult | null;
  isConfigured: boolean;
};

function loadFBSDK(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    const existingScript = document.getElementById("facebook-jssdk");
    if (existingScript) {
      const check = setInterval(() => {
        if (window.FB) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Facebook SDK timeout"));
      }, 15000);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB!.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: "v21.0",
      });
      resolve();
    };

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("Falha ao carregar Facebook SDK."));
    document.body.appendChild(script);
  });
}

export function useEmbeddedSignup() {
  const [state, setState] = useState<EmbeddedSignupState>({
    sdkReady: false,
    loading: false,
    error: null,
    result: null,
    isConfigured: false,
  });

  const configRef = useRef<{ appId: string; configId: string } | null>(null);
  const sessionDataRef = useRef<{
    phoneNumberId?: string;
    wabaId?: string;
  }>({});

  const resolveRef = useRef<((r: EmbeddedSignupResult) => void) | null>(null);
  const rejectRef = useRef<((e: Error) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(apiUrl("/api/config/public"))
      .then((res) => res.json())
      .then((data: { metaAppId: string; metaEsConfigId: string; embeddedSignupConfigured: boolean }) => {
        if (cancelled) return;
        if (!data.embeddedSignupConfigured) return;

        configRef.current = { appId: data.metaAppId, configId: data.metaEsConfigId };
        setState((s) => ({ ...s, isConfigured: true }));

        loadFBSDK(data.metaAppId)
          .then(() => {
            if (!cancelled) setState((s) => ({ ...s, sdkReady: true }));
          })
          .catch((err) => {
            if (!cancelled)
              setState((s) => ({
                ...s,
                error: err instanceof Error ? err.message : "Erro ao carregar SDK.",
              }));
          });
      })
      .catch(() => {
        // Config endpoint not available — embedded signup disabled
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!state.isConfigured) return;

    const handleMessage = (event: MessageEvent) => {
      if (
        typeof event.origin !== "string" ||
        !event.origin.endsWith("facebook.com")
      )
        return;

      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

        if (data.event === "CANCEL") {
          rejectRef.current?.(new Error("Fluxo cancelado pelo usuário."));
          rejectRef.current = null;
          resolveRef.current = null;
          return;
        }

        if (data.data?.phone_number_id) {
          sessionDataRef.current.phoneNumberId = String(
            data.data.phone_number_id,
          );
        }
        if (data.data?.waba_id) {
          sessionDataRef.current.wabaId = String(data.data.waba_id);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [state.isConfigured]);

  const launchSignup = useCallback((): Promise<EmbeddedSignupResult> => {
    return new Promise<EmbeddedSignupResult>((resolve, reject) => {
      if (!window.FB) {
        reject(new Error("Facebook SDK não carregado."));
        return;
      }

      if (!configRef.current) {
        reject(new Error("Configuração Embedded Signup não disponível."));
        return;
      }

      sessionDataRef.current = {};
      resolveRef.current = resolve;
      rejectRef.current = reject;

      setState((s) => ({ ...s, loading: true, error: null, result: null }));

      window.FB.login(
        (response: FBLoginResponse) => {
          if (!response.authResponse?.code) {
            const err = new Error(
              "A Meta não concluiu o login. Se a janela mostrou Recurso indisponível, o app ainda está atualizando detalhes adicionais ou o modo estrito recusou o domínio. Tente de novo em alguns minutos.",
            );
            setState((s) => ({ ...s, loading: false, error: err.message }));
            rejectRef.current?.(err);
            rejectRef.current = null;
            resolveRef.current = null;
            return;
          }

          const result: EmbeddedSignupResult = {
            code: response.authResponse.code,
            phoneNumberId: sessionDataRef.current.phoneNumberId ?? "",
            wabaId: sessionDataRef.current.wabaId ?? "",
          };

          setState((s) => ({ ...s, loading: false, result }));
          resolveRef.current?.(result);
          resolveRef.current = null;
          rejectRef.current = null;
        },
        {
          config_id: configRef.current.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {} },
        },
      );
    });
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, loading: false, error: null, result: null }));
    sessionDataRef.current = {};
  }, []);

  return {
    ...state,
    launchSignup,
    reset,
  };
}

/** @deprecated Use useEmbeddedSignup().isConfigured instead */
export const isEmbeddedSignupConfigured = false;
