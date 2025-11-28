"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { RotateCcw } from "lucide-react";

interface ResetButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export function ResetButton({ onClick, disabled }: ResetButtonProps) {
  return (
    <TooltipWrapper label="Reset theme">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled={disabled}
        className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </TooltipWrapper>
  );
}
