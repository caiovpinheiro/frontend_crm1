"use client";

/**
 * BlurText — efeito de texto animado (estilo React Bits) que revela cada
 * palavra/letra com desfoque → nítido + deslize, disparado quando entra
 * na viewport.
 *
 * Implementado sobre `framer-motion` (já no projeto) em vez do pacote
 * `motion` para evitar duas cópias da mesma lib (são a mesma engine; ter
 * ambas duplica o contexto de animação). API equivalente à do React Bits.
 *
 * Acessibilidade: o texto completo fica no `aria-label` do container e os
 * fragmentos animados são `aria-hidden` — leitores de tela leem a frase
 * uma vez, sem repetir letra a letra.
 */

import * as React from "react";
import { motion, useInView } from "framer-motion";

import { cn } from "@/lib/utils";

export type BlurTextProps = {
  text: string;
  /** Atraso entre fragmentos, em ms. */
  delay?: number;
  /** Atraso extra antes do primeiro fragmento, em ms. */
  startDelay?: number;
  /** Animar por palavra (padrão) ou por letra. */
  animateBy?: "words" | "letters";
  /** Direção do deslize de entrada. */
  direction?: "top" | "bottom";
  /** Anima só uma vez (padrão) ou toda vez que reentra na viewport. */
  once?: boolean;
  className?: string;
};

export function BlurText({
  text,
  delay = 110,
  startDelay = 0,
  animateBy = "words",
  direction = "top",
  once = true,
  className,
}: BlurTextProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { amount: 0.3, once });

  const segments = React.useMemo(
    () => (animateBy === "words" ? text.split(" ") : Array.from(text)),
    [text, animateBy],
  );
  const fromY = direction === "top" ? -14 : 14;

  return (
    <span
      ref={ref}
      aria-label={text}
      className={cn("inline-flex flex-wrap", className)}
    >
      {segments.map((seg, i) => (
        <motion.span
          key={`${seg}-${i}`}
          aria-hidden
          className="inline-block will-change-[transform,opacity,filter]"
          initial={{ opacity: 0, y: fromY, filter: "blur(10px)" }}
          animate={
            inView
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0, y: fromY, filter: "blur(10px)" }
          }
          transition={{
            duration: 0.5,
            delay: (startDelay + i * delay) / 1000,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          {seg === "" ? "\u00A0" : seg}
          {animateBy === "words" && i < segments.length - 1 ? "\u00A0" : null}
        </motion.span>
      ))}
    </span>
  );
}
