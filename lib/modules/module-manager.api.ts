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
  hasUI: z.boolean().default(false), // Indique si le module a une interface utilisateur
  supportedFileTypes: z.array(z.string()).default([]), // Types de fichiers supportés
  settings: z.record(z.any()).default({}), // Paramètres du module
  dependencies: z.array(z.string()).optional(), // Dépendances entre modules
  npmDependencies: z.record(z.string()).optional(), // Dépendances npm
  capabilities: z.array(z.string()).optional(), // Capacités du module
});

/**
 * Implémentation du gestionnaire de modules côté API
 * Ce gestionnaire peut charger dynamiquement les modules et traiter les images
 */
class ApiModuleManagerImpl implements ModuleManager {
  private modulesDir: string;
  private loadedModules: Map<string, LoadedModule> = new Map();
  private static instance: ApiModuleManagerImpl;

  private constructor() {
    this.modulesDir = path.join(process.cwd(), "modules");
  }

  public static getInstance(): ApiModuleManagerImpl {
    if (!ApiModuleManagerImpl.instance) {
      ApiModuleManagerImpl.instance = new ApiModuleManagerImpl();
    }
    return ApiModuleManagerImpl.instance;
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
        console.log(`Chargement du module ${moduleName}`);
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
            console.log(`Le module ${moduleName} est désactivé, ignoré`);
            continue;
          }

          // Vérifier si le fichier d'entrée existe
          const entryPath = path.join(modulePath, config.entry);
          if (!fs.existsSync(entryPath)) {
            console.warn(
              `Le fichier d'entrée ${config.entry} du module ${moduleName} n'existe pas`
            );
            continue;
          }

          // Charger dynamiquement le module
          let moduleInstance: ModuleHooks;
          try {
            console.log(`Chargement dynamique du module depuis: ${entryPath}`);

            // Charger le module dynamiquement (côté serveur uniquement)
            const moduleExports = await import(
              `@/modules/${moduleName}/index.process.ts`
            );

            // Détecter automatiquement les capacités du module
            const detectedCapabilities: string[] = [];
            for (const funcName of Object.keys(moduleExports)) {
              if (typeof moduleExports[funcName] === "function") {
                detectedCapabilities.push(funcName);
              }
            }

            // Mettre à jour les capacités dans la configuration
            if (detectedCapabilities.length > 0) {
              config.capabilities = detectedCapabilities;
              // Sauvegarder les capacités détectées dans le fichier module.json
              const configPath = path.join(modulePath, "module.json");
              fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
              console.log(
                `Capacités détectées pour ${moduleName}: ${detectedCapabilities.join(
                  ", "
                )}`
              );
            }

            // Vérifier si le module a une fonction d'initialisation
            if (typeof moduleExports.initModule === "function") {
              console.log(
                `Initialisation du module ${moduleName} avec sa fonction initModule`
              );
              moduleInstance = moduleExports.initModule(config);
            }
            // Sinon, utiliser l'export par défaut s'il existe
            else if (moduleExports.default) {
              console.log(
                `Utilisation de l'export par défaut pour le module ${moduleName}`
              );
              moduleInstance = moduleExports.default;
            }
            // Si aucun des deux n'existe, créer une instance de base
            else {
              console.log(
                `Création d'une instance de base pour le module ${moduleName}`
              );
              moduleInstance = {
                onInit: () =>
                  console.log(
                    `Module ${moduleName} initialisé (instance de base)`
                  ),
                onEnable: () =>
                  console.log(`Module ${moduleName} activé (instance de base)`),
                onDisable: () =>
                  console.log(
                    `Module ${moduleName} désactivé (instance de base)`
                  ),
                processImage: async (imageBuffer: Buffer, settings?: any) => {
                  console.log(
                    `Traitement d'image avec le module ${moduleName} (instance de base)`
                  );

                  // Essayer d'utiliser n'importe quelle fonction d'exportation qui pourrait traiter des images
                  for (const funcName of Object.keys(moduleExports)) {
                    if (
                      typeof moduleExports[funcName] === "function" &&
                      (funcName.toLowerCase().includes("image") ||
                        funcName.toLowerCase().includes("process"))
                    ) {
                      try {
                        console.log(
                          `Tentative d'utilisation de la fonction ${funcName}`
                        );
                        const result = await moduleExports[funcName](
                          imageBuffer,
                          settings
                        );
                        if (Buffer.isBuffer(result)) {
                          return result;
                        }
                      } catch (error) {
                        console.error(
                          `Erreur lors de l'utilisation de ${funcName}:`,
                          error
                        );
                      }
                    }
                  }

                  // Si aucune fonction n'a fonctionné, retourner l'image originale
                  return imageBuffer;
                },
                renderUI: () => null,
                getActionIcon: () => {
                  // Utiliser une icône par défaut
                  const { FileQuestion } = require("lucide-react");
                  return { icon: FileQuestion, tooltip: moduleName };
                },
                getCapabilities: () => detectedCapabilities,
              };
            }

            // Stocker les exports du module pour un accès ultérieur
            moduleInstance._exports = moduleExports;

            console.log(`Module ${moduleName} chargé avec succès`);
          } catch (error) {
            console.error(
              `Erreur lors du chargement dynamique du module ${moduleName}:`,
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

          // Créer un objet LoadedModule
          const loadedModule: LoadedModule = {
            name: config.name,
            path: modulePath,
            config,
            module: moduleInstance,
          };

          // Ajouter le module à la liste des modules chargés
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
   * Récupère la liste de tous les modules (activés ou non)
   */
  public async getModules(): Promise<ModuleConfig[]> {
    try {
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

      const modules: ModuleConfig[] = [];

      // Récupérer la configuration de chaque module
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
    } catch (error) {
      console.error("Erreur lors de la récupération des modules:", error);
      return [];
    }
  }

  /**
   * Récupère un module chargé par son nom
   */
  public getLoadedModule(moduleName: string): LoadedModule | undefined {
    return this.loadedModules.get(moduleName);
  }

  /**
   * Récupère tous les modules chargés
   */
  public getAllLoadedModules(): LoadedModule[] {
    return Array.from(this.loadedModules.values());
  }

  /**
   * Récupère les modules qui supportent un type de fichier donné
   */
  public async getModulesByFileType(fileType: string): Promise<ModuleConfig[]> {
    const modules = await this.getModules();
    return modules.filter(
      (m) => m.enabled && m.supportedFileTypes.includes(fileType)
    );
  }

  /**
   * Traite une image avec un module spécifique
   */
  public async processImageWithModule(
    moduleName: string,
    imageBuffer: Buffer,
    settings?: any
  ): Promise<Buffer> {
    try {
      // Récupérer le module
      const loadedModule = this.getLoadedModule(moduleName);
      if (!loadedModule) {
        console.warn(`Module ${moduleName} non trouvé`);
        return imageBuffer;
      }

      console.log(`Traitement d'image avec le module ${moduleName}`);
      console.log(`Paramètres:`, settings);

      // Récupérer les exports du module
      const moduleExports = loadedModule.module._exports;
      if (!moduleExports) {
        console.warn(`Module ${moduleName} n'a pas d'exports`);
        return imageBuffer;
      }

      // Déterminer la fonction à utiliser en fonction des capacités du module
      let processedBuffer = imageBuffer;
      const capabilities = loadedModule.config.capabilities || [];

      // Si le module a une fonction processImage, l'utiliser
      if (typeof moduleExports.processImage === "function") {
        console.log(
          `Utilisation de la fonction processImage du module ${moduleName}`
        );
        processedBuffer = await moduleExports.processImage(
          imageBuffer,
          settings
        );
      }
      // Sinon, essayer de trouver une fonction spécifique basée sur le type de traitement
      else if (
        settings &&
        settings.type &&
        typeof moduleExports[settings.type] === "function"
      ) {
        console.log(
          `Utilisation de la fonction ${settings.type} du module ${moduleName}`
        );
        processedBuffer = await moduleExports[settings.type](
          imageBuffer,
          settings
        );
      }
      // Sinon, essayer de trouver une fonction basée sur le nom du module
      else if (typeof moduleExports[moduleName.toLowerCase()] === "function") {
        console.log(
          `Utilisation de la fonction ${moduleName.toLowerCase()} du module ${moduleName}`
        );
        processedBuffer = await moduleExports[moduleName.toLowerCase()](
          imageBuffer,
          settings
        );
      }
      // Sinon, parcourir toutes les fonctions exportées qui pourraient traiter des images
      else {
        for (const funcName of Object.keys(moduleExports)) {
          if (
            typeof moduleExports[funcName] === "function" &&
            (funcName.toLowerCase().includes("image") ||
              funcName.toLowerCase().includes("process") ||
              capabilities.includes(funcName))
          ) {
            try {
              console.log(`Tentative d'utilisation de la fonction ${funcName}`);
              const result = await moduleExports[funcName](
                imageBuffer,
                settings
              );
              if (Buffer.isBuffer(result)) {
                processedBuffer = result;
                break;
              }
            } catch (error) {
              console.error(
                `Erreur lors de l'utilisation de ${funcName}:`,
                error
              );
            }
          }
        }
      }

      return processedBuffer;
    } catch (error) {
      console.error(
        `Erreur lors du traitement d'image avec le module ${moduleName}:`,
        error
      );
      return imageBuffer;
    }
  }

  /**
   * Traite une image avec tous les modules activés
   */
  public async processImage(imageBuffer: Buffer): Promise<Buffer> {
    let processedBuffer = imageBuffer;

    for (const loadedModule of this.loadedModules.values()) {
      if (loadedModule.config.enabled) {
        try {
          processedBuffer = await loadedModule.module.processImage(
            processedBuffer
          );
        } catch (error) {
          console.error(
            `Erreur lors du traitement de l'image avec le module ${loadedModule.name}:`,
            error
          );
        }
      }
    }

    return processedBuffer;
  }

  public async toggleModule(moduleName: string): Promise<boolean> {
    try {
      const module = this.getLoadedModule(moduleName);
      if (!module) {
        console.warn(`Module ${moduleName} non trouvé`);
        return false;
      }

      const configPath = path.join(module.path, "module.json");
      if (!fs.existsSync(configPath)) {
        console.warn(
          `Le fichier module.json du module ${moduleName} n'existe pas`
        );
        return false;
      }

      // Lire le fichier de configuration
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Inverser l'état d'activation
      config.enabled = !config.enabled;

      // Écrire la nouvelle configuration
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log(
        `Module ${moduleName} ${config.enabled ? "activé" : "désactivé"}`
      );

      // Recharger les modules
      await this.loadModules();

      return true;
    } catch (error) {
      console.error(
        `Erreur lors de la modification de l'état du module ${moduleName}:`,
        error
      );
      return false;
    }
  }

  public async deleteModule(moduleName: string): Promise<boolean> {
    try {
      const module = this.getLoadedModule(moduleName);
      if (!module) {
        console.warn(`Module ${moduleName} non trouvé`);
        return false;
      }

      // Désactiver le module avant de le supprimer
      if (module.module.onDisable) {
        await module.module.onDisable();
      }

      // Supprimer le dossier du module
      fs.rmSync(module.path, { recursive: true, force: true });

      console.log(`Module ${moduleName} supprimé`);

      // Recharger les modules
      await this.loadModules();

      return true;
    } catch (error) {
      console.error(
        `Erreur lors de la suppression du module ${moduleName}:`,
        error
      );
      return false;
    }
  }

  public async installModule(modulePath: string): Promise<boolean> {
    try {
      // Vérifier si le chemin existe
      if (!fs.existsSync(modulePath)) {
        console.warn(`Le chemin ${modulePath} n'existe pas`);
        return false;
      }

      // Vérifier si c'est un dossier
      const stats = fs.statSync(modulePath);
      if (!stats.isDirectory()) {
        console.warn(`${modulePath} n'est pas un dossier`);
        return false;
      }

      // Vérifier si le module.json existe
      const configPath = path.join(modulePath, "module.json");
      if (!fs.existsSync(configPath)) {
        console.warn(`Le fichier module.json n'existe pas dans ${modulePath}`);
        return false;
      }

      // Lire et valider le fichier module.json
      const configContent = fs.readFileSync(configPath, "utf-8");
      let config: ModuleConfig;

      try {
        const parsedConfig = JSON.parse(configContent);
        config = ModuleConfigSchema.parse(parsedConfig);
      } catch (error) {
        console.error(`Le fichier module.json est invalide:`, error);
        return false;
      }

      // Créer le dossier de destination
      const destPath = path.join(this.modulesDir, config.name);
      if (fs.existsSync(destPath)) {
        console.warn(`Le module ${config.name} existe déjà`);
        return false;
      }

      // Copier le dossier du module
      this.copyFolderRecursive(modulePath, destPath);

      console.log(`Module ${config.name} installé avec succès`);

      // Installer les dépendances npm si nécessaire
      if (
        config.npmDependencies &&
        Object.keys(config.npmDependencies).length > 0
      ) {
        await this.installNpmDependencies(config.name);
      }

      // Recharger les modules
      await this.loadModules();

      return true;
    } catch (error) {
      console.error(`Erreur lors de l'installation du module:`, error);
      return false;
    }
  }

  private copyFolderRecursive(source: string, destination: string) {
    // Créer le dossier de destination s'il n'existe pas
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Lire tous les fichiers et dossiers
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        // Récursion pour les sous-dossiers
        this.copyFolderRecursive(srcPath, destPath);
      } else {
        // Copier les fichiers
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  public async installNpmDependencies(moduleName: string): Promise<boolean> {
    try {
      const module = this.getLoadedModule(moduleName);
      if (!module) {
        console.warn(`Module ${moduleName} non trouvé`);
        return false;
      }

      const { config, path: modulePath } = module;

      // Vérifier si le module a des dépendances npm
      if (
        !config.npmDependencies ||
        Object.keys(config.npmDependencies).length === 0
      ) {
        console.log(`Le module ${moduleName} n'a pas de dépendances npm`);
        return true;
      }

      console.log(
        `Installation des dépendances npm pour le module ${moduleName}...`
      );

      // Créer un package.json temporaire
      const packageJson = {
        name: `module-${moduleName}`,
        version: "1.0.0",
        private: true,
        dependencies: config.npmDependencies,
      };

      const packageJsonPath = path.join(modulePath, "package.json");
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      // Installer les dépendances avec npm
      const { execSync } = require("child_process");
      execSync("npm install", { cwd: modulePath, stdio: "inherit" });

      console.log(`Dépendances npm installées pour le module ${moduleName}`);
      return true;
    } catch (error) {
      console.error(
        `Erreur lors de l'installation des dépendances npm pour le module ${moduleName}:`,
        error
      );
      return false;
    }
  }

  public async callModuleFunction(
    moduleName: string,
    functionName: string,
    ...args: any[]
  ): Promise<any> {
    try {
      // Récupérer le module
      const loadedModule = this.getLoadedModule(moduleName);
      if (!loadedModule) {
        console.warn(`Module ${moduleName} non trouvé`);
        return null;
      }

      // Vérifier si le module a été chargé dynamiquement
      const moduleExports = loadedModule.module._exports;
      if (!moduleExports) {
        console.warn(`Module ${moduleName} n'a pas d'exports`);
        return null;
      }

      // Vérifier si la fonction existe
      if (typeof moduleExports[functionName] !== "function") {
        console.warn(
          `Fonction ${functionName} non trouvée dans le module ${moduleName}`
        );
        return null;
      }

      // Appeler la fonction avec les arguments fournis
      console.log(
        `Appel de la fonction ${functionName} du module ${moduleName}`
      );
      return await moduleExports[functionName](...args);
    } catch (error) {
      console.error(
        `Erreur lors de l'appel de la fonction ${functionName} du module ${moduleName}:`,
        error
      );
      return null;
    }
  }
}

// Exporter l'instance du gestionnaire de modules côté API
export const apiModuleManager = ApiModuleManagerImpl.getInstance();

// Fonction pour initialiser le gestionnaire de modules côté API
export async function initApiModuleManager() {
  const moduleManager = ApiModuleManagerImpl.getInstance();
  await moduleManager.loadModules();
  return moduleManager;
}
