"use client";

/**
 * Lab local dos 8 loadings da arte.
 * Abrir: /showcase/loaders
 * Tela cheia: /showcase/loaders/bar | orbit | dots | orbits | ellipse | scan | particles | ripples
 */

import Link from "next/link";

import { LoaderPreview, LOADER_VARIANTS } from "./variants";

export default function LoadersShowcasePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-5">
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Showcase local
        </p>
        <h1 className="font-display text-[22px] font-bold tracking-tight">
          Loaders
        </h1>
        <p className="text-sm text-muted-foreground">
          Formação é o loader de produção. As outras são o lab antigo. Clique no card para tela cheia.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {LOADER_VARIANTS.map((item) => (
          <Link
            key={item.slug}
            href={`/showcase/loaders/${item.slug}`}
            className="group overflow-hidden rounded-xl border border-border bg-card"
          >
            <LoaderPreview slug={item.slug} className="min-h-[240px]" />
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="text-sm font-semibold text-foreground group-hover:text-primary">
                {item.title}
              </span>
              <span className="text-[12px] text-muted-foreground">{item.hint}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
