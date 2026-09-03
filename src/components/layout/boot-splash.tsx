"use client";

import { useEffect, useState } from "react";

import { BLoader } from "@/components/crm/b-loader";

const MIN_MS = 2400;
const MAX_MS = 4000;
const EXIT_MS = 500;

/**
 * Splash do primeiro HTML: logo full, app atrás invisível (`html.bl-booting`).
 * Some depois de um ciclo mínimo — navegações client não remontam.
 */
export function BootSplash() {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    const started = Date.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const wait = reduce ? 0 : Math.max(0, MIN_MS - (Date.now() - started));
      window.setTimeout(() => {
        document.documentElement.classList.remove("bl-booting");
        setPhase("out");
        window.setTimeout(() => setPhase("gone"), reduce ? 0 : EXIT_MS);
      }, wait);
    };

    const max = window.setTimeout(finish, reduce ? 0 : MAX_MS);
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });

    return () => {
      window.clearTimeout(max);
      window.removeEventListener("load", finish);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <BLoader
      id="app-loader"
      size="160px"
      duration="3.6s"
      label="CARREGANDO..."
      steps
      fullscreen
      className={`bl-hero${phase === "out" ? " bl-out" : ""}`}
    />
  );
}
