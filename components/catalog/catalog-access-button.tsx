"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function CatalogAccessButton() {
  return (
    <div className="fixed bottom-0 right-0 z-[100]">
      <Link
        href="/catalog"
        aria-label="Voir le catalogue public"
        className={cn(
          "group relative block h-[76px] w-[76px] overflow-hidden",
          // Shape: vrai quart de cercle (pas de bords plats)
          "[clip-path:circle(100%_at_100%_100%)]",
          // le bouton = l'arc (plus de rond flottant)
          "bg-primary text-primary-foreground",
          "shadow-2xl shadow-primary/20 ring-1 ring-primary/25",
          // animation "rebond" vers l'intérieur (ancré au coin)
          "origin-bottom-right transition-transform duration-300 ease-out",
          "hover:scale-105 hover:shadow-primary/25",
          "active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "motion-safe:hover:duration-500 motion-safe:hover:[transition-timing-function:cubic-bezier(0.2,1.2,0.2,1)]"
        )}
      >
        {/* Glow interne (reste collé au coin car clip-path + overflow-hidden) */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0",
            "bg-[radial-gradient(circle_at_100%_100%,rgba(255,255,255,0.35),transparent_55%)]",
            "opacity-60 transition-opacity duration-300",
            "group-hover:opacity-100"
          )}
        />

        {/* Icône au centre visuel du quart de cercle (centroïde ~ 0.58R) */}
        <span className="absolute left-[58%] top-[58%] -translate-x-1/2 -translate-y-1/2">
          <Image
            src="/images/logo-sxm-catalog.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 select-none transition-transform duration-500 group-hover:rotate-[360deg] group-hover:scale-110"
            draggable={false}
          />
        </span>
      </Link>
    </div>
  );
}
