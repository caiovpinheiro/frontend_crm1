import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

// Input glass: height 38px, radius 10px, fundo translúcido com blur,
// focus ring brand. Os tokens border-input/bg-background apontam
// pra rgba transparente no @theme — o blur dá a sensação de vidro.
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground shadow-sm transition-all duration-200 outline-none",
          "placeholder:text-muted-foreground",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-primary/40 hover:shadow-md",
          "focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/25",
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "selection:bg-primary/20",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
