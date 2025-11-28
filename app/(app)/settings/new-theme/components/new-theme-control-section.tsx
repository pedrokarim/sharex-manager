"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NewThemeControlSectionProps {
  title: string;
  children: React.ReactNode;
  expanded?: boolean;
  className?: string;
}

const NewThemeControlSection: React.FC<NewThemeControlSectionProps> = ({
  title,
  children,
  expanded = false,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);

  return (
    <div className={cn("border-b border-border pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0", className)}>
      <Button
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-start p-0 h-auto font-medium text-sm hover:bg-transparent"
      >
        {isExpanded ? (
          <ChevronDown className="mr-2 h-4 w-4" />
        ) : (
          <ChevronRight className="mr-2 h-4 w-4" />
        )}
        {title}
      </Button>
      {isExpanded && (
        <div className="mt-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
};

export default NewThemeControlSection;
