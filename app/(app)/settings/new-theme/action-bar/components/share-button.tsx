"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Share2 } from "lucide-react";

interface ShareButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export function ShareButton({ onClick, disabled }: ShareButtonProps) {
  return (
    <TooltipWrapper label="Share theme">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled={disabled}
        className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
      >
        <Share2 className="h-4 w-4" />
      </Button>
    </TooltipWrapper>
  );
}
