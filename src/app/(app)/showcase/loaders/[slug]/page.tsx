"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { isLoaderSlug, LoaderPreview, LOADER_VARIANTS } from "../variants";

export default function LoaderFullscreenPage() {
  const raw = String(useParams().slug ?? "");
  if (!isLoaderSlug(raw)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">Loader não encontrado.</p>
        <Link href="/showcase/loaders" className="text-sm font-semibold text-primary">
          Voltar
        </Link>
      </div>
    );
  }

  const meta = LOADER_VARIANTS.find((v) => v.slug === raw);

  return (
    <div className="fixed inset-0 z-[80]">
      <LoaderPreview slug={raw} className="min-h-full" />
      <Link
        href="/showcase/loaders"
        className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[12px] font-semibold text-white/80 backdrop-blur-sm hover:text-white"
      >
        Voltar · {meta?.title}
      </Link>
    </div>
  );
}
