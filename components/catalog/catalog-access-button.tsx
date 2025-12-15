"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export function CatalogAccessButton() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="fixed top-4 right-8 z-[100]">
      <Link
        href="/catalog"
        className="block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={cn(
            "relative flex items-center justify-center",
            "w-14 h-14 rounded-full",
            "bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600",
            "shadow-lg shadow-purple-500/30",
            "transition-all duration-500 ease-out",
            "hover:shadow-2xl hover:shadow-purple-500/50",
            "group cursor-pointer",
            "border-2 border-white/20",
            isHovered ? "translate-y-1 scale-110" : "scale-100"
          )}
        >
          {/* Glow effect */}
          <div
            className={cn(
              "absolute inset-0 rounded-full",
              "bg-purple-500/40 blur-xl scale-150",
              "transition-opacity duration-500",
              isHovered ? "opacity-100" : "opacity-50"
            )}
          />

          {/* Icon */}
          <Globe
            className={cn(
              "h-6 w-6 text-white relative z-10",
              "transition-transform duration-500",
              isHovered && "rotate-[360deg] scale-110"
            )}
          />

          {/* Pulse ring */}
          <div
            className={cn(
              "absolute inset-0 rounded-full border-2 border-white/30",
              "animate-ping",
              isHovered ? "opacity-0" : "opacity-50"
            )}
          />
        </div>

        {/* Tooltip */}
        <div
          className={cn(
            "absolute top-full right-0 mt-2",
            "px-3 py-1.5 rounded-lg",
            "bg-popover text-popover-foreground text-sm font-medium",
            "shadow-lg border border-border",
            "whitespace-nowrap",
            "transition-all duration-300",
            isHovered
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-2 pointer-events-none"
          )}
        >
          Voir le catalogue public
          <div className="absolute -top-1 right-4 w-2 h-2 bg-popover border-l border-t border-border rotate-45" />
        </div>
      </Link>
    </div>
  );
}
