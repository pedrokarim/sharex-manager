import { cn } from "@/lib/utils"

/**
 * Case d'attente : un reflet traverse lentement la forme du contenu à venir
 * (`.sxm-skeleton`, dans `global.css`). Une classe `bg-*` change la teinte de
 * fond sans toucher au reflet. Pour passer en douceur du squelette au
 * contenu, l'envelopper dans `LoadingReveal`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("sxm-skeleton rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
