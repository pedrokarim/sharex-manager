/**
 * Jeux d'icônes de l'interface : la barre latérale et les en-têtes d'écran
 * dessinent leurs icônes dans le jeu choisi sur la page « Thème global ».
 * Les icônes de commande (boutons, menus, champs) restent en Lucide.
 *
 * Chaque jeu autre que Lucide est un fichier `sets/<id>.json`, généré par
 * `scripts/icon-themes/generate.mjs` à partir des jeux Iconify : seules les
 * icônes des concepts ci-dessous y figurent. Le serveur n'envoie au navigateur
 * que le jeu actif (et tous les jeux sur la page du thème, pour l'aperçu).
 */
import {
  BarChart3,
  Clock,
  FileImage,
  FolderOpen,
  Grid3X3,
  HelpCircle,
  History,
  Image as ImageIcon,
  Info,
  Key,
  LayoutDashboard,
  Link2,
  Lock,
  MoreHorizontal,
  Package,
  Palette,
  PlugZap,
  ScrollText,
  Send,
  Server,
  Settings,
  Settings2,
  Share2,
  Shield,
  Sliders,
  Star,
  Tag,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Ce que représente une icône, indépendamment du jeu qui la dessine. */
export const ICON_CONCEPTS = [
  "gallery",
  "recent",
  "starred",
  "secure",
  "uploads",
  "history",
  "uploadConfig",
  "stats",
  "organization",
  "albums",
  "tags",
  "collections",
  "settings",
  "preferences",
  "apiKeys",
  "integrations",
  "modulesSettings",
  "overview",
  "users",
  "logs",
  "theme",
  "system",
  "modules",
  "connections",
  "services",
  "security",
  "tools",
  "support",
  "feedback",
  "about",
] as const;

export type IconConcept = (typeof ICON_CONCEPTS)[number];

/** Les icônes Lucide d'avant le choix de jeu : le jeu « lucide » et le repli de tous les autres. */
export const LUCIDE_CONCEPT_ICONS: Record<IconConcept, LucideIcon> = {
  gallery: ImageIcon,
  recent: Clock,
  starred: Star,
  secure: Lock,
  uploads: Upload,
  history: History,
  uploadConfig: Settings,
  stats: BarChart3,
  organization: FolderOpen,
  albums: FolderOpen,
  tags: Tag,
  collections: Grid3X3,
  settings: Settings2,
  preferences: Sliders,
  apiKeys: Key,
  integrations: Share2,
  modulesSettings: FileImage,
  overview: LayoutDashboard,
  users: Users,
  logs: ScrollText,
  theme: Palette,
  system: Server,
  modules: Package,
  connections: Link2,
  services: PlugZap,
  security: Shield,
  tools: MoreHorizontal,
  support: HelpCircle,
  feedback: Send,
  about: Info,
};

export interface IconSetInfo {
  id: string;
  label: string;
  /** Licence du jeu, montrée à côté de son nom. */
  license: string;
  /** Jeu en couleurs propres : il ne suit pas la couleur du texte. */
  colored?: boolean;
}

/** Dans l'ordre de la page du thème. Le premier est le jeu par défaut. */
export const ICON_SETS: readonly IconSetInfo[] = [
  { id: "fluent-color", label: "Fluent Color", license: "MIT", colored: true },
  { id: "lucide", label: "Lucide", license: "ISC" },
  { id: "phosphor", label: "Phosphor", license: "MIT" },
  { id: "phosphor-duotone", label: "Phosphor Duotone", license: "MIT" },
  { id: "solar-linear", label: "Solar Linear", license: "CC BY 4.0, 480 Design" },
  { id: "solar-duotone", label: "Solar Bold Duotone", license: "CC BY 4.0, 480 Design" },
  { id: "hugeicons", label: "Hugeicons", license: "MIT" },
  { id: "fluent", label: "Fluent", license: "MIT" },
  { id: "remix-fill", label: "Remix Icon Fill", license: "Apache 2.0" },
  { id: "mingcute", label: "MingCute", license: "Apache 2.0" },
  { id: "material-rounded", label: "Material Symbols Rounded", license: "Apache 2.0" },
];

export type IconSetId = string;

export const DEFAULT_ICON_SET: IconSetId = "fluent-color";
export const LUCIDE_ICON_SET: IconSetId = "lucide";

export function isIconSetId(value: unknown): value is IconSetId {
  return typeof value === "string" && ICON_SETS.some((set) => set.id === value);
}

/** Une icône d'un jeu : la boîte du dessin et son contenu SVG. */
export interface IconGlyph {
  viewBox: string;
  body: string;
}

/** Ce que le serveur envoie pour un jeu. `icons` est vide pour Lucide. */
export interface IconSetData {
  id: IconSetId;
  icons: Partial<Record<IconConcept, IconGlyph>>;
}
