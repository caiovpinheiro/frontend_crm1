"use client";

import type { ReactNode } from "react";

import { BWIPO_MARK_LOADER_SRC } from "@/components/bwipo/bwipo-logo";
import { cn } from "@/lib/utils";

import "./loader-lab.css";

export const LOADER_VARIANTS = [
  { slug: "bar", title: "Barra", hint: "Trilha horizontal com segmento luminoso." },
  { slug: "orbit", title: "Órbita", hint: "Anel ao redor do B com um orbe." },
  { slug: "dots", title: "Pulsos", hint: "Brilho sob a marca + três pontos." },
  { slug: "orbits", title: "Órbitas", hint: "Anéis concêntricos em ritmos diferentes." },
  { slug: "ellipse", title: "Elipse", hint: "Anel inclinado + fila de pontos." },
  { slug: "scan", title: "Scan", hint: "Scan-line no B + barra sólida." },
  { slug: "particles", title: "Partículas", hint: "B se desfaz à direita + faísca." },
  { slug: "ripples", title: "Ondas", hint: "Ripples no chão + waveform." },
] as const;

export type LoaderSlug = (typeof LOADER_VARIANTS)[number]["slug"];

function Mark({
  size = 88,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={BWIPO_MARK_LOADER_SRC}
        alt=""
        width={size}
        height={size}
        draggable={false}
        decoding="async"
        className="loader-lab-mark relative z-[1]"
        style={{ width: size, height: size }}
      />
      {children}
    </span>
  );
}

function Caption() {
  return <p className="loader-lab-caption">CARREGANDO...</p>;
}

function Stack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>{children}</div>
  );
}

function LoaderBar() {
  return (
    <Stack>
      <Mark />
      <div className="loader-lab-bar-track">
        <span className="loader-lab-bar-head" />
      </div>
      <Caption />
    </Stack>
  );
}

function LoaderOrbit() {
  return (
    <Stack>
      <Mark>
        <span className="loader-lab-orbit">
          <span className="loader-lab-orb" />
        </span>
      </Mark>
      <Caption />
    </Stack>
  );
}

function LoaderDots() {
  return (
    <Stack>
      <Mark>
        <span className="loader-lab-glow" />
      </Mark>
      <div className="flex items-center gap-2">
        <span className="loader-lab-dot" style={{ animationDelay: "0ms" }} />
        <span className="loader-lab-dot" style={{ animationDelay: "180ms" }} />
        <span className="loader-lab-dot" style={{ animationDelay: "360ms" }} />
      </div>
      <Caption />
    </Stack>
  );
}

function LoaderOrbits() {
  return (
    <Stack>
      <Mark>
        <span className="loader-lab-ring" style={{ inset: -10, ["--spin" as string]: "2.2s" }}>
          <span className="loader-lab-orb" />
        </span>
        <span className="loader-lab-ring" style={{ inset: -20, ["--spin" as string]: "3.4s" }}>
          <span className="loader-lab-orb" style={{ background: "var(--lab-magenta)" }} />
        </span>
        <span className="loader-lab-ring" style={{ inset: -30, ["--spin" as string]: "4.8s" }}>
          <span className="loader-lab-orb" />
        </span>
      </Mark>
      <Caption />
    </Stack>
  );
}

function LoaderEllipse() {
  return (
    <Stack>
      <Mark>
        <span className="loader-lab-ellipse-wrap">
          <span className="loader-lab-ellipse">
            <span className="loader-lab-orb" />
          </span>
        </span>
      </Mark>
      <div className="loader-lab-dots-track">
        <div className="loader-lab-dots-row">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="loader-lab-cluster">
          <span />
          <span />
          <span />
        </div>
      </div>
      <Caption />
    </Stack>
  );
}

function LoaderScan() {
  return (
    <Stack>
      <Mark className="loader-lab-scan">
        <span className="loader-lab-scan-beam" />
      </Mark>
      <div className="loader-lab-bar-track">
        <span className="loader-lab-bar-head" />
      </div>
      <Caption />
    </Stack>
  );
}

const PARTICLES = [
  { top: 18, left: 62, dx: 18, dy: -10, delay: "0ms" },
  { top: 32, left: 70, dx: 22, dy: 4, delay: "120ms" },
  { top: 48, left: 68, dx: 16, dy: 12, delay: "240ms" },
  { top: 28, left: 58, dx: 26, dy: -4, delay: "360ms" },
  { top: 56, left: 60, dx: 20, dy: 16, delay: "80ms" },
  { top: 40, left: 74, dx: 14, dy: 8, delay: "200ms" },
] as const;

function LoaderParticles() {
  return (
    <Stack>
      <Mark>
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="loader-lab-particle"
            style={{
              top: p.top,
              left: p.left,
              animationDelay: p.delay,
              ["--dx" as string]: `${p.dx}px`,
              ["--dy" as string]: `${p.dy}px`,
            }}
          />
        ))}
      </Mark>
      <div className="loader-lab-line">
        <span className="loader-lab-spark" />
      </div>
      <Caption />
    </Stack>
  );
}

function LoaderRipples() {
  return (
    <Stack className="gap-6">
      <span className="relative inline-flex h-[132px] w-[132px] items-center justify-center">
        <span className="loader-lab-ripple" style={{ animationDelay: "0ms" }} />
        <span className="loader-lab-ripple" style={{ animationDelay: "700ms" }} />
        <span className="loader-lab-ripple" style={{ animationDelay: "1400ms" }} />
        <Mark size={80} />
      </span>
      <svg className="loader-lab-wave" viewBox="0 0 144 24" aria-hidden>
        <defs>
          <linearGradient id="loader-lab-wave-grad" x1="0" y1="0" x2="144" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
        </defs>
        <path d="M0 12 C 16 4, 32 20, 48 12 S 80 4, 96 12 128 20, 144 12">
          <animate
            attributeName="d"
            dur="1.6s"
            repeatCount="indefinite"
            values="
              M0 12 C 16 4, 32 20, 48 12 S 80 4, 96 12 128 20, 144 12;
              M0 12 C 16 20, 32 4, 48 12 S 80 20, 96 12 128 4, 144 12;
              M0 12 C 16 4, 32 20, 48 12 S 80 4, 96 12 128 20, 144 12
            "
          />
        </path>
      </svg>
      <Caption />
    </Stack>
  );
}

const RENDER: Record<LoaderSlug, () => ReactNode> = {
  bar: LoaderBar,
  orbit: LoaderOrbit,
  dots: LoaderDots,
  orbits: LoaderOrbits,
  ellipse: LoaderEllipse,
  scan: LoaderScan,
  particles: LoaderParticles,
  ripples: LoaderRipples,
};

export function LoaderPreview({
  slug,
  className,
}: {
  slug: LoaderSlug;
  className?: string;
}) {
  const Node = RENDER[slug];
  return (
    <div
      className={cn(
        "loader-lab loader-lab-stage flex h-full min-h-[280px] w-full items-center justify-center",
        className,
      )}
    >
      <Node />
    </div>
  );
}

export function isLoaderSlug(value: string): value is LoaderSlug {
  return LOADER_VARIANTS.some((v) => v.slug === value);
}
