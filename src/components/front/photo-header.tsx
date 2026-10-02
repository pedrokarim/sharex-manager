import Image from "next/image";
import type { ReactNode } from "react";

import { FOREST, FRONT_CONTAINER, FRONT_WIDE } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { Reveal } from "@/components/front/reveal";
import { cn } from "@/lib/utils";

/** Photos de nature disponibles dans `public/images/home/`. */
export type FrontPhoto = "mist" | "path" | "pines" | "lake" | "glade";

interface PhotoHeaderProps {
  /** Photo de fond. Ignorée quand la page fournit son propre fond (`backdrop`). */
  photo?: FrontPhoto;
  /** Fond propre à la page, à la place de la photo : la mosaïque du catalogue. */
  backdrop?: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  /** Fin du titre, en italique et en vert clair. */
  titleAccent?: ReactNode;
  description?: ReactNode;
  /** Boutons, champ de recherche, chiffres : ce qui suit le texte. */
  children?: ReactNode;
  /** `hero` ouvre une rubrique, `page` introduit une page intérieure. */
  size?: "hero" | "page";
  /** Texte centré dans une colonne courante, ou calé à gauche de la colonne large. */
  align?: "center" | "left";
}

/**
 * En-tête photographique des pages publiques, dans la veine du héros de
 * l'accueil : une image d'un bord à l'autre de l'écran, assombrie en haut pour
 * porter la barre de navigation, voilée derrière le texte, et fondue dans la
 * page par le bas. Le texte reste au-dessus de ce fondu, pour se lire en clair
 * dans les deux thèmes.
 */
export function PhotoHeader({
  photo = "mist",
  backdrop,
  kicker,
  title,
  titleAccent,
  description,
  children,
  size = "page",
  align = "center",
}: PhotoHeaderProps) {
  const hero = size === "hero";
  const centered = align === "center";

  return (
    <section className={cn("relative isolate flex overflow-hidden text-white", hero ? "min-h-[86vh] items-end" : "items-end")}>
      <div aria-hidden className="absolute inset-0 -z-10" style={{ backgroundColor: FOREST }}>
        {backdrop ?? <Image src={`/images/home/nature-${photo}.webp`} alt="" fill priority sizes="100vw" className="object-cover" />}
        {/* Un fond fait d'images quelconques peut être très clair : on le calme
            d'un voile uni avant les dégradés, sinon le texte s'y perd. Calé à
            gauche, le texte a déjà son dégradé : le voile y reste léger. */}
        {backdrop ? <div className="absolute inset-0" style={{ backgroundColor: centered ? `${FOREST}99` : `${FOREST}40` }} /> : null}
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${FOREST}d9 0%, ${FOREST}66 30%, ${FOREST}40 60%)` }} />
        <div
          className="absolute inset-0"
          style={{
            background: centered
              ? `radial-gradient(ellipse 70% 62% at 50% 58%, ${FOREST}cc 0%, ${FOREST}73 50%, transparent 82%)`
              : `linear-gradient(100deg, ${FOREST}e6 0%, ${FOREST}a6 40%, ${FOREST}4d 72%, ${FOREST}26 100%)`,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div
        className={cn(
          centered ? cn(FRONT_CONTAINER, "text-center") : FRONT_WIDE,
          hero ? "pt-40 pb-36" : "pt-36 pb-32 sm:pt-44",
        )}
      >
        <Reveal immediate>
          {kicker ? <p className="text-xs font-semibold tracking-[0.18em] text-[#bfe6c9] uppercase">{kicker}</p> : null}
          <h1
            className={cn(
              DISPLAY,
              "mt-4 text-balance",
              centered && "mx-auto",
              hero ? "max-w-[16ch] text-5xl leading-[0.98] sm:text-7xl lg:text-[92px]" : "max-w-[20ch] text-5xl leading-[1.02] sm:text-6xl",
            )}
          >
            {title}
            {titleAccent ? (
              <>
                {" "}
                <em className="text-[#bfe6c9]">{titleAccent}</em>
              </>
            ) : null}
          </h1>
        </Reveal>
        {description ? (
          <Reveal immediate delay={0.12}>
            <p className={cn("mt-6 max-w-[54ch] text-pretty text-white/80 sm:text-lg", centered && "mx-auto")}>{description}</p>
          </Reveal>
        ) : null}
        {children ? (
          <Reveal immediate delay={0.22} className="mt-9">
            {children}
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
