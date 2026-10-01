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

export interface ModuleConfig {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  entry: string;
  icon?: string;
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
  /**
   * Fonctions appelables par `/api/modules/call-function`, avec le rôle
   * minimal. Une fonction absente de la liste est réservée aux admins.
   */
  functions?: Record<string, "user" | "admin">;
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
