"use client";

import * as React from "react";
import { Tooltip } from "recharts";
import { cn } from "@/lib/utils";

export interface ChartConfig {
  [key: string]: {
    label: string;
    color: string;
    icon?: React.ComponentType;
    theme?: Record<"light" | "dark", string>;
  };
}

export interface ChartContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
  children: React.ReactNode;
}

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: ChartContainerProps) {
  return (
    <div className={cn("h-[300px]", className)} {...props}>
      {children}
    </div>
  );
}

export { Tooltip as ChartTooltip };
