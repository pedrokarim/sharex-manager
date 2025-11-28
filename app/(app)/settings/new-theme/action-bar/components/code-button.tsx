"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Code } from "lucide-react";

interface CodeButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export function CodeButton({ onClick, disabled }: CodeButtonProps) {
  return (
    <TooltipWrapper label="View code">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled={disabled}
        className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
      >
        <Code className="h-4 w-4" />
      </Button>
    </TooltipWrapper>
  );
}
