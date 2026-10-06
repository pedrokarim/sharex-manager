export interface ModulePageConfig {
  path: string;        // segment route: "" = racine, "settings" = /m/<name>/settings
  title: string;
  component: string;   // chemin relatif au module: "pages/generate.tsx"
}

export interface ModuleNavItem {
  title: string;
  icon?: string;       // nom d'icone Lucide: "Sparkles", "Settings"
  url?: string;        // auto-genere en /m/<moduleName> si omis
}

/**
 * Action qu'un module propose sur des fichiers de la galerie (menu contextuel,
 * visionneuse). Elle ouvre une page du module en lui passant les fichiers :
 * `/m/<module>/<page>?files=a.png,b.png&<params>`.
 */
export interface ModuleFileAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;        // nom d'icone Lucide: "Sparkles", "PenLine"
  fileTypes: string[];  // extensions sans point, ou "*"
  maxFiles?: number;    // absent = sélection illimitée
  page?: string;        // segment de page du module, "" = racine
  params?: Record<string, string>;
}

/**
 * Source de fichiers proposée dans la fenêtre « Ajouter » de la galerie.
 *
 * Un module qui détient des images ou des vidéos (rendus d'un studio, clips
 * exportés…) en déclare une dans `gallerySources`. La galerie n'a rien à
 * connaître du module : elle appelle `list` pour afficher ses éléments, puis
 * `import` avec ceux que l'utilisateur a choisis. La copie se fait côté
 * serveur, sans repasser par le navigateur. Les deux fonctions doivent être
 * déclarées dans `functions`.
 */
export interface ModuleGallerySource {
  id: string;
  label: string;
  description?: string;
  icon?: string; // nom d'icône Lucide
  /**
   * Ce que la source contient. Le sélecteur d'image ne propose que les sources
   * qui ont des images ; absent, la source est supposée en contenir.
   */
  kinds?: ("image" | "video")[];
  /** Fonction serveur : `(query: GallerySourceQuery) => GallerySourcePage`. */
  list: string;
  /** Fonction serveur : `(ids: string[]) => GallerySourceImport`. */
  import: string;
}

export interface GallerySourceQuery {
  search?: string;
  offset?: number;
  limit?: number;
}

export interface GallerySourceItem {
  id: string;
  name: string;
  kind: "image" | "video";
  /** URL de même origine, affichable dans une vignette. */
  thumbnail: string;
  createdAt: number;
  caption?: string;
  durationMs?: number;
  /** Nom du fichier dans la galerie, si l'élément y a déjà été copié. */
  galleryFile?: string;
}

export interface GallerySourcePage {
  items: GallerySourceItem[];
  total: number;
  hasMore: boolean;
}

export interface GallerySourceImport {
  saved: { id: string; fileName: string }[];
  failed: { id: string; error: string }[];
}

/**
 * Section publique apportée au catalogue par un module.
 *
 * Le catalogue ne connaît aucun module : il lit `catalogSections`, ajoute la
 * rubrique à sa navigation et sert trois pages, `/catalog/<id>` (les
 * collections), `/catalog/<id>/<collection>` (ses éléments) et
 * `/catalog/<id>/<collection>/<élément>` (la lecture). Le contenu vient des
 * quatre fonctions du module, qui doivent toutes être déclarées avec
 * l'audience `public` dans `functions` : elles ne rendent que ce qui peut être
 * montré sans compte. Module désactivé, la section, ses pages et ses médias
 * répondent 404.
 */
export interface ModuleCatalogSection {
  /** Segment d'adresse : « scans » donne `/catalog/scans`. */
  id: string;
  label: string;
  description?: string;
  icon?: string; // nom d'icône Lucide
  /** Ce que la section fait lire. `reader` : des suites d'images, dans l'ordre. */
  kind: "reader";
  /** Fonction serveur : `() => CatalogSectionListing`. */
  list: string;
  /** Fonction serveur : `(collection: string) => CatalogSectionCollection | null`. */
  collection: string;
  /** Fonction serveur : `(collection: string, item: string) => CatalogSectionItem | null`. */
  item: string;
  /** Fonction serveur : `(path: string[]) => CatalogSectionMedia | null`. */
  media: string;
}

/** Une carte du catalogue : une collection dans la section, ou un élément dans sa collection. */
export interface CatalogSectionCard {
  slug: string;
  title: string;
  subtitle?: string;
  /** Adresse d'image publique, de même origine. */
  cover?: string;
  /** Ce que la carte contient : éléments d'une collection, pages d'un élément. */
  count?: number;
  updatedAt?: number;
}

export interface CatalogSectionListing {
  collections: CatalogSectionCard[];
}

export interface CatalogSectionCollection {
  slug: string;
  title: string;
  description?: string;
  cover?: string;
  items: CatalogSectionCard[];
}

export interface CatalogSectionItem {
  slug: string;
  title: string;
  collection: { slug: string; title: string };
  /** Listé au catalogue. Sinon l'élément n'est joignable que par son adresse, et n'est pas proposé à l'indexation. */
  listed: boolean;
  /** Une page à la fois, de droite à gauche ou de gauche à droite, ou une bande qui défile. */
  reading: "paged-rtl" | "paged-ltr" | "scroll";
  pages: { url: string; width: number; height: number }[];
  cover?: string;
  previous?: { slug: string; title: string };
  next?: { slug: string; title: string };
  /** Mentions affichées avec la lecture : source, crédit. */
  credits?: { label: string; value: string; href?: string }[];
  updatedAt?: number;
}

/** Un média à servir : chemin relatif au répertoire `data/` du module. */
export interface CatalogSectionMedia {
  file: string;
  /** Faux : l'image n'est pas proposée à l'indexation. */
  indexable?: boolean;
}

export interface ModuleConfig {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  entry: string;
  icon?: string;
  /**
   * Identité visuelle, rangée dans le dossier du module. Les chemins sont
   * relatifs à ce dossier ; la route `/api/modules/<nom>/logo` les sert.
   */
  branding?: {
    logo?: string;
    /** Petite version, pour une barre latérale ou une liste. */
    logoSmall?: string;
    /** Couleur d'accent du module, en hexadécimal. */
    accent?: string;
  };
  category?: string;
  supportedFileTypes: string[];
  hasUI: boolean;
  dependencies?: string[];
  npmDependencies?: Record<string, string>;
  settings?: Record<string, any>;
  capabilities?: string[];
  pages?: ModulePageConfig[];
  navItems?: ModuleNavItem[];
  fileActions?: ModuleFileAction[];
  gallerySources?: ModuleGallerySource[];
  catalogSections?: ModuleCatalogSection[];
  /**
   * Fonctions appelables par `/api/modules/call-function`, avec le rôle
   * minimal. Une fonction absente de la liste est réservée aux admins.
   * `public` désigne une fonction du catalogue public (`catalogSections`) :
   * appelée par le serveur sans session, jamais par `call-function`.
   */
  functions?: Record<string, "user" | "admin" | "public">;
  /** Autorise l'envoi direct de médias dans `data/assets/` du module. */
  uploads?: { maxMb?: number; kinds?: ("image" | "video" | "audio")[] };
  /**
   * Applique `processImage` à chaque capture envoyée, avec les réglages
   * enregistrés. Choix de l'administrateur, désactivé par défaut.
   */
  autoProcess?: boolean;
  /** Le traitement demande un choix à la main (zone à recadrer…) : jamais à l'envoi. */
  manualOnly?: boolean;
}

export interface LoadedModule {
  name: string;
  config: ModuleConfig;
  module: ModuleHooks;
  path: string;
  status: "loaded" | "error" | "disabled";
}

export interface ModuleManager {
  ensureInitialized: () => Promise<void>;
  getModules: () => Promise<ModuleConfig[]>;
  toggleModule: (moduleName: string) => Promise<boolean>;
  deleteModule: (moduleName: string) => Promise<boolean>;
  installModule: (modulePath: string) => Promise<boolean>;
  getModulesByFileType: (fileType: string) => Promise<ModuleConfig[]>;
  installNpmDependencies: (moduleName: string) => Promise<boolean>;
  getLoadedModule: (moduleName: string) => LoadedModule | undefined;
  getAllLoadedModules: () => LoadedModule[];
  processImageWithModule: (
    moduleName: string,
    imageBuffer: Buffer,
    settings?: any
  ) => Promise<Buffer>;
  processImage: (imageBuffer: Buffer) => Promise<Buffer>;
  callModuleFunction: (
    moduleName: string,
    functionName: string,
    ...args: any[]
  ) => Promise<any>;
  updateModuleSettings: (
    moduleName: string,
    newSettings: Record<string, any>
  ) => Promise<boolean>;
}

export interface ModuleHooks {
  onInit?: () => void | Promise<void>;
  onEnable?: () => void | Promise<void>;
  onDisable?: () => void | Promise<void>;
  onUninstall?: () => void | Promise<void>;
  processImage?: (imageBuffer: Buffer, data: any) => Promise<Buffer>;
  processText?: (text: string, data: any) => Promise<string>;
  renderUI?: (
    fileInfo: any,
    onComplete: (result: any) => void
  ) => React.ReactNode;
  getActionIcon?: () => { icon: React.ComponentType; tooltip: string };
  getCapabilities?: () => string[];
}
