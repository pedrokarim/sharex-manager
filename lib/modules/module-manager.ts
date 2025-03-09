import fs from "fs";
import path from "path";
import {
  ModuleConfig,
  LoadedModule,
  ModuleManager,
  ModuleHooks,
} from "../../types/modules";
import { z } from "zod";

// Schéma de validation pour module.json
const ModuleConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  enabled: z.boolean(),
  entry: z.string(),
  icon: z.string().optional(), // Chemin vers l'icône du module ou URL
  category: z.string().optional(), // Catégorie du module
  supportedFileTypes: z.array(z.string()).default([]), // Types de fichiers supportés
  hasUI: z.boolean().default(false), // Indique si le module a une interface utilisateur
  dependencies: z.array(z.string()).optional(), // Dépendances d'autres modules
  npmDependencies: z.record(z.string()).optional(), // Dépendances npm
  settings: z.record(z.any()).optional(), // Paramètres du module
});

class ModuleManagerImpl implements ModuleManager {
  private modulesDir: string;
  private loadedModules: Map<string, LoadedModule> = new Map();
  private static instance: ModuleManagerImpl;

  private constructor() {
    this.modulesDir = path.join(process.cwd(), "modules");

    // Créer le dossier modules s'il n'existe pas
    if (!fs.existsSync(this.modulesDir)) {
      fs.mkdirSync(this.modulesDir, { recursive: true });
    }
  }

  public static getInstance(): ModuleManagerImpl {
    if (!ModuleManagerImpl.instance) {
      ModuleManagerImpl.instance = new ModuleManagerImpl();
    }
    return ModuleManagerImpl.instance;
  }

  /**
   * Charge tous les modules valides
   */
  public async loadModules(): Promise<LoadedModule[]> {
    try {
      // Réinitialiser les modules chargés
      this.loadedModules.clear();

      // Vérifier si le dossier modules existe
      if (!fs.existsSync(this.modulesDir)) {
        console.warn("Le dossier modules n'existe pas");
        fs.mkdirSync(this.modulesDir, { recursive: true });
        return [];
      }

      // Lire tous les dossiers dans le dossier modules
      const moduleFolders = fs
        .readdirSync(this.modulesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      const loadedModules: LoadedModule[] = [];

      // Charger chaque module
      for (const moduleName of moduleFolders) {
        try {
          const modulePath = path.join(this.modulesDir, moduleName);
          const configPath = path.join(modulePath, "module.json");

          // Vérifier si le fichier module.json existe
          if (!fs.existsSync(configPath)) {
            console.warn(
              `Le module ${moduleName} n'a pas de fichier module.json`
            );
            continue;
          }

          // Lire et valider le fichier module.json
          const configContent = fs.readFileSync(configPath, "utf-8");
          let config: ModuleConfig;

          try {
            const parsedConfig = JSON.parse(configContent);
            config = ModuleConfigSchema.parse(parsedConfig);
          } catch (error) {
            console.error(
              `Le fichier module.json du module ${moduleName} est invalide:`,
              error
            );
            continue;
          }

          // Vérifier si le module est activé
          if (!config.enabled) {
            console.log(`Le module ${config.name} est désactivé`);
            continue;
          }

          // Vérifier si le fichier d'entrée existe
          const entryPath = path.join(modulePath, config.entry);
          if (!fs.existsSync(entryPath)) {
            console.error(
              `Le fichier d'entrée ${config.entry} du module ${config.name} n'existe pas`
            );
            continue;
          }

          // Vérifier si node_modules existe pour les modules avec des dépendances NPM
          if (
            config.npmDependencies &&
            Object.keys(config.npmDependencies).length > 0
          ) {
            const nodeModulesPath = path.join(modulePath, "node_modules");
            if (!fs.existsSync(nodeModulesPath)) {
              console.log(
                `Le module ${config.name} a des dépendances NPM mais node_modules n'existe pas`
              );
              console.log(
                `Vous devriez installer les dépendances NPM pour ce module`
              );
            }
          }

          // Importer dynamiquement le module
          let moduleInstance: ModuleHooks;

          try {
            // Construire les chemins
            const modulePath = path.join(process.cwd(), "modules", moduleName);
            const entryPath = path.join(modulePath, config.entry);

            console.log(`Module ${moduleName}: configuration chargée`);

            // Créer un objet ModuleHooks de base
            moduleInstance = {
              onInit: () => console.log(`Module ${moduleName} initialisé`),
              onEnable: () => console.log(`Module ${moduleName} activé`),
              onDisable: () => console.log(`Module ${moduleName} désactivé`),
              processImage: async (
                imageBuffer: Buffer,
                moduleSettings?: any
              ) => {
                console.log(`Traitement d'image avec le module ${moduleName}`);

                // Déléguer le traitement à l'API
                try {
                  // Convertir le buffer en base64 pour le transfert
                  const base64Buffer = imageBuffer.toString("base64");

                  // Appeler l'API pour traiter l'image
                  const response = await fetch("/api/modules/apply", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      moduleName,
                      settings: moduleSettings || config.settings,
                      fileBuffer: base64Buffer,
                      internalProcessing: true,
                    }),
                  });

                  if (!response.ok) {
                    throw new Error(
                      `Erreur lors du traitement de l'image: ${response.statusText}`
                    );
                  }

                  // L'API retournera l'image traitée
                  const result = await response.arrayBuffer();
                  return Buffer.from(result);
                } catch (error) {
                  console.error(
                    `Erreur lors du traitement de l'image avec le module ${moduleName}:`,
                    error
                  );
                  return imageBuffer;
                }
              },
              renderUI: () => {
                // Nous implémenterons cette fonction dans l'interface utilisateur
                console.log(
                  `Rendu de l'interface utilisateur pour le module ${moduleName}`
                );
                return null;
              },
              getActionIcon: () => {
                // Utiliser une icône par défaut
                const { FileQuestion } = require("lucide-react");
                return { icon: FileQuestion, tooltip: moduleName };
              },
            };

            console.log(`Module ${moduleName} chargé avec succès`);
          } catch (error) {
            console.error(
              `Erreur lors du chargement du module ${moduleName}:`,
              error
            );

            // Créer une instance de secours en cas d'erreur
            moduleInstance = {
              onInit: () =>
                console.log(`Module ${moduleName} initialisé (mode secours)`),
              onEnable: () =>
                console.log(`Module ${moduleName} activé (mode secours)`),
              onDisable: () =>
                console.log(`Module ${moduleName} désactivé (mode secours)`),
              processImage: async (imageBuffer: Buffer) => {
                console.log(
                  `Traitement d'image avec le module ${moduleName} (mode secours)`
                );
                return imageBuffer;
              },
              renderUI: () => null,
              getActionIcon: () => {
                // Utiliser une icône par défaut
                const { FileQuestion } = require("lucide-react");
                return { icon: FileQuestion, tooltip: moduleName };
              },
            };
          }

          // Appeler le hook onInit
          try {
            await moduleInstance.onInit?.();
          } catch (error) {
            console.error(
              `Erreur lors de l'initialisation du module ${config.name}:`,
              error
            );
          }

          // Ajouter le module à la liste des modules chargés
          const loadedModule: LoadedModule = {
            name: config.name,
            config,
            module: moduleInstance,
            path: modulePath,
          };
          this.loadedModules.set(config.name, loadedModule);
          loadedModules.push(loadedModule);

          console.log(`Module ${config.name} chargé avec succès`);
        } catch (error) {
          console.error(
            `Erreur lors du chargement du module ${moduleName}:`,
            error
          );
        }
      }

      console.log(`${loadedModules.length} modules chargés avec succès`);
      return loadedModules;
    } catch (error) {
      console.error("Erreur lors du chargement des modules:", error);
      return [];
    }
  }

  /**
   * Récupère la liste des modules installés
   */
  public async getModules(): Promise<ModuleConfig[]> {
    // Vérifier si le dossier modules existe
    if (!fs.existsSync(this.modulesDir)) {
      return [];
    }

    // Lire tous les dossiers dans le dossier modules
    const moduleFolders = fs
      .readdirSync(this.modulesDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    const modules: ModuleConfig[] = [];

    // Récupérer les informations de chaque module
    for (const moduleName of moduleFolders) {
      try {
        const modulePath = path.join(this.modulesDir, moduleName);
        const configPath = path.join(modulePath, "module.json");

        // Vérifier si le fichier module.json existe
        if (!fs.existsSync(configPath)) {
          continue;
        }

        // Lire et valider le fichier module.json
        const configContent = fs.readFileSync(configPath, "utf-8");
        let config: ModuleConfig;

        try {
          const parsedConfig = JSON.parse(configContent);
          config = ModuleConfigSchema.parse(parsedConfig);
          modules.push(config);
        } catch (error) {
          console.error(
            `Le fichier module.json du module ${moduleName} est invalide:`,
            error
          );
        }
      } catch (error) {
        console.error(
          `Erreur lors de la récupération des informations du module ${moduleName}:`,
          error
        );
      }
    }

    return modules;
  }

  /**
   * Active ou désactive un module
   */
  public async toggleModule(moduleName: string): Promise<boolean> {
    try {
      // Récupérer tous les modules
      const modules = await this.getModules();
      const moduleToToggle = modules.find((m) => m.name === moduleName);

      if (!moduleToToggle) {
        console.error(`Le module ${moduleName} n'existe pas`);
        return false;
      }

      // Trouver le chemin du module
      const moduleFolders = fs
        .readdirSync(this.modulesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      let modulePath = "";
      for (const folder of moduleFolders) {
        const configPath = path.join(this.modulesDir, folder, "module.json");
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf-8");
          const config = JSON.parse(configContent);
          if (config.name === moduleName) {
            modulePath = path.join(this.modulesDir, folder);
            break;
          }
        }
      }

      if (!modulePath) {
        console.error(
          `Impossible de trouver le chemin du module ${moduleName}`
        );
        return false;
      }

      // Mettre à jour le fichier module.json
      const configPath = path.join(modulePath, "module.json");
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Inverser l'état d'activation
      config.enabled = !config.enabled;

      // Écrire les modifications
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Si le module est chargé, appeler le hook approprié
      const loadedModule = this.loadedModules.get(moduleName);
      if (loadedModule) {
        if (config.enabled && loadedModule.module.onEnable) {
          await loadedModule.module.onEnable();
        } else if (!config.enabled && loadedModule.module.onDisable) {
          await loadedModule.module.onDisable();
        }

        // Si le module est désactivé, le retirer de la liste des modules chargés
        if (!config.enabled) {
          this.loadedModules.delete(moduleName);
        }
      } else if (config.enabled) {
        // Si le module n'est pas chargé mais qu'il est activé, le charger
        await this.loadModules();
      }

      return true;
    } catch (error) {
      console.error(
        `Erreur lors de l'activation/désactivation du module ${moduleName}:`,
        error
      );
      return false;
    }
  }

  /**
   * Supprime un module
   */
  public async deleteModule(moduleName: string): Promise<boolean> {
    try {
      // Récupérer tous les modules
      const modules = await this.getModules();
      const moduleToDelete = modules.find((m) => m.name === moduleName);

      if (!moduleToDelete) {
        console.error(`Le module ${moduleName} n'existe pas`);
        return false;
      }

      // Trouver le chemin du module
      const moduleFolders = fs
        .readdirSync(this.modulesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      let modulePath = "";
      for (const folder of moduleFolders) {
        const configPath = path.join(this.modulesDir, folder, "module.json");
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf-8");
          const config = JSON.parse(configContent);
          if (config.name === moduleName) {
            modulePath = path.join(this.modulesDir, folder);
            break;
          }
        }
      }

      if (!modulePath) {
        console.error(
          `Impossible de trouver le chemin du module ${moduleName}`
        );
        return false;
      }

      // Si le module est chargé, appeler le hook onUninstall
      const loadedModule = this.loadedModules.get(moduleName);
      if (loadedModule && loadedModule.module.onUninstall) {
        await loadedModule.module.onUninstall();
      }

      // Supprimer le dossier du module
      fs.rmSync(modulePath, { recursive: true, force: true });

      // Retirer le module de la liste des modules chargés
      this.loadedModules.delete(moduleName);

      return true;
    } catch (error) {
      console.error(
        `Erreur lors de la suppression du module ${moduleName}:`,
        error
      );
      return false;
    }
  }

  /**
   * Installe un module à partir d'un chemin
   */
  public async installModule(modulePath: string): Promise<boolean> {
    try {
      // Vérifier si le chemin existe
      if (!fs.existsSync(modulePath)) {
        console.error(`Le chemin ${modulePath} n'existe pas`);
        return false;
      }

      // Vérifier si le chemin est un dossier
      const stats = fs.statSync(modulePath);
      if (!stats.isDirectory()) {
        console.error(`Le chemin ${modulePath} n'est pas un dossier`);
        return false;
      }

      // Vérifier si le dossier contient un fichier module.json
      const configPath = path.join(modulePath, "module.json");
      if (!fs.existsSync(configPath)) {
        console.error(
          `Le dossier ${modulePath} ne contient pas de fichier module.json`
        );
        return false;
      }

      // Lire et valider le fichier module.json
      const configContent = fs.readFileSync(configPath, "utf-8");
      let config: ModuleConfig;

      try {
        const parsedConfig = JSON.parse(configContent);
        config = ModuleConfigSchema.parse(parsedConfig);
      } catch (error) {
        console.error(
          `Le fichier module.json du module ${modulePath} est invalide:`,
          error
        );
        return false;
      }

      // Vérifier si le fichier d'entrée existe
      const entryPath = path.join(modulePath, config.entry);
      if (!fs.existsSync(entryPath)) {
        console.error(
          `Le fichier d'entrée ${config.entry} du module ${config.name} n'existe pas`
        );
        return false;
      }

      // Vérifier si un module avec le même nom existe déjà
      const modules = await this.getModules();
      if (modules.some((m) => m.name === config.name)) {
        console.error(`Un module avec le nom ${config.name} existe déjà`);
        return false;
      }

      // Copier le dossier du module dans le dossier modules
      const moduleName = path.basename(modulePath);
      const destPath = path.join(this.modulesDir, moduleName);

      // Créer le dossier de destination s'il n'existe pas
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }

      // Copier tous les fichiers du module
      this.copyFolderRecursive(modulePath, destPath);

      // Charger le module si activé
      if (config.enabled) {
        await this.loadModules();
      }

      return true;
    } catch (error) {
      console.error(
        `Erreur lors de l'installation du module ${modulePath}:`,
        error
      );
      return false;
    }
  }

  /**
   * Récupère un module chargé par son nom
   */
  public getLoadedModule(moduleName: string): LoadedModule | undefined {
    // Recherche directe par nom exact
    const exactMatch = this.loadedModules.get(moduleName);
    if (exactMatch) {
      return exactMatch;
    }

    // Recherche insensible à la casse
    for (const [key, module] of this.loadedModules.entries()) {
      if (key.toLowerCase() === moduleName.toLowerCase()) {
        return module;
      }
    }

    // Module non trouvé
    console.warn(
      `Module non trouvé: ${moduleName}. Modules disponibles: ${Array.from(
        this.loadedModules.keys()
      ).join(", ")}`
    );
    return undefined;
  }

  /**
   * Récupère tous les modules chargés
   */
  public getAllLoadedModules(): LoadedModule[] {
    return Array.from(this.loadedModules.values());
  }

  /**
   * Récupère les modules qui supportent un type de fichier spécifique
   */
  public async getModulesByFileType(fileType: string): Promise<ModuleConfig[]> {
    const modules = await this.getModules();
    return modules.filter(
      (module) =>
        module.enabled &&
        module.supportedFileTypes &&
        module.supportedFileTypes.includes(
          fileType.toLowerCase().replace(".", "")
        )
    );
  }

  /**
   * Traite une image avec tous les modules chargés
   */
  public async processImage(imageBuffer: Buffer): Promise<Buffer> {
    let processedImage = imageBuffer;

    // Appliquer tous les modules chargés qui ont une fonction processImage
    for (const loadedModule of this.loadedModules.values()) {
      if (loadedModule.module.processImage) {
        try {
          processedImage = await loadedModule.module.processImage(
            processedImage
          );
        } catch (error) {
          console.error(
            `Erreur lors du traitement de l'image avec le module ${loadedModule.name}:`,
            error
          );
        }
      }
    }

    return processedImage;
  }

  /**
   * Copie un dossier de manière récursive
   */
  private copyFolderRecursive(source: string, destination: string) {
    // Créer le dossier de destination s'il n'existe pas
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Lire tous les fichiers et dossiers dans le dossier source
    const entries = fs.readdirSync(source, { withFileTypes: true });

    // Copier chaque fichier et dossier
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        // Copier le dossier de manière récursive
        this.copyFolderRecursive(srcPath, destPath);
      } else {
        // Copier le fichier
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Installe les dépendances NPM d'un module
   */
  public async installNpmDependencies(moduleName: string): Promise<boolean> {
    try {
      // Vérifier si le module existe
      const modules = await this.getModules();
      const moduleConfig = modules.find((m) => m.name === moduleName);

      if (!moduleConfig) {
        console.error(`Le module ${moduleName} n'existe pas`);
        return false;
      }

      // Trouver le chemin du module
      const moduleFolders = fs
        .readdirSync(this.modulesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      let modulePath = "";
      for (const folder of moduleFolders) {
        const configPath = path.join(this.modulesDir, folder, "module.json");
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf-8");
          try {
            const config = JSON.parse(configContent);
            if (config.name === moduleName) {
              modulePath = path.join(this.modulesDir, folder);
              break;
            }
          } catch (error) {
            console.error(
              `Erreur lors de la lecture du fichier module.json dans ${folder}:`,
              error
            );
          }
        }
      }

      if (!modulePath) {
        console.error(
          `Impossible de trouver le chemin du module ${moduleName}`
        );
        return false;
      }

      // Vérifier si le module a des dépendances NPM
      const { npmDependencies } = moduleConfig;
      if (!npmDependencies || Object.keys(npmDependencies).length === 0) {
        console.log(`Le module ${moduleName} n'a pas de dépendances NPM`);
        return true;
      }

      // Créer un package.json temporaire pour le module
      const packageJsonPath = path.join(modulePath, "package.json");
      const packageJson = {
        name: `module-${moduleName.toLowerCase().replace(/\s+/g, "-")}`,
        version: moduleConfig.version,
        private: true,
        dependencies: npmDependencies,
      };

      // Écrire le package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      // Installer les dépendances avec bun
      console.log(
        `Installation des dépendances NPM pour le module ${moduleName}...`
      );

      try {
        const { execSync } = require("child_process");
        execSync("bun install", { cwd: modulePath, stdio: "inherit" });

        console.log(
          `Dépendances NPM installées avec succès pour le module ${moduleName}`
        );

        // Charger le module s'il n'est pas déjà chargé
        if (!this.loadedModules.has(moduleName)) {
          await this.loadModules();
        }

        return true;
      } catch (error) {
        console.error(
          `Erreur lors de l'exécution de bun install pour le module ${moduleName}:`,
          error
        );
        return false;
      }
    } catch (error) {
      console.error(
        `Erreur lors de l'installation des dépendances NPM pour le module ${moduleName}:`,
        error
      );
      return false;
    }
  }
}

// Exporter l'instance du gestionnaire de modules
export const moduleManager = ModuleManagerImpl.getInstance();

// Exporter une fonction pour initialiser le gestionnaire de modules
export async function initModuleManager() {
  await moduleManager.loadModules();
  return moduleManager;
}
