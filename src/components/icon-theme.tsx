"use client";

/**
 * Jeu d'icônes de l'interface, côté navigateur.
 *
 * Le jeu publié arrive du serveur avec la page : la barre latérale est peinte
 * d'emblée avec les bonnes icônes, sans repli Lucide ni changement après
 * l'hydratation. Un aperçu (page « Thème global ») remplace tout le jeu d'un
 * seul coup, à partir de données déjà chargées : rien ne clignote.
 */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ICON_CONCEPTS,
  LUCIDE_CONCEPT_ICONS,
  type IconConcept,
  type IconSetData,
} from "@/lib/icon-themes/registry";

/** Ce qu'accepte une icône de navigation : une icône Lucide ou une icône du jeu. */
export type IconComponent = ComponentType<{ className?: string }>;

interface IconThemeValue {
  /** Le jeu dessiné en ce moment : l'aperçu s'il y en a un, sinon le jeu publié. */
  active: IconSetData;
  published: IconSetData;
  /** Montre un autre jeu partout, sans l'enregistrer ; `null` revient au jeu publié. */
  preview: (data: IconSetData | null) => void;
  /** Le jeu vient d'être enregistré : il devient le jeu publié. */
  publish: (data: IconSetData) => void;
}

const IconThemeContext = createContext<IconThemeValue | null>(null);

export function IconThemeProvider({ initial, children }: { initial: IconSetData; children: ReactNode }) {
  const [published, setPublished] = useState(initial);
  const [previewed, setPreviewed] = useState<IconSetData | null>(null);
  const preview = useCallback((data: IconSetData | null) => setPreviewed(data), []);
  const publish = useCallback((data: IconSetData) => {
    setPublished(data);
    setPreviewed(null);
  }, []);
  const value = useMemo(
    () => ({ active: previewed ?? published, published, preview, publish }),
    [previewed, published, preview, publish],
  );
  return <IconThemeContext.Provider value={value}>{children}</IconThemeContext.Provider>;
}

export function useIconTheme(): IconThemeValue | null {
  return useContext(IconThemeContext);
}

/**
 * Les dégradés des jeux en couleur portent des identifiants : répétés d'une
 * icône à l'autre, une icône masquée (section repliée) casserait les
 * dégradés de toutes les autres. Chaque rendu reçoit donc les siens.
 */
export function scopeSvgIds(body: string, scope: string): string {
  if (!body.includes("id=")) return body;
  return body
    .replace(/\bid="([^"]+)"/g, `id="$1-${scope}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1-${scope})`)
    .replace(/(xlink:)?href="#([^"]+)"/g, (_match, xlink: string | undefined, id: string) => `${xlink ?? ""}href="#${id}-${scope}"`);
}

interface ThemedIconProps {
  concept: IconConcept;
  className?: string;
}

/** L'icône d'un concept dans le jeu actif ; Lucide si le jeu est Lucide ou n'a pas ce concept. */
export function ThemedIcon({ concept, className }: ThemedIconProps) {
  const theme = useContext(IconThemeContext);
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const glyph = theme?.active.icons[concept];
  if (!glyph) {
    const Lucide = LUCIDE_CONCEPT_ICONS[concept];
    return <Lucide className={className} />;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={glyph.viewBox}
      width={24}
      height={24}
      className={className}
      aria-hidden="true"
      focusable="false"
      data-icon-concept={concept}
      dangerouslySetInnerHTML={{ __html: scopeSvgIds(glyph.body, scope) }}
    />
  );
}

/** L'icône d'un concept dans un jeu donné, hors du jeu actif : aperçus de la page du thème. */
export function SetIcon({ set, concept, className }: { set: IconSetData; concept: IconConcept; className?: string }) {
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const glyph = set.icons[concept];
  if (!glyph) {
    const Lucide = LUCIDE_CONCEPT_ICONS[concept];
    return <Lucide className={className} />;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={glyph.viewBox}
      width={24}
      height={24}
      className={className}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: scopeSvgIds(glyph.body, scope) }}
    />
  );
}

/** Un composant par concept, à passer là où l'on passait une icône Lucide. */
export const THEMED_ICONS = Object.fromEntries(
  ICON_CONCEPTS.map((concept) => {
    const Icon: IconComponent = ({ className }) => <ThemedIcon concept={concept} className={className} />;
    Icon.displayName = `ThemedIcon(${concept})`;
    return [concept, Icon];
  }),
) as Record<IconConcept, IconComponent>;
