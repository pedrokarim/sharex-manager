"use client";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { Copy, CopyCheck, CopyX } from "lucide-react";
import { ComponentProps } from "react";
import { TooltipWrapper } from "./tooltip-wrapper";
import { Button } from "./ui/button";

interface CopyButtonProps extends ComponentProps<typeof Button> {
  textToCopy: string;
}

/** Bouton de copie : l'icône dit elle-même si la copie a réussi. */
export function CopyButton({ textToCopy, className, ...props }: CopyButtonProps) {
  const { copyToClipboard, hasCopied, copyFailed } = useCopyToClipboard();
  const label = hasCopied ? "Copié" : copyFailed ? "Copie impossible" : "Copier";

  return (
    <TooltipWrapper label={label} asChild>
      <Button
        size="icon"
        variant="ghost"
        className={cn("size-6 [&>svg]:size-3.5", copyFailed && "text-destructive", className)}
        onClick={() => copyToClipboard(textToCopy)}
        {...props}
      >
        {hasCopied ? <CopyCheck /> : copyFailed ? <CopyX /> : <Copy />}
        <span className="sr-only" aria-live="polite">{label}</span>
      </Button>
    </TooltipWrapper>
  );
}
