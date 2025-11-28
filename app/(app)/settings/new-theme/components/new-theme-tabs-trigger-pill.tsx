"use client";

import React from "react";
import { TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface NewThemeTabsTriggerPillProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const NewThemeTabsTriggerPill: React.FC<NewThemeTabsTriggerPillProps> = ({
  value,
  children,
  className,
}) => {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
        "data-[state=active]:shadow-sm",
        "hover:bg-muted hover:text-muted-foreground",
        className
      )}
    >
      {children}
    </TabsTrigger>
  );
};

export default NewThemeTabsTriggerPill;
