"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"
import { useReducedMotion } from "framer-motion"
import { Liquid } from "liquid-gooey"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * `indicator="liquid"` (par défaut) : la pastille de l'onglet actif est une
 * goutte qui glisse et s'étire jusqu'à l'onglet choisi (effet « Move » de
 * liquid-gooey, Jakub Antalik). `"none"` garde le fond posé sur l'onglet,
 * pour une barre qui dessine elle-même ses onglets actifs.
 */
function TabsList({
  className,
  variant = "default",
  indicator = "liquid",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants> & {
    indicator?: "liquid" | "none"
  }) {
  // Un état plutôt qu'une ref : la goutte, enfant de la barre, doit se
  // mesurer une fois la barre posée, ce qu'un effet enfant ne voit pas via ref.
  const [list, setList] = React.useState<HTMLDivElement | null>(null)
  const reducedMotion = useReducedMotion()
  const liquid = variant === "default" && indicator === "liquid" && !reducedMotion

  return (
    <TabsPrimitive.List
      ref={setList}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        tabsListVariants({ variant }),
        liquid &&
          "relative isolate [--tabs-indicator:var(--background)] dark:[--tabs-indicator:color-mix(in_oklab,var(--foreground)_14%,var(--muted))]",
        className
      )}
      {...props}
    >
      {liquid ? <LiquidIndicator list={list} /> : null}
      {children}
    </TabsPrimitive.List>
  )
}

interface IndicatorRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Goutte posée sous l'onglet actif, hors du flux : la grille ou le flex de la
 * barre ne la voient pas. Tant qu'elle n'est pas mesurée (rendu serveur), la
 * barre garde le fond habituel de l'onglet actif ; `data-indicator` ne passe
 * à « liquid » qu'une fois la goutte en place.
 */
function LiquidIndicator({ list }: { list: HTMLDivElement | null }) {
  const [rect, setRect] = React.useState<IndicatorRect | null>(null)

  React.useLayoutEffect(() => {
    // La goutte a besoin de ces API (absentes de jsdom) : sans elles, la barre
    // garde le fond habituel de l'onglet actif.
    if (
      !list ||
      typeof ResizeObserver === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }

    const measure = () => {
      const active = list.querySelector<HTMLElement>(
        ":scope > [data-slot=tabs-trigger][data-state=active]"
      )
      setRect(
        active
          ? {
              x: active.offsetLeft,
              y: active.offsetTop,
              width: active.offsetWidth,
              height: active.offsetHeight,
            }
          : null
      )
    }

    measure()
    const mutations = new MutationObserver(measure)
    mutations.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] })
    const sizes = new ResizeObserver(measure)
    sizes.observe(list)
    for (const trigger of list.querySelectorAll(":scope > [data-slot=tabs-trigger]")) {
      sizes.observe(trigger)
    }
    return () => {
      mutations.disconnect()
      sizes.disconnect()
    }
  }, [list])

  React.useEffect(() => {
    if (!list) return
    if (rect) list.dataset.indicator = "liquid"
    else delete list.dataset.indicator
    return () => {
      delete list.dataset.indicator
    }
  }, [list, rect])

  if (!rect) return null

  return (
    <Liquid
      aria-hidden
      className="pointer-events-none"
      // La bibliothèque pose `position: relative` en style : il faut le
      // remplacer par le style, sinon la goutte reprend une case de la barre.
      style={{ position: "absolute", inset: 0, zIndex: -1 }}
      fill="var(--tabs-indicator)"
      shadow="0 1px 2px rgba(0,0,0,.08)"
      blur={5}
      contrast={20}
    >
      <Liquid.Item effect="move">
        <div
          className="absolute rounded-md"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      </Liquid.Item>
    </Liquid>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        // La goutte de `TabsList` dessine l'onglet actif : il devient transparent.
        "group-data-[indicator=liquid]/tabs-list:data-[state=active]:bg-transparent group-data-[indicator=liquid]/tabs-list:data-[state=active]:shadow-none dark:group-data-[indicator=liquid]/tabs-list:data-[state=active]:border-transparent dark:group-data-[indicator=liquid]/tabs-list:data-[state=active]:bg-transparent",
        // Le trait sous l'onglet ne sert qu'à la variante « line ». Invisible ailleurs, il
        // dépassait pourtant de 2 px sous la barre : dans un parent en overflow-x-auto
        // (donc aussi défilable en vertical), une barre de défilement verticale apparaissait.
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100 group-data-[variant=default]/tabs-list:after:hidden",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
