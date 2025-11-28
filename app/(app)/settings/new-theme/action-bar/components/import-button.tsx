"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Upload } from "lucide-react";

interface ImportButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export function ImportButton({ onClick, disabled }: ImportButtonProps) {
  return (
    <TooltipWrapper label="Import CSS">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled={disabled}
        className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
      >
        <Upload className="h-4 w-4" />
      </Button>
    </TooltipWrapper>
  );
}
