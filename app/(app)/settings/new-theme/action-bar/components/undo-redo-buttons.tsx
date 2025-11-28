"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Redo, Undo } from "lucide-react";

interface UndoRedoButtonsProps {
  disabled: boolean;
}

export function UndoRedoButtons({ disabled }: UndoRedoButtonsProps) {
  const handleUndo = () => {
    // TODO: Implement undo functionality
  };

  const handleRedo = () => {
    // TODO: Implement redo functionality
  };

  return (
    <>
      <TooltipWrapper label="Undo">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={disabled}
          className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
        >
          <Undo className="h-4 w-4" />
        </Button>
      </TooltipWrapper>
      <TooltipWrapper label="Redo">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={disabled}
          className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </TooltipWrapper>
    </>
  );
}
