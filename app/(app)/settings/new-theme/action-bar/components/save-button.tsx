"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Loader2, Save } from "lucide-react";

interface SaveButtonProps {
  onClick: () => void;
  isSaving: boolean;
  disabled: boolean;
}

export function SaveButton({ onClick, isSaving, disabled }: SaveButtonProps) {
  return (
    <TooltipWrapper label="Save theme">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled={disabled || isSaving}
        className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
      </Button>
    </TooltipWrapper>
  );
}
