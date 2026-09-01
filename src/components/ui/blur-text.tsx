"use client";

/**
 * Reveal de texto por palavra: opacity + translate (sem CSS filter).
 * `filter: blur()` em dezenas de spans no load trava o compositor.
 */

import * as React from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

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
  const reduceMotion = useReducedMotion();

  const segments = React.useMemo(
    () => (animateBy === "words" ? text.split(" ") : Array.from(text)),
    [text, animateBy],
  );
  const fromY = direction === "top" ? -10 : 10;

  if (reduceMotion) {
    return <span className={className}>{text}</span>;
  }

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
          className="inline-block"
          initial={{ opacity: 0, y: fromY }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: fromY }}
          transition={{
            duration: 0.35,
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
