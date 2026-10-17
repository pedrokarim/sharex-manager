import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:not-aria-busy:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_[data-slot=spinner]:not([data-sized])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg,>[data-slot=spinner]]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg,>[data-slot=spinner]]:px-1.5 [&_svg:not([class*='size-'])]:size-3 [&_[data-slot=spinner]:not([data-sized])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg,>[data-slot=spinner]]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg,>[data-slot=spinner]]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3 [&_[data-slot=spinner]:not([data-sized])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * `loading` : le bouton travaille. Il se désactive sans pâlir et garde
 * exactement sa taille :
 * - avec une icône en tête, le `Spinner` prend sa place (même taille, même
 *   couleur) et le libellé reste lisible ;
 * - sans icône en tête (libellé seul, icône en fin), le contenu s'efface sur
 *   place et le `Spinner` se pose au centre.
 * Sans effet avec `asChild`, dont l'enfant unique ne peut rien recevoir de plus.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const busy = loading && !asChild

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      className={cn(buttonVariants({ variant, size, className }), busy && "relative")}
      {...props}
    >
      {busy ? busyContent(children) : children}
    </Comp>
  )
}

type ClassNameProps = { className?: string }

const SIZE_CLASS = /(^|\s)(size-|h-\d)/

function busyContent(children: React.ReactNode) {
  const items = React.Children.toArray(children)
  const [first, ...rest] = items

  // Une icône (composant, pas une balise ni un texte) ouvre le bouton : le
  // `Spinner` en reprend les classes, donc la taille et la couleur.
  if (React.isValidElement<ClassNameProps>(first) && typeof first.type !== "string") {
    const iconClass = first.props.className
    return [
      <Spinner
        key="spinner"
        aria-hidden
        className={iconClass}
        data-sized={iconClass && SIZE_CLASS.test(iconClass) ? "" : undefined}
      />,
      ...rest,
    ]
  }

  // Sinon le contenu reste en place, invisible mais lu par les lecteurs
  // d'écran, et le `Spinner` se centre par-dessus.
  return [
    ...items.map((item, index) =>
      React.isValidElement<ClassNameProps>(item) ? (
        React.cloneElement(item, { className: cn(item.props.className, "opacity-0") })
      ) : (
        <span key={`text-${index}`} className="opacity-0">
          {item}
        </span>
      )
    ),
    <span key="spinner" aria-hidden className="absolute inset-0 flex items-center justify-center">
      <Spinner aria-hidden />
    </span>,
  ]
}

export { Button, buttonVariants }
