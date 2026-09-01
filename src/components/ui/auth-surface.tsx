"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

/** Força tokens claros mesmo com <html class="dark|v2-dark">. */
export const AUTH_LIGHT_CLASS = "auth-light";

export const AUTH_CARD_CLASS =
  "auth-light relative flex w-full flex-col gap-4 rounded-2xl border border-border bg-background p-6 text-foreground shadow-xl md:p-8";

/** Card sólido das telas de auth (mesmo casco do signup na landing). */
export function AuthSurface({
  children,
  className,
  maxWidthClass = "max-w-sm",
}: {
  children: ReactNode;
  className?: string;
  maxWidthClass?: string;
}) {
  return (
    <motion.div
      className={cn("relative w-full", maxWidthClass, className)}
      initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(14px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="absolute -inset-2 rounded-3xl bg-linear-to-br from-primary/20 via-primary/5 to-transparent blur-2xl" />
      <div className={AUTH_CARD_CLASS}>{children}</div>
    </motion.div>
  );
}
