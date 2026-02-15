import fs from "fs";
import path from "path";
import {
  ModuleConfig,
  LoadedModule,
  ModuleManager,
  ModuleHooks,
} from "../../types/modules";
import { z } from "zod";

const ModulePageConfigSchema = z.object({
  path: z.string(),
  title: z.string(),
  component: z.string(),
});

const ModuleNavItemSchema = z.object({
  title: z.string(),
  icon: z.string().optional(),
  url: z.string().optional(),
});

const ModuleConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  enabled: z.boolean(),
  entry: z.string(),
  icon: z.string().optional(),
  category: z.string().optional(),
  hasUI: z.boolean().default(false),
  supportedFileTypes: z.array(z.string()).default([]),
  settings: z.unknown(),
  dependencies: z.unknown().optional(),
  npmDependencies: z.unknown().optional(),
  capabilities: z.unknown().optional(),
  pages: z.array(ModulePageConfigSchema).optional(),
  navItems: z.array(ModuleNavItemSchema).optional(),
});

const PROCESS_TIMEOUT_MS = 30_000;

class ApiModuleManagerImpl implements ModuleManager {
  private modulesDir: string;
  private loadedModules: Map<string, LoadedModule> = new Map();
  private static instance: ApiModuleManagerImpl;

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.modulesDir = path.join(process.cwd(), "modules");
  }

  public static getInstance(): ApiModuleManagerImpl {
    if (!ApiModuleManagerImpl.instance) {
      ApiModuleManagerImpl.instance = new ApiModuleManagerImpl();
    }
    return ApiModuleManagerImpl.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.loadModules().then(() => {
      this.initialized = true;
    });
    await this.initPromise;
  }

  private async loadModules(): Promise<void> {
    try {
      this.loadedModules.clear();

      if (!fs.existsSync(this.modulesDir)) {
        fs.mkdirSync(this.modulesDir, { recursive: true });
        return;
      }

      const moduleFolders = fs
        .readdirSync(this.modulesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const folderName of moduleFolders) {
        try {
          const modulePath = path.join(this.modulesDir, folderName);
          const configPath = path.join(modulePath, "module.json");

          if (!fs.existsSync(configPath)) {
            continue;
          }

          const configContent = fs.readFileSync(configPath, "utf-8");
          let config: ModuleConfig;

          try {
            config = ModuleConfigSchema.parse(JSON.parse(configContent));
          } catch {
            console.error(
              `Module ${folderName}: invalid module.json, skipping`
            );
            continue;
          }

          // Disabled modules: store with status 'disabled', no dynamic import
          if (!config.enabled) {
            this.loadedModules.set(config.name, {
              name: config.name,
              config,
              module: {},
              path: modulePath,
              status: "disabled",
            });
            continue;
          }

          // Check entry file exists
          const entryPath = path.join(modulePath, config.entry);
          if (!fs.existsSync(entryPath)) {
            console.warn(
              `Module ${folderName}: entry file ${config.entry} not found`
            );
            this.loadedModules.set(config.name, {
              name: config.name,
              config,
              module: {},
              path: modulePath,
              status: "error",
            });
            continue;
          }

          // Dynamic import
          let moduleExports: Record<string, any>;
          try {
            moduleExports = await import(
              `@/modules/${folderName}/index.process.ts`
            );
          } catch (error) {
            console.error(
              `Module ${folderName}: failed to import`,
              error
            );
            this.loadedModules.set(config.name, {
              name: config.name,
              config,
              module: {},
              path: modulePath,
              status: "error",
            });
            continue;
          }

          // Detect capabilities in memory only (no write to module.json)
          const detectedCapabilities: string[] = [];
          for (const key of Object.keys(moduleExports)) {
            if (typeof moduleExports[key] === "function") {
              detectedCapabilities.push(key);
            }
          }
          config.capabilities = detectedCapabilities;

          // Resolve module hooks
          let moduleInstance: ModuleHooks;
          if (typeof moduleExports.initModule === "function") {
            moduleInstance = moduleExports.initModule(config);
          } else if (moduleExports.default) {
            moduleInstance = moduleExports.default;
          } else {
            // Build a minimal hooks object that delegates to processImage export
            moduleInstance = {};
            if (typeof moduleExports.processImage === "function") {
              moduleInstance.processImage = moduleExports.processImage;
            }
          }

          // Store the raw exports on the instance for callModuleFunction
          // Using a symbol-like approach to avoid polluting the interface
          (moduleInstance as any).__exports = moduleExports;

          this.loadedModules.set(config.name, {
            name: config.name,
            config,
            module: moduleInstance,
            path: modulePath,
            status: "loaded",
          });

          console.log(`Module ${config.name} loaded`);
        } catch (error) {
          console.error(`Module ${folderName}: unexpected error`, error);
        }
      }

      console.log(
        `${Array.from(this.loadedModules.values()).filter((m) => m.status === "loaded").length} modules loaded`
      );
    } catch (error) {
      console.error("Error loading modules:", error);
    }
  }

  private async reloadModule(moduleName: string): Promise<void> {
    const existing = this.loadedModules.get(moduleName);
    if (!existing) return;

    const folderName = path.basename(existing.path);
    const configPath = path.join(existing.path, "module.json");

    if (!fs.existsSync(configPath)) return;

    const configContent = fs.readFileSync(configPath, "utf-8");
    let config: ModuleConfig;
    try {
      config = ModuleConfigSchema.parse(JSON.parse(configContent));
    } catch {
      return;
    }

    if (!config.enabled) {
      this.loadedModules.set(config.name, {
        name: config.name,
        config,
        module: {},
        path: existing.path,
        status: "disabled",
      });
      return;
    }

    // Re-import the module
    try {
      const moduleExports = await import(
        `@/modules/${folderName}/index.process.ts`
      );

      const detectedCapabilities: string[] = [];
      for (const key of Object.keys(moduleExports)) {
        if (typeof moduleExports[key] === "function") {
          detectedCapabilities.push(key);
        }
      }
      config.capabilities = detectedCapabilities;

      let moduleInstance: ModuleHooks;
      if (typeof moduleExports.initModule === "function") {
        moduleInstance = moduleExports.initModule(config);
      } else if (moduleExports.default) {
        moduleInstance = moduleExports.default;
      } else {
        moduleInstance = {};
        if (typeof moduleExports.processImage === "function") {
          moduleInstance.processImage = moduleExports.processImage;
        }
      }

      (moduleInstance as any).__exports = moduleExports;

      this.loadedModules.set(config.name, {
        name: config.name,
        config,
        module: moduleInstance,
        path: existing.path,
        status: "loaded",
      });
    } catch (error) {
      console.error(`Module ${moduleName}: failed to reload`, error);
      this.loadedModules.set(config.name, {
        name: config.name,
        config,
        module: {},
        path: existing.path,
        status: "error",
      });
    }
  }

  public async getModules(): Promise<ModuleConfig[]> {
    await this.ensureInitialized();

    try {
      if (!fs.existsSync(this.modulesDir)) {
        return [];
      }

      const moduleFolders = fs
        .readdirSync(this.modulesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      const modules: ModuleConfig[] = [];

      for (const folderName of moduleFolders) {
        try {
          const configPath = path.join(
            this.modulesDir,
            folderName,
            "module.json"
          );
          if (!fs.existsSync(configPath)) continue;

          const configContent = fs.readFileSync(configPath, "utf-8");
          const config = ModuleConfigSchema.parse(JSON.parse(configContent));
          modules.push(config);
        } catch {
          // Skip invalid modules
        }
      }

      return modules;
    } catch (error) {
      console.error("Error getting modules:", error);
      return [];
    }
  }

  public getLoadedModule(moduleName: string): LoadedModule | undefined {
    return this.loadedModules.get(moduleName);
  }

  public getAllLoadedModules(): LoadedModule[] {
    return Array.from(this.loadedModules.values()).filter(
      (m) => m.status === "loaded"
    );
  }

  public async getModulesByFileType(
    fileType: string
  ): Promise<ModuleConfig[]> {
    const modules = await this.getModules();
    const normalizedType = fileType.toLowerCase().replace(".", "");
    return modules.filter((m) => {
      if (!m.enabled) return false;
      if (m.supportedFileTypes.includes("*")) return true;
      return m.supportedFileTypes.includes(normalizedType);
    });
  }

  public async processImageWithModule(
    moduleName: string,
    imageBuffer: Buffer,
    settings?: any
  ): Promise<Buffer> {
    try {
      await this.ensureInitialized();

      const loadedModule = this.loadedModules.get(moduleName);
      if (!loadedModule || loadedModule.status !== "loaded") {
        console.warn(`Module ${moduleName} not found or not loaded`);
        return imageBuffer;
      }

      const moduleExports = (loadedModule.module as any).__exports;
      if (!moduleExports) {
        console.warn(`Module ${moduleName} has no exports`);
        return imageBuffer;
      }

      // 1. If settings.functionName is provided and exists, call it
      if (
        settings?.functionName &&
        typeof moduleExports[settings.functionName] === "function"
      ) {
        return await this.withTimeout(
          moduleExports[settings.functionName](imageBuffer, settings),
          moduleName
        );
      }

      // 2. Otherwise, call processImage (the standard contract)
      if (typeof moduleExports.processImage === "function") {
        return await this.withTimeout(
          moduleExports.processImage(imageBuffer, settings),
          moduleName
        );
      }

      console.warn(
        `Module ${moduleName}: no processImage function found`
      );
      return imageBuffer;
    } catch (error) {
      console.error(
        `Error processing image with module ${moduleName}:`,
        error
      );
      return imageBuffer;
    }
  }

  public async processImage(imageBuffer: Buffer): Promise<Buffer> {
    await this.ensureInitialized();

    let processedBuffer = imageBuffer;

    for (const loadedModule of this.loadedModules.values()) {
      if (loadedModule.status !== "loaded") continue;
      if (!loadedModule.module.processImage) continue;

      try {
        processedBuffer = await this.withTimeout(
          loadedModule.module.processImage(processedBuffer, {}),
          loadedModule.name
        );
      } catch (error) {
        console.error(
          `Error processing image with module ${loadedModule.name}:`,
          error
        );
      }
    }

    return processedBuffer;
  }

  private async withTimeout(
    promise: Promise<Buffer>,
    moduleName: string
  ): Promise<Buffer> {
    return Promise.race([
      promise,
      new Promise<Buffer>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Module ${moduleName}: timeout after ${PROCESS_TIMEOUT_MS}ms`)),
          PROCESS_TIMEOUT_MS
        )
      ),
    ]);
  }

  public async toggleModule(moduleName: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      // Find the module on the filesystem (not just in loadedModules)
      const modulePath = this.findModulePathByName(moduleName);
      if (!modulePath) {
        console.error(`Module ${moduleName} not found on filesystem`);
        return false;
      }

      const configPath = path.join(modulePath, "module.json");
      if (!fs.existsSync(configPath)) {
        return false;
      }

      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Toggle enabled state
      config.enabled = !config.enabled;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log(
        `Module ${moduleName} ${config.enabled ? "enabled" : "disabled"}`
      );

      // Reload only this specific module
      await this.reloadModule(moduleName);

      return true;
    } catch (error) {
      console.error(`Error toggling module ${moduleName}:`, error);
      return false;
    }
  }

  public async deleteModule(moduleName: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const modulePath = this.findModulePathByName(moduleName);
      if (!modulePath) {
        console.warn(`Module ${moduleName} not found`);
        return false;
      }

      // Call onDisable/onUninstall hooks if the module is loaded
      const loadedModule = this.loadedModules.get(moduleName);
      if (loadedModule && loadedModule.status === "loaded") {
        try {
          await loadedModule.module.onDisable?.();
          await loadedModule.module.onUninstall?.();
        } catch {
          // Ignore hook errors during deletion
        }
      }

      fs.rmSync(modulePath, { recursive: true, force: true });
      this.loadedModules.delete(moduleName);

      console.log(`Module ${moduleName} deleted`);
      return true;
    } catch (error) {
      console.error(`Error deleting module ${moduleName}:`, error);
      return false;
    }
  }

  public async installModule(modulePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(modulePath) || !fs.statSync(modulePath).isDirectory()) {
        console.warn(`Path ${modulePath} is not a valid directory`);
        return false;
      }

      const configPath = path.join(modulePath, "module.json");
      if (!fs.existsSync(configPath)) {
        console.warn(`No module.json found in ${modulePath}`);
        return false;
      }

      const configContent = fs.readFileSync(configPath, "utf-8");
      let config: ModuleConfig;
      try {
        config = ModuleConfigSchema.parse(JSON.parse(configContent));
      } catch {
        console.error(`Invalid module.json in ${modulePath}`);
        return false;
      }

      const destPath = path.join(this.modulesDir, config.name);
      if (fs.existsSync(destPath)) {
        console.warn(`Module ${config.name} already exists`);
        return false;
      }

      this.copyFolderRecursive(modulePath, destPath);

      if (
        config.npmDependencies &&
        Object.keys(config.npmDependencies).length > 0
      ) {
        await this.installNpmDependencies(config.name);
      }

      // Reset init state so next ensureInitialized reloads
      this.initialized = false;
      this.initPromise = null;

      console.log(`Module ${config.name} installed`);
      return true;
    } catch (error) {
      console.error(`Error installing module:`, error);
      return false;
    }
  }

  public async installNpmDependencies(moduleName: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      // Find module path from filesystem
      const modulePath = this.findModulePathByName(moduleName);
      if (!modulePath) {
        console.warn(`Module ${moduleName} not found`);
        return false;
      }

      const configPath = path.join(modulePath, "module.json");
      if (!fs.existsSync(configPath)) return false;

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      if (
        !config.npmDependencies ||
        Object.keys(config.npmDependencies).length === 0
      ) {
        console.log(`Module ${moduleName} has no npm dependencies`);
        return true;
      }

      const packageJson = {
        name: `module-${moduleName.toLowerCase().replace(/\s+/g, "-")}`,
        version: config.version || "1.0.0",
        private: true,
        dependencies: config.npmDependencies,
      };

      const packageJsonPath = path.join(modulePath, "package.json");
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      const { execSync } = require("child_process");
      execSync("npm install", { cwd: modulePath, stdio: "inherit" });

      console.log(`npm dependencies installed for module ${moduleName}`);
      return true;
    } catch (error) {
      console.error(
        `Error installing npm dependencies for module ${moduleName}:`,
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
      await this.ensureInitialized();

      const loadedModule = this.loadedModules.get(moduleName);
      if (!loadedModule || loadedModule.status !== "loaded") {
        console.warn(`Module ${moduleName} not found or not loaded`);
        return null;
      }

      const moduleExports = (loadedModule.module as any).__exports;
      if (!moduleExports) {
        console.warn(`Module ${moduleName} has no exports`);
        return null;
      }

      if (typeof moduleExports[functionName] !== "function") {
        console.warn(
          `Function ${functionName} not found in module ${moduleName}`
        );
        return null;
      }

      return await moduleExports[functionName](...args);
    } catch (error) {
      console.error(
        `Error calling ${functionName} on module ${moduleName}:`,
        error
      );
      return null;
    }
  }

  public async updateModuleSettings(
    moduleName: string,
    newSettings: Record<string, any>
  ): Promise<boolean> {
    try {
      await this.ensureInitialized();

      const modulePath = this.findModulePathByName(moduleName);
      if (!modulePath) {
        console.error(`Module ${moduleName} not found`);
        return false;
      }

      const configPath = path.join(modulePath, "module.json");
      if (!fs.existsSync(configPath)) return false;

      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Merge new settings into existing settings
      config.settings = { ...(config.settings || {}), ...newSettings };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Reload the module to pick up new settings
      await this.reloadModule(moduleName);

      console.log(`Settings updated for module ${moduleName}`);
      return true;
    } catch (error) {
      console.error(`Error updating settings for module ${moduleName}:`, error);
      return false;
    }
  }

  private findModulePathByName(moduleName: string): string | null {
    // First check if it's already in the loaded map
    const loaded = this.loadedModules.get(moduleName);
    if (loaded) return loaded.path;

    // Otherwise scan the filesystem
    if (!fs.existsSync(this.modulesDir)) return null;

    const folders = fs
      .readdirSync(this.modulesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const folder of folders) {
      const configPath = path.join(this.modulesDir, folder, "module.json");
      if (!fs.existsSync(configPath)) continue;

      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (config.name === moduleName) {
          return path.join(this.modulesDir, folder);
        }
      } catch {
        // Skip invalid files
      }
    }

    return null;
  }

  private copyFolderRecursive(source: string, destination: string) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        this.copyFolderRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

export const apiModuleManager = ApiModuleManagerImpl.getInstance();

// Kept for backward compatibility during migration - delegates to ensureInitialized
export async function initApiModuleManager() {
  await apiModuleManager.ensureInitialized();
  return apiModuleManager;
}
