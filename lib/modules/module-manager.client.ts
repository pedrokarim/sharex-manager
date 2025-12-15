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
  settings: z.unknown(), // Paramètres du module - validation complètement libre
  dependencies: z.unknown().optional(), // Dépendances entre modules
  npmDependencies: z.unknown().optional(), // Dépendances npm
  capabilities: z.unknown().optional(), // Capacités du module
});

/**
 * Implémentation du gestionnaire de modules côté client
 * Ce gestionnaire ne fait pas d'importation dynamique de modules
 * Il gère uniquement la configuration et l'interface utilisateur
 */
class ClientModuleManagerImpl implements ModuleManager {
  private modulesDir: string;
  private loadedModules: Map<string, LoadedModule> = new Map();
  private static instance: ClientModuleManagerImpl;

  private constructor() {
    this.modulesDir = path.join(process.cwd(), "modules");
  }

  public static getInstance(): ClientModuleManagerImpl {
    if (!ClientModuleManagerImpl.instance) {
      ClientModuleManagerImpl.instance = new ClientModuleManagerImpl();
    }
    return ClientModuleManagerImpl.instance;
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

          // Créer un objet ModuleHooks de base
          const moduleInstance: ModuleHooks = {
            onInit: () => console.log(`Module ${moduleName} initialisé`),
            onEnable: () => console.log(`Module ${moduleName} activé`),
            onDisable: () => console.log(`Module ${moduleName} désactivé`),
            processImage: async (imageBuffer: Buffer, moduleSettings?: any) => {
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

          // Créer un objet LoadedModule
          const loadedModule: LoadedModule = {
            name: config.name,
            config,
            module: moduleInstance,
            path: modulePath,
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
   * Active ou désactive un module
   */
  public async toggleModule(moduleName: string): Promise<boolean> {
    try {
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
        if (config.enabled) {
          loadedModule.module.onEnable();
        } else {
          loadedModule.module.onDisable();
        }
      }

      // Recharger les modules
      await this.loadModules();

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

      // Supprimer le dossier du module
      fs.rmSync(modulePath, { recursive: true, force: true });

      // Supprimer le module de la liste des modules chargés
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

      // Vérifier si le module existe déjà
      const existingModules = await this.getModules();
      if (existingModules.some((m) => m.name === config.name)) {
        console.error(`Le module ${config.name} existe déjà`);
        return false;
      }

      // Créer le dossier de destination
      const destinationPath = path.join(
        this.modulesDir,
        path.basename(modulePath)
      );
      if (fs.existsSync(destinationPath)) {
        console.error(
          `Le dossier de destination ${destinationPath} existe déjà`
        );
        return false;
      }

      // Copier le dossier du module
      this.copyFolderRecursive(modulePath, destinationPath);

      // Recharger les modules
      await this.loadModules();

      return true;
    } catch (error) {
      console.error(`Erreur lors de l'installation du module:`, error);
      return false;
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
    return modules.filter((m) => {
      if (!m.enabled) return false;

      // Si le module supporte tous les types de fichiers (*)
      if (m.supportedFileTypes.includes("*")) return true;

      // Sinon, vérifier si le type de fichier spécifique est supporté
      return m.supportedFileTypes.includes(
        fileType.toLowerCase().replace(".", "")
      );
    });
  }

  /**
   * Traite une image avec tous les modules activés
   */
  public async processImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      // Récupérer tous les modules chargés
      const loadedModules = this.getAllLoadedModules();
      if (loadedModules.length === 0) {
        console.warn("Aucun module chargé");
        return imageBuffer;
      }

      // Traiter l'image avec chaque module activé
      let processedBuffer = imageBuffer;
      for (const loadedModule of loadedModules) {
        if (loadedModule.config.enabled) {
          try {
            // Vérifier si le module peut traiter des images
            const capabilities = loadedModule.config.capabilities || [];
            const canProcessImages = capabilities.some(
              (cap) =>
                cap.toLowerCase().includes("image") ||
                cap.toLowerCase().includes("process")
            );

            if (canProcessImages) {
              console.log(
                `Traitement d'image avec le module ${loadedModule.name}`
              );
              processedBuffer = await loadedModule.module.processImage(
                processedBuffer
              );
            }
          } catch (error) {
            console.error(
              `Erreur lors du traitement d'image avec le module ${loadedModule.name}:`,
              error
            );
          }
        }
      }

      return processedBuffer;
    } catch (error) {
      console.error("Erreur lors du traitement d'image:", error);
      return imageBuffer;
    }
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
    const files = fs.readdirSync(source);

    // Copier chaque fichier et dossier
    for (const file of files) {
      const sourcePath = path.join(source, file);
      const destinationPath = path.join(destination, file);

      // Vérifier si c'est un dossier ou un fichier
      const stats = fs.statSync(sourcePath);
      if (stats.isDirectory()) {
        // Copier le dossier de manière récursive
        this.copyFolderRecursive(sourcePath, destinationPath);
      } else {
        // Copier le fichier
        fs.copyFileSync(sourcePath, destinationPath);
      }
    }
  }

  /**
   * Installe les dépendances NPM d'un module
   */
  public async installNpmDependencies(moduleName: string): Promise<boolean> {
    try {
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

      // Vérifier si le module a un fichier package.json
      const packageJsonPath = path.join(modulePath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        console.log(
          `Le module ${moduleName} n'a pas de fichier package.json, pas de dépendances à installer`
        );
        return true;
      }

      // Lire le fichier package.json
      const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonContent);

      // Vérifier si le module a des dépendances
      if (
        !packageJson.dependencies ||
        Object.keys(packageJson.dependencies).length === 0
      ) {
        console.log(
          `Le module ${moduleName} n'a pas de dépendances à installer`
        );
        return true;
      }

      // Installer les dépendances
      console.log(`Installation des dépendances du module ${moduleName}...`);

      // Ici, nous ne pouvons pas exécuter npm install directement
      // Nous allons simplement afficher un message pour l'utilisateur
      console.log(
        `Veuillez exécuter la commande suivante pour installer les dépendances du module ${moduleName}:`
      );
      console.log(`cd ${modulePath} && npm install`);

      return true;
    } catch (error) {
      console.error(
        `Erreur lors de l'installation des dépendances du module ${moduleName}:`,
        error
      );
      return false;
    }
  }

  /**
   * Appelle une fonction d'un module
   */
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

      // Déléguer l'appel de fonction à l'API
      try {
        // Convertir les arguments en format JSON pour le transfert
        const serializedArgs = args.map((arg) => {
          if (arg instanceof Buffer) {
            return { type: "buffer", data: arg.toString("base64") };
          }
          return arg;
        });

        // Appeler l'API pour exécuter la fonction
        const response = await fetch("/api/modules/call-function", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            moduleName,
            functionName,
            args: serializedArgs,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Erreur lors de l'appel de la fonction: ${response.statusText}`
          );
        }

        // Récupérer le résultat
        const result = await response.json();

        // Si le résultat est un buffer, le convertir
        if (result.type === "buffer" && result.data) {
          return Buffer.from(result.data, "base64");
        }

        return result.data;
      } catch (error) {
        console.error(
          `Erreur lors de l'appel de la fonction ${functionName} du module ${moduleName}:`,
          error
        );
        return null;
      }
    } catch (error) {
      console.error(
        `Erreur lors de l'appel de la fonction ${functionName} du module ${moduleName}:`,
        error
      );
      return null;
    }
  }
}

// Exporter l'instance du gestionnaire de modules côté client
export const clientModuleManager = ClientModuleManagerImpl.getInstance();

// Fonction pour initialiser le gestionnaire de modules côté client
export async function initClientModuleManager() {
  const moduleManager = ClientModuleManagerImpl.getInstance();
  await moduleManager.loadModules();
  return moduleManager;
}
