"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { MoreHorizontal } from "lucide-react";

interface MoreOptionsProps {
  disabled: boolean;
}

export function MoreOptions({ disabled }: MoreOptionsProps) {
  const handleClick = () => {
    // TODO: Implement more options dropdown
  };

  return (
    <TooltipWrapper label="More options">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={disabled}
        className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </TooltipWrapper>
  );
}
