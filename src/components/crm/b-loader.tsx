"use client";

import * as React from "react";

import {
  B_LOADER_DESIGN_PX,
  B_LOADER_INNER_D,
  B_LOADER_MARK_NATIVE_H,
  B_LOADER_MARK_NATIVE_W,
  B_LOADER_MARK_SRC,
  B_LOADER_OUTER_D,
} from "@/components/crm/b-loader-mark";
import { cn } from "@/lib/utils";

import "./b-loader.css";

export { B_LOADER_MARK_SRC } from "@/components/crm/b-loader-mark";

export type BLoaderProps = {
  size?: string;
  duration?: string;
  /** Texto visível. `null` esconde. */
  label?: string | null;
  steps?: boolean;
  fullscreen?: boolean;
  /** Marca estática (erro / reduced-motion caller). */
  staticMark?: boolean;
  watermark?: boolean;
  className?: string;
  id?: string;
};

/** Modelo do ZIP é 190px com stroke 5 / head 9 no viewBox 719. */
function strokeWidthFor(size: string) {
  const px = Number.parseFloat(size) || 72;
  return String((5 * B_LOADER_DESIGN_PX) / px);
}

function headRadiusFor(size: string) {
  const px = Number.parseFloat(size) || 72;
  return String((9 * B_LOADER_DESIGN_PX) / px);
}

export function BLoader({
  size = "72px",
  duration = "3.6s",
  label = "CARREGANDO...",
  steps = true,
  fullscreen = false,
  staticMark = false,
  watermark = false,
  className,
  id,
}: BLoaderProps) {
  const reactId = React.useId().replace(/:/g, "");
  const outerId = `bl-outer-${reactId}`;
  const animate = !staticMark && !watermark;
  const headR = headRadiusFor(size);

  return (
    <div
      id={id}
      className={cn(
        "bl-loader",
        fullscreen && "bl-fullscreen",
        staticMark && "bl-static",
        watermark && "bl-watermark",
        className,
      )}
      style={
        {
          "--bl-size": size,
          "--bl-duration": duration,
          "--bl-stroke-width": strokeWidthFor(size),
        } as React.CSSProperties
      }
      role="status"
      aria-live="polite"
      aria-label={label || "Carregando"}
    >
      <div className="bl-stage">
        <img
          className="bl-mark"
          src={B_LOADER_MARK_SRC}
          alt=""
          width={B_LOADER_MARK_NATIVE_W}
          height={B_LOADER_MARK_NATIVE_H}
          decoding="async"
          draggable={false}
        />
        {animate ? (
          <svg
            className="bl-trace"
            viewBox={`0 0 ${B_LOADER_MARK_NATIVE_W} ${B_LOADER_MARK_NATIVE_H}`}
            aria-hidden="true"
          >
            <path id={outerId} className="bl-outer" d={B_LOADER_OUTER_D} />
            <path className="bl-inner" d={B_LOADER_INNER_D} />
            <circle className="bl-head" r={headR}>
              <animateMotion
                dur={duration}
                repeatCount="indefinite"
                keyPoints="0;1;1"
                keyTimes="0;0.55;1"
                calcMode="linear"
              >
                <mpath href={`#${outerId}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                dur={duration}
                repeatCount="indefinite"
                values="1;1;0;0"
                keyTimes="0;0.55;0.6;1"
              />
            </circle>
          </svg>
        ) : null}
      </div>

      {!watermark && (label || steps) ? (
        <div className="bl-status">
          {label ? <p className="bl-label">{label}</p> : null}
          {steps ? (
            <div className="bl-steps">
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
