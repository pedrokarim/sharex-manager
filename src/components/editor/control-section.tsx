import React, { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionContext } from "./section-context";

interface ControlSectionProps {
  title: string;
  children: React.ReactNode;
  expanded?: boolean;
  className?: string;
  headerAction?: React.ReactNode;
}

const ControlSection = ({
  title,
  children,
  expanded = false,
  className,
  headerAction,
}: ControlSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(expanded);

  return (
    <SectionContext.Provider
      value={{
        isExpanded,
        setIsExpanded,
        toggleExpanded: () => setIsExpanded((previous) => !previous),
      }}
    >
      <div className="group/accordion">
        <div className="flex items-center gap-1 py-1">
          <button
            type="button"
            className="group/section flex items-center transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? "Collapse section" : "Expand section"}
          >
            <div className="bg-muted/60 group-hover/section:bg-muted flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 transition-all group-has-focus-within/accordion:border-ring/40">
              <ChevronRight
                className={cn(
                  "text-muted-foreground size-3 transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />
              <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.18em]">
                {title}
              </span>
            </div>
          </button>

          {headerAction}
        </div>

        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className={cn("flex flex-col gap-1 pt-1 pb-2", className)}>
            {children}
          </div>
        </div>
      </div>
    </SectionContext.Provider>
  );
};

export default ControlSection;
